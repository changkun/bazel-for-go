# 3. 这套搭建带来的约束
<!-- 译自 d9d1c21 -->

一个能用 `go build` 构建的仓库，不加修改无法在 Bazel 下构建。需要做的改动几乎都源自
Bazel 设计中的四条规则：每个输入都要声明；每个动作（action，即一次工具运行，例如一次编译）
都在沙箱中运行；图在 BUILD 文件中声明；配置是显式的。本章的演示位于 `examples/constraints`，
这是第二个小型工作区，搭建方式与第 2 章的相同。

## 每个输入都要声明

![图 3.1：同一个测试分别在 `go test` 与 `bazel test` 下运行。](../figures/03-testdata-sandbox.svg)

Bazel 用每个动作声明的输入计算它的键，并在*沙箱*（sandbox）中运行它。
沙箱是一个只包含这些输入的工作目录；但借助绝对路径，动作仍能访问机器上的其余部分。[^bazel-sandbox]
动作读取了却没有声明的文件，要么读不到，要么不计入缓存键。Go 有两个习惯依赖未声明的文件。

第一个是 `//go:embed`。编译动作的源文件输入是 `srcs` 与 `embedsrcs`，而 rules_go 的构建器（builder）
只用 `embedsrcs` 匹配嵌入模式，因此未列出的文件会以 `could not embed` 报错。[^rg-embedcfg]
Gazelle（第 2 章介绍的 BUILD 文件生成器）会代为列出被嵌入的文件。[^gz-embedsrcs]

第二个是测试数据。`go test` 在包的源码目录中运行测试，而 go 命令会忽略 `testdata/`，
测试因此可以把文件放在那里。[^go-test-dir]`bazel test` 则在 *runfiles 目录树*（runfiles tree）
中运行测试：这是一个由链接组成的目录，链接指向测试二进制，以及测试和它的依赖在 `data`
中列出的文件。[^bazel-test-encyclopedia]rules_go 会切换到该目录树中对应包的目录，因此只要声明了
`testdata/report.golden`，这个路径仍然能够解析。[^rg-chdir]从 `golden/BUILD.bazel` 中删掉
`data` 这一行，无论是否使用沙箱，测试都会失败：

```console
$ go test ./golden
ok  	example.com/constraints/golden	(cached)
$ bazel test //golden:golden_test
--- FAIL: TestReport (0.00s)
    golden_test.go:13: open testdata/report.golden: no such file or directory
$ bazel test //golden:golden_test --spawn_strategy=local
    golden_test.go:13: open testdata/report.golden: no such file or directory
```

当 `testdata` 非空且不是 Go 包时，Gazelle 会在该包的 `go_test` 中加入
`data = glob(["testdata/**"])`。[^gz-testdata]其他位置的文件，
例如多个包共用的测试夹具，或者测试要运行的工具，需要手写 `data` 条目；
代码则通过 rules_go 的 runfiles 库找到它们，所用的路径以仓库名开头，主仓库的名字是 `_main`：
`runfiles.Rlocation("_main/testutil/fixture.json")`。测试与二进制的调用方式相同；
只用 `go` 时，这个调用返回错误。[^rg-runfiles]

## 需要改变的习惯

表 3.1：`go` 的每个习惯及其在 Bazel 中的对应做法。

| 使用 `go` | 使用 Bazel |
|---|---|
| `//go:embed` 读取源文件旁边的文件 | 这些文件列在 `embedsrcs` 中 |
| 测试读取包目录中的 `testdata/` | 这些文件列在 `data` 中，从 runfiles 读取 |
| 图由导入推导得出 | BUILD 文件声明图；Gazelle 生成这些文件，持续集成（CI）检查它们 |
| `go generate` 手动运行；输出提交到仓库 | 由 `genrule` 或专用规则在构建中运行代码生成器 |
| cgo（调用 C 的 Go 代码）使用 `CC` 指定的任何编译器 | cgo 使用在 Bazel 中注册的 C 工具链 |
| 每次调用各自指定 `GOOS`、`GOARCH` 与 `-tags` | `--platforms`、`goos`/`goarch`/`pure` 属性、一个构建标签设置 |
| `go test` 运行 `go vet` 的一个子集 | nogo 运行所配置的分析器 |
| `replace`、`GOPRIVATE`、`vendor/` | `go_deps` 读取 `replace`；`go_deps.config`；Gazelle 在 `vendor/` 中生成的 BUILD 文件 |
| 一个前端 | 两个：`go` 与 `bazel` |

