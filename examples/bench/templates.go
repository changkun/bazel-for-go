package main

// Source templates for the synthetic repository. They are fmt formats: %% is a literal %.

const typesTmpl = `package %s

// Record is the unit of data every function in package %s works on.
type Record struct {
	ID    int
	Name  string
	Tags  []string
	Score float64
}

// Index is an insertion-ordered map. Every package that uses it instantiates its methods.
type Index[K comparable, V any] struct {
	m    map[K]V
	keys []K
}

// NewIndex returns an empty Index.
func NewIndex[K comparable, V any]() *Index[K, V] {
	return &Index[K, V]{m: make(map[K]V)}
}

// Put sets k to v, remembering the order in which keys first appeared.
func (ix *Index[K, V]) Put(k K, v V) {
	if _, ok := ix.m[k]; !ok {
		ix.keys = append(ix.keys, k)
	}
	ix.m[k] = v
}

// Get returns the value for k.
func (ix *Index[K, V]) Get(k K) (V, bool) {
	v, ok := ix.m[k]
	return v, ok
}

// Len returns the number of keys.
func (ix *Index[K, V]) Len() int { return len(ix.keys) }

// Scorer scores a record.
type Scorer interface {
	Score(r Record) float64
}

type weighted struct{ w float64 }

func (s weighted) Score(r Record) float64 { return s.w*r.Score + float64(len(r.Tags)) }
`

const editTmpl = `package %s

// bodyEdit is too large to inline, so editing its body changes this package's object code
// but not its export data. The benchmark harness rewrites the salt.
func bodyEdit(xs []int) int {
	salt := 0 // bench:salt
	acc := 0
	for i, x := range xs {
		switch {
		case x%%3 == 0:
			acc += x * (i + salt)
		case x%%5 == 0:
			acc -= x ^ salt
		default:
			acc ^= x << (i %% 7)
		}
	}
	for i := 0; i < len(xs)/2; i++ {
		acc += xs[i] * xs[len(xs)-1-i]
	}
	for _, x := range xs {
		if x > acc {
			acc, x = x, acc
		}
		acc += x %% (salt + 7)
	}
	return acc
}

// bench:api
`

const v0 = `
func %s(rs []Record, s Scorer) []Record {
	out := make([]Record, 0, len(rs))
	for i, r := range rs {
		if i%%%d == 0 {
			continue
		}
		r.Score = s.Score(r) * %d.5
		r.Name = strings.ToUpper(r.Name) + strconv.Itoa(i)
		out = append(out, r)
	}
	sort.Slice(out, func(a, b int) bool { return out[a].Score < out[b].Score })
	return out
}
`

const v1 = `
func %s(rs []Record) map[string]float64 {
	agg := make(map[string]float64)
	for _, r := range rs {
		for _, t := range r.Tags {
			agg[t] += r.Score / float64(len(r.Tags)+%d)
		}
		if len(r.Tags) == 0 {
			agg["none"] += r.Score
		}
	}
	return agg
}
`

const v2 = `
func %s(line string) (Record, error) {
	fields := strings.Split(line, ",")
	if len(fields) < 3 {
		return Record{}, fmt.Errorf("%s: want 3 fields, got %%d", len(fields))
	}
	id, err := strconv.Atoi(strings.TrimSpace(fields[0]))
	if err != nil {
		return Record{}, fmt.Errorf("%s: id: %%w", err)
	}
	score, err := strconv.ParseFloat(strings.TrimSpace(fields[2]), 64)
	if err != nil {
		return Record{}, fmt.Errorf("%s: score: %%w", err)
	}
	return Record{ID: id + %d, Name: strings.TrimSpace(fields[1]), Tags: fields[3:], Score: score}, nil
}
`

const v3 = `
func %s(rs []Record) string {
	var b strings.Builder
	for i, r := range rs {
		if i > 0 {
			b.WriteString("; ")
		}
		fmt.Fprintf(&b, "%%d:%%s=%%.%df", r.ID, r.Name, r.Score)
		if len(r.Tags) > %d {
			b.WriteString(" [" + strings.Join(r.Tags, "|") + "]")
		}
	}
	return b.String()
}
`

