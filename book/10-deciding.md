# 10. Deciding

This chapter turns the book into a decision. Most of it is our view, marked as such.

## Where each tool fits

![Figure 10.1: Where each tool fits, in our view. The lines are judgement, not measurements.](figures/10-map.svg)

In Figure 10.1, our view, two questions place a Go repository: how many machines build the same
code, and whether one build still fits on one machine. The diagonal marks where work that a
shared Go cache does not share, listed below, comes to dominate continuous integration (CI) time.

### How far the go command goes

The go command is already an incremental build system. It splits a build into a graph of
actions, single tool runs such as one compile, keys each by an action ID, a hash of everything
that can change its output, and keeps the outputs in GOCACHE, a per-user cache on disk
(Chapter 4). Since Go 1.24, setting `GOCACHEPROG` replaces that cache with an external program
that speaks a JSON protocol.[^go-cacheprog] Go defines the protocol; the program decides where
entries live, for example in a store shared by every CI machine.[^go-cacheprog-doc]

A shared store helps only when action IDs match. An action ID covers the compiler's version, the
flags, including `-trimpath`, the target platform and the contents of every input. Without
`-trimpath`, which removes file system paths from the binary,[^go-trimpath] it also covers the
package's directory.[^go-actionid] So every machine needs the same Go version, the same flags,
and either `-trimpath` or identical directory paths. A cgo package (Go code that calls C) adds
the C compiler's command, flags and version.[^go-actionid-cgo]

What a shared store does not change:

- Every command still loads its packages and hashes their source files again, so its cost grows
  with the tree.[^go-load][^go-filehash]
- Binaries are not stored: every binary that contains a changed package is linked again on every
  machine.[^go-noexe]
- A stored test result is reused only if the test's binary and flags match, and every file the
  test opened in its module has the same absolute path, size and modification
  time.[^go-testinputs] We expect a fresh checkout, with new modification times, to rerun every
  test that reads files.
- Each hit reaches the go command as a local file, so every machine downloads what it
  uses.[^go-cacheprog-disk]
- `go generate` and other non-Go steps stay outside the graph.[^go-generate]
- Every action runs on the machine that started the command.[^go-do]

For a CI fleet whose time goes to compiling, we recommend `-trimpath`, one Go version and a
shared `GOCACHEPROG` store first.

### Where Bazel pays for itself

In our view, Bazel pays when one or more of these hold:

- **Many machines build the same code, and time beyond compiling goes to links, tests or
  generators.** Bazel keys each as an action by its declared inputs (Chapter 6), test runs
  included,[^bazel-test-spawn] so a remote cache, a server that stores action outputs for every
  machine, serves them to any checkout.
- **Other languages or code generators share the graph.** Bazel's build files (BUILD files) can
  declare actions in any language (Chapter 3).
- **One build outgrows one machine.** Remote execution runs actions on a pool of
  machines,[^bazel-rbe] though no pool shortens the critical path, the longest chain of actions
  that each wait for the one before (Chapter 5).
- **Release builds must be hermetic**, giving the same output whatever else is installed on the
  machine.[^bazel-hermetic] For pure Go, we expect `-trimpath` and a pinned Go version to be
  enough. Bazel also declares generators and a pinned C toolchain (compiler, linker and flags)
  as inputs; a compiler outside the workspace is not tracked.[^bazel-cache-issues]

What it costs (Chapters 3 and 6): a second description of the graph, kept current by Gazelle,
the tool that writes BUILD files from Go source; a server, the long-lived process that keeps
the graph in memory, whose memory grows with it; loading and analysis, the phases that read
BUILD files and plan actions, after every server start; a fixed cost per action; and the team's
time, with two commands to know and, Chapter 3 expects, most migration work in tests.

Table 10.1: Situations, the tool we recommend, and what to try before switching.

