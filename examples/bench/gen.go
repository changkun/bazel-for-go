package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/format"
	"math/rand/v2"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Shape describes a synthetic repository. The generator is deterministic: the same Shape
// always produces byte-identical files, so both build systems see the same source tree.
type Shape struct {
	Pkgs     int     // library packages
	Layers   int     // depth of the import graph; packages only import lower layers
	Fanin    int     // imports per package from lower layers
	FuncFile int     // files of ordinary functions per package
	Funcs    int     // functions per such file (at least 5, one of each variant)
	CoreFrac float64 // fraction of packages that also import the core package directly
	GenEvery int     // every GenEvery-th package has a generated source file (0: none)
	Bins     int     // main packages under cmd/
	Seed     uint64
}

func (s Shape) withDefaults() Shape {
	if s.Layers == 0 {
		s.Layers = 12
	}
	if s.Fanin == 0 {
		s.Fanin = 4
	}
	if s.FuncFile == 0 {
		s.FuncFile = 3
	}
	if s.Funcs < 5 {
		s.Funcs = 10
	}
	if s.Bins == 0 {
		s.Bins = max(2, s.Pkgs/100)
	}
	if s.CoreFrac == 0 {
		s.CoreFrac = 0.3
	}
	if s.GenEvery == 0 {
		s.GenEvery = 10
	}
	if s.Seed == 0 {
		s.Seed = 1
	}
	return s
}

const modPath = "example.com/synth"

type pkg struct {
	idx   int
	layer int
	deps  []int
	gen   bool // has a generated table
}

func (p *pkg) name() string { return fmt.Sprintf("p%04d", p.idx) }
func (p *pkg) dir() string  { return fmt.Sprintf("lib/l%02d/p%04d", p.layer, p.idx) }

// Repo is a generated repository's import graph plus the packages the harness edits.
type Repo struct {
	Shape Shape
	pkgs  []*pkg
	bins  [][]int
	Core  string // directory of the core package (imported by many)
	Leaf  string // directory of a top-layer package imported by cmd/app00
	Table string // a generated-table input file
}

func plan(s Shape) *Repo {
	s = s.withDefaults()
	rng := rand.New(rand.NewPCG(s.Seed, 0x5eed))
	r := &Repo{Shape: s}
	byLayer := make([][]int, s.Layers)
	for i := range s.Pkgs {
		l := i * s.Layers / s.Pkgs
		p := &pkg{idx: i, layer: l}
		if s.GenEvery > 0 && i%s.GenEvery == 1 {
			p.gen = true
		}
		r.pkgs = append(r.pkgs, p)
		byLayer[l] = append(byLayer[l], i)
	}
	for _, p := range r.pkgs {
		seen := map[int]bool{}
		add := func(i int) {
			if i != p.idx && !seen[i] {
				seen[i] = true
				p.deps = append(p.deps, i)
			}
		}
		if p.layer > 0 {
			below := byLayer[p.layer-1]
			for range s.Fanin - 1 {
				add(below[rng.IntN(len(below))])
			}
			// One long edge to any lower layer, so the graph is not a pure layer cake.
			l := rng.IntN(p.layer)
			add(byLayer[l][rng.IntN(len(byLayer[l]))])
		}
		if p.idx != 0 && rng.Float64() < s.CoreFrac {
			add(0)
		}
		sort.Ints(p.deps)
	}
	top := byLayer[s.Layers-1]
	for range s.Bins {
		seen := map[int]bool{}
		var imp []int
		for len(imp) < min(3, len(top)) {
			i := top[rng.IntN(len(top))]
			if !seen[i] {
				seen[i] = true
				imp = append(imp, i)
			}
		}
		sort.Ints(imp)
		r.bins = append(r.bins, imp)
	}
	r.Core = r.pkgs[0].dir()
	r.Leaf = r.pkgs[r.bins[0][0]].dir()
	for _, p := range r.pkgs {
		if p.gen {
			r.Table = filepath.Join(p.dir(), "table.txt")
			break
		}
	}
	return r
}

