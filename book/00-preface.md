# Preface

This book is for staff and principal engineers deciding how to build a large Go codebase: with
the go command, Go's own build tool, or with Bazel, a build system for many languages on many
machines. It is not a Bazel tutorial. It explains each design, its costs as a repository grows,
and where it stops scaling. It uses Go 1.27.3, Bazel 9.3.2, rules_go 0.65.0 (Bazel's rules for
Go) and Gazelle 0.54.0 (which writes Bazel's BUILD files from Go source).

## How to read it

Part I names six decisions every build system makes and models build time. Part II sets up
Bazel for Go and lists its constraints. Part III explains the two designs and compares them.
Part IV operates and decides. Appendix A holds the measurements. Each chapter opens with a short
film and figures, ends with "What this means at scale", and links every claim to its source;
our own views are marked. Short of time, read Chapters 1, 8 and 10.

## The answer on one page

The go command is already an incremental build system. It keys each action, one run of a tool
such as a compile, by a hash of its inputs, and stores compiled packages under hashes of their
content (Chapter 4). For one Go module on one machine, Bazel saves work after some edits, but
in our view not enough to repay its costs (Chapter 10).

Bazel adds:

- **a declared graph held in memory** by a long-lived server, so a run need not rehash every
  source file (Chapter 6);
- **action keys that ignore the checkout path,** so a shared cache serves checkouts at any path,
  links and test runs included (Chapters 6 and 10);
- **execution that can leave the machine,** so a pool of machines, not one machine's cores,
  bounds parallelism (Chapter 6);
- **a graph that crosses languages,** so code generators and other languages are cached too
  (Chapters 3 and 10);
- **a finer cutoff,** the point where an edit stops spreading: importers depend only on each
  package's export data, the summary their compile reads. In our measurements, after an edit
  inside a function that is not inlined (copied into callers), in the most imported of 1,000
  packages, Bazel ran 1 compile, the go command 299; both relinked every binary containing it
  (Chapter 7).

Its price is BUILD files, a second description of the graph that Gazelle must keep current;
server memory that grows with the graph; a fixed cost per action; and reloading and replanning
the build after each server start (Chapter 6).

So the go command's cost per run grows with the repository; Bazel's fixed costs grow with the
graph (Chapter 8). Before switching, we recommend `-trimpath` (which keeps file paths out of the
output), one Go version, and a cache shared through `GOCACHEPROG` (the go command's hook for an
external cache), to share compiles, not links, across machines. In our view, Bazel pays off
once many machines building the same code spend their time on links, tests or generators, other
languages join, or one build outgrows one machine (Chapter 10).
