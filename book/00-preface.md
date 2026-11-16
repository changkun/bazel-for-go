# Preface

This book is for staff and principal engineers deciding how to build a large Go codebase: with
the go command, Go's own build tool, or with Bazel, a build system for many languages on many
machines. It explains each design, its costs as a repository grows, and where it stops scaling.
It uses Go 1.27.3, Bazel 9.3.2, rules_go 0.65.0 (Bazel's rules for Go) and Gazelle 0.54.0
(which writes Bazel's BUILD files from Go source).

## How to read it

Part I names six decisions that shape a build system and models build time. Part II sets up
Bazel for Go and lists its constraints. Part III explains the two designs and compares them.
Part IV optimizes and decides. Appendix A holds the measurements. Each chapter opens with a short
film, ends with "What this means at scale", and links every claim to its source; our own views
are marked. Short of time, read Chapters 1, 8 and 10.

## The answer on one page

The go command is already an incremental build system. It keys each action, one run of a tool
such as a compile, by a hash of its inputs, and stores compiled packages under hashes of their
content (Chapter 4). For one Go module on one machine, in our view, what Bazel saves does not
repay its costs (Chapter 10).

Bazel adds:

- **a declared graph held in memory** by a long-lived server, so a run neither rederives the
  graph nor rereads unchanged files, only checks their timestamps (Chapters 6 and 8);
- **a shared cache that holds links and test results,** not only compiles, for checkouts at any
  path on matching machines (Chapters 6 and 10);
- **execution that can leave the machine,** so a pool of machines, not one machine's cores,
  bounds parallelism (Chapter 6);
- **a graph that crosses languages,** so generated code and other languages' build steps are
  cached too (Chapters 3 and 8);
- **a finer cutoff,** the point where an edit stops spreading: importers' keys cover only each
  package's export data, a summary of what it exports, so a body edit that leaves that summary
  unchanged recompiles one package, not every direct importer (Chapter 7).

Its price is BUILD files, a second description of the graph that Gazelle must keep current;
server memory that grows with the graph; a fixed cost per action; and reloading and replanning
the build after each server start (Chapters 3 and 6).

In our analysis, the go command's work per run grows with the repository rather than the
change; Bazel's overheads grow with the graph (Chapter 8). If continuous integration time goes to
compiling, we recommend `-trimpath` (dropping paths from outputs), one Go version, and a cache
shared through `GOCACHEPROG` (the go command's hook for an external cache), to share compiles,
not links, across machines (Chapter 10). In our view, Bazel pays off once many machines building
the same code spend their time on links, tests or generators; long-lived runners spend it
loading the tree; other languages join; or one build outgrows one machine (Table 10.1).
