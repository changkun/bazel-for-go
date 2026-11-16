# A. Measurements

The book's benchmark measurements come from `examples/bench`, a harness that generates a synthetic
Go repository, builds and tests it with both tools in fixed scenarios, and
records each command.[^a-main]

## The synthetic repository

![Figure A.1: The generated import graph at 1,000 packages. Packages import only from lower layers, or `core`; binaries from the top one.](figures/a-repository.svg)

`bench gen` writes one Go module with the BUILD files Gazelle would write, so both
tools build the same tree; a given shape always produces the same bytes.[^a-gen]
Packages are spread evenly over layers (Figure A.1). Each package above layer 0
imports up to three packages chosen at random from the layer directly below and one from any
lower layer: a fan-in of four.[^a-plan] Package 0, `core`, sits in layer 0, and every other
package also imports it directly with probability 0.3, so an edit to `core` reaches most of the
repository. The binaries, one per 100 packages and at least two, each import three packages of
the top layer. The leaf is the first package that `app00` imports; no library imports it.

Every package has the same files.[^a-files] `edit.go` holds `bodyEdit`, a function too large to
inline, whose body the harness edits. Three files hold ten functions each; `api.go`'s `Compute`
calls them and every import's `Compute`; `pkg_test.go` holds two small tests.
Every tenth package also has a `table.txt` that the generator `tools/gentable` turns into
`table_gen.go`, standing in for generators such as protoc. For the go command that file is
checked in and refreshed by `go generate`; for Bazel, a `genrule` (a rule that runs a command)
generates it during the build.[^a-gentable]

The configurations are named for their package count: `n100`, `n1000`, `n3000` and `n10000`,
with 8, 12, 14 and 16 layers.[^a-configs-run] Two vary the shape at 1,000 packages: `n1000-wide`
has 4 layers and a fan-in of 8, `n1000-deep` 40 layers and a fan-in of 3. `n1000-local` builds
`n1000` with Bazel alone and `--spawn_strategy=local`, which runs each action as a plain local
process,[^bazel-spawn] outside the sandbox (a directory that holds only the action's declared
inputs).

## The harness

`bench run` measures each configuration in turn, and each tool from a freshly generated
tree.[^a-run] With `-o` naming a directory, `go build` builds only the main packages and what
they import, and Bazel builds the targets that `build_targets.txt` lists: the binaries and the
generator.[^a-targets]

Both use Go 1.27.3: the go command from the SDK (software development kit) that `-goroot` names,
with `GOTOOLCHAIN=local` (no switching to another Go version) and every other `GO` variable
cleared or set by the harness;[^a-goenv][^go-toolchain-local] rules_go downloads the version the
generated `go.mod` names (Chapter 2).[^rg-from-file]