// Stats describes the graph: how far an edit to the core package reaches.
type Stats struct {
	Pkgs, Bins, Files, Lines int
	CoreDirectRdeps          int
	CoreTransitiveRdeps      int
	MaxDepth                 int
}

func (r *Repo) stats() Stats {
	st := Stats{Pkgs: len(r.pkgs), Bins: len(r.bins)}
	rdeps := make([][]int, len(r.pkgs))
	for _, p := range r.pkgs {
		for _, d := range p.deps {
			rdeps[d] = append(rdeps[d], p.idx)
		}
	}
	st.CoreDirectRdeps = len(rdeps[0])
	seen := map[int]bool{}
	stack := []int{0}
	for len(stack) > 0 {
		i := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, j := range rdeps[i] {
			if !seen[j] {
				seen[j] = true
				stack = append(stack, j)
			}
		}
	}
	st.CoreTransitiveRdeps = len(seen)
	depth := make([]int, len(r.pkgs))
	for _, p := range r.pkgs { // packages are in topological order: deps have lower indices
		for _, d := range p.deps {
			depth[p.idx] = max(depth[p.idx], depth[d]+1)
		}
		st.MaxDepth = max(st.MaxDepth, depth[p.idx])
	}
	return st
}

// write generates the repository under dir, for both build systems.
func (r *Repo) write(dir string) (Stats, error) {
	st := r.stats()
	files := map[string][]byte{}
	put := func(name string, b []byte) { files[name] = b }
	putGo := func(name string, b []byte) error {
		src, err := format.Source(b)
		if err != nil {
			return fmt.Errorf("%s: %v\n%s", name, err, b)
		}
		put(name, src)
		return nil
	}

	put("go.mod", []byte("module "+modPath+"\n\ngo 1.27.3\n"))
	put(".bazelversion", []byte("9.3.2\n"))
	put("MODULE.bazel", []byte(moduleBazel))
	put(".bazelrc", []byte(bazelrc))
	put("BUILD.bazel", []byte(rootBuild))
	if err := putGo("tools/gentable/main.go", []byte(gentableMain)); err != nil {
		return st, err
	}
	put("tools/gentable/BUILD.bazel", []byte(gentableBuild))

	var targets []string
	for _, p := range r.pkgs {
		if err := r.writePkg(p, putGo, put); err != nil {
			return st, err
		}
	}
	for i, imp := range r.bins {
		var b bytes.Buffer
		fmt.Fprintf(&b, "// Command app%02d links a slice of the synthetic repository.\npackage main\n\nimport (\n\t\"fmt\"\n\n", i)
		for _, j := range imp {
			fmt.Fprintf(&b, "\t%q\n", modPath+"/"+r.pkgs[j].dir())
		}
		b.WriteString(")\n\nfunc main() {\n\ttotal := 0\n")
		for _, j := range imp {
			fmt.Fprintf(&b, "\ttotal += %s.Compute(4)\n", r.pkgs[j].name())
		}
		b.WriteString("\tfmt.Println(total)\n}\n")
		d := fmt.Sprintf("cmd/app%02d", i)
		if err := putGo(d+"/main.go", b.Bytes()); err != nil {
			return st, err
		}
		var deps []string
		for _, j := range imp {
			deps = append(deps, "//"+r.pkgs[j].dir())
		}
		bn := fmt.Sprintf("app%02d", i)
		put(d+"/BUILD.bazel", []byte(fmt.Sprintf(binBuild, bn, modPath+"/"+d, quoteList(deps, "        "), bn, bn)))
		targets = append(targets, "//"+d)
	}
	targets = append(targets, "//tools/gentable")
	// The main packages: Bazel then builds them and everything they import, which is exactly
	// what `go build -o <dir> ./...` builds. `bazel build //...` would also build libraries no
	// binary imports, and every go_test binary, which `go build` never compiles.
	put("build_targets.txt", []byte(strings.Join(targets, "\n")+"\n"))

	for name, b := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return st, err
		}
		if err := os.WriteFile(path, b, 0o644); err != nil {
			return st, err
		}
		st.Files++
		if strings.HasSuffix(name, ".go") {
			st.Lines += bytes.Count(b, []byte("\n"))
		}
	}
	return st, nil
}

