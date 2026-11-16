// Records the 30-second NASA Space Apps demo, once per theme.
// Usage: node scripts/record-demo.mjs [baseUrl] [--only=light,dark] [--no-preask]
// Writes docs/media/demo-<theme>.mp4 and docs/media/demo-<theme>-sheet.jpg,
// plus one frame per shot in a temp folder that the log names.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/Users/amanibobo/binary-labs/apps/landing/package.json");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3410").replace(/\/$/, "");
const THEMES = args.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? ["light", "dark"];
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../docs/media");
const VIEWPORT = { width: 1440, height: 900 };
const MAX_SECONDS = 29.9;
const MAX_BYTES = 25 * 1024 * 1024;
const QUESTION = "which fires are still growing?";
const WATCH_NAME = "Ridge";

const geist = (weight) =>
  readFileSync(join(HERE, `../node_modules/geist/dist/fonts/geist-sans/Geist-${weight}.woff2`)).toString("base64");

const PALETTE = {
  light: { ground: "#f7f7f7", ink: "#2b2b2b", ink2: "#6f6f6f", logo: "#0b3d91", pill: "rgb(24 24 24 / 0.84)", pillInk: "#fff" },
  dark: { ground: "#0f1011", ink: "#ececea", ink2: "#a3a39e", logo: "#5b8ef0", pill: "rgb(236 236 234 / 0.92)", pillInk: "#111" },
};

// Runs in every document. Draws a macOS-style arrow that follows real mouse events and a
// caption pill; both restore from sessionStorage so they survive navigations.
const OVERLAY = ({ pill, pillInk, first }) => {
  const style = `
    #demo-cursor{position:fixed;left:0;top:0;width:20px;height:28px;margin:-2px 0 0 -2px;pointer-events:none;
      z-index:2147483647;transform-origin:2px 2px;transition:transform 100ms ease-out;filter:drop-shadow(0 1px 1.5px rgb(0 0 0/.35))}
    #demo-cursor[data-down]{transform:scale(.92)}
    #demo-caption{position:fixed;left:50%;bottom:184px;translate:-50% 0;pointer-events:none;z-index:2147483646;
      padding:9px 18px;border-radius:999px;background:${pill};color:${pillInk};white-space:nowrap;
      font:500 18px/1.3 var(--font-sans,ui-sans-serif,system-ui,sans-serif);letter-spacing:-.005em;
      box-shadow:0 4px 18px rgb(0 0 0/.18);backdrop-filter:blur(8px);opacity:0;transition:opacity 160ms ease-out}
    #demo-caption[data-on]{opacity:1}`;
  const mount = () => {
    const s = document.createElement("style");
    s.textContent = style;
    const c = document.createElement("div");
    c.id = "demo-cursor";
    c.innerHTML = `<svg width="20" height="28" viewBox="0 0 20 28"><path d="M2 2v19.2l4.6-4.4 3.1 7.4 3.4-1.4-3.1-7.3h6.4Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const cap = document.createElement("div");
    cap.id = "demo-caption";
    document.documentElement.append(s, cap, c);
    const place = (x, y) => (c.style.translate = `${x}px ${y}px`);
    const [x, y] = (sessionStorage.getItem("demo.cursor") ?? "720,450").split(",").map(Number);
    place(x, y);
    const text = sessionStorage.getItem("demo.caption") ?? first;
    if (text) {
      cap.textContent = text;
      cap.setAttribute("data-on", "");
    }
    addEventListener("mousemove", (e) => {
      place(e.clientX, e.clientY);
      sessionStorage.setItem("demo.cursor", `${e.clientX},${e.clientY}`);
    }, true);
    addEventListener("mousedown", () => c.setAttribute("data-down", ""), true);
    addEventListener("mouseup", () => setTimeout(() => c.removeAttribute("data-down"), 100), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
  else mount();
};

const pause = (page, ms) => page.waitForTimeout(ms);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// page.mouse has no easing, so glide through eased waypoints, one move per step.
async function glide(page, x, y, steps) {
  const from = page.__pos ?? { x: 720, y: 450 };
  const n = steps ?? Math.round(Math.min(34, Math.max(14, Math.hypot(x - from.x, y - from.y) / 22)));
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n);
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
  }
  page.__pos = { x, y };
}

async function moveTo(page, locator, dx = null) {
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${locator}`);
  const x = box.x + (dx ?? Math.min(box.width / 2, 120));
  const y = box.y + box.height / 2;
  await glide(page, x, y);
  return { x, y, box };
}

async function click(page, locator) {
  await moveTo(page, locator);
  await pause(page, 140);
  await page.mouse.down();
  await pause(page, 90);
  await page.mouse.up();
}

