// Package greet renders a greeting from an embedded template.
package greet

import (
	_ "embed"
	"strings"
	"text/template"
)

//go:embed greeting.tmpl
var greetingTmpl string

var tmpl = template.Must(template.New("greeting").Parse(greetingTmpl))

// Greet returns the greeting for each name, one per line.
func Greet(names ...string) string {
	var b strings.Builder
	for _, n := range names {
		_ = tmpl.Execute(&b, n)
	}
	return b.String()
}
