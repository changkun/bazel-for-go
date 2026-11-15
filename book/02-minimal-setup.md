# 2. A minimal Bazel Go repository

`examples/minimal` is one Go module with a command, a library and a test, built with Bazel
9.3.2, rules_go 0.65.0 (Bazel's rules for Go) and Gazelle 0.54.0 (a tool that writes Bazel's
build files from Go source). Every listing is the file as it is in the repository, and every
command was run on macOS/arm64.

## The files

![Figure 2.1: The example's build files and Go sources, the targets they define, and the edges between targets.](figures/02-repository-map.svg)

`MODULE.bazel` declares the repository's external dependencies. A `BUILD.bazel` file makes its
directory a *package* and declares *targets*, the named things Bazel builds.[^bazel-glossary] A
*label* names a target: `//cmd/hello:hello` is target `hello` in package `cmd/hello`, and
`//cmd/hello` is short for it.[^bazel-labels]

### `.bazelversion`

```text
9.3.2
```

Bazelisk, a launcher installed as `bazel`, reads this file and runs that release, downloading it
if needed.[^bazelisk]

### `MODULE.bazel`

```starlark
module(name = "minimal")

bazel_dep(name = "rules_go", version = "0.65.0")
bazel_dep(name = "gazelle", version = "0.54.0")

# The Go SDK version comes from go.mod's toolchain or go line.
go_sdk = use_extension("@rules_go//go:extensions.bzl", "go_sdk")
go_sdk.from_file(go_mod = "//:go.mod")

# Third-party modules come from go.mod and go.sum.
go_deps = use_extension("@gazelle//:extensions.bzl", "go_deps")
go_deps.from_file(go_mod = "//:go.mod")
use_repo(go_deps, "com_github_google_go_cmp")
```

`bazel_dep` adds rules_go and Gazelle. `use_extension` loads a *module extension*, code that
creates external repositories (fetched directories, named `@name`) from *tags*, calls such as
`go_sdk.from_file(...)`.[^bazel-extension] `go_sdk.from_file` takes the Go version from the
`toolchain` line of `go.mod`, or from the `go` line if there is none,[^rg-from-file] downloads
that Go software development kit (SDK) and registers it as Bazel's *toolchain*: the compiler,
linker and standard library every Go target uses. Bazel uses exactly that version; the go
command treats it as a minimum and keeps a newer local Go.[^go-toolchain] `go_deps.from_file`
turns each module in `go.mod` into a repository, verified against `go.sum`.[^gz-go-deps] The
name reverses the domain: `github.com/google/go-cmp` becomes
`com_github_google_go_cmp`.[^gz-repo-name] `use_repo` lists the direct dependencies, and
`bazel mod tidy` keeps that list current.[^rg-bzlmod-use-repo] `MODULE.bazel.lock`, which
belongs in version control, records the resolved Bazel modules and the Go SDK's checksums;
`go.mod` and `go.sum` pin the rest.[^bazel-lockfile]

### `go.mod`

```text
module example.com/minimal

go 1.27.3

require github.com/google/go-cmp v0.7.0
```

`go.mod` is the only list of Go module versions you edit: the go command and Bazel both read it,
so `go get` changes dependencies for both.[^rg-bzlmod-go-mod] `go_deps` also reads the Go
dependencies that other Bazel modules declare (here Gazelle's), takes the highest version of each
module, and warns when that is higher than this file says.[^gz-mvs]

### The root `BUILD.bazel`

```starlark
load("@gazelle//:def.bzl", "gazelle")

gazelle(name = "gazelle")
```

`//:gazelle` runs Gazelle over the repository, taking the root's import path from
`go.mod`.[^gz-prefix]

### The generated `internal/greet/BUILD.bazel`

```starlark
load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "greet",
    srcs = ["greet.go"],
    embedsrcs = ["greeting.tmpl"],
    importpath = "example.com/minimal/internal/greet",
    visibility = ["//:__subpackages__"],
)

go_test(
    name = "greet_test",
    srcs = ["greet_test.go"],
    embed = [":greet"],
    deps = ["@com_github_google_go_cmp//cmp"],
)
```

Gazelle wrote this file from the Go files. Each import outside the standard library became a
`deps` label, and `//go:embed greeting.tmpl` became `embedsrcs`.[^gz-embed] The compile sees only
listed files, so without that line it fails with `could not embed greeting.tmpl: no matching
files found`.[^rg-embedcfg] The test's `embed` attribute (unrelated to `//go:embed`) compiles the
library's sources into the test, as `go test` compiles a test file in the package it tests; in
`cmd/hello`, `go_binary` embeds `hello_lib` the same way.[^rg-embed]

### `.bazelrc`

```text
# Show test output only for failures.
test --test_output=errors
```

`test` lines in `.bazelrc` set defaults for `bazel test`;[^bazel-rc] this one prints a failing
test's log instead of only a summary.[^bazel-test-output]

## Building, testing and running

![Figure 2.2: What happens on `bazel build //cmd/hello`.](figures/02-build-sequence.svg)

The `bazel` command is a client. It hands each command to a long-lived server, starting one if
none is running, and the server keeps the loaded packages and the dependency graph in memory
between commands.[^bazel-client-server] The server works in three phases: *loading* reads BUILD
files, *analysis* turns targets into *actions* (single tool runs, such as one compile), and
*execution* runs the actions whose results are not cached.[^bazel-phases] Each action's process
runs in a sandbox (on macOS, `sandbox-exec`), a working directory that holds only its declared
inputs.[^bazel-sandbox] Chapter 6 explains the machinery, including how the phases overlap.

Gazelle changes nothing when the BUILD files are current:

<!-- rerun: bazel run //:gazelle (confirm it still changes nothing without the gazelle:prefix
directive; refresh the package and target counts) -->

```console
$ bazel run //:gazelle
INFO: Analyzed target //:gazelle (52 packages loaded, 257 targets configured).
INFO: Running command line: bazel-bin/gazelle
```

A clean build of the command runs the five processes of Figure 2.2:

<!-- rerun: bazel clean; bazel build //cmd/hello --execution_log_json_file=/tmp/exec.json;
jq -r '[.mnemonic, .targetLabel, .metrics.totalTime] | @tsv' /tmp/exec.json
(Elapsed 55.112s, Critical Path 52.52s, every per-process time) -->

```console
$ bazel clean
$ bazel build //cmd/hello --execution_log_json_file=/tmp/exec.json
INFO: Analyzed target //cmd/hello:hello (105 packages loaded, 8446 targets configured).
INFO: Elapsed time: 55.112s, Critical Path: 52.52s
INFO: 13 processes: 8 internal, 5 darwin-sandbox.
$ jq -r '[.mnemonic, .targetLabel, .metrics.totalTime] | @tsv' /tmp/exec.json
GoStdlib                @@rules_go+//:stdlib                                         36.688s
GoCompilePkg            //internal/greet:greet                                        0.113s
GoCompilePkg            //cmd/hello:hello                                             0.033s
GoLink                  //cmd/hello:hello                                             0.304s
GoToolchainBinaryBuild  @@rules_go++go_sdk+main___download_0_darwin_arm64//:builder  14.213s
```

Compiling and linking the example's code took under half a second.<!-- rerun: sum of the
GoCompilePkg and GoLink times in the jq output above --> Compiling the standard library and
rules_go's builder, a program that wraps the Go tools, took 51 of the 55 seconds;<!-- rerun:
GoStdlib + GoToolchainBinaryBuild in the jq output vs Elapsed time --> Chapter 7 explains both.
`hello_lib` was not compiled separately, because the binary compiles the sources it embeds.

A new server loads and analyzes again even when every action is cached; a running one does
neither:

<!-- rerun: bazel shutdown && bazel build //cmd/hello (9.320s, 0.07s); bazel build //cmd/hello
(0.170s, 0.00s) -->

```console
$ bazel shutdown && bazel build //cmd/hello
Starting local Bazel server (9.3.2) and connecting to it...
INFO: Analyzed target //cmd/hello:hello (105 packages loaded, 8446 targets configured).
INFO: Elapsed time: 9.320s, Critical Path: 0.07s
INFO: 1 process: 12 action cache hit, 1 internal.
$ bazel build //cmd/hello
INFO: Analyzed target //cmd/hello:hello (0 packages loaded, 0 targets configured).
INFO: Elapsed time: 0.170s, Critical Path: 0.00s
```

`//...` means every target not tagged `manual`; that includes the untagged runner behind
`//:gazelle`, so the first full build also compiles Gazelle.[^bazel-target-patterns][^gz-macro]
By default Bazel reruns a test only if it or its dependencies changed, it failed last time,
it is marked `external`, or `--runs_per_test` asks for several runs.[^bazel-cache-tests] On this
Mac the first run of the new test binary took 8.4 s and a forced rerun 0.1 s;<!-- rerun: first
bazel test //... and bazel test //... --nocache_test_results; isolate the first-launch cost by
copying bazel-bin/internal/greet/greet_test_/greet_test to a new path and timing two launches -->
we attribute the difference to macOS scanning a new executable on its first launch. Chapter 5
returns to that first-launch cost.

<!-- rerun: bazel build //... (47.101s, 46.63s, process counts); bazel test //... (8.4s);
bazel test //... (cached); bazel test //... --nocache_test_results (0.1s);
bazel run //cmd/hello -- Ada -->

```console
$ bazel build //...
INFO: Analyzed 5 targets (64 packages loaded, 311 targets configured).
INFO: Elapsed time: 47.101s, Critical Path: 46.63s
INFO: 109 processes: 6 action cache hit, 32 internal, 77 darwin-sandbox.
$ bazel test //...
//internal/greet:greet_test                                              PASSED in 8.4s
$ bazel test //...
//internal/greet:greet_test                                     (cached) PASSED in 8.4s
Executed 0 out of 1 test: 1 test passes.
$ bazel test //... --nocache_test_results
//internal/greet:greet_test                                              PASSED in 0.1s
$ bazel run //cmd/hello -- Ada
INFO: Running command line: bazel-bin/cmd/hello/hello_/hello <args omitted>
Hello, Ada!
```

### gopls

gopls, Go's language server (the process behind an editor's completion and diagnostics), learns
about packages by running `go list`. If `GOPACKAGESDRIVER` names a program, gopls asks that
program instead.[^xtools-driver][^rg-editors] The example's launcher is the one rules_go's editor
guide gives, plus a comment:

```bash
#!/usr/bin/env bash
# gopls asks this script for package data instead of running "go list".
exec bazel run -- @rules_go//go/tools/gopackagesdriver "${@}"
```

The driver queries Bazel for the targets that contain a file, then builds them with an *aspect*
(extra actions attached to existing targets) that writes each package's files and imports as
JSON.[^rg-driver] Calling it directly, as the guide suggests for debugging, shows both
steps:[^rg-editors-debug]

```console
$ echo {} | ./tools/gopackagesdriver.sh file=internal/greet/greet.go
Running: [bazel query ... same_pkg_direct_rdeps("internal/greet/greet.go"))]
Running: [bazel build ... --aspects=@@rules_go+//go/tools/gopackagesdriver:aspect.bzl%go_pkg_info_aspect ... @@//internal/greet:greet]
{"NotHandled":false,"Compiler":"","Arch":"","Roots":["@@//internal/greet:greet"],"Packages":[...]}
```

With `b.String()` changed to `b.Len()` in `greet.go`, gopls reported the type error through the
driver:

```console
$ GOPACKAGESDRIVER=$PWD/tools/gopackagesdriver.sh gopls check internal/greet/greet.go
.../internal/greet/greet.go:21:9-16: cannot use b.Len() (value of type int) as string value in return statement
```