async function drag(page, from, to, steps = 36) {
  await glide(page, from.x, from.y);
  await page.mouse.down();
  await glide(page, to.x, to.y, steps);
  await page.mouse.up();
}

async function setCaption(page, text) {
  await page.evaluate((t) => {
    sessionStorage.setItem("demo.caption", t);
    const cap = document.getElementById("demo-caption");
    if (cap) {
      cap.textContent = t;
      cap.setAttribute("data-on", "");
    }
  }, text);
}

const control = (page, name) => page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
const panel = (page) => page.getByRole("complementary", { name: /change details/i });
const palette = (page) => page.getByRole("dialog", { name: /search or ask/i });

async function stopPlayback(page) {
  const pauseBtn = page.getByRole("button", { name: /^pause/i }).first();
  if (await pauseBtn.isVisible().catch(() => false)) await pauseBtn.click();
}

// One entry per shot. `clip.keep(speed)` starts or re-speeds the kept footage, `clip.cut()`
// drops everything until the next keep. Speed stays 1 wherever the viewer has to read.
const SHOTS = [
  {
    caption: "Radar sees the ground through clouds, smoke and night.",
    budget: 2.5,
    async run(page, clip) {
      await page.goto(`${BASE}/`);
      const open = page.getByRole("link", { name: /open the map/i });
      await open.waitFor();
      // The first second of a recording is drawn at the wrong scale, so let it settle.
      await pause(page, 2000);
      clip.keep();
      await pause(page, 1500);
      await click(page, open);
      clip.cut();
      await page.waitForURL(/\/map/);
    },
  },
  {
    caption: "Distill turns NASA–ISRO NISAR radar into change you can watch.",
    budget: 4.6,
    async run(page, clip) {
      await page.goto(`${BASE}/map?site=huelva`);
      const play = page.getByRole("button", { name: /^play/i }).first();
      await play.waitFor({ timeout: 30000 });
      await stopPlayback(page);
      await page.getByRole("button", { name: /Jun 27/ }).first().click();
      await page.getByRole("button", { name: /Burned area near Niebla/ }).first().waitFor({ timeout: 20000 });
      await pause(page, 2500);
      clip.keep();
      await click(page, play);
      clip.keep(2);
      await page.getByRole("banner").getByText(/Aug 14, 2026/).waitFor({ timeout: 10000 });
      clip.keep(1.4);
      await page.getByRole("banner").getByText(/Sep 7, 2026/).waitFor({ timeout: 10000 });
      await pause(page, 700);
    },
  },
  {
    caption: "Every change explains itself.",
    budget: 4.2,
    async run(page, clip) {
      clip.keep();
      await click(page, page.getByRole("button", { name: /^pause/i }).first());
      await pause(page, 200);
      await click(page, page.getByRole("button", { name: /Burned area near Niebla/ }).first());
      await panel(page).waitFor();
      await pause(page, 600);
      const chart = panel(page).getByRole("img", { name: /changed area at each pass/i });
      const { box } = await moveTo(page, chart, 30);
      await glide(page, box.x + box.width - 30, box.y + box.height / 2, 40);
      await pause(page, 500);
    },
  },
  {
    caption: "Ask anything. Watch Claude search the data.",
    budget: 4.8,
    async run(page, clip) {
      clip.keep();
      await page.keyboard.press("Meta+K");
      const box = palette(page).getByRole("combobox");
      await box.waitFor();
      await pause(page, 250);
      await box.pressSequentially(QUESTION, { delay: 30 });
      await pause(page, 200);
      await box.press("Enter");
      await palette(page).getByRole("list", { name: /what claude looked up/i }).getByRole("listitem").first().waitFor({ timeout: 30000 });
      await pause(page, 400);
      clip.keep(2);
      await pause(page, 900);
      clip.cut();
      const result = palette(page).getByRole("option", { name: /burn|fire/i }).first();
      await result.waitFor({ timeout: 90000 });
      await pause(page, 300);
      clip.keep();
      await pause(page, 900);
      await click(page, result);
      clip.keep(1.5);
      await panel(page).waitFor({ timeout: 20000 });
      await pause(page, 900);
    },
  },
  {
    caption: "Find the same pattern anywhere on Earth.",
    budget: 3.2,
    async run(page, clip) {
      clip.keep();
      await click(page, page.getByRole("button", { name: /find similar/i }).first());
      clip.cut();
      const section = panel(page).locator("section", { hasText: /changes like this/i });
      await section.getByRole("button").first().waitFor({ timeout: 30000 });
      const site = new URL(page.url()).searchParams.get("site");
      const rows = section.getByRole("button");
      const subs = await rows.allInnerTexts();
      const other = subs.findIndex((t) => site && !t.toLowerCase().includes(site.toLowerCase()));
      await rows.nth(Math.max(0, other)).scrollIntoViewIfNeeded();
      await pause(page, 300);
      clip.keep();
      await pause(page, 300);
      await moveTo(page, rows.nth(Math.max(0, other)));
      await pause(page, 1400);
    },
  },
  {
    caption: "Watch any place for new change.",
    budget: 3.4,
    async run(page, clip) {
      const site = new URL(page.url()).searchParams.get("site");
      const existing = await page.request.get(`${BASE}/api/watch?site=${site}`).then((r) => (r.ok() ? r.json() : []));
      const reuse = existing.find((w) => w.name === WATCH_NAME);
      if (reuse) {
        await page.route("**/api/watch", (route) =>
          route.request().method() === "POST" ? route.fulfill({ status: 201, json: reuse }) : route.continue(),
        );
      }
      clip.keep();
      await click(page, control(page, /watch this area/i));
      const name = page.getByLabel(/area name/i);
      await name.waitFor({ timeout: 8000 });
      await pause(page, 250);
      await name.fill("");
      await name.pressSequentially(WATCH_NAME, { delay: 70 });
      await pause(page, 200);
      await click(page, page.getByRole("button", { name: /replay passes/i }).first());
      clip.cut();
      await page.getByText(/of \d+ passes/).first().waitFor({ timeout: 20000 });
      clip.keep(2);
      await pause(page, 3800);
    },
  },
  {
    caption: "See the ground move after an earthquake.",
    budget: 3.2,
    async run(page, clip) {
      await page.goto(`${BASE}/map?site=panama`);
      const stage = page.locator("canvas:not(.maplibregl-canvas)").first();
      await stage.waitFor({ timeout: 45000 });
      await page.getByText(/largest motion/i).first().waitFor({ timeout: 45000 });
      await pause(page, 3000);
      const s = await stage.boundingBox();
      const mid = { x: s.x + s.width * 0.4, y: s.y + s.height / 2 };
      clip.keep(2);
      await drag(page, { x: mid.x - 150, y: mid.y + 40 }, { x: mid.x + 130, y: mid.y - 20 }, 16);
      await pause(page, 200);
      await click(page, page.getByRole("button", { name: /^play/i }).first());
      clip.keep(2);
      await pause(page, 3000);
    },
  },
  {
    caption: null,
    budget: 3.4,
    async run(page, clip, theme) {
      const c = PALETTE[theme];
      await page.setContent(`<!doctype html><html><head><style>
        @font-face{font-family:Geist;font-weight:400;src:url(data:font/woff2;base64,${geist("Regular")}) format("woff2")}
        @font-face{font-family:Geist;font-weight:500;src:url(data:font/woff2;base64,${geist("Medium")}) format("woff2")}
        #demo-cursor,#demo-caption{display:none!important}
        html,body{margin:0;height:100%;background:${c.ground};color:${c.ink};font-family:Geist,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
        main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
        .brand{display:flex;align-items:center;gap:14px;font-size:52px;font-weight:500;letter-spacing:-.02em}
        svg{width:34px;height:44px;color:${c.logo}}
        .tag{margin-top:14px;font-size:26px;color:${c.ink2}}
        .stat{margin-top:56px;font-size:19px}
        .url{margin-top:14px;font-size:19px;color:${c.ink2}}
      </style></head><body><main>
        <div class="brand"><svg viewBox="0 0 20 26"><path d="M10 1.2C10 1.2 2 10.6 2 16.6a8 8 0 0 0 16 0C18 10.6 10 1.2 10 1.2Z" fill="currentColor"/><path d="M6.2 16.9a3.9 3.9 0 0 0 3.6 3.9" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/></svg>Distill</div>
        <div class="tag">Radar, made readable.</div>
        <div class="stat">0.81 precision · 0.92 recall vs official EU fire maps (Huelva)</div>
        <div class="url">distill-khaki.vercel.app</div>
      </main></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      await pause(page, 300);
      clip.keep();
      await pause(page, 3600);
    },
  },
];

// Trims a shot's kept footage from its end so it plays in at most `budget` seconds.
function fitBudget(segments, shot, budget) {
  let left = budget;
  for (const seg of segments.filter((s) => s[3] === shot)) {
    const out = (seg[1] - seg[0]) / seg[2];
    if (out > left) seg[1] = seg[0] + Math.max(0, left) * seg[2];
    left -= out;
  }
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i][1] - segments[i][0] < 0.04) segments.splice(i, 1);
}

async function preAsk() {
  const t = Date.now();
  const res = await fetch(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: QUESTION }) });
  await res.text();
  console.log(`[demo] pre-ran the question in ${((Date.now() - t) / 1000).toFixed(1)}s (${res.status})`);
}

function encode(raw, segments, out) {
  const chains = segments.map(([a, b, speed], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${speed}[s${i}]`);
  const joined = segments.map((_, i) => `[s${i}]`).join("");
  const graph = [...chains, `${joined}concat=n=${segments.length}:v=1:a=0,fps=30,format=yuv420p[v]`].join(";");
  for (const crf of [18, 20, 22, 24, 26]) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", out]);
    if (statSync(out).size <= MAX_BYTES) return crf;
  }
  throw new Error(`still over ${MAX_BYTES} bytes at crf 26`);
}

const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

function frames(mp4, shotTimes, theme) {
  const dir = mkdtempSync(join(tmpdir(), `demo-${theme}-frames-`));
  shotTimes.forEach((t, i) => {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", "-q:v", "3", join(dir, `shot-${i + 1}.jpg`)]);
  });
  const sheet = join(OUT, `demo-${theme}-sheet.jpg`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(dir, "shot-%d.jpg"), "-vf", "scale=480:-2,tile=4x2:padding=6:margin=6:color=gray", "-frames:v", "1", "-q:v", "3", sheet]);
  return { dir, sheet };
}

