// Command make generates the Hugo content tree (content/) for the book's
// website from the repository's Markdown:
//
//   - ../README.md is the single source of truth for the book's structure. Its
//     "## Contents" section lists the parts as bold lines (**Part I. ...**) and
//     under each part the chapters as list items linking to book/*.md.
//   - ../book/*.md are the chapters, each beginning with a "# Title" heading.
//
// It writes:
//
//   - content/_index.md: the home page, the README's title and introduction
//     followed by its Contents section with links rewritten to site URLs;
//   - content/<part>/_index.md: one page per part (part1, part2, ...,
//     appendix) listing its chapters;
//   - content/<part>/<chapter>/index.md: one page per chapter, served at
//     /<chapter>/ (the file name without .md), so a chapter's URL does not
//     change when it moves to another part.
//
// Chapters whose file does not exist yet are skipped with a warning; they are
// listed as plain text, not links, on the home and part pages. A part without
// any existing chapter is skipped as well.
//
// Links are rewritten so the site works under any baseURL: links to chapters
// (book/x.md, x.md, ./x.md#anchor) become page-relative site URLs, links to
// other repository files become links to the file on GitHub, local images
// are copied next to the page that shows them, and an SVG figure on a line of
// its own (![Figure 4.2: caption](figures/04-x.svg)) is inlined into the page
// with its alt text as the caption (see inlineSVG). External URLs and
// footnotes are left as they are.
//
// A chapter with a film, ../films/<chapter>.js (see films/README.md), shows
// it under its title: a figure that films/player.js fills, and a link to the
// MP4 that `make films` renders. config.toml publishes ../films at /films/.
//
// Usage:
//
//	go run make.go                       # generate content/ once
//	go run make.go -watch [cmd args...]  # regenerate on change while cmd runs
package main

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	repoURL = "https://github.com/changkun/bazel-for-go"
	branch  = "main"
)

var (
	rootDir = flag.String("root", "..", "repository root")
	outDir  = flag.String("out", "content", "output directory (replaced entirely)")
	watch   = flag.Bool("watch", false, "regenerate whenever README.md, book/ or films/ changes; with arguments, run them as a command and stop when it exits")
)

func main() {
	log.SetFlags(0)
	log.SetPrefix("make.go: ")
	flag.Parse()
	if !*watch {
		if err := generate(); err != nil {
			log.Fatal(err)
		}
		return
	}
	os.Exit(watchLoop(flag.Args()))
}

// generate builds the whole content tree in memory and syncs it to outDir.
func generate() error {
	b, err := parseBook()
	if err != nil {
		return err
	}
	g := &generator{book: b, files: map[string][]byte{}}
	if err := g.run(); err != nil {
		return err
	}
	return syncDir(*outDir, g.files)
}

// ---------------------------------------------------------------------------
// The book's structure, from README.md.

type book struct {
	title    string // the README's "# " heading
	intro    string // the README between the title and the first "## " heading
	contents string // the body of the "## Contents" section
	parts    []*part
	chapters map[string]*chapter // by repository path, "book/01-x.md"
}

type part struct {
	title    string // "Part I. The question"
	slug     string // "part1"; "" for chapters listed before the first part
	items    string // the part's lines from the Contents section
	chapters []*chapter
}

type chapter struct {
	label string // link text in the README, "1. What a build system is for"
	file  string // repository path, "book/01-what-a-build-system-is-for.md"
	slug  string // "01-what-a-build-system-is-for", also the URL
	part  *part
	src   []byte // nil when the file does not exist
}

func (p *part) present() bool {
	for _, c := range p.chapters {
		if c.src != nil {
			return true
		}
	}
	return false
}

var (
	reH1        = regexp.MustCompile(`^#\s+(.+?)\s*#*\s*$`)
	reH2        = regexp.MustCompile(`^##\s+`)
	rePartLine  = regexp.MustCompile(`^\*\*(.+?)\*\*\s*$`)
	reListItem  = regexp.MustCompile(`^\s{0,3}[-*+]\s+`)
	reItemLink  = regexp.MustCompile(`^\s{0,3}[-*+]\s+\[((?:[^\[\]]|\[[^\[\]]*\])+)\]\(\s*<?([^)\s>]+)>?\s*\)`)
	rePartRoman = regexp.MustCompile(`^(?i)part\s+([ivxlcdm]+|\d+)\b`)
)