func (r *Repo) writePkg(p *pkg, putGo func(string, []byte) error, put func(string, []byte)) error {
	s := r.Shape
	name, d := p.name(), p.dir()
	var srcs []string

	// types.go: exported types, including a generic one whose methods importers instantiate.
	if err := putGo(d+"/types.go", []byte(fmt.Sprintf(typesTmpl, name, name))); err != nil {
		return err
	}
	srcs = append(srcs, "types.go")

	// edit.go: the function the harness edits. It is too large to inline, so a change to its
	// body changes the package's object code and leaves its export data alone.
	if err := putGo(d+"/edit.go", []byte(fmt.Sprintf(editTmpl, name))); err != nil {
		return err
	}
	srcs = append(srcs, "edit.go")

	// fNN.go: ordinary code, five kinds of function in rotation.
	var calls bytes.Buffer
	for f := range s.FuncFile {
		var b bytes.Buffer
		fmt.Fprintf(&b, "package %s\n\nimport (\n\t\"fmt\"\n\t\"sort\"\n\t\"strconv\"\n\t\"strings\"\n)\n", name)
		for m := range s.Funcs {
			fn := fmt.Sprintf("f%d_%d", f, m)
			k := (p.idx + f*s.Funcs + m) % 7
			switch m % 5 {
			case 0:
				fmt.Fprintf(&b, v0, fn, k+2, k+1)
				fmt.Fprintf(&calls, "\ttotal += len(%s(rs, weighted{w: %d}))\n", fn, k+1)
			case 1:
				fmt.Fprintf(&b, v1, fn, k+1)
				fmt.Fprintf(&calls, "\ttotal += len(%s(rs))\n", fn)
			case 2:
				fmt.Fprintf(&b, v2, fn, fn, fn, fn, k)
				fmt.Fprintf(&calls, "\tif r, err := %s(\"%d, r, 2.5, x\"); err == nil {\n\t\ttotal += r.ID\n\t}\n", fn, k)
			case 3:
				fmt.Fprintf(&b, v3, fn, k%4+1, k%3)
				fmt.Fprintf(&calls, "\ttotal += len(%s(rs))\n", fn)
			case 4:
				fmt.Fprintf(&b, v4, fn, k, k+2)
				fmt.Fprintf(&calls, "\ttotal += %s([]int{n, n + %d, n * 2})\n", fn, k)
			}
		}
		// Keep every import used even if a variant stops using one.
		b.WriteString("\nvar _ = fmt.Sprint\nvar _ = sort.Ints\nvar _ = strconv.Itoa\nvar _ = strings.ToUpper\n")
		file := fmt.Sprintf("f%02d.go", f)
		if err := putGo(d+"/"+file, b.Bytes()); err != nil {
			return err
		}
		srcs = append(srcs, file)
	}

	// api.go: the entry point importers call, which calls every dependency.
	var b bytes.Buffer
	fmt.Fprintf(&b, "// Package %s is synthetic, generated for the measurements in Chapter 9.\npackage %s\n\nimport (\n\t\"strconv\"\n", name, name)
	var deps []string
	for _, j := range p.deps {
		fmt.Fprintf(&b, "\t%q\n", modPath+"/"+r.pkgs[j].dir())
		deps = append(deps, "//"+r.pkgs[j].dir())
	}
	b.WriteString(")\n\n// Compute is the entry point importers call. It is too large to inline.\nfunc Compute(n int) int {\n\ttotal := exercise(n) + bodyEdit([]int{n, n + 1, n + 2})\n\tix := NewIndex[int, Record]()\n\tfor _, r := range sample(n) {\n\t\tix.Put(r.ID, r)\n\t}\n\ttotal += ix.Len()\n")
	if p.gen {
		b.WriteString("\ttotal += lookup(\"k7\")\n")
	}
	if len(p.deps) > 0 {
		b.WriteString("\tif n > 1 {\n")
		for _, j := range p.deps {
			fmt.Fprintf(&b, "\t\ttotal += %s.Compute(n / 2)\n", r.pkgs[j].name())
		}
		b.WriteString("\t}\n")
	}
	b.WriteString("\treturn total\n}\n\nfunc sample(n int) []Record {\n\trs := make([]Record, n)\n\tfor i := range rs {\n\t\trs[i] = Record{ID: i, Name: \"r\" + strconv.Itoa(i), Tags: []string{\"a\", \"b\"}, Score: float64(i)}\n\t}\n\treturn rs\n}\n\nfunc exercise(n int) int {\n\trs := sample(n)\n\ttotal := 0\n")
	b.Write(calls.Bytes())
	b.WriteString("\treturn total\n}\n")
	if err := putGo(d+"/api.go", b.Bytes()); err != nil {
		return err
	}
	srcs = append(srcs, "api.go")

	genrule := ""
	if p.gen {
		if err := putGo(d+"/table.go", []byte(fmt.Sprintf(tableGoTmpl, name, name))); err != nil {
			return err
		}
		srcs = append(srcs, "table.go")
		in := tableInput(p.idx)
		put(d+"/table.txt", []byte(in))
		// The go command needs the generated file checked in; Bazel generates it.
		gen, err := renderTable(name, in)
		if err != nil {
			return err
		}
		put(d+"/table_gen.go", gen)
		srcs = append(srcs, ":table_gen")
		genrule = fmt.Sprintf(genruleTmpl, name)
	}
	if err := putGo(d+"/pkg_test.go", []byte(fmt.Sprintf(testTmpl, name))); err != nil {
		return err
	}
	sort.Strings(srcs)
	depsLine := ""
	if len(deps) > 0 {
		depsLine = "    deps = " + quoteList(deps, "        ") + ",\n"
	}
	put(d+"/BUILD.bazel", []byte(fmt.Sprintf(libBuild, genrule, name, quoteList(srcs, "        "), modPath+"/"+d, depsLine, name, name)))
	return nil
}