Editors set the same variable; rules_go's guide covers six editors and warns that the first load
takes time.[^rg-editors-setup]

## What this means at scale

- `go.mod` remains the one list of Go versions you edit, for the SDK and every module. We
  recommend `go_deps.config(check_direct_dependencies = "error")`, so a build fails, rather than
  warns, when another Bazel module raises a version.[^gz-mvs] With `.bazelversion` and a
  checked-in `MODULE.bazel.lock`, every machine resolves the same build.
- A clean build here spent 51 of 55 seconds on the toolchain, not the code.<!-- rerun: bazel
  clean; bazel build //cmd/hello, as above --> Every fresh machine pays that again unless a
  shared cache serves it, so we recommend one from the start (Chapter 9).
- A server restart repeats loading and analysis even when every action is cached. We recommend
  keeping servers warm on continuous integration (CI) runners as well as laptops.
- BUILD files are generated. Run `bazel run //:gazelle` with every change that adds a package or
  an import; Chapter 3 adds a CI check.
- gopls keeps working, but each package load is a Bazel command and a server runs one command at
  a time,[^bazel-client-server] so a long build delays the editor (Chapter 9).

## References

[^bazel-glossary]: Bazel, "Glossary": *package*, *target*, *toolchain*.
    <https://bazel.build/reference/glossary>
[^bazel-labels]: Bazel, "Labels".
    <https://bazel.build/concepts/labels>
[^bazelisk]: Bazel, "Installing Bazel using Bazelisk".
    <https://bazel.build/install/bazelisk>
[^bazel-extension]: Bazel, "Module extensions".
    <https://bazel.build/external/extension>
[^rg-from-file]: rules_go, `go/private/go_mod.bzl`, `_version_from_go_file`, which
    `version_from_go_mod` calls.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/go_mod.bzl#L76-L79>
[^go-toolchain]: Go, `cmd/go/internal/toolchain/select.go`, `Select`, which switches away from
    the local toolchain only to a newer version.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/toolchain/select.go#L202-L217>
