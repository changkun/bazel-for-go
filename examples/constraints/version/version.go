// Package version reports a version string that a generator writes.
package version

//go:generate go run ../tools/genversion -o version_gen.go

// String returns the version.
func String() string { return generated }