Each configuration has its own GOCACHE (the go command's build cache), and Bazel its own output base
(its outputs and state for one checkout) in the harness's work directory; `--nohome_rc` and
`--nosystem_rc` keep the user's and the system's `.bazelrc` files out.[^a-bazel][^bazel-rc] Bazel's
cold build follows a fetch of rules_go and the Go SDK, so it downloads nothing.

In the table, a go build is `go build -x -o <dir> ./...`, where `-x` prints each command it runs,
and a Bazel build is `bazel build --target_pattern_file=build_targets.txt`. The test scenarios
run after the edits, with the build caches warm.

| Scenario | go command | Bazel |
|---|---|---|
| `cold` | build with an empty GOCACHE | build after `bazel clean` and `bazel shutdown`, which stops the server, Bazel's long-lived process that holds the build graph |
| `noop` | build again, nothing changed | the same, with the server running |
| `noop-discard` | `go build -x ./...`: every package, with each binary linked into a temporary directory and discarded | — |
| `noop-cold-server` | — | build after `bazel shutdown` |
| `analysis-cold-server` | — | `bazel build --nobuild` after `bazel shutdown`: only loading and analysis, the phases that read BUILD files and plan the actions |
| `leaf-body` | change a number in the body of the leaf's `bodyEdit`, then build | the same |
| `core-body` | the same in `core` | the same |
| `core-api` | add an exported function to `core`, then build | the same |
| `core-comment` | add a comment above the package clause of `core`'s `types.go`, moving every declaration in it, then build | the same |
| `test-first` | `go test -x -vet=off ./...` | `bazel test //...` |
| `test-noop` | the same again | the same |
| `test-core-body` | a `core-body` edit, then the same | the same |
| `codegen-generate` | append a line to one `table.txt`, then `go generate ./...` | — |
| `codegen-build` | then build | the same edit, then build |
| `clone-warmcache` | copy the tree to a new path; build the copy with the same GOCACHE | — |
| `clone-warmcache-trimpath` | build the original with `-trimpath` (which removes file system paths from the outputs), untimed; then the copy, also with `-trimpath` | — |
| `clone-diskcache` | — | after `bazel clean`, build the original with a new disk cache (`--disk_cache`, a local directory of action results), untimed; then build the copy with a new output base and that cache |
| `server-heap-after-build`, `-test` | — | `bazel info used-heap-size-after-gc` after the build scenarios and after the tests |

The tools' order alternates between configurations, so neither always runs on a hotter
machine.[^a-order] A measurement is one command's wall time, from start to exit. The harness counts
the compile, link, asm and test processes in the go command's `-x` output, and reads Bazel's summary
line of processes run and actions answered from a cache.[^a-time] Warm scenarios repeat `-reps`
times, three here; Bazel's fourth `noop`, which rewarms the server, is left out. Edits
accumulate across runs. The go command's cold build also writes its action graph
(`-debug-actiongraph`: its actions and their times), and Bazel's cold build, first `core-body` build
and first test write a trace profile (`--profile`); Chapters 5 and 9 analyze them.

For `n1000` and `n3000`, after both tools, the harness builds and tests once more from an empty
GOCACHE, with the go command running a wrapper, `bench toolexec` (the probe), in place of each
tool (`-toolexec`) and each test binary (`-exec`).[^go-toolexec][^go-exec] The wrapper appends
each process's wall time, user and system CPU time, and peak RSS (resident set size: the most
physical memory it held at once) to `workload.jsonl`.[^a-probe] It adds a process per tool, so we
do not compare these runs' times with others.

## Results

`analyze.py --appendix` prints the tables below.[^a-analyze]

<!-- BEGIN generated by analyze.py --appendix -->
<!-- 2026-11-16: Apple M5 Pro, 18 cores, go version go1.27.3 darwin/arm64 -->

"—": not measured in this configuration.

Table A.1: The configurations, as generated.[^a-configs]

| Config | Packages | Layers | Fan-in | Binaries | Lines of Go | Import `core` | Depend on `core` | Depth |
|---|---|---|---|---|---|---|---|---|
| `n100` | 100 | 8 | 4 | 2 | 68,528 | 32 | 95 | 8 |
| `n1000` | 1,000 | 12 | 4 | 10 | 685,590 | 332 | 926 | 12 |
| `n3000` | 3,000 | 14 | 4 | 30 | 2,057,038 | 898 | 2,819 | 14 |
| `n10000` | 10,000 | 16 | 4 | 100 | 6,857,772 | 2,977 | 9,459 | 16 |
| `n1000-wide` | 1,000 | 4 | 8 | 10 | 689,890 | 311 | 819 | 4 |
| `n1000-deep` | 1,000 | 40 | 3 | 10 | 684,134 | 306 | 984 | 40 |
| `n1000-local` | 1,000 | 12 | 4 | 10 | 685,590 | 332 | 926 | 12 |

Table A.2: The go command, median seconds (compile, link, asm and test processes; a range where runs differed).[^a-results]

