# Bazel for Go：哪些能随规模扩展，哪些不能

这是一本写给资深工程师与首席工程师的短书，帮助他们判断一个 Go 代码库应当用 Bazel 构建，
还是用 go 命令构建。书中解释两个系统各自如何设计、两种设计为何不同、各自在何处不再随规模扩展，
以及切换之后会有哪些变化。书中的示例都可以运行；正文中为数不多的数字来自附录 A 的测量。
逐章的写作计划见 `PLAN.md`。

所用版本：Go 1.27、Bazel 9.3、rules_go 0.65、Gazelle 0.54，在 macOS/arm64 上测量。

## 目录

**第一部分 问题**

- [前言](00-preface.md)：本书写给谁，以及一页篇幅的答案
- [1. 构建系统决定什么](01-what-a-build-system-decides.md)：每个构建系统都要做出的六个决定
  （工作单元、图的来源、变更检测、缓存键、缓存范围、执行位置），以及构建时间的成本模型

**第二部分 搭建**

- [2. 一个最小的 Bazel Go 仓库](02-minimal-setup.md)：bzlmod、rules_go、Gazelle，
  以 `go.mod` 为唯一可信来源，以及 gopls
- [3. 这套搭建带来的约束](03-constraints.md)：一个仓库为了用 Bazel 构建，必须放弃或改变什么

**第三部分 两种设计**

- [4. go 命令的设计](04-go-command.md)：一个没有构建文件的构建系统。包加载、动作图、
  动作 ID 与内容 ID、`GOCACHE`、测试缓存，以及塑造这些机制的目标
- [5. 工具链的负载](05-workloads.md)：编译、链接、cgo、测试、vet 与代码生成各自消耗什么
  （CPU、内存、I/O、并行度），按进程测量，以及各自如何随包与二进制的大小增长
- [6. Bazel 的设计](06-bazel-design.md)：一个为多台机器上的多语言单体仓库设计的构建系统。
  目标、提供者与动作；加载、分析与执行；Skyframe；动作缓存与内容寻址存储；沙箱、
  工作进程与远程执行
- [7. rules_go：两种设计的交汇处](07-rules-go.md)：Bazel 取代了 go 命令的哪一半，
  又保留了哪一半；SDK、标准库、builder、归档与导出数据、配置、nogo 与 Gazelle
- [8. 两种设计并排比较](08-side-by-side.md)：第 1 章的每个决定在两个系统中如何做出，
  各自为何如此选择，每种选择的代价如何随仓库增长，以及各个系统在何处不再随规模扩展

**第四部分 规模变大时的运维**

- [9. 优化 Bazel Go 构建](09-optimizing.md)：缓存命中率、动作键、Build without the Bytes、
  分析开销与服务进程内存、测试选择，以及把每类负载放到适合它的机器类型上
- [10. 做出决定](10-deciding.md)：各个系统在何处不再随规模扩展，一张决策表和一条迁移路径

**附录**

- [A. 测量](a-measurements.md)：合成仓库、测量框架、完整结果，以及复现的方法

## 仓库结构

- `book/`：英文版各章；`book/zh/`：中文版各章。
- `examples/minimal/`：第 2 章搭建的仓库。
- `examples/constraints/`：第 3 章的演示。
- `examples/bench/`：合成仓库的生成器、测量框架，以及附录 A 所报告的原始结果。

## 运行示例

Bazelisk 读取 `.bazelversion` 并下载固定版本的 Bazel。附录 A 介绍测量框架。

```bash
cd examples/minimal
bazel run //cmd/hello
bazel test //...
```

## 许可证

MIT，见 [LICENSE](../../LICENSE)。
