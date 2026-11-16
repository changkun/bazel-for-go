# 5. 工具链的负载
<!-- 译自 c8cebc2 -->

go 命令与 rules_go 运行的是同一批程序：编译器、链接器、汇编器、cgo（让 Go 代码调用 C 的工具）和测试二进制。本章测量每种程序
消耗多少资源、这一消耗如何增长，以便第 9 章把每种程序放到合适的机器上。

笔者对仓库中的二进制做了一次冷构建（cold build，缓存为空），并运行了 `go test ./...`，二者都经过一个包装程序
（`-toolexec` 与 `-exec`），由它记录每个进程的墙钟时间、CPU 时间（用户态加内核态）和峰值 RSS
（resident set size，常驻内存集：进程在同一时刻占用的最多物理内存）。这个合成仓库有 1000 个包，每个
约 690 行，分为 12 层（附录 A），在一台运行 macOS 26.6 的 18 核 Apple M5 Pro 上构建。[^m-meta]图 5.3
和以整个动作（构建的步骤，例如一次编译）计的耗时则另取自附录 A 中计时的运行，不经过包装
程序。[^m-graph][^m-profile]经过包装的构建耗时 13.4 s，计时的构建为 6.9 s。[^m-results]

## compile：每个包一个进程

![图 5.1：一次编译。前端串行执行，随后由 -c 个工作 goroutine 编译各个函数。](../figures/05-compile.svg)

编译器每个进程编译一个包。[^go-compile-doc]它的前端除解析外都是串行的，解析为每个文件使用一个
goroutine：[^go-parse]前端对包做类型检查、内联函数调用，并运行逃逸分析（escape analysis），由它决定
哪些值可以留在栈上。[^go-frontend]随后，后端在 `-c` 个工作 goroutine 上编译各个函数，最长的函数
最先编译，[^go-backend]进程最后写出归档（archive，即存放在一个文件中的包的编译代码）。[^go-dumpobj]
除了自身的源文件，一次编译还要读取每个直接导入的导出数据（export data，即编译器写出、供导入者读取的
概要，描述包中导出的类型与函数）。[^go-importcfg]

go 命令最多同时运行 `-p` 个动作，其默认值是 `GOMAXPROCS`，即同时运行 Go 代码的线程数（此处
每个 CPU 一个）。[^go-gomaxprocs]它从一个共享池中为每次编译分配 `-c`，池中共有 2×`GOMAXPROCS` +
4×`-p` 个令牌，此处为 108 个：池中令牌扣除为尚未启动的编译预留的部分后，每次分配剩余数量的一半，
至少为 4，至多为 `GOMAXPROCS`。[^go-token-pool]rules_go 不传 `-c`，[^rules-go-compilego]因此每次编译为每个 CPU 启动一个
工作 goroutine；[^go-lowerc]而 Bazel 的调度器把每个 rules_go 动作（它们都不声明资源）计为一个
CPU 和 250 MB。[^bazel-resources]这样，在 Bazel 下，18 次编译可能启动 324 个后端工作 goroutine，而在
go 命令下至多 108 个；笔者没有测量其影响。

编译本书合成仓库中的一个包，所用 CPU 时间与内存的中位数分别为 61 ms 和 45 MB，`-c` 在 4 至 18
之间。[^m-workload]总体而言，这些编译的 CPU 时间约等于墙钟时间。按笔者的理解，小包的编译以串行的
前端为主，而在繁忙的机器上，多出的工作 goroutine 找不到空闲的核心。有空闲的核心时，后端确实有帮助：
运行时包是代价最高的编译，它较早运行，`-c=18`：其动作在 0.67 s 内用了 2.05 s 的 CPU
时间，[^m-graph]内存为 302 MB。[^m-workload]

## link：每个二进制一个进程

![图 5.2：左图为一次构建与测试中每个编译和链接的峰值内存与墙钟时间。右图为每个测试链接与其链接的仓库包数的关系，限于构建的动作图给出了这一数目的链接。](../figures/05-process-cost.svg)

