// Chapter 2's film: the files of a minimal Bazel Go repository and the
// targets they declare, where the Go SDK and the modules come from, the BUILD
// file Gazelle writes, what `bazel build //cmd/hello` does (a client, a
// server, three phases, actions in sandboxes), where a clean build spends its
// time, why a running server skips loading and analysis, and gopls through
// the packages driver. Every sentence comes from the chapter, and the
// pictures follow its Figures 2.1 and 2.2.

import { during, measure, mix, place, ramp, runs, show } from "./stage.js";

// bench: clean `bazel build //cmd/hello` in examples/minimal on macOS/arm64,
// seconds per process from the execution log (the chapter's jq listing).
// Only the proportions of one bar use them; no number is shown.
const CLEAN = { builder: 14.213, stdlib: 36.688, greet: 0.113, hello: 0.033, link: 0.304 };

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// 1 before second a, 0 after a + d.
const gone = (t, a, d = 0.6) => 1 - during(t, a, a + d);
// An edge drawn up to part u, at an opacity once it has started.
const drawn = (edge, u, opacity = 1) => {
  show(edge.trace(u), u > 0 ? opacity : 0);
  return edge;
};
// A dot of ink moving along an edge: data, in no colour of its own.
const carry = (edge, u, strength = 1) => edge.pulse(u, "ink", strength);
// The ramp of whichever window [a, b] t is in, 0 outside them all: for a dot that travels more than once.
const windows = (t, ...spans) => {
  for (const [a, b] of spans) if (t >= a && t <= b) return ramp(t, a, b);
  return 0;
};
// The width of a label with code in backticks, and of a box that holds it with
// room for the check's wider fonts and some air.
const span = (string, { size = 32, weight = 400, mono = false } = {}) =>
  runs(string).reduce((w, r) => w + measure(r.text, { size, weight, mono: mono || r.mono }), 0);
const wide = (string, { pad = 24, ...options } = {}) => Math.ceil(span(string, options) * 1.06 + 16 + pad);

// The processes of a clean build, in Figure 2.2's order and words.
const PROCESSES = [["rules_go", "builder"], ["standard", "library"], ["compile", "`greet`"], ["compile", "`hello`"], ["link", "`hello`"]];
function process(s, x, y, w, h, [a, b]) {
  const g = s.group();
  const box = g.box(x, y, w, h);
  g.text(x + w / 2, y + h / 2 - 7, a, { size: 32, anchor: "middle" });
  g.text(x + w / 2, y + h / 2 + 33, b, { size: 32, anchor: "middle" });
  return { g, box };
}

// The three phases of Figure 2.2, as wide as their words need and filling width.
function phases(s, x, y, width, gap, options = {}) {
  const words = [["Loading", "read BUILD files"], ["Analysis", "targets → actions"], ["Execution", "run actions not cached"]];
  const need = words.map(([name, sub]) => Math.max(wide(name, { weight: 600 }), wide(sub, { size: 26 })));
  const extra = (width - 2 * gap - need.reduce((a, b) => a + b, 0)) / 3;
  let at = x;
  return words.map(([name, sub], i) => {
    const w = need[i] + extra;
    const box = s.box(at, y, w, 100, name, { weight: 600, sub, ...options });
    at += w + gap;
    return box;
  });
}

