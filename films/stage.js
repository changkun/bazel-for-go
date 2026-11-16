// What a scene draws with: a group on a frame of 1920 by 1080 units (one
// unit is one pixel of the video), shapes in the book's figure language,
// and the arithmetic of change over time. Nothing here reads the clock or
// the page's layout, so a frame is a function of its time alone.
//
// Colours are named by what they mean, never by value: "go", "bazel",
// "run" (work that runs, a miss), "hit" (work skipped, drawn dashed) and
// "remote" (shared or remote). Everything else is ink, at full strength,
// "muted" or "faint".

export const W = 1920;
export const H = 1080;
// The rail, with the sections and the transcript, starts at RAIL. A scene
// draws left of it, and keeps inside SAFE.
export const RAIL = 1312;
export const SAFE = { left: 72, top: 72, right: 1240, bottom: 1008 };

export const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

// Shapes take the colour itself; text takes a token that the film's style
// sets per theme, since a colour that reads on white may not on black.
export const SHAPE = { go: "#00ADD8", bazel: "#43A047", run: "#d9822b", hit: "#8a8f98", remote: "#7e57c2" };
const TEXT = { go: "var(--fm-go)", bazel: "var(--fm-bazel)", run: "var(--fm-run)", hit: "var(--fm-hit)", remote: "var(--fm-remote)" };
const TONE = { ink: 1, muted: 0.66, faint: 0.4 };
const DASH = "12 7"; // the outline of a cache hit
const FILL = 0.16; // an accent colour's fill

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const mix = (a, b, u) => a + (b - a) * u;
// How far a change from second a to second b has come at second t: 0 before, 1 after, eased between.
export function during(t, a, b) {
  const u = clamp((t - a) / (b - a));
  return u * u * (3 - 2 * u);
}
// The same, without easing.
export const ramp = (t, a, b) => clamp((t - a) / (b - a));

const NS = "http://www.w3.org/2000/svg";
export function svg(tag, attributes = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) if (value !== null && value !== undefined) node.setAttribute(name, value);
  if (parent) parent.append(node);
  return node;
}

const element = (thing) => thing.g || thing;
// How visible something is, from 0 to 1.
export function show(thing, amount) {
  element(thing).setAttribute("opacity", clamp(amount).toFixed(3));
}
// Move something by (x, y) from where it was drawn.
export function place(thing, x, y) {
  element(thing).setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
}

// The width of a string as the browser will draw it, for wrapping and for
// fitting a box around a label.
let context = null;
export function measure(string, { size = 30, weight = 400, mono = false } = {}) {
  context ??= document.createElement("canvas").getContext("2d");
  context.font = `${weight} ${size}px ${mono ? MONO : SANS}`;
  return context.measureText(string).width;
}

// A string's runs: what is between backticks is code, set in monospace.
export function runs(string) {
  return string.split("`").map((text, i) => ({ text, mono: i % 2 === 1 })).filter((r) => r.text);
}

// Set a text element's runs as tspans.
function spell(node, string, mono) {
  for (const run of runs(string)) {
    const span = svg("tspan", run.mono || mono ? { class: "fm-mono" } : {}, node);
    span.textContent = run.text;
  }
}

function paintText(node, tone) {
  if (TEXT[tone]) node.style.fill = TEXT[tone];
  else node.setAttribute("fill-opacity", TONE[tone] ?? 1);
}

// Points along a cubic from p0 to p3, with their running length, so that
// a trace or a pulse moves at an even speed.
function samples(p0, c1, c2, p3, n = 48) {
  const out = [];
  let length = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
    const p = [a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]];
    if (i) length += Math.hypot(p[0] - out[i - 1].p[0], p[1] - out[i - 1].p[1]);
    out.push({ p, length });
  }
  return out;
}
function along(points, u) {
  const total = points[points.length - 1].length;
  const want = clamp(u) * total;
  let i = 1;
  while (i < points.length - 1 && points[i].length < want) i++;
  const a = points[i - 1], b = points[i];
  const k = b.length > a.length ? (want - a.length) / (b.length - a.length) : 0;
  return [mix(a.p[0], b.p[0], k), mix(a.p[1], b.p[1], k)];
}

