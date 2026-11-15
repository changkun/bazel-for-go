# /// script
# requires-python = ">=3.11"
# dependencies = ["pandas", "matplotlib", "networkx"]
# ///
"""Tables and figures from one run of the benchmark harness (see run.go and probe.go).

    uv run examples/bench/analyze.py examples/bench/results/2026-11-15

It prints Markdown tables to stdout, ending with every number Chapter 5 cites, and writes
the chapter's two data figures, book/figures/05-process-cost.svg and 05-build-shape.svg.
"""

import gzip
import json
import re
import sys
from pathlib import Path

import matplotlib
import matplotlib.ticker
import networkx as nx
import pandas as pd

matplotlib.use("svg")
import matplotlib.pyplot as plt

GO = "#00ADD8"  # the go command's accent colour (STYLE.md)
INK = "#010203"  # written as currentColor, so that figures follow the page's theme
FIGURES = Path(__file__).resolve().parents[2] / "book" / "figures"
MB = 1e6

plt.rcParams.update({
    "svg.fonttype": "none", "font.family": "sans-serif", "font.size": 13,
    "text.color": INK, "axes.labelcolor": INK, "axes.edgecolor": INK,
    "xtick.color": INK, "ytick.color": INK, "legend.frameon": False,
    "axes.spines.top": False, "axes.spines.right": False,
})


def load(path, read):
    """Reads one result file, or returns None with a note if it is missing or truncated."""
    try:
        return read(path)
    except (OSError, EOFError, ValueError) as e:
        print(f"<!-- skipped {path.name}: {e} -->\n")
        return None


def md(df, title, floatfmt=".2f"):
    """Prints a DataFrame as a Markdown table."""
    df = df.reset_index()
    cols = [" ".join(map(str, c)).strip() if isinstance(c, tuple) else str(c) for c in df.columns]
    fmt = lambda v: "" if pd.isna(v) else f"{v:{floatfmt}}" if isinstance(v, float) else str(v)
    rows = [" | ".join(fmt(v) for v in r) for r in df.itertuples(index=False)]
    print(f"### {title}\n\n| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
          + "\n".join(f"| {r} |" for r in rows) + "\n")


def save(fig, name, title):
    """Writes an SVG that the site can inline: theme colours, no background, unique ids."""
    path = FIGURES / name
    plt.rcParams["svg.hashsalt"] = name
    fig.savefig(path, format="svg", transparent=True, metadata={"Date": None})
    plt.close(fig)
    s = path.read_text()
    s = s[s.index("<svg"):]
    s = re.sub(r"\s*<metadata>.*?</metadata>", "", s, flags=re.S)
    s = re.sub(r"\s*<style[^>]*>\*\{[^}]*\}</style>", "", s)  # a global rule would reach the whole page
    s = re.sub(r' (width|height)="[\d.]+pt"', "", s, count=2)
    s = re.sub(r'font-family:[^;"]*', "font-family: ui-sans-serif, system-ui, sans-serif", s)
    s = s.replace(INK, "currentColor")
    p = name.removesuffix(".svg") + "-"
    s = s.replace('id="', f'id="{p}').replace("url(#", f"url(#{p}").replace('href="#', f'href="#{p}')
    s = re.sub(r"(<svg[^>]*>)", rf'\1\n <title>{title}</title>', s, count=1)
    path.write_text(s.replace("<svg ", '<svg role="img" ', 1))
    print(f"<!-- wrote {path} -->\n")


# ---- 1. End to end ---------------------------------------------------------------------------

def processes(r):
    if r.tool == "bazel":  # Bazel's total includes "internal" actions, which start no process
        return r.counts.get("processes", 0) - r.counts.get("internal", 0)
    return sum(r.counts.values())


def end_to_end(res):
    t = res[res.unit.isna() & ~res.scenario.str.startswith("workload")].copy()
    t["procs"] = [processes(r) for r in t.itertuples()]
    order = {s: i for i, s in enumerate(t.scenario.unique())}
    out = (t.groupby(["config", "scenario", "tool"])
           .agg(s=("seconds", "median"), procs=("procs", lambda p: round(p.median())), reps=("seconds", "size"))
           .unstack("tool"))
    out = out.sort_index(key=lambda k: k.map(order) if k.name == "scenario" else k)
    md(out, "End to end: median seconds and processes run")
    heap = res[res.unit.notna()].pivot_table(index="config", columns="scenario", values="value")
    md(heap, "Bazel server: used heap after GC (MB)", ".0f")