| Situation | In our view | Why | Try first |
|---|---|---|---|
| One Go module, one team | go command | Incremental, with a cache keyed by content hashes (Chapter 4); Bazel adds a second graph and a server | `go build -o <dir>`; keep GOCACHE between CI runs, with `-trimpath` |
| One Go repository, many services, CI time spent compiling | go command with a shared `GOCACHEPROG` store | Compiles are shared once action IDs match[^go-actionid] | `-trimpath` and one Go version everywhere |
| One Go repository, CI time spent linking, testing or loading | Bazel with a remote cache | Links (Chapter 6) and test runs[^bazel-test-spawn] are cached actions; a running server keeps the graph in memory | Split `go test` packages across parallel jobs |
| Go with generated code | go command if generated files are checked in; Bazel if generation is slow or drifts | Bazel runs generators as cached actions (Chapter 3) | Check generated files in; regenerate and diff in CI |
| Go with cgo | Either, with one C compiler on every machine | The C compiler's version enters the go command's action ID;[^go-actionid-cgo] Bazel does not track a compiler outside the workspace[^bazel-cache-issues] | One build image for every machine |
| Go with other languages in one repository | Bazel | One declared graph across languages; the go command builds only Go packages[^go-about] | Gazelle on one service, to see what BUILD files cost to keep |
| One build exceeds one machine | Bazel with remote execution | Parallelism is bounded by the pool, not one machine's cores;[^bazel-rbe] the critical path still bounds build time | Shorten the critical path; keep binaries small (Chapter 5) |
| Reproducible releases | Pure Go: go command; with C or generators: Bazel | Bazel declares toolchains and generators as inputs (Chapter 3) | `-trimpath` and a pinned Go version; build twice and compare |

## A migration path

![Figure 10.2: A migration path. From step 2 on, the go command keeps working beside Bazel.](figures/10-migration.svg)

Bazel's documentation advises running both build tools until the team, CI and other systems
have moved.[^bazel-migrate] We recommend this order:

1. **Generate BUILD files** with the `gazelle` rule and `bazel run //:gazelle`
   (Chapter 2).[^rg-gazelle]
2. **Build both ways in CI:** `bazel test //...` beside `go vet ./...` and `go test ./...`
   (Chapter 3).
3. **Require a clean Gazelle diff** in the same change. In diff mode Gazelle exits with status 1
   when a BUILD file is stale.[^gz-diff]
4. **Share a cache before CI depends on Bazel.** Bazel's documentation suggests that only CI
   write to it (`--remote_cache`), while other machines only read
   (`--remote_upload_local_results=false`).[^bazel-cache-rw]
5. **Move CI first, then laptops**, once gopls, Go's language server, works through Bazel
   (Chapter 2).
6. **Add remote execution last** (`--remote_executor`),[^bazel-remote-executor] and only when work
   off the critical path exceeds one machine's cores or some actions need bigger machines
   (Chapter 9).

Until step 5, stopping costs only the BUILD files. Hermeticity work pays either way, and Bazel's
documentation notes that it eases the move.[^bazel-hermetic-migrate]

## What this means at scale

- Find where CI time goes before choosing a tool: compiles, links, test runs, loading or
  generators.
- Try `-trimpath`, one Go version and a shared `GOCACHEPROG` store first: cheap, reversible,
  and enough for compiles.
- Choose Bazel for what the go command leaves out: links and tests shared across machines, a
  graph with other languages, execution beyond one machine. Not to speed up one module on a
  laptop.
- Move CI first, keep `go test ./...` passing, and require a clean Gazelle diff from the first
  Bazel build.
- Budget Bazel's costs as permanent: BUILD files to keep current, server memory, analysis on
  every new server, and two commands for every developer.

## References

[^go-cacheprog]: Go 1.24 release notes, section "GOCACHEPROG": previously behind a
    `GOEXPERIMENT`; Go, `cmd/go/internal/cache/prog.go`, `ProgCache`; `cache/default.go`,
    where `GOCACHEPROG` replaces the disk cache.
    <https://go.dev/doc/go1.24#gocacheprog>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/prog.go#L27-L31>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/default.go#L57-L59>
[^go-cacheprog-doc]: Go, `cmd/go/internal/cacheprog/cacheprog.go`, the package comment: the
    program "implements the go command build cache externally. This permits defining a different
    cache policy." <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cacheprog/cacheprog.go#L5-L19>
[^go-trimpath]: Go, `cmd/go/internal/work/build.go`, the `-trimpath` flag in the `go build`
    documentation.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/build.go#L197-L201>
