import { BellRing, BookOpen, Compass, Map as MapIcon, MapPin, MessageCircleQuestion, Mountain, type LucideIcon } from "lucide-react";

export type ActionEffect = { kind: "go"; href: string } | { kind: "ask"; q: string } | { kind: "tour" };

export type Action = {
  id: string;
  group: "Go to" | "Sites" | "Ask Claude";
  label: string;
  hint?: string;
  Icon: LucideIcon;
  keys?: string[];
  effect: ActionEffect;
};

export type SiteOption = { id: string; name: string; place: string };

const PAGES: Action[] = [
  { id: "map", group: "Go to", label: "Go to map", Icon: MapIcon, keys: ["M"], effect: { kind: "go", href: "/map" } },
  { id: "watch", group: "Go to", label: "Watch an area", hint: "Get alerts when it changes", Icon: BellRing, keys: ["W"], effect: { kind: "go", href: "/watch" } },
  { id: "explore", group: "Go to", label: "Explore ground motion", hint: "Venezuela quakes in 3D", Icon: Mountain, keys: ["E"], effect: { kind: "go", href: "/explore" } },
  { id: "writeup", group: "Go to", label: "Writeup", hint: "How Distill works", Icon: BookOpen, effect: { kind: "go", href: "/writeup" } },
  { id: "tour", group: "Go to", label: "Take a tour", Icon: Compass, effect: { kind: "tour" } },
];

const EXAMPLES = ["Where did farmland flood since August?", "Which fires are still growing, and how big?", "Anything like the biggest Kaiser burn somewhere else?"];

export function quickActions(sites: SiteOption[]): Action[] {
  return [
    ...PAGES,
    ...sites.map(
      (s): Action => ({ id: `site:${s.id}`, group: "Sites", label: s.name, hint: s.place, Icon: MapPin, effect: { kind: "go", href: `/map?site=${encodeURIComponent(s.id)}` } }),
    ),
    ...EXAMPLES.map((q): Action => ({ id: `ask:${q}`, group: "Ask Claude", label: q, Icon: MessageCircleQuestion, effect: { kind: "ask", q } })),
  ];
}

export function filterActions(actions: Action[], query: string): Action[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return actions;
  return actions.filter((a) => {
    const text = `${a.label} ${a.hint ?? ""} ${a.group}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
