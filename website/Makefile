# Website for the book. content/ is generated from ../README.md and
# ../book/*.md by make.go; public/ is the built site. Neither is checked in.
#
#   make build                 generate content/ and build public/
#   make build BASEURL=...     the same for another host or path
#   make serve                 live preview at http://localhost:1313/bazel-for-go/,
#                              regenerating content/ when README.md or book/ changes
#                              (rendered in memory, so public/ is left alone)
#   make clean                 remove everything generated

BASEURL ?= https://changkun.de/bazel-for-go/
HUGO    ?= hugo
PORT    ?= 1313

.PHONY: all build content serve clean

all: build

content:
	go run make.go

build: clean content
	$(HUGO) --minify --baseURL "$(BASEURL)"

serve:
	go run make.go -watch $(HUGO) server --renderToMemory --port $(PORT) --baseURL "$(BASEURL)"

clean:
	rm -rf content public resources .hugo_build.lock
