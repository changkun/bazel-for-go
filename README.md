# Bazel for Go: What Scales and What Doesn't

A short book for staff and principal engineers deciding whether a Go codebase should be
built with Bazel or with the go command. It covers how each system models a build, where each
one stops scaling, and what changes when you switch. The examples run, and every number comes
from a measurement in `examples/bench/results/`.

Versions used: Go 1.27, Bazel 9.3, rules_go 0.65, Gazelle 0.54, measured on macOS/arm64.

## Contents

**Part I. The question**

- [Preface](book/00-preface.md): who this is for, and the answer in one page
- [1. What a build system is for](book/01-what-a-build-system-is-for.md): a cost model for build
  time, and the four terms that grow with a codebase

**Part II. Setup**

- [2. A minimal Bazel Go repository](book/02-minimal-setup.md): bzlmod, rules_go, Gazelle,
  `go.mod` as the source of truth, and gopls
- [3. Constraints of the setup](book/03-constraints.md): what a repository must give up or
  change to build under Bazel

**Part III. Internals**

- [4. Bazel's model](book/04-bazel-model.md): targets, providers and actions; the three phases;
  Skyframe; the action cache and the content-addressed store; sandboxes, workers and remote
  execution
- [5. The go command as a build system](book/05-go-toolchain.md): package loading, the action
  graph, action IDs and content IDs, `GOCACHE`, export data, linking and test caching in Go 1.27
- [6. rules_go: Bazel driving the Go toolchain](book/06-rules-go.md): the SDK, the standard
  library, the builder, archives versus export data, configurations, nogo and Gazelle

**Part IV. Evidence**

- [7. Measurements](book/07-measurements.md): a synthetic repository across a size ladder,
  cold, no-op, incremental, test and shared-cache builds, and where each system wins

**Part V. Operating**

- [8. Optimizing a Bazel Go build](book/08-optimizing.md): cache hit rate, action keys, Build
  without the Bytes, analysis cost, memory, test selection and profiling
- [9. Deciding](book/09-deciding.md): the limits of each system, a decision table and a
  migration path

**Appendix**

- [A. Reproducing the measurements](book/a-reproducing.md)

## Layout

- `book/`: the chapters.
- `examples/minimal/`: the repository built in Chapter 2.
- `examples/bench/`: the synthetic-repository generator, the benchmark harness and the raw
  results that Chapter 7 reports.

## Running the examples

Bazelisk reads `.bazelversion` and downloads the pinned Bazel. See Appendix A for the
benchmark harness.

```bash
cd examples/minimal
bazel run //cmd/hello
bazel test //...
```