async function record(browser, theme) {
  const dir = mkdtempSync(join(tmpdir(), `demo-${theme}-`));
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme, recordVideo: { dir, size: VIEWPORT } });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("distill.theme", t);
      localStorage.setItem("distill.tour.v1", JSON.stringify({ seen: true, dismissed: true, done: [] }));
    } catch {}
  }, theme);
  await context.addInitScript(OVERLAY, { ...PALETTE[theme], first: SHOTS[0].caption });
  const page = await context.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const segments = [];
  let open = null;
  let shot = 0;
  const clip = {
    keep(speed = 1) {
      if (open && open.speed === speed) return;
      clip.cut();
      open = { start: now(), speed };
    },
    cut() {
      if (open) segments.push([open.start, now(), open.speed, shot]);
      open = null;
    },
  };
  try {
    for (; shot < SHOTS.length; shot++) {
      const { caption, run } = SHOTS[shot];
      if (caption) await setCaption(page, caption).catch(() => {});
      await run(page, clip, theme);
      clip.cut();
      fitBudget(segments, shot, SHOTS[shot].budget);
    }
  } finally {
    var closedAt = now();
    await context.close();
  }
  const raw = await page.video().path();
  // The video starts a moment after newPage resolves; line the clock up with its last frame.
  const lag = closedAt - probe(raw);
  for (const seg of segments) (seg[0] -= lag), (seg[1] -= lag);
  console.log(`[demo:${theme}] video lags the clock by ${lag.toFixed(2)}s`);
  const perShot = SHOTS.map((_, i) => segments.filter((s) => s[3] === i).reduce((t, [a, b, v]) => t + (b - a) / v, 0));
  const total = perShot.reduce((a, b) => a + b, 0);
  console.log(`[demo:${theme}] shots ${perShot.map((d) => d.toFixed(1)).join(" + ")} = ${total.toFixed(2)}s`);
  if (total > MAX_SECONDS) throw new Error(`cut is ${total.toFixed(2)}s, over ${MAX_SECONDS}s`);

  mkdirSync(OUT, { recursive: true });
  const mp4 = join(OUT, `demo-${theme}.mp4`);
  const crf = encode(raw, segments, mp4);
  rmSync(dir, { recursive: true, force: true });
  const seconds = probe(mp4);
  if (seconds > 30) throw new Error(`${mp4} is ${seconds}s`);
  let at = 0;
  const shotTimes = perShot.map((d) => ((at += d), at - d * 0.3));
  const { dir: frameDir, sheet } = frames(mp4, shotTimes, theme);
  return `${mp4} ${(statSync(mp4).size / 1048576).toFixed(2)} MB, ${seconds}s, crf ${crf}; frames in ${frameDir}; sheet ${sheet}`;
}

if (!args.includes("--no-preask")) await preAsk();
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
let failed = false;
for (const theme of THEMES) {
  try {
    console.log(`[demo:${theme}] ${await record(browser, theme)}`);
  } catch (e) {
    failed = true;
    console.error(`[demo:${theme}] FAILED: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
if (failed) process.exit(1);