| Scenario | `n100` | `n1000` | `n3000` | `n10000` | Runs |
|---|---|---|---|---|---|
| `cold` | 2.77 (213) | 6.86 (1,023) | 27.6 (2,885) | 233 (9,441) | 1 |
| `noop` | 0.20 (0) | 0.86 (0) | 2.45 (0) | 13.6 (0) | 3 |
| `noop-discard` | 0.30 (3–20) | 1.53 (11–131) | 8.88 (31–329) | 104 (101–983) | 3 |
| `leaf-body` | 0.31 (3–5) | 1.28 (3) | 4.66 (3–33) | 11.9 (5) | 3 |
| `core-body` | 0.61 (32) | 2.97 (309) | 14.0 (823–855) | 134 (2,824) | 3 |
| `core-api` | 0.84 (78) | 5.31 (722) | 24.4 (2,193) | 201 (7,453) | 3 |
| `core-comment` | 0.87 (78) | 5.41 (722) | 24.0 (2,193) | 174 (7,453) | 3 |
| `test-first` | 26.0 (486) | 279 (4,132) | 1,313 (12,190) | — | 1 |
| `test-noop` | 0.18 (0) | 1.31 (0) | 9.82 (0) | — | 3 |
| `test-core-body` | 23.8 (256) | 259 (2,501) | 1,157 (7,366) | — | 1 |
| `codegen-generate` | 0.98 | 6.13 | 19.1 | 112 | 2 |
| `codegen-build` | 0.31 (7–11) | 1.48 (17) | 8.07 (38–70) | 96.7 (106) | 2 |
| `clone-warmcache` | 0.73 (92) | 4.98 (902) | 21.7 (2,764) | 195 (9,320) | 1 |
| `clone-warmcache-trimpath` | 0.28 (3) | 1.83 (11) | 10.2 (31) | 124 (101) | 1 |

Table A.3: Bazel, median seconds (processes run; hits in the action cache, or for `clone-diskcache` the disk cache).[^a-results]

| Scenario | `n100` | `n1000` | `n3000` | `n10000` | Runs |
|---|---|---|---|---|---|
| `cold` | 27.8 (106) | 37.4 (999) | 83.6 (3,035) | 318 (10,241) | 1 |
| `noop` | 0.14 | 0.16 | 0.20 | 0.36 | 3 |
| `noop-cold-server` | 2.86 | 3.32 | 4.83 | 13.8 | 3 |
| `analysis-cold-server` | 2.65 | 2.76 | 3.63 | 6.35 | 3 |
| `leaf-body` | 0.51 (2; 1 hit) | 0.88 (2; 1 hit) | 1.91 (2; 1 hit) | 7.60 (3; 2 hits) | 3 |
| `core-body` | 0.53 (3; 29 hits) | 1.71 (11; 298 hits) | 11.6 (31; 792 hits) | 185 (101; 2,723 hits) | 3 |
| `core-api` | 1.02 (32; 48 hits) | 5.05 (309; 423 hits) | 21.0 (823; 1,400 hits) | 215 (2,824; 4,729 hits) | 3 |
| `core-comment` | 0.96 (32; 46 hits) | 5.04 (309; 413 hits) | 20.9 (823; 1,370 hits) | 222 (2,824; 4,629 hits) | 3 |
| `test-first` | 39.8 (621) | 531 (6,142) | 2,774 (18,366) | — | 1 |
| `test-noop` | 0.21 | 0.26 | 0.74 | — | 3 |
| `test-core-body` | 44.9 (198; 133 hits) | 458 (1,868; 1,402 hits) | 2,291 (5,674; 3,773 hits) | — | 1 |
| `codegen-build` | 0.69 (4; 4 hits) | 3.31 (12; 6 hits) | 14.0 (32; 7 hits) | 203 (102; 5 hits) | 2 |
| `clone-diskcache` | 5.76 (0; 106 hits) | 9.45 (0; 999 hits) | 6.43 (0; 3,035 hits) | 11.5 (0; 10,241 hits) | 1 |

Table A.4: Bazel's server heap after garbage collection, in MB.[^a-results]

| Config | After the builds | After the tests |
|---|---|---|
| `n100` | 68 | 74 |
| `n1000` | 84 | 130 |
| `n3000` | 119 | 229 |
| `n10000` | 214 | — |
| `n1000-wide` | 79 | — |
| `n1000-deep` | 84 | — |
| `n1000-local` | 82 | — |

Table A.5: Graph shape and the sandbox at 1,000 packages, median seconds (processes run; hits); `n1000` from the first run, the others rerun.[^a-results]

