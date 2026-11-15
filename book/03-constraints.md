# 3. Constraints of the setup

A repository that builds with `go build` does not build under Bazel unchanged. Almost every
change follows from four rules of Bazel's design: every input is declared, each action (one tool
run, such as a compile) runs in a sandbox, the graph is declared in BUILD files, and
configuration is explicit. The demonstrations live in `examples/constraints`, a second small
workspace set up like Chapter 2's.

## Every input is declared

![Figure 3.1: The same test under `go test` and under `bazel test`.](figures/03-testdata-sandbox.svg)

Bazel keys each action by its declared inputs and runs it in a *sandbox*, a working directory
that holds only those inputs; an absolute path can still reach the rest of the
machine.[^bazel-sandbox] A file the action reads without declaring it is either missing or
invisible to the cache key. Two Go habits depend on undeclared files.

The first is `//go:embed`. A compile action's source inputs are `srcs` and `embedsrcs`, and
rules_go's builder matches embed patterns against those files alone, so an unlisted file fails
with `could not embed`.[^rg-embedcfg] Gazelle, Chapter 2's BUILD file generator, lists embedded
files for you.

The second is test data. `go test` runs a test in its package's source directory, and the go
tool ignores `testdata/` so tests can keep files there.[^go-test-dir] `bazel test` runs it in a
*runfiles tree*, a directory of links to the test binary and to the files that it and its
dependencies list in `data`.[^bazel-test-encyclopedia] rules_go changes into the package's
directory inside that tree, so `testdata/report.golden` still resolves if it is
declared.[^rg-chdir] Remove the `data` line from `golden/BUILD.bazel` and the test fails, with
or without the sandbox:

```console
$ go test ./golden
ok  	example.com/constraints/golden	(cached)
$ bazel test //golden:golden_test
--- FAIL: TestReport (0.00s)
    golden_test.go:13: open testdata/report.golden: no such file or directory
$ bazel test //golden:golden_test --spawn_strategy=local
    golden_test.go:13: open testdata/report.golden: no such file or directory
```

Gazelle adds `data = glob(["testdata/**"])` to any package with a non-empty `testdata`
directory.[^gz-testdata] Files elsewhere, such as a fixture shared by packages or a tool the test
runs, need hand-written `data` entries, and code finds them through rules_go's runfiles library
by a path that starts with the repository's name, `_main` for the main repository:
`runfiles.Rlocation("_main/testutil/fixture.json")`. Tests and binaries make the same call;
under plain `go` it returns an error.[^rg-runfiles]

## Habits that change

Table 3.1: Each `go` habit beside its Bazel counterpart.

| With `go` | With Bazel |
|---|---|
| `//go:embed` reads files beside the source | the files are listed in `embedsrcs` |
| tests read `testdata/` in the package directory | the files are listed in `data` and read from runfiles |
| the graph is derived from imports | BUILD files declare it; Gazelle writes them and CI checks them |
| `go generate` runs by hand; output is checked in | a `genrule` or a dedicated rule runs the generator in the build |
| cgo calls whatever `CC` names | cgo uses the C toolchain registered with Bazel |
| `GOOS`, `GOARCH` and `-tags` per invocation | `--platforms`, `goos`/`goarch`/`pure` attributes, a tags setting |
| `go test` runs a subset of `go vet` | nogo runs the analyzers you configure |
| `replace`, `GOPRIVATE`, `vendor/` | `go_deps` reads `replace`; `go_deps.config`; Gazelle BUILD files in `vendor/` |
| one front end | two: `go` and `bazel` |

The first two rows are covered above; the rest follow in order.

### BUILD files: a second description of the graph

