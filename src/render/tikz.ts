/**
 * TikZ/pgfplots. Drops into a \begin{figure} as-is; the preamble the
 * document needs is TIKZ_PREAMBLE, printed by the CLI with --preamble.
 * Colors, dashes, and marks map through styles.ts so SVG and TikZ agree.
 */
import type { Annotation, Axis, Figure, Panel, Point, Series } from "../types.js";
import { STYLES, TIKZ_DASH, TIKZ_MARKS, type StyleSpec } from "../styles.js";
import { texText } from "../tex.js";

export const TIKZ_PREAMBLE = `\\usepackage{amsmath}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usetikzlibrary{patterns}
\\usepgfplotslibrary{colormaps}
\\usepgfplotslibrary{polar}`;

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
  if (panel.kind === "radar") return renderPolarEnv(fig, panel, spec, w, h, atX, atY);
  if (panel.kind === "pie") return renderPieTikz(fig, panel, spec, w, h, atX, atY);
  const out: string[] = [];
  // pgfplots reads bare "at" coordinates as points; say cm explicitly.
  const opts: string[] = [
    `at={(${cm(atX)}cm,${cm(atY)}cm)}`,
    "anchor=north west",
    `width=${cm(w)}cm`,
    `height=${cm(h)}cm`,
  ];
  if (panel.kind === "bump") opts.push("y dir=reverse");
  if (panel.kind === "venn") opts.push("hide axis");

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
    const labels = panel.x.tickLabels.map((s, i) => {
      const tex = texText(s);
      const bold = (panel.kind === "violin" || panel.kind === "waterfall") && panel.series[i]?.bold;
      return bold ? `{\\textbf{${tex}}}` : `{${tex}}`;
    });
    opts.push(`xticklabels={${labels.join(",")}}`);
    const rotates = panel.kind === "bar" || panel.kind === "heatmap" || panel.kind === "violin" || panel.kind === "waterfall";
    if (fig.artifacts.includes("rotated-ticks") && rotates) {
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

  let regionIdx = 0;
  for (const rg of panel.regions) {
    const vennFill = `fill=cj${regionIdx % (fig.mono ? spec.monoColors.length : spec.colors.length)}, fill opacity=0.3`;
    regionIdx += 1;
    const fill = rg.fill === "hatch"
      ? "pattern=north east lines, pattern color=black!45"
      : panel.kind === "venn" ? vennFill
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
    const isBar = panel.kind === "bar" || panel.kind === "area";
    let fillStyle = `fill=${color}`;
    if (panel.kind === "area" && fig.artifacts.includes("indistinct-colors") && !fig.mono) {
      const k = panel.series.findIndex((s) => s.id === e.seriesId);
      if (k >= 0) fillStyle = `fill=cj0!${Math.max(20, 88 - k * 13)}!white`;
    }
    const style = isBar
      ? fig.mono
        ? `area legend, pattern=${BAR_PATTERNS[e.color % 4]}, pattern color=black!70, draw=black!50`
        : `area legend, ${fillStyle}, draw=black!50`
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
  if (panel.kind === "waterfall") return renderWaterfallTikz(fig, panel, spec);
  if (panel.kind === "area") return renderAreaTikz(fig, panel, spec);
  if (panel.kind === "histogram") return renderHistogramTikz(fig, panel, spec);
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
    if (s.draw === "band") {
      const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
      const fill = fig.mono
        ? `pattern=${BAR_PATTERNS[s.color % 4]}, pattern color=black!60`
        : `fill=${color}, fill opacity=0.5`;
      out.push(
        `\\addplot[draw=${color}, line width=0.5pt, ${fill}, forget plot] coordinates {` +
        s.points.map((p) => coord(p)).join(" ") + "} --cycle;",
      );
      if (s.stats) {
        const cx = (s.points[0].x + s.points[s.points.length - 1].x) / 2;
        out.push(
          `\\draw[black, fill=white, line width=0.4pt] ` +
          `(axis cs:${num(cx - 0.06)},${num(s.stats.q1)}) rectangle (axis cs:${num(cx + 0.06)},${num(s.stats.q3)});`,
        );
        out.push(
          `\\draw[black, line width=0.9pt] (axis cs:${num(cx - 0.06)},${num(s.stats.median)}) -- ` +
          `(axis cs:${num(cx + 0.06)},${num(s.stats.median)});`,
        );
      }
      continue;
    }
    if (s.draw === "bar") {
      out.push(barPlot(fig, s, panel, spec, bars.indexOf(s), nBars));
    } else {
      out.push(seriesPlot(fig, s, panel, spec, yCrop));
    }
  }
  return out.join("\n");
}

