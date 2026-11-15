package greet

import (
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestGreet(t *testing.T) {
	got := Greet("Ada", "Ken")
	want := "Hello, Ada!\nHello, Ken!\n"
	if diff := cmp.Diff(want, got); diff != "" {
		t.Errorf("Greet mismatch (-want +got):\n%s", diff)
	}
}