| Config, tool | `cold` | `noop` | `leaf-body` | `core-body` | `core-api` |
|---|---|---|---|---|---|
| `n1000`, go | 6.86 (1,023) | 0.86 (0) | 1.28 (3) | 2.97 (309) | 5.31 (722) |
| `n1000`, Bazel | 37.4 (999) | 0.16 | 0.88 (2; 1 hit) | 1.71 (11; 298 hits) | 5.05 (309; 423 hits) |
| `n1000-wide`, go | 5.03 (813) | 0.80 (0) | — | 1.78 (212) | 2.80 (498) |
| `n1000-wide`, Bazel | 30.6 (766) | 0.14 (0) | — | 1.39 (11; 201 hits) | 2.65 (212; 296 hits) |
| `n1000-deep`, go | 6.48 (1,055) | 0.80 (0) | — | 2.56 (295) | 4.42 (716) |
| `n1000-deep`, Bazel | 36.9 (1,030) | 0.16 (0) | — | 1.83 (11; 284 hits) | 4.71 (295; 431 hits) |
| `n1000-local`, Bazel | 32.3 (999) | 0.18 (0) | 0.97 (2; 1 hit) | 1.62 (11; 298 hits) | — |

Table A.6: The go command's processes in one cold build and test, as the probe recorded them.[^a-workload]

| Config | Process | Count | Wall, median (ms) | CPU, median (ms) | Peak RSS, median (MB) | Peak RSS, max (MB) | CPU, total (s) |
|---|---|---|---|---|---|---|---|
| `n1000` | compile | 3,079 | 25 | 56 | 42 | 302 | 149.1 |
| `n1000` | asm | 69 | 7 | 5 | 7 | 10 | 0.3 |
| `n1000` | link, binary | 11 | 707 | 792 | 450 | 462 | 8.0 |
| `n1000` | link, test | 1,000 | 112 | 128 | 186 | 378 | 147.2 |
| `n1000` | test run | 1,000 | 5,132 | 5 | 8 | 11 | 4.8 |
| `n3000` | compile | 8,989 | 33 | 55 | 43 | 343 | 441.5 |
| `n3000` | asm | 69 | 5 | 3 | 7 | 10 | 0.2 |
| `n3000` | link, binary | 31 | 3,253 | 2,329 | 1,151 | 1,182 | 69.8 |
| `n3000` | link, test | 3,000 | 243 | 283 | 343 | 929 | 1,100.3 |
| `n3000` | test run | 3,000 | 7,731 | 7 | 10 | 17 | 22.3 |

Table A.7: Configurations measured twice, median seconds, first run / second run.[^a-second]

| Scenario | `n1000`, go | `n1000`, Bazel | `n10000`, go | `n10000`, Bazel |
|---|---|---|---|---|
| `cold` | 6.86 / 7.44 | 37.4 / 48.2 | 233 / 185 | 318 / 375 |
| `noop` | 0.86 / 0.87 | 0.16 / 0.13 | 13.6 / 33.3 | 0.36 / 0.31 |
| `noop-discard` | 1.53 / 1.58 | — | 104 / 127 | — |
| `leaf-body` | 1.28 / 1.36 | 0.88 / 0.88 | 11.9 / 44.0 | 7.60 / 9.23 |
| `core-body` | 2.97 / 3.00 | 1.71 / 1.73 | 134 / 136 | 185 / 192 |
| `core-api` | 5.31 / 4.77 | 5.05 / 5.56 | 201 / 175 | 215 / 227 |
| `core-comment` | 5.41 / 5.43 | 5.04 / 4.75 | 174 / 199 | 222 / 229 |
| `test-first` | 279 / 305 | 531 / 615 | — | — |
| `test-noop` | 1.31 / 1.51 | 0.26 / 0.27 | — | — |
| `test-core-body` | 259 / 275 | 458 / 479 | — | — |
| `codegen-generate` | 6.13 / 9.92 | — | 112 / 188 | — |
| `codegen-build` | 1.48 / 2.24 | 3.31 / 2.40 | 96.7 / 136 | 203 / 197 |
| `clone-warmcache` | 4.98 / 6.07 | — | 195 / 220 | — |
| `clone-warmcache-trimpath` | 1.83 / 2.34 | — | 124 / 116 | — |
| `noop-cold-server` | — | 3.32 / 4.13 | — | 13.8 / 12.5 |
| `analysis-cold-server` | — | 2.76 / 3.43 | — | 6.35 / 5.59 |
| `clone-diskcache` | — | 9.45 / 5.92 | — | 11.5 / 12.0 |

