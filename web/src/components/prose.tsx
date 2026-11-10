import type { ReactNode } from "react";

export type Tone = "blue" | "red";

export const Mark = ({ tone, children }: { tone: Tone; children: ReactNode }) => <mark className={`hl hl-${tone}`}>{children}</mark>;

export const Ink = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`ink-${tone}`}>{children}</span>;

export const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

export const Label = ({ id, children }: { id: string; children: string }) => (
  <h2 id={id} className="label">
    {children}
  </h2>
);
