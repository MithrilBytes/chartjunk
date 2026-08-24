# chartjunk

Seeded generator of scientific-looking figures with no underlying data.
Produces convergence curves on log axes, grouped bars with error bars,
Pareto frontiers with a shaded region labeled "infeasible", heatmaps with a
nonsense colorbar unit, phase diagrams, multi-panel grids, a bold "(ours)"
that always wins (unless told not to), and a legend entry that corresponds
to nothing on the plot. The same figure comes out in SVG, TikZ/pgfplots,
HTML, Markdown, plain text, or JSON.

Live demo: https://mithrilbytes.github.io/chartjunk/

A sibling of [theorem-ipsum](https://github.com/MithrilBytes/theorem-ipsum):
fake papers need fake figures. The same seed always produces the same
figure, byte for byte.

Not published to npm; clone and build locally.

## CLI

```bash
npm install && npm run build
node dist/cli.js                                   # svg figure, random seed
node dist/cli.js --seed 42 -k pareto -f tikz -o fig1.tex
node dist/cli.js -k bar --confidence 1 --junk 0.8 -o fig2.svg
node dist/cli.js -k panels --panels 4 --style ggplot -f html
node dist/cli.js -f tikz --preamble               # the LaTeX preamble tikz needs
node dist/cli.js -k figure -f json | jq .artifacts
```

| Flag | Values |
| --- | --- |
| `-s, --seed` | any string or number |
| `-k, --kind` | `figure`, `line`, `scatter`, `bar`, `heatmap`, `pareto`, `phase`, `panels`, `caption` |
| `-f, --format` | `svg`, `tikz`, `html`, `markdown`, `text`, `json` |
| `--density` | 0 to 1; series, points, panels, insets, secondary axes |
| `--junk` | 0 to 1; non-data ink: grids, boxes, notes, watermarks |
| `--confidence` | 0 to 1; how far ahead "(ours)" lands, and how small its error bars |
| `--gobbledygook` | 0 to 1; incoherence of the labels |
| `--style` | `matplotlib`, `ggplot`, `pgfplots`, `excel` |
| `--size` | `single`, `double`, `square`, `wide` |
| `--panels` | 2 to 6, for `-k panels` |
| `--number` | figure number in the caption, default 1 |
| `--mono` | grayscale; dashes and hatching carry the series distinction |
| `--no-orphan` | suppress the orphan legend entry |
| `--preamble` | print the LaTeX preamble the `tikz` output needs |
| `-o, --out` | output file; `markdown` writes a sidecar `.svg` next to it |

Each dial defaults to 0.5. The `excel` style refuses to drop below junk 0.5.
The format is inferred from the `--out` extension when `-f` is omitted.

## Library

```js
import { chartjunk, generateFigure, render, line, bar, pareto, caption } from "./dist/index.js";

const svg = chartjunk({ seed: "fig-3", kind: "pareto", format: "svg" });

const fig = generateFigure({ seed: 7, junk: 0.9, confidence: 1, vocabulary: { method: "SPLINE" } });
const json = render(fig, "json");

pareto({ seed: 1 });
caption({ seed: 2, format: "json" });
```

`generateFigure` returns a plain `Figure` structure (panels, axes, series,
regions, annotations, legend, caption runs) that every renderer walks, so
content is identical across formats. The `artifacts` field lists every gag
that fired, by id.

## What a generated figure contains

- Axes with sensible ticks, labeled units, and a `betterIs` direction that
  decides who wins. Log axes get power-of-ten ticks and minor ticks.
- A bold, starred "`METHOD` (ours)" whose lead over the best baseline is set
  by the confidence dial. Below 0.2 its error interval overlaps the best
  baseline's; at 0 it can lose outright, while staying bold and starred.
- Baselines named from a pool ("Prior work [12]", "SOTA [3]", "Oracle",
  "Ablation (w/o momentum)"), an orphan legend entry that matches nothing,
  and captions that lie politely ("Lower is better." when higher is).
- A catalogue of thirty artifacts (broken axes, zero suppression, gap
  arrows, "outlier (excluded)" still plotted, boxed "see text", PRELIMINARY
  watermarks) fired by threshold plus a seeded coin, so full dials are
  exhaustively junked while identical dials still vary by seed.
- Stable streams: every component draws from its own forked rng stream, so
  moving one dial never reshuffles unrelated parts. Sweeping confidence
  from 0 to 1 leaves axis labels, tick positions, baseline curves, and
  legend order untouched.

## Formats

| format | output |
| --- | --- |
| `svg` | standalone `<svg>`, hand-written, text as `<text>` so it stays selectable and small |
| `tikz` | a `tikzpicture` using pgfplots that drops into `\begin{figure}`; `--preamble` prints the required preamble, and CI compiles samples with Tectonic on every push |
| `html` | a self-contained `<figure>` with inline SVG and a `<figcaption>` |
| `markdown` | an image line plus a caption paragraph; sidecar `.svg` with `--out`, data URI without |
| `text` | box-drawing axes, `·×▲` markers, `░▒▓█` heatmaps, 72 columns |
| `json` | the `Figure` structure itself |

PNG and PDF are out of scope; `resvg` or `rsvg-convert` rasterize the SVG,
and Tectonic compiles the TikZ.

## theorem-ipsum integration

`chartjunk/theorem-ipsum` exports a figure provider for
[theorem-ipsum](https://github.com/MithrilBytes/theorem-ipsum): the paper
passes its seed, figure number, noun palette, and bibliography numbers, and
gets a `Figure` whose captions speak the paper's language and cite entries
that exist. Gobbledygook passes through; density follows the paper's
length; confidence sits at 0.7, because papers want to win.

```js
import { figures } from "chartjunk/theorem-ipsum";

const fig = figures({
  seed: "paper-7:figure:2",
  number: 2,
  gobbledygook: 0.8,
  length: 0.6,
  vocabulary: { method: "SPLINE", citations: [3, 7, 12] },
});
```

## Releases and snapshots

A workflow publishes the figure of the day (SVG, TikZ, and compiled PDF)
as a release, seeded by the date. Golden SVG snapshots pin eight seeds in
`test/golden/`; `npm run snapshots` regenerates them after an intentional
rendering change.

## License

MIT.
