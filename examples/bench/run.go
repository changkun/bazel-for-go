package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// A config is one repository shape and the scenarios to run on it.
type config struct {
	Name       string
	Shape      Shape
	Tools      []string // "go", "bazel"
	Scenarios  []string // empty: all
	BazelFlags []string // extra Bazel build flags
	Workload   bool     // also record per-process resource use of the go toolchain
}

var configs = map[string]config{
	"smoke":       {Shape: Shape{Pkgs: 30, Layers: 4}, Workload: true},
	"n100":        {Shape: Shape{Pkgs: 100, Layers: 8}},
	"n300":        {Shape: Shape{Pkgs: 300, Layers: 10}},
	"n1000":       {Shape: Shape{Pkgs: 1000, Layers: 12}, Workload: true},
	"n3000":       {Shape: Shape{Pkgs: 3000, Layers: 14}, Workload: true},
	"n10000":      {Shape: Shape{Pkgs: 10000, Layers: 16}, Scenarios: []string{"cold", "noop", "leaf-body", "core-body", "core-api", "core-comment", "codegen", "clone"}},
	"n1000-wide":  {Shape: Shape{Pkgs: 1000, Layers: 4, Fanin: 8}, Scenarios: []string{"cold", "noop", "core-body", "core-api"}},
	"n1000-deep":  {Shape: Shape{Pkgs: 1000, Layers: 40, Fanin: 3}, Scenarios: []string{"cold", "noop", "core-body", "core-api"}},
	"n1000-local": {Shape: Shape{Pkgs: 1000, Layers: 12}, Tools: []string{"bazel"}, BazelFlags: []string{"--spawn_strategy=local"}, Scenarios: []string{"cold", "noop", "leaf-body", "core-body"}},
}

// Record is one measurement. Every number in the book and Appendix A is one of these, or a median
// of several, computed by analyze.py.
type Record struct {
	Config   string         `json:"config"`
	Tool     string         `json:"tool"`
	Scenario string         `json:"scenario"`
	Rep      int            `json:"rep"`
	Seconds  float64        `json:"seconds"`
	Counts   map[string]int `json:"counts,omitempty"` // processes run, by kind
	Value    float64        `json:"value,omitempty"`  // for non-time measurements
	Unit     string         `json:"unit,omitempty"`
	Err      string         `json:"err,omitempty"`
}

type harness struct {
	root      string // work directory: repositories, caches, output bases
	logs      string
	results   *os.File
	goBin     string // directory holding the go binary
	bazel     string // bazelisk
	self      string // this binary, for -toolexec
	reps      int
	editSeq   int
	userRoot  string
	repoCache string
	out       string // results directory of the current run
}

func cmdRun(args []string) error {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	names := fs.String("configs", "smoke", "comma-separated configs: "+strings.Join(configNames(), ","))
	work := fs.String("work", "work", "work directory for repositories and caches")
	out := fs.String("out", "", "results directory (default results/<date>)")
	goroot := fs.String("goroot", "", "GOROOT of the Go SDK to measure (default: go env GOROOT)")
	bazel := fs.String("bazel", "bazelisk", "bazelisk binary")
	reps := fs.Int("reps", 3, "repetitions of each warm measurement")
	fs.Parse(args)

	h := &harness{reps: *reps, bazel: *bazel}
	var err error
	if h.root, err = filepath.Abs(*work); err != nil {
		return err
	}
	if *goroot == "" {
		b, err := exec.Command("go", "env", "GOROOT").Output()
		if err != nil {
			return err
		}
		*goroot = strings.TrimSpace(string(b))
	}
	h.goBin = filepath.Join(*goroot, "bin")
	if h.self, err = os.Executable(); err != nil {
		return err
	}
	if *out == "" {
		*out = filepath.Join("results", time.Now().Format("2006-01-02"))
	}
	// The go command and Bazel run in the generated repositories, so every path they are
	// given must be absolute.
	if *out, err = filepath.Abs(*out); err != nil {
		return err
	}
	if err := os.MkdirAll(*out, 0o755); err != nil {
		return err
	}
	h.logs = filepath.Join(h.root, "logs")
	h.userRoot = filepath.Join(h.root, "bazel-root")
	h.repoCache = filepath.Join(h.root, "repo-cache")
	for _, d := range []string{h.logs, h.userRoot, h.repoCache} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return err
		}
	}
	if err := h.writeMeta(*out); err != nil {
		return err
	}
	if h.results, err = os.OpenFile(filepath.Join(*out, "results.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err != nil {
		return err
	}
	defer h.results.Close()

	for i, name := range strings.Split(*names, ",") {
		c, ok := configs[name]
		if !ok {
			return fmt.Errorf("unknown config %q", name)
		}
		c.Name = name
		if len(c.Tools) == 0 {
			c.Tools = []string{"go", "bazel"}
			if i%2 == 1 { // alternate the order so that neither tool always runs on a hotter machine
				c.Tools = []string{"bazel", "go"}
			}
		}
		if err := h.runConfig(c, *out); err != nil {
			h.logf("config %s: %v", name, err)
		}
	}
	return nil
}

