// Command version prints the version and the platform it was built for.
package main

import (
	"fmt"
	"runtime"

	"example.com/constraints/version"
)

func main() {
	fmt.Println(version.String(), runtime.GOOS+"/"+runtime.GOARCH)
}
