// Chapter 8's film: the go command's and Bazel's answers to Chapter 1's six
// decisions, one scene per decision, each showing the mechanism and what it
// costs as the repository grows; then Figure 8.2's cost terms for one body
// edit, and where each design stops scaling. Every sentence comes from the
// chapter. The end-to-end table (Table 8.1) has no numbers yet and is not shown.

import { SHAPE, during, measure, mix, place, ramp, show, svg } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// On from second a, off again from second b.
const between = (t, a, b, d = 0.4) => during(t, a, a + d) * (1 - during(t, b, b + d));

// A pill whose left end is at x.
const leftPill = (s, x, y, label, kind) => s.pill(x + (measure(label.replaceAll("`", ""), { size: 26 }) + 36) / 2, y, label, { kind });

// A faint frame around a scope: a machine, a team, a pool.
function frame(s, x, y, w, h, options = {}) {
  const r = s.rect(x, y, w, h, { r: 14, width: 2, ...options });
  if (!options.kind) r.setAttribute("stroke-opacity", 0.35);
  return r;
}

// The decision a scene is about, as Figure 8.1 numbers it.
function header(s, n, name) {
  const g = s.group();
  g.circle(24, 0, 24, { fill: 0, stroke: true });
  g.text(24, 9, String(n), { size: 26, weight: 600, anchor: "middle" });
  g.text(62, 12, name, { size: 34, weight: 600 });
  return g;
}

// Figure 8.1's markers: the go command's points down onto a dial from above,
// Bazel's points up from below; a hollow one shows what an option adds.
function marker(s, x, y, kind, up, hollow = false) {
  const g = s.group();
  const tip = up ? y + 8 : y - 8;
  const base = up ? y + 30 : y - 30;
  const colour = kind ? SHAPE[kind] : "currentColor";
  svg("path", { d: `M${x - 11},${base} L${x + 11},${base} L${x},${tip} Z`, fill: hollow ? "none" : colour, stroke: colour, "stroke-width": 2.5, "stroke-linejoin": "round" }, g.g);
  return g;
}

