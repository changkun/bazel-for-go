// Chapter 9's film: reading the critical path, diffing two execution logs to
// find the input that changed a key, stamping and the action environment,
// placing each class of work on machines of its own, making Bazel's CPU
// booking agree with the compiler, and what `bazel test` and the local loop
// rerun. Every sentence comes from the chapter, and the pictures follow its
// figures 9.1 to 9.4.

import { during, measure, mix, place, ramp, show } from "./stage.js";

// bench: examples/bench/results/2026-11-16/, configuration n1000: the critical paths of
// n1000-bazel-cold.profile.gz and n1000-bazel-core-body.profile.gz, in seconds, and the
// number of compiles on the cold one. Only the blocks' widths use them; no number is drawn.
const BENCH = {
  cold: { builder: 12.6, stdlib: 11.6, generator: 1.3, compiles: 2.0, link: 2.4, count: 13 },
  edit: { compile: 0.05, link: 2.26 },
};

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));
// Draw an arrow up to part u; hidden until it starts, since an untraced arrow leaves a dot.
const grow = (edge, u, alpha = 1) => {
  show(edge.trace(u), u > 0 ? alpha : 0);
  return edge;
};
// Shown from second a, gone by second b + d.
const between = (thing, t, a, b, d = 0.4) => show(thing, during(t, a, a + d) * (1 - during(t, b, b + d)));