### BUILD 文件：图的第二份描述

go 命令在每次运行时都从导入推导图（第 4 章）。Bazel 则从 BUILD 文件读取图，
这样它的服务进程（server）可以把图保存在内存中，图也能容纳导入无法表达的内容（第 1 章）。
Gazelle 从源码推导出这些文件，并与已有内容合并：它覆盖自己管理的属性，
不改动任何标有 `# keep` 的内容。[^gz-merge]指令（directive）是 Gazelle 作为配置读取的注释，
用来引导它的行为：`# gazelle:resolve` 把一个导入映射到一个标签（label，即目标的名称），
`# gazelle:exclude` 则跳过一个路径。[^gz-directives]

过时的 BUILD 文件不会被 `go test` 察觉，只会在 Bazel 下失败，如上例所示。在 diff 模式下，
Gazelle 打印它将做出的修改，只要有修改就以状态码 1 退出，因此可以充当 CI 检查；[^gz-diff]
`gazelle_test` 规则把同一项检查包装成一个测试，而这个测试无法缓存。[^gz-test]

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

### `go generate` 变成构建动作

`go generate` 从不在 `go build` 期间运行，必须手动运行，[^go-generate]因此它的输出必须在
`go build` 开始之前就已位于源码树中。由于 Bazel 的图来自声明，代码生成器可以改为图中的又一个动作：
`genrule` 用声明的工具和输出运行一条命令，[^bazel-genrule]专用规则（例如 rules_go 的
`go_proto_library`）则覆盖常见的代码生成器。[^rg-proto]
Gazelle 会把同一 BUILD 文件中规则声明的输出加入 `srcs`：[^gz-genfiles]

```starlark
genrule(
    name = "gen",
    outs = ["version_gen.go"],
    cmd = "$(execpath //tools/genversion) -o $@",
    tools = ["//tools/genversion"],
)
```

输出现在会被缓存，只在代码生成器或规则改变时才重新构建。代价是单纯的 `go build` 再也看不到这个文件：

```console
$ bazel run //cmd/version
v1.0.0 darwin/arm64
$ go build ./...
# example.com/constraints/version
version/version.go:7:31: undefined: generated
```

### cgo 需要 C 工具链

使用 `go` 时，cgo 运行 `CC` 所指定的任何编译器。在 Bazel 下，rules_go 用 Bazel 中注册的
C/C++ *工具链*（toolchain，即编译器、链接器及其标志）编译 cgo 代码；当没有与目标平台匹配的
C 工具链，或者平台标记为 `cgo_off` 时，它会关闭 cgo（即 *pure* 模式）。[^rg-cgo]默认情况下，
rules_cc 根据主机的编译器配置一个 C 工具链，[^bazel-cc]因此 cgo 在笔记本电脑上可以工作；
但 Bazel 不追踪工作区之外的工具，例如这个编译器（第 9 章）。[^bazel-cache-issues]在 macOS 上，
即使不用 cgo 的代码也要经过 C 工具链：rules_go 在 macOS 上构建位置无关可执行文件（PIE），
并用 C 链接器链接它们，[^rg-pie]这就是在 macOS 上构建第 2 章的 `cmd/hello` 时会打印如下内容的原因：

```console
INFO: From GoLink cmd/hello/hello_/hello:
ld: warning: ignoring duplicate libraries: '-lm'
```

