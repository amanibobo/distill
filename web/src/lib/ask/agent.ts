import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CHANGE_TYPES } from "@/lib/change-types";
import { EVENT_ID, MAX_RESULTS, type AskEvent, type AskHit } from "./protocol";
import { isToolName, parseInput, runTool, siteLines, stepLabel, TOOL_DEFS, ToolError, type SiteLine } from "./tools";

const MAX_TOOL_TURNS = 6;
const client = new Anthropic();

function system(sites: SiteLine[], today: string) {
  const siteText = sites.map((s) => `- ${s.id}: ${s.name}, ${s.place}`).join("\n");
  const typeText = Object.entries(CHANGE_TYPES)
    .map(([id, t]) => `- ${id}: ${t.label}`)
    .join("\n");
  return `You answer questions about surface change seen by the NISAR L-band radar satellite, using Distill's events database through the tools.

Today is ${today}. Radar passes ran from 16 June to 7 November 2026, so every event began in that window. A month with no year means 2026.

Sites (call list_sites for pass dates and counts):
${siteText}

Change types:
${typeText}

How to work:
- Look things up with the tools before answering. Call independent tools in parallel. Use as few calls as the question needs.
- Map a place to the sites whose name or place covers it. If no site covers the place the question names, say so plainly in one sentence, name the places Distill does watch, and stop unless a nearby site obviously helps.
- Farmland, fields and crops describe land, not a change type. Floods on farmland are flood events. Fires, burns and burn scars are fire_scar.
- "Still growing" or "spreading" is status growing. "Still" or "active" alone is status ongoing.

How to answer:
- One short paragraph of plain English, at most four sentences. No headings, bullets, tables or markdown.
- Every number must come from a tool result. Never estimate or invent one. Round areas the way a person would, such as 42 km².
- Cite each event you mention by its id in parentheses, such as (kaiser-0710-02). Cite the events the reader should open, at most six.
- If the data has nothing that matches, say so and suggest the closest thing it does have.`;
}

function today() {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date());
}

function errorMessage(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) return "Claude is handling a lot of questions right now. Try again in a moment.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the connection and try again.";
  if (e instanceof Anthropic.InternalServerError) return "Claude is overloaded right now. Try again in a moment.";
  if (e instanceof Anthropic.APIError) return "Claude couldn't answer that right now.";
  return "Search failed. Try again.";
}

// Cited events come first, in the order the answer mentions them, then everything else the tools surfaced.
function rank(answer: string, hits: Map<string, AskHit>): AskHit[] {
  const cited = [...new Set(answer.match(EVENT_ID) ?? [])].filter((id) => hits.has(id));
  const rest = [...hits.keys()].filter((id) => !cited.includes(id));
  return [...cited, ...rest].slice(0, MAX_RESULTS).map((id) => hits.get(id)!);
}

export async function ask(q: string, emit: (e: AskEvent) => void, signal: AbortSignal): Promise<void> {
  try {
    const sites = await siteLines();
    const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id;
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: q }];
    const hits = new Map<string, AskHit>();
    let answer = "";

    const execute = async (block: Anthropic.Beta.BetaToolUseBlock): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      const started = performance.now();
      const fail = (message: string): Anthropic.Beta.BetaToolResultBlockParam => {
        emit({ type: "step_result", id: block.id, ok: false, summary: message, ms: Math.round(performance.now() - started) });
        return { type: "tool_result", tool_use_id: block.id, is_error: true, content: message };
      };
      if (!isToolName(block.name)) return fail(`Unknown tool ${block.name}.`);
      const parsed = parseInput(block.name, block.input);
      emit({ type: "step", id: block.id, tool: block.name, input: block.input, label: stepLabel(block.name, parsed.ok ? parsed.input : {}, siteName) });
      if (!parsed.ok) return fail(parsed.message);
      try {
        const out = await runTool(block.name, parsed.input);
        for (const h of out.hits) if (!hits.has(h.id)) hits.set(h.id, h);
        emit({ type: "step_result", id: block.id, ok: true, summary: out.summary, ms: Math.round(performance.now() - started) });
        return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result) };
      } catch (e) {
        if (e instanceof ToolError) return fail(e.message);
        console.error("ask tool failed", block.name, e instanceof Error ? e.message : e);
        return fail("The query failed.");
      }
    };

    for (let turn = 0; ; turn++) {
      const pending = new Map<string, Promise<Anthropic.Beta.BetaToolResultBlockParam>>();
      const stream = client.beta.messages.stream(
        {
          model: "claude-opus-5-5",
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
          system: system(sites, today()),
          tools: TOOL_DEFS,
          // After the turn cap the model must answer from what it already has.
          tool_choice: { type: turn >= MAX_TOOL_TURNS ? "none" : "auto" },
          messages,
        },
        { signal },
      );
      let turnText = false;
      stream.on("text", (delta) => {
        if (!turnText && answer) delta = `\n\n${delta}`;
        turnText = true;
        answer += delta;
        emit({ type: "text", delta });
      });
      // Tools start as soon as their input is complete, while the rest of the turn is still streaming.
      stream.on("contentBlock", (block) => {
        if (block.type === "tool_use") pending.set(block.id, execute(block));
      });

      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") {
        await Promise.allSettled(pending.values());
        emit({ type: "error", message: "Claude declined to answer that question." });
        return;
      }
      const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || uses.length === 0) {
        await Promise.allSettled(pending.values());
        break;
      }
      messages.push({ role: "assistant", content: message.content });
      messages.push({ role: "user", content: await Promise.all(uses.map((b) => pending.get(b.id) ?? execute(b))) });
    }

    emit({ type: "results", events: rank(answer, hits) });
    emit({ type: "done" });
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError || signal.aborted) return;
    console.error("ask failed", e instanceof Anthropic.APIError ? `${e.status} ${e.name}` : e instanceof Error ? e.message : e);
    emit({ type: "error", message: errorMessage(e) });
  }
}