export default {
  chapter: "9",
  title: "Optimizing a Bazel Go build",
  scenes: [
    {
      section: "Measure first",
      lines: [
        { say: "Bazel writes a trace profile of every build; its `Critical Path` row shows one block for each action on the critical path." },
        { say: "In our cold build, rules_go's own setup takes most of it: building the builder and the standard library for tools." },
        { say: "Neither depends on the repository's code, so, in our reading, a shared cache can serve both to every machine of the same platform after the first." },
        { say: "After an edit to a function body in `core`, one link takes most of it.", hold: 0.6 },
      ],
      draw(s) {
        // Figure 9.1: both critical paths on one time scale.
        s.fit(0, 0, 1040, 700);
        const { cold, edit } = BENCH;
        const S = 1040 / (cold.builder + cold.stdlib + cold.generator + cold.compiles + cold.link); // units a second
        const ROW = 104, Y1 = 196, Y2 = 500;
        let at = 0;
        const span = (seconds) => [at, (at += seconds * S)];
        const [b0, b1] = span(cold.builder);
        const [s0, s1] = span(cold.stdlib);
        const [g0, g1] = span(cold.generator);
        const [c0, c1] = span(cold.compiles);
        const [l0, l1] = span(cold.link);
        const title = s.text(0, 30, "`chrome://tracing`", { size: 26, tone: "muted" });
        const rowName = s.text(0, 80, "`Critical Path`", { size: 30 });
        const coldName = s.text(0, 80, "cold build", { size: 30, weight: 600 });
        // The rows the blocks fill.
        const lanes = [Y1, Y2].map((y) => s.rect(0, y, 1040, ROW, { fill: 0.05, stroke: false, r: 6 }));
        const builder = s.box(b0, Y1, b1 - b0 - 4, ROW, "build the builder", { kind: "run" });
        const stdlib = s.box(s0, Y1, s1 - s0 - 4, ROW, "standard library", { kind: "run", sub: "for tools" });
        const generator = s.box(g0, Y1, g1 - g0 - 4, ROW, "", { kind: "run" });
        const compiles = s.group();
        compiles.rect(c0, Y1, c1 - c0 - 4, ROW, { kind: "run", fill: 0.16, r: 6 });
        for (let i = 1; i < cold.count; i++) {
          const x = c0 + (i * (c1 - c0 - 4)) / cold.count;
          compiles.line(x, Y1 + 2, x, Y1 + ROW - 2, { kind: "run", width: 1.2 });
        }
        const link = s.box(l0, Y1, l1 - l0, ROW, "", { kind: "run" });
        // Blocks too narrow for their names: the name goes below, on a leader.
        const tag = (x, depth, label) => {
          const g = s.group();
          g.line(x, Y1 + ROW + 6, x, Y1 + ROW + depth, { width: 2, opacity: 0.55 });
          g.text(x + 4, Y1 + ROW + depth + 26, label, { size: 26, anchor: "end" });
          return g;
        };
        const tags = [tag((g0 + g1) / 2, 14, "code generator"), tag((c0 + c1) / 2, 50, "compiles"), tag((l0 + l1) / 2, 86, "link")];
        const blocks = [[builder, b0], [stdlib, s0], [generator, g0], [compiles, c0], [link, l0]];
        // rules_go's setup: first in ink, then in the colour of what can be shared.
        const bracket = (kind) => {
          const g = s.group();
          const style = { kind, width: 3, opacity: 0.8 };
          g.line(2, Y1 - 12, 2, Y1 - 26, style);
          g.line(2, Y1 - 26, s1 - 6, Y1 - 26, style);
          g.line(s1 - 6, Y1 - 26, s1 - 6, Y1 - 12, style);
          g.text(s1 / 2, Y1 - 76, "rules_go's setup", { size: 30, weight: 600, anchor: "middle", tone: kind || "ink" });
          return g;
        };
        const setup = bracket(null);
        const shared = bracket("remote");
        const same = s.text(s1 / 2, Y1 - 40, "the same on every machine of the same platform", { size: 26, anchor: "middle", tone: "remote" });
        // After an edit to core: one tiny compile, then one link.
        const editName = s.text(0, Y2 - 20, "after an edit to a function body in `core`", { size: 30, weight: 600 });
        const ec = Math.max(6, edit.compile * S);
        const eCompile = s.rect(0, Y2, ec, ROW, { kind: "run", fill: 0.16, r: 2, width: 2 });
        const eLink = s.box(ec + 2, Y2, edit.link * S, ROW, "link", { kind: "run" });
        const eNote = s.text(ec + edit.link * S + 28, Y2 + 62, "compile `core`, then one link", { size: 28 });
        const axis = s.group();
        axis.edge([0, 650], [1040, 650], { width: 2 });
        axis.text(1040, 692, "time", { size: 26, anchor: "end", tone: "muted" });
        return (t, cue) => {
          const [p, q, r, u] = cue;
          // The profile, opened: its Critical Path row fills in the order the actions ran.
          const opened = 1 - during(t, q, q + 0.4);
          show(title, during(t, 0.3, 0.9) * opened);
          show(rowName, during(t, 0.6, 1.2) * opened);
          appear(lanes[0], t, 0.6);
          appear(lanes[1], t, u + 0.4);
          appear(axis, t, 0.6);
          blocks.forEach(([block, x0]) => appear(block, t, p + 2.8 + (4.8 * x0) / 1040, 0.5));
          tags.forEach((g, i) => appear(g, t, p + 6.8 + 0.3 * i));
          // Cold: rules_go's own setup takes most of it.
          appear(coldName, t, q + 0.5);
          show(setup, during(t, q + 3.0, q + 3.6) * (1 - during(t, r + 0.8, r + 1.4)));
          // Nothing in it depends on the repository: shareable.
          appear(shared, t, r + 0.8);
          appear(same, t, r + 6.0);
          // After an edit: one link.
          appear(editName, t, u + 0.4);
          appear(eCompile, t, u + 2.4, 0.4);
          appear(eLink, t, u + 3.0);
          appear(eNote, t, u + 3.8);
        };
      },
    },
    {
      section: "Keep keys stable",
      lines: [
        { say: "The execution log shows why an action ran: its command line, environment, input hashes and, with a disk or remote cache, its key." },
        { say: "Bazel's guide runs `bazel clean` before each of two builds, then diffs the two logs." },
        { say: "The input or setting that differs is the cause.", hold: 1.4 },
        { say: "Stamping: rules_go's `x_defs` sets string variables at link time, and a value can name a workspace status key, such as `{STABLE_GIT_COMMIT}`, that `--stamp` fills in." },
        { say: "A stamped link that names a stable key reads `stable-status.txt`, which always holds `BUILD_HOST` and `BUILD_USER`, so such links share no results across machines or users." },
        { say: "We recommend stamping only release builds.", hold: 1.2 },
      ],
      draw(s) {
        // Figure 9.2: the same stamped link in two machines' logs, compared row by row.
        s.fit(0, 0, 1040, 730);
        const CARDS = [[0, 470], [570, 1040]];
        const TOP = 56, ROW = 74, MID = 520;
        const rows = [
          ["mnemonic", ["GoLink", "GoLink"]],
          ["command_args", ["builder link -X … -stamp …", "builder link -X … -stamp …"]],
          ["environment_variables", ["GOOS=linux GOARCH=amd64 …", "GOOS=linux GOARCH=amd64 …"]],
          ["inputs", ["bazel-out/…/greet.a", "bazel-out/…/greet.a"], ["9f2c…", "9f2c…"]],
          ["inputs", ["stable-status.txt", "stable-status.txt"], ["41d7…", "c08e…"]],
          ["`digest` (the key)", ["e3a1…", "7b54…"]],
        ];
        const heads = CARDS.map(([x0], i) => s.text(x0 + 20, 36, i ? "machine B" : "machine A", { size: 30, weight: 600 }));
        const cards = CARDS.map(([x0, x1]) => {
          const g = s.group();
          g.rect(x0, TOP, x1 - x0, rows.length * ROW + 12, { r: 12, width: 2 }).setAttribute("stroke-opacity", 0.6);
          for (let r = 1; r < rows.length; r++) g.line(x0 + 10, TOP + r * ROW + 4, x1 - 10, TOP + r * ROW + 4, { width: 1.5, opacity: 0.18 });
          return g;
        });
        const glow = (r) => {
          const g = s.group();
          for (const [x0, x1] of CARDS) g.rect(x0 + 6, TOP + r * ROW + 8, x1 - x0 - 12, ROW - 6, { r: 8, fill: 0.08, width: 2 });
          return g;
        };
        // Highlights behind the rows that differ, and behind the stamp in the command line.
        const glows = { stamp: glow(1), input: glow(4), key: glow(5) };
        const fields = rows.map(([name, values, hashes], r) => {
          const g = s.group();
          CARDS.forEach(([x0, x1], i) => {
            g.text(x0 + 20, TOP + r * ROW + 34, name, { size: 26, tone: "muted", mono: !name.includes("`") });
            g.text(x0 + 20, TOP + r * ROW + 66, values[i], { size: 26, mono: true });
            if (hashes) g.text(x1 - 20, TOP + r * ROW + 66, hashes[i], { size: 26, mono: true, anchor: "end" });
          });
          return g;
        });
        const marks = rows.map((_, r) => (r < 4 ? s.text(MID, TOP + r * ROW + 56, "=", { size: 36, anchor: "middle", tone: "muted" }) : s.text(MID, TOP + r * ROW + 56, "≠", { size: 36, weight: 700, anchor: "middle" })));
        const cleans = CARDS.map(([, x1]) => {
          const w = measure("bazel clean", { size: 26, mono: true }) + 36;
          return s.pill(x1 - w / 2 - 10, 26, "bazel clean", { mono: true });
        });
        const miss = s.pill(1040 - 20 - (measure("miss", { size: 26 }) + 36) / 2, TOP + 5 * ROW + 44, "miss", { kind: "run" });
        // The status file each link read.
        const fileName = s.text(MID, 574, "`stable-status.txt` on each machine", { size: 26, anchor: "middle", tone: "muted" });
        const files = CARDS.map(([x0, x1]) => s.rect(x0, 592, x1 - x0, 132, { r: 12, width: 2 }));
        files.forEach((f) => f.setAttribute("stroke-opacity", 0.6));
        const status = (line, values, bold) => CARDS.map(([x0], i) => s.text(x0 + 20, 592 + 38 * line, values[i], { size: 26, mono: true, weight: bold ? 700 : 400 }));
        const host = status(1, ["BUILD_HOST runner-1", "BUILD_HOST laptop-7"], true);
        const user = status(2, ["BUILD_USER ci", "BUILD_USER dev"], true);
        const commit = status(3, ["STABLE_GIT_COMMIT 4e1d…", "STABLE_GIT_COMMIT 4e1d…"], false);
        // When each row is named.
        const named = [1.2, 3.8, 4.6, 5.4, 5.8, 8.6];
        return (t, cue) => {
          const [a, b, c, d, e] = cue;
          heads.forEach((h) => appear(h, t, a + 0.2));
          cards.forEach((g) => appear(g, t, a + 0.3));
          fields.forEach((g, r) => appear(g, t, a + named[r]));
          // Clean, build, and compare: equal rows first.
          cleans.forEach((p) => appear(p, t, b + 1.4));
          marks.forEach((m, r) => appear(m, t, r < 4 ? b + 4.0 + 0.4 * r : c + 0.3 + 1.0 * (r - 4), 0.4));
          appear(glows.input, t, c + 0.3);
          appear(glows.key, t, c + 1.3);
          appear(miss, t, c + 2.2);
          // Stamping: the -X in the link's command line, and the status file it names.
          between(glows.stamp, t, d + 1.2, e);
          appear(fileName, t, d + 6.4);
          files.forEach((f) => appear(f, t, d + 6.4));
          commit.forEach((x) => appear(x, t, d + 7.8));
          host.forEach((x) => appear(x, t, e + 5.4));
          user.forEach((x) => appear(x, t, e + 6.2));
        };
      },
    },
    {
      section: "Keep keys stable",
      lines: [
        { say: "rules_go gives its actions their own environment, so neither the caller's `PATH` nor `--action_env` reaches its compiles and links." },
        { say: "A `genrule` takes the build's action environment: `--action_env=NAME` copies the caller's value into its key, and `--action_env=NAME=value` fixes it.", hold: 2.8 },
      ],
      draw(s) {
        s.fit(0, 0, 1040, 600);
        // The caller's environment, at the top.
        const callerHead = s.text(520, 26, "caller's environment", { size: 26, anchor: "middle", tone: "muted" });
        const caller = s.file(300, 44, 440, 100, "");
        const path = s.text(330, 106, "PATH=…", { size: 30, mono: true });
        const names = ["NAME=a", "NAME=b", "NAME=a"].map((v) => s.text(560, 106, v, { size: 30, mono: true }));
        // rules_go's actions, in an environment of their own.
        const fence = s.group();
        fence.rect(0, 320, 470, 262, { r: 14, width: 2.5, dash: "10 8" }).setAttribute("stroke-opacity", 0.7);
        fence.text(24, 362, "rules_go's own environment", { size: 26, tone: "muted" });
        fence.box(95, 384, 280, 76, "GoCompilePkg", { mono: true });
        fence.box(95, 480, 280, 76, "GoLink", { mono: true });
        // The flag, on its way to both.
        const flags = ["--action_env=NAME", "--action_env=NAME=value"].map((f) => s.pill(550 + (measure(f, { size: 26, mono: true }) + 36) / 2, 232, f, { mono: true }));
        const toFlag = s.edge([614, 150], [700, 205]);
        const blockedPath = s.edge([384, 150], [235, 310]);
        const blockedFlag = s.edge([548, 236], [400, 310]);
        const stops = [s.line(195, 318, 275, 318, { width: 6, opacity: 1 }), s.line(360, 318, 440, 318, { width: 6, opacity: 1 })];
        // A genrule: its action environment enters its key.
        const genrule = s.box(570, 300, 470, 282, "");
        const genName = s.text(1016, 344, "`genrule`", { size: 32, anchor: "end" });
        const env = s.file(594, 366, 240, 192, "");
        const envHead = s.text(606, 402, "action environment", { size: 26, tone: "muted" });
        const envPath = s.text(614, 456, "`PATH=…` fixed", { size: 28, tone: "muted" });
        const envNames = ["NAME=a", "NAME=b", "NAME=value"].map((v) => s.text(614, 516, v, { size: 28, mono: true }));
        const toEnv = s.edge([700, 258], env, { to: "top" });
        const key = s.box(880, 410, 136, 104, "key", { sub: " " });
        const toKey = s.edge(env, key);
        const hashes = ["3c9a…", "81f0…", "5e02…"].map((h) => s.text(948, 498, h, { size: 26, mono: true, anchor: "middle" }));
        return (t, cue) => {
          const [a, b] = cue;
          // rules_go's actions keep their own environment.
          appear(fence, t, a + 0.2, 0.8);
          appear(callerHead, t, a + 3.6);
          appear(caller, t, a + 3.6);
          appear(path, t, a + 4.0);
          grow(blockedPath, during(t, a + 4.6, a + 5.4));
          appear(stops[0], t, a + 6.0, 0.3);
          // The flag: rules_go's actions do not take it either.
          grow(toFlag, during(t, a + 5.2, a + 5.8), 1 - during(t, b + 7.0, b + 7.5));
          grow(blockedFlag, during(t, a + 6.0, a + 6.8));
          appear(stops[1], t, a + 7.4, 0.3);
          // The caller's value: a, then b, then a again.
          between(names[0], t, a + 4.4, b + 4.6, 0.3);
          between(names[1], t, b + 5.0, b + 8.8, 0.3);
          appear(names[2], t, b + 9.2, 0.3);
          between(flags[0], t, a + 5.4, b + 7.0, 0.3);
          appear(flags[1], t, b + 7.4, 0.4);
          // A genrule takes the action environment, and the value enters its key.
          appear(genrule, t, b + 0.4);
          appear(genName, t, b + 0.4);
          appear(env, t, b + 1.8);
          appear(envHead, t, b + 1.8);
          appear(envPath, t, b + 2.2);
          grow(toEnv, during(t, b + 2.6, b + 3.2));
          between(envNames[0], t, b + 3.2, b + 5.9, 0.2);
          grow(toKey, during(t, b + 3.4, b + 3.8));
          appear(key, t, b + 3.8);
          // The caller's value changes: so does the key.
          toFlag.pulse(ramp(t, b + 5.0, b + 5.5), "run");
          toEnv.pulse(ramp(t, b + 5.5, b + 6.0), "run");
          between(envNames[1], t, b + 6.2, b + 7.6, 0.2);
          between(hashes[0], t, b + 3.8, b + 6.3, 0.2);
          between(hashes[1], t, b + 6.6, b + 8.0, 0.2);
          key.mark("run", during(t, b + 6.6, b + 7.0) * (1 - during(t, b + 8.0, b + 8.4)));
          // A fixed value: the caller's no longer reaches the key.
          appear(envNames[2], t, b + 7.9, 0.2);
          appear(hashes[2], t, b + 8.3, 0.2);
        };
      },
    },
    {
      section: "Place work on machines",
      lines: [
        { say: "In our view, compiles, links, test runs and the Bazel server each want a different machine." },
        { say: "Execution properties are settings that Bazel sends with each action to the remote executors, which use them to choose a machine." },
        { say: "Compiles follow the execution platform's properties; links and test runs have exec groups of their own, `go_link` and `test`." },
        { say: "A property prefixed with a group's name, such as `go_link.<name>`, applies to that group only.", hold: 1 },
      ],
      draw(s) {
        // Figure 9.3: the server sends each class of work to machines of its own shape.
        s.fit(0, 0, 1040, 700);
        const server = s.group();
        server.rect(0, 240, 300, 220, { kind: "bazel", fill: 0.16, r: 12 });
        server.text(150, 284, "machine running `bazel`", { size: 26, anchor: "middle", tone: "muted" });
        server.text(150, 340, "Bazel server", { size: 32, weight: 600, anchor: "middle", tone: "bazel" });
        const need = s.group();
        need.text(150, 390, "memory for the graph,", { size: 26, anchor: "middle", tone: "muted" });
        need.text(150, 424, "kept warm", { size: 26, anchor: "middle", tone: "muted" });
        const props = s.pill(150, 520, "exec_properties", { mono: true });
        const POOLS = [
          { y: 0, title: "compiles", mnemonic: "GoCompilePkg", route: "platform's properties", about: "many small machines: cores, modest memory", n: 6, w: 86, gap: 14, bw: 50, bh: 40 },
          { y: 245, title: "links", mnemonic: "GoLink", route: "`go_link.<name>`", about: "a few machines: memory and fast cores", n: 2, w: 291, gap: 28, bw: 230, bh: 44 },
          { y: 490, title: "test runs", mnemonic: "TestRunner", route: "`test.<name>`", about: "sized per test, with a time limit", n: 4, w: 140, gap: 16, bw: 100, bh: 42 },
        ];
        const pools = POOLS.map((p) => {
          const g = s.group();
          g.rect(380, p.y, 660, 210, { kind: "remote", fill: 0.1, r: 14, width: 2 });
          g.text(404, p.y + 44, p.title, { size: 30, weight: 600 });
          g.text(404 + measure(p.title, { size: 30, weight: 600 }) + 14, p.y + 44, p.mnemonic, { size: 26, mono: true });
          const about = g.text(404, p.y + 82, p.about, { size: 26, tone: "muted" });
          const slots = Array.from({ length: p.n }, (_, i) => [404 + i * (p.w + p.gap), p.y + 104]);
          for (const [x, y] of slots) g.rect(x, y, p.w, 80, { r: 8, width: 2 }).setAttribute("stroke-opacity", 0.5);
          const route = s.text(1016, p.y + 44, p.route, { size: 26, anchor: "end", tone: "remote" });
          // The actions, drawn where they end up: in a machine of the pool.
          const actions = slots.map(([x, y]) => {
            const a = s.rect(x + (p.w - p.bw) / 2, y + (80 - p.bh) / 2, p.bw, p.bh, { kind: "run", fill: 0.18, r: 6, width: 2 });
            return { a, dx: 250 - (x + p.w / 2), dy: 350 - (y + 40) };
          });
          return { g, about, route, actions };
        });
        const routes = POOLS.map((p, i) => s.edge([306, 300 + 50 * i], [374, p.y + 105]));
        return (t, cue) => {
          const [a, b, c, d] = cue;
          // Four classes: three pools, and the server.
          pools.forEach((p, i) => show(p.g, during(t, a + 1.4 + 0.5 * i, a + 2.0 + 0.5 * i) * mix(1, 0.4, i === 1 ? 0 : during(t, d + 4.4, d + 5.0))));
          pools.forEach((p, i) => appear(p.about, t, a + 4.8 + 0.3 * i));
          appear(server, t, a + 3.4);
          appear(need, t, a + 5.4);
          // Properties go with each action, and the executors choose a machine by them.
          appear(props, t, b + 0.4);
          routes.forEach((e, i) => grow(e, during(t, b + 3.8 + 0.2 * i, b + 4.6 + 0.2 * i)).pulse(ramp(t, b + 5.2 + 0.3 * i, b + 6.2 + 0.3 * i), "run"));
          // Compiles by the platform's properties; links and test runs by their groups'.
          const when = [c + 1.6, c + 6.4, c + 7.2];
          pools.forEach((p, i) => {
            show(p.route, during(t, when[i], when[i] + 0.5) * mix(1, 0.4, i === 1 ? 0 : during(t, d + 4.4, d + 5.0)));
            p.actions.forEach(({ a: block, dx, dy }, j) => {
              const go = during(t, when[i] + 0.4 + 0.15 * j, when[i] + 1.3 + 0.15 * j);
              place(block, dx * (1 - go), dy * (1 - go));
              show(block, during(t, when[i] + 0.3 + 0.15 * j, when[i] + 0.6 + 0.15 * j) * mix(1, 0.4, i === 1 ? 0 : during(t, d + 4.4, d + 5.0)));
            });
          });
        };
      },
    },
    {
      section: "Place work on machines",
      lines: [
        { say: "Locally, Bazel starts an action when its declared CPUs and memory fit; a rule's action that declares none counts as one CPU." },
        { say: "rules_go declares none and passes no `-c`, the number of the compiler's back-end workers, so a compile may start one worker per core." },
        { say: "We recommend making the two agree: `-c=1`, passed to every compile, matches the one CPU that Bazel books." },
        { say: "In the other direction, since 9.2 a `resources:cpu` entry in `exec_properties` or tags changes what Bazel books locally.", hold: 1.2 },
      ],
      draw(s) {
        // One machine with four cores: what Bazel books, and what the compiler runs.
        s.fit(0, 30, 1040, 570);
        const NAMES = ["a", "b", "c", "d"];
        const lane = (i) => 290 + i * 190;
        const lanes = NAMES.map((_, i) => {
          const g = s.group();
          g.rect(lane(i), 130, 170, 430, { fill: 0.05, stroke: false, r: 10 });
          g.text(lane(i) + 85, 164, "core", { size: 26, anchor: "middle", tone: "muted" });
          return g;
        });
        const waitName = s.text(0, 92, "waiting", { size: 26, tone: "muted" });
        const bookName = s.text(0, 222, "booked by Bazel", { size: 26 });
        const workName = s.text(0, 362, "compiler workers", { size: 26 });
        // One compile action per core, each booking one CPU.
        const booked = NAMES.map((n, i) => s.box(lane(i) + 10, 190, 150, 80, n, { mono: true, kind: "run" }));
        const wide = s.box(lane(0) + 10, 190, 3 * 190 + 150, 80, "a", { mono: true, kind: "run" });
        // Each compile's workers: chip [compile j][core i], stacked in the core's lane.
        const chips = NAMES.map((n, j) =>
          NAMES.map((_, i) => {
            const g = s.group();
            g.rect(lane(i) + 20, 330 + 52 * j, 130, 44, { kind: "run", fill: 0.16, r: 6, width: 2 });
            g.text(lane(i) + 85, 330 + 52 * j + 31, n, { size: 26, mono: true, anchor: "middle" });
            return g;
          }),
        );
        const fewer = s.pill(56, 408, "-c=1", { mono: true });
        const more = s.pill(135, 264, "resources:cpu:4", { mono: true });
        return (t, cue) => {
          const [a, b, c, d] = cue;
          lanes.forEach((g, i) => appear(g, t, a + 0.3 + 0.15 * i));
          appear(bookName, t, a + 1.4);
          // Each compile books one CPU: four start, one per core.
          const other = during(t, d + 4.8, d + 5.6); // the other direction: a books four
          booked.forEach((box, i) => {
            const at = i ? a + 6.2 + 0.4 * i : a + 2.0;
            const drop = during(t, at, at + 0.5);
            place(box, 0, -30 * (1 - drop) - (i ? 150 * other : 0));
            box.mark("run", i ? 1 - other : 1); // a waiting action is not running
            const crossing = 1 - during(t, d + 4.8, d + 4.95) + during(t, d + 5.45, d + 5.6); // out of sight while it passes the lane labels
            show(box, drop * (i ? mix(1, 0.7, other) * crossing : 1 - during(t, d + 4.8, d + 5.1)));
          });
          appear(wide, t, d + 5.6, 0.4);
          appear(waitName, t, d + 4.8);
          // Each compile starts one worker per core: four on every core.
          appear(workName, t, b + 4.2);
          const agree = during(t, c + 3.4, c + 4.0); // -c=1: one worker each
          const raise = during(t, c + 4.2, c + 5.0);
          chips.forEach((row, j) =>
            row.forEach((chip, i) => {
              const own = i === j;
              const start = during(t, b + 6.2 + 0.6 * j + 0.08 * i, b + 6.6 + 0.6 * j + 0.08 * i);
              place(chip, 0, own ? -52 * j * raise : 0);
              const gone = own ? (j ? during(t, d + 5.6, d + 5.9) : 0) : j ? agree : agree * (1 - during(t, d + 6.0, d + 6.5));
              show(chip, start * (1 - gone));
            }),
          );
          between(fewer, t, c + 2.6, d + 4.4);
          appear(more, t, d + 2.2);
        };
      },
    },
    {
      section: "Tests and the local loop",
      lines: [
        { say: "`bazel test` reruns a test only if the test or its dependencies changed, it failed last time, it is marked `external`, or more than one run was asked for." },
        { say: "Other results come from the cache, so testing `//...` costs, beyond loading and analyzing the graph, only the tests the change reaches." },
        { say: "`shard_count = N` runs a test as N processes, possibly on N machines." },
        { say: "rules_go gives each shard every N-th top-level `Test` function, so one slow function cannot be split.", hold: 0.6 },
      ],
      draw(s) {
        // Figure 9.4: what `bazel test //...` runs after an edit to core.
        s.fit(0, 0, 1040, 760);
        const head = s.text(0, 30, "`bazel test //...` after an edit to `core`", { size: 28 });
        const core = s.box(0, 290, 180, 80, "core", { mono: true });
        const edit = s.pill(90, 250, "edit", { kind: "run" });
        const NAMES = ["core_test", "api_test", "web_test", "batch_test", "cli_test", "util_test"];
        const YS = [80, 190, 300, 450, 560, 670];
        const tests = NAMES.map((n, i) => s.box(280, YS[i], 250, 76, n, { mono: true }));
        const reach = [0, 1, 2].map((i) => s.edge(core, tests[i]));
        const ran = s.legend(560, 650, [["run", "reached by the edit: run"]]);
        const cached = s.legend(560, 700, [["hit", "not reached: results from the cache"]]);
        // web_test's shards, each a process of its own.
        const count = s.text(640, 166, "shard_count = 3", { size: 26, mono: true });
        const SY = [190, 310, 430];
        const shards = SY.map((y, i) => {
          const g = s.group();
          g.box(640, y, 400, 96, "", { kind: "run" });
          g.text(664, y + 58, `shard ${i}`, { size: 26, tone: "muted" });
          return g;
        });
        const fans = SY.map((y) => s.edge(tests[2], [634, y + 48]));
        // Every third top-level Test function goes to the same shard.
        const funcs = ["TestA", "TestB", "TestC", "TestD", "TestE", "TestF"].map((f, i) => s.text(i < 3 ? 790 : 910, SY[i % 3] + 60, f, { size: 30, mono: true }));
        return (t, cue) => {
          const [a, b, c, d] = cue;
          appear(head, t, a + 0.2);
          appear(core, t, a + 0.5);
          tests.forEach((x, i) => appear(x, t, a + 0.9 + 0.2 * i));
          reach.forEach((e, i) => grow(e, during(t, a + 2.2 + 0.2 * i, a + 3.0 + 0.2 * i)));
          // The edit reaches three tests through their dependencies: they run.
          appear(edit, t, a + 4.4);
          core.mark("run", during(t, a + 4.8, a + 5.3));
          reach.forEach((e, i) => e.pulse(ramp(t, a + 5.4 + 0.2 * i, a + 6.4 + 0.2 * i), "run").mark("run", during(t, a + 5.8 + 0.2 * i, a + 6.4 + 0.2 * i)));
          [0, 1, 2].forEach((i) => tests[i].mark("run", during(t, a + 6.4 + 0.2 * i, a + 6.9 + 0.2 * i)));
          appear(ran, t, a + 7.6);
          // The rest come from the cache.
          [3, 4, 5].forEach((i, k) => tests[i].mark("hit", during(t, b + 0.6 + 0.3 * k, b + 1.1 + 0.3 * k)));
          appear(cached, t, b + 1.6);
          // web_test as three processes.
          appear(count, t, c + 0.4);
          fans.forEach((e, i) => grow(e, during(t, c + 1.4 + 0.2 * i, c + 2.2 + 0.2 * i)));
          shards.forEach((g, i) => appear(g, t, c + 2.0 + 0.3 * i));
          funcs.forEach((f, i) => appear(f, t, d + 2.4 + 0.45 * i, 0.4));
        };
      },
    },
    {
      section: "Tests and the local loop",
      lines: [
        { say: "On a laptop the server is warm and few actions rerun, so finding changes takes a large share.", hold: 0.6 },
        { say: "`--watchfs`, off by default, takes changes to source files from the operating system instead of checking each one; the outputs of the last build are still checked." },
      ],
      draw(s) {
        s.fit(0, 0, 1040, 590);
        const os = s.box(370, 0, 300, 80, "operating system");
        const watch = s.pill(830, 40, "--watchfs", { mono: true });
        const srcName = s.text(10, 154, "source files", { size: 26, tone: "muted" });
        const outName = s.text(10, 360, "outputs of the last build", { size: 26, tone: "muted" });
        const sources = [];
        for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) sources.push(s.file(10 + i * 130, 170 + r * 76, 110, 56, ""));
        const outputs = Array.from({ length: 8 }, (_, i) => s.file(10 + i * 130, 376, 110, 56, ""));
        const changed = sources[5];
        // One check at a time: a frame that steps from file to file.
        const scan = s.rect(10, 170, 110, 56, { r: 6, width: 4 });
        const notify = s.edge(os, changed, { from: "bottom", to: "top" });
        // One edit's time on a laptop, in Chapter 1's illustrative shares: finding changes, then running actions.
        const barName = s.text(10, 500, "one edit, on a laptop", { size: 26, tone: "muted" });
        const bar = s.group();
        const W0 = 1020 * (330 / 652), W1 = 1020 - W0 - 6;
        const detect = bar.rect(10, 518, W0, 70, { r: 4, width: 2, fill: null });
        detect.setAttribute("fill", s.hatch());
        const run = bar.rect(16 + W0, 518, W1, 70, { r: 4, width: 2, kind: "run", fill: 0.18 });
        const labels = [bar.text(10 + W0 / 2, 562, "finding changes", { size: 26, anchor: "middle" }), bar.text(16 + W0 + W1 / 2, 562, "running actions", { size: 26, anchor: "middle" })];
        const note = s.text(1030, 500, "illustrative, not to scale", { size: 26, anchor: "end", tone: "muted", italic: true });
        const every = [...sources, ...outputs];
        return (t, cue) => {
          const [a, b] = cue;
          appear(srcName, t, a + 0.2);
          sources.forEach((f) => appear(f, t, a + 0.2));
          appear(outName, t, a + 0.5);
          outputs.forEach((f) => appear(f, t, a + 0.5));
          changed.mark("run", during(t, a + 0.9, a + 1.3) * (1 - during(t, b + 0.2, b + 0.6)) + during(t, b + 5.0, b + 5.4));
          // Without --watchfs: every file is checked, sources and outputs.
          const first = ramp(t, a + 1.6, a + 4.6);
          const second = ramp(t, b + 7.8, b + 9.6);
          const scanning = t < b ? first : second;
          const list = t < b ? every : outputs;
          const k = Math.min(list.length - 1, Math.floor(scanning * list.length));
          place(scan, list[k].x - 10, list[k].y - 170);
          show(scan, 0.8 * ((first > 0 && first < 1) || (second > 0 && second < 1) ? 1 : 0));
          show(bar, during(t, a + 1.4, a + 1.8) * mix(1, 0.4, during(t, b + 0.2, b + 0.6)));
          const ran = ramp(t, a + 4.7, a + 5.6);
          detect.setAttribute("width", Math.max(0.1, W0 * first).toFixed(1));
          run.setAttribute("width", Math.max(0.1, W1 * ran).toFixed(1));
          show(detect, first > 0 ? 1 : 0);
          show(run, ran > 0 ? 1 : 0);
          show(labels[0], during(t, a + 4.4, a + 4.8));
          show(labels[1], during(t, a + 5.4, a + 5.8));
          show(barName, during(t, a + 1.4, a + 1.8) * mix(1, 0.4, during(t, b + 0.2, b + 0.6)));
          show(note, during(t, a + 1.4, a + 1.8) * mix(1, 0.4, during(t, b + 0.2, b + 0.6)));
          // With --watchfs: the operating system says which source changed.
          appear(watch, t, b + 0.4);
          appear(os, t, b + 2.4);
          grow(notify, during(t, b + 3.4, b + 4.2)).pulse(ramp(t, b + 4.2, b + 5.0), "run");
        };
      },
    },
    {
      section: "Tests and the local loop",
      lines: [{ say: "gopls, Go's language server, asks Bazel about packages; a server runs one command at a time, so a long build delays the editor." }],
      draw(s) {
        s.fit(0, 40, 1040, 410);
        const build = s.box(0, 40, 320, 90, "`bazel build`");
        const gopls = s.box(0, 300, 320, 90, "gopls");
        const server = s.box(620, 120, 420, 200, "", { kind: "bazel" });
        const name = s.text(830, 168, "Bazel server", { size: 32, weight: 600, anchor: "middle", tone: "bazel" });
        const slot = s.rect(650, 200, 360, 90, { r: 8, width: 2 });
        slot.setAttribute("stroke-opacity", 0.5);
        const fromBuild = s.edge(build, [612, 190]);
        const fromGopls = s.edge(gopls, [612, 260]);
        const driver = s.text(340, 400, "`GOPACKAGESDRIVER`", { size: 26 });
        // The command the server is running: the build, filling; then gopls's request.
        const running = s.group();
        const fill = running.rect(656, 206, 348, 78, { kind: "run", fill: 0.18, r: 6, width: 2 });
        running.text(830, 255, "`bazel build`", { size: 26, anchor: "middle" });
        const answer = s.group();
        answer.rect(656, 206, 348, 78, { kind: "run", fill: 0.18, r: 6, width: 2 });
        answer.text(830, 255, "gopls", { size: 26, anchor: "middle" });
        const waits = s.text(560, 324, "waits", { size: 26, anchor: "middle", tone: "muted" });
        return (t, cue) => {
          const [a] = cue;
          appear(server, t, 0.2);
          appear(name, t, 0.2);
          appear(slot, t, 0.2);
          appear(build, t, 0.3);
          grow(fromBuild, during(t, 0.4, 0.9));
          // The build runs, and runs.
          const done = a + 8.6;
          show(running, during(t, 0.9, 1.2) * (1 - during(t, done, done + 0.3)));
          fill.setAttribute("width", Math.max(0.1, 348 * ramp(t, 0.9, done)).toFixed(1));
          // gopls asks, and waits until the build is done.
          appear(gopls, t, a + 0.4);
          grow(fromGopls, during(t, a + 2.0, a + 2.6));
          appear(driver, t, a + 2.2);
          fromGopls.pulse(mix(0, 0.92, ramp(t, a + 2.6, a + 3.4)) + 0.08 * ramp(t, done, done + 0.3), "run");
          between(waits, t, a + 4.2, done);
          appear(answer, t, done + 0.4);
        };
      },
    },
  ],
};
