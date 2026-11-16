// Records the short looping demos shown in the "Take a tour" card.
// Usage: node scripts/record-tour.mjs [baseUrl] [--only=play,why]
// Writes public/tour/<step>.mp4 and public/tour/<step>.jpg (WebM when ffmpeg is missing).

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/Users/amanibobo/binary-labs/apps/landing/package.json");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3410").replace(/\/$/, "");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/tour");
const VIEWPORT = { width: 1280, height: 800 };
const MAX_BYTES = 1.5 * 1024 * 1024;
const WATCH_NAME = "Ridge north";

const hasFfmpeg = (() => {
  try {
    execFileSync("which", ["ffmpeg"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Headless recordings have no pointer, so draw one that follows real mouse events.
const CURSOR = () => {
  const style = `
    #tour-cursor{position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;
      background:rgb(255 255 255/.9);border:1.5px solid #2b2b2b;box-shadow:0 2px 8px rgb(0 0 0/.25);
      pointer-events:none;z-index:2147483647;transition:transform 120ms ease-out;opacity:0}
    #tour-cursor[data-down]{transform:scale(.75);background:#2b2b2b}`;
  const mount = () => {
    const s = document.createElement("style");
    s.textContent = style;
    const c = document.createElement("div");
    c.id = "tour-cursor";
    document.documentElement.append(s, c);
    const at = (e) => {
      c.style.translate = `${e.clientX}px ${e.clientY}px`;
      c.style.opacity = "1";
    };
    addEventListener("pointermove", at, true);
    addEventListener("pointerdown", (e) => (at(e), c.setAttribute("data-down", "")), true);
    addEventListener("pointerup", () => c.removeAttribute("data-down"), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
  else mount();
};

const pause = (page, ms) => page.waitForTimeout(ms);

async function moveTo(page, locator) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${locator}`);
  const x = box.x + Math.min(box.width / 2, 120);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 18 });
  return { x, y };
}

async function click(page, locator) {
  await moveTo(page, locator);
  await pause(page, 180);
  await page.mouse.down();
  await pause(page, 90);
  await page.mouse.up();
}

async function drag(page, from, to, steps = 40) {
  await page.mouse.move(from.x, from.y, { steps: 12 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function wheel(page, total, chunks = 8) {
  for (let i = 0; i < chunks; i++) {
    await page.mouse.wheel(0, total / chunks);
    await pause(page, 120);
  }
}

const EVENT = "/map?site=kaiser&event=kaiser-0725-01&pass=2026-09-23";
const panel = (page) => page.getByRole("complementary", { name: /change details/i });
const control = (page, name) => page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();

async function stopPlayback(page) {
  const pauseBtn = page.getByRole("button", { name: /^pause$/i }).first();
  if (await pauseBtn.isVisible().catch(() => false)) await pauseBtn.click();
}

// Each step drives one feature. `clip.cut()` drops waiting time (network, model calls)
// between `cut()` and the next `keep()`. Clips over 10 seconds are fast-forwarded to fit.
const STEPS = {
  async play(page, clip) {
    await page.goto(`${BASE}/map?site=kaiser`);
    await page.getByRole("heading", { name: /Kaiser Canyon Fire/ }).waitFor({ timeout: 20000 });
    await stopPlayback(page);
    const first = page.getByRole("button", { name: /^Jul 25, 2026/ }).first();
    if (await first.isVisible().catch(() => false)) await first.click();
    await pause(page, 1200);
    clip.keep();
    await click(page, page.getByRole("button", { name: /^play/i }).first());
    await page.getByRole("button", { name: /^pause$/i }).first().waitFor();
    await pause(page, 7000);
  },

  async why(page, clip) {
    await page.goto(`${BASE}/map?site=kaiser`);
    const burn = page.getByRole("button", { name: /Burned area from Kaiser Canyon Fire/ }).first();
    await burn.waitFor({ timeout: 20000 });
    await stopPlayback(page);
    await pause(page, 1200);
    clip.keep();
    await click(page, burn);
    await panel(page).getByText(/why distill labeled it/i).waitFor();
    await pause(page, 1800);
    await moveTo(page, panel(page).getByRole("heading", { level: 2 }));
    await wheel(page, 700, 10);
    await pause(page, 2600);
  },

  async ask(page, clip) {
    await page.goto(`${BASE}/map`);
    await page.getByRole("button", { name: /Kaiser Canyon Fire/ }).first().waitFor({ timeout: 20000 });
    await stopPlayback(page);
    await pause(page, 1000);
    clip.keep();
    await page.keyboard.press("Meta+K");
    const box = page.getByRole("dialog", { name: /search or ask/i }).getByRole("combobox");
    await box.waitFor();
    await pause(page, 400);
    await box.pressSequentially("fires still growing", { delay: 55 });
    await pause(page, 300);
    await box.press("Enter");
    await pause(page, 800);
    clip.cut();
    const result = page.getByRole("dialog", { name: /search or ask/i }).getByRole("option", { name: /burn|fire/i }).first();
    await result.waitFor({ timeout: 60000 });
    clip.keep();
    await pause(page, 1200);
    await click(page, result);
    await panel(page).waitFor({ timeout: 20000 });
    await pause(page, 2600);
  },

  async similar(page, clip) {
    await page.goto(`${BASE}${EVENT}`);
    const find = panel(page).getByRole("button", { name: /find similar/i });
    await find.waitFor({ timeout: 20000 });
    await stopPlayback(page);
    await pause(page, 1500);
    clip.keep();
    await moveTo(page, panel(page).getByRole("heading", { level: 2 }));
    await wheel(page, 900, 10);
    await pause(page, 400);
    await click(page, find);
    await pause(page, 500);
    clip.cut();
    await panel(page).getByText(/searching every site/i).waitFor({ state: "detached", timeout: 30000 });
    clip.keep();
    await wheel(page, 400, 5);
    const rows = panel(page).locator("section", { hasText: /changes like this/i }).getByRole("button");
    if ((await rows.count()) > 1) await moveTo(page, rows.nth(1));
    await pause(page, 2600);
  },

  async watch(page, clip) {
    const existing = await page.request.get(`${BASE}/api/watch?site=kaiser`).then((r) => (r.ok() ? r.json() : []));
    const reuse = existing.find((w) => w.name === WATCH_NAME);
    if (reuse) {
      await page.route("**/api/watch", (route) =>
        route.request().method() === "POST" ? route.fulfill({ status: 201, json: reuse }) : route.continue(),
      );
    }
    await page.goto(`${BASE}${EVENT}`);
    const watch = control(page, /watch this area/i);
    await watch.waitFor({ timeout: 20000 });
    await stopPlayback(page);
    await pause(page, 1200);
    clip.keep();
    await click(page, watch);
    const name = page.getByLabel(/area name/i);
    if (await name.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await pause(page, 800);
      await name.pressSequentially(WATCH_NAME, { delay: 60 });
      await click(page, page.getByRole("button", { name: /^watch$/i }));
    }
    clip.cut();
    const replay = page.getByRole("button", { name: /replay passes/i }).first();
    await replay.waitFor({ timeout: 20000 });
    clip.keep();
    await pause(page, 600);
    await click(page, replay);
    clip.cut();
    await page.getByText(/of \d+ passes/).first().waitFor({ timeout: 20000 });
    clip.keep();
    await pause(page, 4500);
  },

  async explore(page, clip) {
    await page.goto(`${BASE}/map`);
    const entry = page.getByRole("button", { name: /venezuela earthquake/i }).first();
    const inMap = await entry.waitFor({ timeout: 15000 }).then(() => true, () => false);
    if (!inMap) await page.goto(`${BASE}/explore`);
    await stopPlayback(page);
    await pause(page, 800);
    clip.keep();
    if (inMap) await click(page, entry);
    const stage = page.locator("canvas:not(.maplibregl-canvas)").first();
    await stage.waitFor({ timeout: 30000 });
    clip.cut();
    await page.getByText(/largest motion/i).first().waitFor({ timeout: 30000 });
    await pause(page, 2500);
    clip.keep();
    const s = await stage.boundingBox();
    const mid = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
    await drag(page, { x: mid.x - 160, y: mid.y + 40 }, { x: mid.x + 120, y: mid.y - 10 }, 16);
    await pause(page, 300);
    await click(page, page.getByRole("button", { name: /^play$/i }).first());
    await pause(page, 4400);
    await drag(page, { x: mid.x + 120, y: mid.y }, { x: mid.x - 40, y: mid.y + 30 }, 12);
    await pause(page, 600);
  },
};

function encode(raw, segments, length, out) {
  const speed = length > 10 ? `setpts=PTS*${(9.5 / length).toFixed(4)},` : "";
  const chains = segments.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[s${i}]`);
  const joined = segments.map((_, i) => `[s${i}]`).join("");
  const graph = [...chains, `${joined}concat=n=${segments.length}:v=1:a=0,${speed}fps=25,scale=960:-2:flags=lanczos[v]`].join(";");
  for (const crf of [27, 30, 33, 36]) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    if (statSync(out).size <= MAX_BYTES) return crf;
  }
  throw new Error(`still over ${MAX_BYTES} bytes at crf 36`);
}

function posterFrom(video, seconds, out) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", seconds.toFixed(2), "-i", video, "-frames:v", "1", "-q:v", "4", out]);
}

const duration = (segments) => segments.reduce((t, [a, b]) => t + b - a, 0);

async function record(browser, id) {
  const dir = mkdtempSync(join(tmpdir(), `tour-${id}-`));
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir, size: VIEWPORT } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("distill.tour.v1", JSON.stringify({ seen: true, dismissed: true, done: [] }));
    } catch {}
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const segments = [];
  let open = null;
  const clip = {
    keep: () => (open ??= now()),
    cut: () => {
      if (open !== null) segments.push([open, now()]);
      open = null;
    },
  };
  try {
    await STEPS[id](page, clip);
    clip.cut();
  } finally {
    await context.close();
  }
  const raw = await page.video().path();
  const length = duration(segments);
  if (length < 4) throw new Error(`clip is only ${length.toFixed(1)}s, the interaction probably did not run`);

  mkdirSync(OUT, { recursive: true });
  if (!hasFfmpeg) {
    copyFileSync(raw, join(OUT, `${id}.webm`));
    rmSync(dir, { recursive: true, force: true });
    return `${id}.webm (${length.toFixed(1)}s, no ffmpeg, no poster)`;
  }
  const mp4 = join(OUT, `${id}.mp4`);
  const crf = encode(raw, segments, length, mp4);
  const played = Math.min(length, 9.5);
  posterFrom(mp4, played * 0.75, join(OUT, `${id}.jpg`));
  rmSync(dir, { recursive: true, force: true });
  const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
  return `${id}.mp4 ${kb(mp4)}, ${played.toFixed(1)}s from ${length.toFixed(1)}s, crf ${crf}; ${id}.jpg ${kb(join(OUT, `${id}.jpg`))}`;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const failures = [];
for (const id of Object.keys(STEPS).filter((s) => !ONLY || ONLY.includes(s))) {
  try {
    console.log(`[tour:${id}] ${await record(browser, id)}`);
  } catch (e) {
    failures.push(id);
    console.error(`[tour:${id}] FAILED: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
if (failures.length) {
  console.error(`Failed steps: ${failures.join(", ")}. Rerun with --only=${failures.join(",")}`);
  process.exit(1);
}
