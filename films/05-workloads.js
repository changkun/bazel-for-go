// Chapter 5's film: what the toolchain's programs consume, and how that
// grows. One compile over time (a parallel parse, a serial front end, a back
// end on -c workers), the go command's token pool against rules_go's missing
// -c, a link that reads every package of its binary and grows with it, test
// binaries as a link plus a run, the shape of a cold build under its
// critical path, and the four workload classes. Every sentence comes from
// the chapter; the pictures follow Figures 5.1 to 5.4 as shapes, not data.

import { SHAPE, clamp, during, measure, mix, place, ramp, show, svg } from "./stage.js";

// bench: n1000 on the 18-core Apple M5 Pro, results/2026-11-15 (Appendix A).
// The machine and the repository set the counts drawn; the rest sets
// proportions only, and no measured value is written on the plate.
const BENCH = {
  cores: 18, // GOMAXPROCS, and so -p, by default
  layers: 12,
  binaries: 10, // the applications
  linkMemory: 10, // a go build link's peak memory, in compiles' (medians)
  build: { work: 3.6, path: 4.5, span: 7.3, std: 1.52, link: 1.05 }, // cold go build, seconds: CPU ÷ cores, critical path, span; the path's first and last parts
};

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
const word = (n) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] ?? String(n);
// Where a moving thing is at second t, from keys [[second, value], ...], at even speed between keys.
function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) return mix(keys[i - 1][1], keys[i][1], ramp(t, keys[i - 1][0], keys[i][0]));
  return keys[keys.length - 1][1];
}
// The same pseudo-random numbers on every run, for an illustrative choice of packages.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Type sizes that stay legible at the scale k a scene is drawn at.
const sizes = (k) => (n) => Math.max(n, n / k + 0.2);
const faint = (node, opacity = 0.35) => (node.setAttribute("stroke-opacity", opacity), node);