链接器的输入是二进制中的每一个包。go 命令在链接的导入配置中列出每个传递依赖，[^go-link-deps]
rules_go 则把每个传递依赖的归档以及标准库都声明为链接动作的输入。[^rules-go-link-inputs]链接器
加载所有这些输入，丢弃不可达的代码，然后写出二进制；只有少数阶段（例如写出输出）使用多个
goroutine。[^go-link-phases]

go 命令那次构建中的 11 次链接（其中十次各链接约 730 个仓库包）[^m-graph]峰值内存的中位数为
450 MB：是一次编译的十倍，CPU 时间是墙钟时间的 1.1 倍。[^m-workload]测试二进制在链接时不带调试
信息，[^go-test-strip]它们显示了链接如何增长（图 5.2 右）：链接的仓库包不超过 10 个时，中位数为
96 MB 和 59 ms；超过 300 个时，为 282 MB 和 172 ms。[^m-workload][^m-graph]二进制中任何一个包改变，链接都要
重新运行：[^go-linkactionid]对 `core`（被导入最广的包，第 4 章）做一次函数体修改（body edit），两种工具都重新链接了
全部十个应用。[^m-results][^m-profile]

在 macOS 上，两种工具都构建位置无关可执行文件（position-independent executable，PIE，即可以加载到
任意地址的二进制）。Go 自己的链接器写出这种文件，[^go-internal-pie]但除非关闭 cgo，rules_go 会把
每次 PIE 链接都交给 C 工具链的链接器。[^rules-go-pie]在冷构建中以整个动作计时（同时还有其他工作在
运行），链接耗时的中位数在 Bazel 下为 2.3 s，在 go 命令下为 0.63 s。[^m-profile][^m-graph]这一差距
可能包含 C 链接器、Bazel 的沙箱（sandbox，只含一个动作所声明输入的目录）和 rules_go 的构建器（builder，
包装每次编译与链接的程序）的影响；笔者没有把它们区分开。

## asm 与 cgo

汇编器对每个汇编文件运行一次，在此之前先对所有汇编文件扫描一遍以收集符号。[^go-asm]这里只有标准库
含有汇编：共 69 个进程，耗时与内存的中位数为 7 ms 和 7 MB。[^m-workload]

对于 cgo，go 命令先运行 cgo 工具，再把每个 C 文件作为单独的动作编译，然后编译
Go 代码。[^go-cgo]rules_go 在一个编译动作内完成全部这些工作。[^rules-go-cgo]本书的合成仓库不含 cgo。

## 测试二进制：一次链接加一次运行

每个包的测试先被编译，再链接成独立的二进制，然后运行。本书的测试几乎不做什么：一次运行的 CPU 时间
中位数为 5 ms，耗时的中位数却为 5.1 s。[^m-workload]最先结束的 18 次运行（与同时运行的数目相同）每一次都比前
一次多花约 0.22 s，[^m-workload]而计时运行的 `go test ./...` 运行 1000 个二进制共耗时 279 s，每个
0.28 s，[^m-results]就好像这些运行在进程之外的同一个队列里等待。macOS 会在应用首次启动时检查其中是否含有已知的恶意
软件；[^apple-xprotect]笔者推断，这项检查依次施加于每个新的测试二进制，它就是那个队列；笔者还预计
Linux 机器不会付出这一代价。Bazel 的首次测试运行耗时 531 s，尽管其最长的依赖动作链用了
13.3 s。[^m-results]以整个动作计时，它的测试链接耗时中位数为 1.4 s，测试运行为 7.5 s，而 go 命令的
相应进程分别为 0.11 s 和 5.1 s。[^m-test-profile][^m-workload]

## vet、nogo 与代码生成器

