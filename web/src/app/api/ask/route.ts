import { ask } from "@/lib/ask/agent";
import type { AskEvent } from "@/lib/ask/protocol";

export const maxDuration = 60;

export async function POST(req: Request) {
  let q: unknown;
  try {
    q = ((await req.json()) as { q?: unknown }).q;
  } catch {
    return Response.json({ error: "Send JSON like { \"q\": \"floods since August\" }." }, { status: 400 });
  }
  if (typeof q !== "string" || !q.trim()) return Response.json({ error: "q must be a question." }, { status: 400 });
  const question = q.trim().slice(0, 400);

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AskEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      };
      await ask(question, emit, abort.signal);
      if (!abort.signal.aborted) controller.close();
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
