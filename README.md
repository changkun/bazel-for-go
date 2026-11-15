# Bazel for Go: What Scales and What Doesn't

A short book for staff and principal engineers deciding whether a Go codebase should be
built with Bazel or with the go command. It explains how each system is designed, why the two
designs differ, where each one stops scaling, and what changes when you switch. The examples
run; the few numbers in the text come from the measurements in Appendix A. `PLAN.md` holds the
chapter-by-chapter plan.

Versions used: Go 1.27, Bazel 9.3, rules_go 0.65, Gazelle 0.54, measured on macOS/arm64.

## Contents

**Part I. The question**

- [Preface](book/00-preface.md): who this is for, and the answer in one page
- [1. What a build system decides](book/01-what-a-build-system-decides.md): the six decisions
  every build system makes (unit of work, source of the graph, change detection, cache key,
  cache scope, place of execution), and a cost model for build time

**Part II. Setup**

- [2. A minimal Bazel Go repository](book/02-minimal-setup.md): bzlmod, rules_go, Gazelle,
  `go.mod` as the source of truth, and gopls
- [3. Constraints of the setup](book/03-constraints.md): what a repository must give up or
  change to build under Bazel

**Part III. Two designs**

- [4. The go command's design](book/04-go-command.md): a build system with no build files.
  Package loading, the action graph, action IDs and content IDs, `GOCACHE`, test caching, and
  the goals that shaped them
- [5. The toolchain's workloads](book/05-workloads.md): what compile, link, cgo, test, vet and
  code generation each consume (CPU, memory, I/O, parallelism), measured per process, and how
  each grows with package and binary size
- [6. Bazel's design](book/06-bazel-design.md): a build system for a polyglot monorepo on many
  machines. Targets, providers and actions; loading, analysis and execution; Skyframe; the
  action cache and the content-addressed store; sandboxes, workers and remote execution
- [7. rules_go: where the designs meet](book/07-rules-go.md): which half of the go command
  Bazel replaces and which half it keeps; the SDK, the standard library, the builder,
  archives versus export data, configurations, nogo and Gazelle
- [8. The designs side by side](book/08-side-by-side.md): each decision from Chapter 1 as
  the two systems make it, why each made it that way, what each choice costs as a repository
  grows, and where each system stops scaling

**Part IV. Operating at scale**

- [9. Optimizing a Bazel Go build](book/09-optimizing.md): cache hit rate, action keys, Build
  without the Bytes, analysis cost and server memory, test selection, and placing each
  workload class on the machine type that suits it
- [10. Deciding](book/10-deciding.md): where each system stops scaling, a decision table and a
  migration path

**Appendix**

- [A. Measurements](book/a-measurements.md): the synthetic repository, the harness, the full
  results and how to reproduce them

## Layout

- `book/`: the chapters.
- `examples/minimal/`: the repository built in Chapter 2.
- `examples/bench/`: the synthetic-repository generator, the benchmark harness and the raw
  results that Appendix A reports.

## Running the examples

Bazelisk reads `.bazelversion` and downloads the pinned Bazel. Appendix A describes the
benchmark harness.

```bash
cd examples/minimal
bazel run //cmd/hello
bazel test //...
```

## License

MIT. See [LICENSE](LICENSE).
