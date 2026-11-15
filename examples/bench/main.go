// Command bench generates synthetic Go repositories and measures how long the go command and
// Bazel take to build and test them. Chapters 6 and 8 of the book report its results.
//
//	bench gen -pkgs 1000 -o /tmp/synth   generate one repository
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: bench gen [flags]")
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "gen":
		err = cmdGen(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "bench:", err)
		os.Exit(1)
	}
}
