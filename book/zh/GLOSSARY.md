# 术语表

中文版的每个概念只用一个中文名，以本表为准。通用术语与《Go 语言原本》的术语表一致
（`~/dev/golang.design/under-the-hood/book/zh-cn/glossary.md`），本表只收本书用到的。
每章只写一次「中文名（English）」：写在英文版定义、加粗或用斜体引入该术语之处，或者中文名不是日常
用词时（如服务进程（server）、机群（fleet）、函数体修改（body edit））写在本章第一次出现之处，其余地方
只写中文名。「保留」表示正文直接用英文原词。

## 书名与读者

| English | 中文 |
|---|---|
| Bazel for Go: What Scales and What Doesn't | Bazel for Go：哪些能随规模扩展，哪些不能 |
| staff and principal engineers | 资深工程师与首席工程师 |
| scale (v.) | 随规模扩展 |
| at scale | 规模变大时 |
| What this means at scale (recurring heading) | `## 规模变大时意味着什么` |
| film (chapter opening) | 短片 |
| the six decisions: unit, graph, change, key, sharing, execution | 六项决策：单元、图、变化、键、共享、执行 |
| declared graph / derived graph | 声明式的图／推导出的图 |
| graph (of a build) | 图（英文写 build graph 时译「构建图」） |

## 构建的基本概念

| English | 中文 | 说明 |
|---|---|---|
| build system | 构建系统 | |
| the go command | go 命令 | `go` 写作代码时加反引号，与英文版一致 |
| action | 动作 | |
| action graph | 动作图 | |
| action ID / output ID / content ID / build ID | 动作 ID／输出 ID／内容 ID／构建 ID | |
| action key | 动作键 | Bazel |
| action cache | 动作缓存 | Bazel |
| cache key / key | 缓存键／键 | |
| cache hit / miss | 缓存命中／未命中 | |
| build cache | 构建缓存 | GOCACHE 保留 |
| disk cache | 磁盘缓存 | |
| remote cache | 远程缓存 | |
| remote execution | 远程执行 | |
| dynamic execution | 动态执行 | |
| cutoff / early cutoff | 截断／提前截断 | |
| critical path | 关键路径 | |
| hermetic / hermeticity | 封闭的／封闭性 | |
| reproducible build | 可复现构建 | |
| sandbox | 沙箱 | |
| execroot | 保留 | 首次出现：execroot（动作运行的根目录） |
| digest | 摘要 | 哈希值；导出数据的 summary 译「概要」，不译「摘要」 |
| content-addressable storage (CAS) | 内容寻址存储（CAS） | |
| Merkle tree | Merkle 树 | |
| incremental build | 增量构建 | |
| clean build | 干净构建 | |
| cold build | 冷构建 | 缓存为空时的构建 |
| no-op build | 空构建 | 什么都没改时的构建 |
| warm (server, cache) | 热的（服务进程已运行、缓存已填充） | |
| checkout / fresh checkout | 检出／全新检出 | |
| checked in (to the repository) | 提交到仓库 | |
| source tree | 源码树 | |
| host | 主机 | |
| body edit / API edit | 函数体修改／API 修改 | |
| workload | 负载 | |
| wall time / CPU time | 墙钟时间／CPU 时间 | |
| peak RSS | 峰值 RSS（常驻内存集） | |
| parallelism | 并行度 | |
| core (CPU) | 核心 | 「18 核 Apple M5 Pro」这类机型写法除外 |
| fixed cost (per action) | 固定开销 | |
| caller | 调用者 | |
| wrapper / wrap | 包装程序／包装 | |
| synthetic repository | 合成仓库 | |
| profile / trace profile | 剖面／追踪剖面 | |
| execution log | 执行日志 | |
| inode number | inode 号 | |
| continuous integration (CI) | 持续集成（CI） | 首次出现写全称，此后写 CI |
| CI runner / CI job | CI 运行器／CI 作业 | |
| fleet (of machines) | 机群 | |

## Go 工具链