const SIDES = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const fixed = (v) => v.toFixed(1);

export class Stage {
  constructor(parent, film) {
    this.g = svg("g", {}, parent);
    this.film = film; // { id(name), defs }: what all scenes of one film share
  }

  // A stage inside this one, to move or fade several shapes as one.
  group() {
    return new Stage(this.g, this.film);
  }

  // Text at (x, y), y being the baseline. Backticks mark code; mono sets all of it in monospace.
  // tone: "ink", "muted", "faint", or a colour's meaning ("go", "run", ...).
  text(x, y, string, { size = 30, weight = 400, anchor = "start", tone = "ink", mono = false, italic = false, fit = null } = {}) {
    const node = svg("text", { x, y, "font-size": size, "font-weight": weight, "text-anchor": anchor, "font-style": italic ? "italic" : null, "data-fit": fit }, this.g);
    spell(node, string, mono);
    paintText(node, tone);
    return node;
  }

  // Several lines of text, the first baseline at y.
  lines(x, y, strings, { leading = 1.35, ...options } = {}) {
    const size = options.size || 30;
    return strings.map((string, i) => this.text(x, y + i * size * leading, string, options));
  }

  rect(x, y, w, h, { kind = null, r = 10, width = 2.5, dash = false, fill = null, stroke = true } = {}) {
    const colour = kind ? SHAPE[kind] : "currentColor";
    return svg("rect", {
      x, y, width: w, height: h, rx: r,
      fill: fill === null ? "none" : colour, "fill-opacity": fill,
      stroke: stroke ? colour : "none", "stroke-width": width, "stroke-dasharray": dash || kind === "hit" ? DASH : null,
    }, this.g);
  }

  line(x1, y1, x2, y2, { kind = null, width = 2, opacity = 0.25, dash = null } = {}) {
    return svg("line", { x1, y1, x2, y2, stroke: kind ? SHAPE[kind] : "currentColor", "stroke-opacity": kind ? 1 : opacity, "stroke-width": width, "stroke-dasharray": dash, "stroke-linecap": "round" }, this.g);
  }

  circle(cx, cy, r, { kind = null, fill = 1, stroke = false, width = 2.5 } = {}) {
    const colour = kind ? SHAPE[kind] : "currentColor";
    return svg("circle", { cx, cy, r, fill: fill ? colour : "none", "fill-opacity": fill || null, stroke: stroke ? colour : "none", "stroke-width": stroke ? width : null }, this.g);
  }

  // A box: an action, a step, a node of a graph. (x, y) is its top-left corner.
  // kind colours it from the start; sub is a second, smaller line. Returns a Box.
  box(x, y, w, h, label = "", { kind = null, mono = false, size = 30, weight = 400, sub = "", subMono = false, r = 10, file = false } = {}) {
    return new Box(this, x, y, w, h, label, { kind, mono, size, weight, sub, subMono, r, file });
  }

  // A file or another input: a lighter box, labelled in monospace.
  file(x, y, w, h, label, options = {}) {
    return this.box(x, y, w, h, label, { mono: true, r: 6, file: true, ...options });
  }

  // An arrow from a box (or a point [x, y]) to another. from and to name
  // the sides it leaves and enters: "right", "left", "top", "bottom".
  // Returns an Edge, which can be traced, coloured and pulsed.
  edge(a, b, { from = "right", to = "left", kind = null, width = 2.5 } = {}) {
    return new Edge(this, a, b, { from, to, kind, width });
  }