func configNames() []string {
	var ns []string
	for n := range configs {
		ns = append(ns, n)
	}
	return ns
}

func (h *harness) logf(format string, args ...any) {
	fmt.Printf("%s  %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
}

func (h *harness) record(r Record) {
	b, _ := json.Marshal(r)
	h.results.Write(append(b, '\n'))
	h.results.Sync()
	msg := fmt.Sprintf("%-12s %-6s %-24s rep %d  %8.2fs %v", r.Config, r.Tool, r.Scenario, r.Rep, r.Seconds, r.Counts)
	if r.Unit != "" {
		msg += fmt.Sprintf(" %.0f %s", r.Value, r.Unit)
	}
	if r.Err != "" {
		msg += "  ERROR " + r.Err
	}
	h.logf("%s", msg)
}

func (h *harness) writeMeta(out string) error {
	run := func(name string, args ...string) string {
		b, _ := exec.Command(name, args...).Output()
		return strings.TrimSpace(string(b))
	}
	meta := map[string]any{
		"date":     time.Now().Format(time.RFC3339),
		"goos":     runtime.GOOS,
		"goarch":   runtime.GOARCH,
		"go":       run(filepath.Join(h.goBin, "go"), "version"),
		"bazel":    "9.3.2 (pinned in .bazelversion)",
		"rules_go": "0.65.0",
		"reps":     h.reps,
	}
	if runtime.GOOS == "darwin" {
		meta["cpu"] = run("sysctl", "-n", "machdep.cpu.brand_string")
		meta["ncpu"] = run("sysctl", "-n", "hw.ncpu")
		meta["memsize"] = run("sysctl", "-n", "hw.memsize")
		meta["os"] = run("sw_vers", "-productVersion")
	} else {
		meta["ncpu"] = runtime.NumCPU()
		meta["os"] = run("uname", "-sr")
	}
	b, _ := json.MarshalIndent(meta, "", "  ")
	return os.WriteFile(filepath.Join(out, "meta.json"), append(b, '\n'), 0o644)
}

func (c config) want(s string) bool {
	if len(c.Scenarios) == 0 {
		return true
	}
	for _, x := range c.Scenarios {
		if x == s {
			return true
		}
	}
	return false
}

func (h *harness) runConfig(c config, out string) error {
	dir := filepath.Join(h.root, c.Name)
	if err := removeAll(dir); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	repo := plan(c.Shape)
	st, err := repo.write(filepath.Join(dir, "src"))
	if err != nil {
		return err
	}
	b, _ := json.Marshal(map[string]any{"config": c.Name, "shape": repo.Shape, "stats": st, "core": repo.Core, "leaf": repo.Leaf})
	f, err := os.OpenFile(filepath.Join(out, "configs.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	f.Write(append(b, '\n'))
	f.Close()
	h.logf("config %s: %+v", c.Name, st)
	h.out = out

	for _, tool := range c.Tools {
		// Each tool starts from the same freshly generated tree.
		src := filepath.Join(dir, "src")
		if err := removeAll(src); err != nil {
			return err
		}
		if _, err := repo.write(src); err != nil {
			return err
		}
		switch tool {
		case "go":
			err = h.runGo(c, repo, dir, src)
		case "bazel":
			err = h.runBazel(c, repo, dir, src)
		}
		if err != nil {
			h.logf("config %s, %s: %v", c.Name, tool, err)
		}
	}
	if c.Workload {
		if err := h.runWorkload(c, repo, dir, out); err != nil {
			h.logf("config %s, workload: %v", c.Name, err)
		}
	}
	return removeAll(dir)
}

// ---- edits ----------------------------------------------------------------------------------

var saltRE = regexp.MustCompile(`salt := \d+ // bench:salt`)

func (h *harness) edit(src string, repo *Repo, kind string) error {
	h.editSeq++
	n := h.editSeq
	rewrite := func(path string, f func(string) string) error {
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		s := f(string(b))
		if s == string(b) {
			return fmt.Errorf("edit %s: %s unchanged", kind, path)
		}
		return os.WriteFile(path, []byte(s), 0o644)
	}
	switch kind {
	case "leaf-body", "core-body":
		pkg := repo.Core
		if kind == "leaf-body" {
			pkg = repo.Leaf
		}
		return rewrite(filepath.Join(src, pkg, "edit.go"), func(s string) string {
			return saltRE.ReplaceAllString(s, fmt.Sprintf("salt := %d // bench:salt", n))
		})
	case "core-api":
		return rewrite(filepath.Join(src, repo.Core, "edit.go"), func(s string) string {
			return strings.Replace(s, "// bench:api", fmt.Sprintf("// APIEdit%d is an exported function the harness added.\nfunc APIEdit%d() int { return %d }\n\n// bench:api", n, n, n), 1)
		})
	case "core-comment":
		// A comment above the package clause shifts every line of types.go, which declares
		// the package's exported types.
		return rewrite(filepath.Join(src, repo.Core, "types.go"), func(s string) string {
			return fmt.Sprintf("// bench:comment %d\n\n", n) + s
		})
	case "table":
		return rewrite(filepath.Join(src, repo.Table), func(s string) string {
			return s + fmt.Sprintf("x%d=%d\n", n, n)
		})
	}
	return fmt.Errorf("unknown edit %q", kind)
}

// ---- the go command -------------------------------------------------------------------------

var goToolRE = regexp.MustCompile(`/pkg/tool/[^/ ]+/(compile|link|asm|cgo|vet) `)
var goTestRE = regexp.MustCompile(`\.test -test\.`)

func (h *harness) goEnv(gocache string) []string {
	var env []string
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GO") || k == "PATH" || k == "CGO_ENABLED" {
			continue
		}
		env = append(env, kv)
	}
	// The synthetic repository sits inside the book's git checkout. Without -buildvcs=false
	// the go command stamps that checkout's commit into every binary, so a commit made during
	// a run recompiles every main package and relinks every binary. Bazel does not stamp
	// unless asked (--stamp).
	return append(env,
		"PATH="+h.goBin+":"+os.Getenv("PATH"),
		"GOTOOLCHAIN=local", "GOFLAGS=-buildvcs=false", "GOPROXY=off", "GOWORK=off", "GOENV=off",
		"GOCACHE="+gocache,
		"GOMODCACHE="+filepath.Join(h.root, "gomodcache"),
	)
}

// timeCmd runs a command, logs its output, and returns its duration and output.
func (h *harness) timeCmd(logName, dir string, env []string, name string, args ...string) (float64, string, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Env = env
	start := time.Now()
	out, err := cmd.CombinedOutput()
	sec := time.Since(start).Seconds()
	os.WriteFile(filepath.Join(h.logs, logName+".log"), out, 0o644)
	if err != nil {
		tail := string(out)
		if len(tail) > 600 {
			tail = tail[len(tail)-600:]
		}
		err = fmt.Errorf("%s %s: %v\n%s", name, strings.Join(args, " "), err, tail)
	}
	return sec, string(out), err
}

func goCounts(out string) map[string]int {
	m := map[string]int{}
	for _, line := range strings.Split(out, "\n") {
		if g := goToolRE.FindStringSubmatch(line); g != nil {
			m[g[1]]++
		} else if goTestRE.MatchString(line) {
			m["test"]++
		}
	}
	return m
}

func (h *harness) runGo(c config, repo *Repo, dir, src string) error {
	gocache := filepath.Join(dir, "gocache")
	env := h.goEnv(gocache)
	goExe := filepath.Join(h.goBin, "go")
	outDir := filepath.Join(dir, "out-go") + "/"
	measure := func(scenario string, rep int, wd string, args ...string) error {
		sec, out, err := h.timeCmd(fmt.Sprintf("%s-go-%s-%d", c.Name, scenario, rep), wd, env, goExe, args...)
		r := Record{Config: c.Name, Tool: "go", Scenario: scenario, Rep: rep, Seconds: sec, Counts: goCounts(out)}
		if err != nil {
			r.Err = err.Error()
		}
		h.record(r)
		return err
	}
	build := []string{"build", "-x", "-o", outDir, "./..."}

	if c.want("cold") {
		removeAll(gocache)
		// The action graph, with each action's start and end time, goes into the results so
		// that analyze.py can find the build's critical path.
		graph := filepath.Join(h.out, c.Name+"-go-cold-actiongraph.json")
		if err := measure("cold", 0, src, append([]string{"build", "-debug-actiongraph=" + graph}, build[1:]...)...); err != nil {
			return err
		}
		gzipFile(graph)
	}
	if c.want("noop") {
		for i := range h.reps {
			measure("noop", i, src, build...)
		}
		// Without -o the binaries are linked to a temporary directory and discarded, so a
		// no-op "go build ./..." links every main package again.
		for i := range h.reps {
			measure("noop-discard", i, src, "build", "-x", "./...")
		}
	}
	for _, e := range []string{"leaf-body", "core-body", "core-api", "core-comment"} {
		if !c.want(e) {
			continue
		}
		for i := range h.reps {
			if err := h.edit(src, repo, e); err != nil {
				return err
			}
			measure(e, i, src, build...)
		}
	}
	if c.want("test") {
		test := []string{"test", "-x", "-vet=off", "./..."}
		measure("test-first", 0, src, test...)
		for i := range h.reps {
			measure("test-noop", i, src, test...)
		}
		if err := h.edit(src, repo, "core-body"); err != nil {
			return err
		}
		measure("test-core-body", 0, src, test...)
	}
	if c.want("codegen") && repo.Table != "" {
		for i := range 2 {
			if err := h.edit(src, repo, "table"); err != nil {
				return err
			}
			// A repository that checks generated code in has to rerun every generator to
			// find the ones whose inputs changed: go generate has no cache.
			measure("codegen-generate", i, src, "generate", "./...")
			measure("codegen-build", i, src, build...)
		}
	}
	if c.want("clone") {
		// A second checkout at another path with the first checkout's warm GOCACHE, as a CI
		// job that restores a saved cache sees it.
		clone := filepath.Join(dir, "clone")
		if err := copyTree(src, clone); err != nil {
			return err
		}
		measure("clone-warmcache", 0, clone, "build", "-x", "-o", filepath.Join(dir, "out-clone")+"/", "./...")
		h.timeCmd(c.Name+"-go-prime-trimpath", src, env, goExe, "build", "-trimpath", "-o", outDir, "./...")
		measure("clone-warmcache-trimpath", 0, clone, "build", "-x", "-trimpath", "-o", filepath.Join(dir, "out-clone")+"/", "./...")
		removeAll(clone)
	}
	removeAll(gocache)
	return nil
}

// ---- Bazel ----------------------------------------------------------------------------------

var bzProcRE = regexp.MustCompile(`INFO: (\d+) process(?:es)?: ([^\n]*)\.`)
var bzKindRE = regexp.MustCompile(`(\d+) ([a-z][a-z -]*[a-z])`)
var bzCritRE = regexp.MustCompile(`Critical Path: ([\d.]+)s`)

func bazelCounts(out string) map[string]int {
	m := map[string]int{}
	g := bzProcRE.FindAllStringSubmatch(out, -1)
	if len(g) == 0 {
		return m
	}
	last := g[len(g)-1]
	m["processes"], _ = strconv.Atoi(last[1])
	for _, k := range bzKindRE.FindAllStringSubmatch(last[2], -1) {
		n, _ := strconv.Atoi(k[1])
		m[k[2]] += n
	}
	if cp := bzCritRE.FindAllStringSubmatch(out, -1); len(cp) > 0 {
		f, _ := strconv.ParseFloat(cp[len(cp)-1][1], 64)
		m["critical_path_ms"] = int(f * 1000)
	}
	return m
}

type bazelCmd struct {
	h          *harness
	dir        string
	outputBase string // empty: Bazel's default for the workspace path
	flags      []string
}

func (b bazelCmd) args(command string, extra ...string) []string {
	a := []string{"--nohome_rc", "--nosystem_rc", "--output_user_root=" + b.h.userRoot}
	if b.outputBase != "" {
		a = append(a, "--output_base="+b.outputBase)
	}
	a = append(a, command)
	if command == "build" || command == "test" || command == "info" {
		a = append(a, "--repository_cache="+b.h.repoCache)
	}
	if command == "build" || command == "test" {
		a = append(a, b.flags...)
	}
	return append(a, extra...)
}

func (b bazelCmd) run(logName string, command string, extra ...string) (float64, string, error) {
	env := append(os.Environ(), "PATH="+b.h.goBin+":"+os.Getenv("PATH"))
	return b.h.timeCmd(logName, b.dir, env, b.h.bazel, b.args(command, extra...)...)
}

func (h *harness) runBazel(c config, repo *Repo, dir, src string) error {
	bz := bazelCmd{h: h, dir: src, flags: c.BazelFlags}
	defer bz.run(c.Name+"-bazel-shutdown", "shutdown")
	targets := "--target_pattern_file=build_targets.txt"
	measure := func(b bazelCmd, scenario string, rep int, command string, extra ...string) error {
		sec, out, err := b.run(fmt.Sprintf("%s-bazel-%s-%d", c.Name, scenario, rep), command, extra...)
		r := Record{Config: c.Name, Tool: "bazel", Scenario: scenario, Rep: rep, Seconds: sec, Counts: bazelCounts(out)}
		if err != nil {
			r.Err = err.Error()
		}
		h.record(r)
		return err
	}
	profile := func(scenario string) string {
		return "--profile=" + filepath.Join(h.logs, c.Name+"-bazel-"+scenario+".profile.gz")
	}

	// Fetch the external repositories (rules_go, the Go SDK) first, so that "cold" means
	// "no outputs and no server", not "no network".
	if _, _, err := bz.run(c.Name+"-bazel-fetch", "build", "--nobuild", targets); err != nil {
		return err
	}
	if c.want("cold") {
		bz.run(c.Name+"-bazel-clean", "clean")
		bz.run(c.Name+"-bazel-shutdown", "shutdown")
		if err := measure(bz, "cold", 0, "build", targets, profile("cold")); err != nil {
			return err
		}
	}
	if c.want("noop") {
		for i := range h.reps {
			measure(bz, "noop", i, "build", targets)
		}
		// A new server must load every BUILD file and analyze every target again before it
		// can tell that nothing changed: the first build after a restart or on a CI runner
		// whose output base survived but whose server did not.
		for i := range h.reps {
			bz.run(c.Name+"-bazel-shutdown", "shutdown")
			measure(bz, "noop-cold-server", i, "build", targets)
		}
		for i := range h.reps {
			bz.run(c.Name+"-bazel-shutdown", "shutdown")
			measure(bz, "analysis-cold-server", i, "build", "--nobuild", targets)
		}
		measure(bz, "noop", h.reps, "build", targets) // warm the server again
	}
	for _, e := range []string{"leaf-body", "core-body", "core-api", "core-comment"} {
		if !c.want(e) {
			continue
		}
		for i := range h.reps {
			if err := h.edit(src, repo, e); err != nil {
				return err
			}
			extra := []string{targets}
			if e == "core-body" && i == 0 {
				extra = append(extra, profile("core-body"))
			}
			measure(bz, e, i, "build", extra...)
		}
	}
	// Keep the cold, incremental and first test profiles (Chrome trace format, with Bazel's
	// critical path in it) for analyze.py and the book. Bazel 9 removed the analyze-profile
	// command.
	keep := func(scenario string) {
		p := filepath.Join(h.logs, c.Name+"-bazel-"+scenario+".profile.gz")
		if b, err := os.ReadFile(p); err == nil {
			os.WriteFile(filepath.Join(h.out, filepath.Base(p)), b, 0o644)
		}
	}
	keep("cold")
	keep("core-body")
	if c.want("noop") {
		_, out, err := bz.run(c.Name+"-bazel-heap", "info", "used-heap-size-after-gc")
		if err == nil {
			if v, ok := parseMB(out); ok {
				h.record(Record{Config: c.Name, Tool: "bazel", Scenario: "server-heap-after-build", Value: v, Unit: "MB"})
			}
		}
	}
	if c.want("test") {
		measure(bz, "test-first", 0, "test", "//...", profile("test-first"))
		keep("test-first")
		for i := range h.reps {
			measure(bz, "test-noop", i, "test", "//...")
		}
		if err := h.edit(src, repo, "core-body"); err != nil {
			return err
		}
		measure(bz, "test-core-body", 0, "test", "//...")
		_, out, err := bz.run(c.Name+"-bazel-heap", "info", "used-heap-size-after-gc")
		if err == nil {
			if v, ok := parseMB(out); ok {
				h.record(Record{Config: c.Name, Tool: "bazel", Scenario: "server-heap-after-test", Value: v, Unit: "MB"})
			}
		}
	}
	if c.want("codegen") && repo.Table != "" {
		for i := range 2 {
			if err := h.edit(src, repo, "table"); err != nil {
				return err
			}
			measure(bz, "codegen-build", i, "build", targets)
		}
	}
	if c.want("clone") {
		// Populate a disk cache from a clean build, then build a second checkout at another
		// path with a new output base: a CI runner with a shared cache and nothing else.
		cache := filepath.Join(dir, "disk-cache")
		bz.run(c.Name+"-bazel-clean", "clean")
		if _, _, err := bz.run(c.Name+"-bazel-prime-cache", "build", targets, "--disk_cache="+cache); err != nil {
			return err
		}
		bz.run(c.Name+"-bazel-shutdown", "shutdown")
		clone := filepath.Join(dir, "clone")
		if err := copyTree(src, clone); err != nil {
			return err
		}
		cb := bazelCmd{h: h, dir: clone, outputBase: filepath.Join(dir, "ob-clone"), flags: c.BazelFlags}
		measure(cb, "clone-diskcache", 0, "build", targets, "--disk_cache="+cache)
		cb.run(c.Name+"-bazel-shutdown", "shutdown")
		removeAll(cb.outputBase)
		removeAll(clone)
		removeAll(cache)
	}
	return nil
}

func parseMB(s string) (float64, bool) {
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasSuffix(line, "MB") {
			f, err := strconv.ParseFloat(strings.TrimSuffix(line, "MB"), 64)
			return f, err == nil
		}
	}
	return 0, false
}