# ---- 2. Per process --------------------------------------------------------------------------

def import_graph(actions):
    """The package import graph of a go action graph, with edges from a package to its importer."""
    pkg = {a["ID"]: a["Package"] for a in actions}
    g = nx.DiGraph()
    for a in actions:
        if a["Mode"] == "build":
            g.add_node(a["Package"])
            g.add_edges_from((pkg[d], a["Package"]) for d in a["Deps"] or [] if pkg[d] and pkg[d] != a["Package"])
    return g


def workload(w, graphs):
    w = w.assign(cpu_ms=w.user_ms + w.sys_ms, rss_mb=w.maxrss / MB, kind=w.tool)
    w.loc[w.tool.eq("link") & w.target.str.endswith(".test"), "kind"] = "link (test)"
    w.loc[w.tool.eq("test"), "kind"] = "test (run)"
    pct = lambda p: lambda s: s.quantile(p)
    agg = {f"{c} {n}": (c, f) for c in ["wall_ms", "cpu_ms", "rss_mb"]
           for n, f in [("p50", pct(.5)), ("p90", pct(.9)), ("max", "max")]}
    g = w.groupby(["config", "kind"])
    out = g.agg(n=("wall_ms", "size"), **agg)
    out["cpu/wall"] = g.cpu_ms.sum() / g.wall_ms.sum()
    out["total cpu_s"] = g.cpu_ms.sum() / 1000
    md(out, "Per process: wall and CPU time (ms), peak RSS (MB), total CPU / total wall", ".1f")

    c = w[w.tool.eq("compile")].assign(c=lambda d: pd.cut(pd.to_numeric(d.c, errors="coerce"), [0, 4, 8, 17, 99]))
    cg = c.groupby(["config", "c"], observed=True)
    md(cg.agg(n=("wall_ms", "size"), wall_ms=("wall_ms", "median"), rss_mb=("rss_mb", "median"))
       .assign(**{"cpu/wall": cg.cpu_ms.sum() / cg.wall_ms.sum()}),
       "Compile processes by the -c the go command gave them: medians", ".1f")
    md(c.nlargest(6, "rss_mb").set_index(["config", "target"])[["wall_ms", "cpu_ms", "rss_mb"]],
       "Largest compiles", ".0f")

    for config, t in w[w.kind == "test (run)"].groupby("config"):
        print(f"- {config}: wall time of the first test runs, in the order they finished (ms): "
              f"{', '.join(map(str, t.wall_ms.head(8)))}; median step {t.wall_ms.head(18).diff().median():.0f} ms\n")

    # Test binaries, by how many of the repository's packages they link.
    links = []
    for config, actions in graphs.items():
        if config not in set(w.config):
            continue
        ig = import_graph(actions)
        size = {p.rsplit("/", 1)[-1] + ".test": 1 + sum(a.startswith("example.com/") for a in nx.ancestors(ig, p))
                for p in ig if p.startswith("example.com/")}
        l = w[(w.config == config) & (w.kind == "link (test)")].assign(pkgs=lambda d: d.target.map(size))
        links.append(l)
        print(f"- {config}: {l.pkgs.isna().sum()} of {len(l)} test binaries are of packages that no go build binary "
              f"imports, so the build's action graph does not give their size; the table leaves them out\n")
        bins = [len(a["Deps"]) for a in actions if a["Mode"] == "link"]
        print(f"- {config}: the go build links {len(bins)} binaries of {min(bins)}–{max(bins)} packages each\n")
    links = pd.concat(links) if links else w.iloc[:0].assign(pkgs=0)
    lg = links.groupby(["config", pd.cut(links.pkgs, [0, 10, 30, 100, 300, 1000, 3000])], observed=True)
    md(lg.agg(n=("pkgs", "size"), wall_ms=("wall_ms", "median"), cpu_ms=("cpu_ms", "median"), rss_mb=("rss_mb", "median")),
       "Test links by repository packages linked: medians", ".0f")
    return w, links