`go vet` 每个包运行一个进程，并且要在其导入包的 vet 进程之后运行，因为它要读取这些进程写出的事实
（fact，即一项分析从一个包传给其导入者的结果）。[^go-vet]`go test` 默认运行 vet 检查的一个
子集；[^go-test-vet]笔者的测量关闭了这些检查。nogo 是 rules_go 中与之对应的工具，配置之后，它是每个包
一个独立的动作，读取源文件以及直接导入的导出数据和事实。[^rules-go-nogo]

`go build` 从不运行 `go generate`，后者也没有缓存；[^go-generate]重新运行仓库中的 100 条
`go:generate` 指令耗时 6.1 s。[^m-results]在 Bazel 下，生成器作为一个动作运行，[^bazel-genrule]像其他动作一样被
缓存。[^bazel-actions]

## 构建的形状

![图 5.3：go 命令一次冷构建中运行的动作；下方的条标出它的关键路径。](../figures/05-build-shape.svg)

一次构建完成所需的时间不可能短于它的关键路径（critical path，即其中每个动作都要等待前一个动作的
最长动作链），也不可能短于总 CPU 工作量除以核心数。在 go 命令的冷构建中（图 5.3），各动作合计用了 59 s
的 CPU 时间，摊到 18 个核心上为 3.3 s，关键路径为 3.6 s，但这些动作跨越了 5.7 s。[^m-graph]关键
路径始于标准库，其中仅运行时包的编译动作就用了 0.67 s；随后经过 `core`、12 层中每层的一个包和一个
main 包，最后止于一次 0.91 s 的链接。笔者把条中的空隙理解为等待：此时关键路径之外的工作占满了
go 命令全部 18 个动作槽位。

Bazel 的冷构建关键路径更长，为 29.9 s，其中 24.2 s 用于构建 rules_go 的构建器和标准库。[^m-profile]

## 四类负载

![图 5.4：四类负载，各类进程做什么，代价随什么增长，以及在笔者看来各需要什么样的机器。](../figures/05-classes.svg)

- **compile**：大量短小的 CPU 密集型进程，前端串行。
- **link**：每个二进制一个进程，大部分时间在一个核心上运行，随所链接的包增长。
- **test**：一次链接加一次运行，运行时长由测试本身决定；在 macOS 上，启动前还要等待。
- **Bazel 服务进程**（server）：每个工作区一个 Java 虚拟机（Java virtual machine，JVM），在内存中保存图。[^bazel-server]
  它的堆在构建完二进制后为 84 MB，运行完测试后增长到 130 MB。[^m-results]

## 规模变大时意味着什么

- 按核心数配置编译机器，按最大的二进制配置链接机器：一次链接所需的内存在 1000 个包时是一次编译的
  十倍，在 3000 个包时是 22 倍。[^m-workload]
- 增加核心数只能把冷构建加速到其关键路径为止；超过这一点，只有缩短关键路径才有帮助，而在 Bazel 下，
  这要从 rules_go 的构建器和标准库入手。
- 链接了仓库大部分内容的二进制几乎每次修改后都要重新链接；在满足用途的前提下，让二进制尽可能小。
- 在 Bazel 下，编译器可能用满每个核心，而调度器只为每次编译计一个 CPU；第 9 章介绍如何使二者一致。
- 在 macOS 上，笔者推断，包含许多包的测试套件要为每个二进制付出一次启动开销，增加核心数无法减少这一
  开销。笔者建议在 Linux 上运行大型测试套件。

## 参考文献

[^m-meta]: 测量数据，机器与版本：
    [`examples/bench/results/2026-11-16/meta.json`](../../examples/bench/results/2026-11-16/meta.json)；
    仓库的形态：
    [`configs.jsonl`](../../examples/bench/results/2026-11-16/configs.jsonl)。
[^m-graph]: 测量数据，冷构建中 go 命令的动作图：
    [`examples/bench/results/2026-11-16/n1000-go-cold-actiongraph.json.gz`](../../examples/bench/results/2026-11-16/n1000-go-cold-actiongraph.json.gz)。
