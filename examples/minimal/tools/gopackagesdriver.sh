#!/usr/bin/env bash
# gopls asks this script for package data instead of running "go list".
exec bazel run -- @rules_go//go/tools/gopackagesdriver "${@}"