def fig_process_cost(d, config):
    """Figure 5.2: peak memory against wall time, one point per compile or link."""
    fig, ax = plt.subplots(figsize=(10, 4.4))
    for kind, label, style in [
        ("compile", "compile, one per package", dict(marker="o", s=9, color=GO, alpha=.3, linewidths=0)),
        ("link (test)", "link, one per test binary", dict(marker="o", s=20, facecolors="none", edgecolors=INK, linewidths=.7, alpha=.5)),
        ("link", "link, one per go build binary", dict(marker="D", s=36, color=INK, linewidths=0)),
    ]:
        k = d[d.kind == kind]
        ax.scatter(k.wall_ms / 1000, k.rss_mb, label=f"{label} ({len(k)})", **style)
    ax.set(xscale="log", yscale="log", xlabel="wall time per process (s)", ylabel="peak memory (MB)")
    plain = matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:g}")
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_formatter(plain)
        axis.set_minor_formatter(matplotlib.ticker.NullFormatter())
    ax.set_yticks([v for v in [10, 20, 50, 100, 200, 500, 1000, 2000] if d.rss_mb.min() / 1.5 < v < d.rss_mb.max() * 1.5])
    ax.legend(loc="upper left", handletextpad=.2, borderaxespad=0)
    fig.tight_layout()
    save(fig, "05-process-cost.svg", f"Peak memory against wall time for every compile and link process of {config}.")


# ---- 3. The go build's critical path --------------------------------------------------------

def timed(actions):
    a = pd.DataFrame(actions).set_index("ID", drop=False)
    a["Deps"] = a.Deps.map(lambda d: d if isinstance(d, list) else [])
    t = {c: pd.to_datetime(a[c], format="ISO8601") for c in ["TimeStart", "TimeDone"]}
    a["start"] = (t["TimeStart"] - t["TimeStart"].min()).dt.total_seconds()
    a["done"] = (t["TimeDone"] - t["TimeStart"].min()).dt.total_seconds()
    a["dur"] = a.done - a.start
    return a


def critical_path(a):
    """The longest chain of dependent actions, weighting each action by its duration."""
    g = nx.DiGraph()
    g.add_edges_from(("start", i, {"w": d}) for i, d in a.dur.items())
    g.add_edges_from((d, i, {"w": a.dur[i]}) for i, deps in a.Deps.items() for d in deps)
    return [i for i in nx.dag_longest_path(g, weight="w") if i != "start"]


def critical_paths(graphs):
    rows, out = [], {}
    for config, actions in graphs.items():
        a = timed(actions)
        path = critical_path(a)
        out[config] = (a, path)
        cp, cmd = a.loc[path], a[a.Cmd.notna()]
        rows.append({
            "config": config, "processes": len(cmd), "wall_s": a.done.max(),
            "action_s": a.dur.sum(), "cpu_s": (cmd.CmdUser.sum() + cmd.CmdSys.sum()) / 1e9,
            "critical_s": cp.dur.sum(), "on path": len(cp[cp.Cmd.notna()]),
            "link_s": cp[cp.Mode == "link"].dur.sum(),
            "links p50_s": a[a.Mode == "link"].dur.median(),
            "std_s": cp[cp.Package.str.contains(".", regex=False) == False].dur.sum(),
        })
        steps = [f"{p.rsplit('/', 1)[-1]} {d:.2f}" for m, p, d in zip(cp.Mode, cp.Package, cp.dur) if m in ("build", "link")]
        print(f"- {config} critical path (package, s): " + " → ".join(steps) + "\n")
    t = pd.DataFrame(rows).set_index("config")
    t["action_s / critical_s"] = t.action_s / t.critical_s
    t["action_s / wall_s"] = t.action_s / t.wall_s
    md(t, "go build, cold: total action time and CPU against the critical path (s)")
    return out


def fig_build_shape(a, path, ncpu, config):
    """Figure 5.3: processes running during a cold go build, with the critical path beneath."""
    run = a[a.Cmd.notna()]
    ev = pd.concat([pd.Series(1, run.start), pd.Series(-1, run.done)]).groupby(level=0).sum().cumsum()
    fig, ax = plt.subplots(figsize=(10, 4.2))
    ax.fill_between(ev.index, ev.values, step="post", color=GO, alpha=.15, linewidth=0)
    ax.step(ev.index, ev.values, where="post", color=GO, linewidth=1)
    ax.axhline(ncpu, color=INK, linewidth=.8, linestyle=(0, (2, 3)))
    ax.text(a.done.max(), ncpu + .6, f"{ncpu} cores", ha="right")
    cp = a.loc[path]
    ax.hlines([-2.2] * len(cp), cp.start, cp.done, color=INK, linewidth=6)
    std = cp.Package.str.contains(".", regex=False) == False
    for part, ha, x in [("standard library", "left", cp[std].start.min()),
                        ("repository packages, layer by layer", "center", (cp[~std].start.min() + cp[cp.Mode == "link"].start.min()) / 2),
                        ("link", "right", cp.done.max())]:
        ax.text(x, -3.4, part, ha=ha, va="top")
    ax.set_yticks([0, 5, 10, 15, -2.2], ["0", "5", "10", "15", "critical path"])
    ax.set(xlabel="seconds since the build started", ylabel="processes running", xlim=(0, None), ylim=(-5.5, ncpu + 2.5))
    ax.yaxis.set_label_coords(-.1, .6)
    ax.spines["left"].set_bounds(0, ncpu + 2)
    fig.tight_layout()
    save(fig, "05-build-shape.svg",
         f"Processes running during a cold go build of {config}, against the critical path beneath it.")


