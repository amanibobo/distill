const EVENT = "/map?site=kaiser&event=kaiser-0725-01&pass=2026-09-23";

// `href` navigates within the map. `command` opens the ⌘K palette where the user already is.
export type Action = { href: string } | { command: true };

export const STEPS = [
  {
    id: "play",
    title: "Watch a fire grow",
    copy: "Press play to step through every radar pass over the Kaiser Canyon Fire.",
    action: { href: "/map?site=kaiser" },
  },
  {
    id: "why",
    title: "Click a change to see why",
    copy: "Every change explains its label with the radar numbers behind it.",
    action: { href: EVENT },
  },
  {
    id: "ask",
    title: "Ask anything with",
    keys: ["⌘", "K"],
    copy: "Ask in plain English, like fires still growing, then pick a result.",
    action: { command: true },
  },
  {
    id: "similar",
    title: "Find similar changes anywhere",
    copy: "Find similar searches every site for events whose radar signature changed the same way.",
    action: { href: EVENT },
  },
  {
    id: "watch",
    title: "Watch an area for new change",
    copy: "Pick Watch this area on a change, then replay the passes to see each alert.",
    action: { href: EVENT },
  },
  {
    id: "explore",
    title: "See an earthquake in 3D",
    copy: "Turn the terrain and play how the ground moved in the Venezuela quakes.",
    action: { href: "/map?site=venezuela" },
  },
] as const satisfies readonly { id: string; title: string; keys?: readonly string[]; copy: string; action: Action }[];

export type Step = (typeof STEPS)[number];
export type StepId = Step["id"];

export const video = (id: StepId) => `/tour/${id}.mp4`;
export const poster = (id: StepId) => `/tour/${id}.jpg`;
