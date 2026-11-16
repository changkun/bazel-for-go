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
rules_go's builder (the program that wraps the Go tools) matches embed patterns against
`embedsrcs` alone, so an unlisted file fails with `could not embed`.[^rg-embedcfg] Gazelle,
Chapter 2's BUILD file generator, lists embedded files for you.[^gz-embedsrcs]

The second is test data. `go test` runs a test in its package's source directory, and the go
tool ignores `testdata/` so tests can keep files there.[^go-test-dir] `bazel test` runs it in a
*runfiles tree*, a directory holding the test binary and the files that it and its
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

Gazelle adds `data = glob(["testdata/**"])` to a package's `go_test` when `testdata` is non-empty
and not a Go package.[^gz-testdata] Files elsewhere, such as a fixture shared by packages or a
tool the test runs, need hand-written `data` entries, and code finds them through rules_go's
runfiles library by a path that starts with the repository's name, `_main` for the main repository:
`runfiles.Rlocation("_main/testutil/fixture.json")`. Tests and binaries make the same call;
under plain `go` it returns an error.[^rg-runfiles]

## Habits that change

Table 3.1: Each `go` habit beside its Bazel counterpart.

| With `go` | With Bazel |
|---|---|
| `//go:embed` reads files beside the source | the files are listed in `embedsrcs` |
| tests read `testdata/` in the package directory | the files are listed in `data` and read from runfiles |
| the graph is derived from imports | BUILD files declare it; Gazelle writes them and continuous integration (CI) checks them |
| `go generate` runs by hand; output is checked in | a `genrule` or a dedicated rule runs the generator in the build |
| cgo (Go code calling C) uses whatever `CC` names | cgo uses the C toolchain registered with Bazel |
| `GOOS`, `GOARCH` and `-tags` per invocation | `--platforms`, `goos`/`goarch`/`pure` attributes, a tags setting |
| `go test` runs a subset of `go vet` | nogo runs the analyzers you configure |
| `replace`, `GOPRIVATE`, `vendor/` | `go_deps` reads `replace`; `go_deps.config`; Gazelle BUILD files in `vendor/` |
| one front end | two: `go` and `bazel` |

### BUILD files: a second description of the graph

