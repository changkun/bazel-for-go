// Render the chapters' films: every frame is the film's own drawing at that
// second, photographed in headless Chrome and piped to ffmpeg, so the video
// is the page's film exactly. Needs Chrome and ffmpeg; nothing to build.
//
//   node films/render.mjs                        every film, as MP4 into films/out/
//   node films/render.mjs 01                     one film (a name or the start of one)
//   node films/render.mjs 01 --check             no pictures: lint the timing, then draw every
//                                                quarter second and report text that is too small,
//                                                leaves its place, outgrows its box or lies on other
//                                                text, shapes that leave the plate, scenes that do not
//                                                fill the plate around its middle, and drawing that
//                                                depends on more than t
//   node films/render.mjs 01 --sheet             twelve frames in one PNG, to look the film over
//   node films/render.mjs 01 --at 12.5,40        one PNG for each second given
//   node films/render.mjs 01 --range 30,45       an MP4 of that stretch only
//   node films/render.mjs 01 --script            the transcript, with when each line comes and goes
//
//   --theme light|dark   the colours (default dark)
//   --out DIR            where pictures and videos go (default films/out)
//   --publish DIR        after rendering, copy each film's MP4 into DIR (make films)
//   --force              render even if the MP4 is up to date
//
// A full MP4 is skipped when one rendered from the same sources is already
// in --out: its key, a hash of the film, the engine and these settings, is
// kept beside it. So a deploy renders only the films that changed.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chrome } from "./browser.mjs";
import { H, RAIL } from "./stage.js";

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE = ["film.js", "stage.js", "player.js"];
const FPS = 30;
const SIZE = { width: 1920, height: 1080 };
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const takesValue = new Set(["--at", "--range", "--theme", "--out", "--publish"]);
const named = args.filter((a, i) => !a.startsWith("--") && !takesValue.has(args[i - 1]));
const theme = value("theme", "dark");
const out = resolve(value("out", join(here, "out")));
const publish = value("publish", null);
const at = value("at", null);
const range = value("range", null);
if (!["dark", "light"].includes(theme)) fail(`--theme is light or dark, not ${theme}`);

function fail(message) {
  console.error(`render: ${message}`);
  process.exit(2);
}

// The films: every module here but the engine's.
const all = readdirSync(here).filter((f) => extname(f) === ".js" && !ENGINE.includes(f)).map((f) => basename(f, ".js")).sort();
const films = named.length
  ? named.map((n) => {
      const found = all.filter((f) => f === n || f.startsWith(n));
      if (found.length !== 1) fail(found.length ? `${n} could mean ${found.join(", ")}` : `no film ${n}; there are ${all.join(", ") || "none"}`);
      return found[0];
    })
  : all;
if (!films.length) {
  console.log("render: no films yet");
  process.exit(0);
}

if (flag("script")) {
  const { timeline, clock } = await import("./film.js");
  for (const name of films) {
    const made = (await import(pathToFileURL(join(here, `${name}.js`)))).default;
    const times = timeline(made);
    console.log(`${name}  ${clock(times.duration)} (${times.duration.toFixed(1)} s), ${times.lines.reduce((n, l) => n + l.words, 0)} words`);
    let scene = -1;
    for (const line of times.lines) {
      if (line.scene !== scene) {
        scene = line.scene;
        const s = times.scenes[scene];
        console.log(`\n  scene ${scene + 1}  ${s.section ?? "(no section)"}  ${s.start.toFixed(1)}–${s.end.toFixed(1)} s`);
      }
      console.log(`  ${line.start.toFixed(1).padStart(6)}  ${line.seconds.toFixed(1).padStart(4)} s  ${String(line.words).padStart(2)} w  ${line.say}`);
    }
    console.log();
  }
  process.exit(0);
}

