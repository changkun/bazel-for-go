# 1. What a build system decides

Comparisons of build systems usually list features. This chapter takes a different approach
and starts from the decisions every build system has to make. The go command and Bazel make
each decision differently, and almost every difference between them in practice comes from
one of those choices. The chapter ends with a cost model that says which terms of build time
grow with which kind of scale.

## A build is a function

A build turns sources into artifacts. Ideally it is a pure function: the same sources, tools
and flags always give the same artifacts. A build is fast when it can avoid evaluating most of
that function. The function is too big to evaluate whole, so every build system breaks it into
smaller functions called *actions*. Each action runs a tool on some inputs to produce some
outputs, and the system skips an action when it can prove the result would not change.

That framing fixes the vocabulary used in the rest of the book.

- An **action** is one tool invocation with known inputs and outputs, such as one compile or
  one link.
- An action's **key** is a hash of everything that determines its output. Two actions with
  the same key are interchangeable, so the output of one can stand in for the other.
- A **cache** maps keys to outputs. It *hits* when it holds the key.
- A build is **hermetic** when its keys are complete, that is, when no input that can
  change an output is missing from the key. Hermeticity is what makes a cache hit trustworthy.
- **Early cutoff**: if an action reruns and produces byte-identical output, the actions that
  depend on it can still hit.
- The **critical path** is the longest chain of actions that depend on each other. No amount
  of parallelism makes a build faster than its critical path.

## Six decisions

### 1. The unit of work

What is one action? A coarse unit, such as a whole module, gives few actions and cheap
bookkeeping, but it reruns much more than it needs to. A fine unit, such as one source file,
reruns little, but it multiplies the bookkeeping and the fixed cost of starting each action.
The Go compiler sets a natural unit for both systems, the package, because it compiles a whole
package at once and needs only the export data of the packages it imports. The two systems
agree on this unit. What they disagree on is what happens around it.

### 2. Where the graph comes from

Before it can run actions, a build system needs the graph of actions and their dependencies.
It can *derive* the graph by reading the sources, which is what the go command does with import
statements. Or it can require the graph to be *declared* in build files, which is what Bazel does
with BUILD files.

A derived graph is never out of date and costs nothing to maintain, but it has to be derived
again whenever the system needs it, and it can only express what the source language can. A
declared graph can express anything (a code generator, a C library, a test's data files), and
a long-lived process can keep it in memory. The price is that someone has to write it and keep
it in agreement with the code.

### 3. How change is detected

Between two builds, something changed. A build system can rediscover what changed by reading
every input again and comparing hashes. It can check cheaper metadata, such as file sizes and
modification times, against values it remembered. Or it can be told, by the operating system's
file notifications or by the version control system. The first approach needs no memory and
costs time in proportion to the size of the tree. The others cost time in proportion to the
size of the change, and they need state that survives from one build to the next.

### 4. What the key covers

A key that leaves out a relevant input lets a stale output through, and the build is wrong. A
key that includes an irrelevant input, such as the absolute path of the checkout or a timestamp,
causes misses: the work is redone, and caches cannot be shared. There is a subtler choice as
well, which is how a dependency enters its dependents' keys. If it enters by the hash of
its whole output, any change to the dependency reaches every dependent. If it enters by the
hash of only the part dependents read (for Go, the export data), a change that leaves that part
alone stops at the dependency.

### 5. How far the cache is shared

A cache can live in one process, in one user's home directory, on one machine, or on a server
that every developer and CI job uses. The wider it is shared, the more often an action computed
once is reused. In a team of a hundred engineers and a CI fleet, the same compile of the same
commit runs hundreds of times a day unless the cache is shared. Sharing only works if keys are
complete (decision 4) and identical across machines. A path in the key is enough to stop it.

### 6. Where actions run

Actions can run as child processes on the developer's machine, or be shipped to a fleet of
executors. Remote execution changes the limit on parallelism from one machine's cores to the
fleet's size, and it moves the bytes of inputs and outputs across the network. It requires
that an action declare every input it needs, since anything undeclared does not exist on the
remote machine.

## A cost model

The time a build takes can be split into four terms:

```text
T  =  T_graph  +  T_detect  +  T_exec  +  T_transfer
```

- **T_graph** is the time to obtain the action graph: loading build files or package headers,
  and computing the actions. A system that derives the graph per invocation pays this
  every time. A system with a persistent process pays it after each restart, and on a warm
  build pays only for the part of the graph that changed.
- **T_detect** is the time to determine what changed: hashing inputs, statting files, or
  receiving notifications.
- **T_exec** is the time to run the actions that missed the cache. It is bounded below by
  two things. One is the critical path of the missed subgraph. The other is the total work
  divided by the available parallelism. The work missed depends on the change, on the
  dependency fan-out of what changed, on how early the cutoff takes effect, and on how widely
  the cache is shared.
- **T_transfer** is the time to move bytes: outputs out of a cache, inputs to an executor,
  results back.

Each term grows with a different kind of scale:

| Scale | Terms it drives | What helps |
|---|---|---|
| Packages and files in the repository | T_graph, T_detect | A persistent graph; detection that is proportional to change |
| Change rate × fan-out of what changes | T_exec | A precise key, so that cutoff happens early |
| Engineers × machines × CI jobs | T_exec, summed across machines | A cache shared across machines, with keys that do not depend on paths |
| Size of the largest builds | T_exec, bounded by the critical path and parallelism | Remote execution, a shorter critical path |
| Languages and generated code | All terms, for whatever the system cannot see | A graph that can declare any action |

A developer editing one package of a mid-sized Go repository sits in the top row. T_exec is a
few compiles and a link, and the question is whether T_graph and T_detect stay small. A
platform team running CI for a few hundred engineers sits in the third and fourth rows.
There, almost all of the cost is the same actions computed again on different machines, and
the question is whether those results can be shared. The go command was designed to win the
first case. Bazel was designed to win the others, and it pays for that in the first case.
Chapters 4 to 8 show how each design follows from its target, and Chapter 10 turns the table
into a decision.

## What this means at scale

- Compare build systems by the six decisions, not by features. Each difference you will meet
  in practice traces back to one of them.
- A build that is slow on a laptop and a build that is expensive across a fleet are different
  problems. They are dominated by different terms and fixed by different designs.
- Hermeticity is not a matter of taste. It is what allows a cache to be shared, and a shared
  cache is what reduces the third row of the table.
- The critical path sets a floor that more cores or more executors cannot lower. Chapter 5
  measures it for a Go build.