func parseBook() (*book, error) {
	readme, err := os.ReadFile(filepath.Join(*rootDir, "README.md"))
	if err != nil {
		return nil, err
	}
	b := &book{chapters: map[string]*chapter{}}
	lines := strings.Split(strings.ReplaceAll(string(readme), "\r\n", "\n"), "\n")

	// Title, introduction and the Contents section. Fenced code is skipped so
	// a "# comment" in a shell block is not taken for a heading.
	var intro, contents []string
	state := "pre" // pre, intro, other, contents
	fence := ""
	for _, l := range lines {
		if f := fenceMarker(l); f != "" || fence != "" {
			fence = nextFence(fence, f)
			switch state {
			case "intro":
				intro = append(intro, l)
			case "contents":
				contents = append(contents, l)
			}
			continue
		}
		switch {
		case state == "pre" && reH1.MatchString(l):
			b.title = reH1.FindStringSubmatch(l)[1]
			state = "intro"
		case reH2.MatchString(l):
			if strings.EqualFold(strings.TrimSpace(reH2.ReplaceAllString(l, "")), "Contents") {
				state = "contents"
			} else {
				state = "other"
			}
		case state == "intro":
			intro = append(intro, l)
		case state == "contents":
			contents = append(contents, l)
		}
	}
	if b.title == "" {
		return nil, errors.New("README.md: no \"# \" title")
	}
	if contents == nil {
		return nil, errors.New("README.md: no \"## Contents\" section")
	}
	b.intro = strings.TrimSpace(strings.Join(intro, "\n"))
	b.contents = strings.TrimSpace(strings.Join(contents, "\n"))

	// Parts and chapters.
	cur := &part{} // chapters before the first part sit at the top level
	b.parts = append(b.parts, cur)
	for _, l := range contents {
		if m := rePartLine.FindStringSubmatch(l); m != nil {
			cur = &part{title: strings.TrimSpace(m[1])}
			cur.slug = partSlug(cur.title)
			b.parts = append(b.parts, cur)
			continue
		}
		cur.items += l + "\n"
		m := reItemLink.FindStringSubmatch(l)
		if m == nil {
			if reListItem.MatchString(l) {
				log.Printf("warning: README.md: Contents item without a link: %q", strings.TrimSpace(l))
			}
			continue
		}
		dest, _, _ := strings.Cut(m[2], "#")
		file := path.Clean(dest)
		if !strings.HasPrefix(file, "book/") || path.Ext(file) != ".md" {
			continue
		}
		if b.chapters[file] != nil {
			return nil, fmt.Errorf("README.md: %s is listed twice in Contents", file)
		}
		c := &chapter{
			label: strings.TrimSpace(m[1]),
			file:  file,
			slug:  strings.TrimSuffix(path.Base(file), ".md"),
			part:  cur,
		}
		src, err := os.ReadFile(filepath.Join(*rootDir, filepath.FromSlash(file)))
		switch {
		case err == nil:
			c.src = bytes.ReplaceAll(src, []byte("\r\n"), []byte("\n"))
		case errors.Is(err, fs.ErrNotExist):
			log.Printf("warning: %s does not exist yet; skipping %q", file, c.label)
		default:
			return nil, err
		}
		cur.chapters = append(cur.chapters, c)
		b.chapters[file] = c
	}

	// URLs must not collide: parts and chapters all live at /<slug>/.
	seen := map[string]string{}
	for _, p := range b.parts {
		names := []string{}
		if p.slug != "" {
			names = append(names, p.slug)
		}
		for _, c := range p.chapters {
			names = append(names, c.slug)
		}
		for i, n := range names {
			what := fmt.Sprintf("part %q", p.title)
			if p.slug == "" || i > 0 {
				what = "a chapter of " + what
			}
			if prev, ok := seen[n]; ok {
				return nil, fmt.Errorf("URL /%s/ is used by both %s and %s", n, prev, what)
			}
			seen[n] = what
		}
	}
	return b, nil
}

// partSlug turns "Part III. Internals" into "part3", "Appendix" into
// "appendix", and anything else into a lower-case, dash-separated slug.
func partSlug(title string) string {
	if m := rePartRoman.FindStringSubmatch(title); m != nil {
		if n, err := strconv.Atoi(m[1]); err == nil {
			return "part" + strconv.Itoa(n)
		}
		if n := roman(m[1]); n > 0 {
			return "part" + strconv.Itoa(n)
		}
	}
	return slugify(title)
}

func roman(s string) int {
	val := map[byte]int{'i': 1, 'v': 5, 'x': 10, 'l': 50, 'c': 100, 'd': 500, 'm': 1000}
	s = strings.ToLower(s)
	n := 0
	for i := 0; i < len(s); i++ {
		v := val[s[i]]
		if i+1 < len(s) && v < val[s[i+1]] {
			n -= v
		} else {
			n += v
		}
	}
	return n
}

func slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			b.WriteRune(r)
			dash = false
		} else {
			dash = true
		}
	}
	return b.String()
}

// ---------------------------------------------------------------------------
// Pages.

type generator struct {
	book  *book
	files map[string][]byte // output path (slash-separated, under outDir) -> bytes
}

// page is where a piece of Markdown ends up, which decides how its links
// are written.
type page struct {
	srcDir   string         // repository directory the source's links are relative to
	depth    int            // URL depth below the site root: 0 home, 1 part or chapter
	assetDir string         // output directory for copied images; "" means none
	name     string         // for warnings
	figures  map[string]int // figure ids used so far on the page
	inLink   bool           // rewriting a link's text, where no figure can go
}

func (pg page) linkText() page { pg.inLink = true; return pg }

func (g *generator) run() error {
	b := g.book

	// Reading order for previous/next links: each part page, then its
	// chapters. Home is not part of the chain.
	type node struct {
		ref   string // Hugo content path, resolved by partials/pagenav.html
		write func(prev, next string) error
	}
	var order []node
	weight := 0
	for _, p := range b.parts {
		if !p.present() {
			if p.slug != "" {
				log.Printf("warning: %q has no chapters yet; skipping the part", p.title)
			}
			continue
		}
		weight += 100
		if p.slug != "" {
			p, w := p, weight
			order = append(order, node{"/" + p.slug, func(prev, next string) error {
				return g.partPage(p, w, prev, next)
			}})
		}
		for i, c := range p.chapters {
			if c.src == nil {
				continue
			}
			c, w := c, weight+i+1
			order = append(order, node{"/" + path.Join(c.part.slug, c.slug), func(prev, next string) error {
				return g.chapterPage(c, w, prev, next)
			}})
		}
	}
	for i, n := range order {
		var prev, next string
		if i > 0 {
			prev = order[i-1].ref
		}
		if i+1 < len(order) {
			next = order[i+1].ref
		}
		if err := n.write(prev, next); err != nil {
			return err
		}
	}
	return g.homePage()
}