// Serve this directory, and a page that shows one film at full size.
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };
const page = (name) => `<!doctype html>
<html lang="en"${theme === "dark" ? ' class="dark"' : ""}>
<meta charset="utf-8">
<style>html, body { margin: 0; overflow: hidden; } svg.fm { display: block; width: ${SIZE.width}px; height: ${SIZE.height}px; }</style>
<body>
<script type="module">
import { build, load } from "/film.js";
try {
  const film = build(await load(${JSON.stringify(`/${name}.js`)}));
  document.body.append(film.root);
  window.film = film;
} catch (error) {
  window.failed = String(error.stack || error);
}
</script>
`;
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (path.startsWith("/~/")) return response.writeHead(200, { "content-type": "text/html" }).end(page(path.slice(3)));
  const file = join(here, path);
  if (!file.startsWith(here) || !existsSync(file) || statSync(file).isDirectory()) return response.writeHead(404).end();
  response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(response);
}).listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;

mkdirSync(out, { recursive: true });
const browser = await chrome();
const tab = await browser.tab(SIZE);
let failures = 0;

async function open(name) {
  await tab.open(`${origin}/~/${name}`);
  for (let i = 0; ; i++) {
    const state = await tab.run("window.failed || (window.film && window.film.duration)").catch(() => null);
    if (typeof state === "string") throw new Error(`${name} did not build:\n${state}`);
    if (state) return state;
    if (i > 100) throw new Error(`${name} did not load: ${tab.errors().join("; ") || "no error was reported"}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Frames piped into ffmpeg, which writes target.
async function encode(times, target, output) {
  const ffmpeg = spawn(FFMPEG, ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", ...output, target], { stdio: ["pipe", "inherit", "inherit"] });
  const done = once(ffmpeg, "close");
  let shown = -10;
  for (const [i, t] of times.entries()) {
    await tab.run(`window.film.draw(${t})`);
    if (!ffmpeg.stdin.write(await tab.picture())) await once(ffmpeg.stdin, "drain");
    if (process.stderr.isTTY && t - shown >= 5) {
      shown = t;
      process.stderr.write(`\r  ${basename(target)}  frame ${i + 1} of ${times.length}`);
    }
  }
  ffmpeg.stdin.end();
  const [code] = await done;
  if (process.stderr.isTTY) process.stderr.write("\r\x1b[K");
  if (code !== 0) throw new Error(`ffmpeg failed on ${target}`);
}
const VIDEO = ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart"];

// What a full render depends on.
function key(name) {
  const hash = createHash("sha256").update(JSON.stringify({ theme, FPS, SIZE, VIDEO }));
  for (const file of ["film.js", "stage.js", "browser.mjs", "render.mjs", `${name}.js`]) hash.update(readFileSync(join(here, file)));
  return hash.digest("hex");
}

async function check(name, duration) {
  const seen = new Map();
  const note = (complaint, t) => seen.has(complaint) || seen.set(complaint, t);
  for (const complaint of await tab.run("window.film.lint()")) note(complaint, null);
  const reach = new Map(); // scene → where it has drawn, over all its frames
  for (let t = 0; t <= duration + 1e-9; t += 0.25) {
    try {
      await tab.run(`window.film.draw(${t})`);
      for (const complaint of await tab.run("window.film.inspect()")) note(complaint, t);
      for (const { scene, ...e } of await tab.run("window.film.extent()")) {
        const r = reach.get(scene);
        reach.set(scene, r ? { left: Math.min(r.left, e.left), top: Math.min(r.top, e.top), right: Math.max(r.right, e.right), bottom: Math.max(r.bottom, e.bottom) } : e);
      }
    } catch (error) {
      note(`drawing fails: ${error.message.split("\n")[0]}`, t);
    }
  }
  // A scene fills the plate: 70% of its width or height at least, around its middle.
  for (const [scene, e] of [...reach].sort((a, b) => a[0] - b[0])) {
    const share = Math.max((e.right - e.left) / RAIL, (e.bottom - e.top) / H);
    const dx = (e.left + e.right) / 2 - RAIL / 2, dy = (e.top + e.bottom) / 2 - H / 2;
    if (share < 0.7) note(`scene ${scene + 1} takes ${Math.round(share * 100)}% of the plate's width or height; aim for 70 to 85% (s.fit)`, "layout");
    if (Math.abs(dx) > 0.05 * RAIL || Math.abs(dy) > 0.05 * H) note(`scene ${scene + 1} sits off the plate's middle by (${Math.round(dx)}, ${Math.round(dy)}) (s.fit)`, "layout");
  }
  // A frame must depend on its second alone, not on the frames drawn before it.
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.37) * duration) / 8;
    const b = ((7 - i + 0.81) * duration) / 8;
    const same = await tab.run(`(() => { const f = window.film; f.draw(${a}); const one = f.shown(); f.draw(${b}); f.draw(${a}); return one === f.shown(); })()`);
    if (!same) note(`the frame at ${a.toFixed(2)} s differs when drawn after ${b.toFixed(2)} s: a scene keeps state between frames`, a);
  }
  const lines = [...seen].map(([complaint, t]) => `  ${t === null ? "timing" : typeof t === "string" ? t : `at ${t.toFixed(2)} s`}: ${complaint}`);
  console.log(`${name}  ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}  ${lines.length ? `${lines.length} problem${lines.length > 1 ? "s" : ""}` : "nothing found"}`);
  for (const line of lines) console.log(line);
  for (const advice of await tab.run("window.film.notes()")) console.log(`  note: ${advice}`);
  if (lines.length) failures++;
}