/** Waterfall: floating rectangles, dashed connectors, signed labels. */
function renderWaterfallTikz(fig: Figure, panel: Panel, spec: StyleSpec): string {
  const out: string[] = [];
  let prev: { x: number; y: number } | null = null;
  panel.series.forEach((s) => {
    const p = s.points[0];
    const from = p.lo ?? 0;
    const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    const fill = fig.mono
      ? `pattern=${BAR_PATTERNS[s.color % 4]}, pattern color=black!70`
      : `fill=${color}`;
    out.push(
      `\\draw[draw=black!60, line width=0.4pt, ${fill}] ` +
      `(axis cs:${num(p.x - 0.31)},${num(from)}) rectangle (axis cs:${num(p.x + 0.31)},${num(p.y)});`,
    );
    if (prev) {
      out.push(
        `\\draw[black!50, densely dashed, line width=0.4pt] ` +
        `(axis cs:${num(prev.x + 0.31)},${num(prev.y)}) -- (axis cs:${num(p.x - 0.31)},${num(prev.y)});`,
      );
    }
    prev = { x: p.x, y: p.y };
    const delta = p.y - from;
    const label = s.role === "ours" || s.role === "baseline"
      ? num(Math.round(Math.abs(delta) * 100) / 100)
      : `${delta >= 0 ? "+" : "-"}${num(Math.round(Math.abs(delta) * 100) / 100)}`;
    const top = Math.max(from, p.y);
    const face = s.bold ? `\\textbf{${label}}` : label;
    out.push(
      `\\node[font=\\tiny, anchor=south] at (axis cs:${num(p.x)},${num(top)}) {${face}};`,
    );
  });
  return out.join("\n");
}

/** Stacked area: cumulative polygons, closed and filled in order. */
function renderAreaTikz(fig: Figure, panel: Panel, spec: StyleSpec): string {
  const out: string[] = [];
  const indistinct = fig.artifacts.includes("indistinct-colors") && !fig.mono;
  const T = panel.series[0]?.points.length ?? 0;
  const cum: number[] = new Array(T).fill(0);
  panel.series.forEach((s, k) => {
    const lower = [...cum];
    for (let t = 0; t < T; t++) cum[t] += s.points[t].y;
    const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    const fill = fig.mono
      ? `pattern=${BAR_PATTERNS[k % 4]}, pattern color=black!60`
      : indistinct ? `fill=cj0!${Math.max(20, 88 - k * 13)}!white` : `fill=${color}`;
    const fwd = s.points.map((p, t) => `(${num(p.x)},${num(Math.min(cum[t], 1))})`);
    const back = [...s.points].reverse().map((p, ti) => `(${num(p.x)},${num(lower[T - 1 - ti])})`);
    out.push(
      `\\addplot[draw=white, line width=0.3pt, ${fill}, forget plot] coordinates {` +
      [...fwd, ...back].join(" ") + "} --cycle;",
    );
  });
  return out.join("\n");
}

/** Histograms: translucent full-width bins plus their silky densities. */
function renderHistogramTikz(fig: Figure, panel: Panel, spec: StyleSpec): string {
  const out: string[] = [];
  const bars = panel.series.filter((s) => s.draw === "bar");
  for (const s of bars) {
    const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    const binW = s.points.length > 1 ? s.points[1].x - s.points[0].x : 0.1;
    for (const p of s.points) {
      out.push(
        `\\draw[draw=${color}, line width=0.3pt, fill=${color}, fill opacity=0.4] ` +
        `(axis cs:${num(p.x - binW * 0.49)},0) rectangle (axis cs:${num(p.x + binW * 0.49)},${num(p.y)});`,
      );
    }
  }
  for (const s of panel.series) {
    if (s.draw !== "line") continue;
    out.push(seriesPlot(fig, s, panel, spec, 0));
  }
  return out.join("\n");
}