func quoteList(xs []string, indent string) string {
	if len(xs) == 0 {
		return "[]"
	}
	var b strings.Builder
	b.WriteString("[\n")
	for _, x := range xs {
		fmt.Fprintf(&b, "%s%q,\n", indent, x)
	}
	b.WriteString(indent[:len(indent)-4] + "]")
	return b.String()
}

func tableInput(seed int) string {
	var b strings.Builder
	for i := range 64 {
		fmt.Fprintf(&b, "k%d=%d\n", i, (seed*31+i*17)%1000)
	}
	return b.String()
}

// renderTable must produce exactly what tools/gentable writes (see gentableMain).
func renderTable(pkg, in string) ([]byte, error) {
	var b bytes.Buffer
	fmt.Fprintf(&b, "// Code generated by gentable from table.txt. DO NOT EDIT.\n\npackage %s\n\nvar table = map[string]int{\n", pkg)
	for _, line := range strings.Split(strings.TrimSpace(in), "\n") {
		k, v, _ := strings.Cut(line, "=")
		fmt.Fprintf(&b, "\t%q: %s,\n", k, v)
	}
	b.WriteString("}\n\nfunc lookup(k string) int { return table[k] }\n")
	return format.Source(b.Bytes())
}

func cmdGen(args []string) error {
	fs := flag.NewFlagSet("gen", flag.ExitOnError)
	var s Shape
	fs.IntVar(&s.Pkgs, "pkgs", 100, "library packages")
	fs.IntVar(&s.Layers, "layers", 12, "import graph depth")
	fs.IntVar(&s.Fanin, "fanin", 4, "imports per package")
	fs.Float64Var(&s.CoreFrac, "corefrac", 0.3, "fraction of packages importing the core package")
	fs.IntVar(&s.GenEvery, "genevery", 10, "every n-th package has generated code (0: none)")
	out := fs.String("o", "", "output directory (must not exist)")
	fs.Parse(args)
	if *out == "" {
		return fmt.Errorf("gen: -o is required")
	}
	if _, err := os.Stat(*out); err == nil {
		return fmt.Errorf("gen: %s exists", *out)
	}
	r := plan(s)
	st, err := r.write(*out)
	if err != nil {
		return err
	}
	fmt.Printf("%+v\ncore=%s leaf=%s table=%s\n", st, r.Core, r.Leaf, r.Table)
	return nil
}