try {
  for (const name of films) {
    const duration = await open(name);
    const suffix = theme === "dark" ? "" : `-${theme}`;
    if (flag("check")) {
      await check(name, duration);
    } else if (at !== null) {
      for (const t of at.split(",").map(Number)) {
        await tab.run(`window.film.draw(${t})`);
        const target = join(out, `${name}${suffix}@${t}.png`);
        writeFileSync(target, await tab.picture());
        console.log(target);
      }
    } else if (flag("sheet")) {
      const times = Array.from({ length: 12 }, (_, i) => +(((i + 0.5) * duration) / 12).toFixed(2));
      const target = join(out, `${name}${suffix}-sheet.png`);
      await encode(times, target, ["-vf", "scale=480:-1,tile=4x3:padding=8:margin=8:color=0x7f7f7f", "-frames:v", "1"]);
      console.log(`${target}\n  frames at ${times.join(", ")} s`);
    } else if (range !== null) {
      const [a, b] = range.split(",").map(Number);
      const times = Array.from({ length: Math.max(1, Math.round((Math.min(b, duration) - a) * FPS)) }, (_, i) => a + i / FPS);
      const target = join(out, `${name}${suffix}@${a}-${b}.mp4`);
      await encode(times, target, VIDEO);
      console.log(`${target}  ${times.length} frames`);
    } else {
      const target = join(out, `${name}${suffix}.mp4`);
      const want = key(name);
      if (!flag("force") && existsSync(target) && existsSync(`${target}.key`) && readFileSync(`${target}.key`, "utf8") === want) {
        console.log(`${target}  up to date`);
      } else {
        const times = Array.from({ length: Math.round(duration * FPS) }, (_, i) => i / FPS);
        const partial = join(out, `${name}${suffix}.part.mp4`);
        await encode(times, partial, VIDEO);
        renameSync(partial, target);
        writeFileSync(`${target}.key`, want);
        console.log(`${target}  ${duration.toFixed(1)} s, ${times.length} frames, ${(statSync(target).size / 1e6).toFixed(1)} MB`);
      }
      if (publish) {
        mkdirSync(publish, { recursive: true });
        copyFileSync(target, join(publish, basename(target)));
      }
    }
  }
} catch (error) {
  console.error(`render: ${error.message}`);
  failures++;
} finally {
  await browser.close();
  server.close();
}
process.exitCode = failures ? 1 : 0;
