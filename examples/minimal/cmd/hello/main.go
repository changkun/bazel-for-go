// Command hello prints a greeting for each argument.
package main

import (
	"fmt"
	"os"

	"example.com/minimal/internal/greet"
)

func main() {
	names := os.Args[1:]
	if len(names) == 0 {
		names = []string{"Bazel"}
	}
	fmt.Print(greet.Greet(names...))
}
