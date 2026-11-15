# Website for the book. content/ is generated from ../README.md and
# ../book/*.md by make.go; public/ is the built site. Neither is checked in.
#
#   make build                 generate content/ and build public/
#   make build BASEURL=...     the same for another host or path
#   make serve                 live preview at http://localhost:1313/bazel-for-go/,
#                              regenerating content/ when README.md or book/ changes
#                              (rendered in memory, so public/ is left alone)
#   make clean                 remove everything generated
#   make deploy                build the last commit and publish it at $(BASEURL)

BASEURL ?= https://changkun.de/bazel-for-go/
HUGO    ?= hugo
PORT    ?= 1313
HOST    ?= changkunde
DEST    ?= /www/changkun.de/bazel-for-go/
SNAPSHOT ?= ../.cache/snapshot

.PHONY: all build content serve clean deploy

all: build

content:
	go run make.go

build: clean content
	$(HUGO) --minify --baseURL "$(BASEURL)"

serve:
	go run make.go -watch $(HUGO) server --renderToMemory --port $(PORT) --baseURL "$(BASEURL)"

clean:
	rm -rf content public resources .hugo_build.lock

# Published builds come from the last commit, never the working tree, so a chapter that is
# still being written is not published half-done.
deploy:
	rm -rf $(SNAPSHOT) && mkdir -p $(SNAPSHOT)
	git -C .. archive HEAD | tar -x -C $(SNAPSHOT)
	$(MAKE) -C $(SNAPSHOT)/website build BASEURL="$(BASEURL)"
	rsync -az --delete $(SNAPSHOT)/website/public/ $(HOST):$(DEST)
	@echo "published $$(git -C .. rev-parse --short HEAD) to $(BASEURL)"
