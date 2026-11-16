// Chapter 3's film: what a repository must change to build under Bazel.
// Every input is declared (embedded files, test data in a runfiles tree),
// then the habits that change: BUILD files kept by Gazelle and checked in
// CI, go generate as a cached action, cgo and the C toolchain, explicit
// configuration, nogo in place of go vet, and two front ends. Every
// sentence comes from the chapter; the test-data scene follows Figure 3.1.

import { during, measure, mix, place, ramp, show } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// The sides of a plain rectangle, so that edges can attach to it.
const sides = (x, y, w, h) => ({ left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h] });
const ofPill = (p) => sides(p.cx - p.w / 2, p.cy - p.h / 2, p.w, p.h);
// A line through text drawn at (x, y): a file that is not there, a line removed.
function strike(s, x, y, string, { size = 28, mono = true } = {}) {
  const w = measure(string, { size, mono });
  return s.line(x - 4, y - size * 0.3, x + w + 4, y - size * 0.3, { width: 2.5, opacity: 0.8 });
}
// The engine's travelling dot takes a colour's meaning; data that is neither runs nor hits moves in ink.
function inked(edge) {
  edge.pulse(0);
  edge.dot.setAttribute("fill", "currentColor");
  return edge;
}
// Draw an edge up to part u, at strength alpha; hidden until it starts (a round cap would leave a dot).
function lay(edge, u, alpha = 1) {
  edge.trace(u);
  show(edge, u > 0 ? alpha : 0);
  return edge;
}
// A faint outline: a directory, a fence.
function outline(s, x, y, w, h, { dash = null, opacity = 0.45, kind = null, fill = null, r = 10 } = {}) {
  const rect = s.rect(x, y, w, h, { r, width: 2, dash, kind, fill });
  if (!kind) rect.setAttribute("stroke-opacity", opacity);
  return rect;
}

