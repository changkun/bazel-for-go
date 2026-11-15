package golden

import (
	"os"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestReport(t *testing.T) {
	want, err := os.ReadFile("testdata/report.golden")
	if err != nil {
		t.Fatal(err)
	}
	if diff := cmp.Diff(string(want), Report("builds", 3)); diff != "" {
		t.Errorf("Report mismatch (-want +got):\n%s", diff)
	}
}