func (g *generator) homePage() error {
	b := g.book
	pg := page{srcDir: ".", depth: 0, assetDir: ".", name: "README.md", figures: map[string]int{}}

	// Bold part lines in Contents link to their part page. The links are
	// added after rewriting, which would take them for repository paths.
	var contents []string
	byTitle := map[string]*part{}
	for _, p := range b.parts {
		byTitle[p.title] = p
	}
	for _, l := range strings.Split(g.rewrite(b.contents, pg), "\n") {
		if m := rePartLine.FindStringSubmatch(l); m != nil {
			if p := byTitle[strings.TrimSpace(m[1])]; p != nil && p.slug != "" && p.present() {
				l = "**[" + strings.TrimSpace(m[1]) + "](" + p.slug + "/)**"
			}
		}
		contents = append(contents, l)
	}

	var body strings.Builder
	fmt.Fprintf(&body, "# %s\n\n", b.title)
	if b.intro != "" {
		body.WriteString(g.rewrite(b.intro, pg) + "\n\n")
	}
	body.WriteString("## Contents\n\n" + strings.Join(contents, "\n") + "\n")

	fm := frontMatter{{"title", b.title}}
	if d := firstParagraph(b.intro); d != "" {
		fm = append(fm, kv{"description", d})
	}
	g.files["_index.md"] = fm.wrap(body.String())
	return nil
}

func (g *generator) partPage(p *part, weight int, prev, next string) error {
	pg := page{srcDir: ".", depth: 1, name: "README.md (" + p.title + ")", figures: map[string]int{}}
	body := fmt.Sprintf("# %s\n\n%s\n", p.title, g.rewrite(strings.TrimSpace(p.items), pg))
	fm := frontMatter{
		{"title", p.title},
		{"weight", weight},
		{"bookCollapseSection", true},
		{"prev", prev},
		{"next", next},
	}
	g.files[p.slug+"/_index.md"] = fm.wrap(body)
	return nil
}

func (g *generator) chapterPage(c *chapter, weight int, prev, next string) error {
	dir := path.Join(c.part.slug, c.slug)
	pg := page{srcDir: path.Dir(c.file), depth: 1, assetDir: dir, name: c.file, figures: map[string]int{}}
	src := string(c.src)
	if strings.HasPrefix(src, "---\n") {
		log.Printf("warning: %s: starts with front matter, which make.go replaces", c.file)
		if i := strings.Index(src[4:], "\n---\n"); i >= 0 {
			src = src[4+i+5:]
		}
	}
	title := chapterTitle(src)
	if title == "" {
		log.Printf("warning: %s: no \"# \" heading; using the README's %q", c.file, c.label)
		title = c.label
	}
	fm := frontMatter{
		{"title", title},
		{"linkTitle", c.label},
		{"weight", weight},
		{"url", "/" + c.slug + "/"},
		{"prev", prev},
		{"next", next},
	}
	if c.label == title {
		fm = append(fm[:1], fm[2:]...)
	}
	body := g.rewrite(src, pg)
	if film := filmHTML(c.slug, pg.depth); film != "" {
		body = afterTitle(body, film)
	}
	g.files[dir+"/index.md"] = fm.wrap(body)
	return nil
}

// filmHTML returns the HTML that plays the chapter's film at the top of its
// page, or "" if the chapter has none. The links are relative to a page
// depth levels below the site root.
func filmHTML(slug string, depth int) string {
	if _, err := os.Stat(filepath.Join(*rootDir, "films", slug+".js")); err != nil {
		return ""
	}
	films := strings.Repeat("../", depth) + "films/"
	return `<figure class="film" data-film="` + slug + `"><div class="film-frame"></div>` +
		`<figcaption class="film-bar"><a class="film-download" href="` + films + slug + `.mp4" download>Download MP4</a></figcaption></figure>` + "\n" +
		`<script type="module" src="` + films + `player.js"></script>`
}

// afterTitle inserts the HTML block html after the first "# " heading of
// md, outside fenced code, or at the start if there is none.
func afterTitle(md, html string) string {
	lines := strings.SplitAfter(md, "\n")
	fence := ""
	for i, l := range lines {
		if f := fenceMarker(l); f != "" || fence != "" {
			fence = nextFence(fence, f)
			continue
		}
		if reH1.MatchString(strings.TrimRight(l, "\n")) {
			return strings.Join(lines[:i+1], "") + "\n" + html + "\n\n" + strings.Join(lines[i+1:], "")
		}
	}
	return html + "\n\n" + md
}

// chapterTitle returns the text of the first "# " heading outside fenced
// code, without Markdown emphasis, code and link syntax.
func chapterTitle(src string) string {
	fence := ""
	for _, l := range strings.Split(src, "\n") {
		if f := fenceMarker(l); f != "" || fence != "" {
			fence = nextFence(fence, f)
			continue
		}
		if m := reH1.FindStringSubmatch(l); m != nil {
			return plainInline(m[1])
		}
	}
	return ""
}

var (
	reInlineLink = regexp.MustCompile(`!?\[([^\]]*)\]\([^)]*\)`)
	reEmphasis   = regexp.MustCompile("[`]+|\\*\\*|__|(^|\\W)[*_]|[*_](\\W|$)")
)

// plainInline strips the common inline Markdown from a one-line string.
func plainInline(s string) string {
	s = reInlineLink.ReplaceAllString(s, "$1")
	s = reEmphasis.ReplaceAllString(s, "$1$2")
	return strings.Join(strings.Fields(s), " ")
}