[^gz-go-deps]: Gazelle, `internal/bzlmod/go_deps.bzl`, `go_deps_impl`, which declares one
    `go_repository` per module with its version and sum; `cmd/fetch_repo/module.go`,
    `fetchModule`, which has `go mod download` verify the sum.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L802-L814>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/cmd/fetch_repo/module.go#L47-L48>
[^gz-repo-name]: Gazelle, `internal/bzlmod/go_deps.bzl`, `_repo_name`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L190-L194>
[^rg-bzlmod-use-repo]: rules_go, `docs/go/core/bzlmod.md`, "Specifying external dependencies".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L155-L166>
[^bazel-lockfile]: Bazel, "Bazel Lockfile", "Module Extensions" and "Best Practices"; rules_go,
    `go/private/extensions.bzl`, `_go_sdk_impl`, which keeps the SDK checksums in the lockfile;
    Gazelle, `internal/bzlmod/go_deps.bzl`, `go_deps_impl`, which returns `reproducible = True`.
    <https://bazel.build/external/lockfile>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/extensions.bzl#L205-L207>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L895>
[^rg-bzlmod-go-mod]: rules_go, `docs/go/core/bzlmod.md`, "Specifying external dependencies".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L146-L147>
[^gz-mvs]: Gazelle, `internal/bzlmod/go_deps.bzl`, `go_deps_impl`, which keeps the highest
    version of each module across the Bazel modules that use `go_deps`, prints the root module's
    implicit upgrades, and fails instead when `check_direct_dependencies = "error"`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L596>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L737-L739>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L418-L424>
[^gz-prefix]: Gazelle, `language/go/config.go`, `Configure`, which reads the module path from
    `go.mod` when no directive sets the prefix.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/config.go#L747-L760>
[^gz-embed]: Gazelle, `language/go/fileinfo.go`, `goFileInfo`, which reads `//go:embed`
    patterns; `language/go/generate.go`, `setCommonAttrs`, which writes `embedsrcs`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/fileinfo.go#L312-L328>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L827-L828>
[^rg-embedcfg]: rules_go, `go/tools/builders/embedcfg.go`, `resolveEmbed`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/embedcfg.go#L279-L282>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/embedcfg.go#L362>
[^rg-embed]: rules_go, `docs/go/core/rules.md`, the `embed` attributes of `go_binary` and
    `go_test`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L153>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L409>
[^bazel-rc]: Bazel, "Write bazelrc configuration files", "Option defaults".
    <https://bazel.build/run/bazelrc#option-defaults>
[^bazel-test-output]: Bazel, `ExecutionOptions.java`, the `test_output` option, default
    `summary`.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/exec/ExecutionOptions.java#L272-L273>
[^bazel-client-server]: Bazel, "Client/server implementation".
    <https://bazel.build/run/client-server>
[^bazel-phases]: Bazel, "Build programs with Bazel", "Phases of a build".
    <https://bazel.build/run/build#build-phases>
[^bazel-sandbox]: Bazel, "Sandboxing".
    <https://bazel.build/docs/sandboxing>
[^bazel-target-patterns]: Bazel, "Build programs with Bazel", "Specifying targets to build".
    <https://bazel.build/run/build#specifying-build-targets>
[^gz-macro]: Gazelle, `def.bzl`, `gazelle`: the runner rule is untagged, the `sh_binary` that
    wraps it is tagged `manual`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/def.bzl#L225-L244>
[^bazel-cache-tests]: Bazel, `TestConfiguration.java`, the `cache_test_results` option.
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/analysis/test/TestConfiguration.java#L169-L183>
[^xtools-driver]: golang.org/x/tools at the commit gopls v0.24.0 is built from,
    `go/packages/doc.go`, "The driver protocol".
    <https://github.com/golang/tools/blob/24a65270771e7a9b6b3385b45eefaf454a2439d2/go/packages/doc.go#L82-L87>
[^rg-editors]: rules_go, `docs/editors.md`, "General setup".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/editors.md?plain=1#L3-L4>
[^rg-driver]: rules_go, `go/tools/gopackagesdriver/bazel_json_builder.go`, `fileQuery` and
    `Build`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/gopackagesdriver/bazel_json_builder.go#L80>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/gopackagesdriver/bazel_json_builder.go#L205-L213>
[^rg-editors-debug]: rules_go, `docs/editors.md`, "Debugging".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/editors.md?plain=1#L338-L343>
[^rg-editors-setup]: rules_go, `docs/editors.md`, "Editor Setup".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/editors.md?plain=1#L31-L34>