export default {
  chapter: "2",
  title: "A minimal Bazel Go repository",
  scenes: [
    {
      // The chapter's opening: one module, built with three tools.
      lines: [
        { say: "`examples/minimal` is one Go module with a command, a library and a test." },
        { say: "It is built with Bazel, rules_go (Bazel's rules for Go) and Gazelle (a tool that writes Bazel's build files from Go source).", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, 0, 960, 512);
        const frame = s.group();
        frame.rect(0, 0, 960, 256, { r: 14, width: 2 }).setAttribute("stroke-opacity", 0.45);
        frame.text(28, 52, "examples/minimal", { size: 30, mono: true, weight: 600 });
        const one = s.text(28 + measure("examples/minimal", { size: 30, mono: true, weight: 600 }) + 22, 52, "one Go module", { size: 26, tone: "muted" });
        const parts = [["command", "cmd/hello"], ["library", "internal/greet"], ["test", "greet_test.go"]].map(([role, path], i) =>
          s.box(30 + 310 * i, 92, 280, 128, role, { sub: path, subMono: true }));
        const tools = [["Bazel", "9.3.2"], ["rules_go", "0.65.0"], ["Gazelle", "0.54.0"]].map(([name, version], i) =>
          s.box(30 + 310 * i, 316, 280, 104, name, { kind: "bazel", weight: 600, sub: version, subMono: true }));
        const notes = [s.group(), s.group()];
        notes[0].text(480, 466, "Bazel's rules for Go", { size: 26, anchor: "middle", tone: "muted" });
        notes[1].lines(790, 466, ["writes build files", "from Go source"], { size: 26, anchor: "middle", tone: "muted" });
        return (t, cue) => {
          // The module stands alone under the title; the line names it.
          appear(frame, t, 0.2);
          parts.forEach((p, i) => appear(p, t, 0.8 + 0.3 * i));
          appear(one, t, cue[0] + 1.6);
          tools.forEach((p, i) => appear(p, t, cue[1] + [1.6, 2.3, 4.6][i]));
          appear(notes[0], t, cue[1] + 3.0);
          appear(notes[1], t, cue[1] + 5.4);
        };
      },
    },
    {
      section: "The files",
      lead: 1,
      lines: [
        { say: "A `BUILD.bazel` file makes its directory a package and declares targets, the named things Bazel builds.", hold: 1.4 },
        { say: "A label names a target: `//cmd/hello:hello` is target `hello` in package `cmd/hello`, and `//cmd/hello` is short for it.", hold: 1.6 },
      ],
      draw(s) {
        // Figure 2.1's files and targets, each directory a frame with its targets at the right.
        const W = 1020, FS = 28, TW = 260, TX = W - 28 - TW;
        s.fit(0, 0, W, 856);
        const dirs = [
          { y: 0, h: 250, step: 36, head: "examples/minimal/", rows: [["go.mod", "go.sum"], ["MODULE.bazel"], ["MODULE.bazel.lock"], ["BUILD.bazel"], [".bazelversion", ".bazelrc"]] },
          { y: 266, h: 274, step: 38, head: "cmd/hello/", rows: [["BUILD.bazel"], ["main.go"]] },
          { y: 556, h: 300, step: 38, head: "internal/greet/", rows: [["BUILD.bazel"], ["greet.go"], ["greet_test.go"], ["greeting.tmpl"]] },
        ];
        const frames = dirs.map((d) => {
          const g = s.group();
          g.rect(0, d.y, W, d.h, { r: 14, width: 2 }).setAttribute("stroke-opacity", 0.4);
          const pkg = g.rect(0, d.y, W, d.h, { r: 14, width: 2.5, kind: "bazel" });
          g.text(24, d.y + 44, d.head, { size: FS, mono: true, weight: 600 });
          const plain = [], lit = [];
          d.rows.forEach((names, i) => {
            let x = 28;
            for (const name of names) {
              const y = d.y + 86 + d.step * i;
              if (name === "BUILD.bazel") {
                plain.push(g.text(x, y, name, { size: FS, mono: true }));
                lit.push(g.text(x, y, name, { size: FS, mono: true, weight: 600, tone: "bazel" }));
              } else g.text(x, y, name, { size: FS, mono: true, tone: name.startsWith("go.") ? "go" : "ink" });
              x += measure(name, { size: FS, mono: true }) + 30;
            }
          });
          return { g, pkg, plain, lit };
        });
        const target = (y, name, rule) => s.box(TX, y, TW, 96, name, { kind: "bazel", mono: true, sub: rule, subMono: true });
        const targets = [target(136, "gazelle", "gazelle"), target(282, "hello", "go_binary"), target(430, "hello_lib", "go_library"), target(596, "greet", "go_library"), target(744, "greet_test", "go_test")];
        const [, hello, lib, greet, test] = targets;
        const links = [
          [s.edge(hello, lib, { from: "bottom", to: "top" }), "embed", 413],
          [s.edge(lib, greet, { from: "bottom", to: "top" }), "deps", 584],
          [s.edge(test, greet, { from: "top", to: "bottom" }), "embed", 727],
        ].map(([edge, word, y]) => ({ edge, word: s.text(TX + TW / 2 + 16, y, word, { size: 26, tone: "muted" }) }));

        // The label of hello: its package, then its name.
        const M = { size: 32, mono: true };
        const x1 = TX - 96, x0 = x1 - measure("//cmd/hello:hello", M);
        const head = s.text(x0, 341, "//cmd/hello", M);
        const tail = s.text(x0 + measure("//cmd/hello", M), 341, ":hello", M);
        const bracket = (a, b, word) => {
          const g = s.group();
          g.line(a, 356, a, 364, { width: 2, opacity: 0.6 });
          g.line(a, 364, b, 364, { width: 2, opacity: 0.6 });
          g.line(b, 356, b, 364, { width: 2, opacity: 0.6 });
          g.text((a + b) / 2, 394, word, { size: 26, anchor: "middle", tone: "muted" });
          return g;
        };
        const inPackage = bracket(x0 + measure("//", M), x0 + measure("//cmd/hello", M), "package");
        const named = bracket(x0 + measure("//cmd/hello:", M), x1, "target");
        const names = s.edge([x1 + 14, 330], hello, { to: "left" });

        return (t, cue) => {
          // The files, then each BUILD.bazel makes its directory a package that declares targets.
          frames.forEach((f, i) => {
            appear(f.g, t, 0.1 * i, 0.6);
            const lit = during(t, cue[0] + 0.4, cue[0] + 1.0);
            f.plain.forEach((n) => show(n, 1 - lit));
            f.lit.forEach((n) => show(n, lit));
            appear(f.pkg, t, cue[0] + 2.6 + 0.2 * i, 0.8);
          });
          targets.forEach((x, i) => appear(x, t, cue[0] + 4.0 + 0.25 * i));
          links.forEach(({ edge, word }, i) => {
            drawn(edge, during(t, cue[0] + 5.6 + 0.3 * i, cue[0] + 6.4 + 0.3 * i));
            appear(word, t, cue[0] + 6.2 + 0.3 * i);
          });
          // The label: package and name; the name may go.
          appear(head, t, cue[1] + 0.4);
          show(tail, during(t, cue[1] + 0.4, cue[1] + 1.0) * mix(1, 0.3, during(t, cue[1] + 5.4, cue[1] + 6.0)));
          drawn(names, during(t, cue[1] + 1.0, cue[1] + 1.8));
          show(named, during(t, cue[1] + 2.6, cue[1] + 3.2) * gone(t, cue[1] + 5.4));
          appear(inPackage, t, cue[1] + 3.8);
        };
      },
    },
    {
      section: "The files",
      lead: 0.6,
      lines: [
        { say: "In `MODULE.bazel`, `go_sdk.from_file` takes the Go version from `go.mod` and downloads that Go software development kit (SDK).", hold: 1.2 },
        { say: "It registers the SDK as Bazel's toolchain: the compiler, linker and standard library every Go target uses.", hold: 1.2 },
        { say: "`go_deps.from_file` turns each module in `go.mod` into a repository, verified against `go.sum`.", hold: 1.4 },
        { say: "`go.mod` is the only list of Go module versions you edit: the go command and Bazel both read it.", hold: 1.8 },
      ],
      draw(s) {
        // go.mod above MODULE.bazel's two tags; the external repositories they make below.
        const R = 1040, M = { mono: true };
        const wSdk = wide("go_sdk.from_file", M), wDeps = wide("go_deps.from_file", M);
        const FW = 24 + wSdk + 40 + wDeps + 24;
        s.fit(0, 0, R, 598);
        const module = s.group();
        const frame = module.rect(0, 160, FW, 172, { r: 12, width: 2, fill: 0.04 });
        frame.setAttribute("stroke-opacity", 0.55);
        module.text(FW / 2, 314, "MODULE.bazel", { size: 28, mono: true, weight: 600, anchor: "middle" });
        const sdkTag = s.box(24, 186, wSdk, 76, "go_sdk.from_file", { mono: true, kind: "bazel" });
        const depsTag = s.box(24 + wSdk + 40, 186, wDeps, 76, "go_deps.from_file", { mono: true, kind: "bazel" });
        const mid = (sdkTag.cx + depsTag.cx) / 2;
        const goMod = s.file(mid - 90, 0, 180, 72, "go.mod");
        const goSum = s.file(R - 210, 0, 180, 72, "go.sum");
        const goCmd = s.box(0, 0, wide("go command"), 72, "go command", { kind: "go" });
        const sdk = s.box(0, 420, 380, 104, "Go 1.27.3 SDK", { sub: "toolchain" });
        const wCmp = wide("@com_github_google_go_cmp", M);
        const cmp = s.box(R - wCmp, 420, wCmp, 104, "@com_github_google_go_cmp", { mono: true, sub: "v0.7.0", subMono: true });
        let at = 0;
        const chips = ["compiler", "linker", "standard library"].map((name) => {
          const w = measure(name, { size: 26 }) + 36;
          const pill = s.pill(at + w / 2, 574, name);
          at += w + 16;
          return pill;
        });
        const readSdk = s.edge(goMod, sdkTag, { from: "bottom", to: "top" });
        const readDeps = s.edge(goMod, depsTag, { from: "bottom", to: "top" });
        const readGo = s.edge(goMod, goCmd, { from: "left", to: "right" });
        const makeSdk = s.edge(sdkTag, sdk, { from: "bottom", to: "top" });
        const makeCmp = s.edge(depsTag, cmp, { from: "bottom", to: "top" });
        const verify = s.edge(goSum, [goSum.cx, 414], { from: "bottom" });
        const verified = s.text(goSum.cx + 16, 250, "verified", { size: 26, tone: "muted" });

        return (t, cue) => {
          const [c1, c2, c3, c4] = cue;
          appear(goMod, t, 0);
          appear(goSum, t, 0.15);
          appear(module, t, 0.1);
          appear(sdkTag, t, 0.3);
          appear(depsTag, t, 0.4);
          // The Go version from go.mod; the SDK downloaded and registered as the toolchain.
          drawn(readSdk, during(t, c1 + 2.4, c1 + 3.2));
          carry(readSdk, windows(t, [c1 + 3.2, c1 + 4.2], [c4 + 6.6, c4 + 7.6]));
          carry(drawn(makeSdk, during(t, c1 + 4.4, c1 + 5.0)), ramp(t, c1 + 5.0, c1 + 6.0));
          appear(sdk, t, c1 + 5.6);
          show(sdk.labels[1], during(t, c2 + 2.4, c2 + 3.0) * 0.66);
          chips.forEach((c, i) => appear(c, t, c2 + [3.8, 4.3, 5.0][i]));
          // Each module, a repository verified against go.sum.
          drawn(readDeps, during(t, c3 + 0.4, c3 + 1.0));
          carry(readDeps, windows(t, [c3 + 1.0, c3 + 2.0], [c4 + 6.6, c4 + 7.6]));
          carry(drawn(makeCmp, during(t, c3 + 2.0, c3 + 2.6)), ramp(t, c3 + 2.6, c3 + 3.6));
          appear(cmp, t, c3 + 3.2);
          drawn(verify, during(t, c3 + 4.0, c3 + 4.8));
          appear(verified, t, c3 + 4.4);
          // One list, read by both.
          goMod.focus(during(t, c4 + 0.4, c4 + 1.0));
          appear(goCmd, t, c4 + 5.6);
          drawn(readGo, during(t, c4 + 5.8, c4 + 6.4));
          carry(readGo, ramp(t, c4 + 6.6, c4 + 7.6));
        };
      },
    },
    {
      section: "The files",
      lead: 0.6,
      lines: [
        { say: "Gazelle wrote `internal/greet/BUILD.bazel` from the Go files.", hold: 1.4 },
        { say: "Each import outside the standard library became a `deps` label, and `//go:embed greeting.tmpl` became `embedsrcs`.", hold: 1.4 },
        { say: "The compile sees only listed files; without that line it fails.", hold: 1.6 },
        { say: "The test's `embed` attribute compiles the library's sources into the test, as `go test` compiles a test file in the package it tests.", hold: 1.2 },
      ],
      draw(s) {
        // The Go files, Gazelle, and the BUILD file it wrote: two targets with their attributes.
        const C = { size: 26, mono: true };
        const T = { size: 28, mono: true, weight: 600 };
        const H = { size: 32, mono: true };
        const keyL = measure("embedsrcs ", C), keyR = measure("embed ", C);
        const LW = Math.ceil(Math.max(measure("//go:embed greeting.tmpl", C), keyL + measure("greeting.tmpl", C), measure("greet", H) + 24 + measure("go_library", C)) + 48);
        const RW = Math.ceil(Math.max(measure('"github.com/google/go-cmp/cmp"', C), 24 + measure("@com_github_google_go_cmp//cmp", C), measure("greet_test", H) + 24 + measure("go_test", C)) + 48);
        const TOT = 1060, RX = TOT - RW;
        s.fit(-14, 0, TOT + 14, 610, 0.85);
        // The sources, each with the line Gazelle reads.
        const listing = (x, w, name, line) => {
          const g = s.group();
          const box = g.file(x, 0, w, 112, "");
          const mark = g.rect(x + 12, 64, w - 24, 34, { r: 6, fill: 0.1, stroke: false });
          g.text(x + 24, 42, name, T);
          g.text(x + 24, 89, line, C);
          return { g, box, mark };
        };
        const src = listing(0, LW, "greet.go", "//go:embed greeting.tmpl");
        const testSrc = listing(RX, RW, "greet_test.go", '"github.com/google/go-cmp/cmp"');
        const gazelle = s.box(TOT / 2 - 100, 166, 200, 72, "Gazelle", { kind: "bazel", weight: 600 });
        const into = [s.edge(src.box, gazelle, { from: "bottom", to: "top" }), s.edge(testSrc.box, gazelle, { from: "bottom", to: "top" })];
        // The BUILD file and its two targets.
        const file = s.group();
        file.rect(-14, 282, TOT + 28, 326, { r: 12, width: 2, fill: 0.03 }).setAttribute("stroke-opacity", 0.5);
        file.text(TOT / 2, 592, "internal/greet/BUILD.bazel", { ...C, anchor: "middle", weight: 600 });
        const target = (x, w, h, name, rule, rows) => {
          const g = s.group();
          const box = g.box(x, 300, w, h, "", { kind: "bazel" });
          g.text(x + 24, 344, name, H);
          g.text(x + w - 24, 344, rule, { ...C, anchor: "end", tone: "muted" });
          const made = rows.map(([key, value, y, indent]) => {
            const r = s.group();
            r.text(x + 24, y, key, { ...C, tone: "muted" });
            if (indent) r.text(x + 48, y + 36, value, C);
            else r.text(x + 24 + (x ? keyR : keyL), y, value, C);
            return r;
          });
          return { g, box, rows: made };
        };
        const lib = target(0, LW, 164, "greet", "go_library", [["srcs", "greet.go", 392], ["embedsrcs", "greeting.tmpl", 436]]);
        const test = target(RX, RW, 244, "greet_test", "go_test", [["srcs", "greet_test.go", 392], ["embed", ":greet", 436], ["deps", "@com_github_google_go_cmp//cmp", 480, true]]);
        const out = [s.edge(gazelle, lib.box, { from: "bottom", to: "top" }), s.edge(gazelle, test.box, { from: "bottom", to: "top" })];
        // Without the line: the row struck out, and the compile's error.
        const strike = s.line(16, 427, 24 + keyL + measure("greeting.tmpl", C) + 8, 427, { width: 3, opacity: 0.9 });
        const error = s.text(0, 508, "could not embed greeting.tmpl", { ...C, tone: "muted" });
        // The library's sources into the test.
        const embed = s.edge([LW, 384], [RX, 384]);
        const embedWord = s.text((LW + RX) / 2, 366, "embed", { size: 26, anchor: "middle", tone: "muted" });

        return (t, cue) => {
          const [c1, c2, c3, c4] = cue;
          appear(src.g, t, 0);
          appear(testSrc.g, t, 0.15);
          // Gazelle reads the Go files and writes the BUILD file.
          appear(gazelle, t, c1 + 0.2);
          into.forEach((e) => drawn(e, during(t, c1 + 0.4, c1 + 1.2)));
          out.forEach((e) => drawn(e, during(t, c1 + 1.4, c1 + 2.2)));
          appear(file, t, c1 + 1.8);
          appear(lib.g, t, c1 + 2.0);
          appear(test.g, t, c1 + 2.2);
          appear(lib.rows[0], t, c1 + 2.6);
          // An import becomes deps; //go:embed becomes embedsrcs.
          show(testSrc.mark, during(t, c2 + 0.4, c2 + 0.9) * gone(t, c2 + 3.8));
          carry(into[1], ramp(t, c2 + 0.8, c2 + 1.8));
          carry(out[1], ramp(t, c2 + 1.8, c2 + 2.8));
          show(src.mark, during(t, c2 + 4.0, c2 + 4.5) * gone(t, c2 + 7.4));
          carry(into[0], ramp(t, c2 + 4.4, c2 + 5.4));
          carry(out[0], ramp(t, c2 + 5.4, c2 + 6.4));
          const without = during(t, c3 + 2.4, c3 + 3.0) * gone(t, c4 + 0.2);
          show(lib.rows[1], during(t, c2 + 6.4, c2 + 7.0) * mix(1, 0.35, without));
          // Without it, the compile fails.
          show(strike, without);
          show(error, during(t, c3 + 3.6, c3 + 4.2) * gone(t, c4 + 0.2));
          // The test's embed: greet's sources compile into the test.
          const focus = during(t, c4 + 0.6, c4 + 1.2);
          show(test.rows[0], during(t, c1 + 2.8, c1 + 3.4) * mix(1, 0.4, focus));
          show(test.rows[2], during(t, c2 + 2.8, c2 + 3.4) * mix(1, 0.4, focus));
          show(test.rows[1], during(t, c1 + 3.0, c1 + 3.6));
          drawn(embed, during(t, c4 + 1.6, c4 + 2.4));
          carry(embed, windows(t, [c4 + 2.6, c4 + 3.6], [c4 + 5.6, c4 + 6.6]));
          appear(embedWord, t, c4 + 2.0);
        };
      },
    },
    {
      section: "Building, testing and running",
      lines: [
        { say: "The `bazel` command is a client: it hands each command to a long-lived server, starting one if none is running.", hold: 1 },
        { say: "The server works in three phases: loading reads BUILD files, and analysis turns targets into actions (single tool runs, such as one compile).", hold: 1 },
        { say: "Execution runs the actions whose results are not cached; a clean build of the command runs five processes.", hold: 2 },
        { say: "Each action's process runs in a sandbox, a working directory that holds only its declared inputs.", hold: 1.6 },
      ],
      draw(s) {
        // Figure 2.2: client, server and sandbox lanes.
        const LX = 140, R = 1040;
        s.fit(0, 0, R + 20, 520, 0.82);
        const lanes = [[0, 100, "client"], [130, 300, "server"], [330, 520, "sandbox"]].map(([y0, y1, name]) => {
          const band = s.rect(LX - 20, y0, R - LX + 40, y1 - y0, { r: 10, fill: 0.05, stroke: false });
          const label = s.text(0, (y0 + y1) / 2 + 9, name, { size: 26, weight: 600, tone: "muted" });
          return { band, label };
        });
        const cmd = s.box(LX, 12, wide("bazel build //cmd/hello", { mono: true, pad: 16 }), 76, "bazel build //cmd/hello", { mono: true });
        const resW = wide("prints `bazel-bin` path", { pad: 16 });
        const result = s.box(R - resW, 12, resW, 76, "prints `bazel-bin` path");
        const [load, analyze, execute] = phases(s, LX, 165, R - LX, 36, { kind: "bazel" });
        const start = s.edge(cmd, load, { from: "bottom", to: "top" });
        const reuse = s.text(cmd.cx + 18, 126, "start or reuse", { size: 26, tone: "muted" });
        const steps = [s.edge(load, analyze), s.edge(analyze, execute)];
        const back = s.edge(execute, result, { from: "top", to: "bottom" });
        // The five processes, each in its sandbox.
        const SLOT = (R - LX) / 5;
        const procs = PROCESSES.map((p, i) => process(s, LX + SLOT * i + 15, 392, SLOT - 30, 110, p));
        const fences = procs.map((_, i) => {
          return s.rect(LX + SLOT * i + 6, 382, SLOT - 12, 130, { r: 12, width: 2.5, dash: "10 8" });
        });
        const bus = s.group();
        bus.line(execute.cx, execute.y + execute.h + 6, execute.cx, 346, { width: 2.5, opacity: 0.55 });
        bus.line(LX + SLOT / 2, 346, LX + SLOT * 4.5, 346, { width: 2.5, opacity: 0.55 });
        const drops = procs.map((p, i) => s.edge([LX + SLOT * (i + 0.5), 346], p.box, { to: "top" }));

        return (t, cue) => {
          const [c1, c2, c3, c4] = cue;
          // The client hands the command to a server.
          show(lanes[0].band, during(t, 0, 0.6));
          appear(lanes[0].label, t, c1 + 0.4);
          appear(cmd, t, c1 + 1.0);
          show(lanes[1].band, during(t, c1 + 4.8, c1 + 5.4));
          appear(lanes[1].label, t, c1 + 5.2);
          drawn(start, during(t, c1 + 5.4, c1 + 6.2));
          appear(reuse, t, c1 + 6.4);
          carry(start, ramp(t, c1 + 6.4, c1 + 7.2));
          // Three phases.
          appear(load, t, c2 + 2.6);
          drawn(steps[0], during(t, c2 + 4.4, c2 + 4.9));
          appear(analyze, t, c2 + 4.6);
          drawn(steps[1], during(t, c3 + 0.0, c3 + 0.5));
          appear(execute, t, c3 + 0.2);
          // Execution runs the five processes, one after another, then the client prints where the output is.
          show(lanes[2].band, during(t, c3 + 1.0, c3 + 1.6));
          appear(bus, t, c3 + 1.2);
          procs.forEach((p, i) => {
            appear(p.g, t, c3 + 1.6 + 0.15 * i);
            drawn(drops[i], during(t, c3 + 1.6 + 0.15 * i, c3 + 2.2 + 0.15 * i));
            const a = c3 + 3.2 + [0, 1.0, 2.0, 2.6, 3.2][i];
            carry(drops[i], ramp(t, a - 0.6, a));
            p.box.mark("run", during(t, a, a + 0.4));
          });
          drawn(back, during(t, c3 + 7.0, c3 + 7.6));
          appear(result, t, c3 + 7.6);
          // Each in a sandbox.
          appear(lanes[2].label, t, c4 + 2.8);
          fences.forEach((f, i) => appear(f, t, c4 + 3.2 + 0.25 * i));
        };
      },
    },
    {
      section: "Building, testing and running",
      lines: [
        { say: "Compiling the standard library and rules_go's builder, a program that wraps the Go tools, took most of a clean build.", hold: 1.6 },
        { say: "Compiling and linking the example's code took very little: the time went to the toolchain, not the code.", hold: 1.8 },
      ],
      draw(s) {
        // The five processes over one bar of the clean build's time, in proportion.
        const W = 1000, SLOT = 200, Y = 300, BH = 84;
        const codeLabel = { size: 30, weight: 600 };
        s.fit(0, 0, W + 16 + measure("code", codeLabel), 460, 0.85);
        const procs = PROCESSES.map((p, i) => process(s, SLOT * i + 16, 0, SLOT - 32, 110, p));
        const tool = CLEAN.builder + CLEAN.stdlib, code = CLEAN.greet + CLEAN.hello + CLEAN.link;
        const codeW = Math.max(10, (code / (tool + code)) * W);
        const wB = (CLEAN.builder / tool) * (W - codeW), wS = (CLEAN.stdlib / tool) * (W - codeW);
        const ends = [0, wB, wB + wS, W];
        const middles = [wB / 2, wB + wS / 2, wB + wS + codeW / 2];
        // Which part of the bar each process maps to.
        const part = [0, 1, 2, 2, 2];
        const ties = procs.map((p, i) => s.line(SLOT * i + SLOT / 2, 118, middles[part[i]], Y - 8, { width: 2, opacity: 0.35 }));
        const bar = s.rect(0, Y, W, BH, { r: 6, width: 2 });
        bar.setAttribute("stroke-opacity", 0.5);
        const done = s.rect(0, Y, 0, BH, { kind: "run", r: 6, fill: 0.16 });
        const cuts = [wB, wB + wS].map((x) => s.line(x, Y, x, Y + BH, { width: 2, opacity: 0.5 }));
        const cursor = s.line(0, Y - 18, 0, Y + BH + 18, { width: 3, opacity: 0.9 });
        const names = [s.group(), s.group()];
        names[0].lines(wB / 2, Y + 36, ["rules_go", "builder"], { size: 28, anchor: "middle" });
        names[1].text(wB + wS / 2, Y + 52, "standard library", { size: 30, anchor: "middle" });
        const toolchain = s.group();
        toolchain.line(0, Y + BH + 22, 0, Y + BH + 32, { width: 2, opacity: 0.6 });
        toolchain.line(0, Y + BH + 32, wB + wS - 6, Y + BH + 32, { width: 2, opacity: 0.6 });
        toolchain.line(wB + wS - 6, Y + BH + 22, wB + wS - 6, Y + BH + 32, { width: 2, opacity: 0.6 });
        toolchain.text((wB + wS) / 2, Y + BH + 72, "toolchain", { size: 30, weight: 600, anchor: "middle" });
        const codeName = s.text(W + 16, Y + BH / 2 + 10, "code", codeLabel);

        return (t, cue) => {
          const [c1, c2] = cue;
          // The cursor crosses the toolchain's two processes, then the code in an instant.
          const x = mix(mix(0, wB + wS, during(t, c1 + 2.0, c1 + 8.0)), W, during(t, c2 + 0.4, c2 + 0.8));
          place(cursor, x, 0);
          show(cursor, during(t, c1 + 1.6, c1 + 2.0) * gone(t, c2 + 2.4));
          done.setAttribute("width", x.toFixed(1));
          appear(bar, t, c1 + 0.4);
          cuts.forEach((c) => appear(c, t, c1 + 0.4));
          // When each process starts and ends under the cursor.
          const tS = c1 + 2.0 + 6 * (wB / (wB + wS));
          const spans = [[c1 + 2.0, tS], [tS, c1 + 8.0], [c2 + 0.4, c2 + 2.2], [c2 + 0.5, c2 + 2.2], [c2 + 0.6, c2 + 2.2]];
          procs.forEach((p, i) => {
            const [a, b] = spans[i];
            p.box.mark("run", during(t, a, a + 0.4));
            p.box.focus(during(t, a, a + 0.3) * gone(t, b, 0.3));
            show(ties[i], during(t, c1 + 0.8 + 0.15 * i, c1 + 1.4 + 0.15 * i));
          });
          appear(names[0], t, c1 + 2.0);
          appear(names[1], t, tS);
          appear(codeName, t, c2 + 1.0);
          appear(toolchain, t, c2 + 4.6);
        };
      },
    },
    {
      section: "Building, testing and running",
      lead: 0.6,
      lines: [
        { say: "A new server loads and analyzes again, even when every action is cached.", hold: 1.6 },
        { say: "A running one does neither: it keeps the loaded packages and the dependency graph in memory between commands.", hold: 2.2 },
      ],
      draw(s) {
        // One command twice: on a new server, then on the same server again.
        const PX = 30, GAP = 40;
        const cmdW = wide("bazel build //cmd/hello", { mono: true, pad: 16 });
        const inner = 900;
        const FW = PX + inner + PX;
        s.fit(0, 0, FW, 540);
        const cmd = s.box(0, 0, cmdW, 76, "bazel build //cmd/hello", { mono: true });
        const frame = s.rect(0, 140, FW, 400, { r: 14, width: 2 });
        frame.setAttribute("stroke-opacity", 0.45);
        const [load, analyze, execute] = phases(s, PX, 210, inner, GAP);
        const memory = s.cache((load.cx + analyze.cx) / 2, 440, { w: 330, h: 150, label: "" });
        const named = s.text(memory.cx + 165 + 20, 451, "memory", { size: 32 });
        const widths = ["packages", "graph"].map((name) => measure(name, { size: 26 }) + 36);
        const held = ["packages", "graph"].map((name, i) => s.pill(memory.cx - (widths[0] + 14 + widths[1]) / 2 + (i ? widths[0] + 14 + widths[1] / 2 : widths[0] / 2), 454, name));
        const fills = [s.edge(load, memory, { from: "bottom", to: "top" }), s.edge(analyze, memory, { from: "bottom", to: "top" })];
        const ask = s.edge(cmd, load, { from: "bottom", to: "top" });
        const tags = ["new server", "running server"].map((name) => s.pill(FW - PX - measure(name, { size: 26 }) / 2 - 18, 176, name));

        return (t, cue) => {
          const [c1, c2] = cue;
          appear(cmd, t, 0);
          appear(frame, t, 0);
          [load, analyze, execute].forEach((p) => appear(p, t, 0.1));
          appear(memory, t, 0.2);
          appear(named, t, 0.2);
                    // Tags give way, one out before the other comes.
          show(tags[0], gone(t, c2 + 0.1, 0.3));
          show(tags[1], during(t, c2 + 0.4, c2 + 0.7));
          // A new server: load and analyze run and fill memory; every action is a hit.
          const reset = during(t, c2, c2 + 0.4);
          const ran = [during(t, c1 + 1.4, c1 + 1.9), during(t, c1 + 2.6, c1 + 3.1)];
          const skipped = [during(t, c2 + 1.6, c2 + 2.1), during(t, c2 + 1.8, c2 + 2.3)];
          const hit = during(t, c1 + 4.6, c1 + 5.1) * (1 - reset) + during(t, c2 + 2.0, c2 + 2.5);
          [load, analyze].forEach((p, i) => {
            const run = ran[i] * (1 - reset);
            p.mark("bazel", 1 - Math.max(run, skipped[i]));
            p.mark("run", run);
            p.mark("hit", skipped[i]);
          });
          execute.mark("bazel", 1 - hit);
          execute.mark("hit", hit);
          carry(ask, windows(t, [c1 + 0.6, c1 + 1.4], [c2 + 0.8, c2 + 1.6]));
          carry(fills[0], ramp(t, c1 + 2.0, c1 + 2.8));
          carry(fills[1], ramp(t, c1 + 3.2, c1 + 4.0));
          appear(held[0], t, c1 + 2.8);
          appear(held[1], t, c1 + 4.0);
          fills.forEach((e) => appear(e, t, 0.2));
        };
      },
    },
    {
      section: "Building, testing and running",
      lines: [
        { say: "gopls, Go's language server (the process behind an editor's completion and diagnostics), learns about packages by running `go list`.", hold: 1 },
        { say: "If `GOPACKAGESDRIVER` names a program, gopls asks that program instead.", hold: 1.2 },
        { say: "The driver queries Bazel for the targets that contain a file.", hold: 1 },
        { say: "It then builds them with an aspect (extra actions attached to existing targets) that writes each package's files and imports as JSON.", hold: 1.4 },
        { say: "Each package load is a Bazel command, and a server runs one command at a time, so a long build delays the editor.", hold: 2 },
      ],
      draw(s) {
        // gopls asks the driver, which runs two Bazel commands and answers in JSON.
        const R = 1040, M = { mono: true, pad: 16 };
        s.fit(0, 0, R, 540);
        const editor = s.box(0, 0, 200, 80, "editor");
        const gopls = s.box(300, 0, 200, 80, "gopls", { mono: true });
        const goList = s.box(R - 260, 0, 260, 80, "go list", { mono: true, kind: "go" });
        const driverW = wide("gopackagesdriver.sh", M);
        const driver = s.file(40, 200, driverW, 80, "gopackagesdriver.sh");
        const json = s.file(R - 280, 196, 280, 96, "JSON", { mono: false, sub: "files, imports" });
        const frame = s.group();
        frame.rect(0, 340, R, 200, { r: 14, width: 2 }).setAttribute("stroke-opacity", 0.45);
        frame.text(R - 24, 376, "Bazel server", { size: 26, weight: 600, tone: "bazel", anchor: "end" });
        const query = s.box(30, 414, wide("bazel query", M), 84, "bazel query", { mono: true });
        const build = s.box(query.x + query.w + 50, 404, Math.max(wide("bazel build", M), wide("with an aspect", { size: 26, pad: 16 })), 104, "bazel build", { mono: true, sub: "with an aspect" });
        const longW = wide("a long build", { pad: 40 });
        const long = s.box(R - 40 - longW, 414, longW, 84, "a long build", { kind: "run" });
        const edges = {
          ask: s.edge(editor, gopls),
          list: s.edge(gopls, goList),
          drive: s.edge(gopls, driver, { from: "bottom", to: "top" }),
          query: s.edge(driver, query, { from: "bottom", to: "top" }),
          build: s.edge(query, build),
          write: s.edge(build, json, { from: "top", to: "bottom" }),
          answer: s.edge(json, [gopls.x + gopls.w - 20, gopls.y + gopls.h + 6], { from: "top" }),
        };
        // The variable's name beside the arrow it opens, where the arrow is at y = 158.
        const near = edges.drive.points.reduce((a, b) => (Math.abs(b.p[1] - 158) < Math.abs(a.p[1] - 158) ? b : a)).p;
        const variable = s.text(near[0] - 40, 164, "GOPACKAGESDRIVER", { size: 26, mono: true, anchor: "end", tone: "muted" });

        return (t, cue) => {
          const [c1, c2, c3, c4, c5] = cue;
          // gopls runs go list.
          appear(gopls, t, c1 + 0.1);
          appear(editor, t, c1 + 3.0);
          drawn(edges.ask, during(t, c1 + 3.4, c1 + 4.0));
          const asked = during(t, c2 + 2.4, c2 + 3.0);
          show(goList, during(t, c1 + 6.0, c1 + 6.6) * mix(1, 0.3, asked));
          drawn(edges.list, during(t, c1 + 6.0, c1 + 6.6), mix(1, 0.3, asked));
          carry(edges.list, ramp(t, c1 + 6.8, c1 + 7.6));
          // Unless GOPACKAGESDRIVER names a program.
          appear(variable, t, c2 + 0.6);
          drawn(edges.drive, during(t, c2 + 1.0, c2 + 1.8));
          appear(driver, t, c2 + 1.4);
          carry(edges.drive, windows(t, [c2 + 3.0, c2 + 3.8], [c5 + 0.6, c5 + 1.4]));
          // The driver queries Bazel, then builds with an aspect, and answers in JSON.
          appear(frame, t, c3 + 0.4);
          drawn(edges.query, during(t, c3 + 0.8, c3 + 1.6));
          appear(query, t, c3 + 1.2);
          // On the second load the server is busy: the query waits for the long build.
          const wait = mix(0, 0.5, during(t, c5 + 1.6, c5 + 2.4));
          const go = during(t, c5 + 8.4, c5 + 9.2);
          const second = t >= c5 + 1.6 ? mix(wait, 1, go) * (t < c5 + 9.2 ? 1 : 0) : 0;
          carry(edges.query, t < c5 ? ramp(t, c3 + 1.8, c3 + 2.8) : second);
          drawn(edges.build, during(t, c4 + 0.4, c4 + 1.0));
          appear(build, t, c4 + 0.8);
          show(build.labels[1], during(t, c4 + 2.6, c4 + 3.2) * 0.66);
          drawn(edges.write, during(t, c4 + 6.4, c4 + 7.0));
          carry(edges.write, ramp(t, c4 + 7.0, c4 + 7.8));
          appear(json, t, c4 + 7.4);
          drawn(edges.answer, during(t, c4 + 7.8, c4 + 8.6));
          carry(edges.answer, ramp(t, c4 + 8.6, c4 + 9.4));
          // One command at a time.
          show(long, during(t, c5 + 1.2, c5 + 1.8) * gone(t, c5 + 8.2));
          editor.focus(during(t, c5 + 7.2, c5 + 7.8) * gone(t, c5 + 9.0));
        };
      },
    },
  ],
};