func firstParagraph(md string) string {
	para, _, _ := strings.Cut(strings.TrimSpace(md), "\n\n")
	return plainInline(strings.ReplaceAll(para, "\n", " "))
}

// ---------------------------------------------------------------------------
// Front matter.

type kv struct {
	k string
	v any
}

type frontMatter []kv

func (fm frontMatter) wrap(body string) []byte {
	var b bytes.Buffer
	b.WriteString("---\n# Generated by website/make.go; edit the book, not this file.\n")
	for _, e := range fm {
		switch v := e.v.(type) {
		case string:
			if v == "" {
				continue
			}
			// A Go quoted string is a valid YAML double-quoted scalar for
			// the printable text a title holds.
			fmt.Fprintf(&b, "%s: %s\n", e.k, strconv.Quote(v))
		default:
			fmt.Fprintf(&b, "%s: %v\n", e.k, v)
		}
	}
	b.WriteString("---\n\n")
	b.WriteString(strings.TrimLeft(body, "\n"))
	if !strings.HasSuffix(body, "\n") {
		b.WriteByte('\n')
	}
	return b.Bytes()
}

// ---------------------------------------------------------------------------
// Link rewriting.

var (
	// [text](dest "title") and ![alt](dest), one level of nested brackets in
	// the text, balanced parentheses in the destination.
	reLink = regexp.MustCompile(`(!?)\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(([ \t]*)(<[^<>\n]*>|[^\s()<>]+(?:\([^\s()]*\)[^\s()<>]*)*)((?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*)\)`)
	// [label]: dest, but not a footnote definition ([^label]: text)
	reRefDef = regexp.MustCompile(`(?m)^( {0,3}\[[^\]\n^][^\]\n]*\]:[ \t]*)(<[^<>\n]*>|\S+)`)
	// <img src="..."> and <a href="..."> in raw HTML.
	reHTMLAttr = regexp.MustCompile(`(?i)(<(?:img|a|source)\b[^>]*?\s(?:src|href)=)("[^"]*"|'[^']*')`)
	reScheme   = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.-]*:`)
	reOrdered  = regexp.MustCompile(`^(\s*(?:[-*+]\s+)?)(\d+)([.)])`)
)

// rewrite rewrites the links in a Markdown document (or fragment) for page
// pg. Fenced code blocks and code spans are left alone.
func (g *generator) rewrite(md string, pg page) string {
	var out strings.Builder
	lines := strings.SplitAfter(md, "\n")
	var run []string // consecutive lines outside fenced code
	flush := func() {
		out.WriteString(g.rewriteText(strings.Join(run, ""), pg))
		run = run[:0]
	}
	fence := ""
	for _, l := range lines {
		if f := fenceMarker(l); f != "" || fence != "" {
			if fence == "" {
				flush()
			}
			fence = nextFence(fence, f)
			out.WriteString(l)
			continue
		}
		run = append(run, l)
	}
	flush()
	return out.String()
}

// rewriteText rewrites links in text that holds no fenced code. Code spans
// are masked first so that nothing inside them matches, while a code span
// inside a link's text keeps the link intact.
func (g *generator) rewriteText(s string, pg page) string {
	masked := maskCodeSpans(s)
	var edits []edit
	for _, m := range reLink.FindAllStringSubmatchIndex(masked, -1) {
		img := m[3] > m[2]
		text := s[m[4]:m[5]]
		dest := s[m[8]:m[9]]
		if img && !pg.inLink {
			if e, ok := g.figure(s, m[0], m[1], text, dest, pg); ok {
				edits = append(edits, e)
				continue
			}
		}
		nd, ok := g.resolve(dest, img, pg)
		var repl string
		switch {
		case !ok:
			// A chapter that does not exist yet: keep the text, drop the
			// link, and stop a leading "1." from becoming a list marker.
			repl = g.rewriteText(text, pg.linkText())
			if lineStart(s, m[0]) {
				repl = reOrdered.ReplaceAllString(repl, `$1$2\$3`)
			}
		default:
			if !img {
				text = g.rewriteText(text, pg.linkText()) // e.g. [![badge](img)](link)
			}
			repl = s[m[0]:m[4]] + text + "](" + s[m[6]:m[7]] + nd + s[m[10]:m[11]] + ")"
		}
		edits = append(edits, edit{m[0], m[1], repl})
	}
	for _, m := range reRefDef.FindAllStringSubmatchIndex(masked, -1) {
		if overlaps(edits, m[0], m[1]) {
			continue
		}
		nd, ok := g.resolve(s[m[4]:m[5]], false, pg)
		if !ok {
			// The uses ([text][label]) cannot be unlinked from here; point
			// them at the chapter's file on GitHub until it exists.
			nd = g.githubURL(s[m[4]:m[5]], pg)
		}
		edits = append(edits, edit{m[4], m[5], nd})
	}
	for _, m := range reHTMLAttr.FindAllStringSubmatchIndex(masked, -1) {
		if overlaps(edits, m[0], m[1]) {
			continue
		}
		q := s[m[4]:m[5]]
		img := strings.HasPrefix(strings.ToLower(s[m[2]:m[3]]), "<img") || strings.HasPrefix(strings.ToLower(s[m[2]:m[3]]), "<source")
		nd, ok := g.resolve(q[1:len(q)-1], img, pg)
		if !ok {
			continue
		}
		edits = append(edits, edit{m[4], m[5], q[:1] + nd + q[:1]})
	}
	if len(edits) == 0 {
		return s
	}
	sort.Slice(edits, func(i, j int) bool { return edits[i].start < edits[j].start })
	var out strings.Builder
	last := 0
	for _, e := range edits {
		out.WriteString(s[last:e.start])
		out.WriteString(e.repl)
		last = e.end
	}
	out.WriteString(s[last:])
	return out.String()
}

// edit replaces s[start:end] with repl.
type edit struct {
	start, end int
	repl       string
}

func overlaps(edits []edit, start, end int) bool {
	for _, e := range edits {
		if start < e.end && e.start < end {
			return true
		}
	}
	return false
}

// resolve maps a link destination written in the repository to one that
// works on page pg. ok is false for a link to a chapter that does not exist
// yet, which the caller unlinks.
func (g *generator) resolve(dest string, image bool, pg page) (string, bool) {
	d := strings.TrimSuffix(strings.TrimPrefix(dest, "<"), ">")
	if d == "" || strings.HasPrefix(d, "#") || strings.HasPrefix(d, "//") || reScheme.MatchString(d) || strings.Contains(d, "{{") {
		return dest, true
	}
	p, frag := d, ""
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p, frag = p[:i], p[i:]
	}
	if u, err := url.PathUnescape(p); err == nil {
		p = u
	}
	var repo string
	if strings.HasPrefix(p, "/") {
		repo = path.Clean(strings.TrimPrefix(p, "/")) // GitHub: relative to the repository root
	} else {
		repo = path.Clean(path.Join(pg.srcDir, p))
	}
	if repo == ".." || strings.HasPrefix(repo, "../") {
		log.Printf("warning: %s: link %q points outside the repository; left as is", pg.name, dest)
		return dest, true
	}
	up := strings.Repeat("../", pg.depth)

	if c := g.book.chapters[repo]; c != nil {
		if c.src == nil {
			log.Printf("warning: %s: link to %s, which does not exist yet; rendered as plain text", pg.name, repo)
			return "", false
		}
		return up + c.slug + "/" + frag, true
	}
	if repo == "README.md" || repo == "." {
		if up == "" {
			return "./" + frag, true
		}
		return up + frag, true
	}

	local := filepath.Join(*rootDir, filepath.FromSlash(repo))
	st, err := os.Stat(local)
	if image && err == nil && st.Mode().IsRegular() && pg.assetDir != "" {
		data, err := os.ReadFile(local)
		if err == nil {
			// Flatten the repository path into one file name next to the
			// page, so nothing creates a section or collides.
			name := strings.ReplaceAll(repo, "/", "-")
			g.files[path.Join(pg.assetDir, name)] = data
			return name + frag, true
		}
	}
	if image {
		return rawURL(repo) + frag, true
	}
	// A directory, or a path written as one, opens GitHub's tree view.
	kind, slash := "blob", ""
	if strings.HasSuffix(p, "/") || err == nil && st.IsDir() {
		kind, slash = "tree", "/"
	}
	return repoURL + "/" + kind + "/" + branch + "/" + escapePath(repo) + slash + frag, true
}

// githubURL is dest, relative to pg's source, as a link to the repository
// on GitHub.
func (g *generator) githubURL(dest string, pg page) string {
	p, frag := dest, ""
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p, frag = p[:i], p[i:]
	}
	return repoURL + "/blob/" + branch + "/" + escapePath(path.Clean(path.Join(pg.srcDir, p))) + frag
}

func rawURL(repo string) string {
	return "https://raw.githubusercontent.com/" + strings.TrimPrefix(repoURL, "https://github.com/") + "/" + branch + "/" + escapePath(repo)
}

func escapePath(p string) string { return (&url.URL{Path: p}).EscapedPath() }

func lineStart(s string, i int) bool {
	j := strings.LastIndexByte(s[:i], '\n') + 1
	return strings.TrimLeft(s[j:i], " \t-*+") == ""
}

// maskCodeSpans returns s with the contents of every code span replaced by
// spaces (newlines kept), so byte offsets in the result match s.
func maskCodeSpans(s string) string {
	b := []byte(s)
	for i := 0; i < len(b); {
		if b[i] == '\\' {
			i += 2
			continue
		}
		if b[i] != '`' {
			i++
			continue
		}
		n := 0
		for i+n < len(b) && b[i+n] == '`' {
			n++
		}
		open := i + n
		closeAt := -1
		for j := open; j < len(b); {
			if b[j] != '`' {
				j++
				continue
			}
			k := 0
			for j+k < len(b) && b[j+k] == '`' {
				k++
			}
			if k == n {
				closeAt = j
				break
			}
			j += k
		}
		if closeAt < 0 {
			i = open // an unmatched run is literal text
			continue
		}
		for j := open; j < closeAt; j++ {
			if b[j] != '\n' {
				b[j] = ' '
			}
		}
		i = closeAt + n
	}
	return string(b)
}