[^go-actionid]: Go, `cmd/go/internal/work/exec.go`, `buildActionID`: the directory unless
    `-trimpath` is set, the platform and `-trimpath` itself; the compiler's tool ID and flags; each
    input file's contents and each import's content ID.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L275-L313>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L367>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L428-L435>
[^go-actionid-cgo]: Go, `cmd/go/internal/work/exec.go`, `buildActionID`, the cgo case: the C
    compiler command, its flags and its tool ID.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L317-L329>
[^go-load]: Go, `cmd/go/internal/load/pkg.go`, `PackagesAndErrors`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/load/pkg.go#L2937>
[^go-filehash]: Go, `cmd/go/internal/cache/hash.go`, `FileHash`: the hashes it remembers live
    only as long as the process.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/hash.go#L140-L158>
[^go-noexe]: Go, `cmd/go/internal/work/buildid.go`, `updateBuildID`: executables are not cached
    by default, and are stored only when the cache is the disk cache.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/buildid.go#L730-L736>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/buildid.go#L756>
[^go-testinputs]: Go, `cmd/go/internal/test/test.go`: the test ID hashes the test binary (or the
    link's inputs) and the flags; results are looked up in the configured cache;
    `computeTestInputsID` hashes each opened file by its absolute name and `hashOpen`, which
    records size and modification time through `hashWriteStat`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L1907-L1908>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L1942>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L2056-L2071>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L2148-L2149>
[^go-cacheprog-disk]: Go, `cmd/go/internal/cacheprog/cacheprog.go`, `CmdPut` and `CmdGet`: the
    program returns each body as a path in the local file system.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cacheprog/cacheprog.go#L34-L52>
[^go-generate]: Go, `cmd/go/internal/generate/generate.go`: "Go generate is never run
    automatically by go build, go test, and so on."
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/generate/generate.go#L43-L44>
[^go-do]: Go, `cmd/go/internal/work/exec.go`, `Builder.Do`, which starts `-p` goroutines that run
    the actions as local processes.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L223-L229>
[^go-about]: Go, "About the go command", section "Configuration versus convention": the go
    command "does not attempt to build anything but Go packages".
    <https://go.dev/doc/articles/go_command>
[^bazel-test-spawn]: Bazel, `lib/exec/StandaloneTestStrategy.java`, `createTestRunnerSpawn`,
    which runs a test as a spawn over the test action's inputs, and `extractExecutionInfo`, which
    marks a cache hit as remotely cached.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/exec/StandaloneTestStrategy.java#L131-L139>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/exec/StandaloneTestStrategy.java#L374-L376>
[^bazel-rbe]: Bazel, "Remote Execution Overview". <https://bazel.build/remote/rbe>
[^bazel-hermetic]: Bazel, "Hermeticity", section "Overview".
    <https://bazel.build/basics/hermeticity#overview>
[^bazel-cache-issues]: Bazel, "Remote Caching", section "Known issues": "Bazel does not track
    tools outside a workspace", such as a compiler in `/usr/bin`.
    <https://bazel.build/remote/caching#known-issues>
[^bazel-migrate]: Bazel, "Migrating from Maven to Bazel", introduction: "When migrating from any
    build tool to Bazel, it's best to have both build tools running in parallel".
    <https://bazel.build/migrate/maven>
[^rg-gazelle]: rules_go, `docs/go/core/bzlmod.md`, "Generating BUILD files".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L120-L136>
[^gz-diff]: Gazelle, `gazelle-reference.md`, `-mode`; `cmd/gazelle/main.go`, `main`, which exits
    with status 1 on `ErrDiff`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L53-L59>
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/cmd/gazelle/main.go#L92-L95>
[^bazel-cache-rw]: Bazel, "Remote Caching", section "Read from and write to the remote cache".
    <https://bazel.build/remote/caching#read-write-remote-cache>
[^bazel-remote-executor]: Bazel, `lib/remote/options/RemoteOptions.java`, `--remote_executor`.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/remote/options/RemoteOptions.java#L90-L99>
[^bazel-hermetic-migrate]: Bazel, "Hermeticity", section "Identifying non-hermeticity": "If you
    are preparing to switch to Bazel, migration is easier if you improve your existing builds'
    hermeticity in advance."
    <https://bazel.build/basics/hermeticity#nonhermeticity>