[^m-profile]: 测量数据，Bazel 对冷构建和 core 函数体修改的 JSON 追踪剖面：
    [`examples/bench/results/2026-11-16/n1000-bazel-cold.profile.gz`](../../examples/bench/results/2026-11-16/n1000-bazel-cold.profile.gz)，
    [`n1000-bazel-core-body.profile.gz`](../../examples/bench/results/2026-11-16/n1000-bazel-core-body.profile.gz)。
[^m-results]: 测量数据，每条命令一条记录：
    [`examples/bench/results/2026-11-16/results.jsonl`](../../examples/bench/results/2026-11-16/results.jsonl)。
[^go-compile-doc]: Go，`cmd/compile/doc.go`，包文档。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/doc.go#L6>
[^go-parse]: Go，`cmd/compile/internal/noder/noder.go`，`LoadPackage`，它在各自的 goroutine 中解析
    每个文件。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/noder/noder.go#L27-L61>
[^go-frontend]: Go，`cmd/compile/internal/gc/main.go`，`Main`：解析与类型检查、内联、逃逸分析。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/gc/main.go#L217-L294>
[^go-backend]: Go，`cmd/compile/internal/gc/compile.go`，`compileFunctions`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/gc/compile.go#L132-L159>
[^go-dumpobj]: Go，`cmd/compile/internal/gc/main.go`，`Main`，写出目标数据的部分。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/gc/main.go#L377-L381>
[^go-importcfg]: Go，`cmd/go/internal/work/exec.go`，`Builder.build`，导入配置。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L881-L887>
[^go-gomaxprocs]: Go，`runtime/debug.go`，`GOMAXPROCS`：默认值取决于「机器上的逻辑 CPU 数」、「进程的
    CPU 亲和性掩码」，以及在 Linux 上「基于 cgroup CPU 配额的进程平均 CPU 吞吐量上限」。
    <https://github.com/golang/go/blob/go1.27.3/src/runtime/debug.go#L12-L30>
[^go-token-pool]: Go，`cmd/go/internal/work/gc.go`，`compilerConcurrency` 与
    `initCompilerConcurrencyPool`；`cmd/go/internal/cfg/cfg.go`，`BuildP`，`-p` 的默认值。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/gc.go#L182-L253>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cfg/cfg.go#L87>
[^rules-go-compilego]: rules_go，`go/tools/builders/compilepkg.go`，`compileGo`；以及
    `go/private/actions/compilepkg.bzl`，`emit_compilepkg`，即该动作。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/compilepkg.go#L560-L585>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L201-L210>
[^go-lowerc]: Go，`cmd/compile/internal/base/flag.go`，`ParseFlags`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/compile/internal/base/flag.go#L161>
[^bazel-resources]: Bazel，`AbstractAction.java`，`DEFAULT_RESOURCE_SET`；以及
    `SpawnAction.java`，除非规则自行设定，否则它使用该值。
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/actions/AbstractAction.java#L70-L78>，
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/java/com/google/devtools/build/lib/analysis/actions/SpawnAction.java#L623>
[^m-workload]: 测量数据，`n1000` 与 `n3000` 经包装的构建与测试中每个进程一条记录：
    [`examples/bench/results/2026-11-16/workload.jsonl`](../../examples/bench/results/2026-11-16/workload.jsonl)，
    由 [`examples/bench/analyze.py`](../../examples/bench/analyze.py) 汇总。
[^go-link-deps]: Go，`cmd/go/internal/work/action.go`，`addTransitiveLinkDeps`；以及
    `exec.go`，`writeLinkImportcfg`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/action.go#L1034-L1046>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L1670-L1678>
[^rules-go-link-inputs]: rules_go，`go/private/actions/link.bzl`，`emit_link`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/link.bzl#L217-L227>
[^go-link-phases]: Go，`cmd/link/internal/ld/main.go`，`Main`；`dwarf.go` 与 `data.go`，其中的并行
    部分。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/link/internal/ld/main.go#L367-L374>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/link/internal/ld/dwarf.go#L2264-L2265>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/link/internal/ld/data.go#L1170-L1175>