<!-- END -->

The first `noop-discard` also
compiles the packages that no binary imports. Some other go command runs relinked every binary,
some after recompiling every main package: the go command stamped the book's git commit into
each binary (Chapter 4), and we committed during the first run; the harness now sets
`-buildvcs=false`.[^a-goenv] Bazel's analysis-only runs, and the first run's no-ops, show no
count: the pattern missed their summary line.[^a-time]

In our measurements, from 100 to 10,000 packages, the go command's no-op ran no tool, yet took 0.20
s to 13.6 s (33.3 s in the second run), since every run loads and hashes the whole tree (Chapter
4); Bazel's warm no-op took 0.14 s to 0.36 s. Bazel's body edit recompiled only `core` at every
size, yet at 10,000 packages its one compile and 100 links outlasted the go command's 2,724
compiles and 100 links in both runs (Table A.7).

## Limits

- **One machine, not idle:** an Apple M5 Pro with 18 cores and 64 GB of memory, running macOS
  26.6,[^a-meta] shared with our other work,[^a-second] such as `go test -race`. Table A.5's
  variants were rerun under less load.[^a-results]
- **A synthetic repository:** uniform packages, no cgo, no external modules, tests that do almost
  nothing and one code generator. We expect the results' shape, more than their numbers, to
  carry over to real repositories.
- **Local Bazel only:** no remote cache or execution. A local disk cache stands in for a shared
  one, without network time.
- **macOS:** Chapter 5 infers that macOS's check of a newly launched app[^apple-xprotect] slows
  every new test binary's first run.
- **Whole milliseconds:** the first run's probe truncated each process's times to whole
  milliseconds, so the shortest processes read low; it now keeps microseconds.[^a-probe]
- **Few runs:** at most three per scenario. A second run of `n1000` and `n10000` (Table A.7)
  moved three-run medians by up to 1.25 times, except the go command's no-op and leaf edit at
  10,000 packages (2.4 and 3.7), and other cells by up to 1.7.[^a-second]

## Reproduce

The harness needs Go 1.27.3, bazelisk, which reads `.bazelversion` and downloads Bazel 9.3.2, and
`uv` for the analysis script. From the repository's root:

```bash
GOBIN="$PWD/.tools/bin" go install github.com/bazelbuild/bazelisk@v1.30.0
cd examples/bench
go build -o ../../.tools/bin/bench .
../../.tools/bin/bench gen -pkgs 1000 -o /tmp/synth    # one repository, to inspect
out=results/new    # bench run appends to -out's records; the book's are in results/2026-11-16*
flags=(-reps 3 -work work -goroot "$(GOTOOLCHAIN=go1.27.3 go env GOROOT)"
       -bazel "$PWD/../../.tools/bin/bazelisk")
../../.tools/bin/bench run -configs n1000,n100,n3000,n1000-wide,n1000-deep,n1000-local,n10000 \
    "${flags[@]}" -out $out
../../.tools/bin/bench run -configs n1000-wide,n1000-deep,n1000-local \
    "${flags[@]}" -out $out-variants
for c in n1000 n10000; do   # the second run, sampling the machine's load every 30 s
  mkdir -p $out-$c-check
  while :; do
    echo "$(date +%T) $(sysctl -n vm.loadavg) cpu%=$(ps -Ao pcpu= | awk '{s+=$1} END {printf "%.0f", s}')"
    sleep 30
  done > $out-$c-check/load.log &
  ../../.tools/bin/bench run -configs $c "${flags[@]}" -out $out-$c-check
  kill $!
done
uv run analyze.py --appendix $out $out-variants --second $out-n1000-check $out-n10000-check
```

`bench run` writes the records, action graphs and profiles to the `-out` directory, and each
command's output to `work/logs`.[^a-run] Without `--appendix`, `analyze.py` prints Chapter 5's
tables and redraws its figures.