/** The pie: raw arcs in plain TikZ, no axis environment at all. */
function renderPieTikz(
  fig: Figure, panel: Panel, spec: StyleSpec, w: number, h: number, atX: number, atY: number,
): string {
  const out: string[] = [];
  const R = Math.min(w, h) * 0.34;
  const cx = atX + w / 2;
  const cy = atY - h / 2;
  const donut = fig.artifacts.includes("hole-number");
  const r0 = donut ? R * 0.55 : 0;
  const values = panel.series.map((s) => s.points[0].y);
  const total = values.reduce((a, b) => a + b, 0);
  const other = values.indexOf(Math.max(...values));

  let deg = 90;
  panel.series.forEach((s, i) => {
    const sweep = (values[i] / total) * 360;
    const a0 = deg;
    const a1 = deg - sweep;
    deg = a1;
    const mid = (a0 + a1) / 2;
    const off = i === other ? 0.16 : 0;
    const ox = cx + off * Math.cos((mid * Math.PI) / 180);
    const oy = cy + off * Math.sin((mid * Math.PI) / 180);
    const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    const fill = fig.mono
      ? `pattern=${BAR_PATTERNS[i % 4]}, pattern color=black!70`
      : `fill=${color}`;
    if (r0 > 0) {
      out.push(
        `\\draw[draw=white, line width=0.8pt, ${fill}] ` +
        `(${cm(ox)}, ${cm(oy)}) ++(${num(a0)}:${cm(r0)}) -- ++(${num(a0)}:${cm(R - r0)}) ` +
        `arc[start angle=${num(a0)}, end angle=${num(a1)}, radius=${cm(R)}] ` +
        `-- ++(${num(a1 + 180)}:${cm(R - r0)}) ` +
        `arc[start angle=${num(a1)}, end angle=${num(a0)}, radius=${cm(r0)}] -- cycle;`,
      );
    } else {
      out.push(
        `\\draw[draw=white, line width=0.8pt, ${fill}] (${cm(ox)}, ${cm(oy)}) -- ` +
        `++(${num(a0)}:${cm(R)}) arc[start angle=${num(a0)}, end angle=${num(a1)}, radius=${cm(R)}] -- cycle;`,
      );
    }
    const frac = values[i] / total;
    const label = `${values[i].toFixed(1)}\\%`;
    const midRad = (mid * Math.PI) / 180;
    if (frac > 0.09) {
      const lr = r0 > 0 ? (r0 + R) / 2 : R * 0.62;
      out.push(
        `\\node[font=\\tiny${fig.mono ? "" : ", text=white"}] at ` +
        `(${cm(ox + lr * Math.cos(midRad))}, ${cm(oy + lr * Math.sin(midRad))}) {${label}};`,
      );
    } else {
      out.push(
        `\\draw[black!50, line width=0.3pt] (${cm(ox)}, ${cm(oy)}) ++(${num(mid)}:${cm(R)}) -- ++(${num(mid)}:0.25);`,
      );
      out.push(
        `\\node[font=\\tiny, anchor=${Math.cos(midRad) > 0 ? "west" : "east"}] at ` +
        `(${cm(ox + (R + 0.35) * Math.cos(midRad))}, ${cm(oy + (R + 0.35) * Math.sin(midRad))}) {${label}};`,
      );
    }
  });

  if (donut) {
    const hole = panel.annotations.find((a) => a.type === "text" && a.text.startsWith("n = "));
    if (hole && hole.type === "text") {
      out.push(`\\node[font=\\small\\bfseries] at (${cm(cx)}, ${cm(cy)}) {${texText(hole.text)}};`);
    }
  }

  const entries = panel.legend.entries;
  entries.forEach((e, i) => {
    const color = `cj${e.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    const swatch = fig.mono
      ? `pattern=${BAR_PATTERNS[i % 4]}, pattern color=black!70`
      : `fill=${color}`;
    const ly = cy + h * 0.32 - i * 0.42;
    const lx = atX + w - 0.2;
    out.push(`\\draw[draw=black!50, line width=0.3pt, ${swatch}] (${cm(lx - 2.6)}, ${cm(ly)}) rectangle ++(0.28, 0.2);`);
    out.push(`\\node[font=\\tiny, anchor=west] at (${cm(lx - 2.2)}, ${cm(ly + 0.1)}) {${texText(e.label)}};`);
  });
  return out.join("\n");
}

/** The radar: a polar axis, one closed polygon per method. */
function renderPolarEnv(
  fig: Figure, panel: Panel, spec: StyleSpec, w: number, h: number, atX: number, atY: number,
): string {
  const out: string[] = [];
  const S = panel.x.ticks.length;
  const angleOf = (s: number): number => ((90 - (s * 360) / S) % 360 + 360) % 360;
  const angles = Array.from({ length: S }, (_, s) => angleOf(s));
  const labels = (panel.x.tickLabels ?? angles.map(String)).map((s) => `{${texText(s)}}`);
  const opts: string[] = [
    `at={(${cm(atX)}cm,${cm(atY)}cm)}`,
    "anchor=north west",
    `width=${cm(Math.min(w, h) + 1)}cm`,
    "ymin=0",
    `ymax=${num(panel.y.range[1])}`,
    `xtick={${angles.map(num).join(",")}}`,
    `xticklabels={${labels.join(",")}}`,
    `ytick={${panel.y.ticks.filter((t) => t > 0).map(num).join(",")}}`,
    "grid=both",
    "tick label style={font=\\tiny}",
    "y tick label style={anchor=east, font=\\tiny}",
  ];
  const entries = panel.legend.entries;
  if (entries.length > 0) {
    opts.push("legend pos=outer north east");
    opts.push("legend cell align=left");
    opts.push(`legend style={font=\\scriptsize, draw=${spec.legendBox ? "black!40" : "none"}, fill=white}`);
  }
  out.push(`\\begin{polaraxis}[\n  ${opts.join(",\n  ")}\n]`);
  const ordered = [...panel.series].sort((a, b) => Number(a.role === "ours") - Number(b.role === "ours"));
  for (const s of ordered) {
    const color = `cj${s.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    const width = s.role === "ours" ? 1.3 : 0.9;
    out.push(
      `\\addplot[${color}, ${TIKZ_DASH[s.dash]}, line width=${num(width)}pt, ` +
      `mark=${TIKZ_MARKS[s.marker]}, mark size=1.3pt, fill=${color}, fill opacity=0.08, forget plot] coordinates {` +
      s.points.map((p) => `(${num(angleOf(p.x))},${num(p.y)})`).join(" ") + "} --cycle;",
    );
  }
  for (const a of panel.annotations) {
    if (a.type === "text" && a.boxed) {
      out.push(
        `\\node[draw=black!70, fill=white, inner sep=2pt, font=\\scriptsize, anchor=south west] at ` +
        `(axis cs:${num(angleOf(a.at.x))},${num(a.at.y)}) {${texText(a.text)}};`,
      );
    }
  }
  for (const e of entries) {
    const color = `cj${e.color % (fig.mono ? spec.monoColors.length : spec.colors.length)}`;
    out.push(`\\addlegendimage{${color}, ${TIKZ_DASH[e.dash]}, mark=${TIKZ_MARKS[e.marker]}, mark size=1.3pt}`);
    const series = panel.series.find((s) => s.id === e.seriesId);
    const label = series?.bold ? `\\textbf{${texText(e.label)}}` : texText(e.label);
    out.push(`\\addlegendentry{${label}}`);
  }
  out.push("\\end{polaraxis}");
  if (fig.artifacts.includes("normalized-to-ours")) {
    out.push(
      `\\node[font=\\scriptsize\\itshape, text=black!55, anchor=north] at ` +
      `(${cm(atX + (Math.min(w, h) + 1) / 2)}cm, ${cm(atY - Math.min(w, h) - 1.1)}cm) {(normalized to ours = 1.0)};`,
    );
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