[^go-test-strip]: Go，`cmd/go/internal/test/test.go`，`OmitDebug`；以及 `work/gc.go`，`ld`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L1220>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/gc.go#L605-L607>
[^go-linkactionid]: Go，`cmd/go/internal/work/exec.go`，`linkActionID` 中的 `packagefile`
    一行。<https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L1540-L1566>
[^go-internal-pie]: Go，`internal/platform/supported.go`，`InternalLinkPIESupported` 与
    `DefaultPIE`。
    <https://github.com/golang/go/blob/go1.27.3/src/internal/platform/supported.go#L217-L243>
[^rules-go-pie]: rules_go，`go/private/context.bzl`，`_defaults_to_pie` 与 `_go_config_impl`，二者在
    macOS 上选择 PIE；以及 `go/private/actions/link.bzl`，`emit_link`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/context.bzl#L578-L583>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/context.bzl#L1089-L1094>，
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/link.bzl#L97-L120>
[^go-asm]: Go，`cmd/go/internal/work/gc.go`，`gcToolchain.asm` 与 `gcToolchain.symabis`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/gc.go#L410-L432>
[^go-cgo]: Go，`cmd/go/internal/work/action.go`，`cgoAction`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/action.go#L762-L797>
[^rules-go-cgo]: rules_go，`go/tools/builders/compilepkg.go`，`compileArchive`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/tools/builders/compilepkg.go#L338-L341>
[^apple-xprotect]: Apple，*Apple Platform Security*，「Protecting against malware in macOS」，
    「XProtect」一节：XProtect 会在应用首次启动时，或在应用于文件系统中被更改后，检查其中是否含有
    已知的恶意内容。
    <https://support.apple.com/guide/security/protecting-against-malware-sec469d47bd8/web#secffa0f9b55>
[^m-test-profile]: 测量数据，Bazel 对首次 `bazel test //...` 的 JSON 追踪剖面，其中的 `GoLink` 与
    `TestRunner` 动作：
    [`examples/bench/results/2026-11-16/n1000-bazel-test-first.profile.gz`](../../examples/bench/results/2026-11-16/n1000-bazel-test-first.profile.gz)。
[^go-vet]: Go，`cmd/go/internal/work/action.go`，`vetAction`；以及 `exec.go`，`Builder.vet`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/action.go#L881-L898>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/work/exec.go#L1409-L1413>
[^go-test-vet]: Go，`cmd/go/internal/test/test.go`，`defaultVetFlags`。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/test/test.go#L654>
[^rules-go-nogo]: rules_go，`go/private/actions/compilepkg.bzl`，`_run_nogo`。
    <https://github.com/bazel-contrib/rules_go/blob/v0.65.0/go/private/actions/compilepkg.bzl#L226-L280>
[^go-generate]: Go，`cmd/go/internal/generate/generate.go`，包文档；以及 `runGenerate`，它运行每个
    文件中的每条指令，不做任何缓存查找。
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/generate/generate.go#L43-L44>，
    <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/generate/generate.go#L224-L234>
[^bazel-genrule]: Bazel，「General Rules」，「genrule」一节。
    <https://bazel.build/reference/be/general#genrule>
[^bazel-actions]: Bazel，「Remote Caching」，「Overview」一节。
    <https://bazel.build/remote/caching#overview>
[^bazel-server]: Bazel，「Client/server implementation」：「Bazel 系统实现为一个长期运行的服务进程」，
    在一次次构建之间缓存「BUILD 文件、依赖图以及其他元数据」；「如果你在多个工作区中构建，就会有多个
    输出根目录，因而有多个 Bazel 服务进程」。Bazel，`src/main/cpp/blaze.cc`，`GetServerExeArgs`，它返回
    启动服务进程的「JVM 命令参数数组」。
    <https://bazel.build/run/client-server>，
    <https://github.com/bazelbuild/bazel/blob/9.3.2/src/main/cpp/blaze.cc#L370-L371>