在 rules_go 下，竞态检测器同样需要 cgo。[^rg-race]由于主机的编译器不在缓存键之内，
笔者建议在共享缓存之前，像固定 Go SDK（软件开发包）那样严格地固定 C 工具链。

### 构建标签与平台

`GOOS`、`GOARCH` 与 `-tags` 属于 go 命令的某一次调用。
在 Bazel 中，它们是*配置*（configuration）的一部分，即影响每个动作的那组设置。[^bazel-glossary]
`--platforms` 选择*目标平台*（target platform），即输出所运行的机器类型；[^bazel-platforms]
`go_binary` 可以为自身及其依赖固定 `goos`、`goarch` 或 `pure`；构建标签则来自
`gotags` 或 `--@rules_go//go/config:tags`。[^rg-modes]
`srcs` 列出所有文件，由构建器在编译时应用构建约束；只有平台相关的依赖才需要 `select()`，
即一个由配置选定的属性值。[^rg-platform-deps]

```console
$ bazel build --platforms=@rules_go//go/toolchain:linux_amd64 //cmd/version
WARNING: Build option --platforms has changed, discarding analysis cache ...
$ file bazel-bin/cmd/version/version_/version
bazel-bin/cmd/version/version_/version: ELF 64-bit LSB executable, x86-64, ... statically linked ...
```

这个二进制是静态链接的，因为 rules_go 的 `linux_amd64` 平台带有 `cgo_off` 约束，从而选择了
pure 模式；`linux_amd64_cgo` 则需要 C 交叉工具链。[^rg-cross]那条警告体现了显式配置的代价：
配置一旦改变，服务进程就要重新分析每个目标。

### `go vet` 变成 nogo

`go test` 会运行 `go vet` 中一个高置信度的子集，并在发现问题时失败。[^go-test-vet]
rules_go 用自己的动作构建和运行测试，而不是用 `go test`，因此这一步不复存在。[^rg-test-actions]
与之对应的是 nogo：一个由所选分析器（analyzer，即与 vet 中类似的单项检查）构建而成的二进制。
用 `go_sdk.nogo` 注册之后，它作为一个动作在主仓库中每个编译动作旁边运行，
另一个动作则在发现任何问题时使构建失败。[^rg-nogo]默认的 nogo 什么也不分析，[^rg-default-nogo]
而 `vet = True` 只加入了 `go test` 所运行的十二个分析器中的五个，[^rg-nogo-vet]
因此在逐一列出这些分析器之前，Bazel 所做的检查比 `go test` 少。
在测试中加入 `t.Logf("%d bytes", "want")` 后：

```console
$ go test ./golden
golden/golden_test.go:15:10: (*testing.common).Logf format %d has arg "want" of wrong type string
FAIL	example.com/constraints/golden [build failed]
$ bazel test //golden:golden_test
//golden:golden_test                                                     PASSED in 0.3s
```

### 模块：`replace`、私有模块与 vendor

`go_deps` 是第 2 章介绍的模块扩展，它复现了 go 命令模块处理的一部分。它应用根 `go.mod` 中的
`replace` 指令，无论这些指令指向另一个模块版本还是本地目录；它忽略 `exclude` 指令，
也无法把依赖固定到某个 Git 提交。[^gz-replace]它用 `go mod download` 下载每个模块，
并传入 `GOPRIVATE`、`GOPROXY`、`GOAUTH` 以及调用者的 Git 与 SSH 设置，借助这些设置克隆私有模块；
调用者的值优先于 `MODULE.bazel` 中的 `go_deps.config(go_env = ...)`。[^gz-fetch-env]`go_env`
不影响构建动作。[^rg-go-env]`go_deps` 忽略 `vendor/` 并获取每个模块；Gazelle 则可以改为在
`vendor/` 中写入 BUILD 文件，并把导入解析到它们。[^gz-vendor]当某个依赖无法用 Gazelle
为它生成的 BUILD 文件构建时，`go_deps.gazelle_override` 为该模块传入指令，
`go_deps.module_override` 应用补丁，`go_deps.archive_override` 则从一个 URL 获取它。[^gz-overrides]

