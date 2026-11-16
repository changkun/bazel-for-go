# Films

Each chapter can have a film: a silent explanation, 2:30 to 4:00 long, that
shows the chapter's mechanisms moving (a graph growing, a change spreading, a
key hitting or missing the cache, actions spread over machines). It reads
like the chapter: no sound, and every sentence on screen.

A film is one JavaScript module, `films/<chapter>.js`, named after the
chapter's file, without `.md` (`book/04-go-command.md` → `films/04-go-command.js`;
the page looks for exactly that name and shows nothing if it differs).
The same code plays live at the top of the chapter's page, in the reader's
light or dark theme, and is photographed frame by frame into an MP4. You
write only that one file; the engine draws the rest.

## The frame

```
┌───────────────────────────────────────────┬──────────────────────┐
│ plate (x < 1312): your scene's drawing,   │ rail, drawn for you: │
│ in the book's figure language             │ ▍ sections, filling  │
│                                           │ ──────────────────── │
│                                           │ earlier sentences,   │
│                                           │ dimmed               │
│                                           │ the sentence now     │
└───────────────────────────────────────────┴──────────────────────┘
```

The frame is 1920 × 1080 units (one unit is one video pixel). You draw on the
plate (1312 × 1080), and each scene fills it: centred both ways, taking 70 to
85% of its width or height (see Look). The rail
shows the chapter's sections as a timeline and, under it, the transcript:
your lines, the current one at full strength. So the plate carries **no
captions**: only labels, names and terms, as in the book's figures.

## A film module

```js
import { during, ramp, show } from "./stage.js";

// Fade something in from second a, over d seconds.
const appear = (thing, t, a, d = 0.6) => show(thing, during(t, a, a + d));

export default {
  chapter: "1",
  title: "What a build system decides",
  scenes: [
    {
      section: "Cutoff and the critical path",
      lines: [
        "When a source changes, the action that reads it reruns, and its new output changes the keys of the actions that use it.",
        { say: "The change spreads along the graph until early cutoff stops it.", hold: 1.2 },
      ],
      draw(s) {
        // Build the scene once, on Stage s, at any size; then fit the bounds
        // of all it will ever show to the plate.
        s.fit(0, -3, 920, 490);
        const a = s.box(0, 58, 120, 64, "a", { mono: true });
        const d = s.box(200, 58, 120, 64, "d", { mono: true });
        const ad = s.edge(a, d);
        const edit = s.pill(60, 20, "edit", { kind: "run" });
        // Then set the frame at second t of the scene; cue[i] is when line i starts.
        return (t, cue) => {
          appear(edit, t, cue[0] + 0.6);
          a.mark("run", during(t, cue[0] + 3.2, cue[0] + 3.8));
          ad.pulse(ramp(t, cue[0] + 4.6, cue[0] + 5.8));
          d.mark("run", during(t, cue[0] + 6.0, cue[0] + 6.6));
        };
      },
    },
  ],
};
```

`films/01-what-a-build-system-decides.js` is a whole film to copy from.

- **`chapter`, `title`**: shown first, as the first entry of the transcript.
- **`scenes`**: in order. A scene is one picture and one idea.
  - `section`: the chapter's `## ` heading this scene explains, spelled
    exactly. Scenes of one section come together, in the chapter's order. A
    first scene for the chapter's opening paragraph may have none.
  - `lines`: the sentences, each a string or `{ say, hold, seconds }`.
  - `lead`: seconds of picture before the first line (rarely needed).
  - `draw(s)`: builds the scene on `s` and returns `update(t, cue)`.

## Writing the lines

- Say only what the chapter says, in its words and its terms. The film
  explains the chapter; it adds no claim, number or example of its own.
- One sentence a line; at most 32 words and 6 rail lines (the check counts).
- Plain words. Name a thing the way the chapter names it, every time.
- Backticks mark code: `` `go build` ``, `` `T_exec` ``, `` `BUILD.bazel` ``.
  They are set in monospace, in lines and labels alike.
- The text is data, kept apart from the drawing, so it can later be voiced
  or subtitled. Never draw a sentence on the plate.

## Timing

The text sets the clock; the pictures follow it.

| | |
|---|---|
| a line stays | max(2 s, 0.4 s × words) + `hold` (0.8 s unless given); `seconds` sets it outright |
| before the first line | 3.5 s with the title alone |
| after the last line | 1.5 s |
| between scenes | a 0.45 s cross-fade |
| a scene | at most 90 s |
| the film | aim for 2:30 to 4:00 (`--check` notes it); never over 5:00 (a problem) |

4:00 is about 500 words with modest holds. Plan the script first, run
`--script` to see the times, then animate. Inside a line, things appear
when the sentence reaches them: at 0.4 s a word, word 10 is about
`cue[i] + 4`. Raise a `hold` when a picture needs time after its sentence
(a schedule filling, a chain lighting up), not to slow reading.

## Drawing

`draw(s)` creates every shape once. `update(t, cue)` then only sets
opacities, colours, positions and progress, **from `t` and `cue` alone**: no
counters, no state kept between calls, no `Date`, no randomness. Frames are
drawn in any order (the scrubber, the renderer, the check), and the check
draws them out of order to catch a scene that remembers. Set every property
you change on every call, not only inside an `if`.

From `./stage.js`:

| | |
|---|---|
| `during(t, a, b)` | 0 before a, 1 after b, eased between: for anything that appears or moves |
| `ramp(t, a, b)` | the same, linear: for a pulse travelling along an edge |
| `mix(a, b, u)`, `clamp(v)` | arithmetic |
| `show(thing, u)` | opacity u (things start visible: hide what comes later) |
| `place(thing, x, y, k)` | move by (x, y) from where it was drawn, scaled by k (default 1) |
| `fitted(box, { into, fill, scale })` | the `[x, y, k]` for `place` that centres `box` (`[x0, y0, x1, y1]`) in the area `into` (the plate unless given), at `fill` of it or at `scale` exactly: to move a part of a scene, say up to make room |
| `measure(text, { size, mono })` | width in units, to lay out text |
| `W`, `H`, `RAIL`, `SAFE`, `SHAPE` | the frame and the colours |

On a stage `s` (every method returns something `show` and `place` accept):

| | |
|---|---|
| `s.fit(x0, y0, x1, y1, fill = 0.8)` | call first in `draw`: centres the bounds of all the scene ever shows on the plate and scales them to `fill` of its width or height. Returns the scale |
| `s.group()` | a stage inside this one, to fade or move several shapes as one |
| `s.box(x, y, w, h, label, { kind, mono, size, weight, sub, subMono })` | an action or node; (x, y) is the top-left. Returns a Box |
| `s.file(x, y, w, h, label)` | an input: a lighter box, label in monospace (`mono: false` for words) |
| `s.edge(a, b, { from, to, kind })` | an arrow between two boxes' sides (`"right"`, `"left"`, `"top"`, `"bottom"`) or points `[x, y]`. Returns an Edge |
| `s.cache(cx, cy, { w, h, label })` | a cylinder: a cache or store. Edges attach to it like a box |
| `s.pill(cx, cy, label, { kind })` | a tag on a rounded ground, centred; has `.w` |
| `s.band(points)` | the faint wide stroke of a critical path; `.trace(u)` draws it |
| `s.legend(x, y, [[kind, label], ...])` | swatches; kind `"band"` for a critical path |
| `s.text(x, y, text, { size, weight, anchor, tone, mono, italic })` | a label; y is the baseline; tone `"ink"`, `"muted"`, `"faint"` or a kind |
| `s.rect`, `s.line`, `s.circle`, `s.hatch()` | plain shapes; `hatch()` is a fill for a share that is neither colour |

A Box has `mark(kind, u)` (colour it as a run, a hit, ...), `focus(u)` (a
heavier outline), its sides `left`, `right`, `top`, `bottom`, and `labels`.
An Edge has `trace(u)` (draw it up to part u), `mark(kind, u)` and
`pulse(u, kind = "run", strength = 1)` (a dot travelling along it; strength
fades a dot that stopped short).

## Look

The films use the book's figure language (STYLE.md, Figures): flat shapes,
thin outlines, generous space, no shadows, no gradients, nothing decorative.

- **Colour means one thing, always.** Pass the meaning, never a hex value:

  | kind | means | shape | text, light / dark |
  |---|---|---|---|
  | `go` | the go command | #00ADD8 | #007D9C / #00ADD8 |
  | `bazel` | Bazel | #43A047 | #388E3C / #43A047 |
  | `run` | work that runs: a miss, a rerun | #d9822b | same |
  | `hit` | work skipped: a cache hit, always dashed | #8a8f98 | same |
  | `remote` | shared or remote: a remote cache or machine, bytes moved | #7e57c2 | #7e57c2 / #9575cd |

  Everything else is ink, at full strength, `muted` or `faint`; it follows
  the theme by itself. Fills are light (about 16%), as in the figures.
- **Each scene fills the plate.** Draw at any convenient size, then
  `s.fit(...)` the bounds of everything the scene ever shows: it is centred
  on the plate and scaled so that it takes 70 to 85% of the plate's width or
  height, whichever it reaches first (`fill` 0.8 by default; up to 0.85 for
  a wide diagram). When a second part arrives later (a schedule under a
  graph), let the first part stand alone in the middle, then move it with
  `place(part, ...fitted(...))` to make room, so no frame is a small picture
  in a corner.
- **Text as drawn, after scaling: node labels at least 32 units** (the
  default for boxes, files and caches), **other text at least 26**. Code
  names in monospace, words in the sans.
- **Draw what the chapter's figures draw**, with the same names and layout
  where they fit; the reader moves between both.
- **One idea per scene.** Build the picture as the sentences reach it, then
  change it; don't redraw the same picture twice.
- **Motion carries meaning**: something appears when it is named, a pulse
  is data moving, a colour change is a state change. Nothing moves for show.

## Check and render

Needs Node 22 or later, Google Chrome (or `CHROME=/path/to/chrome`) and
ffmpeg (or `FFMPEG=...`). From the repository root, with `04` standing for
your film's name or the start of it:

```sh
node films/render.mjs 04 --script        # the transcript, with when each line comes and goes
node films/render.mjs 04 --check         # must say "nothing found"; run it with --theme light too
node films/render.mjs 04 --sheet         # twelve frames in one PNG, in films/out/
node films/render.mjs 04 --at 12.5,40    # one PNG for each second given
node films/render.mjs 04 --range 30,45   # an MP4 of that stretch only
node films/render.mjs 04                 # the whole MP4: films/out/<name>.mp4
```

`--check` reports timing that does not fit, text that is too small, leaves
the plate or the rail, outgrows its box or lies on other text, shapes that
leave the plate, a scene that takes less than 70% of the plate's width or
height or sits off its middle, and frames that depend on more than their
second. Every rendering command runs a full Chrome: while something else is
being measured on the machine, prefix it with `nice -n 19`. Look at
the sheet and at single frames too, in both themes (`--theme light`): the
check catches collisions, not a picture that says the wrong thing.

`films/out/` is not checked in. To preview the page, run `make serve` in
`website/`: the film appears under the chapter's title as soon as its file
exists, and reloads when it changes. `make build films` in `website/`
renders every MP4 that changed into `public/films/`, where each page's
download link points; `make deploy` does the same for the last commit.
