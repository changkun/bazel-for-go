// Chapter 1's film: a build as a graph of actions whose keys are looked up
// in a cache, an edit spreading until early cutoff, the critical path, the
// six decisions, and the cost model. Every sentence comes from the chapter,
// and every picture follows its figures 1.1 to 1.4.

import { H, RAIL, during, fitted, measure, mix, place, ramp, show } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));

export default {
  chapter: "1",
  title: "What a build system decides",
  scenes: [
    {
      // The chapter's opening: two systems, one job, six choices.
      lines: [{ say: "The go command and Bazel both turn Go source into binaries, but they make different choices at six points.", hold: 0.8 }],
      draw(s) {
        s.fit(0, 0, 940, 526);
        const source = s.file(0, 134, 200, 72, "Go source", { mono: false });
        const binaries = s.file(740, 134, 200, 72, "binaries", { mono: false });
        const go = s.box(330, 0, 280, 80, "go command", { kind: "go" });
        const bazel = s.box(330, 260, 280, 80, "Bazel", { kind: "bazel" });
        const edges = [s.edge(source, go), s.edge(go, binaries), s.edge(source, bazel), s.edge(bazel, binaries)];
        const points = [1, 2, 3, 4, 5, 6].map((n, i) => {
          const g = s.group();
          g.circle(195 + i * 110, 500, 26, { fill: 0, stroke: true });
          g.text(195 + i * 110, 510, String(n), { size: 28, weight: 600, anchor: "middle" });
          return g;
        });
        return (t, cue) => {
          appear(source, t, 0.2);
          appear(binaries, t, 0.5);
          appear(go, t, 0.9);
          appear(bazel, t, 1.1);
          edges.forEach((e, i) => e.trace(during(t, 1.4 + 0.25 * i, 2.4 + 0.25 * i)));
          points.forEach((p, i) => appear(p, t, cue[0] + 6 + 0.18 * i, 0.4));
        };
      },
    },
    {
      section: "Actions and keys",
      lines: [
        { say: "A build turns sources into outputs.", hold: 1 },
        { say: "Rerunning it all after every edit is too slow, so a build system splits it into steps and skips each step whose result it already has.", hold: 1 },
        { say: "An action is one step: one run of one tool, such as compiling a package.", hold: 1 },
        { say: "Actions form a graph: an edge runs from each action to those that read its output.", hold: 1 },
      ],
      draw(s) {
        s.fit(0, -40, 1000, 424);
        const files = ["c.go", "a.go", "b.go"].map((name, i) => s.file(0, 160 * i, 150, 64, name));
        const app = s.file(880, 160, 120, 64, "app");
        // The whole build, before it is split into steps.
        const whole = s.box(210, -40, 600, 464, "build", { size: 40, weight: 600 });
        const into = files.map((f) => s.edge(f, whole));
        const out = s.edge(whole, app);
        // The steps: one compile per package, and the link.
        const compile = ["c", "a", "b"].map((p, i) => s.box(250, 160 * i, 240, 64, `compile ${p}`));
        const [c, a, b] = compile;
        const link = s.box(620, 160, 150, 64, "link");
        const reads = files.map((f, i) => s.edge(f, compile[i]));
        const deps = [s.edge(a, c, { from: "top", to: "bottom" }), s.edge(a, b, { from: "bottom", to: "top" })];
        const links = compile.map((x) => s.edge(x, link));
        const made = s.edge(link, app);
        return (t, cue) => {
          const split = during(t, cue[1] + 0.6, cue[1] + 1.5); // the build comes apart into steps
          const focus = during(t, cue[2] + 0.3, cue[2] + 0.9) * (1 - during(t, cue[3] + 0.2, cue[3] + 0.8));
          const dim = 1 - 0.7 * focus; // all but one action step back
          // A build turns sources into outputs.
          files.forEach((f, i) => show(f, during(t, cue[0] + 0.2 * i, cue[0] + 0.6 + 0.2 * i) * (i < 2 ? dim : 1)));
          show(app, during(t, cue[0] + 1.2, cue[0] + 1.8) * dim);
          show(whole, during(t, cue[0] + 0.6, cue[0] + 1.2) * (1 - split));
          into.forEach((e) => show(e.trace(during(t, cue[0] + 1.0, cue[0] + 2.0)), 1 - split));
          show(out.trace(during(t, cue[0] + 1.6, cue[0] + 2.4)), 1 - split);
          // Split into steps; the steps it already has are skipped.
          compile.forEach((x, i) => show(x, during(t, cue[1] + 1.2 + 0.25 * i, cue[1] + 1.8 + 0.25 * i) * (x === c ? dim : 1)));
          show(link, during(t, cue[1] + 1.9, cue[1] + 2.5) * dim);
          reads.forEach((e, i) => show(e.trace(during(t, cue[1] + 1.3, cue[1] + 2.2)), i < 2 ? dim : 1));
          show(made.trace(during(t, cue[1] + 2.4, cue[1] + 3.0)), dim);
          c.mark("hit", during(t, cue[1] + 6.0, cue[1] + 6.6));
          a.mark("hit", during(t, cue[1] + 6.3, cue[1] + 6.9));
          // One action.
          b.focus(focus);
          // The graph: from each action to those that read its output.
          deps.forEach((e, i) => e.trace(during(t, cue[3] + 0.8 + 0.2 * i, cue[3] + 1.6 + 0.2 * i)).pulse(ramp(t, cue[3] + 3.0, cue[3] + 4.0), "ink"));
          links.forEach((e) => e.trace(during(t, cue[3] + 1.4, cue[3] + 2.2)).pulse(ramp(t, cue[3] + 4.2, cue[3] + 5.2), "ink"));
        };
      },
    },
    {
      section: "Actions and keys",
      lines: [
        { say: "Its key is a hash of everything that can change its output: its input files, what it reads from earlier actions, the tool, the flags and the environment.", hold: 1 },
        { say: "A cache hit reuses the output stored under the key; a miss runs the action and stores its output.", hold: 1 },
        { say: "Reuse is safe only if the build is hermetic: the same inputs always give the same output, whatever else is on the machine.", hold: 1 },
      ],
      draw(s) {
        s.fit(0, 0, 1110, 610, 0.85);
        const machine = s.group();
        machine.rect(0, 0, 1110, 610, { r: 14, width: 2 }).setAttribute("stroke-opacity", 0.35);
        machine.text(28, 42, "one machine", { size: 26, tone: "muted" });
        const heading = s.text(40, 100, "inputs of `compile b`", { size: 26, tone: "muted" });
        const inputs = [
          s.file(30, 120, 340, 60, "b.go"),
          s.file(30, 196, 340, 60, "output of compile a", { mono: false }),
          s.file(30, 272, 340, 60, "compiler and flags", { mono: false }),
          s.file(30, 348, 340, 60, "environment", { mono: false }),
        ];
        const fence = s.rect(14, 64, 372, 364, { r: 12, width: 2.5, dash: "10 8" });
        const key = s.box(440, 209, 170, 110, "key", { weight: 600, sub: "4f9c…e1", subMono: true });
        const feed = inputs.map((f) => s.edge(f, key));
        const cache = s.cache(770, 264, { w: 120, h: 130 });
        const lookup = s.edge(key, cache);
        const look = s.text(660, 242, "look up", { size: 26, anchor: "middle", tone: "muted" });
        const hit = s.box(900, 140, 180, 96, "hit", { kind: "hit", sub: "reuse output", weight: 600 });
        const miss = s.box(900, 292, 180, 96, "miss", { kind: "run", sub: "run, store", weight: 600 });
        const toHit = s.edge(cache, hit, { kind: "hit" });
        const toMiss = s.edge(cache, miss, { kind: "run" });
        const others = s.group();
        ["other files", "other tools"].forEach((name, i) => others.file(30 + 250 * i, 470, 220, 56, name, { mono: false }));
        others.text(40, 570, "whatever else is on the machine", { size: 26, tone: "muted" });
        return (t, cue) => {
          // The key: a hash of everything that can change the output.
          appear(heading, t, cue[0]);
          appear(key, t, cue[0] + 1.0);
          inputs.forEach((f, i) => appear(f, t, cue[0] + 2.4 + 1.0 * i));
          feed.forEach((e, i) => e.trace(during(t, cue[0] + 2.8 + 1.0 * i, cue[0] + 3.6 + 1.0 * i)));
          feed.forEach((e, i) => e.pulse(ramp(t, cue[0] + 7.0 + 0.2 * i, cue[0] + 8.0 + 0.2 * i), "ink"));
          show(key.labels[1], during(t, cue[0] + 8.2, cue[0] + 8.8) * 0.66);
          // Looked up: a hit, or a miss.
          appear(cache, t, cue[1] + 0.2);
          lookup.trace(during(t, cue[1] + 0.4, cue[1] + 1.2)).pulse(ramp(t, cue[1] + 1.2, cue[1] + 2.0), "ink");
          appear(look, t, cue[1] + 0.6);
          toHit.trace(during(t, cue[1] + 1.8, cue[1] + 2.6));
          appear(hit, t, cue[1] + 2.4);
          toMiss.trace(during(t, cue[1] + 4.0, cue[1] + 4.8));
          appear(miss, t, cue[1] + 4.6);
          // Hermetic: only the inputs reach the key, whatever else is there.
          appear(machine, t, cue[2] + 0.6, 0.8);
          appear(fence, t, cue[2] + 1.6);
          show(others, 0.75 * during(t, cue[2] + 5.0, cue[2] + 5.8));
        };
      },
    },
    {
      section: "Cutoff and the critical path",
      lines: [
        { say: "When a source changes, the action that reads it reruns, and its new output changes the keys of the actions that use it.", hold: 1 },
        { say: "The change spreads along the graph until early cutoff stops it: an action reruns, but its output is identical to last time.", hold: 1 },
        { say: "The actions after it need not run: the edit reruns only `a` and `d`.", hold: 1 },
        { say: "The critical path is the chain of actions, each needing the output of the one before, that takes longest to run.", hold: 1 },
        { say: "No number of cores or machines finishes a build sooner than its critical path.", hold: 3 },
      ],
      draw(s) {
        // Figure 1.2's graph, within the bounds G.
        const G = [0, -3, 920, 490];
        const graph = s.group();
        const at = { a: [60, 90], b: [60, 230], c: [60, 370], d: [260, 90], e: [260, 300], f: [460, 90], g: [660, 190], h: [860, 190] };
        const band = graph.band([at.a, at.f, at.g, at.h]);
        const node = Object.fromEntries(Object.entries(at).map(([n, [x, y]]) => [n, graph.box(x - 60, y - 32, 120, 64, n, { mono: true })]));
        const { a, b, c, d, e, f, g, h } = node;
        const ad = graph.edge(a, d);
        const df = graph.edge(d, f);
        for (const [from, to] of [[f, g], [e, g], [b, e], [c, e], [g, h]]) graph.edge(from, to);
        const edit = graph.pill(60, 20, "edit", { kind: "run" });
        const same = graph.pill(260, 170, "same output");
        const stop = graph.line(360, 64, 360, 116, { width: 6, opacity: 1 });
        const key = graph.legend(0, 480, [["run", "reran"], ["hit", "cache hit"]]);
        const path = graph.legend(58 + measure("reran", { size: 26 }) + 44 + 58 + measure("cache hit", { size: 26 }) + 44, 480, [["band", "critical path of a full build"]]);

        // A full build, scheduled on 1, 2 and then 4 cores, within the bounds P: it never ends before the chain a, d, f, g, h.
        const P = [-6, -30, 994, 306];
        const plan = s.group();
        const UNIT = 120, LANE = 72, Y0 = 50;
        const lanes = [0, 1, 2, 3].map((i) => plan.rect(-6, Y0 + LANE * i - 32, UNIT * 8, 64, { r: 8, fill: 0.05, stroke: false }));
        const heading = plan.text(0, 0, "a full build on", { size: 30 });
        const cores = ["1 core", "2 cores", "4 cores"].map((label) => plan.text(measure("a full build on ", { size: 30 }), 0, label, { size: 30, weight: 600 }));
        const order = ["a", "b", "c", "d", "e", "f", "g", "h"];
        // [lane, slot] of each action on 2 and on 4 cores; on 1 core, all in lane 0 in this order.
        const two = { a: [0, 0], d: [0, 1], f: [0, 2], g: [0, 3], h: [0, 4], b: [1, 0], c: [1, 1], e: [1, 2] };
        const four = { ...two, c: [2, 0], e: [1, 1] };
        const chain = plan.band([[54, Y0], [54 + 4 * UNIT, Y0]], { width: 72 });
        const blocks = order.map((n) => plan.box(0, Y0 - 28, 108, 56, n, { mono: true, kind: "run" }));
        const finish = plan.group();
        finish.line(0, 14, 0, Y0 + 3 * LANE + 36, { width: 3, opacity: 0.8 });
        finish.text(0, 0, "finish", { size: 26, anchor: "middle", tone: "muted" });

        // The graph fills the plate alone; when the schedule comes, it moves up to make room.
        const alone = fitted(G);
        const tall = G[3] - G[1] + 44 + P[3] - P[1];
        const top = (H - tall) / 2;
        const above = fitted(G, { into: [0, top, RAIL, top + G[3] - G[1]], scale: 1 });
        place(plan, ...fitted(P, { into: [0, H - top - (P[3] - P[1]), RAIL, H - top], scale: 1 }));

        return (t, cue) => {
          // An edit reruns a; its new output changes d's key, so d reruns.
          appear(edit, t, cue[0] + 0.6);
          a.mark("run", during(t, cue[0] + 3.2, cue[0] + 3.8));
          ad.pulse(ramp(t, cue[0] + 4.6, cue[0] + 5.8));
          ad.mark("run", during(t, cue[0] + 5.0, cue[0] + 5.6));
          d.mark("run", during(t, cue[0] + 6.0, cue[0] + 6.6));
          // d's output comes out the same: the change stops there.
          df.pulse(ramp(t, cue[1] + 1.8, cue[1] + 3.2) * 0.45, "run", 1 - during(t, cue[2] + 0.2, cue[2] + 0.8));
          appear(same, t, cue[1] + 5.6);
          appear(stop, t, cue[1] + 6.4, 0.4);
          for (const [i, x] of [f, g, h].entries()) x.mark("hit", during(t, cue[2] + 0.6 + 0.3 * i, cue[2] + 1.2 + 0.3 * i));
          for (const [i, x] of [b, c, e].entries()) x.mark("hit", during(t, cue[2] + 2.6 + 0.2 * i, cue[2] + 3.2 + 0.2 * i));
          appear(key, t, cue[2] + 1.2);
          // The critical path, then a full build on one core under it.
          const c4 = cue[3], c5 = cue[4];
          band.trace(during(t, c4 + 0.6, c4 + 2.6));
          appear(path, t, c4 + 0.6);
          const room = during(t, c4 + 3.6, c4 + 4.4);
          place(graph, ...alone.map((v, i) => mix(v, above[i], room)));
          const shown = during(t, c4 + 4.4, c4 + 5.0);
          // On more cores: two, then four.
          const spread = during(t, c5 + 0.8, c5 + 1.8);
          const more = during(t, c5 + 4.0, c5 + 4.8);
          show(lanes[0], shown);
          show(lanes[1], spread);
          show(lanes[2], more);
          show(lanes[3], more);
          // One count gives way to the next: out, then in, never on top of each other.
          const swap = (a) => during(t, c5 + a, c5 + a + 0.3);
          show(heading, shown);
          show(cores[0], shown * (1 - swap(0.8)));
          show(cores[1], swap(1.1) * (1 - swap(4.0)));
          show(cores[2], swap(4.3));
          order.forEach((n, i) => {
            const lane = mix(mix(0, two[n][0], spread), four[n][0], more);
            const slot = mix(mix(i, two[n][1], spread), four[n][1], more);
            place(blocks[i], slot * UNIT, lane * LANE);
            show(blocks[i], during(t, c4 + 4.5 + 0.1 * i, c4 + 5.0 + 0.1 * i));
          });
          place(finish, mix(8, 5, spread) * UNIT - 6, 0);
          show(finish, during(t, c4 + 5.9, c4 + 6.4));
          chain.trace(during(t, c5 + 5.6, c5 + 6.6));
        };
      },
    },
    {
      section: "Six decisions",
      lines: [
        { say: "Unit: how much one action does. A module reruns more than needed; a file multiplies the cost of starting actions." },
        { say: "For Go, the go command and Bazel's rules_go both make one compile action per package." },
        { say: "Graph: derived from imports, as the go command does, or declared in build files, as Bazel requires." },
        { say: "A derived graph needs no upkeep but describes only what the language can; a declared one can describe anything, but must be kept in step with the code." },
        { say: "Change: hash every input again, compare each file's saved metadata, or be told by the operating system." },
        { say: "Key: which part of a dependency enters its dependents' keys: its sources, its whole output, or only the part they read." },
        { say: "Sharing: one process, one machine, or a team and its continuous integration (CI) jobs, if keys match across machines." },
        { say: "Execution: local, or on a remote pool that raises parallelism and adds time to move bytes.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(88, 100, 1160, 905, 0.84);
        const X0 = 470, X1 = 1100;
        const decisions = [
          ["Unit", ["module", "package", "file"]],
          ["Graph", ["derived", "declared"]],
          ["Change", ["rehash all", "metadata", "notified"]],
          ["Key", ["sources", "whole output", "part read"]],
          ["Sharing", ["one process", "one machine", "a team"]],
          ["Execution", ["local", "remote"]],
        ];
        const rows = decisions.map(([name, stops], i) => {
          const y = 168 + 136 * i;
          const g = s.group();
          g.circle(112, y, 24, { fill: 0, stroke: true });
          g.text(112, y + 10, String(i + 1), { size: 26, weight: 600, anchor: "middle" });
          g.text(156, y + 12, name, { size: 34, weight: 600 });
          g.line(X0, y, X1, y, { width: 3, opacity: 0.3 });
          const xs = stops.map((_, j) => mix(X0, X1, j / (stops.length - 1)));
          const labels = stops.map((label, j) => {
            g.circle(xs[j], y, 7, { fill: 0.5 });
            return g.text(xs[j], y + 48, label, { size: 26, anchor: "middle" });
          });
          const ring = g.group();
          ring.circle(0, y, 15, { fill: 1 });
          return { g, y, xs, labels, ring };
        });
        // Where the two systems stand, where the chapter says so: Unit and Graph.
        const unit = s.group();
        unit.pill(rows[0].xs[1] - 92, rows[0].y - 44, "go command", { kind: "go" });
        unit.pill(rows[0].xs[1] + 92, rows[0].y - 44, "rules_go", { kind: "bazel" });
        const derived = s.pill(rows[1].xs[0], rows[1].y - 44, "go command", { kind: "go" });
        const declared = s.pill(rows[1].xs[1], rows[1].y - 44, "Bazel", { kind: "bazel" });

        // Which row each line is about, and when its marker reaches each stop: [line, second after the line starts, stop].
        const active = [0, 0, 1, 1, 2, 3, 4, 5];
        const moves = [
          [[0, 2.4, 0], [0, 4.2, 0], [0, 5.4, 2], [1, 1.4, 2], [1, 2.4, 1]],
          [[2, 0.8, 0], [2, 3.6, 0], [2, 4.6, 1], [3, 0.4, 1], [3, 1.0, 0], [3, 4.8, 0], [3, 5.8, 1]],
          [[4, 0.8, 0], [4, 2.4, 0], [4, 3.2, 1], [4, 4.6, 1], [4, 5.4, 2]],
          [[5, 4.6, 0], [5, 5.4, 0], [5, 6.0, 1], [5, 6.8, 1], [5, 7.4, 2]],
          [[6, 0.8, 0], [6, 1.6, 0], [6, 2.2, 1], [6, 2.8, 1], [6, 3.4, 2]],
          [[7, 0.8, 0], [7, 2.4, 0], [7, 3.4, 1]],
        ];
        return (t, cue) => {
          const begun = during(t, cue[0] + 1.4, cue[0] + 1.9);
          rows.forEach((row, i) => {
            const on = active.map((r, l) => (r === i ? l : -1)).filter((l) => l >= 0);
            const first = Math.max(cue[on[0]], cue[0] + 1.4), last = cue[on[on.length - 1] + 1];
            const lit = during(t, first, first + 0.5) * (1 - during(t, last, last + 0.5));
            const done = t >= last ? 0.55 : 0.3;
            show(row.g, during(t, cue[0] + 0.1 + 0.15 * i, cue[0] + 0.6 + 0.15 * i) * mix(1, mix(done, 1, lit), begun));
            // The marker moves from stop to stop; a stop's label is bright while the marker is near it.
            const path = moves[i].map(([l, after, stop]) => [cue[l] + after, row.xs[stop]]);
            let x = path[0][1];
            for (let j = 1; j < path.length; j++) x = mix(x, path[j][1], during(t, path[j - 1][0], path[j][0]));
            place(row.ring, x, 0);
            show(row.ring, during(t, path[0][0] - 0.4, path[0][0]) * lit);
            row.labels.forEach((label, j) => show(label, mix(0.55, 1, lit * Math.max(0, 1 - Math.abs(x - row.xs[j]) / 120))));
          });
          appear(unit, t, cue[1] + 2.2);
          appear(derived, t, cue[2] + 1.6);
          appear(declared, t, cue[2] + 5.0);
        };
      },
    },
    {
      section: "A cost model",
      lines: [
        { say: "We model one build's time with four terms: obtaining the graph, finding what changed, running the cache misses, and moving bytes.", hold: 1 },
        { say: "The terms can overlap, so the wait can be shorter than their sum.", hold: 1 },
        { say: "After one edit on a laptop, few actions rerun, so finding the change takes a large share.", hold: 1 },
        { say: "A fresh CI runner without a shared cache obtains the graph from scratch and runs every action, so `T_exec` dominates; across a fleet, sharing results reduces it.", hold: 1 },
        { say: "In our view, the go command is designed for one engineer on one machine, with a repository small enough to rescan on every run." },
        { say: "Bazel is designed for a large repository built on many machines.", hold: 1.2 },
      ],
      draw(s) {
        const SIZE = 40;
        const terms = [["T_graph", "obtain the graph"], ["T_detect", "find what changed"], ["T_exec", "run the misses"], ["T_transfer", "move bytes"]];
        const wide = (string) => measure(string, { size: SIZE, mono: true });
        const total = wide("T ≤ ") + terms.reduce((sum, [term]) => sum + wide(term), 0) + 3 * wide(" + ");
        // Drawn on the plate's own scale; the formula stands alone in the middle until the bars come.
        s.fit(96, 150, 1216, 979, 0.855);
        const top = s.group();
        let x = 656 - total / 2;
        const formula = [];
        const style = (kind) => ({ graph: { fill: 0.2 }, detect: { fill: null }, exec: { kind: "run", fill: 0.18 }, transfer: { kind: "remote", fill: 0.18 } })[kind];
        const kinds = ["graph", "detect", "exec", "transfer"];
        const hatch = s.hatch();
        const swatch = (g, kind, x, y, w, h) => {
          const r = g.rect(x, y, w, h, { r: 4, width: 2, ...style(kind) });
          if (kind === "detect") r.setAttribute("fill", hatch);
          return r;
        };
        const lead = top.text(x, 200, "T", { size: SIZE, mono: true });
        const atMost = top.text(x + wide("T "), 200, "≤", { size: SIZE, mono: true });
        const ring = top.circle(x + wide("T ") + wide("≤") / 2, 186, 28, { fill: 0, stroke: true, width: 2.5 });
        x += wide("T ≤ ");
        terms.forEach(([term, label], i) => {
          const g = top.group();
          const w = wide(term);
          g.text(x, 200, term, { size: SIZE, mono: true });
          swatch(g, kinds[i], x, 222, w, 12);
          const name = top.text(x + w / 2, 280, label, { size: 26, anchor: "middle", tone: "muted" });
          formula.push({ g, name });
          x += w;
          if (i < 3) {
            formula[i].plus = top.text(x + wide(" + ") / 2, 200, "+", { size: SIZE, mono: true, anchor: "middle" });
            x += wide(" + ");
          }
        });

        // Figure 1.4's shares, in its proportions: illustrative, not measured.
        const bars = [
          { label: "One engineer's edit; a long-lived process holds the graph", y: 440, parts: [["graph", 14], ["detect", 330], ["exec", 322]] },
          { label: "Fresh CI runner; no shared cache", y: 660, parts: [["graph", 196], ["detect", 80], ["exec", 390]] },
        ].map((bar) => {
          const title = s.text(96, bar.y - 22, bar.label, { size: 30 });
          const scale = 1120 / 672;
          let at = 96;
          const parts = bar.parts.map(([kind, share]) => {
            const g = s.group();
            const w = share * scale - 5;
            swatch(g, kind, at, bar.y, w, 80);
            const term = `T_${kind}`;
            const width = measure(term, { size: 26, mono: true });
            if (w >= width + 12) g.text(at + w / 2, bar.y + 49, term, { size: 26, mono: true, anchor: "middle" });
            else {
              // Too narrow for its name: the name goes below, on a tick.
              g.line(at + w / 2, bar.y + 86, at + w / 2, bar.y + 104, { width: 2, opacity: 0.6 });
              const left = at + w / 2 - width / 2 < 96;
              g.text(left ? at : at + w / 2, bar.y + 136, term, { size: 26, mono: true, anchor: left ? "start" : "middle" });
            }
            at += share * scale;
            return g;
          });
          return { title, parts };
        });
        const note = s.text(1216, 870, "illustrative shares of one build's time, not to scale", { size: 26, anchor: "end", tone: "muted", italic: true });
        // The book's view, in the chapter's words.
        const view = s.group();
        const goPill = view.pill(184, 956, "go command", { kind: "go" });
        view.text(184 + goPill.w / 2 + 16, 965, "one engineer, one machine", { size: 26 });
        const bazelGroup = s.group();
        const bazelPill = bazelGroup.pill(700, 956, "Bazel", { kind: "bazel" });
        bazelGroup.text(700 + bazelPill.w / 2 + 16, 965, "a large repository, many machines", { size: 26 });

        return (t, cue) => {
          place(top, 0, mix((150 + 979) / 2 - 220, 0, during(t, cue[2], cue[2] + 0.8)));
          appear(lead, t, cue[0] + 0.2);
          appear(atMost, t, cue[0] + 0.2);
          formula.forEach((term, i) => {
            appear(term.g, t, cue[0] + 0.6 + 0.4 * i);
            if (term.plus) appear(term.plus, t, cue[0] + 0.8 + 0.4 * i);
            appear(term.name, t, cue[0] + 3.4 + 1.5 * i);
          });
          // They can overlap: the wait is at most their sum.
          show(ring, during(t, cue[1] + 0.6, cue[1] + 1.2) * (1 - during(t, cue[2], cue[2] + 0.6)));
          bars.forEach((bar, i) => {
            const c = cue[2 + i];
            appear(bar.title, t, c + 0.9);
            bar.parts.forEach((part, j) => appear(part, t, c + 1.4 + 0.7 * j));
          });
          appear(note, t, cue[2] + 1.4);
          appear(view, t, cue[4] + 1.2);
          appear(bazelGroup, t, cue[5] + 0.6);
        };
      },
    },
  ],
};
