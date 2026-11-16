package main

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// cmdToolexec runs one toolchain process (compile, link, asm, cgo, or a test binary) and
// appends its resource use to a JSON-lines log. The go command invokes it through -toolexec
// and -exec:
//
//	go build -toolexec "bench toolexec log.jsonl" ./...
func cmdToolexec(args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("usage: bench toolexec <log> <tool> [args...]")
	}
	log, tool, targs := args[0], args[1], args[2:]
	cmd := exec.Command(tool, targs...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	start := time.Now()
	err := cmd.Run()
	wall := time.Since(start)
	// The go command asks each tool for its version to key the cache; do not record that.
	if len(targs) > 0 && strings.HasPrefix(targs[0], "-V") {
		return exitWith(err)
	}
	if cmd.ProcessState != nil {
		ru := cmd.ProcessState.SysUsage().(*syscall.Rusage)
		maxrss := int64(ru.Maxrss)
		if runtime.GOOS == "linux" {
			maxrss *= 1024 // Linux reports kilobytes, Darwin bytes
		}
		name := filepath.Base(tool)
		if strings.HasSuffix(name, ".test") {
			name = "test"
		}
		rec := map[string]any{
			"config":  os.Getenv("BENCH_CONFIG"),
			"tool":    name,
			"target":  target(name, targs),
			"wall_ms": ms(wall),
			"user_ms": ms(time.Duration(ru.Utime.Nano())),
			"sys_ms":  ms(time.Duration(ru.Stime.Nano())),
			"maxrss":  maxrss,
			"c":       flagValue(targs, "-c"),
		}
		if b, err := json.Marshal(rec); err == nil {
			if f, err := os.OpenFile(log, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
				f.Write(append(b, '\n'))
				f.Close()
			}
		}
	}
	return exitWith(err)
}

// ms reports d in milliseconds to the microsecond, so short tools do not round to zero.
func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

func exitWith(err error) error {
	if ee, ok := err.(*exec.ExitError); ok {
		os.Exit(ee.ExitCode())
	}
	return err
}

func target(tool string, args []string) string {
	switch tool {
	case "compile", "asm", "cgo":
		return flagValue(args, "-p")
	case "link":
		return filepath.Base(flagValue(args, "-o"))
	}
	return ""
}

func flagValue(args []string, name string) string {
	for i, a := range args {
		if a == name && i+1 < len(args) {
			return args[i+1]
		}
		if v, ok := strings.CutPrefix(a, name+"="); ok {
			return v
		}
	}
	return ""
}

// gzipFile compresses path to path.gz and removes path.
func gzipFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	f, err := os.Create(path + ".gz")
	if err != nil {
		return err
	}
	zw := gzip.NewWriter(f)
	zw.Write(b)
	if err := zw.Close(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Remove(path)
}