# ---- 4. Bazel's profiles ---------------------------------------------------------------------

def bazel_profiles(d, res):
    out = {}
    for path in sorted(d.glob("*-bazel-*.profile.gz")):
        p = load(path, lambda f: json.load(gzip.open(f)))
        if p is None:
            continue
        name = path.name.removesuffix(".profile.gz")
        config, scenario = name.split("-bazel-")
        ev = pd.DataFrame(p["traceEvents"])
        cp = ev[ev.cat == "critical path component"]
        reported = res[(res.config == config) & (res.tool == "bazel") & (res.scenario == scenario)].counts
        reported = [c.get("critical_path_ms", 0) / 1000 for c in reported]
        merged = ev.name.astype(str).str.extract(r"^(\d+)x various events$")[0].dropna().astype(int).sum()
        print(f"**{name}**: critical path {cp.dur.sum() / 1e6:.2f} s in {len(cp)} actions "
              f"(Bazel reported {reported[0] if reported else '?'} s); "
              f"{merged} short events merged by --slim_profile. Longest:\n")
        for n, dur in cp.nlargest(4, "dur")[["name", "dur"]].values:
            print(f"- {dur / 1e6:.2f} s {n}")
        act = ev[ev.cat == "action processing"].assign(mnemonic=lambda e: e.args.map(lambda x: x.get("mnemonic")))
        out[name] = (cp, act)
        ag = act.groupby("mnemonic").dur
        md(ag.agg(n="size", total_s="sum", p50_ms="median", max_ms="max")
           .assign(total_s=lambda t: t.total_s / 1e6, p50_ms=lambda t: t.p50_ms / 1e3, max_ms=lambda t: t.max_ms / 1e3)
           .sort_values("total_s", ascending=False),
           f"{name}: unmerged actions per mnemonic")
    return out