### 两个前端

只要 `go.mod` 记录了版本，并且每个 Go 文件都在源码树中，单纯的 `go` 就能继续工作；在本例中，
`go build ./...` 只在 `version` 以及导入它的包中失败。它止步于 Bazel 持有而 `go`
看不到的东西：未提交到仓库的生成文件、通过 runfiles 库找到的文件，以及非 Go 依赖。
`bazel run @rules_go//go` 运行 Go SDK 中的 go 命令，因此两个前端可以使用同一个 Go 版本。[^rg-go-tool]
笔者建议，CI 用 Bazel 构建，同时对不需要任何 Bazel 专属输入的包运行
`go vet` 与 `go test`（或者把生成文件提交到仓库），从而让第二个前端保持可用。

## 规模变大时意味着什么

- 笔者预计，大部分迁移工作在测试而不在编译：数据文件、runfiles，以及 `testdata/` 之外的测试夹具。
- 从第一天起就把 Gazelle 的 diff 模式设为必需的 CI 检查；过时的 BUILD 文件在 `go` 下能够通过，
  只在 Bazel 下失败。
- 针对每个代码生成器分别决定，它的输出是提交到仓库，还是由动作生成。前者让 `go build` 保持可用；
  后者带来缓存，并消除过时的输出。
- 为 nogo 配置 `go test` 运行的全部十二个分析器，而不只是 `vet = True` 的五个，
  否则一些检查会悄无声息地消失。
- 只要有包使用 cgo 或竞态检测器，或者有二进制在 macOS 上链接，就应在共享缓存之前固定 C 工具链。

## 参考文献

[^bazel-sandbox]: Bazel，「Sandboxing」。
    <https://bazel.build/docs/sandboxing>
[^rg-embedcfg]: rules_go，`go/tools/builders/embedcfg.go`，`buildEmbedcfgFile`（它只根据
    `embedsrcs` 构建可嵌入文件的树）与 `resolveEmbed`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/embedcfg.go#L72>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/embedcfg.go#L279-L282>
[^gz-embedsrcs]: Gazelle，`language/go/generate.go`，`setCommonAttrs`，它设置 `embedsrcs`。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L828>
[^go-test-dir]: Go，`cmd/go/internal/test/test.go`：关于 `testdata` 的帮助文本，以及
    `runTestActor.Act`，它把测试的工作目录设为包目录。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L74-L75>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L1673>
[^bazel-test-encyclopedia]: Bazel，「Test encyclopedia」：测试通过 runfiles 访问输入，
    并从 `$TEST_SRCDIR/$TEST_WORKSPACE` 开始运行。
    <https://bazel.build/reference/test-encyclopedia>
[^rg-chdir]: rules_go，`go/tools/bzltestutil/chdir/init.go`，包注释与 `init`；
    `go/private/rules/test.bzl`，`_go_test_impl`，它把目录设为测试所在的包。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/bzltestutil/chdir/init.go#L19-L24>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/bzltestutil/chdir/init.go#L77-L106>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L112-L163>
[^gz-testdata]: Gazelle，`language/go/generate.go`，`GenerateRules` 与 `generateTests`。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L110-L127>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/generate.go#L747-L749>
[^rg-runfiles]: rules_go，`go/runfiles/runfiles.go`，`Runfiles.Rlocation`，其路径以仓库开头；
    `go/runfiles/caller_repository_example_test.go`，`MyRepoRelativeRlocation`，
    它把主仓库的目录命名为 `_main`；`go/runfiles/global.go`，`Rlocation`，
    在找不到 runfiles 时，它返回 `New` 的错误。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/runfiles.go#L154-L157>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/caller_repository_example_test.go#L16-L19>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/global.go#L28-L37>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/global.go#L89-L96>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/runfiles/runfiles.go#L151>
