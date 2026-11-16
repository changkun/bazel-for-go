// Chapter 7's film: rules_go replaces the half of the go command that
// decides what to build and keeps the Go tools; one compile writes `.a` for
// links and `.x` for importers, so how far an edit travels depends on what
// the `.x` holds; then go_test, transitions and nogo. Every sentence comes
// from the chapter, and every picture follows its figures 7.1 to 7.4.

import { during, measure, mix, place, ramp, show } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// Draw an arrow up to part u, hidden until it starts (an untraced arrow leaves a dot), and faded by fade.
const trace = (edge, u, fade = 1) => {
  edge.trace(u);
  show(edge, Math.min(1, u * 12) * fade);
  return edge;
};
// The engine colours a travelling dot by meaning; data that only moves is drawn in ink.
const ink = (edge) => {
  edge.pulse(0);
  edge.dot.setAttribute("fill", "currentColor");
  return edge;
};
// Colour a box by its state: as the go command, Bazel, a run or a hit, crossing from one to the next.
const swap = (box, from, to, u) => {
  box.mark(from, 1 - u);
  box.mark(to, u);
};

// Figure 7.3's graph: each package at [column, row], and who imports whom.
const PACKAGES = {
  app00: [0.5, 0], app01: [1.5, 0],
  web: [0.5, 1], batch: [1.5, 1],
  api: [0, 2], store: [1, 2], jobs: [2, 2],
  auth: [0, 3], billing: [1, 3], search: [2, 3],
  core: [1, 4],
};
const IMPORTS = [
  ["app00", "web"], ["app01", "batch"], ["web", "api"], ["web", "store"], ["batch", "store"], ["batch", "jobs"],
  ["api", "auth"], ["api", "billing"], ["store", "billing"], ["jobs", "search"], ["auth", "core"], ["billing", "core"], ["search", "core"],
];
const LEVEL = { direct: ["auth", "billing", "search"], second: ["api", "store", "jobs"], third: ["web", "batch"], links: ["app00", "app01"] };

// The go command on the left and Bazel on the right, as in Figure 7.3, one edit at a time.
function figure73(s) {
  s.fit(0, 30, 1090, 672, 0.85);
  const COL = 175, ROW = 95, Y0 = 130, BW = 160, BH = 60;
  const side = (ox, name, tone) => {
    const at = (n) => [ox + PACKAGES[n][0] * COL, Y0 + PACKAGES[n][1] * ROW];
    for (const [a, b] of IMPORTS) {
      const [xa, ya] = at(a), [xb, yb] = at(b);
      s.line(xa + BW / 2, ya + BH, xb + BW / 2, yb, { width: 2, opacity: 0.35 });
    }
    const node = Object.fromEntries(Object.keys(PACKAGES).map((n) => [n, s.box(...at(n), BW, BH, n, { mono: true })]));
    s.text(ox + 255, 82, name, { size: 32, weight: 600, anchor: "middle", tone });
    const edit = s.pill(ox + 70, 540, "edit", { kind: "run" });
    const into = s.edge([ox + 70 + edit.w / 2 + 2, 540], node.core, { to: "left", kind: "run" });
    return { node, edit, into, ox };
  };
  const go = side(0, "go command", "go");
  const bz = side(580, "Bazel", "bazel");
  s.line(545, 50, 545, 600, { width: 2, opacity: 0.2 });
  const items = [["run", "runs: compile or link"], ["hit", "checked, cache hit"], [null, "not looked at"]];
  const wide = items.reduce((sum, [, label]) => sum + 58 + measure(label, { size: 26 }) + 44, -44);
  const legend = s.legend(545 - wide / 2, 664, items);
  return { go, bz, legend };
}
// Mark a level of one side at second a, its boxes one after another.
const level = (side, names, kind, t, a) => names.forEach((n, i) => side.node[n].mark(kind, during(t, a + 0.15 * i, a + 0.5 + 0.15 * i)));