export default {
  chapter: "5",
  title: "The toolchain's workloads",
  scenes: [
    {
      // The chapter's opening: the same programs under both tools, each process recorded.
      lines: [
        { say: "The go command and rules_go run the same programs: compiler, linker, assembler, cgo and test binaries.", hold: 1 },
        { say: "A wrapper recorded each process's wall time, CPU time and peak memory, in a cold build and in `go test ./...`.", hold: 1.2 },
      ],
      draw(s) {
        const k = s.fit(-24, 0, 1024, 560);
        const px = sizes(k);
        // The programs stand in the middle until the records come.
        const top = s.group();
        const go = top.pill(330, 23, "go command", { kind: "go", size: px(26) });
        const bazel = top.pill(670, 23, "rules_go", { kind: "bazel", size: px(26) });
        // Both run the same programs.
        const runs = [330, 670].map((x) => top.edge([x, 52], [x, 110], { width: 2 }));
        const names = [["compile", 170], ["link", 130], ["asm", 130], ["cgo", 130], ["test binary", 210]];
        const gap = (1000 - names.reduce((sum, [, w]) => sum + w, 0)) / (names.length - 1);
        let x = 0;
        const programs = names.map(([name, w]) => {
          const b = top.box(x, 140, w, 80, name, { size: px(32) });
          x += w + gap;
          return b;
        });
        const wrapper = faint(top.rect(-24, 116, 1048, 128, { r: 14, width: 2 }));
        const wrapperName = top.text(-24, 284, "wrapper: `-toolexec` and `-exec`", { size: px(26), tone: "muted" });
        // One record per process: three measures, drawn as placeholders, not values.
        const COLS = [330, 560, 790];
        const heads = ["wall time", "CPU time", "peak memory"].map((h, i) => s.text(COLS[i], 370, h, { size: px(26), weight: 600 }));
        const process = s.text(0, 370, "process", { size: px(26), weight: 600 });
        const rule = s.line(0, 388, 1000, 388, { width: 2, opacity: 0.3 });
        // The repository has no cgo, so no cgo process is recorded.
        const recorded = [0, 1, 2, 4];
                const rows = recorded.map((p, i) => {
          const [name] = names[p];
          const g = s.group();
          const y = 426 + 40 * i;
          g.text(0, y, name, { size: px(26) });
          COLS.forEach((x) => g.rect(x, y - 18, 120, 20, { r: 4, fill: 0.35, stroke: false }));
          return g;
        });
        const dots = recorded.map(() => s.circle(0, 0, 9, { fill: 0.8 }));
        return (t, cue) => {
          place(top, 0, 135 * (1 - during(t, cue[1] + 1.0, cue[1] + 1.8)));
          appear(go, t, 0.3);
          appear(bazel, t, 0.6);
          runs.forEach((e, i) => e.trace(during(t, cue[0] + 0.6 + 0.2 * i, cue[0] + 1.4 + 0.2 * i)));
          programs.forEach((b, i) => appear(b, t, 0.9 + 0.25 * i));
          appear(wrapper, t, cue[1] + 0.6);
          appear(wrapperName, t, cue[1] + 0.8);
          [process, ...heads].forEach((h, i) => appear(h, t, cue[1] + 1.6 + 0.6 * i));
          appear(rule, t, cue[1] + 1.6);
          // Each process sends its record down into the table.
          recorded.forEach((p, i) => {
            const b = programs[p];
            const a = cue[1] + 4.4 + 0.5 * i;
            const u = during(t, a, a + 0.7);
            place(dots[i], mix(b.cx, -16, u), mix(b.y + b.h + 14, 418 + 40 * i, u));
            show(dots[i], u > 0 && u < 1 ? 1 : 0);
            appear(rows[i], t, a + 0.6, 0.4);
          });
        };
      },
    },
    {
      section: "compile: one process per package",
      lines: [
        { say: "The compiler compiles one package per process.", hold: 1 },
        { say: "Its front end is serial apart from parsing, which runs one goroutine per file.", hold: 1 },
        { say: "It type-checks the package, inlines calls, and runs escape analysis, which decides what can live on the stack.", hold: 1.2 },
        { say: "The back end then compiles the functions, longest first, on `-c` worker goroutines, and the process ends by writing the archive.", hold: 1.2 },
      ],
      draw(s) {
        // Figure 5.1, with a cursor for now: the work done so far is drawn.
        const k = s.fit(0, 0, 1120, 470, 0.85);
        const px = sizes(k);
        const frame = faint(s.rect(0, 0, 1120, 470, { r: 16, width: 2 }));
        const title = s.text(28, 48, "one `compile` process, one package", { size: px(26), tone: "muted" });
        const LANE = [152, 212, 272, 332];
        const MID = (LANE[0] + LANE[3]) / 2;
        const frontHead = s.text(30, 108, "front end: parallel parse, then serial", { size: px(26), tone: "muted" });
        const backHead = s.text(700, 108, "back end: `-c` workers, here 4", { size: px(26), tone: "muted" });
        const parse = ["a.go", "b.go", "c.go", "d.go"].map((f, i) => s.box(30, LANE[i] - 24, 136, 48, f, { mono: true, size: px(32), r: 8 }));
        const serial = [["types", 226], ["inline", 366], ["escape", 506]].map(([name, x]) => s.box(x, MID - 28, 136, 56, name, { size: px(32), r: 8 }));
        const [types] = serial;
        const join = parse.map((p) => s.edge(p, types, { width: 2 }));
        // The functions, longest first, on four workers.
        const widths = [[78, 48, 31, 18, 9], [71, 46, 29, 20, 11, 5], [64, 42, 35, 22, 13], [60, 40, 31, 24, 16, 7]];
        const X0 = 700;
        const ends = [];
        const blocks = widths.flatMap((lane, i) => {
          let x = X0;
          const out = lane.map((w0) => {
            const w = w0 * 1.25;
            const r = s.rect(x, LANE[i] - 20, w, 40, { r: 5, width: 1.6, fill: 0.1 });
            const b = { r, x, w };
            x += w + 3;
            return b;
          });
          ends.push(x - 3);
          return out;
        });
        const fan = LANE.map((y) => s.edge(serial[2], [X0 - 4, y], { width: 2 }));
        const archive = s.box(968, MID - 28, 136, 56, "archive", { size: px(32), r: 8 });
        const gather = LANE.map((y, i) => s.edge([ends[i] + 4, y], archive, { width: 2 }));
        const axis = s.edge([30, 398], [1100, 398], { width: 2 });
        const time = s.text(1100, 440, "time", { size: px(26), anchor: "end", tone: "muted" });
        const cursor = s.line(0, 124, 0, 372, { width: 3, opacity: 0.7 });
        return (t, cue) => {
          show(frame, 1);
          show(title, 1);
          show(axis, 1);
          show(time, 1);
          show(frontHead, 1);
          show(backHead, 1);
          // The whole compile is there, faint, from the start; the cursor brings each part up as it runs.
          const ghost = 0.22;
          const up = (u) => ghost + (1 - ghost) * u;
          // The cursor: the parse, the serial front end, the back end, the write.
          const x = track(t, [
            [cue[1] + 0.8, 30], [cue[1] + 3.4, 168],
            [cue[2] + 0.2, 168], [cue[2] + 0.8, 226], [cue[2] + 2.0, 366], [cue[2] + 3.4, 506], [cue[2] + 5.6, 644],
            [cue[3] + 1.4, 644], [cue[3] + 2.4, 700], [cue[3] + 6.4, Math.max(...ends) + 2],
            [cue[3] + 7.0, 968], [cue[3] + 8.2, 1104],
          ]);
          place(cursor, x, 0);
          show(cursor, during(t, cue[1] + 0.4, cue[1] + 0.8) * (1 - during(t, cue[3] + 8.6, cue[3] + 9.2)));
          const swept = (x0, w) => clamp((x - x0) / w);
          parse.forEach((p) => show(p, up(swept(30, 136))));
          join.forEach((e) => show(e, up(swept(166, 60))));
          serial.forEach((b) => show(b, up(swept(b.x, b.w))));
          fan.forEach((e) => show(e, up(swept(642, 58))));
          for (const b of blocks) show(b.r, up(swept(b.x, b.w)));
          gather.forEach((e, i) => show(e, up(swept(ends[i], 968 - ends[i]))));
          show(archive, up(swept(968, 136)));
        };
      },
    },
    {
      section: "compile: one process per package",
      lines: [
        { say: "The go command runs up to `-p` actions at once, and gives each compile a `-c` from a shared pool of tokens.", hold: 1 },
        { say: "A compile takes half the tokens not held back for compiles yet to start, at least 4 and at most `GOMAXPROCS`.", hold: 1.4 },
        { say: "rules_go passes no `-c`, so each compile starts one worker per CPU.", hold: 1.4 },
        { say: "Bazel's scheduler books each rules_go action, which declares no resources, as one CPU.", hold: 1 },
        { say: "So under Bazel the same compiles may start more back-end workers; we did not measure the effect.", hold: 2 },
      ],
      draw(s) {
        const N = BENCH.cores, P = N, G = N, MIN = Math.min(4, G), POOL = 2 * G + MIN * P;
        // The go command's pool as P compiles start one after another, none yet done:
        // the tokens left before each, and the -c each takes (cmd/go, compilerConcurrency).
        const before = [], takes = [];
        let tokens = POOL;
        for (let n = 1; n <= P; n++) {
          const c = Math.max(Math.min(Math.floor((tokens - (P - n) * MIN) / 2), G), MIN);
          before.push(tokens);
          takes.push(c);
          tokens -= c;
        }
        // The pool stands in columns beside the go command's rows; rules_go's rows to the right.
        const D = 26, R = 10, PITCH = 34, ROW0 = 140;
        const COLS = Math.ceil(POOL / P);
        const GX = COLS * D + 64, RX = GX + N * D + 110, BX = RX + N * D + 22;
        const k = s.fit(-6, -70, BX + 22, 846, 0.85);
        const px = sizes(k);
        const poolAt = (j) => [R + 2 + Math.floor(j / P) * D, ROW0 + (j % P) * PITCH];
        const rowAt = (x0, row, slot) => [x0 + R + 2 + slot * D, ROW0 + row * PITCH];
        const header = s.text((BX + 16) / 2, -44, "one row per compile running at once; one dot per back-end worker", { size: px(26), anchor: "middle" });
        const goPill = s.pill((GX + N * D) / 2, 20, "go command", { kind: "go", size: px(26) });
        const bazelPill = s.pill(RX + (N * D) / 2, 20, "rules_go", { kind: "bazel", size: px(26) });
        const poolName = s.text(0, 86, "a pool of 2×`GOMAXPROCS` + 4×`-p` tokens", { size: px(26), tone: "muted" });
        const noC = s.text(RX, 86, "no `-c`: one worker per CPU", { size: px(26), tone: "muted" });
        const tracks = (x0) => {
          const g = s.group();
          for (let n = 0; n < P; n++) g.rect(x0, ROW0 + n * PITCH - 14, N * D + 4, 28, { r: 7, fill: 0.06, stroke: false });
          return g;
        };
        const leftTracks = tracks(GX), rightTracks = tracks(RX);
        // Every token of the pool, which may move into a compile's row.
        const owner = [];
        for (let j = 0; j < POOL; j++) {
          const n = before.findIndex((b, i) => j < b && j >= b - takes[i]);
          owner.push(n < 0 ? null : { n, slot: before[n] - 1 - j });
        }
        const poolDots = Array.from({ length: POOL }, (_, j) => s.circle(...poolAt(j), R, { kind: "go" }));
        // A token is held back for compiles yet to start until the compile that may take it is next.
        const freeFrom = (j) => Math.max(0, P - 1 - Math.floor(j / MIN));
        const rightDots = [];
        for (let n = 0; n < P; n++) for (let m = 0; m < N; m++) rightDots.push({ n, c: s.circle(...rowAt(RX, n, m), R, { kind: "bazel" }) });
        const booked = Array.from({ length: P }, (_, n) => s.rect(BX, ROW0 + n * PITCH - 10, 20, 20, { kind: "bazel", r: 3, fill: 0.5, width: 2 }));
        const LOW = ROW0 + (P - 1) * PITCH + 62;
        const atMost = s.text(GX, LOW, "together, at most the pool", { size: px(26), tone: "go" });
        const bookedName = s.text(BX + 20, LOW, "booked: one CPU each", { size: px(26), anchor: "end", tone: "bazel" });
        const each = s.text(RX, LOW + 44, "one per CPU, for every compile", { size: px(26), tone: "bazel" });
        return (t, cue) => {
          // Both sides are there from the start; rules_go's waits, faint, until it is named.
          show(header, 1);
          show(goPill, 1);
          show(leftTracks, 1);
          show(poolName, 1);
          show(bazelPill, mix(0.3, 1, during(t, cue[2] + 0.2, cue[2] + 0.8)));
          show(rightTracks, 1);
          const start = (n) => cue[1] + 1.4 + 0.42 * n;
          const shown = 1;
          const held = during(t, cue[1] + 0.4, cue[1] + 1.0);
          poolDots.forEach((dot, j) => {
            const o = owner[j];
            // Dimmed while held back: from the line's start until the compile before the one that may take it has started.
            const f = freeFrom(j);
            const freed = f === 0 ? 1 : during(t, start(f - 1) + 0.3, start(f - 1) + 0.6);
            let opacity = shown * mix(1, 0.28, held * (1 - freed));
            if (o) {
              const u = during(t, start(o.n), start(o.n) + 0.6);
              const [x0, y0] = poolAt(j), [x1, y1] = rowAt(GX, o.n, o.slot);
              place(dot, (x1 - x0) * u, (y1 - y0) * u);
              opacity = u > 0 ? 1 : opacity;
            } else place(dot, 0, 0);
            show(dot, opacity);
          });
          // rules_go: no pool, one worker per CPU in every compile.
          appear(noC, t, cue[2] + 0.8);
          rightDots.forEach(({ n, c }) => appear(c, t, cue[2] + 1.6 + 0.14 * n, 0.4));
          booked.forEach((b, n) => appear(b, t, cue[3] + 2.0 + 0.06 * n, 0.4));
          appear(bookedName, t, cue[3] + 3.0);
          appear(atMost, t, cue[4] + 2.4);
          appear(each, t, cue[4] + 3.4);
        };
      },
    },
    {
      section: "link: one process per binary",
      lines: [
        { say: "The linker's input is every package in the binary.", hold: 1.8 },
        { say: "A link reruns whenever any package in the binary changes.", hold: 0.8 },
        { say: `A body edit to \`core\`, the most widely imported package, relinked all ${word(BENCH.binaries)} applications under both tools.`, hold: 2.4 },
      ],
      draw(s) {
        // The repository of Appendix A as a grid: packages in layers, the standard library, a link per application.
        const k = s.fit(0, -24, 1000, 600);
        const px = sizes(k);
        const L = BENCH.layers, COLS = 14, APPS = BENCH.binaries;
        const GX = 130, CW = 40, CP = 55, GR = GX + (COLS - 1) * CP + CW;
        const rowY = (layer) => (layer === 0 ? 496 : 150 + (L - 1 - layer) * 30);
        const rand = seeded(5);
        const packages = [];
        for (let layer = L - 1; layer >= 0; layer--)
          for (let c = layer === 0 ? 3 : 0; c < COLS; c++) {
            const x = GX + c * CP, y = rowY(layer);
            packages.push({ layer, x: x + CW / 2, y, r: s.rect(x, y - 10, CW, 20, { r: 4, width: 2, fill: 0.08 }), mine: rand() < 0.7 });
          }
        const core = s.box(GX, rowY(0) - 24, 2 * CP + 4, 48, "core", { mono: true, size: px(32), r: 8 });
        const std = s.box(GX, 548, GR - GX, 44, "standard library", { size: px(32), r: 8 });
        // The standard library's packages, as points along its bar, for the reads.
        const stdPoints = Array.from({ length: 14 }, (_, i) => [GX + 30 + i * ((GR - GX - 60) / 13), 548]);
        const layerNames = [s.text(GR + 24, rowY(L - 1) + 9, `layer ${L - 1}`, { size: px(26), tone: "muted" }), s.text(GR + 24, rowY(0) + 9, "layer 0", { size: px(26), tone: "muted" })];
        const LW = 70, LP = (GR - GX - LW) / (APPS - 1);
        const links = Array.from({ length: APPS }, (_, i) => s.box(GX + i * LP, 32, LW, 50, ""));
        const linksName = s.text(GX, 6, "one link per application", { size: px(26), tone: "muted" });
        // Reads: one dot from each package of the first application's binary to its link.
        const sources = [...packages.filter((p) => p.mine).map((p) => [p.x, p.y]), [core.cx, core.y], ...stdPoints];
        const reads = sources.map(() => s.circle(0, 0, 5, { fill: 0.75 }));
        const edit = s.pill(GX - 64, rowY(0), "edit", { kind: "run", size: px(26) });
        const relinks = links.map(() => s.circle(0, 0, 10, { kind: "run" }));
        return (t, cue) => {
          show(linksName, 1);
          const grid = 1;
          // The first application's binary: its packages stand out while its link reads them.
          const focus = during(t, cue[0] + 0.6, cue[0] + 1.2) * (1 - during(t, cue[1] + 0.2, cue[1] + 0.8));
          packages.forEach((p) => show(p.r, grid * (p.mine ? 1 : mix(1, 0.25, focus))));
          show(core, grid);
          show(std, grid);
          layerNames.forEach((n) => show(n, grid));
          links.forEach((b, i) => {
            b.focus(i === 0 ? focus : 0);
            show(b, (i === 0 ? 1 : mix(1, 0.3, focus)));
          });
          const [lx, ly] = links[0].bottom;
          sources.forEach(([x, y], i) => {
            const a = cue[0] + 1.4 + (2.6 * i) / sources.length;
            const u = during(t, a, a + 0.9);
            place(reads[i], mix(x, lx, u), mix(y, ly + 6, u));
            show(reads[i], u > 0 && u < 1 ? 1 : 0);
          });
          // An edit to core: its new archive reaches every link, and every link reruns.
          appear(edit, t, cue[2] + 0.6);
          core.mark("run", during(t, cue[2] + 1.2, cue[2] + 1.8));
          links.forEach((b, i) => {
            const a = cue[2] + 2.6 + 0.12 * i;
            const u = during(t, a, a + 1.2);
            place(relinks[i], mix(core.cx, b.cx, u), mix(core.y, b.y + b.h + 4, u));
            show(relinks[i], u > 0 && u < 1 ? 1 : 0);
            b.mark("run", during(t, a + 1.1, a + 1.5));
          });
        };
      },
    },
    {
      section: "link: one process per binary",
      lines: [
        { say: "Test binaries, linked without debug information, show how a link grows: the more packages it links, the more memory and time it takes.", hold: 1.2 },
        { say: `The links of the go build's applications needed ${word(BENCH.linkMemory)} times a compile's memory.`, hold: 1.2 },
      ],
      draw(s) {
        // Three test binaries, linking few, more and many packages: the link's memory and time grow with them.
        // A schematic, not data: no axes and no values; only the order and the ratio are the chapter's.
        const k = s.fit(0, 0, 1030, 640);
        const px = sizes(k);
        const CX = [330, 610, 890], BAR = 220;
        const counts = [3, 10, 24], memory = [0.3, 0.6, 1], time = [0.25, 0.55, 1];
        const names = ["few packages", "more packages", "many packages"].map((n, i) => s.text(CX[i], 26, n, { size: px(26), anchor: "middle", tone: "muted" }));
        const columns = CX.map((cx, i) => {
          const rows = Math.ceil(counts[i] / 6);
          const across = (j) => Math.min(6, counts[i] - Math.floor(j / 6) * 6); // boxes in j's row, centred on the column
          const packs = Array.from({ length: counts[i] }, (_, j) => s.rect(cx - (across(j) * 36 - 8) / 2 + (j % 6) * 36, 160 - (rows - Math.floor(j / 6)) * 26 + 8, 28, 18, { r: 4, width: 2, fill: 0.08 }));
          const link = s.box(cx - 90, 214, 180, 64, "link", { size: px(32) });
          const into = s.edge([cx, 170], link, { to: "top", width: 2 });
          const tracks = [350, 410].map((y) => s.rect(cx - BAR / 2, y, BAR, 28, { r: 4, fill: 0.06, stroke: false }));
          const bars = [350, 410].map((y) => s.rect(cx - BAR / 2, y, 1, 28, { r: 4, fill: 0.5, stroke: false }));
          return { packs, link, into, tracks, bars };
        });
        const rowNames = [s.text(0, 373, "peak memory", { size: px(26) }), s.text(0, 433, "wall time", { size: px(26) })];
        // A compile's memory against an application's link.
        const L = 760, X0 = CX[0] - BAR / 2;
        const rule = s.line(0, 472, 1030, 472, { width: 2, opacity: 0.2 });
        const compileName = s.text(0, 553, "a compile", { size: px(26) });
        const linkName = s.text(0, 613, "a `go build` link", { size: px(26) });
        const compileBar = s.rect(X0, 530, 1, 28, { r: 4, fill: 0.5, stroke: false });
        const linkBar = s.rect(X0, 590, 1, 28, { r: 4, fill: 0.5, stroke: false });
        const memoryName = s.text(0, 512, "peak memory", { size: px(26), tone: "muted" });
        return (t, cue) => {
          // The three links and their packages are there from the start.
          names.forEach((n) => show(n, 1));
          columns.forEach((c, i) => {
            c.packs.forEach((p) => show(p, 1));
            show(c.link, 1);
            c.into.trace(1);
            c.tracks.forEach((r) => show(r, 1));
            // More packages, more memory and more time.
            const a = cue[0] + 5.2 + 1.2 * i;
            c.bars[0].setAttribute("width", Math.max(1, BAR * memory[i] * during(t, a, a + 1.2)).toFixed(1));
            c.bars[1].setAttribute("width", Math.max(1, BAR * time[i] * during(t, a + 0.6, a + 1.8)).toFixed(1));
            c.bars.forEach((r) => show(r, t > a ? 1 : 0));
            c.link.focus(during(t, a, a + 0.4) * (1 - during(t, a + 1.8, a + 2.2)));
          });
          rowNames.forEach((n) => show(n, 1));
          appear(rule, t, cue[1] + 0.4);
          appear(memoryName, t, cue[1] + 0.4);
          appear(compileName, t, cue[1] + 2.4);
          appear(linkName, t, cue[1] + 0.8);
          linkBar.setAttribute("width", Math.max(1, L * during(t, cue[1] + 0.8, cue[1] + 2.0)).toFixed(1));
          compileBar.setAttribute("width", Math.max(1, (L / BENCH.linkMemory) * during(t, cue[1] + 2.4, cue[1] + 3.0)).toFixed(1));
          show(linkBar, t > cue[1] + 0.8 ? 1 : 0);
          show(compileBar, t > cue[1] + 2.4 ? 1 : 0);
        };
      },
    },
    {
      section: "Test binaries: a link plus a run",
      lines: [
        { say: "Each package's tests are compiled, linked into a binary of their own and run.", hold: 0.6 },
        { say: "Our tests do little: a run used milliseconds of CPU, yet took seconds.", hold: 2.6 },
        { say: "The first runs to finish each took a little longer than the one before, as if waiting in one queue outside the processes.", hold: 1.2 },
        { say: "macOS checks an app for known malware on its first launch; we infer that this check, made on each new test binary in turn, is the queue.", hold: 1 },
        { say: "We expect Linux machines not to pay it.", hold: 1 },
      ],
      draw(s) {
        const B = [0, 0, 860, 724];
        const k = s.fit(...B);
        const px = sizes(k);
        // A package's tests: compiled, linked without debug information, run.
        const pipe = s.group();
        const compile = pipe.box(0, 0, 190, 96, "compile", { size: px(32) });
        const link = pipe.box(280, 0, 300, 96, "link", { size: px(32), sub: "no debug information" });
        const run = pipe.box(670, 0, 190, 96, "run", { size: px(32), sub: "test binary" });
        const e1 = pipe.edge(compile, link), e2 = pipe.edge(link, run);
        // The runs at once, over time: each waits, then runs for a sliver.
        const N = BENCH.cores, Y0 = 232, PITCH = 24, X1 = 820;
        const end = (i) => 110 + ((i + 1) * (X1 - 110)) / N;
        const hatch = s.hatch();
        const lanes = s.group();
        const runsName = lanes.text(0, Y0 - 34, "test runs at once", { size: px(26), tone: "muted" });
        const tracks = Array.from({ length: N }, (_, i) => lanes.rect(0, Y0 + i * PITCH - 8, 860, 16, { r: 4, fill: 0.05, stroke: false }));
        const waits = Array.from({ length: N }, (_, i) => {
          const r = lanes.rect(0, Y0 + i * PITCH - 8, end(i), 16, { r: 3, width: 1.5 });
          r.setAttribute("fill", hatch);
          r.setAttribute("stroke-opacity", 0.5);
          return r;
        });
        const slivers = Array.from({ length: N }, (_, i) => lanes.rect(end(i), Y0 + i * PITCH - 8, 10, 16, { kind: "run", r: 2, fill: 0.9, width: 1.5 }));
        const axisY = Y0 + N * PITCH + 6;
        const axis = lanes.edge([0, axisY], [860, axisY], { width: 2 });
        const time = lanes.text(860, axisY + 40, "time", { size: px(26), anchor: "end", tone: "muted" });
        const key = lanes.group();
        key.rect(0, axisY + 22, 44, 24, { kind: "run", r: 4, fill: 0.9, width: 1.5 });
        key.text(58, axisY + 42, "CPU time", { size: px(26) });
        const kx = 58 + measure("CPU time", { size: px(26) }) + 44;
        const swatch = key.rect(kx, axisY + 22, 44, 24, { r: 4, width: 1.5 });
        swatch.setAttribute("fill", hatch);
        key.text(kx + 58, axisY + 42, "the rest of the run", { size: px(26) });
        // One queue: the runs end one after another.
        const queue = lanes.line(end(0) + 5, Y0, end(N - 1) + 5, Y0 + (N - 1) * PITCH, { width: 3, opacity: 0.7 });
        const mid = Math.floor(N / 2);
        const queueName = lanes.text(end(mid) + 40, Y0 + mid * PITCH - 30, "one queue", { size: px(26), weight: 600 });
        const check = lanes.pill(end(N - 1) - 150, Y0 + 2 * PITCH, "macOS malware check", { size: px(26) });
        const turn = lanes.circle(0, 0, 13, { fill: 0, stroke: true, width: 3 });
        // The pipeline stands alone in the middle, then moves up.
        const alone = (B[3] - 96) / 2;
        return (t, cue) => {
          show(compile, 1);
          e1.trace(during(t, cue[0] + 1.0, cue[0] + 1.6));
          show(link, 1);
          e2.trace(during(t, cue[0] + 2.4, cue[0] + 3.0));
          show(run, 1);
          place(pipe, 0, alone * (1 - during(t, cue[1], cue[1] + 0.8)));
          appear(runsName, t, cue[1] + 0.8);
          tracks.forEach((r) => appear(r, t, cue[1] + 0.8));
          appear(axis, t, cue[1] + 0.8);
          appear(time, t, cue[1] + 0.8);
          // Time passes: each run waits until its turn, then runs.
          const now = track(t, [[cue[1] + 1.4, 0], [cue[1] + 7.4, 860]]);
          waits.forEach((r, i) => {
            r.setAttribute("width", Math.max(0.01, Math.min(now, end(i))).toFixed(1));
            show(r, now > 0 ? 1 : 0);
          });
          slivers.forEach((r, i) => show(r, clamp((now - end(i)) / 10)));
          appear(key, t, cue[1] + 3.0);
          // As if one queue.
          appear(queue, t, cue[2] + 2.0);
          appear(queueName, t, cue[2] + 6.4);
          // The check, made on each new binary in turn.
          const step = track(t, [[cue[3] + 3.0, 0], [cue[3] + 10.0, N - 1]]);
          const i = Math.floor(step), u = step - i;
          const j = Math.min(N - 1, i + 1);
          place(turn, mix(end(i), end(j), u) + 5, mix(Y0 + i * PITCH, Y0 + j * PITCH, u));
          const checking = during(t, cue[3] + 2.4, cue[3] + 3.0) * (1 - during(t, cue[4] - 0.2, cue[4] + 0.4));
          show(check, checking);
          show(turn, checking);
          show(queueName, during(t, cue[2] + 6.4, cue[2] + 7.0) * (1 - during(t, cue[3] + 2.0, cue[3] + 2.6) + during(t, cue[4], cue[4] + 0.6)));
        };
      },
    },
    {
      section: "The shape of a build",
      lines: [
        { say: "The critical path is the longest chain of actions that each wait for the one before.", hold: 2.6 },
        { say: `In the cold go build, it runs from the standard library through one package in each of the ${BENCH.layers} layers and a main package to a link.`, hold: 1.4 },
        { say: "We read the gaps in the bar as waits while work off the path held all the go command's action slots.", hold: 1.6 },
        { say: "A build can finish no faster than this chain, nor than its total CPU work divided by the cores.", hold: 1.2 },
      ],
      draw(s) {
        // Figure 5.3 as a schematic: a burst of the standard library, the runtime's compile almost alone,
        // the repository's layers at -p, then the links; the critical path beneath.
        const k = s.fit(-10, 0, 1150, 520, 0.85);
        const px = sizes(k);
        const { work, path, span, std, link } = BENCH.build;
        const Pn = BENCH.cores;
        const CX0 = 250, CW = 860, CY0 = 60, CH = 240;
        const X = (sec) => CX0 + (sec / span) * CW, Y = (n) => CY0 + CH - (n / Pn) * CH;
        const tail = 0.05 * span, linkEnd = span - tail, linkStart = linkEnd - link;
        // [second, actions running from then on]: illustrative, not traced.
        const steps = [[0, Pn], [0.04 * std, 0.55 * Pn], [0.08 * std, 0.25 * Pn], [0.13 * std, 1], [0.66 * std, 3], [0.76 * std, 4], [0.86 * std, 2], [0.95 * std, 1], [std, Pn], [linkStart + 0.3, 0.8 * Pn], [linkStart + 0.5, 0.65 * Pn], [linkEnd - 0.1, 0.5 * Pn], [linkEnd + 0.1, 0.3 * Pn], [linkEnd + 0.22, 0.15 * Pn], [span, 0]];
        // The whole build, faint from the start; the cursor draws it in as it runs.
        const ghost = svg("path", { fill: SHAPE.go, "fill-opacity": 0.05, stroke: SHAPE.go, "stroke-opacity": 0.3, "stroke-width": 2, "stroke-linejoin": "round" }, s.g);
        const area = svg("path", { fill: SHAPE.go, "fill-opacity": 0.16, stroke: SHAPE.go, "stroke-width": 2.5, "stroke-linejoin": "round" }, s.g);
        const shape = (until) => {
          let d = `M${X(0)},${Y(0)}`;
          for (let i = 0; i < steps.length - 1 && steps[i][0] < until; i++) {
            const next = Math.min(steps[i + 1][0], until);
            d += ` V${Y(steps[i][1]).toFixed(1)} H${X(next).toFixed(1)}`;
          }
          return `${d} V${Y(0)} Z`;
        };
        ghost.setAttribute("d", shape(span));
        const base = s.line(CX0, Y(0), X(span) + 20, Y(0), { width: 2, opacity: 0.6 });
        const pLine = s.line(CX0, Y(Pn), X(span), Y(Pn), { width: 2, opacity: 0.4 });
        const pName = s.text(X(span) + 14, Y(Pn) + 9, "`-p`", { size: px(26), tone: "muted" });
        const running = s.text(CX0, CY0 - 30, "actions running", { size: px(26), tone: "muted" });
        // The critical path: the standard library, one package per layer and the main package, the link.
        const segs = BENCH.layers + 1;
        const one = (path - std - link) / segs;
        const weights = [3, 1, 0.6, 1.5, 0.4, 0.8, 0.3, 0.5, 5, 0.6, 0.3, 0.9, 0.4, 0.5];
        const room = linkStart - std - segs * one;
        const total = weights.reduce((a, b) => a + b, 0);
        const parts = [[0, std]];
        const gaps = [];
        let at = std;
        for (let i = 0; i < segs; i++) {
          const g = (room * weights[i]) / total;
          gaps.push([at, at + g]);
          at += g;
          parts.push([at, at + one]);
          at += one;
        }
        gaps.push([at, linkStart]);
        parts.push([linkStart, linkEnd]);
        const PY = 352, BY = 470;
        const pathName = s.text(CX0 - 24, PY + 22, "critical path", { size: px(26), anchor: "end" });
        const bars = parts.map(([a, b]) => s.rect(X(a), PY, X(b) - X(a), 30, { r: 3, fill: 0.55, stroke: false }));
        const shifts = parts.map((_, i) => gaps.slice(0, i).reduce((sum, [a, b]) => sum + (b - a), 0));
        const labels = [
          s.text(X(0), PY + 70, "standard library", { size: px(26), tone: "muted" }),
          s.text(X((std + linkStart) / 2), PY + 70, "one package per layer, then main", { size: px(26), anchor: "middle", tone: "muted" }),
          s.text(X((linkStart + linkEnd) / 2), PY + 70, "link", { size: px(26), anchor: "middle", tone: "muted" }),
        ];
        const shades = gaps.map(([a, b]) => s.rect(X(a), CY0 - 6, X(b) - X(a), PY + 36 - CY0, { r: 2, fill: 0.08, stroke: false }));
        const cursor = s.line(0, CY0 - 6, 0, PY + 36, { width: 3, opacity: 0.7 });
        // The bounds: the chain's own length and the work over the cores, against the build's end.
        const workName = s.text(CX0 - 24, BY + 22, "CPU work ÷ cores", { size: px(26), anchor: "end" });
        const workBar = s.rect(X(0), BY, X(work) - X(0), 30, { r: 3, width: 2 });
        workBar.setAttribute("fill", s.hatch());
        const endLine = s.line(X(span), CY0 - 6, X(span), BY + 40, { width: 3, opacity: 0.6 });
        const endName = s.text(X(span), BY + 76, "the build ends", { size: px(26), anchor: "end", tone: "muted" });
        return (t, cue) => {
          show(ghost, 1);
          show(base, 1);
          show(running, 1);
          show(pLine, 1);
          show(pName, 1);
          show(pathName, 1);
          // The build runs: actions above, the critical path beneath.
          const now = track(t, [[cue[0] + 0.6, 0], [cue[0] + 8.4, span]]);
          area.setAttribute("d", shape(now));
          place(cursor, X(now), 0);
          show(cursor, during(t, cue[0] + 0.3, cue[0] + 0.6) * (1 - during(t, cue[0] + 8.6, cue[0] + 9.2)));
          const squeeze = during(t, cue[3] + 1.0, cue[3] + 2.4);
          bars.forEach((r, i) => {
            const [a, b] = parts[i];
            const w = Math.max(0, Math.min(now, b) - a);
            r.setAttribute("width", ((w / span) * CW).toFixed(1));
            show(r, now > a ? 1 : 0);
            place(r, -(shifts[i] / span) * CW * squeeze, 0);
          });
          // What the path passes through.
          labels.forEach((l, i) => show(l, during(t, cue[1] + 1.6 + 2.4 * i, cue[1] + 2.2 + 2.4 * i) * (1 - squeeze)));
          // The gaps: the go command's slots all held by work off the path.
          shades.forEach((r) => show(r, during(t, cue[2] + 1.2, cue[2] + 1.8) * (1 - during(t, cue[3], cue[3] + 0.6))));
          // The bounds.
          appear(workName, t, cue[3] + 4.0);
          appear(workBar, t, cue[3] + 4.0);
          appear(endLine, t, cue[3] + 2.4);
          appear(endName, t, cue[3] + 2.4);
        };
      },
    },
    {
      section: "Four workload classes",
      lines: [
        { say: "Compile: many short, CPU-bound processes with a serial front end." },
        { say: "Link: one process per binary, mostly on one core, growing with the packages it links." },
        { say: "Test: a link and a run whose length the test decides, plus, on macOS, a wait before launch." },
        { say: "Bazel server: one Java virtual machine per workspace that holds the graph in memory." },
        { say: "In our view, each wants a different machine.", hold: 2.6 },
      ],
      draw(s) {
        // Figure 5.4's four cards, in fewer words, large enough for a phone.
        const W0 = 540, H0 = 210, GAP = 30;
        const k = s.fit(0, 0, 2 * W0 + GAP, 2 * H0 + GAP, 0.85);
        const px = sizes(k);
        const cards = [
          ["compile", "one per package, CPU-bound", "many cores"],
          ["link", "one per binary, grows with it", "memory and a fast core"],
          ["test", "a link, then a run", "isolation and a time limit"],
          ["Bazel server", "one JVM per workspace", "memory, kept warm"],
        ];
        const S = px(30);
        const built = cards.map(([name, what, wants], i) => {
          const x = (i % 2) * (W0 + GAP), y = Math.floor(i / 2) * (H0 + GAP);
          const server = i === 3;
          const g = s.group();
          const card = g.rect(x, y, W0, H0, { r: 12, width: 2, kind: server ? "bazel" : null, fill: server ? 0.12 : null });
          if (!server) card.setAttribute("stroke-opacity", 0.6);
          g.text(x + 28, y + 58, name, { size: px(38), weight: 600, tone: server ? "bazel" : "ink" });
          g.text(x + 28, y + 112, what, { size: S });
          // What it wants, in our view.
          const want = s.group();
          want.line(x + 28, y + 138, x + W0 - 28, y + 138, { width: 2, opacity: 0.2 });
          want.text(x + 28, y + 184, "wants", { size: S, tone: "muted" });
          want.text(x + 28 + measure("wants ", { size: S }) + 6, y + 184, wants, { size: S, weight: 600 });
          return { g, want };
        });
        return (t, cue) => {
          built.forEach(({ g, want }, i) => {
            // All four from the start, faint; each comes up when its line names it.
            show(g, 0.3 + 0.7 * (i === 0 ? 1 : during(t, cue[i] + 0.2, cue[i] + 0.8)));
            appear(want, t, cue[4] + 1.0 + 0.7 * i);
          });
        };
      },
    },
  ],
};
