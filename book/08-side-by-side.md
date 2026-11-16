# 8. The designs side by side

This chapter compares the go command's and Bazel's answers to Chapter 1's six decisions, with what each costs as the repository grows.

## Six decisions, two answers

![Figure 8.1: Chapter 1's six decisions as the go command and Bazel answer them. Hollow markers show what an option adds.](figures/08-six-decisions.svg)

An action is one run of one tool, such as a compile; its key hashes everything that can change
its output.

### 1. Unit

Both run one compile per package, the compiler's unit, and one link per
binary.[^go-compile][^go-compileaction][^rules-go-actions] Bazel adds a fixed cost to every
action: it runs rules_go's builder (a program that wraps the compiler)[^rules-go-builder] in a
sandbox (a directory holding only the declared inputs),[^bazel-sandboxing] and hashes inputs and
outputs for its action cache, its record of actions already run.[^bazel-action-cache] In our
view, the cost buys the isolation that remote machines and shared caches need, and weighs most
where packages are many and small.

### 2. Graph

The go command derives the graph from imports, as its goal of building from "the information
found in the source itself" requires.[^go-about] Every run lists every directory and checks
every file; since Go 1.19 it reparses only directories that changed.[^go-load][^go-modindex]
Bazel reads the graph from BUILD files, which list each package's sources and dependencies, and
keeps it in the memory of its server, a long-lived process behind each `bazel`
command.[^bazel-client-server] In our reading, it declares the graph because no one language's
imports describe a repository of many. The go command thus pays T_graph, the time to obtain the
graph, on every run; Bazel pays it after each server start, by loading the BUILD files and
analyzing them into actions, and needs a second description kept in step: Gazelle, a tool that
writes BUILD files from the imports, must rerun whenever imports change, and we recommend that
continuous integration (CI) check that it did.[^gazelle][^gazelle-diff]

### 3. Change

Keeping no process between runs, the go command hashes every source file in the build
again,[^go-filehash] reading every byte but needing no saved state. Bazel's server compares
each known file's timestamps and inode number (the file's identifier on disk) with the last
build's, without reading it, or, with `--watchfs`, asks the operating system what
changed.[^bazel-filestate][^bazel-watchfs] T_detect, the time to find what changed, thus grows
with the bytes of source under the go command and with the number of files under Bazel.
`--watchfs` makes Bazel's check of sources follow the change, but by default it still stats
every output of the last build.[^bazel-output-check]

### 4. Key

A go compile's key, its action ID, hashes the sources, flags and tools, the package's directory
unless `-trimpath` removes paths from the output, and each direct import's content ID, a hash of
its whole archive that the archive itself stores.[^go-buildactionid][^go-actionid-dir][^go-buildid]
The archive holds both the export data, the summary that importers' compiles read, and the
object code that only links read.[^go-archive] So a body edit to a function that the compiler
does not inline (copy into its callers) recompiles every direct importer. An edit that changes
the export data reaches two levels: each importer's object code records a hash of it, so the
importers' archives change too.[^go-fingerprint]

rules_go splits the two, as the compiler's source suggests for "a distributed build setting":
object code to a `.a` file for links, export data to a `.x` file for
importers.[^gc-linkobj][^rules-go-compilego] Bazel's action cache compares the contents of an
action's inputs,[^bazel-action-cache] and an importer reads only the `.x`,[^rules-go-compile-inputs]
so the body edit stops at the edited package if the `.x` is unchanged (Figure 7.3). Besides the
API, the `.x` records the position of each declaration it describes, inlinable bodies and which
parameters escape to the heap,[^go-export-pos][^go-export-inline][^go-export-ext] so an edit to
any of these reaches every direct importer, and the next level where an importer's `.x` copies
the changed declaration.[^go-export-reloc]

Both relink every binary that contains a changed
package,[^go-linkactionid][^rules-go-link-inputs] but GOCACHE keeps no binary from `go
build`,[^go-noexe] while Bazel caches a link like any other action.[^rules-go-actions][^bazel-remote-caching]

### 5. Sharing