export default {
  chapter: "3",
  title: "Constraints of the setup",
  scenes: [
    {
      // The chapter's opening: the four rules behind almost every change.
      lines: [
        { say: "A repository that builds with `go build` does not build under Bazel unchanged; almost every change follows from four rules.", hold: 2 },
      ],
      draw(s) {
        s.fit(0, 0, 1040, 556);
        const repo = s.box(0, 200, 240, 90, "repository");
        const go = s.box(360, 40, 240, 80, "`go build`", { kind: "go", mono: true });
        const bazel = s.box(360, 370, 240, 80, "Bazel", { kind: "bazel" });
        const toGo = s.edge(repo, go);
        const toBazel = s.edge(repo, bazel);
        const builds = s.pill(720, 80, "builds");
        const fails = s.pill(760, 410, "does not build");
        const brace = s.group();
        brace.line(606, 410, 650, 410, { width: 2.5, opacity: 0.45 });
        brace.line(650, 300, 650, 520, { width: 2.5, opacity: 0.45 });
        const rules = ["inputs declared", "sandbox", "graph in BUILD files", "explicit configuration"].map((label, i) => {
          const y = 300 + 73.3 * i;
          const g = s.group();
          g.line(650, y, 676, y, { width: 2.5, opacity: 0.45 });
          g.circle(706, y, 24, { fill: 0, stroke: true });
          g.text(706, y + 9, String(i + 1), { size: 26, weight: 600, anchor: "middle" });
          g.text(746, y + 10, label, { size: 28 });
          return g;
        });
        return (t, cue) => {
          appear(repo, t, cue[0] + 0.2);
          lay(toGo, during(t, cue[0] + 1.0, cue[0] + 1.8));
          appear(go, t, cue[0] + 1.4);
          appear(builds, t, cue[0] + 2.6);
          lay(toBazel, during(t, cue[0] + 3.4, cue[0] + 4.2));
          appear(bazel, t, cue[0] + 3.8);
          show(fails, during(t, cue[0] + 4.8, cue[0] + 5.4) * (1 - during(t, cue[0] + 6.2, cue[0] + 6.6)));
          appear(brace, t, cue[0] + 6.6);
          rules.forEach((r, i) => appear(r, t, cue[0] + 7.0 + 0.6 * i));
        };
      },
    },
    {
      section: "Every input is declared",
      lines: [
        "Bazel keys each action by its declared inputs and runs it in a sandbox, a working directory holding only those inputs.",
        { say: "A file the action reads without declaring it is either missing or invisible to the cache key.", hold: 1 },
        { say: "`//go:embed` is one: rules_go matches embed patterns against `embedsrcs` alone, so an unlisted file fails with `could not embed`.", hold: 1 },
        { say: "Gazelle lists embedded files for you.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, 0, 1020, 660);
        const key = s.box(250, 0, 200, 90, "key", { weight: 600 });
        const sandbox = s.group();
        outline(sandbox, 0, 170, 720, 490, { dash: "10 8", opacity: 0.6, r: 14 });
        sandbox.text(24, 212, "sandbox", { size: 26, tone: "muted" });
        // The two lists of declared inputs.
        const srcs = s.group();
        srcs.file(30, 240, 300, 150, "");
        srcs.text(50, 280, "`srcs`", { size: 28 });
        srcs.file(60, 302, 240, 64, "Go sources", { mono: false });
        const emb = s.group();
        emb.file(390, 240, 300, 150, "");
        emb.text(410, 280, "`embedsrcs`", { size: 28 });
        outline(emb, 420, 302, 240, 64, { dash: "6 6", opacity: 0.35, r: 6 });
        const srcsSides = sides(30, 240, 300, 150), embSides = sides(390, 240, 300, 150);
        const compile = s.box(240, 490, 220, 80, "compile");
        const toKey = [s.edge(srcsSides, key, { from: "top", to: "bottom" }), s.edge(embSides, key, { from: "top", to: "bottom" })];
        const toCompile = [s.edge(srcsSides, compile, { from: "bottom", to: "top" }), s.edge(embSides, compile, { from: "bottom", to: "top" })];
        toKey.forEach(inked);
        toCompile.forEach(inked);
        // A file beside the source, outside the sandbox and outside the key.
        const file = s.file(780, 476, 240, 64, "embedded file", { mono: false });
        const notInKey = s.pill(900, 426, "not in key");
        // Read by a relative path, it is missing; by an absolute path, it is reached but not keyed.
        const absolute = s.edge({ right: [460, 508] }, file);
        const absLabel = s.text(486, 492, "absolute path", { size: 26, tone: "muted" });
        const reach = s.edge({ right: [460, 548] }, [714, 548]);
        const stop = s.line(720, 526, 720, 570, { width: 6, opacity: 1 });
        const missing = s.text(706, 596, "missing", { size: 26, anchor: "end" });
        // The embed directive, and the builder's failure.
        const embed = s.pill(132, 530, "`//go:embed`", { mono: true });
        const fail = s.pill(350, 615, "`could not embed`", { mono: true });
        return (t, cue) => {
          // The key and the sandbox: the declared inputs only.
          appear(srcs, t, cue[0] + 0.6);
          appear(emb, t, cue[0] + 1.0);
          appear(key, t, cue[0] + 1.6);
          toKey.forEach((e, i) => lay(e, during(t, cue[0] + 2.0 + 0.2 * i, cue[0] + 2.8 + 0.2 * i)).pulse(ramp(t, cue[0] + 3.0, cue[0] + 3.8)));
          appear(sandbox, t, cue[0] + 4.6);
          appear(compile, t, cue[0] + 5.2);
          toCompile.forEach((e, i) => lay(e, during(t, cue[0] + 5.6 + 0.2 * i, cue[0] + 6.4 + 0.2 * i)));
          // An undeclared file: missing in the sandbox, invisible to the key.
          const gone = 1 - during(t, cue[2] + 0.2, cue[2] + 0.8);
          appear(file, t, cue[1] + 0.4);
          lay(reach, during(t, cue[1] + 1.6, cue[1] + 2.4), gone);
          show(stop, during(t, cue[1] + 2.4, cue[1] + 2.7) * gone);
          show(missing, during(t, cue[1] + 2.8, cue[1] + 3.3) * gone);
          lay(absolute, during(t, cue[1] + 4.2, cue[1] + 5.4), gone);
          show(absLabel, during(t, cue[1] + 4.4, cue[1] + 5.0) * gone);
          show(notInKey, during(t, cue[1] + 5.8, cue[1] + 6.4) * (1 - during(t, cue[3] + 0.6, cue[3] + 1.0)));
          // //go:embed matches only embedsrcs, which lists nothing.
          appear(embed, t, cue[2] + 0.6);
          toCompile[1].pulse(t < cue[3] ? 1 - ramp(t, cue[2] + 4.0, cue[2] + 5.0) : ramp(t, cue[3] + 1.8, cue[3] + 2.6));
          show(fail, during(t, cue[2] + 6.6, cue[2] + 7.2) * (1 - during(t, cue[3] + 1.6, cue[3] + 2.0)));
          // Gazelle lists the file in embedsrcs: now it is in the sandbox and in the key.
          const moved = during(t, cue[3] + 0.4, cue[3] + 1.4);
          place(file, -360 * moved, -174 * moved);
          toKey[1].pulse(ramp(t, cue[3] + 1.8, cue[3] + 2.6));
        };
      },
    },
    {
      section: "Every input is declared",
      lines: [
        "`go test` runs a test in its package's source directory, where tests keep files in `testdata/`.",
        "`bazel test` runs it in a runfiles tree holding the test binary and the files listed in `data`.",
        { say: "rules_go changes into the package's directory there, so `testdata/report.golden` still resolves if it is declared.", hold: 1 },
        { say: "Without the `data` line, the test fails, with or without the sandbox.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, 0, 1050, 566, 0.82);
        // go test: the package directory itself.
        const L = s.group();
        const left = L.group();
        left.text(0, 26, "`go test ./golden`", { size: 28, weight: 600, tone: "go" });
        outline(left, 0, 46, 470, 250);
        left.text(20, 92, "`golden/`", { size: 28, weight: 600 });
        left.text(36 + measure("golden/", { size: 28, weight: 600, mono: true }), 92, "package directory", { size: 26, tone: "muted" });
        left.text(20, 140, "`golden.go`", { size: 28 });
        left.text(20, 184, "`golden_test.go`", { size: 28 });
        const foundL = L.rect(10, 202, 400, 44, { kind: "go", fill: 0.16, stroke: false, r: 6 });
        const goldenL = L.text(20, 234, "`testdata/report.golden`", { size: 28 });
        const testL = L.box(0, 380, 470, 110, "`golden.test`", { kind: "go", sub: "working directory: `golden/`" });
        const openL = L.edge([200, 374], [200, 254]);
        const okL = L.text(220, 334, "open: found", { size: 26 });
        // bazel test: a runfiles tree, inside a sandbox.
        const head = s.text(540, 26, "`bazel test //golden:golden_test`", { size: 26, weight: 600, tone: "bazel" });
        const sandbox = s.group();
        outline(sandbox, 540, 46, 510, 470, { opacity: 0.6, r: 12 });
        sandbox.text(1034, 80, "sandbox", { size: 26, anchor: "end", tone: "muted" });
        const tree = s.group();
        tree.rect(556, 96, 478, 200, { kind: "bazel", fill: 0.12, width: 1.5, r: 8 });
        tree.text(572, 138, "`_main/golden/`", { size: 28, weight: 600 });
        tree.text(588 + measure("_main/golden/", { size: 28, weight: 600, mono: true }), 138, "runfiles tree", { size: 26, tone: "muted" });
        const binary = s.text(572, 184, "`golden_test_/golden_test`", { size: 28 });
        const slot = outline(s, 564, 204, 400, 44, { dash: "6 6", opacity: 0.35, r: 6 });
        const linked = s.rect(564, 204, 400, 44, { kind: "bazel", fill: 0.2, stroke: false, r: 6 });
        const goldenR = s.text(576, 236, "`testdata/report.golden`", { size: 28 });
        const struck = strike(s, 576, 236, "testdata/report.golden");
        const testR = s.box(556, 380, 478, 110, "`golden_test`", { kind: "bazel", sub: "working directory: `_main/golden/`" });
        const openR = s.edge([700, 374], [700, 254]);
        const okR = s.text(720, 334, "open: found", { size: 26 });
        const noR = s.text(720, 334, "open: no such file", { size: 26 });
        const data = s.text(540, 560, '`data = glob(["testdata/**"])`', { size: 28 });
        const dataStruck = strike(s, 540, 560, 'data = glob(["testdata/**"])');
        return (t, cue) => {
          // The package directory, where the test runs and finds its file; alone in the middle, then to the left.
          place(L, 290 * (1 - during(t, cue[1], cue[1] + 0.8)), 0);
          appear(left, t, cue[0] + 0.2);
          appear(testL, t, cue[0] + 1.6);
          appear(goldenL, t, cue[0] + 0.2);
          lay(openL, during(t, cue[0] + 4.4, cue[0] + 5.2));
          appear(foundL, t, cue[0] + 5.0);
          appear(okL, t, cue[0] + 5.2);
          // A runfiles tree: links to the binary, and to the files in data.
          appear(head, t, cue[1] + 0.8);
          appear(tree, t, cue[1] + 1.8);
          appear(binary, t, cue[1] + 5.4);
          appear(slot, t, cue[1] + 7.0);
          // rules_go starts the test in the package's directory there; declared, the file resolves.
          appear(testR, t, cue[2] + 0.4);
          const declared = during(t, cue[2] + 4.8, cue[2] + 5.4) * (1 - during(t, cue[3] + 0.6, cue[3] + 1.2));
          show(data, during(t, cue[2] + 4.4, cue[2] + 5.0) * (1 - 0.5 * during(t, cue[3] + 0.4, cue[3] + 0.9)));
          show(dataStruck, during(t, cue[3] + 0.2, cue[3] + 0.6));
          show(linked, declared);
          show(goldenR, mix(0.25, 1, declared) * during(t, cue[1] + 7.0, cue[1] + 7.6));
          show(struck, during(t, cue[3] + 1.0, cue[3] + 1.4));
          lay(openR, during(t, cue[2] + 5.6, cue[2] + 6.4));
          show(okR, during(t, cue[2] + 6.2, cue[2] + 6.6) * (1 - during(t, cue[3] + 1.4, cue[3] + 1.7)));
          // Without the data line, the test fails; without the sandbox, too.
          show(noR, during(t, cue[3] + 1.8, cue[3] + 2.2));
          show(sandbox, during(t, cue[1] + 0.8, cue[1] + 1.4) * (1 - during(t, cue[3] + 3.4, cue[3] + 4.0)));
        };
      },
    },
    {
      section: "Habits that change",
      lines: [
        "The go command derives the graph from imports on every run; Bazel reads it from BUILD files.",
        "Gazelle derives those files from the source, leaving alone anything marked `# keep`.",
        { say: "A stale BUILD file goes unnoticed by `go test` and fails only under Bazel.", hold: 1 },
        { say: "In diff mode Gazelle prints what it would change and, if anything would, exits with status 1: a CI check.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, 0, 1040, 670);
        // The source: one package.
        const source = s.group();
        outline(source, 0, 170, 290, 230);
        source.text(20, 212, "`golden/`", { size: 28, weight: 600 });
        source.text(20, 258, "`golden.go`", { size: 28 });
        source.text(20, 302, "`golden_test.go`", { size: 28 });
        const added = s.group();
        added.rect(10, 320, 200, 38, { kind: "run", fill: 0.16, stroke: false, r: 6 });
        added.text(20, 348, "`testdata/`", { size: 28 });
        const src = sides(0, 170, 290, 230);
        // The go command derives the graph on every run.
        const go = s.box(380, 0, 260, 80, "go command", { kind: "go" });
        const derive = inked(s.edge(src, go, { from: "top", to: "left" }));
        const every = s.text(510, 122, "from imports, every run", { size: 26, anchor: "middle", tone: "muted" });
        const goOk = s.pill(900, 40, "`go test` ok", { mono: true });
        const toGoOk = inked(s.edge(go, [900 - goOk.w / 2, 40]));
        // Bazel reads BUILD files, which Gazelle writes.
        const gazelle = s.box(370, 245, 180, 80, "Gazelle");
        const build = s.file(600, 245, 260, 80, "`BUILD.bazel`");
        const bazel = s.box(890, 245, 150, 80, "Bazel", { kind: "bazel" });
        const toGazelle = inked(s.edge(src, gazelle));
        const writes = inked(s.edge(gazelle, build));
        const reads = inked(s.edge(build, bazel));
        const keep = s.pill(730, 205, "`# keep`", { mono: true });
        const stale = s.pill(730, 205, "stale");
        const fails = s.pill(965, 392, "fails");
        const toFails = s.edge(bazel, [965, 392 - fails.h / 2], { from: "bottom" });
        // In CI, Gazelle's diff mode.
        const ci = s.box(560, 480, 340, 100, "CI check", { sub: "Gazelle `-mode=diff`" });
        const fromSrc = inked(s.edge(src, ci, { from: "bottom", to: "left" }));
        const fromBuild = inked(s.edge(build, ci, { from: "bottom", to: "top" }));
        const diff = s.text(560, 628, '`+ data = glob(["testdata/**"])`', { size: 26 });
        const exit = s.text(560, 666, "`exit=1`", { size: 26 });
        return (t, cue) => {
          // Two descriptions of one graph.
          appear(source, t, cue[0] + 0.2);
          appear(go, t, cue[0] + 0.8);
          lay(derive, during(t, cue[0] + 1.0, cue[0] + 1.8));
          appear(every, t, cue[0] + 2.4);
          appear(build, t, cue[0] + 5.0);
          appear(bazel, t, cue[0] + 5.6);
          lay(reads, during(t, cue[0] + 5.6, cue[0] + 6.2));
          // Gazelle writes them from the source, and keeps what is marked.
          appear(gazelle, t, cue[1] + 0.2);
          lay(toGazelle, during(t, cue[1] + 0.4, cue[1] + 1.0)).pulse(ramp(t, cue[1] + 1.2, cue[1] + 1.8));
          lay(writes, during(t, cue[1] + 0.8, cue[1] + 1.2)).pulse(ramp(t, cue[1] + 1.9, cue[1] + 2.4));
          show(keep, during(t, cue[1] + 4.0, cue[1] + 4.6) * (1 - during(t, cue[2], cue[2] + 0.4)));
          // An edit the BUILD file does not follow.
          appear(added, t, cue[2] + 0.4);
          appear(stale, t, cue[2] + 1.0);
          derive.pulse(ramp(t, cue[2] + 2.0, cue[2] + 2.8));
          lay(toGoOk, during(t, cue[2] + 2.6, cue[2] + 3.0)).pulse(ramp(t, cue[2] + 2.9, cue[2] + 3.3));
          appear(goOk, t, cue[2] + 3.3);
          reads.pulse(ramp(t, cue[2] + 4.2, cue[2] + 4.8));
          lay(toFails, during(t, cue[2] + 4.8, cue[2] + 5.2));
          appear(fails, t, cue[2] + 5.2);
          // The CI check: Gazelle compares, prints the change, and fails.
          appear(ci, t, cue[3] + 0.4);
          lay(fromSrc, during(t, cue[3] + 0.6, cue[3] + 1.2)).pulse(ramp(t, cue[3] + 1.4, cue[3] + 2.2));
          lay(fromBuild, during(t, cue[3] + 0.6, cue[3] + 1.2)).pulse(ramp(t, cue[3] + 1.4, cue[3] + 2.0));
          appear(diff, t, cue[3] + 2.6);
          appear(exit, t, cue[3] + 6.0);
        };
      },
    },
    {
      section: "Habits that change",
      lines: [
        "`go generate` never runs during `go build`, so its output must be in the source tree first.",
        { say: "Under Bazel the generator can be one more action: a `genrule`, with declared tools and outputs.", hold: 1.2 },
        { say: "Its output is cached, and rebuilt only when the generator or the rule changes.", hold: 1.2 },
        { say: "The price is that plain `go build` no longer sees the file.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, 0, 980, 612);
        // go generate, by hand, writes into the source tree; go build reads it.
        const G = s.group();
        const generate = G.box(40, 0, 340, 100, "`go generate`", { kind: "go", sub: "by hand" });
        const tree = G.group();
        outline(tree, 0, 170, 420, 210);
        tree.text(20, 208, "source tree", { size: 26, tone: "muted" });
        tree.text(20, 258, "`version/version.go`", { size: 28 });
        const written = G.rect(10, 282, 390, 42, { kind: "go", fill: 0.16, stroke: false, r: 6 });
        const genFile = G.text(20, 312, "`version/version_gen.go`", { size: 28 });
        const genStruck = strike(G, 20, 312, "version/version_gen.go");
        const tr = sides(0, 170, 420, 210);
        const goBuild = G.box(40, 460, 340, 80, "`go build`", { kind: "go" });
        const writes = G.edge(generate, tr, { from: "bottom", to: "top" }).pulse(0, "go");
        const reads = inked(G.edge(tr, goBuild, { from: "bottom", to: "top" }));
        const undefined_ = G.text(210, 600, "undefined: `generated`", { size: 26, anchor: "middle" });
        // Under Bazel: the generator is an action in the graph.
        const tool = s.file(580, 0, 400, 80, "`//tools/genversion`");
        const gen = s.box(620, 150, 320, 100, "`gen`", { sub: "genrule", subMono: true });
        const out = s.file(620, 320, 320, 80, "`version_gen.go`");
        const compile = s.box(620, 460, 320, 80, "compile `version`");
        const toGen = inked(s.edge(tool, gen, { from: "bottom", to: "top" }));
        const toOut = s.edge(gen, out, { from: "bottom", to: "top" });
        const toCompile = s.edge(out, compile, { from: "bottom", to: "top" });
        const edit = s.pill(500, 40, "edit", { kind: "run" });
        return (t, cue) => {
          // By hand, before the build; alone in the middle until Bazel's side comes.
          place(G, 280 * (1 - during(t, cue[1], cue[1] + 0.8)), 0);
          appear(generate, t, cue[0] + 0.2);
          appear(tree, t, cue[0] + 1.4);
          lay(writes, during(t, cue[0] + 1.8, cue[0] + 2.4)).pulse(ramp(t, cue[0] + 2.6, cue[0] + 3.4));
          show(genFile, during(t, cue[0] + 3.4, cue[0] + 3.9) * (1 - 0.6 * during(t, cue[3] + 0.4, cue[3] + 1.0)));
          show(written, during(t, cue[0] + 3.4, cue[0] + 3.9) * (1 - during(t, cue[3] + 0.4, cue[3] + 1.0)));
          show(genStruck, during(t, cue[3] + 0.6, cue[3] + 1.0));
          appear(goBuild, t, cue[0] + 5.6);
          lay(reads, during(t, cue[0] + 5.8, cue[0] + 6.4)).pulse(t < cue[3] ? ramp(t, cue[0] + 6.6, cue[0] + 7.2) : ramp(t, cue[3] + 1.4, cue[3] + 2.2));
          // One more action, with declared tools and outputs; it runs.
          appear(tool, t, cue[1] + 1.4);
          appear(gen, t, cue[1] + 3.0);
          lay(toGen, during(t, cue[1] + 3.2, cue[1] + 3.8));
          appear(out, t, cue[1] + 5.6);
          lay(toOut, during(t, cue[1] + 5.4, cue[1] + 6.0));
          appear(compile, t, cue[1] + 6.2);
          lay(toCompile, during(t, cue[1] + 6.2, cue[1] + 6.8));
          const first = during(t, cue[1] + 4.6, cue[1] + 5.0) * (1 - during(t, cue[2] + 0.6, cue[2] + 1.0));
          gen.mark("run", first + during(t, cue[2] + 5.6, cue[2] + 6.0));
          compile.mark("run", during(t, cue[1] + 6.8, cue[1] + 7.2) * (1 - during(t, cue[2] + 0.6, cue[2] + 1.0)));
          // Cached: the next build skips both, until the generator changes.
          gen.mark("hit", during(t, cue[2] + 1.0, cue[2] + 1.4) * (1 - during(t, cue[2] + 5.6, cue[2] + 6.0)));
          compile.mark("hit", during(t, cue[2] + 1.2, cue[2] + 1.6) * (1 - during(t, cue[2] + 5.6, cue[2] + 6.0)));
          appear(edit, t, cue[2] + 4.4);
          toGen.pulse(ramp(t, cue[2] + 4.8, cue[2] + 5.6));
          // Plain go build no longer finds the generated file.
          appear(undefined_, t, cue[3] + 2.4);
        };
      },
    },
    {
      section: "Habits that change",
      lines: [
        { say: "With `go`, cgo runs whatever compiler `CC` names; rules_go uses the C toolchain registered in Bazel, or turns cgo off (pure mode) if none matches.", hold: 1 },
        { say: "By default rules_cc configures one from the host's compiler, but Bazel does not track tools outside the workspace.", hold: 1 },
        "On macOS even code without cgo goes through it, and under rules_go the race detector needs cgo.",
        { say: "We recommend pinning the C toolchain as firmly as the Go SDK before sharing a cache.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, 0, 1040, 620);
        // The go command: whatever CC names.
        const go = s.box(0, 20, 280, 80, "go command", { kind: "go" });
        const host = s.group();
        const hostBox = host.box(0, 300, 280, 90, "host compiler");
        const pinnedLabel = host.text(140, 356, "pinned compiler", { size: 32, anchor: "middle" });
        const cc = s.edge(go, hostBox, { from: "bottom", to: "top" });
        const ccLabel = s.text(160, 214, "`CC`", { size: 28 });
        // Bazel: a registered C toolchain feeds the key; the workspace is what it tracks.
        const fence = s.group();
        outline(fence, 320, 0, 720, 620, { dash: "10 8", opacity: 0.6, r: 14 });
        fence.text(1020, 44, "workspace", { size: 26, anchor: "end", tone: "muted" });
        const sources = s.file(360, 40, 280, 72, "Go sources", { mono: false });
        const sdk = s.file(360, 150, 280, 72, "Go SDK", { mono: false });
        const toolchain = s.box(360, 270, 280, 90, "C toolchain");
        const key = s.box(700, 140, 130, 90, "key", { weight: 600 });
        const compile = s.box(870, 130, 160, 110, "compile", { sub: "cgo" });
        const pure = s.text(950, 221, "pure", { size: 26, anchor: "middle" });
        const feeds = [sources, sdk, toolchain].map((x) => inked(s.edge(x, key)));
        const toCompile = s.edge(key, compile);
        const fromHost = s.edge(hostBox, toolchain);
        const untracked = s.pill(140, 450, "not tracked");
        // What goes through the toolchain.
        const macos = s.pill(0, 345, "macOS link");
        const race = s.pill(0, 415, "race detector");
        place(macos, 720 + macos.w / 2, 0);
        place(race, 720 + race.w / 2, 0);
        const needs = [[macos, 345], [race, 415]].map(([p, cy]) => s.edge(toolchain, [714, cy]));
        // Pinned: the compiler moves inside the workspace, under the toolchain, and so into its key.
        const dest = sides(360, 480, 280, 90);
        const usedBy = inked(s.edge(dest, toolchain, { from: "top", to: "bottom" }));
        return (t, cue) => {
          // CC names a compiler on the host.
          const moved = during(t, cue[3] + 1.2, cue[3] + 2.6);
          show(go, during(t, cue[0] + 0.2, cue[0] + 0.8) * (1 - 0.6 * moved));
          appear(host, t, cue[0] + 1.2);
          lay(cc, during(t, cue[0] + 1.8, cue[0] + 2.4), 1 - during(t, cue[3] + 1.2, cue[3] + 2.6));
          // The C toolchain registered in Bazel; with none, pure mode.
          appear(fence, t, cue[0] + 3.4);
          appear(sources, t, cue[0] + 3.8);
          appear(sdk, t, cue[0] + 4.0);
          const none = during(t, cue[0] + 7.6, cue[0] + 8.2) * (1 - during(t, cue[1], cue[1] + 0.6));
          show(toolchain, during(t, cue[0] + 4.6, cue[0] + 5.2) * (1 - 0.75 * none));
          appear(key, t, cue[0] + 5.4);
          appear(compile, t, cue[0] + 5.8);
          feeds.forEach((e, i) => lay(e, during(t, cue[0] + 5.6 + 0.2 * i, cue[0] + 6.2 + 0.2 * i)));
          lay(toCompile, during(t, cue[0] + 6.4, cue[0] + 7.0));
          show(compile.labels[1], 0.66 * (1 - during(t, cue[0] + 7.6, cue[0] + 7.9)) + 0.66 * during(t, cue[1] + 0.3, cue[1] + 0.6));
          show(pure, during(t, cue[0] + 7.9, cue[0] + 8.2) * (1 - during(t, cue[1], cue[1] + 0.3)));
          // The default toolchain comes from the host's compiler, outside the workspace: not in the key.
          lay(fromHost, during(t, cue[1] + 1.6, cue[1] + 2.4), 1 - moved);
          show(ccLabel, during(t, cue[0] + 2.2, cue[0] + 2.8) * (1 - moved));
          feeds.slice(0, 2).forEach((e) => e.pulse(ramp(t, cue[1] + 4.0, cue[1] + 4.8)));
          show(untracked, during(t, cue[1] + 5.4, cue[1] + 6.0) * (1 - during(t, cue[3] + 0.8, cue[3] + 1.2)));
          // What else needs it.
          appear(macos, t, cue[2] + 0.4);
          lay(needs[0], during(t, cue[2] + 0.6, cue[2] + 1.2));
          appear(race, t, cue[2] + 4.4);
          lay(needs[1], during(t, cue[2] + 4.6, cue[2] + 5.2));
          // Pinned like the Go SDK: inside the workspace, in the key.
          place(host, 360 * during(t, cue[3] + 1.7, cue[3] + 2.6), 180 * during(t, cue[3] + 1.2, cue[3] + 1.9));
          show(hostBox.labels[0], 1 - during(t, cue[3] + 2.2, cue[3] + 2.5));
          show(pinnedLabel, during(t, cue[3] + 2.5, cue[3] + 2.8));
          lay(usedBy, during(t, cue[3] + 2.8, cue[3] + 3.4)).pulse(ramp(t, cue[3] + 3.6, cue[3] + 4.2));
          feeds[2].pulse(t < cue[3] ? ramp(t, cue[1] + 4.0, cue[1] + 4.8) : ramp(t, cue[3] + 4.2, cue[3] + 4.9));
        };
      },
    },
    {
      section: "Habits that change",
      lines: [
        "`GOOS`, `GOARCH` and `-tags` belong to one invocation of the go command.",
        { say: "In Bazel they are part of the configuration, the settings that shape every action; `--platforms` selects the target platform.", hold: 1.2 },
        { say: "Changing the configuration makes the server analyze every target the build needs again.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, 0, 1000, 510);
        // One invocation of the go command.
        const T = s.group();
        const go = T.box(20, 15, 240, 80, "go command", { kind: "go" });
        const flags = [["`GOOS`", 360], ["`GOARCH`", 510], ["`-tags`", 650]].map(([label, cx]) => T.pill(cx, 55, label, { kind: "go", mono: true }));
        const once = T.group();
        outline(once, 0, 0, 740, 110, { opacity: 0.3 });
        once.text(760, 64, "one invocation", { size: 26, tone: "muted" });
        // Bazel's configuration, which shapes every action.
        const config = s.group();
        config.rect(0, 200, 1000, 130, { kind: "bazel", fill: 0.08, width: 2, r: 10 });
        config.text(30, 274, "configuration", { size: 30, weight: 600 });
        let x = 250;
        const settings = ["`--platforms`", "`goos`, `goarch`, `pure`", "tags setting"].map((label) => {
          const p = s.pill(0, 252, label, { mono: label.startsWith("`") });
          place(p, x + p.w / 2, 0);
          x += p.w + 24;
          return p;
        });
        const first = settings[0].w / 2 + 250;
        const changed = s.pill(0, 252, "`--platforms`", { kind: "run", mono: true });
        place(changed, first, 0);
        const target = s.text(first, 314, "target platform", { size: 26, anchor: "middle", tone: "muted" });
        const actions = [0, 1, 2, 3, 4, 5].map((i) => s.box(172 * i, 440, 140, 70, ""));
        const shape = actions.map((a) => s.edge([a.cx, 336], a, { to: "top" }));
        return (t, cue) => {
          place(T, 0, 200 * (1 - during(t, cue[1] + 0.4, cue[1] + 1.2)));
          appear(go, t, cue[0] + 0.2);
          flags.forEach((f, i) => appear(f, t, cue[0] + 0.4 + 0.5 * i));
          appear(once, t, cue[0] + 3.2);
          appear(config, t, cue[1] + 1.4);
          settings.forEach((p, i) => appear(p, t, cue[1] + 2.0 + 0.4 * i));
          // A new configuration: the analysis is thrown away, and every target is analyzed again.
          const drop = during(t, cue[2] + 1.0, cue[2] + 1.4);
          actions.forEach((a, i) => show(a, during(t, cue[1] + 4.6 + 0.1 * i, cue[1] + 5.2 + 0.1 * i) * (1 - 0.8 * drop) + 0.8 * during(t, cue[2] + 2.2 + 0.15 * i, cue[2] + 2.6 + 0.15 * i)));
          shape.forEach((e, i) => lay(e, during(t, cue[1] + 5.0 + 0.1 * i, cue[1] + 5.6 + 0.1 * i) * (1 - drop) + during(t, cue[2] + 1.6 + 0.15 * i, cue[2] + 2.2 + 0.15 * i)));
          appear(target, t, cue[1] + 8.4);
          appear(changed, t, cue[2] + 0.4, 0.4);
        };
      },
    },
    {
      section: "Habits that change",
      lines: [
        { say: "`go test` runs a subset of `go vet` and fails on its findings; rules_go runs tests with its own actions, so that step is gone.", hold: 1 },
        "nogo runs the analyzers you choose beside each compile, by default in the main repository; a second action fails the build on any finding.",
        { say: "The default nogo analyzes nothing, and `vet = True` adds only five of the twelve that `go test` runs.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, 0, 980, 545);
        const dots = (g, cy, kind) => Array.from({ length: 12 }, (_, i) => {
          const x = 460 + 26 * (i - 5);
          return { ring: g.circle(x, cy, 8, { fill: 0, stroke: true, width: 2 }), dot: g.circle(x, cy, 8, { kind }) };
        });
        // go test: compile, a subset of vet, then the test.
        const GL = s.group();
        const goHead = GL.text(0, 30, "`go test`", { size: 28, weight: 600, tone: "go" });
        const compile = GL.box(0, 55, 220, 80, "compile");
        const vet = GL.box(300, 40, 320, 110, "`go vet` subset", { sub: " " });
        const test = GL.box(700, 55, 220, 80, "run test");
        const goSteps = [GL.edge(compile, vet), GL.edge(vet, test)];
        const goDots = dots(GL, 125, "go");
        // bazel test: rules_go's own actions; vet's step is gone.
        const bzHead = s.text(0, 284, "`bazel test`", { size: 28, weight: 600, tone: "bazel" });
        const compile2 = s.box(0, 310, 220, 80, "compile");
        const test2 = s.box(700, 310, 220, 80, "run test");
        const ghost = s.group();
        ghost.rect(300, 295, 320, 110, { dash: "10 8", width: 2 }).setAttribute("stroke-opacity", 0.5);
        ghost.text(460, 361, "`go vet` subset", { size: 32, anchor: "middle", tone: "faint" });
        const direct = s.edge(compile2, test2);
        // nogo: an action beside each compile, and one that fails the build.
        const run = s.box(300, 430, 320, 110, "`RunNogo`", { sub: " " });
        const validate = s.box(700, 445, 280, 80, "`ValidateNogo`");
        const toValidate = s.edge(run, validate);
        const nogoDots = s.group();
        const slots = dots(nogoDots, 515, "bazel");
        const preset = s.pill(150, 485, "default");
        const vetTrue = s.pill(150, 485, "`vet = True`", { mono: true });
        return (t, cue) => {
          place(GL, 0, 197 * (1 - during(t, cue[0] + 5.0, cue[0] + 5.8)));
          appear(goHead, t, cue[0] + 0.2);
          appear(compile, t, cue[0] + 0.4);
          appear(vet, t, cue[0] + 2.4);
          lay(goSteps[0], during(t, cue[0] + 2.2, cue[0] + 2.8));
          goDots.forEach(({ ring, dot }, i) => {
            appear(ring, t, cue[0] + 2.8 + 0.05 * i, 0.3);
            appear(dot, t, cue[0] + 2.8 + 0.05 * i, 0.3);
          });
          appear(test, t, cue[0] + 3.8);
          lay(goSteps[1], during(t, cue[0] + 3.6, cue[0] + 4.2));
          // rules_go's own actions: no vet step.
          appear(bzHead, t, cue[0] + 5.6);
          appear(compile2, t, cue[0] + 5.8);
          appear(test2, t, cue[0] + 6.4);
          show(ghost, 0.8 * during(t, cue[0] + 6.8, cue[0] + 7.4) * (1 - during(t, cue[0] + 8.8, cue[0] + 9.6)));
          lay(direct, during(t, cue[0] + 9.2, cue[0] + 10.2));
          // nogo, with the analyzers you choose, beside each compile; a second action to fail the build.
          appear(run, t, cue[1] + 1.2);
          slots.forEach(({ ring, dot }, i) => {
            appear(ring, t, cue[1] + 2.4 + 0.05 * i, 0.3);
            show(dot, during(t, cue[2] + 3.6 + 0.15 * i, cue[2] + 3.9 + 0.15 * i) * (i < 5 ? 1 : 0));
          });
          run.focus(during(t, cue[1] + 3.6, cue[1] + 4.0) * (1 - during(t, cue[1] + 5.0, cue[1] + 5.4)));
          appear(validate, t, cue[1] + 5.2);
          lay(toValidate, during(t, cue[1] + 5.2, cue[1] + 5.8));
          // The default checks nothing; vet = True, five of the twelve.
          show(preset, during(t, cue[2] + 0.4, cue[2] + 0.8) * (1 - during(t, cue[2] + 2.6, cue[2] + 2.9)));
          appear(vetTrue, t, cue[2] + 2.9, 0.4);
        };
      },
    },
    {
      section: "Habits that change",
      lines: [
        "Plain `go` keeps working while `go.mod` holds the versions and every Go file is in the tree.",
        "It stops where Bazel holds what `go` cannot see: generated files not checked in, files found through runfiles, non-Go dependencies.",
        { say: "We recommend that CI also run `go vet` and `go test` on the packages that need no Bazel-only input.", hold: 1 },
      ],
      draw(s) {
        s.fit(0, 0, 1040, 550);
        const go = s.box(280, 0, 220, 80, "`go`", { kind: "go" });
        const goSees = s.rect(240, 150, 300, 210, { kind: "go", width: 2, r: 10 });
        const mod = s.file(260, 180, 260, 64, "`go.mod`");
        const files = s.file(260, 270, 260, 64, "Go files", { mono: false });
        const toTree = inked(s.edge(go, [390, 144], { from: "bottom" }));
        const bazelSees = s.rect(215, 125, 825, 260, { kind: "bazel", width: 2, r: 12 });
        const only = ["generated files", "runfiles", "non-Go dependencies"].map((label, i) => s.file(590, 150 + 75 * i, 420, 60, label, { mono: false }));
        const bazel = s.box(520, 470, 220, 80, "`bazel`", { kind: "bazel" });
        const toAll = inked(s.edge(bazel, [630, 391], { from: "top" }));
        const ci = s.box(0, 270, 150, 90, "CI");
        const ciGo = s.edge(ci, go, { from: "top", to: "left" });
        const ciBazel = s.edge(ci, bazel, { from: "bottom", to: "left" });
        const goPills = [["`go vet`", 0], ["`go test`", 1]].map(([label]) => s.pill(0, 40, label, { kind: "go", mono: true }));
        let x = 530;
        for (const p of goPills) {
          place(p, x + p.w / 2, 0);
          x += p.w + 14;
        }
        const build = s.pill(0, 510, "build", { kind: "bazel" });
        place(build, 760 + build.w / 2, 0);
        return (t, cue) => {
          // What plain go needs: go.mod and every Go file.
          appear(go, t, cue[0] + 0.2);
          appear(goSees, t, cue[0] + 0.8);
          lay(toTree, during(t, cue[0] + 0.6, cue[0] + 1.2)).pulse(ramp(t, cue[0] + 5.6, cue[0] + 6.4));
          appear(mod, t, cue[0] + 2.6);
          appear(files, t, cue[0] + 5.0);
          // What only Bazel sees.
          appear(bazelSees, t, cue[1] + 1.0);
          appear(bazel, t, cue[1] + 0.8);
          lay(toAll, during(t, cue[1] + 1.0, cue[1] + 1.6)).pulse(ramp(t, cue[1] + 8.8, cue[1] + 9.6));
          only.forEach((f, i) => appear(f, t, cue[1] + [4.4, 6.6, 8.0][i]));
          // CI keeps both front ends working.
          appear(ci, t, cue[2] + 0.4);
          lay(ciBazel, during(t, cue[2] + 1.6, cue[2] + 2.2));
          appear(build, t, cue[2] + 2.2);
          lay(ciGo, during(t, cue[2] + 3.8, cue[2] + 4.4));
          goPills.forEach((p, i) => appear(p, t, cue[2] + 4.6 + 0.6 * i));
        };
      },
    },
  ],
};
