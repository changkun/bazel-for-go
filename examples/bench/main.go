// Command bench generates synthetic Go repositories and measures how long the go command and
// Bazel take to build and test them. The book cites its results; Appendix A reports them in full.
//
//	bench gen -pkgs 1000 -o /tmp/synth   generate one repository
//	bench run -configs n100,n1000        run the measurement plan (see run.go)
//	uv run analyze.py results/<date>     tables and figures (Python: pandas, networkx, matplotlib)
//	bench toolexec <log> <tool> args...  record one toolchain process (see probe.go)
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: bench gen|run|toolexec [flags]")
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "gen":
		err = cmdGen(os.Args[2:])
	case "run":
		err = cmdRun(os.Args[2:])
	case "toolexec":
		err = cmdToolexec(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "bench:", err)
		os.Exit(1)
	}
}
