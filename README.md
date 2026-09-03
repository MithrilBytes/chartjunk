# chartjunk

Seeded generator of scientific-looking figures with no underlying data.
The same seed always produces the same figure, byte for byte, in SVG,
TikZ/pgfplots, HTML, Markdown, plain text, or JSON.

It draws convergence curves on log axes, grouped bars with error bars,
Pareto frontiers with a shaded infeasible region, heatmaps with a
nonsense colorbar unit plus confusion-matrix and win-rate flavors, phase
diagrams, ROC curves that hug the corner and quote AUC to three decimals,
performance profiles after Dolan and More, rank bump charts where ours
ends first, capability radars with a spoke for Vibes, violins whose
densities summarize three runs, exploded pies whose percentages sum past
100, ablation waterfalls whose contributions overshoot the total, stacked
areas that Other swallows, histograms under smooth density overlays,
venns whose counts disagree with their caption, and multi-panel grids.
A bold "(ours)" wins unless told not to. A legend entry can match
nothing on the plot.

Live demo: https://mithrilbytes.github.io/chartjunk/

A sibling of [theorem-ipsum](https://github.com/MithrilBytes/theorem-ipsum):
fake papers need fake figures.

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
| `-k, --kind` | `figure`, `line`, `scatter`, `bar`, `heatmap`, `pareto`, `phase`, `roc`, `profile`, `bump`, `radar`, `violin`, `pie`, `waterfall`, `area`, `histogram`, `venn`, `panels`, `caption` |
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

`generateFigure` returns a plain `Figure` structure: panels, axes, series,
regions, annotations, legend, caption runs. Content is identical across
formats. The `artifacts` field lists every gag that fired, by id.

## What a generated figure contains

- Axes with sensible ticks, labeled units, and a `betterIs` direction.
  Log axes get power-of-ten ticks and minor ticks.
- A bold, starred "`METHOD` (ours)" whose lead over the best baseline is set
  by the confidence dial. Below 0.2 its error interval overlaps the best
  baseline's; at 0 it can lose outright, while staying bold and starred.
- Baselines named from a pool ("Prior work [12]", "SOTA [3]", "Oracle",
  "Ablation (w/o momentum)"), an orphan legend entry that matches nothing,
  and captions that lie ("Lower is better." when higher is).
- A catalogue of forty-eight artifacts: broken axes, zero suppression, gap
  arrows, "outlier (excluded)" still plotted, boxed "see text", PRELIMINARY
  watermarks. At junk 1 every eligible artifact fires; identical dials
  still vary by seed.
- Sweeping one dial leaves the rest of the figure alone. Confidence from
  0 to 1 moves ours and its error bars only; axis labels, tick positions,
  baseline curves, and legend order stay untouched.

## Formats

| format | output |
| --- | --- |
| `svg` | standalone `<svg>` with selectable text |
| `tikz` | a `tikzpicture` using pgfplots that drops into `\begin{figure}`; `--preamble` prints the required preamble |
| `html` | a self-contained `<figure>` with inline SVG and a `<figcaption>` |
| `markdown` | an image line plus a caption paragraph; sidecar `.svg` with `--out`, data URI without |
| `text` | box-drawing axes, `·×▲` markers, `░▒▓█` heatmaps, 72 columns |
| `json` | the `Figure` structure itself |

For PNG or PDF, rasterize the SVG with `resvg` or `rsvg-convert`, or
compile the TikZ with Tectonic.

## theorem-ipsum integration

`chartjunk/theorem-ipsum` exports a figure provider for
[theorem-ipsum](https://github.com/MithrilBytes/theorem-ipsum): the paper
passes its seed, figure number, noun palette, and bibliography numbers, and
gets a `Figure` whose captions use the paper's vocabulary and cite entries
that exist. Gobbledygook passes through; density follows the paper's
length; confidence defaults to 0.7.

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
as a release, seeded by the date. Golden SVG snapshots pin eighteen seeds
in `test/golden/`; `npm run snapshots` regenerates them after an
intentional rendering change.

## License

MIT.