const v4 = `
func %s(xs []int) int {
	state, acc := 0, %d
	for _, x := range xs {
		switch state {
		case 0:
			if x%%2 == 0 {
				state = 1
			}
			acc += x
		case 1:
			acc ^= x << 1
			state = 2
		default:
			acc -= x / (1 + int(uint(x)%%%d))
			state = 0
		}
	}
	return acc
}
`

const tableGoTmpl = `package %s

//go:generate go run example.com/synth/tools/gentable -in table.txt -out table_gen.go -pkg %s
`

const testTmpl = `package %s

import "testing"

func TestCompute(t *testing.T) {
	if Compute(8) == -1 {
		t.Fatal("unreachable")
	}
}

func TestIndex(t *testing.T) {
	ix := NewIndex[string, int]()
	ix.Put("a", 1)
	ix.Put("a", 2)
	if v, ok := ix.Get("a"); !ok || v != 2 || ix.Len() != 1 {
		t.Fatalf("Get(a) = %%d, %%v; Len = %%d", v, ok, ix.Len())
	}
}
`

// libBuild is what Gazelle would write, plus a genrule for packages with generated code.
// Arguments: genrule, name, srcs, importpath, deps line, name, name.
const libBuild = `load("@rules_go//go:def.bzl", "go_library", "go_test")
%s
go_library(
    name = "%s",
    srcs = %s,
    importpath = "%s",
    visibility = ["//visibility:public"],
%s)

go_test(
    name = "%s_test",
    srcs = ["pkg_test.go"],
    embed = [":%s"],
)
`

// genruleTmpl runs the generator at build time. The go command instead needs table_gen.go
// checked in and refreshed by "go generate".
const genruleTmpl = `
genrule(
    name = "table_gen",
    srcs = ["table.txt"],
    outs = ["table_gen.go"],
    cmd = "$(execpath //tools/gentable) -in $< -out $@ -pkg %s",
    tools = ["//tools/gentable"],
)
`

// Arguments: name, importpath, deps, name, name.
const binBuild = `load("@rules_go//go:def.bzl", "go_binary", "go_library")

go_library(
    name = "%s_lib",
    srcs = ["main.go"],
    importpath = "%s",
    visibility = ["//visibility:private"],
    deps = %s,
)

go_binary(
    name = "%s",
    embed = [":%s_lib"],
    visibility = ["//visibility:public"],
)
`

const moduleBazel = `module(name = "synth")

bazel_dep(name = "rules_go", version = "0.65.0")

go_sdk = use_extension("@rules_go//go:extensions.bzl", "go_sdk")
go_sdk.from_file(go_mod = "//:go.mod")
`

const bazelrc = `common --incompatible_strict_action_env
common --color=no --curses=no
test --test_output=errors
`

const rootBuild = `# The synthetic repository's root package. It has no targets.
`

const gentableBuild = `load("@rules_go//go:def.bzl", "go_binary", "go_library")

go_library(
    name = "gentable_lib",
    srcs = ["main.go"],
    importpath = "example.com/synth/tools/gentable",
    visibility = ["//visibility:private"],
)

go_binary(
    name = "gentable",
    embed = [":gentable_lib"],
    visibility = ["//visibility:public"],
)
`

const gentableMain = `// Command gentable turns a key=value table into a Go map. It stands in for protoc,
// stringer, mockgen and the other generators a real repository runs.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/format"
	"log"
	"os"
	"strings"
)

func main() {
	in := flag.String("in", "", "input table")
	out := flag.String("out", "", "output Go file")
	pkg := flag.String("pkg", "", "package name")
	flag.Parse()
	data, err := os.ReadFile(*in)
	if err != nil {
		log.Fatal(err)
	}
	var b bytes.Buffer
	fmt.Fprintf(&b, "// Code generated by gentable from table.txt. DO NOT EDIT.\n\npackage %s\n\nvar table = map[string]int{\n", *pkg)
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		k, v, _ := strings.Cut(line, "=")
		fmt.Fprintf(&b, "\t%q: %s,\n", k, v)
	}
	b.WriteString("}\n\nfunc lookup(k string) int { return table[k] }\n")
	src, err := format.Source(b.Bytes())
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile(*out, src, 0o644); err != nil {
		log.Fatal(err)
	}
}
`
