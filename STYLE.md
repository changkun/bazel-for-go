# Style

**Top requirement: concise, clean, precise.** Every sentence must be needed, plain, and true
to its source. When in doubt, cut.

Rules for every chapter. The reader is a staff or principal engineer: experienced, short of
time, and not necessarily a build-system specialist.

Word ceilings (prose only; figures, code, tables and references do not count): Preface 500;
Chapters 1, 2 and 10: 1,000; Chapters 3, 4, 5, 7 and 8: 1,400; Chapters 6 and 9: 1,800;
Appendix A: 1,200.

## Prose

1. **Figure first.** Each major section opens with a figure or an animation that shows the
   mechanism. The text then explains what the figure shows. If a section has no picture,
   ask whether it needs to exist.
2. **Plain words.** Explain every technical term in plain words the first time it appears in a
   chapter, for example "export data (the summary of a package's exported types and functions
   that the compiler writes for importers to read)". Spell out every abbreviation on first use.
   Do not use a term the chapter has not explained.
3. **Short.** Each chapter has a word budget, and it is a ceiling. Use one sentence where two
   would do. No preambles, summaries of what was just said, filler, or hedging.
4. **Every claim has a source the reader can open.** Link a claim about how something works to
   the code that does it, as a permalink pinned to the release and to the line, or to the design
   document, issue, or official documentation that states it. Use these bases:
   - Go: `https://github.com/golang/go/blob/go1.27.3/src/<path>#L<n>` (a local checkout is at
     `~/dev/go.dev/go`; use `git show go1.27.3:src/<path> | grep -n` to find lines)
   - Bazel: `https://github.com/bazelbuild/bazel/blob/9.3.2/<path>#L<n>`
   - rules_go: `https://github.com/bazel-contrib/rules_go/blob/v0.65.0/<path>#L<n>`
   - Gazelle: `https://github.com/bazel-contrib/bazel-gazelle/blob/v0.54.0/<path>#L<n>`
   - Go issues and proposals: `https://go.dev/issue/<n>`. Bazel docs: `https://bazel.build/...`.
     Bazel proposals: `https://github.com/bazelbuild/proposals/...`.
   Cite with a Markdown footnote placed right after the claim, named for its content, and
   list every footnote at the bottom of the chapter under a final `## References` heading:

   ```markdown
   Every run hashes every input file again.[^go-filehash]

   ## References

   [^go-filehash]: Go, `cmd/go/internal/cache/hash.go`, `FileHash`.
       <https://github.com/golang/go/blob/go1.27.3/src/cmd/go/internal/cache/hash.go#L151>
   ```

   Each entry names the project, the file and the function (or the document's title), then the
   permalink. One footnote can back several claims. Check that every link resolves to the line
   you mean. A number from the book's own measurements cites the result file under
   `examples/bench/results/`.
5. **Mark what is the book's own view.** An inference or recommendation that no source states is
   written as one ("we recommend", "in our measurements").
6. **End each chapter with "What this means at scale":** three to five consequences a reader
   can act on.

## Figures

- **Format.** Hand-written SVG in `book/figures/<chapter number>-<name>.svg`, referenced as
  `![Figure 4.2: one-line caption](figures/04-cutoff.svg)`. The site inlines the SVG, so the
  page's CSS reaches it. Mermaid (a fenced ```mermaid block) is acceptable for simple flowcharts
  that need no styling.
- **Canvas.** `viewBox` 720 units wide, height as needed (usually 200–420). No fixed
  `width`/`height` attributes. The figure must read at phone width, so use a 13–15 unit font and
  at most about six boxes in a row.
- **Colour.** No background fill. Text and lines use `currentColor` so the figure follows the
  light or dark theme. Use the accent colours only with these meanings, the same in every
  chapter:
  - go command: `#0b7fab` (blue)
  - Bazel: `#3f9142` (green)
  - work that runs (rebuild, miss): `#d9822b` (orange)
  - work skipped (cache hit): `#8a8f98` (grey), drawn with a dashed outline
  - remote / shared: `#7e57c2` (purple)
  Fills use the accent colour at 12–18% opacity (`fill-opacity`).
- **Type.** `font-family: ui-sans-serif, system-ui, sans-serif` and monospace for code names.
  Labels are short; the caption and the text carry the explanation.
- **Animation.** Use animation where the point is a process: a change propagating, a cache
  lookup, phases running, actions spreading over machines. Write it as CSS `@keyframes` inside
  the SVG's `<style>`, one loop of 6–10 seconds with a pause at the end. Include
  `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }` and make the
  static state (no animation) show the end state, so the figure still makes its point.
- **One idea per figure.** If the caption needs "and", consider two figures.
- Check every SVG renders: `rsvg-convert` or a browser screenshot (`playwright-core` is in
  `~/dev/changkun.de/alignbook/node_modules`).

## Code and commands

Every command and listing in the text must have been run on this machine, against the versions
in the README. Show outputs trimmed to the lines that matter.
