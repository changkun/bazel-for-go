# Plan

## Aim

Explain to staff and principal engineers how the go command and Bazel are each designed, why
the two designs differ, and what each choice costs as a repository grows. Readers should finish
able to predict where each system stops scaling, and to place each build workload on the right
machine. The book is about mechanisms. Measurements appear only as small illustrations inside
the chapters, and the full set sits in an appendix.

Budget: about 25,000 words in all. Each chapter is 1,500 to 3,000 words, opens with what it
answers, and ends with "What this means at scale": three to five consequences a reader can act
on. Claims about internals cite the source file and function they come from (Go 1.27.3,
Bazel 9.3.2, rules_go 0.65.0).

## Structure

### Preface

Who the book is for and how to read it, then the answer on one page. For one Go module on one
machine, the go command is already an incremental build system with a content-addressed cache,
and Bazel does not beat it there. Bazel's advantages come from four places: a declared graph
held in memory by a long-lived server, action keys that do not depend on the path and can
be shared across machines, execution that can leave the machine, and a graph that crosses
languages. It pays for them with a second description of the graph, server memory that grows
with the graph, and a fixed cost on every action.

### Part I. The question

**1. What a build system decides.** A build modelled as a function from sources to artifacts.
Every build system makes six decisions:

1. the unit of work
2. where the graph comes from
3. how change is detected
4. what the cache key covers
5. how far the cache is shared
6. where actions run

A cost model: time to obtain the graph, time to detect change, time to run the actions that
missed the cache (bounded by the critical path and by parallelism), and time to move bytes.
Which terms grow with packages, with change rate times fan-out, with engineers times machines,
and with languages. Chapter 8 returns to the six decisions.

### Part II. Setup

**2. A minimal Bazel Go repository.** `examples/minimal` file by file:

- `MODULE.bazel`: rules_go, the SDK from `go.mod`, and `go_deps` from `go.mod`/`go.sum`
- Gazelle and the BUILD files it writes
- `.bazelrc`
- `bazel build`, `bazel test` and `bazel run`
- gopls through `GOPACKAGESDRIVER`

**3. Constraints of the setup.** What a repository must change to build under Bazel, and why
each change follows from the design:

- every input is declared (embed, testdata, runfiles)
- BUILD files become a second source of truth (Gazelle, directives, a CI check)
- `go generate` becomes build rules
- cgo needs a C toolchain
- build tags become configurations and platforms
- `go vet` becomes nogo
- `replace` directives, private modules and vendoring need handling
- developers now work with two front ends

### Part III. Two designs

**4. The go command's design.**

- **Goals:** no build files, one language, a fast compiler, one machine.
- **Package loading:** from import path to directory to `load.Package`, repeated on every
  invocation.
- **The action graph:** `work.Builder` and the action modes, with `-p` parallelism.
- **Action IDs:** what `buildActionID` hashes. That is the source files, flags, tool IDs, the
  directory unless `-trimpath` is set, and each dependency's content ID, which covers its whole
  archive.
- **Build IDs:** content IDs and the build ID that turns the archive into a one-element cache.
- **Early cutoff:** the content ID excludes the build ID, so a body change stops one level
  above the edited package.
- **Caches:** `GOCACHE`, trimming and `GOCACHEPROG`.
- **Test caching:** which inputs it records, including environment variables and the files a
  test opened.
- **What the design gives up:** a persistent process, path-independent keys, other machines,
  other languages, and caching for `go generate`.

**5. The toolchain's workloads.** What each process does and what it consumes:

- **compile:** one process per package. The front end is serial and the back end concurrent,
  with `-c` drawn from a token pool. Its CPU and memory grow with package size, and it reads
  export data for every import.
- **link:** one process per binary, mostly serial. Its memory grows with binary size, it is
  heavy on I/O, and it reruns on any change to a dependency.
- **asm, cgo and the C compiler.**
- **test binaries:** a link plus a run, with variable duration and a first-execution cost on
  macOS.
- **vet** and analysis facts.
- **code generators.**
- **Shape of a build:** total work against the critical path.

Ends with four workload classes and the machine each wants: compile, link, test, and the build
server.

**6. Bazel's design.**

- **Goals:** a polyglot monorepo built and tested on many machines, correctly.
- **The model:** packages, targets, rules, providers, actions and artifacts.
- **Phases:** loading, analysis and execution.
- **Skyframe:** incremental evaluation, change pruning, and the server that holds the graph.
- **Action keys:** what an action key covers, the action cache against the content-addressed
  store, and why the execroot makes keys path-independent.
- **Sandboxes and persistent workers.**
- **Remote caching and remote execution** (the Remote Execution API), and Build without the
  Bytes.
- **Configurations, transitions, platforms and toolchains.**
- **What the design costs:** a declared graph, server memory, a fixed cost per action, and
  analysis after every server start.

**7. rules_go: where the designs meet.**

- **What Bazel replaces and keeps:** it replaces the go command's loading and planning with
  Gazelle and analysis, and keeps compile, link, asm and cgo.
- **SDK and standard library:** the SDK repository and the standard library action.
- **The builder:** what `compilepkg` and `link` do, and why a wrapper process exists.
- **Archives and export data:** the `.a` and the `.x` files. A dependent compiles against the
  `.x` file, so a body change stops at the edited package.
- **Rules and providers:** `go_library`, `go_binary` and `go_test`, and the providers between
  them.
- **Configuration transitions:** goos, goarch, race and pure.
- **nogo.**
- **Gazelle:** deriving the declared graph from the derived one.

**8. The designs side by side.** The six decisions from Chapter 1. For each one: what the go
command does, what Bazel does, why each chose as it did, and what the choice costs as the
repository grows. The chapter closes with where each system stops scaling and why.

### Part IV. Operating at scale

**9. Optimizing a Bazel Go build.**

- **Measure first:** the profile, the critical path and the execution log.
- **Cache hit rate:** stamping, leaked environment, toolchain pinning and nondeterminism.
- **Target granularity.**
- **Analysis cost and server memory:** sizing the JVM and keeping servers warm.
- **Remote cache and Build without the Bytes.**
- **Remote execution and machine placement:** pools per workload class from Chapter 5, routed
  with platforms, exec properties and per-mnemonic strategies, and sized from the per-process
  profiles.
- **Test selection and sharding.**
- **The local loop.**

**10. Deciding.** Where the go command stops scaling and how far `GOCACHEPROG` and a shared
cache extend it; where Bazel starts paying for itself; a decision table; a migration path
(Gazelle, a period of building both ways, CI first).

### Appendix

**A. Measurements.** The synthetic repository, the harness and the full results: cold, no-op,
incremental, test, code generation and fresh-checkout builds across a size ladder, the
per-process workload profiles, and how to reproduce them.

## Where measurements appear in the chapters

- Chapter 5: per-process CPU, wall time and peak memory for compile, link and test, and the
  critical path of a build.
- Chapter 7: the number of processes each system runs after a body-only edit to a widely
  imported package (go recompiles the package and its direct importers, Bazel only the package).
- Chapter 8: one table of the end-to-end scenarios at two sizes.