| English | 中文 | 说明 |
|---|---|---|
| package / module / main package | 包／模块／main 包 | |
| import / importer / direct importer | 导入／导入者／直接导入者 | |
| standard library | 标准库 | |
| compile / compiler | 编译／编译器 | |
| link / linker | 链接／链接器 | |
| assembler | 汇编器 | |
| export data | 导出数据 | `.x` 文件 |
| summary (what export data is) | 概要 | 区别于 digest（摘要） |
| archive | 归档 | `.a` 文件 |
| object code / object file | 目标代码／目标文件 | |
| inlining / inline | 内联 | |
| escape (to the heap) | 逃逸（到堆上） | |
| fingerprint | 指纹 | |
| position-independent executable (PIE) | 位置无关可执行文件（PIE） | |
| test binary | 测试二进制 | |
| analyzer | 分析器 | vet、nogo 保留 |
| fact / facts file | 事实／事实文件 | 分析器的 fact |
| in-package test files / external test package | 包内测试文件／外部测试包 | |
| front end / back end (compiler) | 前端／后端 | |
| worker goroutine | 工作 goroutine | |
| directive | 指令 | Gazelle 指令、`//go:` 指令 |
| build constraint / build tag | 构建约束／构建标签 | |
| race detector | 竞态检测器 | |
| code generator | 代码生成器 | |
| VCS stamping / stamp | 版本控制戳记／写入戳记 | Go 的 `-buildvcs` 与 Bazel 的 `--stamp` 都译「戳记」 |
| toolchain | 工具链 | |
| SDK | SDK（软件开发包） | |

## Bazel

| English | 中文 | 说明 |
|---|---|---|
| target | 目标 | |
| label | 标签 | |
| rule | 规则 | |
| BUILD file | BUILD 文件 | |
| workspace | 工作区 | |
| repository / external repository | 仓库／外部仓库 | |
| module extension | 模块扩展 | |
| configuration | 配置 | |
| platform / target platform / execution platform | 平台／目标平台／执行平台 | |
| loading / analysis / execution (phases) | 加载／分析／执行（阶段） | |
| provider | 提供者（provider） | |
| aspect | 切面（aspect） | |
| runfiles tree | runfiles 目录树 | |
| persistent worker | 持久工作进程 | |
| exec group | 执行组 | |
| execution properties | 执行属性 | |
| Bazel server / server | Bazel 服务进程／服务进程 | 不译「服务器」；缓存所在的机器仍是服务器 |
| client | 客户端 | |
| builder (rules_go) | 构建器（builder） | |
| tags (`tags`, `manual`, `external`) | 标记 | label 仍为「标签」 |
| mnemonic | 助记符 | |
| strategy | 策略 | |
| executor / remote executor | 执行器／远程执行器 | |
| transition | 转换 | |
| dirty / change pruning | 脏／变更剪枝 | Skyframe |
| rewinding | 回溯（rewinding） | |
| exec configuration | 执行配置 | |
| output base | 输出根目录（output base） | |
| artifact | 产物 | |
| test sharding / shard | 测试分片／分片 | |
| flaky test | 不稳定的测试 | |
| Skyframe、Gazelle、rules_go、nogo、bazelisk、genrule、BUILD | 保留 | |

## 人称与引用

| English | 中文 |
|---|---|
| we (walking the reader through) | 我们 |
| in our view / we recommend / we infer / in our reading | 在笔者看来／笔者建议／笔者推断／按笔者的理解 |
| we measured / in our measurements | 笔者测得／在笔者的测量中 |
| Chapter 5 / Figure 4.2 / Table 8.1 / Appendix A | 第 5 章／图 4.2／表 8.1／附录 A |
| References (heading) | 参考文献 |
| `"Title", section "X"` / `sections "X" and "Y"` | 「Title」，「X」一节／「X」与「Y」两节（标题保留英文） |
| quoted sentence from a document, release note or help text | 译成中文，放在「」中 |
| quoted code, code comment, error message, identifier | 保留英文，照英文版写作代码或放在「」中 |
| default `X` (in references) | 默认值为 `X` |
| as vendored in Bazel | Bazel 中收录的 |
| release notes / package comment / help text | 发布说明／包注释／帮助文本 |
