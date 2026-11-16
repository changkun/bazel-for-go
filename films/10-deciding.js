// Chapter 10's film: how far the go command goes with a shared GOCACHEPROG
// store, what such a store leaves unchanged, where Bazel pays for itself and
// what it costs, the book's map of where each tool fits (Figure 10.1), and
// the migration path (Figure 10.2). Every sentence comes from the chapter;
// what is the book's view is said to be.

import { SHAPE, during, measure, mix, place, ramp, show, svg } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// How far one label has given way to the next at second a: out first, then in, never on top of each other.
const swap = (t, a) => [1 - during(t, a, a + 0.3), during(t, a + 0.3, a + 0.6)];
// A path drawn with pathLength 1, so that trace(path, u) draws part u of it.
function stroke(g, d, { kind = null, width = 2.5, opacity = 0.45 } = {}) {
  return svg("path", { d, pathLength: 1, fill: "none", stroke: kind ? SHAPE[kind] : "currentColor", "stroke-opacity": kind ? 1 : opacity, "stroke-width": width, "stroke-linecap": "round" }, g.g);
}
function trace(path, u) {
  path.setAttribute("stroke-dasharray", u >= 1 ? "none" : `${u.toFixed(4)} 1`);
  path.setAttribute("opacity", u > 0 ? 1 : 0);
}
// Trace an edge to part u, hidden until it starts (a dash of length 0 still draws a dot), at most at strength.
const drawn = (edge, u, strength = 1) => show(edge.trace(u), u > 0 ? strength : 0);
// A panel: the outline of one machine.
const panel = (g, x, y, w, h) => {
  const r = g.rect(x, y, w, h, { r: 16, width: 2 });
  r.setAttribute("stroke-opacity", 0.35);
  return r;
};