  // A cylinder: a cache or a store. (cx, cy) is its centre. Returns a Box-like shape with sides.
  cache(cx, cy, { w = 170, h = 128, label = "cache", kind = null } = {}) {
    const g = svg("g", {}, this.g);
    const rx = w / 2, ry = h * 0.12, top = cy - h / 2 + ry, bottom = cy + h / 2 - ry, x0 = cx - rx, x1 = cx + rx;
    const colour = kind ? SHAPE[kind] : "currentColor";
    svg("path", { d: `M${x0},${top} L${x0},${bottom} A${rx},${ry} 0 0 0 ${x1},${bottom} L${x1},${top}`, fill: kind ? colour : "none", "fill-opacity": kind ? FILL : null, stroke: colour, "stroke-width": 2.5 }, g);
    svg("ellipse", { cx, cy: top, rx, ry, fill: "none", stroke: colour, "stroke-width": 2.5 }, g);
    const text = svg("text", { x: cx, y: cy + ry + 10, "font-size": 30, "text-anchor": "middle", "data-fit": w - 12 }, g);
    spell(text, label, false);
    return { g, cx, cy, x: x0, y: cy - h / 2, w, h, left: [x0, cy], right: [x1, cy], top: [cx, cy - h / 2], bottom: [cx, cy + h / 2] };
  }

  // A label on a rounded ground, as wide as its text: a tag, a badge. (cx, cy) is its centre.
  pill(cx, cy, label, { kind = null, size = 26, mono = false, h = 46, fill = true } = {}) {
    const g = svg("g", {}, this.g);
    const w = measure(label.replaceAll("`", ""), { size, mono }) + 2 * Math.round(size * 0.7);
    const colour = kind ? SHAPE[kind] : "currentColor";
    svg("rect", { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2, fill: fill && kind ? colour : "none", "fill-opacity": fill && kind ? FILL : null, stroke: colour, "stroke-width": 2, "stroke-dasharray": kind === "hit" ? DASH : null }, g);
    const text = svg("text", { x: cx, y: cy + size * 0.35, "font-size": size, "text-anchor": "middle" }, g);
    spell(text, label, mono);
    paintText(text, kind || "ink");
    return { g, w, h, cx, cy };
  }