def chapter_numbers(res, w, links, paths, profiles, ncpu):
    """Prints each number that Chapter 5 cites, so that the text is easy to refresh."""
    print("### Numbers cited in Chapter 5\n")
    for config, d in w.groupby("config"):
        k = dict(list(d.groupby("kind")))
        c = k["compile"]
        lib = c[c.target.str.startswith("example.com/")]  # the repository's packages and their test variants
        cs = pd.to_numeric(c.c, errors="coerce")
        print(f"- {config} compiles of repository packages ({len(lib)}), median: {lib.wall_ms.median():.0f} ms wall, "
              f"{lib.cpu_ms.median():.0f} ms CPU, {lib.rss_mb.median():.0f} MB; CPU/wall {lib.cpu_ms.sum() / lib.wall_ms.sum():.1f}; "
              f"-c from {cs.min():.0f} to {cs.max():.0f}")
        for rt in c[c.target == "runtime"].itertuples():
            print(f"- {config} runtime compile: {rt.wall_ms} ms wall, {rt.cpu_ms} ms CPU ({rt.cpu_ms / rt.wall_ms:.1f} cores, "
                  f"-c={rt.c}), {rt.rss_mb:.0f} MB")
        if "link" in k:
            l = k["link"]
            print(f"- {config} go build links ({len(l)}), median: {l.wall_ms.median():.0f} ms wall, {l.rss_mb.median():.0f} MB "
                  f"({l.rss_mb.median() / lib.rss_mb.median():.0f}x a compile); CPU/wall {l.cpu_ms.sum() / l.wall_ms.sum():.1f}")
        tl = links[links.config == config]
        if len(tl):
            small, big = tl[tl.pkgs < 10], tl[tl.pkgs >= 300]
            print(f"- {config} test links, median: {small.rss_mb.median():.0f} MB and {small.wall_ms.median():.0f} ms under 10 packages "
                  f"({len(small)}), {big.rss_mb.median():.0f} MB and {big.wall_ms.median():.0f} ms at 300 or more ({len(big)})")
        if "asm" in k:
            a = k["asm"]
            print(f"- {config} asm: {len(a)} processes, median {a.wall_ms.median():.0f} ms, {a.rss_mb.median():.0f} MB")
        if "test (run)" in k:
            t = k["test (run)"]
            print(f"- {config} test runs, median: {t.cpu_ms.median():.0f} ms CPU, {t.wall_ms.median() / 1000:.1f} s wall")
    for (config, tool), r in res[res.scenario == "test-first"].groupby(["config", "tool"]):
        r = r.iloc[0]
        cp = r.counts.get("critical_path_ms")
        n = r.counts.get("test")
        print(f"- {config} {tool} test-first: {r.seconds:.0f} s" + (f", {r.seconds / n:.2f} s per test binary" if n else "")
              + (f", critical path {cp / 1000:.1f} s" if cp else ""))
    for (config, tool), r in res[res.scenario == "core-body"].groupby(["config", "tool"]):
        if tool == "go":
            print(f"- {config} go core-body: {r.counts.iloc[0].get('link', 0)} links per build")
        else:
            print(f"- {config} bazel core-body: {processes(r.iloc[0])} processes per build")
    for config, r in res[res.scenario == "codegen-generate"].groupby("config"):
        print(f"- {config} go generate: median {r.seconds.median():.1f} s")
    for (config, s), r in res[res.unit.notna()].groupby(["config", "scenario"]):
        print(f"- {config} Bazel {s}: {r.value.iloc[0]:.0f} {r.unit.iloc[0]}")
    for config, (a, path) in paths.items():
        cp = a.loc[path]
        cmd = a[a.Cmd.notna()]
        repo = cp[cp.Package.str.startswith("example.com/") & cp.Mode.eq("build")]
        cpu = (cmd.CmdUser.sum() + cmd.CmdSys.sum()) / 1e9
        print(f"- {config} cold go build: actions {a.dur.sum():.0f} s, CPU {cpu:.0f} s ({cpu / ncpu:.1f} s on {ncpu} cores), "
              f"wall {a.done.max():.1f} s, critical path {cp.dur.sum():.1f} s "
              f"(runtime {cp[cp.Package == 'runtime'].dur.sum():.2f} s, {len(repo)} repository packages, "
              f"link {cp[cp.Mode == 'link'].dur.sum():.2f} s); links median {a[a.Mode == 'link'].dur.median():.2f} s")
    for name, (cp, act) in profiles.items():
        tools = cp[cp.name.str.contains("GoToolchainBinaryBuild|GoStdlib")].dur.sum() / 1e6
        links = act[act.mnemonic == "GoLink"].dur
        print(f"- {name}: critical path {cp.dur.sum() / 1e6:.1f} s, builder and standard library {tools:.1f} s; "
              f"GoLink median {links.median() / 1e6:.2f} s ({len(links)})")
    print()


def main():
    d = Path(sys.argv[1])
    meta = json.loads((d / "meta.json").read_text())
    print(f"<!-- {d}: {meta['cpu']}, {meta['ncpu']} cores, {meta['go']} -->\n")
    jsonl = lambda f: pd.read_json(f, lines=True)
    res = load(d / "results.jsonl", jsonl)
    res = res.reindex(columns=[*res.columns, *({"unit", "value", "err", "counts"} - set(res.columns))])
    res["counts"] = res.counts.map(lambda c: c if isinstance(c, dict) else {})
    for r in res[res.err.notna()].itertuples():
        print(f"<!-- error: {r.config} {r.tool} {r.scenario} rep {r.rep}: {r.err[:200]!r} -->\n")
    end_to_end(res)

    graphs = {}
    for f in sorted(d.glob("*-go-cold-actiongraph.json.gz")):
        if (g := load(f, lambda f: json.load(gzip.open(f)))) is not None:
            graphs[f.name.split("-go-")[0]] = g
    paths = critical_paths(graphs)
    profiles = bazel_profiles(d, res)
    if (w := load(d / "workload.jsonl", jsonl)) is None:
        return
    w, links = workload(w, graphs)
    config = w.config.value_counts().idxmax()  # the figures show the largest repository measured per process
    print(f"<!-- figures 5.2 and 5.3 show {config} -->\n")
    fig_process_cost(w[w.config == config], config)
    if config in paths:
        fig_build_shape(*paths[config], int(meta["ncpu"]), config)
    chapter_numbers(res, w, links, paths, profiles, int(meta["ncpu"]))


if __name__ == "__main__":
    main()
