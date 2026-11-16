"use client";

import { useCallback, useRef, useState } from "react";
import type { AskEvent, AskHit, ToolName } from "@/lib/ask/protocol";

export type Step = { id: string; tool: ToolName; label: string; state: "running" | "done" | "failed"; summary: string | null; ms: number | null };

export type Run = {
  q: string;
  phase: "running" | "done" | "stopped" | "failed";
  steps: Step[];
  text: string;
  results: AskHit[] | null;
  error: string | null;
};

const start = (q: string): Run => ({ q, phase: "running", steps: [], text: "", results: null, error: null });

function apply(run: Run, e: AskEvent): Run {
  switch (e.type) {
    case "step":
      return { ...run, steps: [...run.steps, { id: e.id, tool: e.tool, label: e.label, state: "running", summary: null, ms: null }] };
    case "step_result":
      return {
        ...run,
        steps: run.steps.map((s) => (s.id === e.id ? { ...s, state: e.ok ? "done" : "failed", summary: e.summary, ms: e.ms } : s)),
      };
    case "text":
      return { ...run, text: run.text + e.delta };
    case "results":
      return { ...run, results: e.events };
    case "done":
      return { ...run, phase: "done" };
    case "error":
      return { ...run, phase: "failed", error: e.message };
  }
}

export function useAsk() {
  const [run, setRun] = useState<Run | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setRun((r) => (r && r.phase === "running" ? { ...r, phase: "stopped", steps: r.steps.map((s) => (s.state === "running" ? { ...s, state: "failed", summary: "Stopped" } : s)) } : r));
  }, []);

  const ask = useCallback(async (q: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRun(start(q));
    const update = (fn: (r: Run) => Run) => {
      if (abort.current === controller) setRun((r) => (r ? fn(r) : r));
    };
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        update((r) => ({ ...r, phase: "failed", error: body?.error ?? "Search is unavailable right now." }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        const events = lines.filter(Boolean).map((l) => JSON.parse(l) as AskEvent);
        if (events.length) update((r) => events.reduce(apply, r));
      }
      update((r) => (r.phase === "running" ? { ...r, phase: "failed", error: "The answer was cut off. Try again." } : r));
    } catch (e) {
      if (controller.signal.aborted) return;
      update((r) => ({ ...r, phase: "failed", error: e instanceof Error && e.name === "SyntaxError" ? "The answer came back garbled. Try again." : "Search is unavailable right now." }));
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }, []);

  return { run, ask, stop };
}
