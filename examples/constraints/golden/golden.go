// Package golden formats a report that its test compares with a file in testdata.
package golden

import "fmt"

// Report returns a one-line report.
func Report(name string, n int) string {
	return fmt.Sprintf("%s: %d\n", name, n)
}