The go command derives the graph from imports on every run (Chapter 4). Bazel reads it from
BUILD files, so that its server can keep the graph in memory and the graph can hold what imports
cannot express (Chapter 1). Gazelle derives those files from the source and merges them with
what is there: it overwrites the attributes it manages and leaves alone
anything marked `# keep`.[^gz-merge] Directives, comments that Gazelle reads as configuration,
steer it: `# gazelle:resolve` maps an import to a label (a target's name), and
`# gazelle:exclude` skips a path.[^gz-directives]

A stale BUILD file goes unnoticed by `go test` and fails only under Bazel, as above. In diff
mode Gazelle prints what it would change and, if anything would, exits with status 1, which
makes it a CI check;[^gz-diff] the `gazelle_test` rule wraps the same check as a
test, one that cannot be cached.[^gz-test]

```console
$ bazel run //:gazelle -- -mode=diff; echo "exit=$?"
--- golden/BUILD.bazel	1970-01-01 …
+++ golden/BUILD.bazel	1970-01-01 …
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

With `go`, cgo runs whatever compiler `CC` names.[^go-cgo-cc] Under Bazel, rules_go compiles cgo
code with the C/C++ *toolchain* (compiler, linker and their flags) registered in Bazel, and turns
cgo off (*pure* mode) when no C toolchain matches the target platform or the platform is marked
`cgo_off`.[^rg-cgo] By default rules_cc configures one from the host's compiler,[^bazel-cc] so cgo
works on a laptop, but Bazel does not track tools outside the workspace, such as that compiler
(Chapter 9).[^bazel-cache-issues] On macOS even code without cgo goes through it: rules_go builds
position-independent executables there and links them with the C linker,[^rg-pie] which is why
building Chapter 2's `cmd/hello` on macOS prints:

```console
INFO: From GoLink cmd/hello/hello_/hello:
ld: warning: ignoring duplicate libraries: '-lm'
```

Under rules_go, the race detector needs cgo as well.[^rg-race] Since the host compiler is outside
the cache key, we recommend pinning the C toolchain as firmly as the Go SDK (software
development kit) before sharing a cache.

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

The binary is statically linked because rules_go's `linux_amd64` platform carries a `cgo_off`
constraint, which selects pure mode; `linux_amd64_cgo` would need a C cross-toolchain.[^rg-cross]
The warning shows the cost of explicit configuration: changing it makes the server analyze every
target the build needs again.[^bazel-analysis-cache]

### `go vet` becomes nogo

`go test` runs a high-confidence subset of `go vet` and fails on its findings.[^go-test-vet]
rules_go builds and runs tests with its own actions, not with `go test`, so that step is
gone.[^rg-test-actions] Its counterpart is nogo, a binary built from analyzers (individual
checks, like vet's) you choose. Registered with `go_sdk.nogo`, it runs as an action beside each
compile, by default in the main repository, and a second action fails the build on any
finding.[^rg-nogo] The default nogo analyzes nothing,[^rg-default-nogo] and `vet = True` adds
only five of the twelve that `go test` runs,[^rg-nogo-vet] so until you list them, Bazel checks
less than `go test` does. With `t.Logf("%d bytes", "want")` added to the test:

```console
$ go test ./golden
golden/golden_test.go:15:10: (*testing.common).Logf format %d has arg "want" of wrong type string
FAIL	example.com/constraints/golden [build failed]
$ bazel test //golden:golden_test
//golden:golden_test                                                     PASSED in 0.3s
```

### Modules: `replace`, private modules, vendoring

`go_deps`, Chapter 2's module extension, reproduces part of the go command's module handling. It
applies the root `go.mod`'s `replace` directives, whether they point at another module version
or at a local directory, ignores `exclude` directives, and cannot point a module at a Git
remote.[^gz-replace] It downloads each module with `go mod download`, passing through
`GOPRIVATE`, `GOPROXY`, `GOAUTH` and your shell's Git, SSH and proxy settings; your shell's
values win over `go_deps.config(go_env = ...)` in `MODULE.bazel`.[^gz-fetch-env] `go_env` does
not affect build actions.[^rg-go-env] `go_deps` ignores `vendor/` and downloads modules; Gazelle
can instead write BUILD files inside `vendor/` and resolve imports to them.[^gz-vendor] When a
dependency does not build with the BUILD files Gazelle generates for it,
`go_deps.gazelle_override` passes directives for that module, `go_deps.module_override` applies
patches, and `go_deps.archive_override` fetches it from a URL.[^gz-overrides]

### Two front ends

Plain `go` keeps working as long as `go.mod` holds the versions and every Go file is in the
tree; here, `go build ./...` fails only in `version` and the packages that import it. It stops
where Bazel holds something `go` cannot see: generated files that are not checked in, files
found through the runfiles library, and non-Go dependencies.
`bazel run @rules_go//go` runs the SDK's go command, so both front ends can use one Go
version.[^rg-go-tool] We recommend that CI build with Bazel and also run `go vet` and `go test`
over the packages that need no Bazel-only input (or that generated files be checked in), so
that the second front end keeps working.

## What this means at scale

- We expect most migration work to be in tests, not in compiling: data files, runfiles and
  fixtures outside `testdata/`.
- Make Gazelle's diff mode a required CI check from the first day; a stale BUILD file passes
  under `go` and fails only under Bazel.
- Decide per generator whether its output is checked in or produced by an action. The first keeps
  `go build` working; the second gives caching and removes stale output.
- Configure nogo with all twelve analyzers `go test` runs, not just the five of `vet = True`,
  or checks silently disappear.
- Pin the C toolchain before sharing a cache if any package uses cgo or the race detector, or
  any binary is linked on macOS.

## References

[^bazel-sandbox]: Bazel, "Sandboxing".
    <https://bazel.build/docs/sandboxing>
[^rg-embedcfg]: rules_go, `go/tools/builders/embedcfg.go`, `buildEmbedcfgFile`, which builds the
    tree of embeddable files from `embedsrcs` only, and `resolveEmbed`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/embedcfg.go#L72>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/embedcfg.go#L279-L282>
[^gz-embedsrcs]: Gazelle, `language/go/generate.go`, `setCommonAttrs`, which sets `embedsrcs`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L828>
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
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L112-L163>
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
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/how-gazelle-works.md?plain=1#L61-L64>
[^gz-directives]: Gazelle, `gazelle-reference.md`, "Directives".
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L159>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L185-L187>
[^gz-diff]: Gazelle, `gazelle-reference.md`, `-mode`; `v2/cmd/gazelle/update/diff.go`, `ErrDiff`;
    `cmd/gazelle/main.go`, `main`, which exits with status 1 on `ErrDiff`.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L53-L59>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/v2/cmd/gazelle/update/diff.go#L30>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/cmd/gazelle/main.go#L92-L95>
[^gz-test]: Gazelle, `def.bzl`, `_gazelle_runner_attr_factory`, whose test runner accepts only
    diff mode, and `gazelle_test`; `README.md`: "gazelle_test cannot be cached".
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/def.bzl#L123-L133>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/def.bzl#L246-L271>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/README.md?plain=1#L171>
[^go-generate]: Go, `cmd/go/internal/generate/generate.go`, the command's help text.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/generate/generate.go#L43-L44>
[^bazel-genrule]: Bazel, "General rules", `genrule`.
    <https://bazel.build/reference/be/general#genrule>
[^rg-proto]: rules_go, `proto/core.rst`, `go_proto_library`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/proto/core.rst?plain=1#L39-L40>
[^gz-genfiles]: Gazelle, `v2/walk/walk.go`, `findGenFiles`, which reads the `out` and `outs`
    attributes of rules in a BUILD file; `language/go/generate.go`, `GenerateRules`, which adds
    those files to the package unless another rule consumes them.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/v2/walk/walk.go#L564-L570>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L327-L335>
[^go-cgo-cc]: Go, `cmd/cgo/doc.go`, the package documentation on the `CC` and `CXX` environment
    variables.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/cgo/doc.go#L110-L112>
[^rg-cgo]: rules_go, `docs/go/core/rules.md`, the `cgo` attribute of `go_library` and the `pure`
    attribute of `go_binary`; `go/private/context.bzl`, `go_context`, which disables cgo on a
    `cgo_off` platform or when no C toolchain resolves.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L231>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L165>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/context.bzl#L626-L629>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/context.bzl#L653-L656>
[^bazel-cc]: rules_cc 0.2.17, the version Chapter 2's build resolved,
    `cc/private/toolchain/cc_configure.bzl`, `cc_autoconf_impl`, which generates a toolchain for
    the host's C compiler unless `BAZEL_DO_NOT_DETECT_CPP_TOOLCHAIN=1`.
    <https://github.com/bazelbuild/rules_cc/blob/0.2.17/cc/private/toolchain/cc_configure.bzl#L60-L71>
[^bazel-cache-issues]: Bazel, "Remote Caching", "Known issues": "Bazel does not track tools outside
    a workspace".
    <https://bazel.build/remote/caching#known-issues>
[^rg-pie]: rules_go, `go/modes.rst`, `linkmode`; `go/private/actions/link.bzl`, `emit_link`,
    which, outside pure mode and with a C linker present, links externally for any mode other
    than `normal`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst?plain=1#L88-L90>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/link.bzl#L97-L120>
[^rg-race]: rules_go, `go/modes.rst`, `race`; `go/private/mode.bzl`, `validate_mode`, which
    rejects race in pure mode.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst?plain=1#L58-L59>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/mode.bzl#L63-L65>
[^bazel-glossary]: Bazel, "Glossary": *configuration*.
    <https://bazel.build/reference/glossary#configuration>
[^bazel-platforms]: Bazel, "Platforms".
    <https://bazel.build/extending/platforms>
[^rg-modes]: rules_go, `go/modes.rst`, "Overview"; `docs/go/core/rules.md`, the `goarch`, `goos`
    and `gotags` attributes of `go_binary`; `go/config/BUILD.bazel`, the `tags` setting.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst?plain=1#L26-L38>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L158-L160>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/config/BUILD.bazel#L62>
[^rg-platform-deps]: rules_go, `docs/go/core/platform-specific_dependencies.md`;
    `go/tools/builders/filter.go`, `filterAndSplitFiles`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/platform-specific_dependencies.md?plain=1#L9-L17>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/filter.go#L69-L71>
[^rg-cross]: rules_go, `docs/go/core/cross_compilation.md`; `go/private/platforms.bzl`,
    `_generate_platforms`, which marks each plain platform `cgo_off` and its `_cgo` twin `cgo_on`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/cross_compilation.md?plain=1#L19-L27>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/platforms.bzl#L185>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/platforms.bzl#L206>
[^bazel-analysis-cache]: Bazel, "Optimize Iteration Speed", "Running Bazel Iteratively": many flags
    discard the analysis cache, and the next run analyzes again;
    `src/main/java/com/google/devtools/build/lib/skyframe/SkyframeBuildView.java`,
    `shouldDiscardAnalysisCache`, which discards it when the build options differ.
    <https://bazel.build/advanced/performance/iteration-speed#run-iteratively>,
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/skyframe/SkyframeBuildView.java#L321-L342>
[^go-test-vet]: Go, `cmd/go/internal/test/test.go`: the help text, and `defaultVetFlags`, which
    enables twelve analyzers; the help text omits `slog`.
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L77-L82>,
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L654-L692>
[^rg-test-actions]: rules_go, `go/private/rules/test.bzl`, `_go_test_impl`, which generates the
    test's main package and links the test binary with the builder.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L122-L146>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L187-L198>
[^rg-nogo]: rules_go, `go/nogo.rst`, "Usage"; `go/private/actions/compilepkg.bzl`, `_run_nogo`,
    which emits the `RunNogo` and `ValidateNogo` actions; `docs/go/core/bzlmod.md`, "Configuring
    `nogo`".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/nogo.rst?plain=1#L130-L135>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L265-L302>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L87-L98>
[^rg-default-nogo]: rules_go, `BUILD.bazel`, `default_nogo`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/BUILD.bazel#L45-L51>
[^rg-nogo-vet]: rules_go, `go/private/rules/nogo.bzl`, `nogo_wrapper`, which for `vet = True` adds
    `atomic`, `bools`, `buildtag`, `nilfunc` and `printf`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/nogo.bzl#L155-L165>
[^gz-replace]: rules_go, `docs/go/core/bzlmod.md`, "`replace`" and "Not yet supported"; Gazelle,
    `internal/bzlmod/go_mod.bzl`, `_parse_replace_directive`, and `_parse_directive`, which skips
    `exclude`; `internal/bzlmod/go_deps.bzl`, `go_deps_impl`, which takes `replace` only from the
    root module; `cmd/fetch_repo/main.go`, `main`, which rejects a Git remote in module mode.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_mod.bzl#L294>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/cmd/fetch_repo/main.go#L96-L102>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L290-L300>,
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L375-L378>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_mod.bzl#L296-L334>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L500-L505>
[^gz-fetch-env]: Gazelle, `reference.md`, `go_repository.version`, which downloads with
    `go mod download`; `internal/go_repository.bzl`, `_go_repository_impl`, which loads the
    `go_env` file and then overwrites these variables from the caller's environment.
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/reference.md?plain=1#L280>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/go_repository.bzl#L238-L244>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/go_repository.bzl#L245-L302>
[^rg-go-env]: rules_go, `docs/go/core/bzlmod.md`, "Environment variables".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L271-L284>
[^gz-vendor]: Gazelle, `internal/bzlmod/go_deps.bzl`, `go_deps_impl`, which takes modules from
    `go.mod` and declares a `go_repository` for each; `language/go/reference.md`,
    `importmap_prefix` and `prefix`; `README.md`, "Dependency resolution".
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L472>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L802-L814>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/reference.md?plain=1#L80>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/reference.md?plain=1#L86>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/README.md?plain=1#L295>
[^gz-overrides]: rules_go, `docs/go/core/bzlmod.md`, "Overrides"; Gazelle, `extensions.md`.
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L302-L372>,
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/extensions.md?plain=1#L11-L18>
[^rg-go-tool]: rules_go, `docs/go/core/bzlmod.md`, "Using a Go SDK".
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L74-L80>
