// Chapter 4's film: one go build from patterns to tools, what goes into an
// action ID, content IDs and the early cutoff they give, GOCACHE's files,
// and the two-level test cache. Every sentence comes from the chapter, and
// the pictures follow its figures 4.1 to 4.5.

import { during, measure, mix, place, ramp, show, svg } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// Shown from a until b: in and out over 0.3 s, so that two labels in one place never show at once.
const between = (t, a, b = Infinity) => during(t, a, a + 0.3) * (b === Infinity ? 1 : 1 - during(t, b, b + 0.3));
// Draw an edge up to part u, at opacity k; hidden until it starts.
const trace = (edge, u, k = 1) => show(edge.trace(u), u > 0 ? k : 0);
// Where something is at t, from start, after moves [from, to, x, y].
const travel = (t, start, moves) => moves.reduce(([x, y], [a, b, nx, ny]) => [mix(x, nx, during(t, a, b)), mix(y, ny, during(t, a, b))], start);

export default {
  chapter: "4",
  title: "The go command's design",
  scenes: [
    {
      // Loading: patterns become packages; each run lists and checks every file, and parses only what changed.
      section: "One build, step by step",
      lines: [
        { say: "The go command turns patterns such as `./...` into packages, reading only each file's header (package clause, imports) unless it imports `embed`.", hold: 0.8 },
        { say: "Every run lists every directory and checks each file's size and modification time, but parses only the directories that changed.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(-4, -58, 1012, 708);
        const PITCH = 128, PAGE = 104;
        const tree = [["core", ["core.go", "hash.go"]], ["auth", ["auth.go", "token.go"]], ["billing", ["pay.go", "tax.go"]], ["api", ["api.go", "routes.go"]], ["app00", ["main.go"]]];
        const pattern = s.pill(56, 2 * PITCH + PAGE / 2, "./...", { mono: true });
        const rows = tree.map(([name, files], i) => {
          const y = i * PITCH, cy = y + PAGE / 2;
          const dir = s.file(210, cy - 32, 190, 64, `${name}/`);
          const into = s.edge([pattern.cx + pattern.w / 2 + 2, pattern.cy], dir);
          // A file: its name, its header (two lines) and the rest, which is not read.
          const pages = files.map((file, j) => {
            const x = 440 + 184 * j;
            const g = s.group();
            const page = g.file(x, y, 168, PAGE, "");
            g.text(x + 14, y + 36, file, { size: 26, mono: true });
            g.rect(x + 14, y + 52, 96, 10, { r: 3, fill: 0.35, stroke: false });
            g.rect(x + 14, y + 68, 132, 10, { r: 3, fill: 0.35, stroke: false });
            g.rect(x + 14, y + 86, 116, 8, { r: 3, fill: 0.12, stroke: false });
            const header = g.group();
            header.rect(x + 14, y + 52, 96, 10, { kind: "run", r: 3, fill: 1, stroke: false });
            header.rect(x + 14, y + 68, 132, 10, { kind: "run", r: 3, fill: 1, stroke: false });
            return { g, page, header };
          });
          const pkg = s.box(840, cy - 32, 170, 64, name, { mono: true });
          const out = s.edge(pages[pages.length - 1].page, pkg);
          return { dir, into, pages, pkg, out };
        });
        const edit = s.pill(708, -32, "edit", { kind: "run" });
        const key = s.legend(210, 700, [["run", "runs"], ["hit", "from GOCACHE"]]);
        return (t, cue) => {
          const [c0, c1] = cue;
          appear(pattern, t, c0 + 0.2);
          const reset = during(t, c1 + 0.1, c1 + 0.6);
          rows.forEach((r, i) => {
            trace(r.into, during(t, c0 + 0.7 + 0.1 * i, c0 + 1.5 + 0.1 * i));
            appear(r.dir, t, c0 + 1.0 + 0.12 * i);
            r.pages.forEach((p, j) => {
              appear(p.g, t, c0 + 1.8 + 0.12 * i + 0.08 * j);
              // The first run reads every header; the next parses only the changed directory's.
              const first = during(t, c0 + 4.8 + 0.12 * i, c0 + 5.3 + 0.12 * i) * (1 - reset);
              const again = i === 0 ? during(t, c1 + 5.8, c1 + 6.3) : 0;
              show(p.header, Math.max(first, again));
              p.page.mark("run", during(t, c1 + 2.6 + 0.2 * i + 0.1 * j, c1 + 3.1 + 0.2 * i + 0.1 * j));
            });
            trace(r.out, during(t, c0 + 3.0 + 0.12 * i, c0 + 3.7 + 0.12 * i));
            appear(r.pkg, t, c0 + 3.4 + 0.12 * i);
            r.dir.mark("run", during(t, c1 + 1.0 + 0.2 * i, c1 + 1.5 + 0.2 * i));
            r.pkg.mark(i === 0 ? "run" : "hit", during(t, c1 + 6.4 + 0.2 * i, c1 + 6.9 + 0.2 * i));
          });
          appear(edit, t, c1 + 0.4);
          appear(key, t, c1 + 5.6);
        };
      },
    },
    {
      // The action graph, run by -p goroutines.
      section: "One build, step by step",
      lines: [
        { say: "The packages become an action graph: one compile per package, depending on the compiles of its direct imports, and one link per main package.", hold: 0.8 },
        { say: "`Builder.Do` starts `-p` goroutines, one per CPU by default; each runs the next action whose dependencies are done, unless its output is cached.", hold: 1.2 },
      ],
      draw(s) {
        s.fit(10, -4, 1004, 656);
        const BW = 210, BH = 92;
        const spot = { core: [260, 560], auth: [120, 420], billing: [400, 420], api: [260, 280], app00: [260, 140], link: [260, 0] };
        // The graph stands alone in the middle until the goroutines come; then it moves left to make room.
        const graph = s.group();
        const node = Object.fromEntries(Object.entries(spot).map(([name, [cx, y]]) => [name, graph.box(cx - BW / 2, y, BW, BH, name === "link" ? "link" : "compile", { sub: `\`${name === "link" ? "app00" : name}\`` })]));
        const up = (a, b) => graph.edge(node[a], node[b], { from: "top", to: "bottom" });
        const deps = [up("core", "auth"), up("core", "billing"), up("auth", "api"), up("billing", "api"), up("api", "app00")];
        const toLink = up("app00", "link");
        const pool = s.group();
        pool.rect(600, 226, 400, 200, { kind: "go", dash: "10 8" });
        pool.text(626, 272, "`Builder.Do`", { size: 30, weight: 600, tone: "go" });
        pool.text(626, 402, "`-p` goroutines", { size: 28, tone: "muted" });
        const home = [[690, 336], [770, 336]];
        const tokens = home.map(() => {
          const g = s.group();
          g.circle(0, 0, 17, { kind: "go" });
          return g;
        });
        // Who runs what, in seconds after the second line starts: [action, goroutine, leaves, arrives, done, outcome].
        const jobs = [
          ["core", 0, 3.6, 4.05, 4.5, "hit"],
          ["auth", 0, 4.5, 4.95, 5.4, "hit"],
          ["billing", 1, 4.5, 5.0, 5.45, "hit"],
          ["api", 0, 5.45, 5.9, 6.9, "run"],
          ["app00", 0, 6.9, 7.3, 8.3, "run"],
          ["link", 0, 8.3, 8.7, 9.7, "run"],
        ];
        const seat = (n) => [node[n].x + 24, node[n].y + 24];
        const moves = home.map((_, k) => jobs.filter((j) => j[1] === k).map(([n, , a, b]) => [a, b, ...seat(n)]));
        moves[0].push([9.7, 10.1, ...home[0]]);
        moves[1].push([5.45, 5.9, ...home[1]]);
        const order = ["core", "auth", "billing", "api", "app00"];
        return (t, cue) => {
          const [c0, c1] = cue;
          order.forEach((n, k) => appear(node[n], t, c0 + 1.6 + 0.3 * k));
          deps.forEach((e, k) => trace(e, during(t, c0 + 4.6 + 0.25 * k, c0 + 5.2 + 0.25 * k)));
          appear(node.link, t, c0 + 7.8);
          trace(toLink, during(t, c0 + 8.1, c0 + 8.7));
          place(graph, mix(247, 0, during(t, c1, c1 + 0.7)), 0);
          appear(pool, t, c1 + 0.5);
          tokens.forEach((g, k) => {
            appear(g, t, c1 + 1.2 + 0.2 * k);
            place(g, ...travel(t - c1, home[k], moves[k]));
          });
          for (const [n, , , b, done, kind] of jobs) {
            node[n].mark(kind, during(t, c1 + b, c1 + b + 0.3));
            node[n].focus(during(t, c1 + b, c1 + b + 0.15) * (1 - during(t, c1 + done - 0.15, c1 + done)));
          }
        };
      },
    },
    {
      // Figure 4.2: what goes into a compile's action ID, and the directory that splits caches.
      section: "Action IDs",
      lines: [
        { say: "An action ID is a SHA-256 hash of everything that could change an action's output.", hold: 0.8 },
        { say: "For a compile: the compiler's version and flags, the platform and `GOEXPERIMENT`, the import path, every input file's contents, and each direct import's content ID.", hold: 0.8 },
        { say: "Unless `-trimpath` is set, it also hashes the package's absolute directory, which debug information may record.", hold: 0.8 },
        { say: "So a cache filled at one checkout path misses the repository's packages at another, unless both use `-trimpath`.", hold: 1.4 },
      ],
      draw(s) {
        s.fit(0, 0, 940, 556);
        const rows = [
          [0, 64, "compiler version and flags"],
          [80, 64, "platform, `GOEXPERIMENT`"],
          [160, 64, "import path"],
          [240, 100, "package directory"],
          [356, 64, "each source file's contents"],
          [436, 64, "each import's content ID"],
        ];
        const inputs = rows.map(([y, h, label]) => s.box(0, y, 460, h, label, h > 64 ? { sub: " " } : {}));
        const dir = inputs[3];
        const paths = ["/ci/run-41/src/core", "/ci/run-42/src/core"].map((p) => s.text(230, 326, p, { size: 26, mono: true, anchor: "middle", tone: "muted" }));
        // The hash and the ID stand in the middle until the inputs come; then they move right to make room.
        const hashing = s.group();
        const funnel = hashing.group();
        svg("path", { d: "M520,16 L520,484 L680,300 L680,200 Z", fill: "currentColor", "fill-opacity": 0.06, stroke: "currentColor", "stroke-width": 2.5, "stroke-linejoin": "round" }, funnel.g);
        funnel.text(592, 259, "SHA-256", { size: 26, anchor: "middle", tone: "muted" });
        const feeds = inputs.map((box) => s.edge(box, [516, box.cy]));
        const id = hashing.box(720, 196, 220, 108, "action ID", { sub: " ", kind: "go" });
        const ids = ["3f2a…", "8d07…", "5e1c…"].map((v) => hashing.text(830, 286, v, { size: 26, mono: true, anchor: "middle", tone: "muted" }));
        const toId = hashing.edge([684, 250], id);
        const cache = s.cache(830, 430, { w: 200, h: 112, label: "GOCACHE" });
        const lookup = s.edge(id, cache, { from: "bottom", to: "top" });
        const miss = s.pill(830, 530, "miss", { kind: "run" });
        const hit = s.pill(830, 530, "hit", { kind: "hit" });
        const trim = s.pill(830, 150, "-trimpath", { mono: true });
        // When each input is named in the second line; the directory comes with the third.
        const named = [1.2, 3.2, 4.8, null, 6.0, 7.8];
        return (t, cue) => {
          const [c0, c1, c2, c3] = cue;
          place(hashing, mix(-260, 0, during(t, c1, c1 + 0.8)), 0);
          appear(id, t, c0 + 0.6);
          appear(funnel, t, c0 + 1.4);
          trace(toId, during(t, c0 + 1.8, c0 + 2.4));
          inputs.forEach((box, i) => {
            if (i === 3) return;
            appear(box, t, c1 + named[i]);
            trace(feeds[i], during(t, c1 + named[i] + 0.3, c1 + named[i] + 0.9));
          });
          // With -trimpath, the directory is left out.
          const out = during(t, c3 + 5.0, c3 + 5.6);
          show(dir, during(t, c2 + 3.2, c2 + 3.8) * mix(1, 0.3, out));
          trace(feeds[3], during(t, c2 + 3.5, c2 + 4.1), mix(1, 0.3, out));
          dir.mark("run", during(t, c3 + 1.4, c3 + 1.9) * (1 - out));
          feeds[3].pulse(ramp(t, c3 + 1.7, c3 + 2.3));
          // Two checkouts: run-41, then run-42; with -trimpath, either gives the same ID.
          const dim = mix(1, 0.45, out);
          show(paths[0], Math.max(between(t, c2 + 3.6, c3 + 1.4), between(t, c3 + 5.9, c3 + 6.3)) * dim);
          show(paths[1], Math.max(between(t, c3 + 1.7, c3 + 5.6), between(t, c3 + 6.6)) * dim);
          show(ids[0], between(t, c0 + 1.0, c3 + 2.3));
          show(ids[1], between(t, c3 + 2.6, c3 + 5.3));
          show(ids[2], between(t, c3 + 5.6));
          appear(cache, t, c3 + 0.2);
          trace(lookup, during(t, c3 + 0.4, c3 + 1.0));
          lookup.pulse(t < c3 + 5 ? ramp(t, c3 + 2.8, c3 + 3.4) : ramp(t, c3 + 6.6, c3 + 7.1), "go");
          show(miss, between(t, c3 + 3.4, c3 + 4.4));
          appear(trim, t, c3 + 5.0);
          show(hit, between(t, c3 + 7.1));
        };
      },
    },
    {
      // A dependency's output, the content ID that enters its dependents' action IDs, and the build ID.
      section: "Content IDs and early cutoff",
      lines: [
        { say: "A dependency enters its dependents' action IDs through its content ID, a hash of its whole archive: export data and object code together.", hold: 1 },
        { say: "Every archive and binary has a build ID, `actionID/…/contentID`, written into the file.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, 0, 950, 400);
        const core = s.box(0, 154, 210, 92, "compile", { sub: "`core`" });
        const archive = s.group();
        const file = archive.file(280, 0, 340, 400, "");
        archive.text(300, 40, "core.a", { size: 30, mono: true });
        const toArchive = s.edge(core, file);
        const build = s.box(300, 60, 300, 96, "build ID", { sub: "`3f2a…/6e8b…`" });
        const parts = [s.box(300, 174, 300, 92, "export data"), s.box(300, 286, 300, 92, "object code")];
        const content = s.box(720, 104, 230, 100, "content ID", { sub: "`6e8b…`" });
        const hash = s.text(668, 240, "hash", { size: 26, anchor: "middle", tone: "muted" });
        const toContent = s.edge(file, content);
        const action = s.box(720, 296, 230, 100, "action ID", { sub: "compile `auth`", kind: "go" });
        const toAction = s.edge(content, action, { from: "bottom", to: "top" });
        return (t, cue) => {
          const [c0, c1] = cue;
          appear(core, t, c0 + 0.2);
          trace(toArchive, during(t, c0 + 0.5, c0 + 1.1));
          appear(archive, t, c0 + 0.8);
          appear(action, t, c0 + 1.4);
          appear(content, t, c0 + 2.8);
          trace(toContent, during(t, c0 + 3.0, c0 + 3.6));
          trace(toAction, during(t, c0 + 3.4, c0 + 4.0));
          appear(hash, t, c0 + 4.2);
          parts.forEach((p, i) => appear(p, t, c0 + 6.4 + 1.2 * i));
          // The whole archive: both parts at once.
          const whole = during(t, c0 + 8.2, c0 + 8.8) * (1 - during(t, c1 + 0.6, c1 + 1.2));
          parts.forEach((p) => p.focus(whole));
          file.focus(whole);
          appear(build, t, c1 + 1.6);
        };
      },
    },
    {
      // Figure 4.3: a body edit stops one level up; an export-data change, two.
      section: "Content IDs and early cutoff",
      lines: [
        { say: "The content ID gives an early cutoff: a step that reruns with the same output does not rerun its dependents.", hold: 0.8 },
        { say: "Edit a non-inlined function's body in `core`, moving no declaration and keeping which parameters outlive the call: the object code changes, the export data does not.", hold: 0.8 },
        { say: "So `core`'s content ID changes, and every direct importer recompiles.", hold: 0.8 },
        { say: "We found their archives identical: a compile reads only its imports' export data, and records a fingerprint, a hash, of it.", hold: 0.8 },
        { say: "So the packages above them hit the cache.", hold: 0.8 },
        { say: "Every binary that contains `core` relinks: its link's action ID includes every package's content ID.", hold: 0.8 },
        { say: "Adding an exported function changes the fingerprint, so the direct importers' archives change too, and their importers recompile.", hold: 0.8 },
        { say: "The change stops there, since the direct importers' export data did not change.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(-10, 0, 920, 674);
        const at = {
          app00: [176, 33], app01: [484, 33],
          api: [90, 198], store: [330, 198], jobs: [570, 198],
          auth: [90, 363], billing: [330, 363], search: [570, 363],
          core: [330, 528],
        };
        const node = Object.fromEntries(Object.entries(at).map(([n, [cx, cy]]) => [n, s.box(cx - 90, cy - 33, 180, 66, n, { mono: true })]));
        const rows = [["app00", "app01"], ["api", "store", "jobs"], ["auth", "billing", "search"], ["core"]].map((r) => r.map((n) => node[n]));
        const up = ([a, b]) => s.edge(node[a], node[b], { from: "top", to: "bottom" });
        const cd = [["core", "auth"], ["core", "billing"], ["core", "search"]].map(up);
        const dl = [["auth", "api"], ["billing", "api"], ["billing", "store"], ["search", "jobs"]].map(up);
        const lb = [["api", "app00"], ["store", "app00"], ["store", "app01"], ["jobs", "app01"]].map(up);
        const edges = [...cd, ...dl, ...lb];
        // The two edits, under core.
        const body = s.pill(330, 650, "body edit", { kind: "run" });
        const exported = s.pill(330, 650, "new exported function", { kind: "run" });
        const poke = s.edge([330, 625], node.core, { to: "bottom", kind: "run" });
        // Where the change stops: a cut between two rows, named in the label column.
        const X = 720;
        const wide = measure("early cutoff", { size: 26 }) + 36;
        const cut = (y) => {
          const g = s.group();
          g.line(-10, y, 680, y, { width: 3, opacity: 0.7, dash: "12 9" });
          g.pill(X + wide / 2, y, "early cutoff");
          return g;
        };
        const stopBody = cut(280.5);
        const stopExport = cut(115.5);
        const label = (cy, text, kind) => s.text(X, cy + 10, text, { size: 30, weight: 600, tone: kind });
        const relink = label(33, "relink", "run");
        const hitAbove = label(198, "cache hit", "hit");
        const runAbove = label(198, "recompile", "run");
        const runDirect = label(363, "recompile", "run");
        const runCore = label(528, "recompile", "run");
        return (t, cue) => {
          const [c0, c1, c2, c3, c4, c5, c6, c7] = cue;
          // The graph, from core up.
          [...rows].reverse().forEach((r, i) => r.forEach((b, k) => appear(b, t, c0 + 0.4 + 0.7 * i + 0.15 * k)));
          edges.forEach((e, i) => trace(e, during(t, c0 + 1.0 + 0.12 * i, c0 + 1.6 + 0.12 * i)));
          const reset = during(t, c6, c6 + 0.6);
          const once = (a) => during(t, a, a + 0.5) * (1 - reset); // the body edit, cleared before the second edit
          const twice = (a) => during(t, a, a + 0.5); // the exported function
          // The edits.
          show(body, once(c1 + 0.4));
          show(exported, twice(c6 + 0.9));
          trace(poke, Math.max(once(c1 + 0.8), twice(c6 + 1.2)));
          // core recompiles.
          node.core.mark("run", Math.max(once(c1 + 3.0), twice(c6 + 2.0)));
          show(runCore, Math.max(once(c1 + 3.4), twice(c6 + 2.4)));
          // Its new content ID reaches the direct importers, which recompile.
          cd.forEach((e) => {
            e.pulse(t < c6 ? ramp(t, c2 + 0.3, c2 + 1.3) : ramp(t, c6 + 2.6, c6 + 3.4));
            e.mark("run", Math.max(once(c2 + 1.0), twice(c6 + 3.2)));
          });
          rows[2].forEach((b, k) => b.mark("run", Math.max(once(c2 + 1.4 + 0.15 * k), twice(c6 + 3.6 + 0.15 * k))));
          show(runDirect, Math.max(once(c2 + 1.8), twice(c6 + 4.0)));
          // Body edit: their outputs come out the same, so the change stops above them.
          dl.forEach((e) => {
            if (t < c6) e.pulse(ramp(t, c3 + 0.6, c3 + 1.6) * 0.45, "run", 1 - during(t, c3 + 1.6, c3 + 2.1));
            else e.pulse(ramp(t, c6 + 4.8, c6 + 5.8));
            e.mark("run", twice(c6 + 5.4));
          });
          show(stopBody, once(c3 + 1.2));
          rows[1].forEach((b, k) => {
            b.mark("hit", once(c4 + 0.3 + 0.2 * k));
            b.mark("run", twice(c6 + 6.0 + 0.15 * k));
          });
          show(hitAbove, once(c4 + 0.8));
          show(runAbove, twice(c6 + 6.4));
          // Exported function: one level more, then the cut.
          lb.forEach((e) => e.pulse(t < c7 ? 0 : ramp(t, c7 + 0.4, c7 + 1.4) * 0.45, "run", 1 - during(t, c7 + 1.4, c7 + 1.9)));
          show(stopExport, twice(c7 + 1.0));
          // Every binary relinks, both times.
          rows[0].forEach((b, k) => b.mark("run", Math.max(once(c5 + 1.4 + 0.3 * k), twice(c7 + 3.0 + 0.3 * k))));
          show(relink, Math.max(once(c5 + 1.8), twice(c7 + 3.4)));
        };
      },
    },
    {
      // Figure 4.4: GOCACHE's two kinds of file; a link has no entry; trimming.
      section: "The cache",
      lines: [
        { say: "An entry, `<actionID>-a`, maps an action ID to its output's hash and size; the output, `<outputID>-d`, is named by its hash.", hold: 0.8 },
        { say: "A link has no entry: `go build` binaries, larger and reused less often than packages, are not stored.", hold: 0.8 },
        { say: "`go build -o bin/` skips a link only if the binary in `bin/` has a build ID starting with the link's action ID.", hold: 0.8 },
        { say: "Without `-o`, `go build ./...` links every main package into a temporary directory and discards the result.", hold: 0.8 },
        { say: "Entries unused for five days are deleted, at most once a day.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, 0, 992, 540);
        const left = s.group();
        left.text(0, 30, "compile `core`", { size: 30, weight: 600 });
        left.text(236, 30, "action ID `3f2a…`", { size: 28, tone: "muted" });
        const entry = s.box(0, 60, 470, 110, "`$GOCACHE/3f/3f2a…-a`", { sub: "output ID and size" });
        const toOutput = s.edge(entry, [235, 266], { from: "bottom" });
        const outputId = s.text(256, 228, "output ID `9c41…`", { size: 26, tone: "muted" });
        const output = s.box(0, 270, 470, 110, "`$GOCACHE/9c/9c41…-d`", { sub: "the archive, named by its hash" });
        const old = s.box(0, 430, 470, 110, "`$GOCACHE/41/41c0…-a`", { sub: "unused for five days" });
        const strike = s.line(20, 485, 450, 485, { width: 3, opacity: 0.8 });
        const rule = s.line(530, 0, 530, 540, { opacity: 0.2 });
        const right = s.group();
        right.text(570, 30, "link `app00`", { size: 30, weight: 600 });
        right.text(744, 30, "action ID `7b10…`", { size: 28, tone: "muted" });
        const none = s.box(570, 60, 420, 110, "no entry", { kind: "run", sub: "links are not stored" });
        const bin = s.file(570, 270, 420, 110, "bin/app00", { sub: "build ID `7b10…/…/e5d2…`" });
        const temp = s.file(570, 430, 420, 110, "temporary directory", { mono: false, sub: "linked, then discarded" });
        return (t, cue) => {
          const [c0, c1, c2, c3, c4] = cue;
          appear(left, t, c0 + 0.2);
          appear(entry, t, c0 + 0.6);
          trace(toOutput, during(t, c0 + 3.0, c0 + 3.6));
          appear(outputId, t, c0 + 3.4);
          appear(output, t, c0 + 5.2);
          appear(rule, t, c1 + 0.1);
          appear(right, t, c1 + 0.2);
          appear(none, t, c1 + 0.8);
          // -o: the binary in bin/ is a one-element cache.
          appear(bin, t, c2 + 0.8);
          bin.mark("hit", during(t, c2 + 6.4, c2 + 7.0));
          // Without -o: linked into a temporary directory, then thrown away.
          show(temp, during(t, c3 + 1.2, c3 + 1.8) * mix(1, 0.3, during(t, c3 + 5.4, c3 + 6.2)));
          temp.mark("run", during(t, c3 + 1.8, c3 + 2.4));
          // Trimming.
          show(old, during(t, c4 + 0.4, c4 + 1.0) * mix(1, 0.3, during(t, c4 + 3.0, c4 + 3.8)));
          show(strike, during(t, c4 + 2.6, c4 + 3.0) * mix(1, 0.3, during(t, c4 + 3.0, c4 + 3.8)));
        };
      },
    },
    {
      // Figure 4.5: the two-level test cache, and what it cannot see.
      section: "Test results",
      lines: [
        { say: "Each test run is watched: its `os` package logs every `Getenv`, `Stat`, `Open` and `Chdir` call.", hold: 0.8 },
        { say: "Level 1: the test ID hashes the test binary and flags, and finds the log of the last run.", hold: 0.8 },
        { say: "Level 2: the inputs ID hashes each logged variable's current value and each file's path, size and modification time.", hold: 0.8 },
        { say: "A result is reused only if both match.", hold: 0.8 },
        { say: "Since the test ID covers the whole binary, a body edit to `core` reruns its tests and those of every package that depends on it.", hold: 0.8 },
        { say: "A test that uses the network, reads outside the module, or depends on the time is cached anyway.", hold: 0.8 },
      ],
      draw(s) {
        s.fit(0, 0, 1000, 462);
        const bin = s.box(0, 0, 260, 100, "test binary", { sub: "+ cacheable flags" });
        const testId = s.box(310, 0, 250, 100, "test ID", { sub: "level 1", kind: "go" });
        const log = s.group();
        const logBox = log.file(610, 0, 390, 148, "");
        log.text(630, 36, "logged by the last run", { size: 26, tone: "muted" });
        const entries = ["getenv APP_ENV", "open testdata/in.json", "stat config.yaml"].map((e, i) => s.text(630, 74 + 32 * i, e, { size: 26, mono: true }));
        const inputsId = s.box(610, 240, 390, 100, "inputs ID", { sub: "level 2", kind: "go" });
        const key = s.box(310, 240, 250, 100, "key", { sub: "test ID + inputs ID" });
        const cached = s.box(0, 240, 260, 100, "cached result", { sub: "`ok (cached)`", kind: "hit" });
        const rerun = s.box(0, 240, 260, 100, "test reruns", { kind: "run" });
        const e1 = s.edge(bin, testId);
        const e2 = s.edge(testId, [606, 50]);
        const e3 = s.edge(logBox, inputsId, { from: "bottom", to: "top" });
        const e4 = s.edge(testId, key, { from: "bottom", to: "top" });
        const e5 = s.edge(inputsId, key, { from: "left", to: "right" });
        const e6 = s.edge(key, cached, { from: "left", to: "right" });
        // Inputs the cache does not check: no logged call reaches them, or they lie outside the module.
        const unseen = s.text(0, 446, "not checked", { size: 26, tone: "muted" });
        const pills = [];
        let x = 170;
        for (const name of ["network", "files outside the module", "time"]) {
          const w = measure(name, { size: 26 }) + 36;
          pills.push(s.pill(x + w / 2, 437, name));
          x += w + 22;
        }
        return (t, cue) => {
          const [c0, c1, c2, c3, c4, c5] = cue;
          appear(bin, t, c0 + 0.3);
          appear(log, t, c0 + 1.2);
          entries.forEach((e, i) => appear(e, t, c0 + 2.6 + 0.8 * i, 0.3));
          appear(testId, t, c1 + 0.6);
          trace(e1, during(t, c1 + 1.8, c1 + 2.4));
          trace(e2, during(t, c1 + 4.8, c1 + 5.4));
          trace(e3, during(t, c2 + 0.4, c2 + 1.0));
          appear(inputsId, t, c2 + 1.0);
          appear(key, t, c3 + 0.2);
          trace(e4, during(t, c3 + 0.4, c3 + 1.0));
          trace(e5, during(t, c3 + 0.4, c3 + 1.0));
          trace(e6, during(t, c3 + 1.4, c3 + 2.0));
          // A body edit to core changes the binary, so the test ID, so the key: the test reruns.
          const back = during(t, c5, c5 + 0.5);
          const edited = (a) => during(t, a, a + 0.5) * (1 - back);
          bin.mark("run", edited(c4 + 3.6));
          testId.mark("go", 1 - edited(c4 + 4.2));
          testId.mark("run", edited(c4 + 4.2));
          e4.mark("run", edited(c4 + 4.4));
          key.mark("run", edited(c4 + 4.6));
          e6.mark("run", edited(c4 + 5.0));
          show(cached, Math.max(between(t, c3 + 1.8, c4 + 5.4), between(t, c5 + 0.3)));
          show(rerun, between(t, c4 + 5.7, c5));
          // What the cache does not check: the result is cached anyway.
          appear(unseen, t, c5 + 0.6);
          [1.6, 2.8, 5.0].forEach((a, i) => appear(pills[i], t, c5 + a));
          cached.focus(during(t, c5 + 6.2, c5 + 6.7));
        };
      },
    },
  ],
};