// Any indentation: fences nested in list items sit deeper than CommonMark's
// three spaces for a top-level fence.
var reFence = regexp.MustCompile("^[ \t]*(`{3,}|~{3,})")

// fenceMarker returns the fence run that opens or closes a fenced code block
// on line l, or "".
func fenceMarker(l string) string {
	m := reFence.FindStringSubmatch(l)
	if m == nil {
		return ""
	}
	if m[1][0] == '`' && strings.Contains(l[len(m[0]):], "`") {
		return "" // backticks in the info string: not a fence
	}
	return m[1]
}

// nextFence returns the fence state after a line whose marker is f, given
// the open fence (or "").
func nextFence(open, f string) string {
	switch {
	case open == "":
		return f
	case f != "" && f[0] == open[0] && len(f) >= len(open) && strings.TrimSpace(strings.TrimLeft(f, string(f[0]))) == "":
		return "" // closing fence
	default:
		return open
	}
}

// ---------------------------------------------------------------------------
// Figures.
//
// A figure is an SVG image that stands on a line of its own:
//
//	![Figure 4.2: one-line caption](figures/04-cutoff.svg)
//
// It is inlined into the page, inside <figure> with the alt text as the
// caption, so that the page's CSS reaches it: currentColor follows the light
// or dark theme, and CSS animations in its <style> run. An inline SVG shares
// the page's id namespace and its <style> applies to the whole page, so each
// figure gets an id (fig-<file name>), and the SVG's ids, its @keyframes
// names and every selector in its <style> are scoped to that id.