[^gz-merge]: Gazelle，`how-gazelle-works.md`，「Generate」。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/how-gazelle-works.md?plain=1#L61-L64>
[^gz-directives]: Gazelle，`gazelle-reference.md`，「Directives」。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L159>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L185-L187>
[^gz-diff]: Gazelle，`gazelle-reference.md`，`-mode`；`v2/cmd/gazelle/update/diff.go`，`ErrDiff`；
    `cmd/gazelle/main.go`，`main`，它在遇到 `ErrDiff` 时以状态码 1 退出。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/gazelle-reference.md?plain=1#L53-L59>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/v2/cmd/gazelle/update/diff.go#L30>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/cmd/gazelle/main.go#L92-L95>
[^gz-test]: Gazelle，`def.bzl`，`_gazelle_runner_attr_factory`（其测试运行器只接受 diff 模式）
    与 `gazelle_test`；`README.md`：「gazelle_test 无法被缓存」。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/def.bzl#L123-L133>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/def.bzl#L246-L271>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/README.md?plain=1#L171>
[^go-generate]: Go，`cmd/go/internal/generate/generate.go`，该命令的帮助文本。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/generate/generate.go#L43-L44>
[^bazel-genrule]: Bazel，「General rules」，`genrule`。
    <https://bazel.build/reference/be/general#genrule>
[^rg-proto]: rules_go，`proto/core.rst`，`go_proto_library`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/proto/core.rst?plain=1#L39-L40>
[^gz-genfiles]: Gazelle，`v2/walk/walk.go`，`findGenFiles`，它读取 BUILD 文件中各条规则的
    `out` 与 `outs` 属性。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/v2/walk/walk.go#L564-L570>
[^rg-cgo]: rules_go，`docs/go/core/rules.md`，`go_library` 的 `cgo` 属性与 `go_binary` 的 `pure`
    属性；`go/private/context.bzl`，`go_context`，
    它在 `cgo_off` 平台上或无法解析出 C 工具链时禁用 cgo。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L231>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L165>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/context.bzl#L626-L629>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/context.bzl#L653-L656>
[^bazel-cc]: rules_cc 0.2.17，即第 2 章的构建解析到的版本，`cc/private/toolchain/cc_configure.bzl`，
    `cc_autoconf_impl`，除非设置了 `BAZEL_DO_NOT_DETECT_CPP_TOOLCHAIN=1`，
    它会为主机的 C 编译器生成一个工具链。
    <https://github.com/bazelbuild/rules_cc/blob/0.2.17/cc/private/toolchain/cc_configure.bzl#L60-L71>
[^bazel-cache-issues]: Bazel，「Remote Caching」，「Known issues」一节：
    「Bazel 不追踪工作区之外的工具」。
    <https://bazel.build/remote/caching#known-issues>
[^rg-pie]: rules_go，`go/modes.rst`，`linkmode`；`go/private/actions/link.bzl`，`emit_link`，
    在非 pure 模式下且存在 C 链接器时，它对 `normal` 以外的任何模式都使用外部链接。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst?plain=1#L88-L90>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/link.bzl#L97-L120>
[^rg-race]: rules_go，`go/modes.rst`，`race`；`go/private/mode.bzl`，`validate_mode`，
    它在 pure 模式下拒绝 race。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst?plain=1#L58-L59>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/mode.bzl#L63-L65>
[^bazel-glossary]: Bazel，「Glossary」：*configuration*。
    <https://bazel.build/reference/glossary#configuration>
[^bazel-platforms]: Bazel，「Platforms」。
    <https://bazel.build/extending/platforms>
[^rg-modes]: rules_go，`go/modes.rst`，「Overview」；`docs/go/core/rules.md`，`go_binary` 的
    `goarch`、`goos` 与 `gotags` 属性；`go/config/BUILD.bazel`，`tags` 设置。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/modes.rst?plain=1#L26-L38>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/rules.md?plain=1#L158-L160>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/config/BUILD.bazel#L62>