GOCACHE, the go command's build cache, belongs to one user on one machine.[^go-defaultdir] Since
Go 1.24,[^go124] `GOCACHEPROG` can hand it to a program that stores entries anywhere; the keys
stay the same, so without `-trimpath` a checkout at another path misses; binaries are never
stored.[^go-cacheprog][^go-noexe-prog] Bazel runs every action in the execroot, where every
input and output has a fixed relative path, so its keys ignore where the checkout lies unless a
rule writes an absolute path into a command.[^bazel-path-resolver] Its local action cache serves
one checkout,[^bazel-output-dirs] but a disk cache, a local directory, serves every checkout on
a machine, and a remote cache a team, links included.[^bazel-remote-caching] Environment
variables and the platform, the kind of machine that runs the action, enter the key and must
match.[^bazel-reapi][^bazel-cache-issues]

### 6. Execution

The go command runs every action as a child process on one machine, `-p` at a time, by default
one per core.[^go-do] One machine's cores then set the floor of T_exec, the time to run
actions that missed the cache. Bazel runs actions locally by default; remote execution sends
them to a pool of machines, uploading the inputs the remote cache lacks,[^bazel-reapi-exec] so,
once `--jobs` (by default the local core count) is raised, the pool bounds
parallelism.[^bazel-jobs] That adds T_transfer, the time to move
bytes to and from remote machines and caches, which Build without the Bytes (default since
Bazel 7.0) limits by downloading only the outputs asked for on the command line
and those local actions need.[^bazel-bwob]

## End to end

Table 8.1: Wall time in seconds: medians of three runs (cold build, test and fresh checkout:
one); at 1,000 and 10,000, ranges where two runs differed.[^bench]

<!--
Fill from examples/bench/results/2026-11-16/results.jsonl, configs n1000, n3000 and n10000 (no tests at n10000),
and from results/2026-11-16-n1000-check and -n10000-check: where the two runs' medians differ at two
significant digits, the cell is a range, low–high.
Row                         go scenario       bazel scenario
Cold build                  cold              cold
No-op build                 noop (reps 0-2)   noop (reps 0-2; rep 3 only re-warms the server)
Body edit to core           core-body         core-body
API edit to core            core-api          core-api
Test after the body edit    test-core-body    test-core-body
Fresh checkout, warm cache  clone-warmcache   clone-diskcache
go clone-warmcache has no -trimpath; clone-warmcache-trimpath is the same build with it.
-->

| Scenario | go, 1,000 | Bazel, 1,000 | go, 3,000 | Bazel, 3,000 | go, 10,000 | Bazel, 10,000 |
|---|---|---|---|---|---|---|
| Cold build | 6.9–7.4 | 37–48 | 28 | 84 | 180–230 | 320–380 |
| No-op build | 0.86–0.87 | 0.13–0.16 | 2.5 | 0.20 | 14–33 | 0.31–0.36 |
| Body edit to `core` | 3.0 | 1.7 | 14 | 12 | 130–140 | 180–190 |
| API edit to `core` | 4.8–5.3 | 5.1–5.6 | 24 | 21 | 170–200 | 210–230 |
| Test after the body edit | 260–270 | 460–480 | 1,200 | 2,300 | — | — |
| Fresh checkout, warm cache | 5.0–6.1 | 5.9–9.4 | 22 | 6.4 | 200–220 | 11–12 |

The repository is Appendix A's synthetic repository at 1,000, 3,000 and 10,000 packages, `core`
its most imported package. The builds are `go build -o <dir> ./...` and
`bazel build` of the same binaries; the test row runs `go test -vet=off ./...` and
`bazel test //...`:

- **Cold build:** both compile everything, the standard library
  included.[^go-no-prebuilt-std][^rules-go-stdlib] Bazel also starts its server, loads,
  analyzes, builds rules_go's builder,[^rules-go-builder-exec] and pays its cost per action.
- **No-op build:** the go command loads and hashes the whole tree; Bazel's running server
  compares file times.
- **Edits to `core`:** after a body or an API edit, the go command recompiles one level of
  importers more than Bazel; both relink. At 10,000 packages Bazel's one compile and 100 slower
  links outlasted the go command's 2,724 compiles and 100 links.[^bench-links]
- **Test after the body edit:** both rerun every test whose binary contains `core`, since each
  keys a test result by its binary.[^go-testcache][^bazel-cache-tests] In our view, the `.x`
  saves compiles here, not links or test runs. Bazel's first-run links and test runs were slower
  (Chapter 5).