The go command derives the graph from imports on every run (Chapter 4). Bazel reads it from
BUILD files, so that its server can keep the graph in memory and the graph can hold what imports
cannot express (Chapter 1). Gazelle derives those files from the source and merges them with
what is there: it overwrites the attributes it manages and leaves alone
anything marked `# keep`.[^gz-merge] Directives, comments that Gazelle reads as configuration,
steer it: `# gazelle:resolve` maps an import to a label (a target's name), and
`# gazelle:exclude` skips a path.[^gz-directives]

A stale BUILD file goes unnoticed by `go test` and fails only under Bazel, as above. In diff
mode Gazelle prints what it would change and exits with status 1, which makes it a check for
continuous integration (CI);[^gz-diff] the `gazelle_test` rule wraps the same check as a
test.[^gz-test]

```console
$ bazel run //:gazelle -- -mode=diff; echo "exit=$?"
--- golden/BUILD.bazel
+++ golden/BUILD.bazel
@@ -10,6 +10,7 @@
 go_test(
     name = "golden_test",
     srcs = ["golden_test.go"],
+    data = glob(["testdata/**"]),
     embed = [":golden"],
exit=1
```

### `go generate` becomes a build action

`go generate` never runs during `go build`; it must be run by hand,[^go-generate] so its output
has to be in the source tree before `go build` starts. Because Bazel's graph is declared, the
generator can instead be one more action in it: a `genrule` runs a command with declared tools
and outputs,[^bazel-genrule] and dedicated rules, such as rules_go's `go_proto_library`, cover
common generators.[^rg-proto] Gazelle adds a rule's declared outputs in the same BUILD file to
`srcs`:[^gz-genfiles]

```starlark
genrule(
    name = "gen",
    outs = ["version_gen.go"],
    cmd = "$(execpath //tools/genversion) -o $@",
    tools = ["//tools/genversion"],
)
```

The output is now cached and rebuilt only when the generator or the rule changes. The price is
that plain `go build` no longer sees the file:

```console
$ bazel run //cmd/version
v1.0.0 darwin/arm64
$ go build ./...
# example.com/constraints/version
version/version.go:7:31: undefined: generated
```

### cgo needs a C toolchain

With `go`, cgo, Go's mechanism for calling C, runs whatever compiler `CC` names. Under Bazel the
C compiler is an input like any other, so rules_go compiles cgo code with the C/C++ *toolchain*
(compiler, linker and their flags) registered in Bazel, and turns
cgo off (*pure* mode) when none is configured or when cross-compiling.[^rg-cgo] By default Bazel
configures one automatically by inspecting the host,[^bazel-cc] so cgo works on a laptop. On
macOS even code without cgo goes through it: rules_go builds position-independent executables
there and links them with the C linker,[^rg-pie] which is where these lines in Chapter 2's build
log come from:

```console
INFO: From GoLink cmd/hello/hello_/hello:
ld: warning: ignoring duplicate libraries: '-lm'
```

The race detector needs cgo as well.[^rg-race] In our view, host compilers vary too much between
machines to share a cache safely, so we recommend pinning the C toolchain as firmly as the Go SDK.

### Build tags and platforms

`GOOS`, `GOARCH` and `-tags` belong to one invocation of the go command. In Bazel they are part
of the *configuration*, the settings that shape every action.[^bazel-glossary] `--platforms`
selects the *target platform*, the machine type the output runs on;[^bazel-platforms] a
`go_binary` can fix `goos`, `goarch` or `pure` for itself and its dependencies; and build tags
come from `gotags` or `--@rules_go//go/config:tags`.[^rg-modes] `srcs` lists every file, and the
builder applies build constraints at compile time; only platform-specific dependencies need a
`select()`, an attribute value chosen by the configuration.[^rg-platform-deps]

```console
$ bazel build --platforms=@rules_go//go/toolchain:linux_amd64 //cmd/version
WARNING: Build option --platforms has changed, discarding analysis cache ...
$ file bazel-bin/cmd/version/version_/version
bazel-bin/cmd/version/version_/version: ELF 64-bit LSB executable, x86-64, ... statically linked ...
```

The binary is statically linked because cross-compiling implies pure mode, which turns cgo
off.[^rg-cross] The warning shows the cost of explicit configuration: changing it discards the
server's analysis.

### `go vet` becomes nogo

`go test` runs a high-confidence subset of `go vet` and fails on its findings.[^go-test-vet]
rules_go builds and runs tests with its own actions, not with `go test`, so that step is
gone.[^rg-test-actions] Because every step must be an action in the declared graph, its
counterpart is nogo, a binary built from analyzers you choose. Registered with `go_sdk.nogo`, it
runs as an action beside each compile in the main repository, and a second action fails the
build on any finding.[^rg-nogo] The default nogo analyzes nothing,[^rg-default-nogo] so until
you configure one, Bazel checks less than `go test` does. With `t.Logf("%d bytes", "want")`
added to the test:

```console
$ go test ./golden
golden/golden_test.go:15:10: (*testing.common).Logf format %d has arg "want" of wrong type string
FAIL	example.com/constraints/golden [build failed]
$ bazel test //golden:golden_test
//golden:golden_test                                                     PASSED in 0.3s
```

### Modules: `replace`, private modules, vendoring

Bazel fetches every external repository itself, from declared versions and hashes, so `go_deps`,
Chapter 2's module extension, reproduces the go command's module handling. It applies the root
`go.mod`'s `replace` directives, whether they point at another module version or at a local
directory. It does not support `exclude` directives or fetching from Git.[^gz-replace] It
downloads modules with `go mod download`, passing through `GOPRIVATE`, `GOPROXY`, `GONOSUMDB`,
`GOAUTH` and the Git and SSH settings of the caller's environment;[^gz-fetch-env]
`go_deps.config(go_env = ...)` fixes them in `MODULE.bazel`, and does not affect build
actions.[^rg-go-env] It never reads `vendor/`; Gazelle can instead write BUILD files inside
`vendor/` and resolve imports to them.[^gz-vendor] When a dependency does not build with the
BUILD files Gazelle generates for it, `go_deps.gazelle_override` passes directives for that
module, `go_deps.module_override` applies patches, and `go_deps.archive_override` fetches it
from a URL.[^gz-overrides]

### Two front ends

Developers now have two commands. Plain `go` keeps working as long as `go.mod` holds the
versions and every Go file is in the tree: in `examples/minimal`, `go build`, `go test` and
`go vet` all pass. It stops where Bazel holds something `go` cannot see: generated files that
are not checked in, files found through the runfiles library, and non-Go dependencies.
`bazel run @rules_go//go` runs the SDK's go command, so both front ends can use one Go
version.[^rg-go-tool] We recommend that CI build with Bazel and also run `go vet ./...` and
`go test ./...`, so that the second front end keeps working.

## What this means at scale

- We expect most migration work to be in tests, not in compiling: data files, runfiles and
  fixtures outside `testdata/`.
- Make Gazelle's diff mode a required CI check from the first day; a stale BUILD file passes
  under `go` and fails only under Bazel.
- Decide per generator whether its output is checked in or produced by an action. The first keeps
  `go build` working; the second gives caching and removes stale output.
- Configure nogo with at least the analyzers `go test` runs before dropping `go test` from CI,
  or checks silently disappear.
- Pin the C toolchain before sharing a cache if any package uses cgo or the race detector.

## References

[^bazel-sandbox]: Bazel, "Sandboxing".
    <https://bazel.build/docs/sandboxing>
[^rg-embedcfg]: rules_go, `go/tools/builders/embedcfg.go`, `resolveEmbed`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/embedcfg.go#L279-L282>
[^go-test-dir]: Go, `cmd/go/internal/test/test.go`: the help text on `testdata`, and
    `runTestActor.Act`, which sets the test's working directory to the package directory.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L74-L75>,
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L1673>
[^bazel-test-encyclopedia]: Bazel, "Test encyclopedia": tests access inputs through runfiles,
    and start in `$TEST_SRCDIR/$TEST_WORKSPACE`.
    <https://bazel.build/reference/test-encyclopedia>
[^rg-chdir]: rules_go, `go/tools/bzltestutil/chdir/init.go`, the package comment and `init`;
    `go/private/rules/test.bzl`, `_go_test_impl`, which sets the directory to the test's package.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/bzltestutil/chdir/init.go#L19-L24>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/bzltestutil/chdir/init.go#L77-L106>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L112-L120>
[^gz-testdata]: Gazelle, `language/go/generate.go`, `GenerateRules` and `generateTests`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L110-L127>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L747-L749>
[^rg-runfiles]: rules_go, `go/runfiles/runfiles.go`, `Runfiles.Rlocation`, whose path starts
    with the repository; `go/runfiles/caller_repository_example_test.go`,
    `MyRepoRelativeRlocation`, which names the main repository's directory `_main`;
    `go/runfiles/global.go`, `Rlocation`, which returns the error of `New` when no runfiles are
    found.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/runfiles.go#L154-L157>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/caller_repository_example_test.go#L16-L19>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/global.go#L28-L37>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/global.go#L89-L96>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/runfiles.go#L151>
[^gz-merge]: Gazelle, `how-gazelle-works.md`, "Generate".
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/how-gazelle-works.md#L61-L64>
[^gz-directives]: Gazelle, `gazelle-reference.md`, "Directives".
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md#L159>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md#L185-L187>
[^gz-diff]: Gazelle, `gazelle-reference.md`, `-mode`; `v2/cmd/gazelle/update/diff.go`, `ErrDiff`;
    `cmd/gazelle/main.go`, `main`, which exits with status 1 on `ErrDiff`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md#L53-L59>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/v2/cmd/gazelle/update/diff.go#L30>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/cmd/gazelle/main.go#L92-L95>
[^gz-test]: Gazelle, `def.bzl`, `_gazelle_runner_attr_factory`, whose test runner accepts only
    diff mode, and `gazelle_test`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/def.bzl#L123-L133>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/def.bzl#L246-L271>
[^go-generate]: Go, `cmd/go/internal/generate/generate.go`, the command's help text.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/generate/generate.go#L43-L44>
[^bazel-genrule]: Bazel, "General rules", `genrule`.
    <https://bazel.build/reference/be/general#genrule>
[^rg-proto]: rules_go, `proto/core.rst`, `go_proto_library`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/proto/core.rst#L39-L40>
[^gz-genfiles]: Gazelle, `v2/walk/walk.go`, `findGenFiles`, which reads the `out` and `outs`
    attributes of rules in a BUILD file.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/v2/walk/walk.go#L564-L570>
[^rg-cgo]: rules_go, `docs/go/core/rules.md`, the `cgo` attribute of `go_library` and the `pure`
    attribute of `go_binary`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md#L231>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md#L165>
[^bazel-cc]: rules_cc 0.2.17, the version Chapter 2's build resolved,
    `cc/private/toolchain/cc_configure.bzl`, `cc_autoconf_impl`, which generates a toolchain for
    the host's C compiler unless `BAZEL_DO_NOT_DETECT_CPP_TOOLCHAIN=1`.
    <https://github.com/bazelbuild/rules_cc/blob/0.2.17/cc/private/toolchain/cc_configure.bzl#L60-L71>
[^rg-pie]: rules_go, `go/modes.rst`, `linkmode`; `go/private/actions/link.bzl`, `emit_link`,
    which links externally for any mode other than `normal`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst#L88-L90>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/link.bzl#L97-L120>
[^rg-race]: rules_go, `go/modes.rst`, `race`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst#L58-L59>
[^bazel-glossary]: Bazel, "Glossary": *configuration*.
    <https://bazel.build/reference/glossary>
[^bazel-platforms]: Bazel, "Platforms".
    <https://bazel.build/extending/platforms>
[^rg-modes]: rules_go, `go/modes.rst`, "Overview"; `docs/go/core/rules.md`, the `goarch`, `goos`
    and `gotags` attributes of `go_binary`; `go/config/BUILD.bazel`, the `tags` setting.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst#L26-L38>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md#L158-L160>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/config/BUILD.bazel#L62>
[^rg-platform-deps]: rules_go, `docs/go/core/platform-specific_dependencies.md`;
    `go/tools/builders/filter.go`, `filterAndSplitFiles`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/platform-specific_dependencies.md#L9-L17>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/filter.go#L69-L71>
[^rg-cross]: rules_go, `docs/go/core/cross_compilation.md`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/cross_compilation.md#L19-L21>
[^go-test-vet]: Go, `cmd/go/internal/test/test.go`: the help text, and `defaultVetFlags`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L77-L80>,
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L654>
[^rg-test-actions]: rules_go, `go/private/rules/test.bzl`, `_go_test_impl`, which generates the
    test's main package and links the test binary with the builder.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L122-L146>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L187-L198>
[^rg-nogo]: rules_go, `go/nogo.rst`, "Usage"; `go/private/actions/compilepkg.bzl`, `_run_nogo`,
    which emits the `RunNogo` and `ValidateNogo` actions; `docs/go/core/bzlmod.md`, "Configuring
    `nogo`".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/nogo.rst#L130-L135>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L265-L302>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md#L87-L98>
[^rg-default-nogo]: rules_go, `BUILD.bazel`, `default_nogo`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/BUILD.bazel#L45-L51>
[^gz-replace]: rules_go, `docs/go/core/bzlmod.md`, "`replace`" and "Not yet supported"; Gazelle,
    `internal/bzlmod/go_mod.bzl`, `_parse_replace_directive`, and `internal/bzlmod/go_deps.bzl`,
    `go_deps_impl`, which takes `replace` only from the root module.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md#L290-L300>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md#L375-L378>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_mod.bzl#L296-L334>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L500-L505>
[^gz-fetch-env]: Gazelle, `reference.md`, `go_repository.version`, which downloads with
    `go mod download`; `internal/go_repository.bzl`, `_go_repository_impl`, which passes these
    variables through.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/reference.md#L280>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/go_repository.bzl#L245-L302>
[^rg-go-env]: rules_go, `docs/go/core/bzlmod.md`, "Environment variables".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md#L271-L284>
[^gz-vendor]: Gazelle, `language/go/reference.md`, `importmap_prefix` and `prefix`; `README.md`,
    "Dependency resolution".
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/reference.md#L80>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/reference.md#L86>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/README.md#L295>
[^gz-overrides]: rules_go, `docs/go/core/bzlmod.md`, "Overrides"; Gazelle, `extensions.md`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md#L302-L372>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/extensions.md#L11-L18>
[^rg-go-tool]: rules_go, `docs/go/core/bzlmod.md`, "Using a Go SDK".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md#L74-L80>