[^rg-platform-deps]: rules_go，`docs/go/core/platform-specific_dependencies.md`；
    `go/tools/builders/filter.go`，`filterAndSplitFiles`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/platform-specific_dependencies.md?plain=1#L9-L17>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/filter.go#L69-L71>
[^rg-cross]: rules_go，`docs/go/core/cross_compilation.md`；`go/private/platforms.bzl`，
    `_generate_platforms`，它把每个普通平台标记为 `cgo_off`，把对应的 `_cgo` 平台标记为 `cgo_on`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/cross_compilation.md?plain=1#L19-L27>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/platforms.bzl#L185>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/platforms.bzl#L206>
[^go-test-vet]: Go，`cmd/go/internal/test/test.go`：帮助文本，以及 `defaultVetFlags`，
    它启用十二个分析器；帮助文本未列出 `slog`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L77-L82>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L654-L692>
[^rg-test-actions]: rules_go，`go/private/rules/test.bzl`，`_go_test_impl`，它生成测试的 main 包，
    并用构建器链接测试二进制。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L122-L146>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/test.bzl#L187-L198>
[^rg-nogo]: rules_go，`go/nogo.rst`，「Usage」；`go/private/actions/compilepkg.bzl`，`_run_nogo`，
    它生成 `RunNogo` 与 `ValidateNogo` 两个动作；`docs/go/core/bzlmod.md`，「Configuring `nogo`」。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/nogo.rst?plain=1#L130-L135>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L265-L302>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L87-L98>
[^rg-default-nogo]: rules_go，`BUILD.bazel`，`default_nogo`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/BUILD.bazel#L45-L51>
[^rg-nogo-vet]: rules_go，`go/private/rules/nogo.bzl`，`nogo_wrapper`，对于 `vet = True`，它加入
    `atomic`、`bools`、`buildtag`、`nilfunc` 与 `printf`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/rules/nogo.bzl#L155-L165>
[^gz-replace]: rules_go，`docs/go/core/bzlmod.md`，「`replace`」与「Not yet supported」；Gazelle，
    `internal/bzlmod/go_mod.bzl`，`_parse_replace_directive`，以及跳过 `exclude` 的 `_parse_directive`；
    `internal/bzlmod/go_deps.bzl`，`go_deps_impl`，它只从根模块获取 `replace`；
    `cmd/fetch_repo/main.go`，`main`，它在模块模式下拒绝 Git 远程仓库。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_mod.bzl#L294>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/cmd/fetch_repo/main.go#L96-L102>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L290-L300>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L375-L378>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_mod.bzl#L296-L334>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L500-L505>
[^gz-fetch-env]: Gazelle，`reference.md`，`go_repository.version`，它用 `go mod download` 下载；
    `internal/go_repository.bzl`，`_go_repository_impl`，它先加载 `go_env` 文件，
    再用调用者环境中的值覆盖这些变量。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/reference.md?plain=1#L280>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/go_repository.bzl#L238-L244>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/go_repository.bzl#L245-L302>
[^rg-go-env]: rules_go，`docs/go/core/bzlmod.md`，「Environment variables」。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L271-L284>
[^gz-vendor]: Gazelle，`internal/bzlmod/go_deps.bzl`，`go_deps_impl`，它从 `go.mod` 获取模块，
    并为每个模块声明一个 `go_repository`；`language/go/reference.md`，`importmap_prefix` 与 `prefix`；
    `README.md`，「Dependency resolution」。
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L472>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/internal/bzlmod/go_deps.bzl#L802-L814>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/reference.md?plain=1#L80>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/language/go/reference.md?plain=1#L86>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/README.md?plain=1#L295>
[^gz-overrides]: rules_go，`docs/go/core/bzlmod.md`，「Overrides」；Gazelle，`extensions.md`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L302-L372>，
    <https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/extensions.md?plain=1#L11-L18>
[^rg-go-tool]: rules_go，`docs/go/core/bzlmod.md`，「Using a Go SDK」。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/docs/go/core/bzlmod.md?plain=1#L74-L80>
