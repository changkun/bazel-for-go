// Chapter 6's film: targets, rules, providers and actions; three phases
// that overlap; Skyframe's invalidation and change pruning, with the action
// cache's part in it; the action key, the local action cache's entry, and
// the remote Action, its hash and the CAS; paths relative to the execroot;
// the sandbox; remote execution and Build without the Bytes; and what the
// server costs. Every sentence comes from the chapter, and every picture
// follows its figures 6.1 to 6.7.

import { during, measure, mix, place, ramp, show } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// Draw an edge up to part u; before it starts, nothing of it shows (not even a dot).
const trace = (edge, u) => {
  show(edge.trace(u), u > 0 ? 1 : 0);
  return edge;
};

export default {
  chapter: "6",
  title: "Bazel's design",
  scenes: [
    {
      section: "The model",
      lines: [
        { say: "A target is a named unit in a BUILD file; its rule, such as `go_library`, is its kind, and its `deps` are edges to other targets.", hold: 0.6 },
        { say: "To analyze a target, Bazel runs its rule's function, which registers actions: commands whose inputs and outputs are declared and must be known during analysis.", hold: 1.0 },
        { say: "It also returns providers: data for the targets that depend on it.", hold: 1.0 },
      ],
      draw(s) {
        // Figure 6.1: targets on the left, the actions they register on the right.
        s.fit(0, -32, 1084, 760, 0.85);
        const TW = 470, TH = 96, AX = 570, AW = 280, AH = 80, ACX = AX + AW / 2;
        const rows = [188, 398, 608];
        // The targets stand alone in the middle until the actions come.
        const left = s.group();
        const targetsHead = left.text(0, 0, "Targets (BUILD files)", { size: 30, weight: 600 });
        const actionsHead = s.text(AX, 0, "Actions", { size: 30, weight: 600 });
        const targets = [
          ["//cmd/hello:hello", "go_binary"],
          ["//cmd/hello:hello_lib", "go_library"],
          ["//internal/greet:greet", "go_library"],
        ].map(([name, rule], i) => left.box(0, rows[i] - TH / 2, TW, TH, name, { mono: true, sub: rule, subMono: true, kind: "bazel" }));

        // The edges between targets, then the providers that pass up them.
        const X = 70;
        const gaps = [[rows[0] + TH / 2, rows[1] - TH / 2], [rows[1] + TH / 2, rows[2] - TH / 2]];
        const deps = gaps.map(([a, b]) => left.line(X, a + 6, X, b - 6, { width: 2.5, opacity: 0.55 }));
        const attrs = gaps.map(([a], i) => left.text(X + 24, a + 76, ["embed", "deps"][i], { size: 26, mono: true, tone: "muted" }));
        const provides = gaps.map(([a, b]) => left.edge([X, b - 6], [X, a + 6], { kind: "bazel" }));
        const providers = gaps.map(([a], i) => left.text(X + 24, a + 42, ["GoInfo", "GoArchive"][i], { size: 26, mono: true, weight: 600, tone: "bazel" }));

        // What each target registers (the compile that hello_lib registers for itself is not shown).
        const dash = { width: 2, opacity: 0.55, dash: "8 7" };
        const registers = [
          s.line(TW + 6, rows[0] - 16, AX - 6, rows[0] - 10, dash),
          s.line(TW + 6, rows[0] + 24, AX - 6, rows[1] - 12, dash),
          s.line(TW + 6, rows[2], AX - 6, rows[2], dash),
        ];
        const link = s.box(AX, rows[0] - AH / 2, AW, AH, "GoLink", { mono: true });
        const compileHello = s.box(AX, rows[1] - AH / 2, AW, AH, "GoCompilePkg", { mono: true });
        const compileGreet = s.box(AX, rows[2] - AH / 2, AW, AH, "GoCompilePkg", { mono: true });
        const actions = [link, compileHello, compileGreet];

        // The files that actions read and write.
        const hello = s.file(ACX - 60, 40, 120, 56, "hello");
        const greetGo = s.file(500, 700, 186, 56, "greet.go");
        const tmpl = s.file(706, 700, 292, 56, "greeting.tmpl");
        const mainGo = s.file(890, rows[1] - 28, 162, 56, "main.go");
        const below = rows[2] + AH / 2 + 6;
        const reads = [s.edge([greetGo.cx, greetGo.y - 6], [ACX - 44, below]), s.edge([tmpl.cx, tmpl.y - 6], [ACX + 44, below])];
        const greetX = s.edge(compileGreet, compileHello, { from: "top", to: "bottom" });
        const helloA = s.edge(compileHello, link, { from: "top", to: "bottom" });
        const readMain = s.edge(mainGo, compileHello, { from: "left", to: "right" });
        const out = s.edge(link, hello, { from: "top", to: "bottom" });
        const R = 1082;
        const greetA = s.group();
        greetA.line(AX + AW + 6, rows[2], R, rows[2], { width: 2.5, opacity: 0.55 });
        greetA.line(R, rows[2], R, rows[0], { width: 2.5, opacity: 0.55 });
        greetA.edge([R, rows[0]], link, { to: "right" });
        greetA.text(900, rows[2] - 14, "greet.a", { size: 26, mono: true });
        const names = [
          s.text(ACX + 14, (rows[1] + rows[2]) / 2 + 9, "greet.x", { size: 26, mono: true }),
          s.text(ACX + 14, (rows[0] + rows[1]) / 2 + 9, "hello.a", { size: 26, mono: true }),
        ];

        return (t, cue) => {
          // Targets, their rules, and the edges between them; then they make room for the actions.
          place(left, mix((1084 - TW) / 2, 0, during(t, cue[1] + 3.0, cue[1] + 3.9)), 0);
          appear(targetsHead, t, 0.3);
          targets.forEach((b, i) => {
            appear(b, t, 0.6 + 0.3 * i);
            show(b.labels[1], during(t, cue[0] + 4.6 + 0.2 * i, cue[0] + 5.2 + 0.2 * i) * 0.66);
          });
          const providing = during(t, cue[2] + 1.0, cue[2] + 1.6);
          deps.forEach((d, i) => show(d, during(t, cue[0] + 8.2 + 0.3 * i, cue[0] + 8.8 + 0.3 * i) * (1 - providing)));
          attrs.forEach((a, i) => appear(a, t, cue[0] + 8.4 + 0.3 * i));
          // Analysis: the rule's function registers actions, with their inputs and outputs.
          appear(actionsHead, t, cue[1] + 4.0);
          registers.forEach((r, i) => appear(r, t, cue[1] + 4.2 + 0.25 * i));
          actions.forEach((a, i) => appear(a, t, cue[1] + 4.4 + 0.25 * i));
          appear(greetGo, t, cue[1] + 5.6);
          appear(tmpl, t, cue[1] + 5.8);
          reads.forEach((e) => trace(e, during(t, cue[1] + 5.8, cue[1] + 6.4)));
          appear(mainGo, t, cue[1] + 6.2);
          trace(readMain, during(t, cue[1] + 6.4, cue[1] + 7.0));
          trace(greetX, during(t, cue[1] + 6.2, cue[1] + 6.8));
          appear(names[0], t, cue[1] + 6.4);
          trace(helloA, during(t, cue[1] + 6.8, cue[1] + 7.4));
          appear(names[1], t, cue[1] + 7.0);
          appear(greetA, t, cue[1] + 7.2);
          trace(out, during(t, cue[1] + 7.4, cue[1] + 8.0));
          appear(hello, t, cue[1] + 7.8);
          // Providers pass up the edges, each to the target that depends on it.
          provides.forEach((e, i) => {
            show(e, providing);
            e.pulse(ramp(t, cue[2] + 1.6 + 0.9 * (1 - i), cue[2] + 2.6 + 0.9 * (1 - i)), "bazel");
          });
          providers.forEach((p, i) => appear(p, t, cue[2] + 2.4 + 0.9 * (1 - i)));
        };
      },
    },
    {
      section: "Three phases",
      lines: [
        { say: "Loading evaluates BUILD files into targets, analysis runs the rules and produces the action graph, and execution runs the needed actions that are not up to date.", hold: 0.6 },
        { say: "Since Bazel 7.0, execution starts while other top-level targets are still being analyzed.", hold: 1.2 },
      ],
      draw(s) {
        // Figure 6.2's timeline: three lanes, the overlap between analysis and execution.
        const W = (label) => measure(label, { size: 26 }) + 30;
        const lanes = [["Load", 62], ["Analyze", 198], ["Execute", 366]].map(([name, y]) => s.text(0, y, name, { size: 30, weight: 600 }));
        const seps = [s.line(0, 96, 1084, 96, { opacity: 0.2 }), s.line(0, 282, 1084, 282, { opacity: 0.2 })];
        const bar = (x, y, label, kind, w = W(label)) => {
          const g = s.group();
          const rect = g.rect(x, y, w, 46, { kind, fill: 0.16, width: 2, r: 7 });
          const text = g.text(x + 15, y + 32, label, { size: 26 });
          return { g, rect, text, x, y, w, end: x + w };
        };
        const load = bar(180, 34, "BUILD files", "bazel", 250);
        const greet = bar(300, 114, "greet", "bazel", 200);
        const hello = bar(340, 168, "hello", "bazel", 280);
        const test = bar(380, 222, "greet_test", "bazel", 380);
        const cGreet = bar(greet.end, 302, "compile greet", "run");
        const cHello = bar(Math.max(cGreet.end, hello.end) + 6, 302, "compile hello", "run");
        const lHello = bar(cHello.end + 6, 302, "link hello", "run");
        const cTest = bar(Math.max(cGreet.end, test.end) + 6, 356, "compile test", "run");
        const lTest = bar(cTest.end + 6, 356, "link test", "run");
        const right = Math.max(lHello.end, lTest.end);
        const band = s.rect(greet.end, 104, test.end - greet.end, 304, { fill: 0.08, stroke: false, r: 6 });
        s.g.insertBefore(band, s.g.firstChild); // behind the bars
        const axis = s.edge([170, 444], [right + 4, 444]);
        const time = s.text(170, 480, "time", { size: 26, tone: "muted" });
        s.fit(0, 30, right + 6, 488, 0.85);

        // A bar grows from its left end, as its phase runs.
        const grow = (b, t, a, d = 0.8) => {
          const u = during(t, a, a + d);
          b.rect.setAttribute("width", Math.max(0.01, b.w * u).toFixed(1));
          show(b.g, u > 0 ? 1 : 0);
          show(b.text, during(t, a + d * 0.6, a + d));
        };
        const focus = (b, u) => b.rect.setAttribute("stroke-width", mix(2, 5, u).toFixed(2));
        return (t, cue) => {
          // Loading, then analysis, then execution.
          appear(lanes[0], t, cue[0] - 0.2);
          grow(load, t, cue[0] + 0.3, 1.2);
          appear(seps[0], t, cue[0] + 2.0);
          appear(lanes[1], t, cue[0] + 2.4);
          grow(greet, t, cue[0] + 2.8);
          grow(hello, t, cue[0] + 3.2, 1.0);
          grow(test, t, cue[0] + 3.6, 1.4);
          appear(seps[1], t, cue[0] + 6.0);
          appear(lanes[2], t, cue[0] + 6.4);
          grow(cGreet, t, cue[0] + 6.8);
          grow(cHello, t, cue[0] + 7.6);
          grow(lHello, t, cue[0] + 8.4, 0.6);
          grow(cTest, t, cue[0] + 8.0);
          grow(lTest, t, cue[0] + 8.8, 0.6);
          trace(axis, during(t, cue[0] + 0.2, cue[0] + 9.6));
          appear(time, t, cue[0] + 0.6);
          // Since 7.0: compile greet runs while greet_test is still being analyzed.
          appear(band, t, cue[1] + 1.0, 0.8);
          focus(cGreet, during(t, cue[1] + 1.8, cue[1] + 2.4));
          focus(test, during(t, cue[1] + 3.6, cue[1] + 4.2));
        };
      },
    },
    {
      section: "Skyframe",
      lines: [
        { say: "All three phases run on Skyframe: one graph of nodes, each holding a value and edges to the nodes it read.", hold: 0.6 },
        { say: "Before each command, Bazel runs `stat` on every known file; every node that depends on a changed file is marked dirty.", hold: 0.8 },
        { say: "Dirty nodes are recomputed from the bottom; when a node's value comes out the same, the nodes it invalidated are resurrected.", hold: 0.6 },
        { say: "A rerun action that writes the same bytes still counts as changed: its value records each output's file times and inode number.", hold: 0.6 },
        { say: "Each action that reads those outputs is checked against the action cache, which compares hashes only.", hold: 0.6 },
        { say: "On a hit it does not run, its value is unchanged, and pruning resumes above it.", hold: 1.2 },
      ],
      draw(s) {
        // Figure 6.3: each node points down to the nodes it read. The graph
        // stands in the middle until the action cache comes, then makes room.
        s.fit(20, 0, 1104, 838, 0.85);
        const G = s.group();
        const NW = 284, NH = 76;
        const built = G.box(300, 0, NW, NH, "`hello` built");
        const link = G.box(300, 160, NW, NH, "link hello", { mono: true });
        const cHello = G.box(550, 330, NW, NH, "compile hello", { mono: true });
        const cGreet = G.box(140, 500, NW, NH, "compile greet", { mono: true });
        const greetGo = G.file(140, 670, NW, NH, "greet.go");
        const mainGo = G.file(550, 670, NW, NH, "main.go");
        const nodes = [greetGo, mainGo, cGreet, cHello, link, built];
        const read = {
          built: G.edge(built, link, { from: "bottom", to: "top" }),
          linkHello: G.edge([500, 242], [640, 324]),
          linkGreet: G.edge([380, 242], [290, 494]),
          helloGreet: G.edge([600, 412], [384, 494]),
          helloMain: G.edge(cHello, mainGo, { from: "bottom", to: "top" }),
          greetGo: G.edge(cGreet, greetGo, { from: "bottom", to: "top" }),
        };
        // Dirty: a heavy outline in the colour of work that will run.
        const dirty = new Map([cGreet, cHello, link, built].map((b) => [b, G.rect(b.x, b.y, b.w, b.h, { kind: "run", width: 5 })]));
        const edit = G.pill(70, 708, "edit", { kind: "run" });
        const stat = G.pill(487, 708, "stat", { mono: true });
        const same = G.group();
        same.text(442, 530, "same bytes,", { size: 26, tone: "muted" });
        same.text(442, 562, "new file times", { size: 26, tone: "muted" });
        const kept = G.pill(584 + 24 + (measure("not recomputed", { size: 26 }) + 36) / 2, 38, "not recomputed", { kind: "hit" });
        // A key to the three states, each shown when it first appears.
        let x = 140;
        const keys = [["dirty", { kind: "run", width: 5 }], ["reran", { kind: "run", fill: 0.16, width: 2 }], ["cache hit", { kind: "hit", fill: 0.16, width: 2 }]].map(([label, style]) => {
          const g = G.group();
          g.rect(x, 808, 44, 28, { r: 6, ...style });
          g.text(x + 58, 832, label, { size: 26 });
          x += 58 + measure(label, { size: 26 }) + 44;
          return g;
        });
        // The action cache, which compares hashes only.
        const cache = s.cache(990, 368, { w: 220, h: 150, label: "action cache", kind: "bazel" });
        const lookups = [s.edge(link, cache, { from: "right", to: "top" }), s.edge(cHello, cache)];
        const hashes = s.text(990, 476, "hashes only", { size: 26, tone: "muted", anchor: "middle" });

        return (t, cue) => {
          place(G, mix(135, 0, during(t, cue[4] + 2.8, cue[4] + 3.6)), 0);
          // The graph: nodes, and edges to the nodes they read.
          nodes.forEach((n, i) => appear(n, t, cue[0] + 0.3 + 0.2 * i));
          Object.values(read).forEach((e, i) => trace(e, during(t, cue[0] + 5.8 + 0.15 * i, cue[0] + 6.6 + 0.15 * i)));
          // An edit; stat finds it; every node above is marked dirty, from the bottom up.
          appear(edit, t, cue[1] + 0.2);
          appear(stat, t, cue[1] + 2.0);
          // stat looks at both files; only greet.go has changed.
          const statting = during(t, cue[1] + 2.4, cue[1] + 2.9);
          greetGo.focus(statting);
          mainGo.focus(statting * (1 - during(t, cue[1] + 4.0, cue[1] + 4.6)));
          const up = (e, a) => e.pulse(1 - ramp(t, cue[1] + a, cue[1] + a + 0.7), "run");
          up(read.greetGo, 5.0);
          up(read.helloGreet, 5.8);
          up(read.linkGreet, 5.8);
          up(read.built, 6.8);
          const marked = new Map([[cGreet, 5.6], [cHello, 6.4], [link, 6.4], [built, 7.4]]);
          // compile greet reruns (its value changes); compile hello and link hello hit; hello built is resurrected.
          const rerun = during(t, cue[2] + 2.0, cue[2] + 2.6);
          const hit = during(t, cue[5] + 0.8, cue[5] + 1.4);
          const resurrect = during(t, cue[5] + 4.2, cue[5] + 4.8);
          const cleared = new Map([[cGreet, rerun], [cHello, hit], [link, hit], [built, resurrect]]);
          for (const [b, a] of marked) show(dirty.get(b), during(t, cue[1] + a, cue[1] + a + 0.5) * (1 - cleared.get(b)));
          cGreet.mark("run", rerun);
          appear(keys[0], t, cue[1] + 5.6);
          appear(keys[1], t, cue[2] + 2.2);
          appear(keys[2], t, cue[5] + 1.0);
          appear(same, t, cue[3] + 2.0);
          // The action cache: looked up with hashes only.
          appear(cache, t, cue[4] + 3.8);
          lookups.forEach((e, i) => {
            trace(e, during(t, cue[4] + 4.2 + 0.3 * i, cue[4] + 4.9 + 0.3 * i)).mark("hit", hit);
            e.pulse(ramp(t, cue[4] + 5.0 + 0.3 * i, cue[4] + 5.8 + 0.3 * i), "ink");
          });
          appear(hashes, t, cue[4] + 5.6);
          cHello.mark("hit", hit);
          link.mark("hit", hit);
          built.mark("hit", resurrect);
          appear(kept, t, cue[5] + 4.6);
        };
      },
    },
    {
      section: "Action keys and two caches",
      lines: [
        { say: "Bazel's action key hashes the command line, environment variables, mnemonic and platform, not the contents of the inputs.", hold: 0.6 },
        { say: "Its entry in the local action cache, found by its main output's path, holds one hash over the key and every input's and output's content hash.", hold: 0.6 },
        { say: "If the current files give the same hash, the action is skipped; the cache stores no file contents.", hold: 0.8 },
      ],
      draw(s) {
        // Figure 6.4, top: the action key, and the local action cache's entry.
        // The key and the files stand in the middle until the cache comes.
        s.fit(0, -52, 1048, 652, 0.85);
        const L = s.group();
        const fields = ["command line", "environment variables", "mnemonic", "platform"].map((name, i) => L.box(0, 70 * i, 340, 56, name, { r: 8 }));
        const key = L.box(420, 35, 230, 140, "action key", { weight: 600, sub: "8387f0…", subMono: true });
        const intoKey = fields.map((f) => L.edge(f, key));
        const files = ["greet.go", "greeting.tmpl", "greet.a"].map((name, i) => L.file(0, 320 + 70 * i, 340, 56, name));
        const one = L.box(420, 330, 230, 140, "one hash", { weight: 600, sub: "c41e…", subMono: true });
        const keyIn = L.edge(key, one, { from: "bottom", to: "top" });
        const filesIn = files.map((f) => L.edge(f, one));
        const cache = s.cache(880, 130, { w: 240, h: 170, label: "action cache", kind: "bazel" });
        const path = s.pill(880, -26, "bazel-out/…/greet.a", { mono: true });
        const find = s.edge([880, 3], cache, { to: "top" });
        const entry = s.box(770, 330, 220, 140, "entry", { weight: 600, sub: "c41e…", subMono: true });
        const found = s.edge(cache, entry, { from: "bottom", to: "top" });
        const match = s.pill(710, 400, "same", { kind: "hit" });
        const skipped = s.box(560, 562, 300, 88, "skipped", { kind: "hit", weight: 600 });
        const toSkip = s.edge([710, 429], skipped, { to: "top", kind: "hit" });
        const contents = s.text(880, 522, "no file contents", { size: 26, tone: "muted", anchor: "middle" });

        return (t, cue) => {
          const room = during(t, cue[1] + 0.6, cue[1] + 1.4);
          place(L, mix(199, 0, room), mix(41, 0, room));
          // The action key: the command line, environment, mnemonic and platform; not the inputs' contents.
          appear(key, t, cue[0] + 0.4);
          show(key.labels[1], during(t, cue[0] + 5.8, cue[0] + 6.4) * 0.66);
          fields.forEach((f, i) => {
            appear(f, t, cue[0] + [2.0, 2.8, 3.6, 4.2][i]);
            trace(intoKey[i], during(t, cue[0] + 4.4, cue[0] + 5.0)).pulse(ramp(t, cue[0] + 5.0, cue[0] + 5.8), "ink");
          });
          const full = during(t, cue[1] + 8.4, cue[1] + 9.0);
          files.forEach((f, i) => show(f, during(t, cue[0] + 6.0 + 0.2 * i, cue[0] + 6.6 + 0.2 * i) * mix(0.3, 1, full)));
          // The local action cache: the entry is found by the main output's path.
          appear(cache, t, cue[1] + 1.4);
          appear(path, t, cue[1] + 3.2);
          trace(find, during(t, cue[1] + 3.8, cue[1] + 4.3)).pulse(ramp(t, cue[1] + 4.3, cue[1] + 5.0), "ink");
          trace(found, during(t, cue[1] + 5.0, cue[1] + 5.6));
          appear(entry, t, cue[1] + 5.4);
          // It holds one hash over the key and every input's and output's content hash.
          appear(one, t, cue[1] + 6.0);
          show(one.labels[1], during(t, cue[1] + 10.6, cue[1] + 11.2) * 0.66);
          trace(keyIn, during(t, cue[1] + 6.6, cue[1] + 7.2)).pulse(ramp(t, cue[1] + 9.6, cue[1] + 10.5), "ink");
          filesIn.forEach((e, i) => trace(e, during(t, cue[1] + 8.6, cue[1] + 9.3)).pulse(ramp(t, cue[1] + 9.6 + 0.1 * i, cue[1] + 10.5 + 0.1 * i), "ink"));
          // The same hash as the files give now: skipped. Only hashes are stored.
          appear(match, t, cue[2] + 2.4);
          trace(toSkip, during(t, cue[2] + 3.8, cue[2] + 4.4));
          appear(skipped, t, cue[2] + 4.2);
          appear(contents, t, cue[2] + 6.0);
        };
      },
    },
    {
      section: "Action keys and two caches",
      lines: [
        { say: "In a disk or remote cache, an action becomes an Action: the hashes of its Command and input root, its platform and a timeout.", hold: 0.6 },
        { say: "The input root's hash is one hash over the whole tree of inputs, so it changes when any input does.", hold: 0.6 },
        { say: "The Action's hash is the key: a remote action cache maps it to the outputs' hashes, and a content-addressed store (CAS) maps hashes to bytes.", hold: 0.8 },
      ],
      draw(s) {
        // Figure 6.4, bottom: the Action, its input tree, the remote action cache and the CAS.
        // The Action and its tree stand in the middle until the caches come.
        s.fit(0, 0, 1000, 736);
        const mono = (g, x, y, text, more = {}) => g.text(x, y, text, { size: 28, mono: true, ...more });
        const muted = (g, x, y, text) => g.text(x, y, text, { size: 26, tone: "muted" });
        const A = s.group();
        const action = A.group();
        action.rect(0, 0, 420, 330, { kind: "remote", fill: 0.16, r: 12 });
        action.text(24, 50, "Action", { size: 32, mono: true, weight: 600 });
        const fields = [A.group(), A.group(), A.group()];
        mono(fields[0], 24, 106, "command_digest");
        muted(fields[0], 44, 140, "args, env, output paths");
        mono(fields[1], 24, 198, "input_root_digest");
        muted(fields[1], 44, 232, "hash of the input tree");
        mono(fields[2], 24, 292, "platform, timeout");

        // The input tree: names, then hashes from the leaves up.
        const tree = A.group();
        const rows = [["input root", 24, 440, false], ["internal/greet/", 70, 510, true], ["greet.go", 116, 580, true], ["greeting.tmpl", 116, 650, true], ["external/…", 70, 720, true]];
        rows.forEach(([name, x, y, code]) => tree.text(x, y, name, { size: 28, mono: code }));
        const lines = [[40, 452, 40, 711], [40, 501, 62, 501], [40, 711, 62, 711], [86, 521, 86, 641], [86, 571, 108, 571], [86, 641, 108, 641]];
        lines.forEach(([x1, y1, x2, y2]) => tree.line(x1, y1, x2, y2, { kind: "remote", width: 2.5 }));
        const HX = 372;
        const values = ["3e9a…", "b21d…", "a7c0…", "5f3e…", "0d8b…"];
        const sums = values.map((h, i) => A.text(HX, rows[i][2], h, { size: 26, mono: true, tone: "muted" }));
        const order = [2, 3, 4, 1, 0]; // leaves first, then the directory, then the root
        // Any input reaches the root: greet.go's hash, its directory's, the root's.
        const chain = [2, 1, 0].map((i) => A.text(HX, rows[i][2], values[i], { size: 26, mono: true, tone: "run" }));
        const rootUp = A.edge([60, 412], [60, 338], { kind: "remote" });

        // The Action's hash is the key.
        const hash = s.edge([428, 112], [552, 112]);
        const hashName = s.text(490, 96, "hash", { size: 26, tone: "muted", anchor: "middle" });
        const ac = s.group();
        ac.rect(560, 20, 440, 222, { kind: "remote", fill: 0.16, r: 12 });
        ac.text(584, 64, "remote action cache", { size: 30, weight: 600 });
        const acKey = mono(s, 584, 122, "4f1c… →");
        const acOut = [mono(s, 614, 168, "greet.a: 9c41…"), mono(s, 614, 212, "greet.x: 77b0…")];
        const toCas = s.edge([780, 248], [780, 324]);
        const cas = s.group();
        cas.rect(560, 330, 440, 190, { kind: "remote", fill: 0.16, r: 12 });
        cas.text(584, 374, "CAS", { size: 30, weight: 600 });
        const casKey = mono(s, 584, 430, "9c41… →");
        const bytes = s.text(614, 476, "the bytes of `greet.a`", { size: 28 });

        return (t, cue) => {
          place(A, mix(275, 0, during(t, cue[2], cue[2] + 0.7)), 0);
          appear(action, t, cue[0] + 0.4);
          [4.4, 5.8, 7.4].forEach((a, i) => appear(fields[i], t, cue[0] + a));
          // The tree, hashed from the leaves up to the input root.
          appear(tree, t, cue[1] + 0.4, 0.8);
          const changing = (j) => during(t, cue[1] + 6.4 + 0.4 * j, cue[1] + 6.8 + 0.4 * j) * (1 - during(t, cue[2], cue[2] + 0.6));
          order.forEach((i, j) => {
            const k = [2, 1, 0].indexOf(i);
            show(sums[i], during(t, cue[1] + 2.6 + 0.5 * j, cue[1] + 3.0 + 0.5 * j) * (k < 0 ? 1 : 1 - changing(k)));
          });
          chain.forEach((c, k) => show(c, changing(k)));
          trace(rootUp, during(t, cue[1] + 5.2, cue[1] + 5.8)).pulse(ramp(t, cue[1] + 5.8, cue[1] + 6.6), "remote");
          // The key; the remote action cache gives the outputs' hashes, the CAS the bytes.
          trace(hash, during(t, cue[2] + 0.8, cue[2] + 1.3)).pulse(ramp(t, cue[2] + 1.3, cue[2] + 2.0), "remote");
          appear(hashName, t, cue[2] + 0.9);
          appear(ac, t, cue[2] + 2.8);
          appear(acKey, t, cue[2] + 3.4);
          acOut.forEach((o, i) => appear(o, t, cue[2] + 5.4 + 0.4 * i));
          trace(toCas, during(t, cue[2] + 6.8, cue[2] + 7.4)).pulse(ramp(t, cue[2] + 7.4, cue[2] + 8.0), "remote");
          appear(cas, t, cue[2] + 7.2);
          appear(casKey, t, cue[2] + 8.4);
          appear(bytes, t, cue[2] + 9.0);
        };
      },
    },
    {
      section: "Action keys and two caches",
      lines: [
        { say: "Actions run in the execroot, and every path in the Command and the tree is relative to it, so the checkout's location does not enter the key.", hold: 1.4 },
      ],
      draw(s) {
        // Figure 6.4, bottom right: two checkouts at different paths give the same key.
        s.fit(0, 0, 1080, 646, 0.85);
        const checkout = (x, prefix) => {
          const g = s.group();
          g.rect(x, 0, 480, 236, { r: 12, width: 2 });
          const head = g.text(x + 20, 46, prefix, { size: 26, mono: true });
          const paths = ["internal/greet/greet.go", "external/…", "bazel-out/…"].map((p, i) => g.text(x + 20, 104 + 46 * i, p, { size: 26, mono: true }));
          const action = s.box(x + 90, 330, 300, 110, "Action", { mono: true, kind: "remote", sub: "4f1c…", subMono: true });
          const into = s.edge([x + 240, 242], action, { to: "top" });
          const out = s.edge(action, [540 + (x ? 1 : -1) * 150, 528], { from: "bottom" });
          return { g, head, paths, action, into, out };
        };
        const sides = [checkout(0, "/Users/ana/…/execroot/_main/"), checkout(600, "/ci/…/execroot/_main/")];
        const same = s.pill(540, 385, "same key");
        const shared = s.cache(540, 580, { w: 340, h: 132, label: "disk or remote cache", kind: "remote" });
        return (t, cue) => {
          sides.forEach((c, i) => {
            appear(c.g, t, cue[0] + 0.3 + 0.6 * i);
            // Relative to the execroot: the checkout's location drops out.
            show(c.head, mix(0.66, 0.3, during(t, cue[0] + 6.4, cue[0] + 7.2)));
            trace(c.into, during(t, cue[0] + 8.0 + 0.3 * i, cue[0] + 8.6 + 0.3 * i));
            appear(c.action, t, cue[0] + 8.4 + 0.3 * i);
            trace(c.out, during(t, cue[0] + 10.6, cue[0] + 11.2));
          });
          appear(same, t, cue[0] + 9.6);
          appear(shared, t, cue[0] + 10.8);
        };
      },
    },
    {
      section: "Sandboxes and persistent workers",
      lines: [
        { say: "A sandbox gives an action its own execroot holding only its declared inputs; a tool sees no undeclared file unless it knows its absolute path.", hold: 0.6 },
        { say: "Bazel moves the output back to `bazel-out`.", hold: 1.0 },
      ],
      draw(s) {
        // Figure 6.5: the sandbox links in only the declared inputs.
        s.fit(0, 0, 1114, 470, 0.85);
        const PW = 474, SX = 640, GX = (PW + SX) / 2;
        const ys = [106, 164, 222, 280, 350, 420];
        const execroot = s.group();
        execroot.rect(0, 0, PW, 470, { r: 12, width: 2 });
        execroot.text(16, 50, "execroot", { size: 30, weight: 600 });
        const names = ["internal/greet/greet.go", "internal/greet/greeting.tmpl", "internal/greet/greet_test.go", "cmd/hello/main.go", "external/rules_go++go_sdk…/", "bazel-out/…/greet.a"];
        const rows = names.map((n, i) => s.text(16, ys[i], n, { size: 26, mono: true }));
        const sandbox = s.group();
        sandbox.rect(SX, 0, PW, 470, { kind: "bazel", fill: 0.08, r: 12 });
        sandbox.text(SX + 16, 50, "sandbox for `compile greet`", { size: 30, weight: 600, tone: "bazel" });
        const linked = [0, 1, 4].map((i) => ({ i, text: s.text(SX + 16, ys[i], names[i], { size: 26, mono: true }), edge: s.edge([SX - 6, ys[i] - 9], [PW + 6, ys[i] - 9]) }));
        const absent = s.text(SX + 16, (ys[2] + ys[3]) / 2, "undeclared files absent", { size: 26, tone: "muted" });
        const symlinks = s.text(GX, 68, "symlinks", { size: 26, tone: "muted", anchor: "middle" });
        const output = s.text(SX + 16, ys[5], names[5], { size: 26, mono: true, tone: "run" });
        const back = s.edge([SX - 6, ys[5] - 9], [PW + 6, ys[5] - 9], { kind: "run" });
        const moved = s.text(GX, 456, "moved back", { size: 26, tone: "muted", anchor: "middle" });
        return (t, cue) => {
          appear(execroot, t, 0.1);
          rows.forEach((r, i) => {
            const undeclared = i === 2 || i === 3;
            show(r, i === 5 ? during(t, cue[1] + 1.4, cue[1] + 2.0) : during(t, 0.2, 0.8) * (undeclared ? mix(1, 0.3, during(t, cue[0] + 6.8, cue[0] + 7.4)) : 1));
          });
          appear(sandbox, t, cue[0] + 0.4);
          // Only the declared inputs, as symlinks to the execroot.
          appear(symlinks, t, cue[0] + 4.0);
          linked.forEach((l, j) => {
            trace(l.edge, during(t, cue[0] + 4.2 + 0.3 * j, cue[0] + 4.8 + 0.3 * j));
            appear(l.text, t, cue[0] + 4.4 + 0.3 * j);
          });
          appear(absent, t, cue[0] + 7.2);
          // The compile writes its output in the sandbox; Bazel moves it back.
          appear(output, t, cue[1] + 0.1, 0.4);
          trace(back, during(t, cue[1] + 0.6, cue[1] + 1.2)).pulse(ramp(t, cue[1] + 0.8, cue[1] + 1.6));
          appear(moved, t, cue[1] + 0.8);
        };
      },
    },
    {
      section: "Remote caching and remote execution",
      lines: [
        { say: "Bazel looks up each action's hash in the remote cache; on a miss, remote execution sends the Action to an execution service.", hold: 0.6 },
        { say: "Bazel uploads the inputs the CAS lacks; an executor from the pool runs the command and stores the outputs in the CAS.", hold: 1.0 },
        { say: "Parallelism is then bounded by the pool rather than by one machine's cores.", hold: 0.8 },
        { say: "Since 7.0, Bazel by default downloads only the outputs of top-level targets and those local actions need, knowing the rest by hash alone.", hold: 0.8 },
      ],
      draw(s) {
        // Figure 6.6: remote execution.
        s.fit(0, 4, 1086, 560, 0.85);
        const machine = s.box(0, 220, 245, 120, "your machine", { kind: "bazel", sub: "Bazel client, server" });
        const remote = s.group();
        remote.rect(315, 50, 400, 500, { kind: "remote", fill: 0.05, r: 14 });
        remote.text(335, 92, "remote cache", { size: 30, weight: 600 });
        const ac = s.box(335, 110, 360, 100, "action cache", { kind: "remote", sub: "hash → output hashes" });
        const cas = s.group();
        cas.rect(335, 228, 360, 306, { kind: "remote", fill: 0.16, r: 10 });
        cas.text(355, 268, "CAS", { size: 30, weight: 600 });
        const items = ["greet.go", "greet.a", "greet.x", "hello.a", "hello"].map((n, i) => s.file(355, 284 + 48 * i, 186, 42, n));
        const stay = s.group();
        stay.line(552, 336, 564, 336, { width: 2, opacity: 0.6 });
        stay.line(564, 336, 564, 466, { width: 2, opacity: 0.6 });
        stay.line(552, 466, 564, 466, { width: 2, opacity: 0.6 });
        stay.text(578, 394, "stay", { size: 26, tone: "muted" });
        stay.text(578, 424, "remote", { size: 26, tone: "muted" });
        const service = s.box(795, 60, 275, 70, "execution service", { kind: "remote" });
        const executors = [160, 250, 340, 430].map((y) => s.box(795, y, 275, 70, "executor"));
        const pool = s.group();
        pool.rect(781, 148, 303, 366, { r: 12, width: 2.5, dash: "10 8" });
        pool.text(932, 546, "pool", { size: 26, tone: "muted", anchor: "middle" });
        // 1 look up; 2 upload what the CAS lacks; 3 send the Action; 4 run; 5 store; 6 download only the top-level output.
        const lookup = s.edge([251, 250], ac);
        const upload = s.edge([251, 310], items[0], { kind: "remote" });
        const send = s.group();
        const route = [[122, 214], [122, 14], [932, 14]];
        send.line(...route[0], ...route[1], { width: 2.5, opacity: 0.55 });
        send.line(...route[1], ...route[2], { width: 2.5, opacity: 0.55 });
        const arrive = send.edge(route[2], service, { to: "top" });
        const parcel = s.circle(0, 0, 11, { kind: "remote" });
        const store = executors.map((e, i) => s.edge(e, [701, items[i + 1].cy], { from: "left", kind: "remote" }));
        const download = s.edge([349, items[4].cy], machine, { to: "bottom", kind: "remote" });
        // Where the Action is along the route at u, from 0 to 1.
        const lengths = [200, 810];
        const along = (u) => {
          const d = u * (lengths[0] + lengths[1]);
          return d < lengths[0] ? [122, 214 - d] : [122 + (d - lengths[0]), 14];
        };

        return (t, cue) => {
          appear(machine, t, 0.1);
          appear(remote, t, cue[0] + 2.8);
          appear(ac, t, cue[0] + 3.0);
          appear(cas, t, cue[0] + 3.2);
          // 1: look up the hash; a miss.
          trace(lookup, during(t, cue[0] + 3.8, cue[0] + 4.4)).pulse(ramp(t, cue[0] + 4.4, cue[0] + 5.2), "ink");
          ac.mark("run", during(t, cue[0] + 5.0, cue[0] + 5.4) * (1 - during(t, cue[1], cue[1] + 0.5)));
          appear(service, t, cue[0] + 6.4);
          executors.forEach((e, i) => appear(e, t, cue[0] + 6.8 + 0.15 * i));
          // 2: upload the inputs the CAS lacks; 3: send the Action.
          trace(upload, during(t, cue[1] + 0.4, cue[1] + 1.0)).pulse(ramp(t, cue[1] + 1.0, cue[1] + 1.8), "remote");
          appear(items[0], t, cue[1] + 1.7);
          appear(send, t, cue[1] + 2.0, 0.4);
          const moving = ramp(t, cue[1] + 2.4, cue[1] + 3.6);
          place(parcel, ...along(moving));
          show(parcel, moving > 0 && moving < 1 ? 1 : 0);
          arrive.pulse(ramp(t, cue[1] + 3.6, cue[1] + 4.0), "remote");
          // 4: executors run; 5: they store the outputs in the CAS.
          const done = during(t, cue[3], cue[3] + 0.6);
          executors.forEach((e, i) => e.mark("run", during(t, cue[1] + 4.4 + 0.2 * i, cue[1] + 4.9 + 0.2 * i) * (1 - done)));
          store.forEach((e, i) => {
            trace(e, during(t, cue[1] + 6.8 + 0.15 * i, cue[1] + 7.4 + 0.15 * i)).pulse(ramp(t, cue[1] + 7.4 + 0.15 * i, cue[1] + 8.2 + 0.15 * i), "remote");
            appear(items[i + 1], t, cue[1] + 8.0 + 0.15 * i);
          });
          // Bounded by the pool, not by one machine's cores.
          appear(pool, t, cue[2] + 1.6, 0.8);
          // 6: download only the top-level output; the rest stay remote, known by hash.
          trace(download, during(t, cue[3] + 2.4, cue[3] + 3.2)).pulse(ramp(t, cue[3] + 3.2, cue[3] + 4.2), "remote");
          items[4].focus(during(t, cue[3] + 2.2, cue[3] + 2.8));
          appear(stay, t, cue[3] + 7.8);
        };
      },
    },
    {
      section: "What the design costs",
      lines: [
        { say: "The server, a long-lived Java process, keeps every Skyframe node in its heap, which grows with targets and configurations.", hold: 0.8 },
        { say: "A restart loses the graph, so loading and analysis run again, a cost every new CI runner pays.", hold: 1.0 },
      ],
      draw(s) {
        // Figure 6.7: a short-lived client, a long-lived server, and the output base on disk.
        s.fit(0, 0, 1080, 430, 0.85);
        const client = s.box(0, 150, 220, 120, "bazel", { mono: true, weight: 600, sub: "client" });
        const talk = s.edge([226, 210], [294, 210]);
        const server = s.group();
        server.rect(300, 0, 420, 430, { kind: "bazel", fill: 0.1, r: 14 });
        server.text(322, 46, "server (Java, long-lived)", { size: 30, weight: 600 });
        const heap = s.group();
        heap.rect(322, 70, 376, 270, { r: 10, width: 2 });
        heap.text(342, 110, "heap: Skyframe graph", { size: 28 });
        // The graph: layers of nodes, each pointing at nodes in the layer below.
        const layers = [[460, 560], [400, 500, 600], [370, 450, 530, 630], [360, 420, 480, 540, 600, 660]];
        const ys = [146, 194, 244, 300];
        const at = layers.flatMap((xs, l) => xs.map((x) => [x, ys[l], l]));
        const links = [];
        at.forEach(([x, y, l], i) => {
          if (l === 0) return;
          const above = at.map((p, j) => [p, j]).filter(([p]) => p[2] === l - 1).sort((a, b) => Math.abs(a[0][0] - x) - Math.abs(b[0][0] - x));
          for (const [p, j] of above.slice(0, 2)) links.push([j, i, s.line(p[0], p[1], x, y, { width: 2, opacity: 0.35 })]);
        });
        const nodes = at.map(([x, y]) => ({ ink: s.circle(x, y, 9, { fill: 0.8 }), again: s.circle(x, y, 9, { kind: "run", fill: 1 }) }));
        const first = 5; // the first nodes; the rest come as the graph grows
        const lost = s.group();
        lost.rect(322, 356, 376, 54, { kind: "run", fill: 0.16, r: 8 });
        lost.text(510, 392, "lost on restart", { size: 26, tone: "run", anchor: "middle" });
        const keep = s.edge([726, 210], [794, 210]);
        const base = s.group();
        base.rect(800, 0, 280, 430, { r: 14, width: 2.5 });
        base.text(820, 46, "output base (disk)", { size: 30, weight: 600 });
        ["action_cache/", "execroot/_main/", "  bazel-out/", "external/"].forEach((n, i) => base.text(820 + (n.startsWith(" ") ? 30 : 0), 110 + 50 * i, n.trim(), { size: 26, mono: true }));
        const kept = s.text(820, 392, "kept on restart", { size: 26, tone: "muted" });

        return (t, cue) => {
          appear(client, t, 0.1);
          trace(talk, during(t, 0.4, 1.0));
          appear(server, t, 0.6);
          appear(heap, t, cue[0] + 3.0);
          // The graph grows; a restart loses it; loading and analysis build it again.
          const restart = during(t, cue[1] + 0.4, cue[1] + 1.2);
          const when = (i) => (i < first ? cue[0] + 3.4 + 0.15 * i : cue[0] + 5.6 + 0.15 * (i - first));
          const again = (i) => cue[1] + 2.6 + 0.2 * i;
          nodes.forEach((n, i) => {
            show(n.ink, during(t, when(i), when(i) + 0.4) * (1 - restart));
            show(n.again, during(t, again(i), again(i) + 0.4));
          });
          for (const [a, b, line] of links) {
            const late = Math.max(a, b);
            show(line, during(t, when(late), when(late) + 0.4) * (1 - restart) + during(t, again(late), again(late) + 0.4));
          }
          trace(keep, during(t, 1.0, 1.5));
          appear(base, t, 1.2);
          appear(lost, t, cue[1] + 0.8);
          appear(kept, t, cue[1] + 1.6);
        };
      },
    },
  ],
};