// ---- the toolchain's workloads --------------------------------------------------------------

// runWorkload builds and tests the repository once more with every compile, link and test
// process wrapped by "bench toolexec", which records its CPU time, wall time and peak memory.
func (h *harness) runWorkload(c config, repo *Repo, dir, out string) error {
	src := filepath.Join(dir, "src")
	if err := removeAll(src); err != nil {
		return err
	}
	if _, err := repo.write(src); err != nil {
		return err
	}
	gocache := filepath.Join(dir, "gocache-workload")
	removeAll(gocache)
	env := append(h.goEnv(gocache), "BENCH_CONFIG="+c.Name)
	log := filepath.Join(out, "workload.jsonl")
	goExe := filepath.Join(h.goBin, "go")
	wrap := h.self + " toolexec " + log
	graph := filepath.Join(out, c.Name+"-go-workload-actiongraph.json")
	sec, _, err := h.timeCmd(c.Name+"-go-workload-build", src, env, goExe, "build", "-debug-actiongraph="+graph, "-toolexec", wrap, "-o", filepath.Join(dir, "out-workload")+"/", "./...")
	h.record(Record{Config: c.Name, Tool: "go", Scenario: "workload-build", Seconds: sec, Err: errString(err)})
	if err != nil {
		return err
	}
	gzipFile(graph)
	sec, _, err = h.timeCmd(c.Name+"-go-workload-test", src, env, goExe, "test", "-vet=off", "-toolexec", wrap, "-exec", wrap, "./...")
	h.record(Record{Config: c.Name, Tool: "go", Scenario: "workload-test", Seconds: sec, Err: errString(err)})
	removeAll(gocache)
	return err
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// ---- files ----------------------------------------------------------------------------------

// removeAll removes a tree, including the read-only directories Bazel leaves behind.
func removeAll(path string) error {
	if _, err := os.Lstat(path); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	exec.Command("chmod", "-R", "u+w", path).Run()
	return os.RemoveAll(path)
}

// copyTree copies a source tree, skipping Bazel's convenience symlinks.
func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		if strings.HasPrefix(rel, "bazel-") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, b, 0o644)
	})
}