export default {
  chapter: "7",
  title: "rules_go: where the designs meet",
  scenes: [
    {
      // The chapter's opening: one half replaced, one half kept.
      lines: [{ say: "rules_go, the Bazel rules for Go, replaces the half of the go command that decides what to build and keeps the half that builds.", hold: 0.8 }],
      draw(s) {
        s.fit(0, -52, 1000, 330);
        const decide = s.box(0, 40, 490, 150, "decides what to build", { size: 36 });
        const build = s.box(510, 40, 490, 150, "builds", { size: 36 });
        const go = s.pill(500, -20, "go command", { kind: "go", size: 30, h: 56 });
        const rules = s.pill(245, -20, "rules_go", { kind: "bazel", size: 30, h: 56 });
        const tools = ["compile", "link"].map((name, i) => s.box(530 + 240 * i, 252, 210, 72, name, { mono: true }));
        return (t, cue) => {
          const c = cue[0];
          appear(decide, t, 0.4);
          appear(build, t, 0.6);
          appear(go, t, 1.0);
          // The half that decides changes hands; the go command keeps the half that builds.
          const u = during(t, c + 3.2, c + 4.2);
          swap(decide, "go", "bazel", u);
          build.mark("go", 1);
          place(go, 255 * u, 0);
          appear(rules, t, c + 3.8);
          tools.forEach((tool, i) => appear(tool, t, c + 8.4 + 0.3 * i));
        };
      },
    },
    {
      section: "Who does what",
      lines: [
        { say: "The go command reads imports to find the graph, plans an action graph in memory, looks each action up in `GOCACHE` and starts the tool." },
        { say: "Under Bazel, `BUILD` files declare the graph as targets; Gazelle writes them by reading the same imports." },
        { say: "In the analysis phase, rules_go's rules turn targets into actions, and Bazel's caches replace `GOCACHE`." },
        { say: "Most Go actions run the builder, a Go program in rules_go that wraps each tool call." },
        { say: "What stays is the Go SDK and its tools: `compile`, `link`, `asm` and `cgo`.", hold: 1.0 },
      ],
      draw(s) {
        // Figure 7.1.
        s.fit(0, 0, 1040, 778);
        const ROWS = [
          ["graph", ["read imports", "again on every run"], ["`BUILD` files", "a `go_library` per package"]],
          ["plan", ["action graph", "in memory, then dropped"], ["analysis", "rules_go declares actions"]],
          ["cache", ["`GOCACHE`", "one user, one machine"], ["Bazel's caches", "can be shared by machines"]],
          ["run", ["starts the tool", "a child process"], ["the builder", "wraps each tool call"]],
        ];
        const goHead = s.text(190, 34, "go command", { size: 32, weight: 600, anchor: "middle", tone: "go" });
        const bzHead = s.text(850, 34, "Bazel with rules_go", { size: 32, weight: 600, anchor: "middle", tone: "bazel" });
        const rows = ROWS.map(([name, g, b], i) => {
          const y = 70 + 125 * i;
          return {
            label: s.text(520, y + (i === 0 ? 40 : 59), name, { size: 26, anchor: "middle", tone: "muted" }),
            go: s.box(0, y, 380, 100, g[0], { kind: "go", sub: g[1] }),
            bz: s.box(660, y, 380, 100, b[0], { kind: "bazel", sub: b[1] }),
          };
        });
        const gazelle = s.pill(520, 146, "Gazelle", { kind: "bazel" });
        const writes = ink(s.edge([520 + gazelle.w / 2 + 2, 146], rows[0].bz, { to: "left" }));
        const tools = s.group();
        tools.rect(120, 610, 800, 160, { r: 14, width: 2 });
        tools.text(520, 652, "the Go toolchain, the same in both", { size: 26, anchor: "middle", tone: "muted" });
        const tool = ["compile", "link", "asm", "cgo"].map((name, i) => s.box(150 + 190 * i, 676, 170, 68, name, { mono: true }));
        const goRuns = s.edge(rows[3].go, [190, 610], { from: "bottom" });
        const bzRuns = s.edge(rows[3].bz, [850, 610], { from: "bottom" });
        ink(goRuns);
        ink(bzRuns);
        return (t, cue) => {
          const [c0, c1, c2, c3, c4] = cue;
          // The go command does all four steps itself.
          appear(goHead, t, c0 + 0.2);
          [1.0, 3.4, 6.2, 8.6].forEach((a, i) => {
            appear(rows[i].go, t, c0 + a);
            appear(rows[i].label, t, c0 + a);
          });
          // Under Bazel each step changes hands.
          appear(bzHead, t, c1 + 0.2);
          appear(rows[0].bz, t, c1 + 1.4);
          appear(gazelle, t, c1 + 3.6);
          trace(writes, during(t, c1 + 3.9, c1 + 4.5)).pulse(ramp(t, c1 + 4.6, c1 + 5.4));
          appear(rows[1].bz, t, c2 + 1.4);
          appear(rows[2].bz, t, c2 + 4.8);
          appear(rows[3].bz, t, c3 + 1.8);
          // The same Go tools under both.
          appear(tools, t, c4 + 0.6);
          tool.forEach((x, i) => appear(x, t, c4 + 3.6 + 0.35 * i));
          trace(goRuns, during(t, c4 + 1.0, c4 + 1.6)).pulse(ramp(t, c4 + 5.6, c4 + 6.4));
          trace(bzRuns, during(t, c4 + 1.0, c4 + 1.6)).pulse(ramp(t, c4 + 5.6, c4 + 6.4));
        };
      },
    },
    {
      section: "Who does what",
      lines: [
        { say: "For each configuration (set of build settings) that needs it, one `GoStdlib` action compiles the standard library, running the go command itself: `go install std`.", hold: 1.0 },
        { say: "rules_go first resets every setting that cannot change the standard library, so most targets share one copy.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(0, -46, 1000, 422);
        const head = s.text(0, -18, "targets", { size: 26, tone: "muted" });
        const targets = [[0, false], [100, false], [200, false], [330, true]].map(([y, race]) => {
          const g = s.group();
          g.rect(0, y, 580, 70, { r: 10, width: 2 });
          let x = 16;
          const chip = (label, mono) => {
            const w = measure(label, { size: 26, mono }) + 36;
            const p = g.pill(x + w / 2, y + 35, label, { mono });
            x += w + 12;
            return p;
          };
          chip("linux/amd64", true);
          if (race) chip("race", true);
          return { g, other: chip("other settings", false), y: y + 35, race };
        });
        const action = (y) => {
          const box = s.box(700, y, 300, 110, "GoStdlib", { mono: true, kind: "bazel", sub: "go install std", subMono: true });
          // Inside the Bazel action, the go command itself.
          box.labels[1].style.fill = "var(--fm-go)";
          box.labels[1].setAttribute("fill-opacity", 1);
          return box;
        };
        const A = action(50);
        const B = action(310);
        const pa = s.pill(850, 20, "linux/amd64", { mono: true });
        const pb = s.pill(850, 280, "linux/amd64, race", { mono: true });
        const share = targets.map(({ y, race }) => ink(s.edge([584, y], race ? B : A, { to: "left" })));
        return (t, cue) => {
          const [c0, c1] = cue;
          // One action per configuration, running the go command inside.
          appear(pa, t, c0 + 0.4);
          appear(pb, t, c0 + 0.8);
          appear(A, t, c0 + 4.2);
          appear(B, t, c0 + 4.5);
          appear(A.labels[1], t, c0 + 8.8);
          appear(B.labels[1], t, c0 + 8.8);
          // Settings that cannot change the standard library are reset; most targets share one copy.
          appear(head, t, c1 + 0.2);
          targets.forEach(({ g, other }, i) => {
            appear(g, t, c1 + 0.3 + 0.2 * i);
            show(other, 1 - 0.75 * during(t, c1 + 2.6, c1 + 3.4));
          });
          share.forEach((e, i) => trace(e, during(t, c1 + 4.6 + 0.15 * i, c1 + 5.2 + 0.15 * i)).pulse(ramp(t, c1 + 5.6, c1 + 6.4)));
        };
      },
    },
    {
      section: "Two files per compile",
      lines: [
        { say: "Under the go command, a compile writes one archive: export data for importers' compiles, and object code for the linker." },
        { say: "Given `-linkobj`, the compiler splits them into two files, and rules_go does exactly that: `core.a` goes only to links, `core.x` to importers.", hold: 1.0 },
      ],
      draw(s) {
        // Figure 7.2: one archive, then two files.
        s.fit(0, 6, 1040, 518);
        const src = s.file(0, 245, 200, 70, "core/*.go");
        const compile = s.box(245, 240, 180, 80, "compile", { mono: true });
        const archive = s.group();
        archive.rect(464, 140, 312, 278, { r: 12, width: 2.5 });
        const title = archive.text(480, 182, "core.a", { size: 32, mono: true, weight: 600 });
        const part = (y, name, label) => {
          const g = s.group();
          g.rect(480, y, 280, 90, { r: 8, width: 2, fill: 0.06 });
          g.text(620, y + 56, label, { size: 32, anchor: "middle" });
          return { g, head: g.text(480, y - 14, name, { size: 32, mono: true, weight: 600 }) };
        };
        const O = part(204, "core.a", "object code");
        const X = part(312, "core.x", "export data");
        const link = s.box(840, 45, 200, 100, "link", { mono: true, sub: "each binary" });
        const importer = s.box(840, 415, 200, 100, "compile", { mono: true, sub: "each importer" });
        const reads = s.edge(src, compile);
        // Before the split: one archive, read whole.
        const whole = { left: [464, 279], right: [776, 279] };
        const before = [s.edge(compile, whole), s.edge(whole, importer), s.edge(whole, link)];
        // After: the object code to links, the export data to importers.
        const after = [s.edge(compile, { left: [480, 95] }), s.edge(compile, { left: [480, 465] })];
        const toLink = ink(s.edge({ right: [760, 95] }, link));
        const toImporter = ink(s.edge({ right: [760, 465] }, importer));
        return (t, cue) => {
          const [c0, c1] = cue;
          appear(src, t, c0 + 0.2);
          trace(reads, during(t, c0 + 0.4, c0 + 1.0));
          appear(compile, t, c0 + 0.6);
          swap(compile, "go", "bazel", during(t, c1 + 4.2, c1 + 4.8));
          // One archive, two parts.
          const split = during(t, c1 + 1.6, c1 + 3.0);
          const one = during(t, c0 + 2.8, c0 + 3.4);
          show(archive, one * (1 - during(t, c1 + 1.4, c1 + 1.8)));
          show(title, 1);
          appear(X.g, t, c0 + 4.2);
          appear(O.g, t, c0 + 6.2);
          appear(importer, t, c0 + 4.4);
          appear(link, t, c0 + 6.4);
          const gone = 1 - during(t, c1 + 1.2, c1 + 1.6);
          trace(before[0], during(t, c0 + 3.0, c0 + 3.6), gone);
          trace(before[1], during(t, c0 + 4.6, c0 + 5.2), gone);
          trace(before[2], during(t, c0 + 6.6, c0 + 7.2), gone);
          // Split into two files.
          place(O.g, 0, -154 * split);
          place(X.g, 0, 108 * split);
          show(O.head, during(t, c1 + 2.4, c1 + 3.0));
          show(X.head, during(t, c1 + 2.4, c1 + 3.0));
          after.forEach((e) => trace(e, during(t, c1 + 3.0, c1 + 3.6)));
          trace(toLink, during(t, c1 + 3.2, c1 + 3.8)).pulse(ramp(t, c1 + 6.0, c1 + 6.8));
          trace(toImporter, during(t, c1 + 3.2, c1 + 3.8)).pulse(ramp(t, c1 + 7.8, c1 + 8.6));
        };
      },
    },
    {
      section: "Two files per compile",
      lines: [
        { say: "Edit the body of a function that the compiler does not inline: `core.a` changes and `core.x` does not." },
        { say: "Bazel's action cache compares input contents, so the importers' compiles are hits; only `core`'s compile and the links run." },
        { say: "Under the go command, an importer's key includes a hash of the whole archive, so every direct importer recompiles.", hold: 1.6 },
      ],
      draw(s) {
        // Figure 7.3, top half.
        const { go, bz, legend } = figure73(s);
        const goA = s.pill(420, 540, "core.a", { kind: "run", mono: true });
        const bzA = s.pill(1000, 515, "core.a", { kind: "run", mono: true });
        const bzX = s.pill(1000, 567, "core.x", { mono: true });
        return (t, cue) => {
          const [c0, c1, c2] = cue;
          for (const side of [go, bz]) {
            appear(side.edit, t, c0 + 0.3);
            trace(side.into, during(t, c0 + 0.5, c0 + 1.1));
            side.node.core.mark("run", during(t, c0 + 1.6, c0 + 2.2));
          }
          appear(goA, t, c0 + 4.6);
          appear(bzA, t, c0 + 4.6);
          appear(bzX, t, c0 + 5.8);
          appear(legend, t, c1 + 0.4);
          // Bazel: every importer's compile is a hit; only the links run.
          level(bz, LEVEL.direct, "hit", t, c1 + 3.8);
          level(bz, LEVEL.links, "run", t, c1 + 7.4);
          // The go command: every direct importer recompiles, the rest is checked, the links run.
          level(go, LEVEL.direct, "run", t, c2 + 5.8);
          level(go, LEVEL.second, "hit", t, c2 + 6.6);
          level(go, LEVEL.third, "hit", t, c2 + 7.0);
          level(go, LEVEL.links, "run", t, c2 + 7.4);
        };
      },
    },
    {
      section: "Two files per compile",
      lines: [
        { say: "The `.x` holds more than the API: each described declaration's position, the bodies of functions small enough to inline, and what escapes to the heap.", hold: 0.6 },
        { say: "So a change to the API, to an inlinable body or to what escapes reaches every direct importer." },
        { say: "So does anything that moves a described declaration, such as a comment line above it; a comment at the end of a line moves nothing.", hold: 0.6 },
      ],
      draw(s) {
        // Figure 7.2's `.x`, opened: which edits reach it.
        s.fit(0, -92, 1040, 482);
        const box = s.group();
        box.rect(440, -92, 340, 484, { r: 12, width: 2.5 });
        box.text(610, -42, "core.x", { size: 32, mono: true, weight: 600, anchor: "middle" });
        const item = ["exported API", "inlinable bodies", "escape results", "source positions"].map((name, i) => s.box(460, 100 * i, 300, 70, name));
        const edit = ["API change", "inlinable body change", "escape change", "comment line above", "comment at line end"].map((name, i) => s.box(0, i === 4 ? 410 : 100 * i, 380, 70, name));
        const to = edit.map((e, i) => s.edge(e, item[Math.min(i, 3)], { kind: "run" }));
        const importer = s.box(850, 135, 190, 100, "compile", { mono: true, sub: "each importer" });
        const out = s.edge({ right: [780, 185] }, importer);
        // Where the end-of-line comment's change stops: halfway, across its arrow.
        const path = to[4].points;
        const half = path.findIndex((q) => q.length >= path[path.length - 1].length / 2);
        const [[x0, y0], [x1, y1]] = [path[half - 1].p, path[half + 1].p];
        const [mx, my] = path[half].p;
        const n = Math.hypot(x1 - x0, y1 - y0);
        const [nx, ny] = [-(y1 - y0) / n, (x1 - x0) / n];
        const stop = s.line(mx - 20 * nx, my - 20 * ny, mx + 20 * nx, my + 20 * ny, { width: 6, opacity: 1 });
        return (t, cue) => {
          const [c0, c1, c2] = cue;
          appear(box, t, 0.2);
          appear(importer, t, 0.5);
          trace(out, during(t, 0.6, 1.2));
          // What the `.x` holds, as the sentence names it.
          [1.8, 5.4, 8.4, 3.6].forEach((a, i) => appear(item[i], t, c0 + a));
          // Edits that change it: each reaches its part, and the part reaches every direct importer.
          const when = [c1 + 1.0, c1 + 2.6, c1 + 4.2, c2 + 3.0];
          when.forEach((a, i) => {
            appear(edit[i], t, a - 0.2);
            edit[i].mark("run", during(t, a, a + 0.4));
            trace(to[i], during(t, a, a + 0.5)).pulse(ramp(t, a + 0.5, a + 1.1));
            item[i].mark("run", during(t, a + 1.0, a + 1.4));
          });
          const second = t < c2 + 3.5 ? ramp(t, c1 + 5.8, c1 + 6.6) : ramp(t, c2 + 4.6, c2 + 5.4);
          out.pulse(second);
          out.mark("run", during(t, c1 + 6.0, c1 + 6.4));
          importer.mark("run", during(t, c1 + 6.4, c1 + 6.9));
          // A comment at the end of a line moves nothing: the change stops.
          const a = c2 + 6.0;
          appear(edit[4], t, a - 0.2);
          trace(to[4], during(t, a, a + 0.5) * 0.5);
          to[4].pulse(ramp(t, a + 0.4, a + 1.6) * 0.5, "run", 1 - during(t, a + 1.6, a + 2.2));
          appear(stop, t, a + 1.6, 0.4);
        };
      },
    },
    {
      section: "Two files per compile",
      lines: [
        { say: "A comment line above `core`'s exported types moves them, so `core.x` changes and every direct importer recompiles." },
        { say: "An importer's `.x` copies the declarations its API or inlinable functions use; here importers use `core` only inside a function too large to inline, so theirs stay the same." },
        { say: "The go command takes these edits one level further: an archive records a hash of each import's export data, so the importers' importers recompile.", hold: 1.2 },
      ],
      draw(s) {
        // Figure 7.3, bottom half.
        const { go, bz, legend } = figure73(s);
        const goA = s.pill(420, 540, "core.a", { kind: "run", mono: true });
        const bzA = s.pill(1000, 515, "core.a", { kind: "run", mono: true });
        const bzX = s.pill(1000, 567, "core.x", { kind: "run", mono: true });
        return (t, cue) => {
          const [c0, c1, c2] = cue;
          show(legend, 1);
          for (const side of [go, bz]) {
            appear(side.edit, t, c0 + 0.3);
            trace(side.into, during(t, c0 + 0.5, c0 + 1.1));
            side.node.core.mark("run", during(t, c0 + 1.2, c0 + 1.8));
            level(side, LEVEL.direct, "run", t, c0 + 5.2);
          }
          appear(goA, t, c0 + 3.2);
          appear(bzA, t, c0 + 3.2);
          appear(bzX, t, c0 + 3.4);
          // Bazel: the importers' `.x` files stay the same, so the next level is a hit; the links run.
          level(bz, LEVEL.second, "hit", t, c1 + 10.4);
          level(bz, LEVEL.links, "run", t, c1 + 11.2);
          // The go command: one level further.
          level(go, LEVEL.second, "run", t, c2 + 7.0);
          level(go, LEVEL.third, "hit", t, c2 + 7.8);
          level(go, LEVEL.links, "run", t, c2 + 8.4);
        };
      },
    },
    {
      section: "From library to binary and test",
      lines: [
        { say: "`go_test` builds three packages, as `go test` does: the library with its in-package tests, and the external test package, `greet_test`." },
        { say: "The third is a main package that the builder generates, which imports both and runs the tests; one link joins them into the test binary.", hold: 1.0 },
      ],
      draw(s) {
        // Figure 7.4.
        s.fit(-24, -78, 1024, 436);
        const frame = s.group();
        frame.rect(-24, -78, 1048, 514, { r: 14, width: 2 }).setAttribute("stroke-opacity", 0.35);
        frame.text(-2, -32, "go_test", { size: 30, mono: true, weight: 600 });
        const greet = s.box(0, 0, 386, 110, "package greet", { mono: true, kind: "bazel", sub: "library + in-package tests" });
        const external = s.box(0, 300, 386, 110, "package greet_test", { mono: true, kind: "bazel", sub: "imports greet + its tests" });
        const main = s.box(450, 150, 272, 110, "package main", { mono: true, kind: "bazel", sub: "generated test main" });
        const link = s.box(830, 150, 180, 110, "link", { mono: true, kind: "bazel", sub: "test binary" });
        const imports = s.edge(external, greet, { from: "top", to: "bottom" });
        const word = s.text(210, 215, "imports", { size: 26, tone: "muted" });
        const both = [s.edge(main, greet, { from: "top", to: "right" }), s.edge(main, external, { from: "bottom", to: "right" })];
        const joins = ink(s.edge(main, link));
        const all = s.text(776, 188, "all `.a`", { size: 26, anchor: "middle", tone: "muted" });
        return (t, cue) => {
          const [c0, c1] = cue;
          appear(frame, t, 0.2);
          appear(greet, t, c0 + 4.2);
          appear(external, t, c0 + 7.0);
          trace(imports, during(t, c0 + 7.6, c0 + 8.2));
          appear(word, t, c0 + 7.8);
          appear(main, t, c1 + 0.8);
          both.forEach((e, i) => trace(e, during(t, c1 + 4.0 + 0.3 * i, c1 + 4.6 + 0.3 * i)));
          appear(link, t, c1 + 7.6);
          trace(joins, during(t, c1 + 7.8, c1 + 8.4)).pulse(ramp(t, c1 + 8.6, c1 + 9.6));
          appear(all, t, c1 + 8.0);
        };
      },
    },
    {
      section: "From library to binary and test",
      lines: [
        { say: "`go_binary` and `go_test` also set the configuration: a transition applies their `goos`, `goarch`, `race` and `pure` attributes to them and everything they depend on." },
        { say: "`go_library` has none, so a library is compiled once for each configuration that some binary or test asks for, as is the standard library.", hold: 1.0 },
      ],
      draw(s) {
        s.fit(0, 0, 1000, 580);
        const pure = 'pure = "on"', race = 'race = "on"';
        const binary = s.box(0, 0, 360, 110, "go_binary", { mono: true, sub: pure, subMono: true });
        const test = s.box(640, 0, 360, 110, "go_test", { mono: true, sub: race, subMono: true });
        // One library and one standard library, then a copy of each for each configuration.
        const lib = s.box(320, 236, 360, 110, "go_library", { mono: true });
        const std = s.box(320, 470, 360, 110, "standard library");
        // Each copy is labelled with the configuration it is built in.
        const libs = [s.box(0, 236, 360, 110, "go_library", { mono: true, sub: "pure", subMono: true }), s.box(640, 236, 360, 110, "go_library", { mono: true, sub: "race", subMono: true })];
        const stds = [s.box(0, 470, 360, 110, "standard library", { sub: "pure", subMono: true }), s.box(640, 470, 360, 110, "standard library", { sub: "race", subMono: true })];
        const down = { from: "bottom", to: "top" };
        const shared = [s.edge(binary, lib, down), s.edge(test, lib, down), s.edge(lib, std, down)].map(ink);
        const own = [s.edge(binary, libs[0], down), s.edge(test, libs[1], down)];
        const toShared = [s.edge(libs[0], std, down), s.edge(libs[1], std, down)];
        const toOwn = [s.edge(libs[0], stds[0], down), s.edge(libs[1], stds[1], down)];
        return (t, cue) => {
          const [c0, c1] = cue;
          // The attributes, applied down everything they depend on.
          appear(binary.labels[1], t, c0 + 5.0);
          appear(test.labels[1], t, c0 + 5.0);
          shared[0].pulse(ramp(t, c0 + 7.8, c0 + 8.6));
          shared[1].pulse(ramp(t, c0 + 7.8, c0 + 8.6));
          shared[2].pulse(ramp(t, c0 + 8.6, c0 + 9.4));
          // go_library has no transition: one copy for each configuration, and of the standard library too.
          lib.focus(during(t, c1 + 0.4, c1 + 0.8) * (1 - during(t, c1 + 1.8, c1 + 2.2)));
          const a = during(t, c1 + 2.6, c1 + 3.8);
          const b = during(t, c1 + 8.2, c1 + 9.4);
          show(lib, 1 - during(t, c1 + 2.6, c1 + 2.8));
          libs.forEach((x, i) => {
            show(x, during(t, c1 + 2.6, c1 + 2.8));
            place(x, (i ? -320 : 320) * (1 - a), 0);
            show(x.labels[1], during(t, c1 + 3.8, c1 + 4.2));
          });
          show(std, 1 - during(t, c1 + 8.2, c1 + 8.4));
          stds.forEach((x, i) => {
            show(x, during(t, c1 + 8.2, c1 + 8.4));
            place(x, (i ? -320 : 320) * (1 - b), 0);
            show(x.labels[1], during(t, c1 + 9.4, c1 + 9.8));
          });
          shared.forEach((e) => show(e, 1 - during(t, c1 + 2.6, c1 + 2.9)));
          own.forEach((e) => trace(e, during(t, c1 + 3.8, c1 + 4.3), during(t, c1 + 3.8, c1 + 3.9)));
          toShared.forEach((e) => trace(e, during(t, c1 + 3.8, c1 + 4.3), during(t, c1 + 3.8, c1 + 3.9) * (1 - during(t, c1 + 8.0, c1 + 8.2))));
          toOwn.forEach((e) => trace(e, during(t, c1 + 9.4, c1 + 9.9), during(t, c1 + 9.4, c1 + 9.5)));
        };
      },
    },
    {
      section: "From library to binary and test",
      lines: [
        { say: "nogo, rules_go's counterpart to `go vet`, runs analyzers in the build once a `nogo` target is configured; by default it analyzes nothing." },
        { say: "Each package then gets a `RunNogo` action, separate from its compile, that reads the same `.x` files." },
        { say: "A separate `ValidateNogo` action fails the build on findings.", hold: 0.6 },
      ],
      draw(s) {
        s.fit(0, -92, 1000, 520);
        const pkg = (x, y, label, name) => s.box(x, y, 270, 100, label, { mono: true, sub: name, subMono: true });
        const compile = [pkg(0, 0, "GoCompilePkg", "core"), pkg(730, 0, "GoCompilePkg", "auth")];
        const x = s.file(375, 22, 250, 56, "core.x");
        const run = [pkg(0, 220, "RunNogo", "core"), pkg(730, 220, "RunNogo", "auth")];
        const validate = [pkg(0, 420, "ValidateNogo", "core"), pkg(730, 420, "ValidateNogo", "auth")];
        const target = s.pill(500, -62, "`nogo` target", { kind: "bazel", size: 28, h: 50 });
        const writes = s.edge(compile[0], x);
        const reads = ink(s.edge(x, compile[1]));
        const also = ink(s.edge(x, run[1], { from: "bottom", to: "left" }));
        const checks = run.map((r, i) => s.edge(r, validate[i], { from: "bottom", to: "top" }));
        return (t, cue) => {
          const [c0, c1, c2] = cue;
          appear(compile[0], t, 0.2);
          trace(writes, during(t, 0.4, 1.0));
          appear(x, t, 0.6);
          trace(reads, during(t, 0.8, 1.4));
          appear(compile[1], t, 1.0);
          // Off by default; on once a nogo target is configured.
          appear(target, t, c0 + 6.2);
          run.forEach((r, i) => appear(r, t, c1 + 2.0 + 0.3 * i));
          trace(also, during(t, c1 + 4.8, c1 + 5.4));
          for (const e of [reads, also]) e.pulse(ramp(t, c1 + 5.6, c1 + 6.4));
          validate.forEach((v, i) => appear(v, t, c2 + 1.0 + 0.2 * i));
          checks.forEach((e, i) => trace(e, during(t, c2 + 1.0 + 0.2 * i, c2 + 1.6 + 0.2 * i)));
        };
      },
    },
  ],
};
