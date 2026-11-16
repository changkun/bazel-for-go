// A film: one chapter explained in moving pictures, read without sound.
// The frame has two parts. On the left, the plate: a scene's drawing in the
// book's figure language. On the right, the rail: the chapter's sections as
// a segmented timeline, and under it the transcript, where the sentence
// being read is at full strength and the earlier ones dim and move up.
//
// A film is a module in this directory, named for its chapter, whose
// default export is plain data plus one drawing function per scene:
//
//     export default {
//       chapter: "1", title: "What a build system decides",
//       scenes: [{
//         section: "Actions and keys",                 // a "## " heading of the chapter
//         lines: ["A sentence.", { say: "Another.", hold: 2 }],
//         draw(s) { ...build once on Stage s...; return (t, cue) => { ...set the frame at second t... }; },
//       }],
//     };
//
// A line stays for its reading time (READ seconds a word, at least LEAST)
// plus its hold (HOLD unless given), so the text decides the timing and
// the pictures follow it: cue[i] is the second, within the scene, at which
// line i appears, and cue[lines.length] is the scene's end. Everything is a
// function of t, so the same code plays in the page and is photographed
// frame by frame into a video by render.mjs. See README.md.

import { H, MONO, RAIL, SANS, Stage, W, clamp, during, measure, mix, runs, svg } from "./stage.js";

export const READ = 0.4; // seconds a word
export const LEAST = 2; // seconds a line is read, at least
export const HOLD = 0.8; // seconds a line stays after its reading time, unless it says otherwise
export const TITLE = 3.5; // seconds the chapter's title stands alone at the start
export const REST = 1.5; // seconds the last frame stays
export const FADE = 0.45; // seconds a scene takes to fade in, and out
export const LONGEST = 300; // seconds a film may run
export const AIM = [150, 240]; // and should
const SCENE = 90; // seconds a scene may run before its picture should change
const WORDS = 32; // words in one line, at most
const WRAPS = 6; // rail lines one sentence may take

// The rail's geometry.
const X = RAIL + 56; // where its text starts
const WIDE = W - 56 - X; // how wide its text may be
const INDEX = 96; // the top of the first section's row
const ROW = 46;
const BODY = 32; // the transcript's type size
const LEAD = 44; // and its line height
const GAP = 26; // between two sentences
const HEAD = 46; // the title's type size
const DIM = 0.34; // a sentence already read
const BOTTOM = H - 72;

const STYLE = `
.fm { --fm-ink: var(--fg, #1f1f1f); --fm-ground: var(--bg, #ffffff); --fm-panel: var(--surface, #f6f6f6);
  --fm-go: #007D9C; --fm-bazel: #388E3C; --fm-run: #d9822b; --fm-hit: #8a8f98; --fm-remote: #7e57c2;
  color: var(--fm-ink); font-family: ${SANS}; -webkit-user-select: none; user-select: none; }
html.dark .fm { --fm-ink: var(--fg, #e3e3e3); --fm-ground: var(--bg, #181818); --fm-panel: var(--surface, #222222);
  --fm-go: #00ADD8; --fm-bazel: #43A047; --fm-remote: #9575cd; }
.fm text { fill: currentColor; }
.fm .fm-mono { font-family: ${MONO}; }
.fm .fm-ground { fill: var(--fm-ground); }
.fm .fm-panel { fill: var(--fm-panel); }
`;

const plain = (string) => string.replaceAll("`", "");
const count = (string) => plain(string).split(/\s+/).filter(Boolean).length;
export const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// The film's module, by URL.
export async function load(url) {
  return (await import(url)).default;
}

// When everything happens, from the film's data alone: the scenes with
// their cues, every line, and the sections.
export function timeline(made) {
  const scenes = [];
  const lines = [];
  let t = 0;
  made.scenes.forEach((scene, n) => {
    const start = t;
    if (n === 0) t += TITLE;
    t += scene.lead ?? 0;
    const cue = [];
    for (const raw of scene.lines) {
      const line = typeof raw === "string" ? { say: raw } : raw;
      const words = count(line.say);
      const reading = Math.max(LEAST, READ * words);
      const seconds = line.seconds ?? reading + (line.hold ?? HOLD);
      cue.push(t - start);
      lines.push({ say: line.say, start: t, end: t + seconds, seconds, words, reading, scene: n, section: scene.section ?? null });
      t += seconds;
    }
    if (n === made.scenes.length - 1) t += REST;
    cue.push(t - start);
    scenes.push({ start, end: t, cue, section: scene.section ?? null });
  });
  const sections = [];
  for (const scene of scenes) {
    if (!scene.section) continue;
    const last = sections[sections.length - 1];
    if (last && last.name === scene.section) last.end = scene.end;
    else sections.push({ name: scene.section, start: scene.start + scene.cue[0], end: scene.end });
  }
  return { duration: t, scenes, lines, sections };
}