- **Fresh checkout:** a copy at another path, given the first build's cache (for Bazel, its disk
  cache). Without `-trimpath`, the action ID of every package in the checkout changes with its
  directory. Bazel's disk-cache keys match, but its new server must load and analyze first.

## Where each stops scaling

![Figure 8.2: One local body edit that leaves the export data unchanged, by Chapter 1's cost terms. Finding the graph and the change grows with the repository; running what missed, with the edit and the binaries it relinks.](figures/08-scaling.svg)

In our analysis, the go command stops scaling where a run's work grows with the repository
rather than the change: every invocation pays T_graph and T_detect over the whole tree (Figure
8.2). Its cache ends at one machine unless `GOCACHEPROG` and `-trimpath` extend it, and binaries
are relinked on every machine. Generated code and other languages stay outside the graph and
uncached: the go command builds only Go and never runs `go generate`
itself.[^go-about][^go-generate]

Bazel, in our analysis, stops scaling where its overheads grow with the graph. Server memory
grows with it; a heap too small fails the build, and the flags that save memory slow
incremental builds.[^bazel-client-server][^bazel-memory] Every server start, as on each new CI
runner, repeats loading and analysis,[^bazel-cache-issues] and, as Chapter 2's restart shows,
checks every action against the action cache again.

## What this means at scale

- Time a no-op build as the repository grows. If it grows with the tree, T_graph and T_detect
  are the limit.
- Before sharing a cache across machines, make keys match: `-trimpath` with
  `GOCACHEPROG`; a matching environment and platform under Bazel. Only Bazel's shared cache
  holds links.
- Under the go command, any edit to a widely imported package recompiles every direct importer,
  and one that changes its export data their importers too. Under Bazel, only an edit that
  changes its `.x` (API, declaration positions, inlinable bodies, escape results) recompiles
  importers. Under both, every binary that contains it relinks.
- Budget for Bazel's overheads: server memory, analysis per server start, a cost per action, and
  BUILD files kept in step with every import change.
- If generated code or other languages are a large share of the build, we expect only a declared
  graph to bring them into the cache.

## References

[^go-compile]: Go, `cmd/compile/doc.go`, package documentation.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/doc.go#L6>
[^go-compileaction]: Go, `cmd/go/internal/work/action.go`, `CompileAction`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/action.go#L628>
[^rules-go-actions]: rules_go, `go/private/actions/compilepkg.bzl`, `emit_compilepkg`, and
    `go/private/actions/link.bzl`, `emit_link`: the `GoCompilePkg` and `GoLink` actions.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L201-L210>
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/link.bzl#L229-L238>
[^rules-go-builder]: rules_go, `go/tools/builders/builder.go`, the package comment; the compile
    action's `executable` is the builder.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/builder.go#L15-L18>
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L205>
[^bazel-sandboxing]: Bazel, "Sandboxing", section "Downsides to sandboxing";
    `lib/sandbox/SymlinkedSandboxedSpawn.java`.
    <https://bazel.build/docs/sandboxing#sandboxing_downsides>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/sandbox/SymlinkedSandboxedSpawn.java#L35-L39>
[^bazel-action-cache]: Bazel, `lib/actions/cache/ActionCache.java`, the interface comment and
    `Entry.Builder.computeDigest`: the action key and the contents of every input and output.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/actions/cache/ActionCache.java#L49-L58>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/actions/cache/ActionCache.java#L400-L418>
[^go-about]: Go, "About the go command", sections "Motivation" and "Configuration versus
    convention". <https://go.dev/doc/articles/go_command>
[^go-load]: Go, `cmd/go/internal/load/pkg.go`, `PackagesAndErrors`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/load/pkg.go#L2937>
[^go-modindex]: Go, `cmd/go/internal/load/pkg.go`, `loadPackageData`, which asks the module
    index first; `cmd/go/internal/modindex/read.go`, `dirHash` and `openIndexPackage`. Added in
    commit 5a1c5b8ae7, first released in Go 1.19.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/load/pkg.go#L952>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/modindex/read.go#L80-L119>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/modindex/read.go#L218-L245>
    <https://go.googlesource.com/go/+/5a1c5b8ae7>
[^bazel-client-server]: Bazel, "Client/server implementation".
    <https://bazel.build/run/client-server>
[^gazelle]: Gazelle, `how-gazelle-works.md`, "Overview".
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/how-gazelle-works.md#overview>
[^gazelle-diff]: Gazelle, `gazelle-reference.md`, `-mode`: diff mode prints what it would change.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L53-L59>
[^go-filehash]: Go, `cmd/go/internal/cache/hash.go`, `FileHash`: hashes the whole file and
    remembers the result in a map that lives as long as the process.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/hash.go#L140-L183>
[^bazel-filestate]: Bazel, `lib/actions/FileStateValue.java`,
    `createRegularFileStateValueFromPath`, and `lib/actions/FileContentsProxy.java`: file
    metadata stands in for contents unless the file system offers a fast digest.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/actions/FileStateValue.java#L137-L147>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/actions/FileContentsProxy.java#L21-L38>
[^bazel-watchfs]: Bazel, `lib/skyframe/LocalDiffAwareness.java`, the `--watchfs` option (default
    `false`) and `EVERYTHING_MODIFIED`, used when it is off; `lib/skyframe/SkyframeExecutor.java`,
    `handleDiffsWithMissingDiffInformation`, which then checks every known file.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/skyframe/LocalDiffAwareness.java#L51-L63>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/skyframe/LocalDiffAwareness.java#L118-L127>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/skyframe/SkyframeExecutor.java#L3941-L3958>
[^bazel-output-check]: Bazel, `lib/pkgcache/PackageOptions.java`,
    `--experimental_check_output_files`, default `true`; `lib/buildtool/ExecutionTool.java`, which
    skips the check only when it is false; `lib/vfs/LocalOutputService.java`, `startBuild`, which
    reports every output as possibly modified; `lib/skyframe/FilesystemValueChecker.java`,
    `getDirtyActionValues`, which stats the outputs of every action in the graph.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/pkgcache/PackageOptions.java#L181-L191>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/buildtool/ExecutionTool.java#L506-L512>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/vfs/LocalOutputService.java#L59-L85>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/skyframe/FilesystemValueChecker.java#L213-L264>
[^go-buildactionid]: Go, `cmd/go/internal/work/exec.go`, `buildActionID`: platform, compiler
    tool ID and flags, input files, and each dependency's content ID.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L264-L442>
[^go-actionid-dir]: Go, `cmd/go/internal/work/exec.go`, `buildActionID`, the `dir` line.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L275-L303>
[^go-buildid]: Go, `cmd/go/internal/work/buildid.go`, the "Build IDs" comment: the content ID
    is read "from the file with minimal I/O, instead of reading and hashing the entire file".
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/buildid.go#L26-L56>
[^go-archive]: Go, `cmd/compile/internal/gc/obj.go`, `dumpobj1`: the archive holds the export
    data (`__.PKGDEF`) and the object code (`_go_.o`).
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/gc/obj.go#L53-L71>
[^go-fingerprint]: Go, `cmd/compile/internal/noder/unified.go`, where the fingerprint is the
    hash of the export data; `noder/import.go`, `addFingerprint`; `cmd/internal/goobj/objfile.go`,
    the `Autolib` table of imported packages and their fingerprints.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/unified.go#L578>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/import.go#L285-L297>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/internal/goobj/objfile.go#L42-L45>
[^gc-linkobj]: Go, `cmd/compile/internal/gc/obj.go`, the comment above `modeCompilerObj`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/gc/obj.go#L26-L51>
[^rules-go-compilego]: rules_go, `go/tools/builders/compilepkg.go`, `compileGo`: `-o` for the
    export data, `-linkobj` for the object code.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/compilepkg.go#L560-L585>
[^rules-go-compile-inputs]: rules_go, `go/private/actions/compilepkg.bzl`, `emit_compilepkg`:
    the `export_file` of each direct dependency; `_archive`, which passes the `.x` path to the
    builder.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L100-L103>
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L22-L29>
[^go-export-pos]: Go, `cmd/compile/internal/noder/writer.go`, `pos`, called for each object in
    `doObj`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/writer.go#L391-L404>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/writer.go#L848-L859>
[^go-export-inline]: Go, `cmd/compile/internal/noder/linker.go`, `exportBody`: a body is
    exported if the function is inlinable and declared in, or inlined into, the package.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/linker.go#L214-L251>
[^go-export-ext]: Go, `cmd/compile/internal/noder/linker.go`, `relocFuncExt`: the
    escape-analysis tag of each parameter and the inlining cost of each inlinable function.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/linker.go#L296-L307>
[^go-export-reloc]: Go, `cmd/compile/internal/noder/linker.go`, the `linker` comment ("a single,
    self-contained export data file") and `relocObj`, which copies an imported object's
    definition.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/linker.go#L36-L38>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/linker.go#L137-L212>
[^go-linkactionid]: Go, `cmd/go/internal/work/exec.go`, `linkActionID`, the `packagefile`
    line. <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L1540-L1566>
[^rules-go-link-inputs]: rules_go, `go/private/actions/link.bzl`, `emit_link`: `archive.libs`,
    the `.a` of every package in the binary.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/link.bzl#L212-L227>
[^go-noexe]: Go, `cmd/go/internal/work/buildid.go`, `updateBuildID`: "Executables are not
    cached by default".
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/buildid.go#L730-L742>
[^bazel-remote-caching]: Bazel, "Remote Caching", sections "Overview" (action outputs are what
    is cached) and "Disk cache" (shared across checkouts).
    <https://bazel.build/remote/caching#overview> <https://bazel.build/remote/caching#disk-cache>
[^go-defaultdir]: Go, `cmd/go/internal/cache/default.go`, `DefaultDir`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/default.go#L74-L87>
[^go124]: Go 1.24 release notes, section "Go command": executables created by `go run` and
    `go tool` "are now cached in the Go build cache" (commit 3ff868f2f5); section
    "GOCACHEPROG": a program named by the `GOCACHEPROG` environment variable can now implement
    the cache, which "was previously behind a GOEXPERIMENT". Unless the variable is set, the
    disk cache is used.
    <https://go.dev/doc/go1.24#go-command> <https://go.dev/doc/go1.24#gocacheprog>
    <https://go.googlesource.com/go/+/3ff868f2f5>
[^go-cacheprog]: Go, `cmd/go/internal/cache/prog.go`, `ProgCache`; `cache/default.go`, where
    `GOCACHEPROG` replaces the disk cache.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/prog.go#L27-L31>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/default.go#L57-L59>
[^go-noexe-prog]: Go, `cmd/go/internal/work/buildid.go`, `updateBuildID`: a binary is stored
    only when the cache is the disk cache.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/buildid.go#L756>
[^bazel-path-resolver]: Bazel, `lib/remote/common/RemotePathResolver.java`,
    `DefaultRemotePathResolver`: the execroot is the input root, and output paths are relative
    to it.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/remote/common/RemotePathResolver.java#L78-L114>
[^bazel-output-dirs]: Bazel, "Output Directory Layout", sections "Current layout" and "Layout
    diagram". <https://bazel.build/remote/output-directories#layout-diagram>
[^bazel-reapi]: Remote Execution API, `remote_execution.proto` as vendored in Bazel, messages
    `Action` (with the platform) and `Command` (with the environment variables).
    <https://github.com/bazelbuild/bazel/blob/9.3.2/third_party/remoteapis/build/bazel/remote/execution/v2/remote_execution.proto#L608-L673>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/third_party/remoteapis/build/bazel/remote/execution/v2/remote_execution.proto#L683-L820>
[^bazel-cache-issues]: Bazel, "Remote Caching", section "Known issues": environment variables
    leaking into an action, and in-memory state lost when the server does not survive.
    <https://bazel.build/remote/caching#known-issues>
[^go-do]: Go, `cmd/go/internal/work/exec.go`, `Builder.Do`, which starts `-p` goroutines;
    `cmd/go/internal/cfg/cfg.go`, `BuildP`, which defaults to `GOMAXPROCS`;
    `cmd/go/internal/work/shell.go`, `Shell.runOut`, which runs each tool as a child process.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L223-L229>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cfg/cfg.go#L87>
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/shell.go#L626>
[^bazel-reapi-exec]: Remote Execution API, `remote_execution.proto` as vendored in Bazel,
    services `Execution` (`Execute`) and `ContentAddressableStorage` (`FindMissingBlobs`).
    <https://github.com/bazelbuild/bazel/blob/9.3.2/third_party/remoteapis/build/bazel/remote/execution/v2/remote_execution.proto#L44-L53>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/third_party/remoteapis/build/bazel/remote/execution/v2/remote_execution.proto#L350-L362>
[^bazel-jobs]: Bazel, `lib/buildtool/BuildRequestOptions.java`, `--jobs` (default `auto`) and
    `JobsConverter`, which turns `auto` into the host's CPU count.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/buildtool/BuildRequestOptions.java#L51-L67>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/buildtool/BuildRequestOptions.java#L533-L536>
[^bazel-bwob]: Bazel 7.0.0 release notes; `lib/remote/options/RemoteOptions.java`,
    `--remote_download_outputs`, default `toplevel`.
    <https://github.com/bazelbuild/bazel/releases/tag/7.0.0>
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/remote/options/RemoteOptions.java#L519-L533>
[^bench]: This book's measurements, `examples/bench/results/2026-11-16/results.jsonl`,
    configurations `n1000`, `n3000` and `n10000`, and a second run of `n1000` and `n10000`
    (Appendix A, Table A.7); Appendix A describes the repository and the harness.
    [results.jsonl](../examples/bench/results/2026-11-16/results.jsonl),
    [n1000, second run](../examples/bench/results/2026-11-16-n1000-check/results.jsonl),
    [n10000, second run](../examples/bench/results/2026-11-16-n10000-check/results.jsonl)
[^go-no-prebuilt-std]: Go 1.20 release notes, "Go command": "The directory `$GOROOT/pkg` no
    longer stores pre-compiled package archives for the standard library".
    <https://go.dev/doc/go1.20#go-command>
[^rules-go-stdlib]: rules_go, `go/private/actions/stdlib.bzl`, `emit_stdlib`, which always
    calls `_build_stdlib`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/stdlib.bzl#L36-L47>
[^rules-go-builder-exec]: rules_go, `go/private/go_toolchain.bzl`, the `builder` attribute with
    `cfg = "exec"`; `go/private/rules/binary_wrapper.sh`, which builds it from source with
    `go build -trimpath`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/go_toolchain.bzl#L62-L64>
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/binary_wrapper.sh#L18-L23>
[^bench-links]: This book's measurements at 10,000 packages, in two runs: in the cold builds a
    binary's link took a median of 32 s and 36 s under Bazel, 19 s and 12 s under the go command;
    in Bazel's first body edit, 41 s and 34 s; the go command's edits record no link times. In
    each run the two tools ran at this size an hour apart, on a machine shared with other work
    (Appendix A).
    [n10000-bazel-cold.profile.gz](../examples/bench/results/2026-11-16/n10000-bazel-cold.profile.gz),
    [n10000-bazel-core-body.profile.gz](../examples/bench/results/2026-11-16/n10000-bazel-core-body.profile.gz),
    [n10000-go-cold-actiongraph.json.gz](../examples/bench/results/2026-11-16/n10000-go-cold-actiongraph.json.gz);
    the second run's
    [n10000-bazel-cold.profile.gz](../examples/bench/results/2026-11-16-n10000-check/n10000-bazel-cold.profile.gz),
    [n10000-bazel-core-body.profile.gz](../examples/bench/results/2026-11-16-n10000-check/n10000-bazel-core-body.profile.gz),
    [n10000-go-cold-actiongraph.json.gz](../examples/bench/results/2026-11-16-n10000-check/n10000-go-cold-actiongraph.json.gz)
[^go-testcache]: Go, `cmd/go/internal/test/test.go`, `tryCacheWithID`: the test ID uses the
    link's inputs as a proxy for the test binary.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L1882-L1909>
[^bazel-cache-tests]: Bazel, `TestConfiguration.java`, the `cache_test_results` option: a test
    reruns when "Bazel detects changes in the test or its dependencies".
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/analysis/test/TestConfiguration.java#L169-L183>
[^go-generate]: Go, `cmd/go/internal/generate/generate.go`: "Go generate is never run
    automatically by go build, go test, and so on."
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/generate/generate.go#L43-L44>
[^bazel-memory]: Bazel, "Optimize Memory", section "Trade incremental build speeds for memory".
    <https://bazel.build/advanced/performance/memory#trade-incremental>