var (
	reSVGJunk     = regexp.MustCompile(`(?s)<\?xml.*?\?>|<!DOCTYPE[^>]*>|<!--.*?-->`)
	reSVGRoot     = regexp.MustCompile(`(?s)<svg\b.*</svg>`)
	reSVGOpen     = regexp.MustCompile(`(?s)^<svg\b[^>]*>`)
	reViewBox     = regexp.MustCompile(`\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)`)
	reIDAttr      = regexp.MustCompile(`(\sid\s*=\s*)(["'])([^"']+)(["'])`)
	reStyleEl     = regexp.MustCompile(`(?is)(<style\b[^>]*>)(.*?)(</style>)`)
	reStyleAttr   = regexp.MustCompile(`(\sstyle\s*=\s*)(["'])([^"']*)(["'])`)
	reURLRef      = regexp.MustCompile(`url\(\s*(['"]?)#([^'")\s]+)(['"]?)\s*\)`)
	reHrefRef     = regexp.MustCompile(`(\s(?:xlink:)?href\s*=\s*)(["'])#([^"']+)(["'])`)
	reIDListAttr  = regexp.MustCompile(`(\s(?:aria-labelledby|aria-describedby|begin|end)\s*=\s*)(["'])([^"']*)(["'])`)
	reIdent       = regexp.MustCompile(`[A-Za-z_][\w-]*`)
	reKeyframes   = regexp.MustCompile(`@(?:-webkit-)?keyframes\s+([-\w]+)`)
	reCSSComment  = regexp.MustCompile(`(?s)/\*.*?\*/`)
	reCDATA       = regexp.MustCompile(`(?s)^\s*<!\[CDATA\[(.*)\]\]>\s*$`)
	reAnimDecl    = regexp.MustCompile(`(?i)((?:-webkit-)?animation(?:-name)?\s*:)([^;}]*)`)
	reIDSelector  = regexp.MustCompile(`#([-\w]+)`)
	reSpaceAround = regexp.MustCompile(`\s*\n\s*`)
)

// figure handles the image link s[start:end] if it is an SVG figure: a local
// .svg file whose link stands alone on its line. The edit replaces the
// whole line with the inlined figure.
func (g *generator) figure(s string, start, end int, alt, dest string, pg page) (edit, bool) {
	d := strings.TrimSuffix(strings.TrimPrefix(dest, "<"), ">")
	if reScheme.MatchString(d) || strings.HasPrefix(d, "//") || strings.HasPrefix(d, "#") {
		return edit{}, false
	}
	if i := strings.IndexAny(d, "?#"); i >= 0 {
		d = d[:i]
	}
	if u, err := url.PathUnescape(d); err == nil {
		d = u
	}
	if !strings.EqualFold(path.Ext(d), ".svg") {
		return edit{}, false
	}
	repo := path.Clean(path.Join(pg.srcDir, d))
	if strings.HasPrefix(d, "/") {
		repo = path.Clean(strings.TrimPrefix(d, "/"))
	}
	data, err := os.ReadFile(filepath.Join(*rootDir, filepath.FromSlash(repo)))
	if err != nil {
		log.Printf("warning: %s: figure %s: %v", pg.name, repo, err)
		return edit{}, false
	}
	ls := strings.LastIndexByte(s[:start], '\n') + 1
	le := len(s)
	if i := strings.IndexByte(s[end:], '\n'); i >= 0 {
		le = end + i
	}
	indent := s[ls:start]
	if strings.TrimSpace(indent) != "" || strings.TrimSpace(s[end:le]) != "" {
		log.Printf("warning: %s: %s is not on a line of its own, so it is shown as an image, not inlined", pg.name, repo)
		return edit{}, false
	}
	base := "fig-" + slugify(strings.TrimSuffix(path.Base(repo), path.Ext(repo)))
	pg.figures[base]++
	if n := pg.figures[base]; n > 1 {
		base += "-" + strconv.Itoa(n)
	}
	svg, err := inlineSVG(string(data), base, alt)
	if err != nil {
		log.Printf("warning: %s: figure %s: %v", pg.name, repo, err)
		return edit{}, false
	}
	html := `<figure class="svg-figure" id="` + base + `">` + svg +
		`<figcaption>` + captionHTML(alt) + `</figcaption></figure>`
	// Blank lines around it make the figure an HTML block of its own; one
	// line keeps a blank line inside the SVG from ending that block.
	return edit{ls, le, "\n" + indent + html + "\n"}, true
}