// Break a sentence into rail lines no wider than width. A line is a list
// of words, a word a list of runs (code or not).
function wrap(string, width, size, weight = 400) {
  const words = [[]];
  for (const run of runs(string))
    for (const part of run.text.split(/( +)/)) {
      if (!part) continue;
      if (!part.trim()) {
        if (words[words.length - 1].length) words.push([]);
      } else words[words.length - 1].push({ text: part, mono: run.mono });
    }
  const space = measure(" ", { size, weight });
  const lines = [];
  let line = [];
  let used = 0;
  for (const word of words.filter((w) => w.length)) {
    const w = word.reduce((sum, run) => sum + measure(run.text, { size, weight, mono: run.mono }), 0);
    if (line.length && used + space + w > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += (line.length ? space : 0) + w;
    line.push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

// Set one rail line: its words, with the spaces between them in the body
// font, and runs of the same font joined into one tspan.
function setLine(parent, x, y, line, { size, weight = 400 }) {
  const node = svg("text", { x, y, "font-size": size, "font-weight": weight }, parent);
  const joined = [];
  line.forEach((word, i) => {
    for (const run of i ? [{ text: " ", mono: false }, ...word] : word) {
      const last = joined[joined.length - 1];
      if (last && last.mono === run.mono) last.text += run.text;
      else joined.push({ ...run });
    }
  });
  for (const run of joined) svg("tspan", run.mono ? { class: "fm-mono" } : {}, node).textContent = run.text;
  return node;
}

let films = 0;

// Build the film once. Returns { root, duration, times, draw(t), inspect(), lint(), notes() }.
export function build(made) {
  const times = timeline(made);
  const prefix = `fm${++films}-`;
  const kicker = /^\d+$/.test(made.chapter) ? `Chapter ${made.chapter}` : made.chapter;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "fm", role: "img", "aria-label": `${kicker}, ${made.title}: a film without sound; its text is on screen` });
  svg("style", {}, root).textContent = STYLE;
  const defs = svg("defs", {}, root);
  const film = { defs, id: (name) => prefix + name };
  svg("rect", { width: W, height: H, class: "fm-ground" }, root);
  svg("rect", { x: RAIL, width: W - RAIL, height: H, class: "fm-panel" }, root);

  const plate = svg("g", { "data-region": "plate" }, root);
  const scenes = made.scenes.map((scene, i) => {
    const stage = new Stage(plate, film);
    return { ...times.scenes[i], stage, update: scene.draw ? scene.draw(stage) || (() => {}) : () => {} };
  });

  // The sections, as a timeline in rows: a bar that fills, and the name.
  const rail = svg("g", { "data-region": "rail" }, root);
  const rows = times.sections.map((section, j) => {
    const top = INDEX + j * ROW;
    svg("rect", { x: X, y: top + 7, width: 4, height: ROW - 14, fill: "currentColor", "fill-opacity": 0.16 }, rail);
    const bar = svg("rect", { x: X, y: top + 7, width: 4, height: 0, fill: "currentColor" }, rail);
    const name = svg("text", { x: X + 22, y: top + ROW / 2 + 9, "font-size": 26 }, rail);
    name.textContent = section.name;
    return { ...section, bar, name, height: ROW - 14 };
  });
  const rule = INDEX + rows.length * ROW + 22;
  if (rows.length) svg("line", { x1: X, y1: rule, x2: X + WIDE, y2: rule, stroke: "currentColor", "stroke-opacity": 0.16, "stroke-width": 2 }, rail);
  const TOP = rows.length ? rule + 60 : INDEX;

  // The transcript: the title, then every line, each a group of rail lines.
  const entries = [];
  {
    const g = svg("g", {}, rail);
    const nodes = [];
    const k = svg("text", { x: X, y: 26, "font-size": 26, "font-weight": 500, "letter-spacing": "0.04em", "fill-opacity": 0.62 }, g);
    k.textContent = kicker.toUpperCase();
    nodes.push({ node: k, top: 0 });
    wrap(made.title, WIDE * 0.97, HEAD, 600).forEach((line, i) => {
      const y = 26 + 22 + HEAD + i * 58;
      nodes.push({ node: setLine(g, X, y, line, { size: HEAD, weight: 600 }), top: y - HEAD });
    });
    entries.push({ g, nodes, start: 0, height: nodes[nodes.length - 1].top + HEAD + 12, say: made.title, wraps: nodes.length - 1 });
  }
  for (const line of times.lines) {
    if (!line.say.trim()) continue;
    const g = svg("g", {}, rail);
    const wrapped = wrap(line.say, WIDE * 0.97, BODY);
    const nodes = wrapped.map((words, i) => ({ node: setLine(g, X, BODY + i * LEAD, words, { size: BODY }), top: i * LEAD }));
    entries.push({ g, nodes, start: line.start, height: (wrapped.length - 1) * LEAD + BODY + 10, say: line.say, wraps: wrapped.length });
  }
  // Where each sentence sits in the column, and how far the column has
  // moved up when it is the newest: by whole sentences, so that the column
  // always starts with a sentence's first line.
  let y = 0;
  for (const entry of entries) {
    entry.y = y;
    y += entry.height + GAP;
  }
  let first = 0;
  for (const entry of entries) {
    while (entry.y + entry.height - entries[first].y > BOTTOM - TOP) first++;
    entry.scroll = entries[first].y;
  }

  function drawRail(t) {
    rows.forEach((row, j) => {
      const last = j === rows.length - 1;
      const part = clamp((t - row.start) / (row.end - row.start));
      row.bar.setAttribute("height", (row.height * part).toFixed(1));
      row.name.setAttribute("opacity", t < row.start ? 0.38 : t < row.end || last ? 1 : 0.6);
    });
    let k = 0;
    while (k + 1 < entries.length && entries[k + 1].start <= t) k++;
    const moving = k ? during(t, entries[k].start, entries[k].start + 0.5) : 1;
    const offset = mix(k ? entries[k - 1].scroll : 0, entries[k].scroll, moving);
    entries.forEach((entry, i) => {
      let alpha;
      if (i > k) alpha = 0;
      else if (i === k) alpha = i === 0 ? 1 : during(t, entry.start + 0.4, entry.start + 0.9); // once the column has made room
      else alpha = mix(1, DIM, during(t, entries[i + 1].start, entries[i + 1].start + 0.5));
      const rise = i === k && i > 0 ? (1 - alpha) * 14 : 0;
      const at = TOP + entry.y - offset + rise;
      entry.g.setAttribute("transform", `translate(0 ${at.toFixed(1)})`);
      // A sentence leaves as a whole once its first line passes the top of the column.
      const edge = clamp(1 + (at - TOP) / 40);
      for (const { node } of entry.nodes) node.setAttribute("opacity", (alpha * edge).toFixed(3));
    });
  }

  function draw(t) {
    t = clamp(t, 0, times.duration);
    scenes.forEach((scene, i) => {
      const last = i === scenes.length - 1;
      const on = t >= scene.start && (t < scene.end || last);
      scene.stage.g.setAttribute("display", on ? "inline" : "none");
      if (!on) return;
      const arriving = i === 0 ? 1 : during(t, scene.start, scene.start + FADE);
      const leaving = last ? 1 : 1 - during(t, scene.end - FADE, scene.end);
      scene.stage.g.setAttribute("opacity", Math.min(arriving, leaving).toFixed(3));
      scene.update(t - scene.start, scene.cue);
    });
    drawRail(t);
  }

  // Advice that is not a fault: a length outside the aim but within the limit.
  function notes() {
    const d = times.duration;
    return d <= LONGEST && (d < AIM[0] || d > AIM[1]) ? [`the film runs ${clock(d)}; aim for ${clock(AIM[0])} to ${clock(AIM[1])}`] : [];
  }

  // What is wrong with the timing and the text, from the data alone.
  function lint() {
    const found = [];
    const d = times.duration;
    if (d > LONGEST) found.push(`the film runs ${clock(d)}; the most is ${clock(LONGEST)}`);
    const quote = (s) => `“${plain(s).split(/\s+/).slice(0, 6).join(" ")}…”`;
    for (const line of times.lines) {
      if (line.seconds < line.reading + 0.5) found.push(`${quote(line.say)} stays ${line.seconds.toFixed(1)} s; its ${line.words} words need ${(line.reading + 0.5).toFixed(1)} s`);
      if (line.words > WORDS) found.push(`${quote(line.say)} has ${line.words} words; the most is ${WORDS}, so split it`);
    }
    for (const entry of entries.slice(1)) if (entry.wraps > WRAPS) found.push(`${quote(entry.say)} takes ${entry.wraps} lines of the rail; the most is ${WRAPS}`);
    times.scenes.forEach((scene, i) => {
      if (scene.end - scene.start > SCENE) found.push(`scene ${i + 1} runs ${(scene.end - scene.start).toFixed(0)} s; after ${SCENE} s, split it`);
    });
    const names = times.sections.map((s) => s.name);
    for (const name of new Set(names)) if (names.indexOf(name) !== names.lastIndexOf(name)) found.push(`section “${name}” comes back after another; keep a section's scenes together`);
    if (BOTTOM - TOP < 9 * LEAD) found.push(`${rows.length} sections leave too little room for the transcript`);
    return found;
  }

  // What is wrong with the frame as it is drawn now: text that is too small,
  // leaves its part of the frame, outgrows its box, or lies on other text,
  // and shapes that leave the plate. Run in a page, where text is measured.
  function inspect() {
    const box = root.getBoundingClientRect();
    const k = W / box.width;
    const visible = (node) => {
      let opacity = 1;
      let region = null;
      for (let n = node; n && n !== root; n = n.parentNode) {
        if (n.getAttribute("display") === "none") return null;
        opacity *= Number(n.getAttribute("opacity") ?? 1);
        region ??= n.getAttribute("data-region");
      }
      if (opacity < 0.15) return null;
      const r = node.getBoundingClientRect();
      return { node, region, left: (r.left - box.left) * k, right: (r.right - box.left) * k, top: (r.top - box.top) * k, bottom: (r.bottom - box.top) * k };
    };
    const found = [];
    const texts = [];
    for (const node of root.querySelectorAll("text")) {
      const string = node.textContent.trim();
      const v = string && visible(node);
      if (!v) continue;
      v.string = string;
      texts.push(v);
      const size = Number(node.getAttribute("font-size"));
      if (size < 26) found.push(`“${string}” is set at ${size}; the least is 26`);
      const [lo, hi] = v.region === "rail" ? [RAIL + 24, W - 24] : [24, RAIL - 24];
      if (v.left < lo || v.right > hi || v.top < 24 || v.bottom > H - 24) found.push(`“${string}” leaves the ${v.region || "frame"}`);
      const fit = Number(node.getAttribute("data-fit"));
      if (fit && (v.right - v.left) * 1.06 > fit) found.push(`“${string}” is too wide for its box (${Math.round(v.right - v.left)} of ${fit}, with room for wider fonts)`);
    }
    for (const [i, a] of texts.entries())
      for (const b of texts.slice(i + 1)) {
        if (a.string === b.string) continue;
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (across > 4 && down > 0.3 * Math.min(a.bottom - a.top, b.bottom - b.top)) found.push(`“${a.string}” lies on “${b.string}”`);
      }
    for (const node of plate.querySelectorAll("rect, path, line, circle, ellipse, polygon")) {
      const v = visible(node);
      if (v && (v.left < 12 || v.right > RAIL - 12 || v.top < 12 || v.bottom > H - 12)) found.push(`a ${node.tagName} leaves the plate at (${Math.round(v.left)}, ${Math.round(v.top)})–(${Math.round(v.right)}, ${Math.round(v.bottom)})`);
    }
    return found;
  }

  // What is shown, as a string: two calls give the same string when they show the same frame.
  function shown() {
    const scenes = [...plate.children].filter((g) => g.getAttribute("display") !== "none");
    return scenes.map((g) => g.outerHTML).join("") + rail.outerHTML;
  }

  draw(made.poster ?? TITLE - 0.5);
  return { root, duration: times.duration, times, draw, inspect, lint, notes, shown, made };
}