export default {
  chapter: "8",
  title: "The designs side by side",
  scenes: [
    {
      // The chapter's opening, over Figure 8.1.
      lines: [{ say: "This chapter sets the go command's and Bazel's answers to Chapter 1's six decisions side by side.", hold: 0.8 }],
      draw(s) {
        s.fit(0, 0, 1000, 808);
        const X0 = 420, X1 = 940;
        const decisions = [
          ["Unit", ["module", "file"], [["go", 0.5], ["bazel", 0.5]]],
          ["Graph", ["derived", "declared"], [["go", 0], ["bazel", 1]]],
          ["Change", ["rehash all", "notified"], [["go", 0], ["bazel", 0.5], ["bazel", 1, true]]],
          ["Key", ["whole output", "part read"], [["go", 0], ["bazel", 1]]],
          ["Sharing", ["one process", "a team"], [["go", 0.4], ["go", 1, true], ["bazel", 0.25], ["bazel", 1, true]]],
          ["Execution", ["local", "remote"], [["go", 0], ["bazel", 0], ["bazel", 1, true]]],
        ];
        const key = s.group();
        marker(key, 420, 40, "go", false);
        key.text(446, 30, "go command", { size: 26, weight: 600, tone: "go" });
        marker(key, 660, 2, "bazel", true);
        key.text(686, 30, "Bazel with rules_go", { size: 26, weight: 600, tone: "bazel" });
        const rows = decisions.map(([name, ends, marks], i) => {
          const y = 130 + 110 * i;
          const g = s.group();
          g.circle(24, y, 22, { fill: 0, stroke: true });
          g.text(24, y + 9, String(i + 1), { size: 26, weight: 600, anchor: "middle" });
          g.text(62, y + 11, name, { size: 32, weight: 600 });
          g.line(X0, y, X1, y, { width: 3, opacity: 0.3 });
          [X0, X1].forEach((x, j) => {
            g.circle(x, y, 7, { fill: 0.5 });
            g.text(x, y + 58, ends[j], { size: 26, tone: "muted", anchor: "middle" });
          });
          const markers = marks.map(([kind, at, hollow = false]) => ({ kind, hollow, m: marker(s, mix(X0, X1, at), y, kind, kind === "bazel", hollow) }));
          return { g, markers };
        });
        const legend = s.group();
        marker(legend, 420, 772, null, true);
        legend.text(446, 800, "default", { size: 26, tone: "muted" });
        marker(legend, 580, 772, null, true, true);
        legend.text(606, 800, "with an option", { size: 26, tone: "muted" });
        return (t, cue) => {
          appear(key, t, 1.2);
          rows.forEach((row, i) => {
            appear(row.g, t, 0.3 + 0.15 * i);
            // Each answer drops onto its dial: the go command's, then Bazel's, then what options add.
            for (const { kind, hollow, m } of row.markers) {
              const a = (hollow ? cue[0] + 4.6 : kind === "go" ? cue[0] + 1.6 : cue[0] + 2.8) + 0.15 * i;
              const u = during(t, a, a + 0.5);
              place(m, 0, (kind === "go" ? -18 : 18) * (1 - u));
              show(m, u);
            }
          });
          appear(legend, t, cue[0] + 4.4);
        };
      },
    },
    {
      section: "Six decisions, two answers",
      lines: [
        "Unit: both run one compile per package and one link per binary.",
        "Bazel adds a fixed cost to every action: a sandbox, rules_go's builder, and hashing for its action cache.",
        { say: "In our view, the cost weighs most where packages are many and small.", hold: 1 },
      ],
      draw(s) {
        s.fit(0, -26, 1008, 506);
        const head = header(s, 1, "Unit");
        const hatch = s.hatch();
        const PRE = 48, POST = 32, GAP = 12, BH = 64, GO_Y = 140, BZ_Y = 310;
        // Where each action of a row starts, side by side.
        const lay = (widths) => widths.map((_, i) => widths.slice(0, i).reduce((x, w) => x + w + GAP, 0));
        const big = { widths: [180, 180, 180, 110], labels: ["compile a", "compile b", "compile c", "link"] };
        const small = { widths: [56, 56, 56, 56, 56, 110], labels: ["", "", "", "", "", "link"] };
        const goPill = leftPill(s, 0, 104, "go command", "go");
        const bzPill = leftPill(s, 0, 274, "Bazel", "bazel");
        // A Bazel action: the same compile or link, with a fixed cost before and after it.
        const wrapped = (x, y, w, label) => {
          const g = s.group();
          const pre = g.rect(x - PRE, y, PRE, BH, { r: 8, width: 2 });
          const post = g.rect(x + w, y, POST, BH, { r: 8, width: 2 });
          pre.setAttribute("fill", hatch);
          post.setAttribute("fill", hatch);
          g.box(x, y, w, BH, label);
          return { g, pre, post };
        };
        const xsBig = lay(big.widths);
        const xsSmall = lay(small.widths);
        const goBig = big.widths.map((w, i) => s.box(xsBig[i], GO_Y, w, BH, big.labels[i]));
        const bzBig = big.widths.map((w, i) => wrapped(xsBig[i], BZ_Y, w, big.labels[i]));
        const goSmall = small.widths.map((w, i) => s.box(xsSmall[i], GO_Y, w, BH, small.labels[i]));
        const bzSmall = small.widths.map((w, i) => wrapped(xsSmall[i] + i * (PRE + POST) + PRE, BZ_Y, w, small.labels[i]));
        // What the fixed cost is, at the first Bazel action once it has its cost.
        const before = s.group();
        before.line(PRE / 2, BZ_Y + BH + 8, PRE / 2, BZ_Y + BH + 26, { width: 2, opacity: 0.6 });
        before.text(0, BZ_Y + BH + 58, "sandbox, builder", { size: 26, tone: "muted" });
        const after = s.group();
        const hx = PRE + big.widths[0] + POST / 2;
        after.line(hx, BZ_Y + BH + 8, hx, BZ_Y + BH + 26, { width: 2, opacity: 0.6 });
        after.text(hx, BZ_Y + BH + 58, "hash", { size: 26, tone: "muted", anchor: "middle" });
        const legend = s.group();
        legend.rect(0, 472, 44, 28, { r: 6, width: 2 }).setAttribute("fill", hatch);
        legend.text(58, 496, "fixed cost per action", { size: 26 });
        const note = s.text(1008, 496, "illustrative widths, not to scale", { size: 26, anchor: "end", tone: "muted", italic: true });
        return (t, cue) => {
          appear(head, t, cue[0]);
          appear(goPill, t, cue[0] + 0.3);
          appear(bzPill, t, cue[0] + 1.2);
          // Bazel's actions take on their fixed cost, and move apart to make room for it.
          const grow = during(t, cue[1] + 1.8, cue[1] + 3.0);
          // Then many small packages instead of a few large ones: the large leave, the small come.
          const swap = during(t, cue[2] + 2.0, cue[2] + 2.5);
          const into = during(t, cue[2] + 2.5, cue[2] + 3.1);
          goBig.forEach((b, i) => show(b, during(t, cue[0] + 0.6 + 0.2 * i, cue[0] + 1.1 + 0.2 * i) * (1 - swap)));
          bzBig.forEach((a, i) => {
            show(a.g, during(t, cue[0] + 1.5 + 0.2 * i, cue[0] + 2.0 + 0.2 * i) * (1 - swap));
            place(a.g, grow * (i * (PRE + POST) + PRE), 0);
            show(a.pre, during(grow, 0.4, 1));
            show(a.post, during(grow, 0.4, 1));
          });
          goSmall.forEach((b) => show(b, into));
          bzSmall.forEach((a) => show(a.g, into));
          const gone = during(t, cue[2] + 1.2, cue[2] + 1.8);
          show(before, during(t, cue[1] + 3.6, cue[1] + 4.2) * (1 - gone));
          show(after, during(t, cue[1] + 5.4, cue[1] + 6.0) * (1 - gone));
          appear(legend, t, cue[2] + 0.4);
          appear(note, t, cue[2] + 0.4);
        };
      },
    },
    {
      section: "Six decisions, two answers",
      lines: [
        "Graph: the go command derives it from imports; every run lists every directory and checks every file.",
        "Bazel reads it from BUILD files and keeps it in the memory of its server, a long-lived process.",
        { say: "So the go command pays `T_graph`, the time to obtain the graph, on every run; Bazel pays it after each server start.", hold: 1 },
        { say: "Gazelle, a tool that writes BUILD files from the imports, must rerun whenever imports change.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, -26, 966, 704);
        // The go command's half stands alone in the middle until Bazel's arrives.
        const first = s.group();
        const head = header(first, 2, "Graph");
        const NODES = [[0, 0], [0, 90], [130, 45], [260, 0], [260, 90]];
        const LINKS = [[0, 2], [1, 2], [2, 3], [2, 4]];
        const graph = (stage, x, y) => {
          const g = stage.group();
          const nodes = NODES.map(([dx, dy]) => g.box(x + dx, y + dy, 70, 48, ""));
          const edges = LINKS.map(([a, b]) => g.edge(nodes[a], nodes[b]));
          return { nodes, edges };
        };
        // A run is a square: orange if it paid T_graph, dashed grey if the graph was kept.
        const squares = (stage, y) => [0, 1, 2, 3].map((k) => stage.box(700 + 58 * k, y, 44, 44, "", { r: 6 }));
        // The go command: from the imports, on every run.
        const goPill = leftPill(first, 0, 110, "go command", "go");
        const imports = first.file(0, 203, 200, 72, "imports", { mono: false });
        const goGraph = graph(first, 300, 170);
        const goFeed = first.edge(imports, [284, 239]);
        const goRunsLabel = first.text(700, 200, "runs", { size: 26, tone: "muted" });
        const goRuns = squares(first, 217);
        // Bazel: from BUILD files, kept in the server.
        const bzPill = leftPill(s, 0, 380, "Bazel", "bazel");
        const build = s.file(0, 493, 200, 72, "BUILD files", { mono: false });
        const server = s.group();
        server.rect(280, 410, 384, 206, { r: 14, width: 2 }).setAttribute("stroke-opacity", 0.5);
        server.text(300, 444, "server", { size: 26, tone: "muted" });
        const bzGraph = graph(s, 310, 460);
        const bzFeed = s.edge(build, [274, 529]);
        const bzRunsLabel = s.text(700, 490, "runs", { size: 26, tone: "muted" });
        const bzRuns = squares(s, 507);
        const fresh = s.text(896, 584, "new server", { size: 26, tone: "muted", anchor: "middle" });
        // Gazelle keeps the BUILD files in step with the imports.
        const imports2 = s.file(0, 630, 200, 72, "imports", { mono: false });
        const gazelle = s.edge(imports2, build, { from: "top", to: "bottom" });
        const gazelleLabel = s.text(116, 606, "Gazelle", { size: 26, weight: 600 });
        return (t, cue) => {
          place(first, 0, 197 * (1 - during(t, cue[1], cue[1] + 0.8)));
          appear(head, t, cue[0]);
          appear(goPill, t, cue[0] + 0.3);
          appear(imports, t, cue[0] + 0.8);
          goFeed.trace(during(t, cue[0] + 1.2, cue[0] + 1.8));
          appear(goRunsLabel, t, cue[0] + 1.8);
          // Every go run lists and checks everything, derives the graph, and drops it when it exits.
          const runs = [cue[0] + 2.4, cue[2] + 0.6, cue[2] + 3.4, cue[2] + 6.4];
          const k = runs.reduce((last, r, i) => (t >= r - 0.1 ? i : last), -1);
          const r = runs[Math.max(k, 0)];
          const leave = k >= 0 && k < runs.length - 1 ? during(t, runs[k + 1] - 0.5, runs[k + 1] - 0.15) : 0;
          goGraph.nodes.forEach((n, j) => {
            show(n, during(t, r + 0.2 + 0.08 * j, r + 0.5 + 0.08 * j) * (1 - leave));
            n.mark("run", during(t, r + 0.2 + 0.08 * j, r + 0.5 + 0.08 * j) * (1 - during(t, r + 1.6, r + 2.0)));
          });
          goGraph.edges.forEach((e) => show(e.trace(during(t, r + 0.5, r + 0.9)), 1 - leave));
          imports.mark("run", between(t, r, r + 1.4));
          goFeed.pulse(ramp(t, r + 0.05, r + 0.5));
          goRuns.forEach((q, i) => show(q.mark("run", 1), during(t, runs[i], runs[i] + 0.3)));
          // Bazel loads and analyzes once per server start; later runs reuse the graph.
          appear(bzPill, t, cue[1] + 0.8);
          appear(build, t, cue[1] + 1.3);
          bzFeed.trace(during(t, cue[1] + 2.0, cue[1] + 2.6));
          const load = cue[1] + 3.0;
          const restart = runs[3];
          const dip = between(t, restart - 0.5, restart, 0.3);
          show(server, during(t, cue[1] + 4.8, cue[1] + 5.4) * (1 - 0.85 * dip));
          appear(bzRunsLabel, t, cue[1] + 2.6);
          bzGraph.nodes.forEach((n, j) => {
            show(n, during(t, load + 0.12 * j, load + 0.35 + 0.12 * j) * (1 - 0.85 * dip));
            n.mark("run", between(t, load + 0.12 * j, load + 2.8, 0.3) + between(t, restart + 0.3 + 0.12 * j, restart + 2.4, 0.3));
            n.mark("hit", between(t, runs[1] + 0.2, runs[1] + 1.4, 0.3) + between(t, runs[2] + 0.2, runs[2] + 1.4, 0.3));
          });
          bzGraph.edges.forEach((e) => show(e.trace(during(t, load + 0.6, load + 1.1)), 1 - 0.85 * dip));
          bzFeed.pulse(t < restart - 0.7 ? ramp(t, load - 0.5, load) : ramp(t, restart - 0.1, restart + 0.4));
          [load, runs[1], runs[2], restart].forEach((at, i) => show(bzRuns[i].mark(i === 1 || i === 2 ? "hit" : "run", 1), during(t, at, at + 0.3)));
          appear(fresh, t, restart);
          // An import changes: Gazelle must rerun and rewrite the BUILD files.
          appear(imports2, t, cue[3] + 0.3);
          gazelle.trace(during(t, cue[3] + 0.6, cue[3] + 1.2));
          appear(gazelleLabel, t, cue[3] + 0.8);
          imports2.mark("run", during(t, cue[3] + 4.0, cue[3] + 4.4));
          gazelle.mark("run", during(t, cue[3] + 4.3, cue[3] + 4.9)).pulse(ramp(t, cue[3] + 4.3, cue[3] + 5.1));
          build.mark("run", during(t, cue[3] + 5.0, cue[3] + 5.4));
        };
      },
    },
    {
      section: "Six decisions, two answers",
      lines: [
        "Change: keeping no process between runs, the go command hashes every source file again, reading every byte.",
        "Bazel's server compares each known file's timestamps and inode number with the last build's, without reading it.",
        "`T_detect`, the time to find what changed, thus grows with the bytes of source under the go command and with the number of files under Bazel.",
        { say: "With `--watchfs`, Bazel asks the operating system instead, but by default it still checks every output of the last build.", hold: 1 },
      ],
      draw(s) {
        s.fit(0, -26, 1042, 640);
        // The go command's column stands alone in the middle until Bazel's arrives.
        const first = s.group();
        const head = header(first, 3, "Change");
        // Each bar is a source file, as long as its bytes; the last arrives as the repository grows.
        const L = [280, 130, 230, 90, 190, 250];
        const EDIT = 2, RX = 690, BH = 46;
        const Y = (i) => 150 + 66 * i;
        const goPill = leftPill(first, 0, 100, "go command", "go");
        const goFiles = L.map((w, i) => first.file(0, Y(i), w, BH, ""));
        const goRead = L.map((w, i) => first.rect(0, Y(i), 0, BH, { kind: "run", fill: 0.16, r: 6, width: 2 }));
        // One file of the repository changed: the same row in both columns.
        const edit = first.pill((L[EDIT] + RX - L[EDIT]) / 2, Y(EDIT) + BH / 2, "edit", { kind: "run" });
        const bzPill = leftPill(s, 420, 100, "Bazel", "bazel");
        const bzFiles = L.map((w, i) => s.file(RX - w, Y(i), w, BH, ""));
        const stamps = L.map((w, i) => s.box(RX - 44, Y(i), 44, BH, "", { r: 6 }));
        const inode = s.text(RX, 138, "times, inode", { size: 26, tone: "muted", anchor: "end" });
        const watch = s.text(890, 258, "`--watchfs`", { size: 26, anchor: "middle" });
        const os = s.box(740, 270, 300, 70, "operating system");
        const tell = s.edge(os, stamps[EDIT], { from: "left", to: "right" });
        const outLabel = s.text(420, 584, "outputs of the last build", { size: 26, tone: "muted" });
        const outputs = [0, 1, 2, 3, 4, 5].map((k) => s.box(420 + 50 * k, 598, 40, 40, "", { r: 6 }));
        const total = L.slice(0, 5).reduce((a, b) => a + b, 0);
        return (t, cue) => {
          place(first, 328 * (1 - during(t, cue[1], cue[1] + 0.8)), 0);
          appear(head, t, cue[0]);
          appear(goPill, t, cue[0] + 0.3);
          appear(edit, t, cue[0] + 1.4);
          // The go command reads every byte of every file, one file after another.
          const read = ramp(t, cue[0] + 2.6, cue[0] + 7.0) * total;
          L.forEach((w, i) => {
            const shown = i < 5 ? during(t, cue[0] + 0.6 + 0.1 * i, cue[0] + 1.1 + 0.1 * i) : during(t, cue[2] + 4.6, cue[2] + 5.1);
            show(goFiles[i], shown);
            show(bzFiles[i], i < 5 ? during(t, cue[1] + 0.9 + 0.1 * i, cue[1] + 1.4 + 0.1 * i) : shown);
            const done = i < 5 ? read - L.slice(0, i).reduce((a, b) => a + b, 0) : ramp(t, cue[2] + 5.2, cue[2] + 6.6) * w;
            goRead[i].setAttribute("width", Math.min(w, Math.max(0, done)).toFixed(1));
          });
          // Bazel's server compares each file's times and inode: one check a file, whatever its size.
          appear(bzPill, t, cue[1] + 0.8);
          appear(inode, t, cue[1] + 2.4);
          const off = during(t, cue[3] + 3.6, cue[3] + 4.2); // with --watchfs, only the file the system names
          stamps.forEach((stamp, i) => {
            show(stamp, i < 5 ? during(t, cue[1] + 0.9 + 0.1 * i, cue[1] + 1.4 + 0.1 * i) : during(t, cue[2] + 4.6, cue[2] + 5.1));
            const at = i < 5 ? cue[1] + 4.0 + 0.25 * i : cue[2] + 8.4;
            stamp.mark("run", during(t, at, at + 0.25) * (i === EDIT ? 1 : 1 - off));
          });
          appear(watch, t, cue[3] + 0.8);
          appear(os, t, cue[3] + 0.8);
          tell.trace(during(t, cue[3] + 1.6, cue[3] + 2.2));
          stamps[EDIT].focus(between(t, cue[3] + 2.4, cue[3] + 4.6));
          // But every output of the last build is still checked.
          appear(outLabel, t, cue[3] + 5.6);
          outputs.forEach((b, k) => {
            appear(b, t, cue[3] + 5.8 + 0.08 * k, 0.4);
            b.mark("run", during(t, cue[3] + 6.6 + 0.2 * k, cue[3] + 6.85 + 0.2 * k));
          });
        };
      },
    },
    {
      section: "Six decisions, two answers",
      lines: [
        { say: "Key: a go compile's key hashes each direct import's whole archive: export data for importers, and object code for links.", hold: 0.8 },
        { say: "So a body edit to a function that is not inlined recompiles every direct importer.", hold: 0.8 },
        "rules_go splits the two: object code to a `.a` file for links, export data to a `.x` file for importers.",
        { say: "An importer reads only the `.x`, so a body edit stops at the edited package if the `.x` is unchanged; both relink every binary that contains it.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, -56, 942, 818, 0.82);
        // The go command's half stands alone in the middle until Bazel's arrives.
        const first = s.group();
        const head = header(first, 4, "Key");
        place(head, 0, -30);
        const GO0 = 110, BZ0 = 520;
        // What both systems have: core, its direct importers, and the binaries that contain it.
        const side = (s, y0) => {
          const core = s.box(0, y0 + 99, 130, 68, "core", { mono: true });
          const top = s.group();
          frame(top, 480, y0 + 8, 460, 117, { r: 12 });
          top.text(480, y0 - 6, "direct importers", { size: 26, tone: "muted" });
          const importers = [0, 1, 2, 3].map((k) => s.box(496 + 112 * k, y0 + 34, 92, 64, ""));
          const bottom = s.group();
          frame(bottom, 480, y0 + 141, 460, 117, { r: 12 });
          bottom.text(480, y0 + 292, "binaries", { size: 26, tone: "muted" });
          const links = [0, 1].map((k) => s.box(496 + 222 * k, y0 + 168, 206, 64, "link"));
          const toImporters = s.edge([416, y0 + 66], [474, y0 + 66]);
          const toLinks = s.edge([416, y0 + 199], [474, y0 + 199]);
          const edit = s.pill(65, y0 + 66, "edit", { kind: "run" });
          return { core, top, importers, bottom, links, toImporters, toLinks, edit };
        };
        // core's archive: export data for importers on top, object code for links below.
        const archive = (s, y0) => {
          const g = s.group();
          const box = g.file(190, y0, 220, 266, "");
          const object = g.rect(190, y0 + 133, 220, 133, { kind: "run", fill: 0.16, r: 6, width: 2 });
          // The hash of the whole archive changing: an outline, so the export data stays uncoloured.
          const whole = g.rect(190, y0, 220, 266, { kind: "run", r: 6, width: 3.5 });
          g.line(190, y0 + 133, 410, y0 + 133, { width: 2, opacity: 0.5 });
          g.text(300, y0 + 76, "export data", { size: 28, anchor: "middle" });
          g.text(300, y0 + 209, "object code", { size: 28, anchor: "middle" });
          g.text(300, y0 - 14, "archive", { size: 26, tone: "muted", anchor: "middle" });
          return { g, box, object, whole };
        };
        const goPill = leftPill(first, 0, 52, "go command", "go");
        const go = side(first, GO0);
        const goArchive = archive(first, GO0);
        const goFeed = first.edge(go.core, goArchive.box);
        const bzPill = leftPill(s, 0, 462, "Bazel", "bazel");
        const bz = side(s, BZ0);
        const joined = archive(s, BZ0);
        const joinedFeed = s.edge(bz.core, joined.box);
        const dotX = s.file(190, BZ0 + 8, 220, 117, ".x", { sub: "export data" });
        const dotA = s.file(190, BZ0 + 141, 220, 117, ".a", { sub: "object code" });
        const feedX = s.edge(bz.core, dotX);
        const feedA = s.edge(bz.core, dotA);
        const unchanged = s.pill(300, BZ0 - 18, "unchanged");
        const stop = s.line(445, BZ0 + 40, 445, BZ0 + 92, { width: 6, opacity: 1 });
        return (t, cue) => {
          const [c0, c1, c2, c3] = cue;
          place(first, 0, 204 * (1 - during(t, c2, c2 + 0.8)));
          appear(head, t, c0);
          // The go command: the importers' keys hash core's whole archive.
          appear(goPill, t, c0 + 0.3);
          appear(go.core, t, c0 + 0.6);
          appear(goArchive.g, t, c0 + 1.0);
          goFeed.trace(during(t, c0 + 1.2, c0 + 1.8));
          appear(go.top, t, c0 + 1.6);
          go.importers.forEach((b, k) => appear(b, t, c0 + 1.8 + 0.1 * k));
          appear(go.bottom, t, c0 + 2.2);
          go.links.forEach((b, k) => appear(b, t, c0 + 2.4 + 0.1 * k));
          goArchive.box.focus(between(t, c0 + 3.4, c0 + 5.2));
          go.toImporters.trace(during(t, c0 + 4.8, c0 + 5.4));
          go.toLinks.trace(during(t, c0 + 7.0, c0 + 7.6));
          // A body edit changes the object code, so the hash of the whole archive, so every importer's key.
          appear(go.edit, t, c1 + 0.3);
          go.core.mark("run", during(t, c1 + 1.0, c1 + 1.5));
          show(goArchive.object, during(t, c1 + 1.8, c1 + 2.3));
          show(goArchive.whole, during(t, c1 + 2.6, c1 + 3.1));
          show(joined.whole, 0);
          show(joined.object, 0);
          go.toImporters.mark("run", during(t, c1 + 3.2, c1 + 3.8)).pulse(ramp(t, c1 + 3.0, c1 + 3.8));
          go.importers.forEach((b, k) => b.mark("run", during(t, c1 + 3.9 + 0.2 * k, c1 + 4.4 + 0.2 * k)));
          // rules_go: the archive splits into .x for importers and .a for links.
          appear(bzPill, t, c2 + 0.8);
          appear(bz.core, t, c2 + 1.0);
          const split = during(t, c2 + 2.7, c2 + 3.2);
          const parting = during(t, c2 + 2.2, c2 + 2.7);
          show(joined.g, during(t, c2 + 1.2, c2 + 1.7) * (1 - parting));
          show(joinedFeed.trace(during(t, c2 + 1.3, c2 + 1.8)), 1 - parting);
          for (const x of [dotX, dotA, feedX, feedA]) show(x, split);
          appear(bz.top, t, c2 + 1.5);
          bz.importers.forEach((b, k) => appear(b, t, c2 + 1.6 + 0.08 * k));
          appear(bz.bottom, t, c2 + 1.8);
          bz.links.forEach((b, k) => appear(b, t, c2 + 1.9 + 0.1 * k));
          bz.toLinks.trace(during(t, c2 + 3.6, c2 + 4.2));
          bz.toImporters.trace(during(t, c2 + 6.0, c2 + 6.6));
          // The same edit: .a changes, .x does not, so the importers are hits.
          appear(bz.edit, t, c3 + 3.0);
          bz.core.mark("run", during(t, c3 + 3.6, c3 + 4.1));
          dotA.mark("run", during(t, c3 + 4.4, c3 + 4.9));
          appear(unchanged, t, c3 + 5.6);
          appear(stop, t, c3 + 6.2, 0.4);
          bz.importers.forEach((b, k) => b.mark("hit", during(t, c3 + 6.6 + 0.15 * k, c3 + 7.1 + 0.15 * k)));
          // Both relink every binary that contains core.
          for (const x of [go, bz]) {
            x.toLinks.mark("run", during(t, c3 + 8.2, c3 + 8.8)).pulse(ramp(t, c3 + 8.0, c3 + 8.8));
            x.links.forEach((b, k) => b.mark("run", during(t, c3 + 8.8 + 0.2 * k, c3 + 9.3 + 0.2 * k)));
          }
        };
      },
    },
    {
      section: "Six decisions, two answers",
      lines: [
        "Sharing: GOCACHE, the go command's build cache, belongs to one user on one machine.",
        "`GOCACHEPROG` can hand it to a program that stores entries anywhere, but without `-trimpath` a checkout at another path misses.",
        "Bazel runs every action in the execroot, with fixed relative paths, so its keys ignore where the checkout lies.",
        "Its action cache serves one checkout, a disk cache every checkout on a machine, and a remote cache a team, links included.",
      ],
      draw(s) {
        s.fit(0, -26, 1040, 702);
        const head = header(s, 5, "Sharing");
        const goPill = leftPill(s, 260, 0, "go command", "go");
        const bzPill = leftPill(s, 260, 0, "Bazel", "bazel");
        const team = s.group();
        const teamRect = frame(team, 0, 50, 1040, 650, { r: 18 });
        team.text(24, 88, "a team", { size: 26, tone: "muted" });
        const m1 = s.group();
        const m1Rect = frame(m1, 24, 110, 556, 340);
        m1.text(48, 146, "one machine", { size: 26, tone: "muted" });
        const m2 = s.group();
        frame(m2, 610, 110, 406, 340);
        m2.text(634, 146, "another machine", { size: 26, tone: "muted" });
        const A = s.box(50, 170, 250, 104, "checkout", { sub: "action cache" });
        const B = s.box(50, 312, 250, 104, "checkout", { sub: "another path" });
        const C = s.box(688, 200, 250, 104, "checkout");
        // The cache that serves one machine, and the one that serves the team.
        const goCache = s.cache(450, 290, { w: 190, h: 150, label: "`GOCACHE`" });
        const disk = s.cache(450, 290, { w: 190, h: 150, label: "disk cache" });
        const prog = s.cache(520, 600, { w: 250, h: 130, label: "`GOCACHEPROG`", kind: "remote" });
        const remote = s.cache(520, 600, { w: 250, h: 130, label: "remote cache", kind: "remote" });
        const eA = s.edge(A, disk);
        const eB = s.edge(B, disk);
        const eA2 = s.edge(A, prog, { to: "top" });
        const eB2 = s.edge(B, prog, { to: "top" });
        const eC = s.edge(C, remote, { from: "bottom", to: "right" });
        const links = s.pill(890, 650, "links included");
        return (t, cue) => {
          const [c0, c1, c2, c3] = cue;
          appear(head, t, c0);
          const toBazel = during(t, c2, c2 + 0.5);
          show(goPill, during(t, c0 + 0.2, c0 + 0.7) * (1 - toBazel));
          show(bzPill, during(t, c2 + 0.4, c2 + 0.9));
          appear(team, t, c0 + 0.3);
          appear(m1, t, c0 + 0.5);
          appear(m2, t, c0 + 0.7);
          appear(A, t, c0 + 0.9);
          appear(B, t, c0 + 1.1);
          appear(C, t, c0 + 1.3);
          show(A.labels[1], during(t, c3 + 0.4, c3 + 1.0));
          m1Rect.setAttribute("stroke-opacity", (0.35 + 0.5 * (between(t, c0 + 4.2, c0 + 5.8) + between(t, c3 + 2.4, c3 + 4.6))).toFixed(3));
          teamRect.setAttribute("stroke-opacity", (0.35 + 0.5 * between(t, c3 + 5.0, c3 + 7.6)).toFixed(3));
          // The go command: GOCACHE on one machine; GOCACHEPROG hands it to a program that stores entries anywhere.
          const move = during(t, c1 + 1.2, c1 + 2.6);
          place(goCache, 70 * move, 310 * move);
          show(goCache, during(t, c0 + 2.4, c0 + 3.0) * (1 - during(t, c1 + 1.8, c1 + 2.3)));
          show(prog, during(t, c1 + 2.3, c1 + 2.8) * (1 - toBazel));
          eA.trace(during(t, c0 + 3.0, c0 + 3.6));
          show(eA, 1 - during(t, c1 + 1.2, c1 + 1.8) + during(t, c2 + 0.8, c2 + 1.3));
          eA.pulse(t < c2 ? ramp(t, c0 + 3.6, c0 + 4.4) : ramp(t, c2 + 2.0, c2 + 2.8));
          show(eA2.trace(during(t, c1 + 2.6, c1 + 3.2)), 1 - toBazel);
          // A checkout at another path: its keys differ, so it misses.
          show(eB2.trace(during(t, c1 + 5.4, c1 + 6.0)).mark("run", during(t, c1 + 6.2, c1 + 6.6)), 1 - toBazel);
          B.mark("run", during(t, c1 + 6.8, c1 + 7.3) * (1 - toBazel));
          // Bazel: the same checkout hits, its keys free of the path.
          appear(disk, t, c2 + 0.6);
          appear(remote, t, c2 + 0.8);
          eB.trace(during(t, c2 + 1.0, c2 + 1.6)).mark("hit", during(t, c2 + 6.0, c2 + 6.5));
          B.mark("hit", during(t, c2 + 6.4, c2 + 6.9));
          // And a remote cache serves another machine of the team.
          eC.trace(during(t, c3 + 5.4, c3 + 6.0)).mark("hit", during(t, c3 + 6.2, c3 + 6.7));
          C.mark("hit", during(t, c3 + 6.6, c3 + 7.1));
          appear(links, t, c3 + 7.6);
        };
      },
    },
    {
      section: "Six decisions, two answers",
      lines: [
        "Execution: the go command runs actions on one machine, `-p` at a time, by default one per CPU core.",
        "One machine's cores then set the floor of `T_exec`, the time to run what missed the cache.",
        "With remote execution, Bazel sends actions to a pool of machines, so the pool bounds parallelism.",
        { say: "That adds `T_transfer`, the time to move bytes, which Build without the Bytes limits by downloading only the outputs asked for and those local actions need.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, -26, 1000, 802);
        // The go command's half stands alone in the middle until Bazel's arrives.
        const first = s.group();
        const head = header(first, 6, "Execution");
        // The go command: four cores, so four actions at a time, in waves.
        const goPill = leftPill(first, 0, 64, "go command", "go");
        const machine = first.group();
        frame(machine, 0, 100, 1000, 350);
        machine.text(24, 136, "one machine", { size: 26, tone: "muted" });
        const LANE = (i) => 160 + 60 * i;
        const SLOT = (k) => 160 + 265 * k;
        const lanes = [0, 1, 2, 3].map((i) => {
          const g = first.group();
          g.rect(150, LANE(i) - 6, 800, 56, { r: 8, fill: 0.05, stroke: false });
          g.text(136, LANE(i) + 31, "core", { size: 26, tone: "muted", anchor: "end" });
          return g;
        });
        const waves = [];
        for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) waves.push({ k, i, box: first.box(SLOT(k), LANE(i), 250, 44, "", { kind: "run" }) });
        const floor = first.group();
        floor.line(160, 398, 940, 398, { width: 2.5, opacity: 0.7 });
        floor.line(160, 388, 160, 408, { width: 2.5, opacity: 0.7 });
        floor.line(940, 388, 940, 408, { width: 2.5, opacity: 0.7 });
        floor.text(550, 434, "`T_exec`", { size: 26, anchor: "middle" });
        // Bazel with remote execution: a pool of machines, and bytes moved to and from it.
        const bzPill = leftPill(s, 0, 500, "Bazel", "bazel");
        const local = s.box(0, 600, 180, 120, "local");
        const pool = s.group();
        pool.rect(400, 540, 600, 262, { r: 14, width: 2, kind: "remote" });
        pool.text(424, 576, "remote pool", { size: 26, tone: "remote" });
        for (let m = 0; m < 3; m++) pool.rect(424 + 192 * m, 596, 176, 186, { r: 10, width: 2 }).setAttribute("stroke-opacity", 0.35);
        const spread = [];
        for (let m = 0; m < 3; m++) for (let r = 0; r < 4; r++) spread.push(s.box(436 + 192 * m, 608 + 44 * r, 152, 34, "", { kind: "run", r: 6 }));
        const up = s.edge([186, 640], [394, 640], { kind: "remote" });
        const down = s.edge([394, 700], [186, 700], { kind: "remote" });
        const transfer = s.text(288, 616, "`T_transfer`", { size: 26, anchor: "middle", tone: "remote" });
        const output = s.file(10, 740, 160, 52, "output", { mono: false });
        return (t, cue) => {
          const [c0, c1, c2, c3] = cue;
          appear(head, t, c0);
          appear(goPill, t, c0 + 0.3);
          appear(machine, t, c0 + 0.6);
          lanes.forEach((g, i) => appear(g, t, c0 + 1.0 + 0.1 * i));
          waves.forEach(({ k, i, box }) => appear(box, t, c0 + 3.4 + 1.4 * k + 0.08 * i, 0.4));
          appear(floor, t, c1 + 2.6);
          place(first, 0, 175 * (1 - during(t, c2, c2 + 0.8)));
          appear(bzPill, t, c2 + 0.8);
          appear(local, t, c2 + 1.1);
          appear(pool, t, c2 + 2.4);
          up.trace(during(t, c2 + 3.0, c2 + 3.5));
          up.pulse(t < c3 ? ramp(t, c2 + 3.5, c2 + 4.2) : ramp(t, c3 + 1.6, c3 + 2.4), "remote");
          spread.forEach((b, j) => appear(b, t, c2 + 4.2 + 0.03 * j, 0.4));
          appear(transfer, t, c3 + 1.0);
          down.trace(during(t, c3 + 6.2, c3 + 6.8));
          down.pulse(ramp(t, c3 + 6.8, c3 + 7.6), "remote");
          appear(output, t, c3 + 7.6);
        };
      },
    },
    {
      section: "Where each stops scaling",
      lines: [
        { say: "Take one local body edit that leaves the export data unchanged, split by Chapter 1's cost terms.", hold: 1 },
        "Finding the graph and the change grows with the repository; running what missed grows with the edit.",
        "In our analysis, the go command stops scaling where a run's work grows with the repository rather than the change.",
        { say: "Bazel, in our analysis, stops scaling where its overheads grow with the graph: server memory, and loading and analysis at every server start.", hold: 1 },
      ],
      draw(s) {
        // Figure 8.2.
        s.fit(0, 0, 1048, 640);
        const COLX = [206, 488, 770], CW = 268, CH = 124, ROWY = [104, 244, 384];
        const terms = [["T_graph", "obtain the graph"], ["T_detect", "find what changed"], ["T_exec", "run what missed"]];
        const heads = terms.map(([term, words], c) => {
          const g = s.group();
          g.text(COLX[c] + CW / 2, 34, `\`${term}\``, { size: 32, weight: 600, anchor: "middle" });
          g.text(COLX[c] + CW / 2, 70, words, { size: 27, tone: "muted", anchor: "middle" });
          return g;
        });
        const table = [
          ["go command", "go", "every run", [["run", ["list every", "directory, check", "every file"]], ["run", ["hash every", "source file"]], ["run", ["the package, its", "direct importers,", "its binaries"]]]],
          ["Bazel", "bazel", "server running", [["hit", ["kept in memory"]], ["run", ["compare every", "known file's times"]], ["run", ["the package,", "its binaries"]]]],
          ["Bazel", "bazel", "new server", [["run", ["start the server,", "load and analyze", "every target"]], ["run", ["check every file,", "look up every", "action"]], ["run", ["the package,", "its binaries"]]]],
        ];
        const rows = table.map(([name, kind, when, cells], r) => {
          const y = ROWY[r];
          const label = s.group();
          label.text(0, y + 56, name, { size: 30, weight: 600, tone: kind });
          label.text(0, y + 92, when, { size: 26, tone: "muted" });
          const boxes = cells.map(([state, words], c) => {
            const g = s.group();
            const rect = g.rect(COLX[c], y, CW, CH, { kind: state, fill: 0.16, r: 10, width: 2.5 });
            words.forEach((line, i) => g.text(COLX[c] + CW / 2, y + CH / 2 + 10 + (i - (words.length - 1) / 2) * 36, line, { size: 28, anchor: "middle" }));
            return { g, rect };
          });
          return { label, boxes };
        });
        // What grows with the repository leaves out the graph the running server kept.
        const repo = s.group();
        svg("path", { d: "M198,96 H761 V516 H198 V376 H481 V236 H198 Z", fill: "none", stroke: "currentColor", "stroke-opacity": 0.45, "stroke-width": 2.5, "stroke-linejoin": "round" }, repo.g);
        repo.text(479, 560, "grows with the repository", { size: 27, tone: "muted", anchor: "middle" });
        const edit = s.group();
        edit.rect(765, 96, 281, 420, { r: 4, width: 2.5 }).setAttribute("stroke-opacity", 0.45);
        edit.text(905, 560, "grows with the edit", { size: 27, tone: "muted", anchor: "middle" });
        const legend = s.legend(206, 628, [["run", "runs"], ["hit", "skipped: kept from the last command"]]);
        return (t, cue) => {
          const [c0, c1, c2, c3] = cue;
          heads.forEach((g, c) => appear(g, t, c0 + 0.3 + 0.4 * c));
          rows.forEach((row, r) => {
            const at = c0 + 2.0 + 1.4 * r;
            // The rows a sentence is not about step back.
            const dim = r === 0 ? during(t, c3 + 0.3, c3 + 0.9) : during(t, c2 + 1.6, c2 + 2.2) * (1 - during(t, c3 + 0.3, c3 + 0.9));
            show(row.label, during(t, at, at + 0.5) * (1 - 0.6 * dim));
            row.boxes.forEach((b, c) => show(b.g, during(t, at + 0.2 + 0.2 * c, at + 0.7 + 0.2 * c) * (1 - 0.6 * dim)));
          });
          appear(legend, t, c0 + 5.6);
          appear(repo, t, c1 + 0.8);
          appear(edit, t, c1 + 4.4);
          // The go command: every run finds the graph and the change over the whole tree.
          const whole = between(t, c2 + 4.0, c3 + 0.2);
          for (const c of [0, 1]) rows[0].boxes[c].rect.setAttribute("stroke-width", mix(2.5, 5, whole).toFixed(2));
          // Bazel: the server's memory, and loading and analysis at each start.
          rows[1].boxes[0].rect.setAttribute("stroke-width", mix(2.5, 5, during(t, c3 + 5.4, c3 + 6.0)).toFixed(2));
          rows[2].boxes[0].rect.setAttribute("stroke-width", mix(2.5, 5, during(t, c3 + 6.8, c3 + 7.4)).toFixed(2));
        };
      },
    },
  ],
};