// inlineSVG returns the SVG document src as one line of HTML whose ids,
// @keyframes names and <style> rules are scoped to the figure id scope.
func inlineSVG(src, scope, alt string) (string, error) {
	src = reSVGJunk.ReplaceAllString(src, "")
	svg := reSVGRoot.FindString(src)
	if svg == "" {
		return "", errors.New("no <svg> element")
	}
	prefix := scope + "-"

	ids := map[string]string{}
	for _, m := range reIDAttr.FindAllStringSubmatch(svg, -1) {
		ids[m[3]] = prefix + m[3]
	}
	keyframes := map[string]string{}
	for _, m := range reStyleEl.FindAllStringSubmatch(svg, -1) {
		for _, k := range reKeyframes.FindAllStringSubmatch(m[2], -1) {
			keyframes[k[1]] = prefix + k[1]
		}
	}

	svg = reStyleEl.ReplaceAllStringFunc(svg, func(el string) string {
		m := reStyleEl.FindStringSubmatch(el)
		css := m[2]
		if c := reCDATA.FindStringSubmatch(css); c != nil {
			css = c[1]
		}
		return m[1] + scopeCSS(css, "#"+scope, ids, keyframes) + m[3]
	})
	svg = reIDAttr.ReplaceAllStringFunc(svg, func(a string) string {
		m := reIDAttr.FindStringSubmatch(a)
		return m[1] + m[2] + ids[m[3]] + m[4]
	})
	svg = reURLRef.ReplaceAllStringFunc(svg, func(u string) string {
		m := reURLRef.FindStringSubmatch(u)
		if n, ok := ids[m[2]]; ok {
			return "url(" + m[1] + "#" + n + m[3] + ")"
		}
		return u
	})
	svg = reHrefRef.ReplaceAllStringFunc(svg, func(a string) string {
		m := reHrefRef.FindStringSubmatch(a)
		if n, ok := ids[m[3]]; ok {
			return m[1] + m[2] + "#" + n + m[4]
		}
		return a
	})
	svg = reIDListAttr.ReplaceAllStringFunc(svg, func(a string) string {
		m := reIDListAttr.FindStringSubmatch(a)
		v := reIdent.ReplaceAllStringFunc(m[3], func(t string) string {
			if n, ok := ids[t]; ok {
				return n
			}
			return t
		})
		return m[1] + m[2] + v + m[4]
	})
	svg = reStyleAttr.ReplaceAllStringFunc(svg, func(a string) string {
		m := reStyleAttr.FindStringSubmatch(a)
		return m[1] + m[2] + fixAnimations(m[3], keyframes) + m[4]
	})

	// Label the drawing with its caption, and cap its width at the
	// viewBox's, so a small drawing is not blown up to the column width.
	open := reSVGOpen.FindString(svg)
	attrs := ""
	if !strings.Contains(open, " role=") {
		attrs += ` role="img"`
	}
	if !strings.Contains(open, "aria-label") {
		attrs += ` aria-label="` + htmlEscape(plainInline(alt)) + `"`
	}
	if m := reViewBox.FindStringSubmatch(open); m != nil && !strings.Contains(open, " style=") {
		attrs += ` style="max-width:` + m[1] + `px"`
	}
	svg = open[:len(open)-1] + attrs + ">" + svg[len(open):]

	return strings.TrimSpace(reSpaceAround.ReplaceAllString(svg, " ")), nil
}

// scopeCSS prefixes every selector in css with scope, renames ids and
// @keyframes, and leaves declarations otherwise alone.
func scopeCSS(css, scope string, ids, keyframes map[string]string) string {
	var b strings.Builder
	scopeRules(&b, reCSSComment.ReplaceAllString(css, ""), scope, ids, keyframes)
	return b.String()
}

func scopeRules(b *strings.Builder, s, scope string, ids, keyframes map[string]string) {
	for {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		i := strings.IndexAny(s, "{;")
		if i < 0 {
			b.WriteString(s)
			return
		}
		prelude := strings.TrimSpace(s[:i])
		if s[i] == ';' { // @import, @charset
			b.WriteString(s[:i+1])
			s = s[i+1:]
			continue
		}
		j := matchBrace(s, i)
		body := s[i+1 : j]
		if j < len(s) {
			s = s[j+1:]
		} else {
			s = ""
		}
		switch {
		case strings.HasPrefix(prelude, "@"):
			f := strings.Fields(prelude)
			name := strings.ToLower(strings.TrimPrefix(f[0], "@"))
			switch {
			case strings.HasSuffix(name, "keyframes"):
				if len(f) > 1 && keyframes[f[1]] != "" {
					prelude = f[0] + " " + keyframes[f[1]]
				}
				b.WriteString(prelude + "{" + body + "}")
			case name == "media" || name == "supports" || name == "container" || name == "layer":
				b.WriteString(prelude + "{")
				scopeRules(b, body, scope, ids, keyframes)
				b.WriteString("}")
			default: // @font-face and the like
				b.WriteString(prelude + "{" + body + "}")
			}
		default:
			b.WriteString(scopeSelectors(prelude, scope, ids) + "{" + fixAnimations(body, keyframes) + "}")
		}
	}
}

// matchBrace returns the index of the '}' that closes the '{' at s[i], or
// len(s) if there is none.
func matchBrace(s string, i int) int {
	depth := 0
	var quote byte
	for j := i; j < len(s); j++ {
		c := s[j]
		switch {
		case quote != 0:
			if c == '\\' {
				j++
			} else if c == quote {
				quote = 0
			}
		case c == '"' || c == '\'':
			quote = c
		case c == '{':
			depth++
		case c == '}':
			depth--
			if depth == 0 {
				return j
			}
		}
	}
	return len(s)
}