  // A wide, faint stroke behind a chain of points: the critical path. Returns { g, trace(u) }.
  band(points, { width = 66, opacity = 0.12 } = {}) {
    const path = svg("path", { d: "M" + points.map((p) => p.map(fixed).join(",")).join(" L"), fill: "none", stroke: "currentColor", "stroke-opacity": opacity, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round" }, this.g);
    const total = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
    return {
      g: path,
      trace(u) {
        path.setAttribute("stroke-dasharray", u >= 1 ? "none" : `${fixed(total * clamp(u))} ${fixed(total + width)}`);
        path.setAttribute("opacity", u > 0 ? 1 : 0);
      },
    };
  }

  // A row of swatches with labels: [[kind, label], ...]. kind may also be "band".
  legend(x, y, items, { gap = 44 } = {}) {
    const g = this.group();
    let at = x;
    for (const [kind, label] of items) {
      if (kind === "band") g.line(at + 13, y - 9, at + 31, y - 9, { width: 26, opacity: 0.16 });
      else g.rect(at, y - 23, 44, 28, { kind, r: 6, width: 2, fill: kind ? FILL : null });
      g.text(at + 58, y, label, { size: 26 });
      at += 58 + measure(label, { size: 26 }) + gap;
    }
    return g;
  }

  // A fill of thin diagonal lines in ink, for a share that is neither colour.
  hatch() {
    const id = this.film.id("hatch");
    if (!this.film.defs.querySelector(`#${id}`)) {
      const pattern = svg("pattern", { id, width: 14, height: 14, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, this.film.defs);
      svg("line", { x1: 0, y1: 0, x2: 0, y2: 14, stroke: "currentColor", "stroke-opacity": 0.3, "stroke-width": 4 }, pattern);
    }
    return `url(#${id})`;
  }
}

// A box that can change state over time, the way the book's figures do:
// a coloured layer fades in over the ink outline.
class Box {
  constructor(stage, x, y, w, h, label, { kind, mono, size, weight, sub, subMono, r, file }) {
    Object.assign(this, { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r });
    this.g = svg("g", {}, stage.g);
    this.base = svg("rect", file
      ? { x, y, width: w, height: h, rx: r, fill: "currentColor", "fill-opacity": 0.06, stroke: "currentColor", "stroke-opacity": 0.6, "stroke-width": 2 }
      : { x, y, width: w, height: h, rx: r, fill: "none", stroke: "currentColor", "stroke-width": 2.5 }, this.g);
    this.layers = {};
    this.labels = [];
    if (label) {
      const text = svg("text", { x: this.cx, y: sub ? this.cy - 4 : this.cy + size * 0.35, "font-size": size, "font-weight": weight, "text-anchor": "middle", "data-fit": w - 16 }, this.g);
      spell(text, label, mono);
      this.labels.push(text);
    }
    if (sub) {
      const text = svg("text", { x: this.cx, y: this.cy + 36, "font-size": 26, "text-anchor": "middle", "fill-opacity": 0.66, "data-fit": w - 16 }, this.g);
      spell(text, sub, subMono);
      this.labels.push(text);
    }
    this.label = this.labels[0];
    if (kind) this.mark(kind, 1);
  }

  get left() { return [this.x, this.cy]; }
  get right() { return [this.x + this.w, this.cy]; }
  get top() { return [this.cx, this.y]; }
  get bottom() { return [this.cx, this.y + this.h]; }

  // Colour the box as kind ("run", "hit", "go", ...) by u, from 0 to 1.
  mark(kind, u) {
    if (!this.layers[kind]) {
      const colour = SHAPE[kind];
      this.layers[kind] = svg("rect", { x: this.x, y: this.y, width: this.w, height: this.h, rx: this.r, fill: colour, "fill-opacity": FILL, stroke: colour, "stroke-width": 2.5, "stroke-dasharray": kind === "hit" ? DASH : null, opacity: 0 }, null);
      this.g.insertBefore(this.layers[kind], this.labels[0] || null);
    }
    this.layers[kind].setAttribute("opacity", clamp(u).toFixed(3));
    const most = Math.max(...Object.values(this.layers).map((layer) => Number(layer.getAttribute("opacity"))));
    this.base.setAttribute("opacity", (1 - most).toFixed(3));
    return this;
  }

  // Draw attention to the box by u: a heavier outline.
  focus(u) {
    this.base.setAttribute("stroke-width", mix(2.5, 5, clamp(u)).toFixed(2));
    return this;
  }
}

// An arrow along a cubic curve between two sides, with its head drawn as a
// shape (not an SVG marker), so it fades and colours with the line.
class Edge {
  constructor(stage, a, b, { from, to, kind, width }) {
    const end = (thing, side) => (Array.isArray(thing) ? { p: thing, d: null } : { p: thing[side], d: SIDES[side] });
    const s = end(a, from), e = end(b, to);
    const gap = 6, head = 16;
    const p0 = s.d ? [s.p[0] + s.d[0] * gap, s.p[1] + s.d[1] * gap] : s.p;
    const tip = e.d ? [e.p[0] + e.d[0] * gap, e.p[1] + e.d[1] * gap] : e.p;
    const reach = (d) => Math.max(36, 0.45 * Math.abs(d[0] ? tip[0] - p0[0] : tip[1] - p0[1]));
    const c1 = s.d ? [p0[0] + s.d[0] * reach(s.d), p0[1] + s.d[1] * reach(s.d)] : p0;
    let c2 = e.d ? [tip[0] + e.d[0] * reach(e.d), tip[1] + e.d[1] * reach(e.d)] : tip;
    let dx = tip[0] - c2[0], dy = tip[1] - c2[1];
    if (Math.hypot(dx, dy) < 1) [dx, dy] = [tip[0] - c1[0], tip[1] - c1[1]];
    if (Math.hypot(dx, dy) < 1) [dx, dy] = [tip[0] - p0[0], tip[1] - p0[1]];
    const n = Math.hypot(dx, dy);
    const u = [dx / n, dy / n];
    const p3 = [tip[0] - u[0] * head * 0.6, tip[1] - u[1] * head * 0.6];
    if (!e.d) c2 = p3;
    this.points = samples(p0, c1, c2, p3);
    this.total = this.points[this.points.length - 1].length;
    const d = `M${p0.map(fixed)} C${c1.map(fixed)} ${c2.map(fixed)} ${p3.map(fixed)}`;
    const corner = (turn) => [tip[0] - head * (u[0] * Math.cos(turn) - u[1] * Math.sin(turn)), tip[1] - head * (u[1] * Math.cos(turn) + u[0] * Math.sin(turn))];
    const headPoints = [tip, corner(0.42), corner(-0.42)].map((p) => p.map(fixed).join(",")).join(" ");
    this.g = svg("g", {}, stage.g);
    const layer = (colour, opacity, dash, w) => {
      const g = svg("g", {}, this.g);
      const path = svg("path", { d, fill: "none", stroke: colour, "stroke-opacity": opacity, "stroke-width": w, "stroke-dasharray": dash, "stroke-linecap": "round" }, g);
      const point = svg("polygon", { points: headPoints, fill: colour, "fill-opacity": opacity }, g);
      return { g, path, head: point, dash };
    };
    this.base = layer("currentColor", 0.55, null, width);
    this.layers = {};
    this.width = width;
    this.dot = null;
    if (kind) this.mark(kind, 1);
  }

  // Draw the arrow up to part u of its length; the head appears at the end.
  trace(u) {
    for (const layer of [this.base, ...Object.values(this.layers)]) {
      layer.path.setAttribute("stroke-dasharray", u >= 1 ? layer.dash || "none" : `${fixed(this.total * clamp(u))} ${fixed(this.total + 20)}`);
      layer.head.setAttribute("opacity", during(u, 0.9, 1).toFixed(3));
    }
    return this;
  }

  // Colour the arrow as kind by u, from 0 to 1.
  mark(kind, u) {
    if (!this.layers[kind]) this.layers[kind] = colourLayer(this, kind);
    this.layers[kind].g.setAttribute("opacity", clamp(u).toFixed(3));
    const most = Math.max(...Object.values(this.layers).map((layer) => Number(layer.g.getAttribute("opacity"))));
    this.base.g.setAttribute("opacity", (1 - most).toFixed(3));
    return this;
  }

  // A dot travelling along the arrow, at part u of its way; hidden outside
  // 0 < u < 1, and shown at most at strength (to fade one that stopped short).
  pulse(u, kind = "run", strength = 1) {
    if (!this.dot) this.dot = svg("circle", { r: 11, fill: SHAPE[kind] }, this.g);
    const [x, y] = along(this.points, u);
    this.dot.setAttribute("cx", fixed(x));
    this.dot.setAttribute("cy", fixed(y));
    this.dot.setAttribute("opacity", (u <= 0 || u >= 1 ? 0 : clamp(strength) * Math.min(1, u / 0.08, (1 - u) / 0.08)).toFixed(3));
    return this;
  }
}

// The arrow again in a colour, over its ink.
function colourLayer(edge, kind) {
  const base = edge.base;
  const g = svg("g", { opacity: 0 }, edge.g);
  const dash = kind === "hit" ? DASH : null;
  const path = svg("path", { d: base.path.getAttribute("d"), fill: "none", stroke: SHAPE[kind], "stroke-width": edge.width + 0.5, "stroke-dasharray": dash, "stroke-linecap": "round" }, g);
  const head = svg("polygon", { points: base.head.getAttribute("points"), fill: SHAPE[kind] }, g);
  if (edge.dot) edge.g.append(edge.dot); // the dot stays on top
  return { g, path, head, dash };
}