export default {
  chapter: "10",
  title: "Deciding",
  scenes: [
    {
      section: "Where each tool fits",
      lines: [
        { say: "The go command already splits a build into actions, keys each by an action ID, and keeps the outputs in GOCACHE, a per-user cache on disk.", hold: 0.6 },
        { say: "Since Go 1.24, `GOCACHEPROG` replaces that cache with an external program that speaks a JSON protocol.", hold: 0.8 },
        { say: "A program the team supplies can keep entries in a store shared by every continuous integration (CI) machine.", hold: 0.6 },
      ],
      draw(s) {
        s.fit(0, 0, 960, 540, 0.82);
        // The fleet's panels, under everything; machine 1's boxes move into the first.
        const tops = [0, 190, 380];
        const fleet = tops.map((top, i) => {
          const g = s.group();
          panel(g, 0, top, 600, 160);
          g.text(24, top + 34, `CI machine ${i + 1}`, { size: 26, tone: "muted" });
          return g;
        });
        // One machine, in detail.
        const one = s.group();
        panel(one, 0, 50, 960, 440);
        one.text(28, 92, "one machine", { size: 26, tone: "muted" });
        const actions = ["a", "b", "c"].map((p, i) => s.box(350, 110 + 112 * i, 240, 96, `compile ${p}`, { sub: ["3f2a…", "9d04…", "b71c…"][i], subMono: true }));
        const go = s.box(40, 230, 230, 80, "go command", { kind: "go" });
        const split = actions.map((a) => s.edge(go, a));
        const cache = s.cache(820, 270, { w: 220, h: 170, label: "GOCACHE" });
        const disk = s.text(820, 402, "per-user, on disk", { size: 26, anchor: "middle", tone: "muted" });
        const keep = actions.map((a) => s.edge(a, cache));
        const program = s.box(710, 222, 220, 96, "program", { sub: "GOCACHEPROG", subMono: true });
        const json = s.text(820, 358, "JSON protocol", { size: 26, anchor: "middle", tone: "muted" });
        // The fleet: each machine's go command and program, and the shared store.
        const store = s.cache(840, 270, { w: 230, h: 180, label: "shared store", kind: "remote" });
        const others = [1, 2].map((i) => {
          const g = fleet[i];
          const a = g.box(24, tops[i] + 58, 230, 80, "go command", { kind: "go" });
          const b = g.box(350, tops[i] + 50, 220, 96, "program", { sub: "GOCACHEPROG", subMono: true });
          g.edge(a, b);
          return g;
        });
        const first = s.edge([260, 98], [344, 98]);
        const shared = tops.map((top) => s.edge([576, top + 98], store, { to: "left", kind: "remote" }));
        return (t, cue) => {
          const [c0, c1, c2] = cue;
          // The go command splits a build into actions, keyed by action IDs, kept in GOCACHE.
          const gone = during(t, c2 + 0.2, c2 + 0.8);
          show(one, during(t, 0.4, 1.2) * (1 - gone));
          appear(go, t, 0.8);
          actions.forEach((a, i) => {
            show(a, during(t, c0 + 2.4 + 0.25 * i, c0 + 3.0 + 0.25 * i) * (1 - gone));
            show(a.labels[1], during(t, c0 + 5.0 + 0.3 * i, c0 + 5.6 + 0.3 * i) * 0.66);
          });
          split.forEach((e, i) => drawn(e, during(t, c0 + 2.6 + 0.25 * i, c0 + 3.4 + 0.25 * i), 1 - gone));
          keep.forEach((e, i) => drawn(e, during(t, c0 + 7.8 + 0.2 * i, c0 + 8.6 + 0.2 * i), 1 - gone));
          // GOCACHEPROG replaces the cache with a program that speaks JSON.
          const [out, into] = swap(t, c1 + 2.2);
          show(cache, during(t, c0 + 7.4, c0 + 8.0) * out);
          show(disk, during(t, c0 + 9.2, c0 + 9.8) * out);
          show(program, into);
          show(json, during(t, c1 + 5.0, c1 + 5.6) * (1 - gone));
          // Machine 1's go command and program move into its place in the fleet.
          const move = during(t, c2 + 0.8, c2 + 2.0);
          place(go, mix(0, -16, move), mix(0, -172, move));
          place(program, mix(0, -360, move), mix(0, -172, move));
          appear(fleet[0], t, c2 + 1.6);
          drawn(first, during(t, c2 + 2.0, c2 + 2.6));
          // A store shared by every CI machine.
          appear(store, t, c2 + 1.8);
          others.forEach((g, i) => appear(g, t, c2 + 2.2 + 0.3 * i));
          shared.forEach((e, i) => {
            const a = i === 0 ? c2 + 3.0 : c2 + 4.4 + 0.2 * i;
            drawn(e, during(t, a, a + 0.8));
            e.pulse(ramp(t, a + 0.9, a + 1.7), "remote");
          });
        };
      },
    },
    {
      section: "Where each tool fits",
      lines: [
        "A shared store helps only when action IDs match.",
        "An action ID covers the compiler's version, the flags, the target platform and the contents of every input.",
        { say: "Unless `-trimpath` removes file system paths from the output, it also covers the package's directory.", hold: 1.8 },
        { say: "A cgo package, Go code that calls C, adds the C compiler's command, flags and version.", hold: 0.6 },
      ],
      draw(s) {
        s.fit(-10, 0, 1080, 790, 0.84);
        const heads = ["CI machine 1", "CI machine 2"].map((name, i) => s.text(180 + 380 * i, 30, name, { size: 26, anchor: "middle", tone: "muted" }));
        // The inputs, as rows: one row where both machines agree, two cells where they differ.
        const common = s.group();
        const rows = ["compiler's version", "flags", "target platform", "contents of every input"].map((name, i) => common.file(0, 50 + 74 * i, 740, 60, name, { mono: false }));
        const dir = s.group();
        const cells = ["/ci/run-41/src/core", "/ci/run-42/src/core"].map((path, i) => dir.file(380 * i, 346, 360, 96, "package directory", { mono: false, sub: path, subMono: true }));
        const strike = dir.line(-6, 384, 746, 384, { width: 3, opacity: 0.85 });
        const trim = dir.pill(880, 394, "-trimpath", { mono: true });
        const cgo = s.file(0, 456, 740, 60, "C compiler's command, flags and version", { mono: false });
        // Each machine's action ID, and the store one writes and the other reads.
        const ids = [0, 1].map((i) => s.box(60 + 380 * i, 596, 240, 96, "action ID", { sub: " " }));
        const down = ids.map((id, i) => s.edge([180 + 380 * i, 524], id, { to: "top" }));
        const hash = (i, value) => s.text(180 + 380 * i, 680, value, { size: 26, mono: true, anchor: "middle", tone: "muted" });
        const differ = [hash(0, "5e8d…"), hash(1, "b71c…")];
        const match = [hash(0, "9d04…"), hash(1, "9d04…")];
        const cgoMatch = [hash(0, "c4e1…"), hash(1, "c4e1…")];
        const unequal = s.text(370, 660, "≠", { size: 44, anchor: "middle", tone: "run" });
        const equal = s.text(370, 660, "=", { size: 44, anchor: "middle" });
        const store = s.cache(960, 644, { w: 230, h: 150, label: "shared store", kind: "remote" });
        const write = s.edge(ids[0], store, { from: "bottom", to: "bottom", kind: "remote" });
        const read = s.edge(ids[1], store);
        const writes = s.text(570, 784, "writes", { size: 26, anchor: "middle", tone: "muted" });
        const reads = s.text(762, 628, "looks up", { size: 26, anchor: "middle", tone: "muted" });
        const miss = s.pill(960, 532, "miss", { kind: "run" });
        const hit = s.pill(960, 532, "hit", { kind: "hit" });
        return (t, cue) => {
          const [c0, c1, c2, c3] = cue;
          // Two machines' action IDs, and the store between them.
          heads.forEach((h, i) => appear(h, t, c0 + 0.2 + 0.2 * i));
          ids.forEach((id, i) => appear(id, t, c0 + 0.4 + 0.2 * i));
          appear(store, t, c0 + 1.2);
          drawn(write, during(t, c0 + 1.6, c0 + 2.4));
          appear(writes, t, c0 + 2.0);
          drawn(read, during(t, c0 + 2.4, c0 + 3.2));
          appear(reads, t, c0 + 2.8);
          // What an action ID covers; rows rise to make room for each new one.
          rows.forEach((r, i) => appear(r, t, c1 + [2.4, 3.4, 4.4, 5.8][i]));
          down.forEach((e) => drawn(e, during(t, c1 + 6.2, c1 + 7.0)));
          const dirIn = during(t, c2 + 0.4, c2 + 1.2);
          const cgoIn = during(t, c3 + 3.0, c3 + 3.8);
          place(common, 0, 110 * (1 - dirIn) + 74 * (1 - cgoIn));
          place(dir, 0, 74 * (1 - cgoIn));
          // With the directory, the two IDs differ: a miss.
          const trimmed = during(t, c2 + 5.0, c2 + 5.6);
          cells.forEach((c, i) => {
            show(c, during(t, c2 + 1.0 + 0.2 * i, c2 + 1.6 + 0.2 * i) * mix(1, 0.3, trimmed));
            c.mark("run", during(t, c2 + 2.0, c2 + 2.6) * (1 - trimmed));
          });
          const [goneD, inT] = swap(t, c2 + 5.2);
          const [goneT, inC] = swap(t, c3 + 5.0);
          differ.forEach((h) => show(h, during(t, c2 + 1.8, c2 + 2.4) * goneD));
          match.forEach((h) => show(h, inT * goneT));
          cgoMatch.forEach((h) => show(h, inC));
          show(unequal, during(t, c2 + 2.2, c2 + 2.8) * goneD);
          show(equal, inT);
          write.pulse(t < c2 + 4.5 ? ramp(t, c2 + 2.6, c2 + 3.2) : ramp(t, c2 + 6.0, c2 + 6.6), "remote");
          read.pulse(t < c2 + 4.5 ? ramp(t, c2 + 3.2, c2 + 3.8) : ramp(t, c2 + 6.6, c2 + 7.2), "remote");
          const missed = during(t, c2 + 3.8, c2 + 4.3) * (1 - during(t, c2 + 6.2, c2 + 6.5));
          const found = during(t, c2 + 7.2, c2 + 7.7);
          read.mark("run", missed);
          read.mark("hit", found);
          show(miss, missed);
          show(hit, found);
          // -trimpath leaves the directory out: the IDs match, a hit.
          appear(trim, t, c2 + 4.4);
          show(strike, trimmed);
          // cgo adds the C compiler.
          appear(cgo, t, c3 + 3.6);
        };
      },
    },
    {
      section: "Where each tool fits",
      lines: [
        "Every command still loads its packages and hashes their source files again, so its cost grows with the tree.",
        "Binaries are not stored: a machine without the previous output links every binary again.",
        "A test result is reused only if each file the test opened in its module has the same absolute path, size and modification time.",
        "We expect a fresh checkout to rerun every test that reads files.",
        "Each hit arrives as a local file, so every machine downloads what it uses.",
        "`go generate` and other non-Go steps stay outside the graph, and every action runs on the machine that started the command.",
        { say: "For a CI fleet whose time goes to compiling, we recommend `-trimpath`, one Go version and a shared store first, written only by CI.", hold: 0.6 },
      ],
      draw(s) {
        s.fit(0, 0, 1110, 720, 0.85);
        const outline = panel(s, 0, 0, 790, 720);
        const label = s.text(24, 40, "CI machine, fresh checkout", { size: 26, tone: "muted" });
        // The source tree, and the work every command does on it.
        const files = Array.from({ length: 16 }, (_, i) => s.file(40 + 45 * i, 62, 32, 42, ""));
        const load = s.box(40, 128, 710, 76, "load packages, hash sources");
        // The action graph: compiles hit the shared store; link and test run.
        const fence = s.rect(20, 232, 750, 352, { r: 12, width: 2, dash: "10 8" });
        const graph = s.text(40, 268, "action graph", { size: 26, tone: "muted" });
        const compiles = ["a", "b", "c"].map((p, i) => s.box(40 + 245 * i, 288, 220, 72, `compile ${p}`));
        const link = s.box(40, 392, 220, 72, "link");
        const test = s.box(285, 392, 220, 72, "test");
        const opened = s.file(540, 392, 220, 72, "opened file", { mono: false });
        const reads = s.edge(opened, test, { from: "left", to: "right" });
        const names = ["path", "size", "modification time"];
        const widths = names.map((n) => measure(n, { size: 26 }) + 36);
        let x = 522 - (widths.reduce((a, b) => a + b) + 24) / 2;
        const pills = names.map((n, i) => {
          const cx = x + widths[i] / 2;
          x += widths[i] + 12;
          return s.pill(cx, 512, n);
        });
        const generate = s.box(40, 616, 260, 72, "go generate", { mono: true });
        // The shared store, and what it sends back.
        const store = s.cache(1000, 324, { w: 220, h: 170, label: "shared store", kind: "remote" });
        const download = s.edge(store, compiles[2], { from: "left", to: "right", kind: "remote" });
        const advice = [s.pill(1000, 470, "-trimpath", { mono: true }), s.pill(1000, 530, "one Go version")];
        const key = [s.legend(902, 652, [["run", "runs"]]), s.legend(902, 702, [["hit", "cache hit"]])];
        return (t, cue) => {
          const [c0, c1, c2, c3, c4, c5, c6] = cue;
          appear(outline, t, 0.1);
          appear(label, t, 0.2);
          appear(store, t, 0.3);
          appear(fence, t, 0.4);
          appear(graph, t, 0.4);
          compiles.forEach((b, i) => {
            appear(b, t, 0.5 + 0.15 * i);
            b.mark("hit", 1);
            // A downloaded hit lands on the machine; compiles stand out when the advice comes.
            const landed = during(t, c4 + 2.2 + i, c4 + 2.5 + i) * (1 - during(t, c4 + 2.7 + i, c4 + 3.1 + i));
            b.focus(Math.max(landed, during(t, c6 + 2.0, c6 + 2.6)));
          });
          appear(link, t, 0.8);
          appear(test, t, 0.9);
          key.forEach((k, i) => appear(k, t, 1.0 + 0.2 * i));
          // Every command loads and hashes again; the tree grows, and so does the work.
          files.forEach((f, i) => {
            const grown = i >= 10;
            appear(f, t, grown ? c0 + 6.4 + 0.12 * (i - 10) : c0 + 0.8 + 0.1 * i, 0.4);
            f.mark("run", during(t, grown ? c0 + 7.6 + 0.12 * (i - 10) : c0 + 3.6 + 0.15 * i, (grown ? c0 + 7.9 + 0.12 * (i - 10) : c0 + 3.9 + 0.15 * i)));
          });
          appear(load, t, c0 + 1.6);
          load.mark("run", during(t, c0 + 2.4, c0 + 3.0));
          // Binaries are not stored: every link runs.
          link.mark("run", during(t, c1 + 4.0, c1 + 4.6));
          // A test result needs each opened file's path, size and modification time to match.
          appear(opened, t, c2 + 3.6);
          drawn(reads, during(t, c2 + 4.2, c2 + 4.8));
          pills.forEach((p, i) => appear(p, t, c2 + 5.6 + 0.6 * i));
          test.mark("run", during(t, c3 + 3.0, c3 + 3.6));
          // Every hit is downloaded as a local file.
          drawn(download, during(t, c4 + 0.6, c4 + 1.2));
          download.pulse([0, 1, 2].reduce((u, i) => u + ramp(t, c4 + 1.4 + i, c4 + 2.2 + i), 0) % 1, "remote");
          // go generate stays outside the graph; every action runs on this machine.
          appear(generate, t, c5 + 0.6);
          const local = during(t, c5 + 6.0, c5 + 6.6) * (1 - during(t, c6, c6 + 0.6));
          outline.setAttribute("stroke-width", mix(2, 5, local).toFixed(2));
          outline.setAttribute("stroke-opacity", mix(0.35, 0.9, local).toFixed(3));
          // The advice for a fleet whose time goes to compiling.
          appear(advice[0], t, c6 + 4.6);
          appear(advice[1], t, c6 + 5.8);
        };
      },
    },
    {
      section: "Where each tool fits",
      lines: [
        "In our view, Bazel pays when many machines build the same code and time beyond compiling goes to links, tests or generators.",
        { say: "Bazel caches each, test runs included, as an action keyed by its declared inputs, in a remote cache shared by every machine.", hold: 0.6 },
      ],
      draw(s) {
        s.fit(0, -74, 1074, 496, 0.84);
        const goPill = s.pill(640, -50, "go command", { kind: "go" });
        const bazelPill = s.pill(640, -50, "Bazel", { kind: "bazel" });
        const fence = s.rect(206, -14, 638, 320, { r: 12, width: 2, dash: "10 8" });
        const graph = s.text(206, -26, "action graph", { size: 26, tone: "muted" });
        const xs = [220, 430, 640, 870];
        const kinds = ["compile", "link", "test", "generate"];
        const rows = [0, 110, 220].map((y, r) => {
          const name = s.text(0, y + 46, `CI machine ${r + 1}`, { size: 26, tone: "muted" });
          const blocks = kinds.map((k, c) => s.box(xs[c], y, 190, 72, k));
          return { name, blocks };
        });
        const stores = ["shared store", "remote cache"].map((label) => s.cache(640, 420, { w: 260, h: 150, label, kind: "remote" }));
        const key = s.legend(0, 470, [["run", "runs"], ["hit", "cache hit"]]);
        return (t, cue) => {
          const [c0, c1] = cue;
          // The go command with a shared store: compiles run once per fleet; the rest on every machine.
          const [goOut, bazelIn] = swap(t, c1 + 0.2);
          show(goPill, during(t, c0 + 0.2, c0 + 0.8) * goOut);
          show(bazelPill, bazelIn);
          const [storeOut, cacheIn] = swap(t, c1 + 0.2);
          show(stores[0], during(t, c0 + 0.2, c0 + 0.8) * storeOut);
          show(stores[1], cacheIn);
          appear(fence, t, c0 + 0.4);
          appear(graph, t, c0 + 0.4);
          appear(key, t, c0 + 2.4);
          const wide = during(t, c1 + 3.4, c1 + 4.4);
          fence.setAttribute("width", mix(638, 868, wide).toFixed(1));
          // Under Bazel, the first machine runs each action once; the others hit.
          const when = [c0 + 2.4, c0 + 6.6, c0 + 7.2, c0 + 7.8];
          const cached = [null, c1 + 1.6, c1 + 2.2, c1 + 2.8];
          rows.forEach(({ name, blocks }, r) => {
            appear(name, t, c0 + 0.6 + 0.2 * r);
            blocks.forEach((b, c) => {
              appear(b, t, c0 + 0.8 + 0.2 * r + 0.1 * c);
              const ran = during(t, when[c], when[c] + 0.6);
              const hit = r === 0 ? 0 : c === 0 ? ran : during(t, cached[c], cached[c] + 0.6);
              b.mark("run", r === 0 ? ran : ran * (1 - hit));
              b.mark("hit", hit);
            });
          });
        };
      },
    },
    {
      section: "Where each tool fits",
      lines: [
        "What Bazel costs: BUILD files, a second description of the graph that Gazelle must keep current, and a server whose memory grows with the graph.",
        { say: "Loading and analysis after every server start, a fixed cost per action, two commands to know, and, Chapter 3 expects, migration work mostly in tests.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, -14, 1064, 514, 0.84);
        // BUILD files: a second description of the graph, written by Gazelle from Go source.
        const source = s.file(0, 0, 240, 80, "Go source", { mono: false });
        const build = s.box(440, 0, 260, 80, "BUILD files", { kind: "bazel" });
        const gazelle = s.edge(source, build);
        const named = s.text(340, 26, "Gazelle", { size: 26, anchor: "middle", tone: "muted" });
        // A server that holds the graph; its memory grows with it.
        const server = s.box(440, 140, 260, 96, "server", { kind: "bazel", sub: "holds the graph" });
        const into = s.edge(build, server, { from: "bottom", to: "top" });
        const memory = s.group();
        memory.text(740, 160, "memory", { size: 26, tone: "muted" });
        memory.rect(740, 170, 320, 36, { r: 6, width: 2 });
        const used = s.rect(742, 172, 316, 32, { r: 5, fill: 0.35, stroke: false });
        // After every server start: loading and analysis, then actions, each with a fixed cost.
        const start = s.group();
        start.line(0, 290, 0, 374, { width: 3, opacity: 0.8 });
        start.text(0, 276, "server start", { size: 26, tone: "muted" });
        const loading = s.box(24, 300, 220, 64, "loading");
        const analysis = s.box(256, 300, 220, 64, "analysis");
        const actions = Array.from({ length: 6 }, (_, i) => {
          const g = s.group();
          g.box(500 + 96 * i, 300, 84, 64, "");
          g.rect(500 + 96 * i, 300, 20, 64, { kind: "run", fill: 0.5, r: 6, width: 2 });
          return g;
        });
        // Two commands to know, and the migration work.
        const commands = [s.pill(60, 466, "go", { kind: "go", mono: true }), s.pill(182, 466, "bazel", { kind: "bazel", mono: true })];
        const tests = s.box(440, 418, 260, 96, "tests", { sub: "migration work" });
        return (t, cue) => {
          const [c0, c1] = cue;
          appear(source, t, c0 + 1.0);
          appear(build, t, c0 + 1.6);
          const twice = during(t, c0 + 3.0, c0 + 3.6) * (1 - during(t, c0 + 4.8, c0 + 5.4));
          source.focus(twice);
          build.focus(twice);
          drawn(gazelle, during(t, c0 + 5.2, c0 + 6.0));
          appear(named, t, c0 + 5.6);
          appear(server, t, c0 + 7.2);
          drawn(into, during(t, c0 + 7.6, c0 + 8.2));
          appear(memory, t, c0 + 8.4);
          appear(used, t, c0 + 8.6, 0.2);
          used.setAttribute("width", mix(8, 316, during(t, c0 + 8.6, c0 + 11.4)).toFixed(1));
          appear(start, t, c1 + 0.4);
          appear(loading, t, c1 + 0.6);
          loading.mark("run", during(t, c1 + 0.8, c1 + 1.6));
          appear(analysis, t, c1 + 1.6);
          analysis.mark("run", during(t, c1 + 1.8, c1 + 2.6));
          actions.forEach((a, i) => appear(a, t, c1 + 3.6 + 0.15 * i, 0.4));
          commands.forEach((p, i) => appear(p, t, c1 + 5.6 + 0.3 * i));
          appear(tests, t, c1 + 8.4);
        };
      },
    },
    {
      section: "Where each tool fits",
      lead: 0.8,
      lines: [
        { say: "In our view, a shared Go cache pays once several machines share builds.", hold: 0.6 },
        "Bazel pays, in our view, once work that cache cannot share dominates CI time, as that work grows with the build and recurs on every machine.",
        "Once one build outgrows one machine, remote execution runs actions on a pool, though no pool shortens the critical path.",
        { say: "The map assumes Go only; other languages or generators in the graph enlarge Bazel's regions.", hold: 0.6 },
      ],
      draw(s) {
        // Figure 10.1's geometry, from its 720-unit canvas to this one.
        const F = 1.55;
        const X = (x) => 120 + (x - 96) * F;
        const Y = (y) => 60 + (y - 40) * F;
        const P = ([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
        s.fit(0, 6, 1070, 506, 0.84);
        const regions = s.group();
        const area = (kind, opacity) => svg("path", { fill: SHAPE[kind], "fill-opacity": opacity, stroke: "none" }, regions.g);
        const goLow = area("go", 0.12);
        const goHigh = area("go", 0.18);
        const bzCache = area("bazel", 0.12);
        const bzExec = area("bazel", 0.18);
        bzExec.setAttribute("d", `M${P([560, 40])} L${P([704, 40])} L${P([704, 300])} L${P([560, 300])} Z`);
        const lines = s.group();
        const curve = stroke(lines, "");
        const diagonal = stroke(lines, "");
        const vertical = stroke(lines, `M${P([560, 40])} L${P([560, 300])}`);
        // Axes and their labels.
        const axes = [s.edge([X(96), Y(300)], [X(96), Y(36)]), s.edge([X(96), Y(300)], [X(708), Y(300)])];
        const ticks = s.group();
        ticks.text(108, Y(52) + 8, "CI fleet", { size: 26, anchor: "end", tone: "muted" });
        ticks.text(108, Y(300) + 8, "one", { size: 26, anchor: "end", tone: "muted" });
        ticks.text(X(96), 28, "machines building the same code", { size: 26, tone: "muted" });
        ticks.text(X(96), Y(300) + 36, "one module", { size: 26, tone: "muted" });
        ticks.text(X(330), Y(300) + 36, "size of one build", { size: 26, anchor: "middle", tone: "muted" });
        ticks.text(X(632), Y(300) + 36, "beyond one machine", { size: 26, anchor: "middle", tone: "muted" });
        const view = s.text(X(704), 28, "the book's view, not a measurement", { size: 26, anchor: "end", tone: "muted", italic: true });
        // The regions' names.
        const label = (rows, x, y) => {
          const g = s.group();
          rows.forEach(([text, tone, options = {}], i) => g.text(X(x), Y(y) + 34 * i, text, { size: 28, anchor: "middle", tone, ...options }));
          return g;
        };
        const goName = label([["go command", "go", { weight: 600, size: 30 }]], 250, 246);
        const storeName = label([["go command", "go", { weight: 600, size: 30 }], ["+ GOCACHEPROG", "remote", { mono: true, size: 26 }], ["shared store", "remote", { size: 26 }]], 200, 100);
        const cacheName = label([["Bazel", "bazel", { weight: 600, size: 30 }], ["+ remote cache", "remote", { size: 26 }]], 486, 84);
        const execName = label([["Bazel", "bazel", { weight: 600, size: 30 }], ["+ remote", "remote", { size: 26 }], ["execution", "remote", { size: 26 }]], 632, 148);

        // The curve from Figure 10.1, and where a diagonal moved left by d meets it.
        const C = [[96, 178], [220, 168], [360, 166], [473.2, 172]];
        const lerp = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u)];
        const at = (u) => {
          const [a, b, c] = [lerp(C[0], C[1], u), lerp(C[1], C[2], u), lerp(C[2], C[3], u)];
          const [d, e] = [lerp(a, b, u), lerp(b, c, u)];
          return { q1: a, q2: d, q3: lerp(d, e, u) };
        };
        const lineX = (y, d) => 330 - d + ((y - 40) * 230) / 212;
        const geometry = (d) => {
          let lo = 0, hi = 1;
          for (let i = 0; i < 40; i++) {
            const m = (lo + hi) / 2;
            const p = at(m).q3;
            if (p[0] < lineX(p[1], d)) lo = m;
            else hi = m;
          }
          const { q1, q2, q3 } = at(hi);
          const bottom = [560, 40 + ((560 - 330 + d) * 212) / 230];
          const top = [330 - d, 40];
          return {
            curve: `M${P(C[0])} C${P(q1)} ${P(q2)} ${P(q3)}`,
            diagonal: `M${P(top)} L${P(bottom)}`,
            goLow: `M${P(C[0])} C${P(q1)} ${P(q2)} ${P(q3)} L${P(bottom)} L${P([560, 300])} L${P([96, 300])} Z`,
            goHigh: `M${P([96, 40])} L${P(top)} L${P(q3)} C${P(q2)} ${P(q1)} ${P(C[0])} Z`,
            bzCache: `M${P(top)} L${P([560, 40])} L${P(bottom)} Z`,
          };
        };
        return (t, cue) => {
          const [c0, c1, c2, c3] = cue;
          const g = geometry(45 * during(t, c3 + 2.8, c3 + 4.6));
          goLow.setAttribute("d", g.goLow);
          goHigh.setAttribute("d", g.goHigh);
          bzCache.setAttribute("d", g.bzCache);
          curve.setAttribute("d", g.curve);
          diagonal.setAttribute("d", g.diagonal);
          // The axes; the map is the book's view.
          axes.forEach((e) => drawn(e, during(t, 0.1, 1.1)));
          appear(ticks, t, 0.5);
          appear(view, t, c0 + 0.4);
          // A shared Go cache pays once several machines share builds: the curve.
          show(goLow, during(t, c0 + 0.6, c0 + 1.4));
          appear(goName, t, c0 + 1.0);
          trace(curve, during(t, c0 + 2.6, c0 + 3.8));
          show(goHigh, during(t, c0 + 3.6, c0 + 4.4));
          appear(storeName, t, c0 + 4.0);
          // Bazel pays once work the cache cannot share dominates: the diagonal.
          trace(diagonal, during(t, c1 + 0.8, c1 + 2.2));
          show(bzCache, during(t, c1 + 1.8, c1 + 2.6));
          appear(cacheName, t, c1 + 2.4);
          // Beyond one machine: remote execution.
          trace(vertical, during(t, c2 + 0.6, c2 + 1.8));
          show(bzExec, during(t, c2 + 1.6, c2 + 2.4));
          appear(execName, t, c2 + 2.2);
        };
      },
    },
    {
      section: "A migration path",
      lines: [
        { say: "We recommend this order: first, generate BUILD files with rules_go and Gazelle.", hold: 0.5 },
        { say: "Second, build both ways in CI and require a clean Gazelle diff.", hold: 0.5 },
        "From then on, the go command keeps working beside Bazel on packages that need no Bazel-only input.",
        { say: "Third, share a cache before CI depends on Bazel; only CI writes to it.", hold: 0.5 },
        "Fourth, make Bazel CI's required check, then move laptops once gopls, Go's language server, works through Bazel.",
        "Fifth, add remote execution last, only when builds wait on cores rather than on the critical path, or some actions need bigger machines.",
        { say: "In our view, until step 4, stopping costs only the BUILD files, test changes, the Gazelle check and the cache server.", hold: 0.6 },
      ],
      draw(s) {
        // Figure 10.2's steps, with each step's commands under its name.
        const steps = [
          { kind: "bazel", name: "Generate BUILD files", cmds: ["bazel run //:gazelle"] },
          { kind: "bazel", name: "Build both ways in CI", cmds: ["bazel test //...", "go vet <pkgs> && go test <pkgs>", "bazel run //:gazelle -- -mode=diff"] },
          { kind: "remote", name: "Share a cache", sub: "CI writes; others only read", cmds: ["--remote_cache=…", "--remote_upload_local_results=false"] },
          { kind: "bazel", name: "Make Bazel CI's required check", sub: "then laptops, once gopls works" },
          { kind: "remote", name: "Add remote execution last", cmds: ["--remote_executor=…"] },
        ];
        let y = 0;
        const placed = steps.map((step) => {
          const top = y;
          y += 32 + 36 * ((step.sub ? 1 : 0) + (step.cmds?.length ?? 0)) + 14 + 30;
          return { ...step, top, bottom: y - 30 };
        });
        const end = y - 30;
        s.fit(0, -2, 720, end + 52, 0.84);
        const rails = placed.slice(1).map((p, i) => s.line(60, placed[i].top + 50, 60, p.top - 6, { width: 2, opacity: 0.3 }));
        const groups = placed.map((p, i) => {
          const g = s.group();
          g.circle(60, p.top + 22, 24, { kind: p.kind, fill: 0.16, stroke: true, width: 2 });
          g.text(60, p.top + 31, String(i + 1), { size: 26, weight: 700, anchor: "middle" });
          g.text(110, p.top + 32, p.name, { size: 32, weight: 600 });
          let line = p.top + 32;
          if (p.sub) g.text(110, (line += 36), p.sub, { size: 26, italic: true, tone: "muted" });
          for (const cmd of p.cmds ?? []) g.text(110, (line += 36), cmd, { size: 26, mono: true, tone: cmd.startsWith("go ") ? "go" : "ink" });
          return g;
        });
        // From step 2 on, the go command keeps working beside Bazel.
        const bracket = s.group();
        const span = stroke(bracket, `M22,${placed[1].top + 4} L10,${placed[1].top + 4} L10,${end} L22,${end}`, { kind: "go", width: 4 });
        const passing = s.text(10, end + 44, "`go vet` and `go test` keep passing on `<pkgs>`", { size: 26, tone: "go" });
        // Until step 4, stopping costs only what steps 1 to 3 added.
        const divider = s.line(36, placed[3].top - 15, 720, placed[3].top - 15, { width: 2, opacity: 0.5, dash: "8 8" });
        // A pill whose left edge is at x: beside a step's name, or, for step 2, beside `bazel test`.
        const pillAt = (x, cy, name) => s.pill(x + (measure(name, { size: 26 }) + 36) / 2, cy, name);
        const afterName = (i) => 110 + measure(placed[i].name, { size: 32, weight: 600 }) + 32;
        const afterTest = 110 + measure(placed[1].cmds[0], { size: 26, mono: true }) + 32;
        const tests = pillAt(afterTest, placed[1].top + 59, "test changes");
        const costs = [
          pillAt(afterName(0), placed[0].top + 22, "BUILD files"),
          tests,
          pillAt(afterTest + tests.w + 12, placed[1].top + 59, "Gazelle check"),
          pillAt(afterName(2), placed[2].top + 22, "cache server"),
        ];
        return (t, cue) => {
          const [c0, c1, c2, c3, c4, c5, c6] = cue;
          // Each step lights up when its line comes.
          const lit = [c0 + 2.0, c1 + 0.4, c3 + 0.4, c4 + 0.4, c5 + 0.4];
          groups.forEach((g, i) => show(g, during(t, 0.1, 0.7) * mix(0.22, 1, during(t, lit[i], lit[i] + 0.6))));
          rails.forEach((r) => appear(r, t, 0.2));
          trace(span, during(t, c2 + 1.0, c2 + 3.0));
          appear(passing, t, c2 + 3.2);
          appear(divider, t, c6 + 1.8);
          costs.forEach((p, i) => appear(p, t, c6 + [4.6, 5.4, 6.6, 8.0][i]));
        };
      },
    },
  ],
};