func scopeSelectors(list, scope string, ids map[string]string) string {
	var out []string
	depth, last := 0, 0
	parts := []string{}
	for i := 0; i < len(list); i++ {
		switch list[i] {
		case '(', '[':
			depth++
		case ')', ']':
			depth--
		case ',':
			if depth == 0 {
				parts = append(parts, list[last:i])
				last = i + 1
			}
		}
	}
	parts = append(parts, list[last:])
	for _, sel := range parts {
		sel = strings.TrimSpace(sel)
		sel = reIDSelector.ReplaceAllStringFunc(sel, func(t string) string {
			if n, ok := ids[t[1:]]; ok {
				return "#" + n
			}
			return t
		})
		switch {
		case sel == "":
			continue
		case strings.HasPrefix(sel, ":root"):
			sel = scope + sel[len(":root"):]
		default:
			sel = scope + " " + sel
		}
		out = append(out, sel)
	}
	return strings.Join(out, ",")
}

// fixAnimations renames @keyframes references in animation and
// animation-name declarations.
func fixAnimations(decls string, keyframes map[string]string) string {
	if len(keyframes) == 0 {
		return decls
	}
	return reAnimDecl.ReplaceAllStringFunc(decls, func(d string) string {
		m := reAnimDecl.FindStringSubmatch(d)
		return m[1] + reIdent.ReplaceAllStringFunc(m[2], func(t string) string {
			if n, ok := keyframes[t]; ok {
				return n
			}
			return t
		})
	})
}

var (
	reCaptionEscape     = regexp.MustCompile(`\\([!-/:-@\[-` + "`" + `{-~])`)
	reCaptionApostrophe = regexp.MustCompile(`(\w)'(\w)`)
)

// captionHTML renders a figure's alt text: Markdown escapes removed, HTML
// escaped, code spans kept, and apostrophes curled as Hugo's typographer
// does in the text (it does not reach raw HTML).
func captionHTML(alt string) string {
	alt = reCaptionEscape.ReplaceAllString(alt, "$1")
	var b strings.Builder
	for i, part := range strings.Split(alt, "`") {
		if i%2 == 1 {
			b.WriteString("<code>" + htmlEscape(part) + "</code>")
		} else {
			b.WriteString(reCaptionApostrophe.ReplaceAllString(htmlEscape(part), "$1’$2"))
		}
	}
	return b.String()
}

func htmlEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(s)
}

// ---------------------------------------------------------------------------
// Output.

// syncDir makes dir hold exactly files: it writes what changed and removes
// the rest, so a running `hugo server` sees only real changes.
func syncDir(dir string, files map[string][]byte) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	var stale []string
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		if !d.IsDir() {
			if _, ok := files[filepath.ToSlash(rel)]; !ok {
				stale = append(stale, p)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	for _, p := range stale {
		if err := os.Remove(p); err != nil {
			return err
		}
	}
	names := make([]string, 0, len(files))
	for n := range files {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		p := filepath.Join(dir, filepath.FromSlash(n))
		if old, err := os.ReadFile(p); err == nil && bytes.Equal(old, files[n]) {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(p, files[n], 0o644); err != nil {
			return err
		}
	}
	// Remove directories left empty.
	var dirs []string
	filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() && p != dir {
			dirs = append(dirs, p)
		}
		return nil
	})
	for i := len(dirs) - 1; i >= 0; i-- {
		os.Remove(dirs[i]) // fails, harmlessly, unless empty
	}
	log.Printf("wrote %d files to %s", len(files), dir)
	return nil
}

// ---------------------------------------------------------------------------
// Watching.

// watchLoop regenerates the content whenever README.md or anything under
// book/ changes. With args, it runs them as a command (hugo server) and
// returns its exit code when it exits.
func watchLoop(args []string) int {
	if err := generate(); err != nil {
		log.Print(err)
	}
	last := snapshot()

	done := make(chan int, 1)
	var cmd *exec.Cmd
	if len(args) > 0 {
		cmd = exec.Command(args[0], args[1:]...)
		cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
		if err := cmd.Start(); err != nil {
			log.Print(err)
			return 1
		}
		go func() {
			err := cmd.Wait()
			var ee *exec.ExitError
			switch {
			case err == nil:
				done <- 0
			case errors.As(err, &ee):
				done <- ee.ExitCode()
			default:
				done <- 1
			}
		}()
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)

	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case code := <-done:
			return code
		case s := <-sig:
			if cmd == nil {
				return 0
			}
			cmd.Process.Signal(s) // a terminal's Ctrl-C reaches it anyway
		case <-tick.C:
			if cur := snapshot(); cur != last {
				last = cur
				log.Print("change detected, regenerating")
				if err := generate(); err != nil {
					log.Print(err)
				}
			}
		}
	}
}

// snapshot fingerprints the names, sizes and modification times of the
// inputs: README.md, everything under book/, and the films, whose presence
// decides whether a chapter shows one. (An image elsewhere in the repository
// is picked up on the next change to the chapter that shows it.)
func snapshot() string {
	h := sha256.New()
	add := func(p string, info fs.FileInfo) {
		fmt.Fprintf(h, "%s %d %d\n", p, info.Size(), info.ModTime().UnixNano())
	}
	if info, err := os.Stat(filepath.Join(*rootDir, "README.md")); err == nil {
		add("README.md", info)
	}
	filepath.WalkDir(filepath.Join(*rootDir, "book"), func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if info, err := d.Info(); err == nil && !d.IsDir() {
			add(p, info)
		}
		return nil
	})
	films, _ := filepath.Glob(filepath.Join(*rootDir, "films", "*.js"))
	for _, p := range films {
		if info, err := os.Stat(p); err == nil {
			add(p, info)
		}
	}
	return string(h.Sum(nil))
}
