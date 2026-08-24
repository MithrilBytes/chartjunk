/**
 * TikZ/pgfplots. Drops into a \begin{figure} as-is; the preamble the
 * document needs is TIKZ_PREAMBLE, printed by the CLI with --preamble.
 * Colors, dashes, and marks map through styles.ts so SVG and TikZ agree.
 */
import type { Annotation, Axis, Figure, Panel, Point, Series } from "../types.js";
import { STYLES, TIKZ_DASH, TIKZ_MARKS, type StyleSpec } from "../styles.js";
import { texText } from "../tex.js";

export const TIKZ_PREAMBLE = `\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usetikzlibrary{patterns}
\\usepgfplotslibrary{colormaps}`;

const SIZE_CM: Record<Figure["size"], [number, number]> = {
  single: [8.6, 6.4],
  double: [14.8, 6.2],
  square: [8.2, 8.2],
  wide: [14.8, 4.8],
};

export function renderTikz(fig: Figure): string {
  const spec = STYLES[fig.style];
  const n = fig.panels.length;
  const cols = n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3;
  const rows = n === 0 ? 0 : Math.ceil(n / cols);
  const [totalW, oneH] = SIZE_CM[fig.size];
  const panelW = n <= 1 ? totalW : (totalW - (cols - 1) * 0.9) / cols;
  const panelH = n <= 1 ? oneH : rows > 1 ? 5.0 : 5.6;

  const out: string[] = [];
  out.push("\\begin{tikzpicture}");
  const cycle = fig.mono ? spec.monoColors : spec.colors;
  cycle.forEach((c, i) => {
    out.push(`\\definecolor{cj${i}}{HTML}{${c.slice(1).toUpperCase()}}`);
  });
  if (spec.panelBg) {
    out.push(`\\definecolor{cjbg}{HTML}{${spec.panelBg.slice(1).toUpperCase()}}`);
  }
  if (fig.mono) {
    out.push("\\pgfplotsset{colormap={cjgray}{gray(0cm)=(0.88); gray(1cm)=(0.12)}}");
  }

  fig.panels.forEach((panel, i) => {
    const atX = (i % cols) * (panelW + 0.9);
    const atY = -Math.floor(i / cols) * (panelH + 1.7);
    out.push(renderAxisEnv(fig, panel, spec, panelW, panelH, atX, atY));
  });

  const wm = fig.panels.flatMap((p) => p.annotations).find((a) => a.type === "watermark");
  if (wm && wm.type === "watermark" && n > 0) {
    const cx = (cols * (panelW + 0.9) - 0.9) / 2;
    const cy = -(rows * (panelH + 1.7) - 1.7) / 2;
    out.push(
      `\\node[rotate=28, scale=${n > 1 ? 6 : 4.5}, text=black!25, opacity=0.55] ` +
      `at (${cm(cx)}, ${cm(cy)}) {${texText(wm.text)}};`,
    );
  }
  out.push("\\end{tikzpicture}");

  out.push(...captionComment(fig));
  return out.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* One panel, one axis environment                                     */
/* ------------------------------------------------------------------ */

function renderAxisEnv(
  fig: Figure, panel: Panel, spec: StyleSpec, w: number, h: number, atX: number, atY: number,
): string {
  const out: string[] = [];
  // pgfplots reads bare "at" coordinates as points; say cm explicitly.
  const opts: string[] = [
    `at={(${cm(atX)}cm,${cm(atY)}cm)}`,
    "anchor=north west",
    `width=${cm(w)}cm`,
    `height=${cm(h)}cm`,
  ];

  const yCrop = cropLow(panel);
  const [x0, x1] = panel.x.range;
  const [, y1] = panel.y.range;
  opts.push(`xmin=${num(x0)}`, `xmax=${num(x1)}`);
  opts.push(`ymin=${num(yCrop)}`, `ymax=${num(y1)}`);
  if (panel.x.scale === "log") opts.push("xmode=log", "log basis x=10");
  if (panel.y.scale === "log") opts.push("ymode=log", "log basis y=10");
  if (panel.y.broken) opts.push("axis y discontinuity=parallel");

  opts.push(`xtick={${panel.x.ticks.map(num).join(",")}}`);
  if (panel.x.tickLabels) {
    opts.push(`xticklabels={${panel.x.tickLabels.map((s) => `{${texText(s)}}`).join(",")}}`);
    if (fig.artifacts.includes("rotated-ticks") && (panel.kind === "bar" || panel.kind === "heatmap")) {
      opts.push("x tick label style={rotate=45, anchor=east, font=\\tiny}");
    }
  }
  const yTicks = panel.y.ticks.filter((t) => t >= yCrop);
  opts.push(`ytick={${yTicks.map(num).join(",")}}`);
  if (panel.y.tickLabels) {
    const labels = panel.y.ticks
      .map((t, i) => ({ t, l: panel.y.tickLabels?.[i] ?? "" }))
      .filter((e) => e.t >= yCrop)
      .map((e) => `{${texText(e.l)}}`);
    opts.push(`yticklabels={${labels.join(",")}}`);
  }

  opts.push(`xlabel={${texText(axisTitle(panel.x))}}`);
  opts.push(`ylabel={${texText(axisTitle(panel.y))}}`);
  opts.push("label style={font=\\small}", "tick label style={font=\\scriptsize}");
  if (!spec.ticksOut) opts.push("tick align=inside");

  const major = spec.gridAlways || fig.artifacts.includes("grid-major");
  const minor = fig.artifacts.includes("grid-minor");
  if (major && minor) opts.push("grid=both");
  else if (major) opts.push("grid=major");
  if (spec.panelBg) opts.push("axis background/.style={fill=cjbg}");
  if (spec.frame === "none") opts.push("axis line style={draw=none}", "tick style={draw=none}");

  if (panel.kind === "heatmap") {
    opts.push(fig.mono ? "colormap name=cjgray" : "colormap/viridis");
    opts.push("colorbar");
    const cb = panel.matrix?.colorbar;
    if (cb) {
      const title = cb.unit ? `${cb.label} (${cb.unit})` : cb.label;
      opts.push(`colorbar style={ylabel={${texText(title)}}, ylabel style={font=\\scriptsize}, tick label style={font=\\tiny}}`);
    }
    opts.push("point meta min=" + num(Math.min(...(panel.matrix?.values ?? [0]))));
    opts.push("point meta max=" + num(Math.max(...(panel.matrix?.values ?? [1]))));
  }

  if (panel.label) {
    opts.push(`title={${texText(panel.label)}}`);
    opts.push("title style={at={(0.02,0.98)}, anchor=north west, font=\\bfseries\\small}");
  }

  const entries = panel.legend.entries;
  if (entries.length > 0) {
    opts.push(legendPlacement(panel));
    opts.push("legend cell align=left");
    opts.push(`legend style={font=\\scriptsize, draw=${spec.legendBox ? "black!40" : "none"}, fill=white, fill opacity=0.9, text opacity=1}`);
  }

  out.push(`\\begin{axis}[\n  ${opts.join(",\n  ")}\n]`);

  for (const rg of panel.regions) {
    const fill = rg.fill === "hatch"
      ? "pattern=north east lines, pattern color=black!45"
      : `fill=${romanShade(rg.label)}, fill opacity=${isRoman(rg.label) ? "0.3" : "0.16"}`;
    out.push(
      `\\addplot[draw=none, ${fill}, forget plot] coordinates {` +
      rg.polygon.map((p) => coord(p)).join(" ") + "} --cycle;",
    );
    const c = centroid(rg.polygon);
    out.push(`\\node[font=\\scriptsize\\itshape, text=black!55] at (axis cs:${num(c.x)},${num(clampY(c.y, panel, yCrop))}) {${texText(rg.label)}};`);
  }

  out.push(renderTikzSeries(fig, panel, spec, yCrop));
  out.push(renderTikzAnnotations(panel, yCrop));

  for (const e of entries) {
    const color = `cj${e.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    const isBar = panel.kind === "bar";
    const style = isBar
      ? fig.mono
        ? `area legend, pattern=${BAR_PATTERNS[e.color % 4]}, pattern color=black!70, draw=black!50`
        : `area legend, fill=${color}, draw=black!50`
      : `${color}, ${TIKZ_DASH[e.dash]}, mark=${TIKZ_MARKS[e.marker]}, mark size=1.6pt`;
    out.push(`\\addlegendimage{${style}}`);
    const series = panel.series.find((s) => s.id === e.seriesId);
    const label = series?.bold ? `\\textbf{${texText(e.label)}}` : texText(e.label);
    out.push(`\\addlegendentry{${label}}`);
  }

  out.push("\\end{axis}");

  // Secondary axis: a right-hand overlay with its own scale.
  if (panel.y2) {
    const y2series = panel.series.filter((s) => s.y2);
    const o2: string[] = [
      `at={(${cm(atX)}cm,${cm(atY)}cm)}`,
      "anchor=north west",
      `width=${cm(w)}cm`,
      `height=${cm(h)}cm`,
      `xmin=${num(x0)}`, `xmax=${num(x1)}`,
      `ymin=${num(panel.y2.range[0])}`, `ymax=${num(panel.y2.range[1])}`,
      "axis y line*=right",
      "axis x line=none",
      `ytick={${panel.y2.ticks.map(num).join(",")}}`,
      `ylabel={${texText(axisTitle(panel.y2))}}`,
      "label style={font=\\small}",
      "tick label style={font=\\scriptsize}",
    ];
    if (panel.x.scale === "log") o2.push("xmode=log");
    out.push(`\\begin{axis}[\n  ${o2.join(",\n  ")}\n]`);
    for (const s of y2series) {
      out.push(seriesPlot(fig, s, panel, spec, panel.y2.range[0]));
    }
    out.push("\\end{axis}");
  }
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Series                                                              */
/* ------------------------------------------------------------------ */

function renderTikzSeries(fig: Figure, panel: Panel, spec: StyleSpec, yCrop: number): string {
  const out: string[] = [];
  if (panel.kind === "heatmap" && panel.matrix) {
    const m = panel.matrix;
    const coords: string[] = [];
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        coords.push(`(${c},${r}) [${num(m.values[r * m.cols + c])}]`);
      }
    }
    out.push(
      `\\addplot[matrix plot*, mesh/cols=${m.cols}, point meta=explicit, forget plot] ` +
      `coordinates {${coords.join(" ")}};`,
    );
    return out.join("\n");
  }

  const bars = panel.series.filter((s) => s.draw === "bar");
  const nBars = bars.length;
  for (const s of panel.series) {
    if (s.y2) continue;
    // Bands go under their lines.
    if (s.draw === "line" && s.points.some((p) => p.lo !== undefined)) {
      const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
      const fwd = s.points.map((p) => coord({ x: p.x, y: p.lo ?? p.y }));
      const back = [...s.points].reverse().map((p) => coord({ x: p.x, y: p.hi ?? p.y }));
      out.push(
        `\\addplot[draw=none, fill=${color}, fill opacity=0.15, forget plot] coordinates {` +
        [...fwd, ...back].join(" ") + "} --cycle;",
      );
    }
    if (s.draw === "bar") {
      out.push(barPlot(fig, s, panel, spec, bars.indexOf(s), nBars));
    } else {
      out.push(seriesPlot(fig, s, panel, spec, yCrop));
    }
  }
  return out.join("\n");
}

function seriesPlot(fig: Figure, s: Series, panel: Panel, spec: StyleSpec, yCrop: number): string {
  const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
  const style: string[] = [color, TIKZ_DASH[s.dash]];
  if (s.draw === "scatter") {
    style.push("only marks");
  }
  if (s.draw === "step") style.push("const plot");
  const width = s.role === "reference" ? Math.max(spec.lineWidth * 0.6, 0.5) : spec.lineWidth * 0.75;
  style.push(`line width=${num(width)}pt`);
  if (s.marker !== "none" && s.role !== "reference") {
    style.push(`mark=${TIKZ_MARKS[s.marker]}`, "mark size=1.6pt");
  } else if (s.marker !== "none") {
    style.push(`mark=${TIKZ_MARKS[s.marker]}`, "mark size=1.8pt");
  } else {
    style.push("mark=none");
  }
  style.push("forget plot");
  return `\\addplot[${style.join(", ")}] coordinates {` +
    s.points.map((p) => coord(p)).join(" ") + "};";
}

const BAR_PATTERNS = ["north east lines", "north west lines", "horizontal lines", "vertical lines"] as const;

function barPlot(fig: Figure, s: Series, panel: Panel, spec: StyleSpec, slot: number, nBars: number): string {
  const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
  const width = (0.76 / nBars) * 0.92;
  const shift = (slot - (nBars - 1) / 2) * (0.76 / nBars);
  const fill = fig.mono
    ? `pattern=${BAR_PATTERNS[slot % 4]}, pattern color=black!70`
    : `fill=${color}`;
  const out: string[] = [];
  out.push(
    `\\addplot[ybar, bar width=${num(width)}, ${fill}, draw=black!50, line width=0.4pt, forget plot] coordinates {` +
    s.points.map((p) => coord({ x: p.x + shift, y: p.y })).join(" ") + "};",
  );
  const withErr = s.points.filter((p) => p.lo !== undefined && p.hi !== undefined);
  if (withErr.length > 0) {
    out.push(
      `\\addplot[only marks, mark=none, black, forget plot, error bars/.cd, y dir=both, y explicit] coordinates {` +
      withErr
        .map((p) => `(${num(p.x + shift)},${num(p.y)}) += (0,${num((p.hi ?? p.y) - p.y)}) -= (0,${num(p.y - (p.lo ?? p.y))})`)
        .join(" ") + "};",
    );
  }
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Annotations                                                         */
/* ------------------------------------------------------------------ */

function renderTikzAnnotations(panel: Panel, yCrop: number): string {
  const out: string[] = [];
  const [x0, x1] = panel.x.range;
  for (const a of panel.annotations) {
    switch (a.type) {
      case "text": {
        const boxed = a.boxed ? "draw=black!70, fill=white, inner sep=2pt, " : "";
        out.push(
          `\\node[${boxed}font=\\scriptsize, anchor=south west] at ` +
          `(axis cs:${num(a.at.x)},${num(clampY(a.at.y, panel, yCrop))}) {${texText(a.text)}};`,
        );
        break;
      }
      case "arrow": {
        out.push(
          `\\draw[->, thick] (axis cs:${num(a.from.x)},${num(a.from.y)}) -- ` +
          `(axis cs:${num(a.to.x)},${num(a.to.y)})` +
          (a.text ? ` node[midway, left, font=\\scriptsize\\itshape] {${texText(a.text)}}` : "") + ";",
        );
        break;
      }
      case "stars": {
        const label = a.count === 0 ? "\\textit{n.s.}" : `$${"\\star".repeat(a.count)}$`;
        out.push(`\\node[font=\\scriptsize] at (axis cs:${num(a.at.x)},${num(a.at.y)}) {${label}};`);
        break;
      }
      case "hline": {
        if (a.at < yCrop) break;
        out.push(
          `\\addplot[${TIKZ_DASH[a.dash]}, black, line width=0.6pt, forget plot] coordinates {` +
          `(${num(x0)},${num(a.at)}) (${num(x1)},${num(a.at)})};`,
        );
        out.push(
          `\\node[anchor=south east, font=\\scriptsize\\itshape] at ` +
          `(axis cs:${num(x1)},${num(a.at)}) {${texText(a.text)}};`,
        );
        break;
      }
      case "vline": {
        out.push(
          `\\addplot[${TIKZ_DASH[a.dash]}, black, line width=0.6pt, forget plot] coordinates {` +
          `(${num(a.at)},${num(yCrop)}) (${num(a.at)},${num(panel.y.range[1])})};`,
        );
        out.push(
          `\\node[anchor=north west, font=\\scriptsize\\itshape] at ` +
          `(axis cs:${num(a.at)},${num(panel.y.range[1])}) {${texText(a.text)}};`,
        );
        break;
      }
      case "inset": {
        out.push(
          `\\draw[black!60, line width=0.4pt] (axis cs:${num(a.window[0].x)},${num(a.window[0].y)}) ` +
          `rectangle (axis cs:${num(a.window[1].x)},${num(a.window[1].y)});`,
        );
        break;
      }
      case "watermark":
        // Figure level; handled by renderTikz.
        break;
    }
  }
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Legend, caption, helpers                                            */
/* ------------------------------------------------------------------ */

function legendPlacement(panel: Panel): string {
  switch (panel.legend.position) {
    case "outside":
      return "legend pos=outer north east";
    case "over-data":
      return "legend style={at={(0.5,0.55)}, anchor=center}";
    default: {
      const corner = bestCorner(panel);
      const pos: Record<string, string> = {
        ne: "north east", nw: "north west", se: "south east", sw: "south west",
      };
      return `legend pos=${pos[corner]}`;
    }
  }
}

/** Corner with the fewest data points, in normalized data space. */
function bestCorner(panel: Panel): string {
  const norm = (v: number, axis: Axis): number => {
    const [a, b] = axis.range;
    if (axis.scale === "log") {
      return (Math.log10(Math.max(v, 1e-12)) - Math.log10(a)) / (Math.log10(b) - Math.log10(a));
    }
    return (v - a) / (b - a);
  };
  const counts: Record<string, number> = { ne: 0, nw: 0, se: 0, sw: 0 };
  for (const s of panel.series) {
    if (s.y2) continue;
    for (const p of s.points) {
      const key = (norm(p.y, panel.y) > 0.5 ? "n" : "s") + (norm(p.x, panel.x) > 0.5 ? "e" : "w");
      counts[key] += 1;
    }
  }
  let best = "ne";
  for (const k of ["ne", "nw", "se", "sw"]) {
    if (counts[k] < counts[best]) best = k;
  }
  return best;
}

function captionComment(fig: Figure): string[] {
  const plain = fig.caption.runs
    .map((r) => {
      switch (r.k) {
        case "text": return r.s;
        case "bold": return r.s;
        case "math": return r.text;
        case "cite": return `[${r.ids.join(", ")}]`;
      }
    })
    .join("");
  const latex = fig.caption.runs
    .map((r) => {
      switch (r.k) {
        case "text": return texText(r.s);
        case "bold": return `\\textbf{${texText(r.s)}}`;
        case "math": return `$${r.latex}$`;
        case "cite": return `[${r.ids.join(", ")}]`;
      }
    })
    .join("");
  const out = [`%% Figure ${fig.number}: ${plain}`];
  out.push(`%% \\caption{${latex}}`);
  return out;
}

function cropLow(panel: Panel): number {
  const axis = panel.y;
  const [r0] = axis.range;
  if (axis.broken) return axis.broken[1];
  if (!axis.zeroSuppressed) return r0;
  let min = Infinity;
  for (const s of panel.series) {
    if (s.y2) continue;
    for (const p of s.points) min = Math.min(min, p.lo ?? p.y);
  }
  for (const a of panel.annotations) {
    if (a.type === "hline") min = Math.min(min, a.at);
  }
  if (min === Infinity || min <= r0) return r0;
  return axis.scale === "log" ? min * 0.85 : min * 0.94 + r0 * 0.06;
}

function clampY(v: number, panel: Panel, yCrop: number): number {
  return Math.min(Math.max(v, yCrop), panel.y.range[1]);
}

function axisTitle(axis: Axis): string {
  return axis.unit ? `${axis.label} (${axis.unit})` : axis.label;
}

function isRoman(label: string): boolean {
  return label === "I" || label === "II" || label === "III";
}

function romanShade(label: string): string {
  if (!isRoman(label)) return "black!35";
  return ["blue!30", "green!30", "orange!30"][["I", "II", "III"].indexOf(label)];
}

function centroid(pts: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function coord(p: Point): string {
  return `(${num(p.x)},${num(p.y)})`;
}

function num(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const a = Math.abs(v);
  let r: number;
  if (a >= 1000) r = Math.round(v * 100) / 100;
  else if (a >= 1) r = Math.round(v * 10000) / 10000;
  else r = Number(v.toPrecision(6));
  const s = String(Object.is(r, -0) ? 0 : r);
  return s.includes("e") ? r.toFixed(12).replace(/0+$/, "").replace(/\.$/, "") : s;
}

function cm(v: number): string {
  return num(Math.round(v * 100) / 100);
}