## References

[^a-main]: This book's harness, `examples/bench/main.go`, the command's documentation.
    [main.go](../examples/bench/main.go#L1-L8)
[^a-gen]: This book's harness, `examples/bench/gen.go`, `Shape` and `Repo.write`.
    [gen.go](../examples/bench/gen.go#L15-L27),
    [gen.go](../examples/bench/gen.go#L180-L253)
[^a-plan]: This book's harness, `examples/bench/gen.go`, `Shape.withDefaults` and `plan`.
    [gen.go](../examples/bench/gen.go#L29-L55),
    [gen.go](../examples/bench/gen.go#L79-L138)
[^a-files]: This book's harness, `examples/bench/gen.go`, `Repo.writePkg`, and
    `examples/bench/templates.go`, `typesTmpl`, `editTmpl` and `testTmpl`.
    [gen.go](../examples/bench/gen.go#L255-L362),
    [templates.go](../examples/bench/templates.go#L5-L83),
    [templates.go](../examples/bench/templates.go#L177-L195)
[^a-gentable]: This book's harness, `examples/bench/gen.go`, `Repo.writePkg`, and
    `examples/bench/templates.go`, `genruleTmpl` and `gentableMain`; Bazel, "General Rules",
    section "genrule".
    [gen.go](../examples/bench/gen.go#L335-L351),
    [templates.go](../examples/bench/templates.go#L215-L225),
    [templates.go](../examples/bench/templates.go#L277-L278)
    <https://bazel.build/reference/be/general#genrule>
[^a-configs-run]: This book's harness, `examples/bench/run.go`, `configs`.
    [run.go](../examples/bench/run.go#L28-L38)
[^bazel-spawn]: Bazel, "Commands and Options", section `--spawn_strategy`: "`local` causes
    commands to be executed as local subprocesses".
    <https://bazel.build/docs/user-manual#spawn-strategy>
[^a-run]: This book's harness, `examples/bench/run.go`, `cmdRun`, `harness.runConfig`,
    `harness.edit`, `harness.runGo` and `harness.runBazel`.
    [run.go](../examples/bench/run.go#L68-L298),
    [run.go](../examples/bench/run.go#L357-L620)
[^a-targets]: This book's harness, `examples/bench/gen.go`, `Repo.write`, which writes
    `build_targets.txt`; Go, `cmd/go/internal/work/build.go`, `runBuild`.
    [gen.go](../examples/bench/gen.go#L233-L237)
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/build.go#L510-L531>
[^a-goenv]: This book's harness, `examples/bench/run.go`, `harness.goEnv`, which sets
    `GOFLAGS=-buildvcs=false` since the first run.
    [run.go](../examples/bench/run.go#L305-L324)
[^go-toolchain-local]: Go, `cmd/go/internal/toolchain/select.go`, `Select`: with
    `GOTOOLCHAIN=local`, the running go command handles the command itself.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/toolchain/select.go#L271-L277>
[^rg-from-file]: rules_go, `go/private/go_mod.bzl`, `_version_from_go_file`, which
    `version_from_go_mod` calls; `examples/bench/gen.go`, `Repo.write`, writes `go.mod` and
    `MODULE.bazel`, and `examples/bench/templates.go`, `moduleBazel`, which calls
    `go_sdk.from_file`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/go_mod.bzl#L76-L79>
    [gen.go](../examples/bench/gen.go#L194-L197),
    [templates.go](../examples/bench/templates.go#L244-L250)
[^a-bazel]: This book's harness, `examples/bench/run.go`, `bazelCmd.args` and
    `harness.runBazel`, and `examples/bench/templates.go`, `bazelrc`.
    [run.go](../examples/bench/run.go#L474-L522),
    [templates.go](../examples/bench/templates.go#L253-L256)
[^bazel-rc]: Bazel, `src/main/cpp/option_processor.cc`, `OptionProcessor::GetRcFiles`, which
    reads the system and home `.bazelrc` files unless `--nosystem_rc` and `--nohome_rc` are set.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/cpp/option_processor.cc#L384-L410>
[^a-order]: This book's harness, `examples/bench/run.go`, `cmdRun`.
    [run.go](../examples/bench/run.go#L121-L136)
[^a-time]: This book's harness, `examples/bench/run.go`, `harness.timeCmd`, `goCounts`,
    `bazelCounts` and `bzProcRE`, which since the first run also matches Bazel's "1 process" line,
    though not the "0 processes." line.
    [run.go](../examples/bench/run.go#L300-L355),
    [run.go](../examples/bench/run.go#L444-L465)
[^go-toolexec]: Go, `cmd/go/internal/work/build.go`, the documentation of `-toolexec`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/build.go#L202-L205>
[^go-exec]: Go, `cmd/go/internal/test/test.go`, the documentation of `-exec`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L155-L157>
[^a-probe]: This book's harness, `examples/bench/probe.go`, `cmdToolexec` and `ms`, which since
    the first run records each time to the microsecond, and `examples/bench/run.go`,
    `harness.runWorkload`.
    [probe.go](../examples/bench/probe.go#L21-L67),
    [run.go](../examples/bench/run.go#L633-L662)
[^a-analyze]: This book's analysis script, `examples/bench/analyze.py`, `appendix`, which takes
    the planned scenarios from `run.go`'s `configs`.
    [analyze.py](../examples/bench/analyze.py)
[^a-configs]: This book's measurements, the generated repositories:
    [`examples/bench/results/2026-11-16/configs.jsonl`](../examples/bench/results/2026-11-16/configs.jsonl).
[^a-results]: This book's measurements, one record per command:
    [`examples/bench/results/2026-11-16/results.jsonl`](../examples/bench/results/2026-11-16/results.jsonl);
    `n1000-wide`, `n1000-deep` and `n1000-local` from the rerun, whose pattern also counts Bazel's
    no-op (the first run's medians were 1.5 to 2.4 times the rerun's for cold builds, 9.5 times
    for `n1000-local`'s no-op; the `System load average` counter of Bazel's cold-build profiles
    averaged 47.1 to 68.3 in the first run, 8.7 to 11.0 in the rerun):
    [`examples/bench/results/2026-11-16-variants/results.jsonl`](../examples/bench/results/2026-11-16-variants/results.jsonl).
    Table A.5's `n1000` rows come from the first run, whose Bazel cold build's load averaged 21.4; in
    the second run (Table A.7), at 36.5, their three-run medians moved by at most 1.25 times and
    Bazel's `cold` by 1.29, more than the 1.01 to 1.22 times between it and the variants' Bazel
    `cold`.
[^a-workload]: This book's measurements, one record per process:
    [`examples/bench/results/2026-11-16/workload.jsonl`](../examples/bench/results/2026-11-16/workload.jsonl).
[^a-second]: This book's measurements, a second run of `n1000` and `n10000` with
    `-buildvcs=false`, one record per command, and the machine's load average and the CPU use of
    all its processes every 30 s:
    [`2026-11-16-n1000-check/results.jsonl`](../examples/bench/results/2026-11-16-n1000-check/results.jsonl),
    [`load.log`](../examples/bench/results/2026-11-16-n1000-check/load.log),
    [`2026-11-16-n10000-check/results.jsonl`](../examples/bench/results/2026-11-16-n10000-check/results.jsonl),
    [`load.log`](../examples/bench/results/2026-11-16-n10000-check/load.log).
    The `System load average` counter of Bazel's cold-build profiles averaged 21.4 and 36.5 at
    1,000 packages, 38.6 and 29.6 at 10,000, in the first and second runs. In both runs, at both
    sizes, the go command ran before Bazel.
[^a-meta]: This book's measurements, the machine and Go version:
    [`examples/bench/results/2026-11-16/meta.json`](../examples/bench/results/2026-11-16/meta.json).
[^apple-xprotect]: Apple, *Apple Platform Security*, "Protecting against malware in macOS",
    section "XProtect": XProtect checks for known malicious content when an app is first
    launched or has been changed in the file system.
    <https://support.apple.com/guide/security/protecting-against-malware-sec469d47bd8/web#secffa0f9b55>
