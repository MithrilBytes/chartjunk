/**
 * Hand-written SVG. Text stays as <text> so it remains selectable and
 * small; every color, dash, and marker comes from styles.ts so TikZ agrees.
 */
import type {
  Annotation, Axis, Caption, Figure, Legend, Panel, Point, Region, Run, Series,
} from "../types.js";
import { STYLES, type StyleSpec, dashArray, seriesColor } from "../styles.js";

export interface SvgOptions {
  /** Include the caption block under the plot (html supplies its own). */
  caption?: boolean;
}

const SIZES: Record<Figure["size"], [number, number]> = {
  single: [480, 360],
  double: [800, 330],
  square: [420, 420],
  wide: [800, 250],
};

/** Viridis anchor colors (matplotlib's default sequential colormap). */
const VIRIDIS = [
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
  [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
] as const;

export function renderSvg(fig: Figure, opts: SvgOptions = {}): string {
  const withCaption = opts.caption !== false;
  const [W, gridH] = SIZES[fig.size];
  const spec = STYLES[fig.style];
  const n = fig.panels.length;
  const cols = n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3;
  const rows = n === 0 ? 0 : Math.ceil(n / cols);

  const captionText = withCaption ? captionPlain(fig) : "";
  const capLines = withCaption ? wrapText(captionText, Math.floor((W - 28) / 5.0)) : [];
  const capH = withCaption ? capLines.length * 13 + 16 : 6;
  const H = (n === 0 ? 8 : gridH) + capH;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${fmt(H)}" ` +
    `width="${W}" height="${fmt(H)}" font-family="${escapeXml(spec.font)}" role="img">`,
  );
  out.push(`<title>${escapeXml(`Figure ${fig.number}: ${captionPlain(fig)}`)}</title>`);
  out.push(defs(fig, spec));
  out.push(`<rect x="0" y="0" width="${W}" height="${fmt(H)}" fill="#ffffff"/>`);

  const cellW = W / Math.max(cols, 1);
  const cellH = n === 0 ? 0 : gridH / rows;
  fig.panels.forEach((panel, i) => {
    const cx = (i % cols) * cellW;
    const cy = Math.floor(i / cols) * cellH;
    out.push(`<g transform="translate(${fmt(cx)},${fmt(cy)})">`);
    out.push(renderPanel(fig, panel, spec, cellW, cellH, i));
    out.push(`</g>`);
  });

  // The watermark stamps the whole figure, over every panel.
  const wm = fig.panels
    .flatMap((p) => p.annotations)
    .find((a) => a.type === "watermark");
  if (wm && wm.type === "watermark") {
    const cx = W / 2;
    const cy = gridH / 2;
    out.push(
      `<text x="${fmt(cx)}" y="${fmt(cy)}" font-size="${n > 1 ? 64 : 46}" fill="#888888" opacity="0.14" ` +
      `text-anchor="middle" letter-spacing="6" transform="rotate(-28 ${fmt(cx)} ${fmt(cy)})">` +
      `${escapeXml(wm.text)}</text>`,
    );
  }

  if (withCaption) {
    const capY = (n === 0 ? 8 : gridH) + 12;
    out.push(renderCaptionBlock(fig, capLines, W, capY));
  }
  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* Defs                                                                */
/* ------------------------------------------------------------------ */

function defs(fig: Figure, spec: StyleSpec): string {
  const out: string[] = ["<defs>"];
  const angles = [45, 135, 0, 90];
  angles.forEach((a, i) => {
    out.push(
      `<pattern id="hatch${i}" width="5" height="5" patternUnits="userSpaceOnUse" ` +
      `patternTransform="rotate(${a})">` +
      `<line x1="0" y1="0" x2="0" y2="5" stroke="#555555" stroke-width="1"/></pattern>`,
    );
  });
  if (spec.barGradient) {
    const cycle = fig.mono ? spec.monoColors : spec.colors;
    cycle.forEach((c, i) => {
      out.push(
        `<linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${lighten(c, 0.35)}"/>` +
        `<stop offset="1" stop-color="${c}"/></linearGradient>`,
      );
    });
  }
  out.push("</defs>");
  return out.join("");
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

interface Frame {
  left: number; right: number; top: number; bottom: number;
  plotW: number; plotH: number;
  px: (v: number) => number;
  py: (v: number) => number;
  py2?: (v: number) => number;
  yTicksShown: number[];
}

function renderPanel(fig: Figure, panel: Panel, spec: StyleSpec, W: number, H: number, index: number): string {
  if (panel.kind === "radar") return renderRadarPanel(fig, panel, spec, W, H);
  const rotated = fig.artifacts.includes("rotated-ticks")
    && (panel.kind === "bar" || panel.kind === "heatmap" || panel.kind === "violin");
  const legendOutside = panel.legend.entries.length > 0 && panel.legend.position === "outside";
  const legendW = legendOutside ? legendWidth(panel.legend) : 0;
  const colorbarW = panel.kind === "heatmap" ? 46 : 0;
  const left = 46;
  const right = W - 12 - (panel.y2 ? 34 : 0) - legendW - colorbarW;
  const top = 14;
  const bottom = H - 36 - (rotated ? 14 : 0);
  const plotW = right - left;
  const plotH = bottom - top;

  const yInfo = yMapping(panel, top, bottom);
  const px = axisMapper(panel.x, left, right, false);
  const frame: Frame = {
    left, right, top, bottom, plotW, plotH,
    px, py: yInfo.py, yTicksShown: yInfo.ticksShown,
  };
  if (panel.y2) {
    const m = axisMapper(panel.y2, bottom, top, false);
    frame.py2 = m;
  }

  const out: string[] = [];
  const clipId = `clip${index}`;
  out.push(`<clipPath id="${clipId}">${rect(left, top, plotW, plotH, "")}</clipPath>`);
  if (spec.panelBg) {
    out.push(rect(left, top, plotW, plotH, `fill="${spec.panelBg}"`));
  }
  // Everything living in data space clips to the plot rectangle, so crops
  // and broken axes can never push ink over the axes or the caption.
  out.push(`<g clip-path="url(#${clipId})">`);
  out.push(renderRegions(fig, panel, frame));
  out.push(renderGrid(fig, panel, spec, frame));
  if (panel.kind === "heatmap") out.push(renderHeatmapCells(fig, panel, frame));
  out.push(renderSeries(fig, panel, spec, frame));
  out.push(renderRug(fig, panel, spec, frame));
  out.push(renderAnnotations(fig, panel, spec, frame));
  out.push(`</g>`);
  if (panel.kind === "heatmap") out.push(renderColorbar(fig, panel, frame));
  out.push(renderAxes(fig, panel, spec, frame, rotated));
  if (panel.legend.entries.length > 0) out.push(renderLegend(fig, panel, spec, frame, legendOutside));
  if (panel.label) {
    out.push(text(left - 34, top + 2, panel.label, 11, `font-weight="600"`));
  }
  return out.filter(Boolean).join("\n");
}

/** y mapping with the zero-suppressed crop and the broken-axis gap. */
function yMapping(panel: Panel, top: number, bottom: number): {
  py: (v: number) => number; ticksShown: number[];
} {
  const axis = panel.y;
  const [r0, r1] = axis.range;
  if (panel.kind === "bump") {
    // Rank 1 belongs on top; the axis runs downhill on purpose.
    return { py: axisMapper(axis, top, bottom, false), ticksShown: axis.ticks };
  }
  if (axis.broken) {
    const [g0, g1] = axis.broken;
    const lowFrac = 0.12;
    const lowH = (bottom - top) * lowFrac;
    const hiH = (bottom - top) - lowH - 8;
    const py = (v: number): number => {
      if (v <= g0) {
        const t = (v - r0) / Math.max(g0 - r0, 1e-9);
        return bottom - t * lowH;
      }
      const t = (Math.min(v, r1) - g1) / Math.max(r1 - g1, 1e-9);
      return bottom - lowH - 8 - Math.max(t, 0) * hiH;
    };
    return { py, ticksShown: axis.ticks.filter((t) => t <= g0 || t >= g1) };
  }
  let lo = r0;
  if (axis.zeroSuppressed) {
    const dataMin = panelYMin(panel);
    if (dataMin !== undefined && dataMin > r0) {
      lo = axis.scale === "log" ? dataMin * 0.85 : dataMin * 0.94 + r0 * 0.06;
    }
  }
  const mapper = axisMapper({ ...axis, range: [lo, r1] }, bottom, top, axis.scale === "log");
  const shown = axis.zeroSuppressed
    ? axis.ticks.filter((t) => t >= lo)
    : axis.ticks;
  return { py: mapper, ticksShown: shown };
}

function panelYMin(panel: Panel): number | undefined {
  let min = Infinity;
  for (const s of panel.series) {
    if (s.y2) continue;
    for (const p of s.points) min = Math.min(min, p.lo ?? p.y);
  }
  // A crop must not hide the theoretical-limit line.
  for (const a of panel.annotations) {
    if (a.type === "hline") min = Math.min(min, a.at);
  }
  return min === Infinity ? undefined : min;
}

function axisMapper(axis: Axis, from: number, to: number, forceLog: boolean): (v: number) => number {
  const log = axis.scale === "log" || forceLog;
  const [a, b] = axis.range;
  if (log) {
    const la = Math.log10(a);
    const lb = Math.log10(b);
    return (v) => from + ((Math.log10(Math.max(v, 1e-12)) - la) / (lb - la)) * (to - from);
  }
  return (v) => from + ((v - a) / (b - a)) * (to - from);
}

/* ------------------------------------------------------------------ */
/* Grid, axes                                                          */
/* ------------------------------------------------------------------ */

function renderGrid(fig: Figure, panel: Panel, spec: StyleSpec, f: Frame): string {
  if (panel.kind === "heatmap") return "";
  const major = spec.gridAlways || fig.artifacts.includes("grid-major");
  const minor = fig.artifacts.includes("grid-minor");
  if (!major && !minor) return "";
  const out: string[] = [];
  const gc = spec.gridColor;
  if (minor) {
    for (const t of panel.x.minorTicks ?? []) {
      out.push(line(f.px(t), f.top, f.px(t), f.bottom, `stroke="${gc}" stroke-width="0.4" opacity="0.6"`));
    }
    for (const t of panel.y.minorTicks ?? []) {
      out.push(line(f.left, f.py(t), f.right, f.py(t), `stroke="${gc}" stroke-width="0.4" opacity="0.6"`));
    }
  }
  if (major) {
    for (const t of panel.x.ticks) {
      out.push(line(f.px(t), f.top, f.px(t), f.bottom, `stroke="${gc}" stroke-width="0.8" opacity="0.9"`));
    }
    for (const t of f.yTicksShown) {
      out.push(line(f.left, f.py(t), f.right, f.py(t), `stroke="${gc}" stroke-width="0.8" opacity="0.9"`));
    }
  }
  return out.join("\n");
}

function renderAxes(fig: Figure, panel: Panel, spec: StyleSpec, f: Frame, rotated: boolean): string {
  const out: string[] = [];
  const axCol = "#262626";
  const tickLen = 4;
  const dir = spec.ticksOut ? 1 : -1;

  if (spec.frame === "box") {
    out.push(rect(f.left, f.top, f.plotW, f.plotH, `fill="none" stroke="${axCol}" stroke-width="0.9"`));
  }

  // x ticks and labels.
  panel.x.ticks.forEach((t, i) => {
    const xp = f.px(t);
    if (spec.frame !== "none") {
      out.push(line(xp, f.bottom, xp, f.bottom + dir * tickLen, `stroke="${axCol}" stroke-width="0.9"`));
    }
    if (panel.x.tickLabels === undefined && panel.x.scale === "log") {
      const e = Math.round(Math.log10(t));
      out.push(
        `<text x="${fmt(xp)}" y="${fmt(f.bottom + 14)}" font-size="8.5" fill="${axCol}" text-anchor="middle">10` +
        `<tspan dy="-3.4" font-size="6.5">${e}</tspan></text>`,
      );
    } else {
      const label = panel.x.tickLabels ? panel.x.tickLabels[i] : tickLabel(t, false);
      const weight = panel.kind === "violin" && panel.series[i]?.bold ? ` font-weight="600"` : "";
      if (rotated) {
        out.push(
          `<text x="${fmt(xp)}" y="${fmt(f.bottom + 14)}" font-size="8.5" fill="${axCol}"${weight} ` +
          `text-anchor="end" transform="rotate(-45 ${fmt(xp)} ${fmt(f.bottom + 14)})">${escapeXml(label)}</text>`,
        );
      } else {
        out.push(textAnchored(xp, f.bottom + 14, label, 8.5, "middle", `fill="${axCol}"${weight}`));
      }
    }
  });
  if ((panel.x.minorTicks ?? []).length > 0 && spec.frame !== "none") {
    for (const t of panel.x.minorTicks ?? []) {
      out.push(line(f.px(t), f.bottom, f.px(t), f.bottom + dir * 2.4, `stroke="${axCol}" stroke-width="0.6"`));
    }
  }

  // y ticks and labels.
  for (const t of f.yTicksShown) {
    const yp = f.py(t);
    if (spec.frame !== "none") {
      out.push(line(f.left, yp, f.left - dir * tickLen, yp, `stroke="${axCol}" stroke-width="0.9"`));
    }
    if (panel.y.tickLabels) {
      const label = panel.y.tickLabels[panel.y.ticks.indexOf(t)] ?? tickLabel(t, false);
      out.push(textAnchored(f.left - 7, yp + 3, label, 8.5, "end", `fill="${axCol}"`));
    } else {
      out.push(logAwareLabel(f.left - 7, yp + 3, t, panel.y.scale === "log", "end", axCol));
    }
  }
  if (panel.y.scale === "log" && spec.frame !== "none") {
    for (const t of panel.y.minorTicks ?? []) {
      out.push(line(f.left, f.py(t), f.left - dir * 2.4, f.py(t), `stroke="${axCol}" stroke-width="0.6"`));
    }
  }

  // Broken-axis slashes.
  if (panel.y.broken) {
    const yb = f.bottom - f.plotH * 0.12 - 4;
    out.push(line(f.left - 5, yb + 3, f.left + 5, yb - 3, `stroke="${axCol}" stroke-width="1"`));
    out.push(line(f.left - 5, yb + 9, f.left + 5, yb + 3, `stroke="${axCol}" stroke-width="1"`));
  }

  // Axis titles.
  const xTitle = axisTitle(panel.x);
  const yTitle = axisTitle(panel.y);
  out.push(textAnchored((f.left + f.right) / 2, f.bottom + (rotated ? 38 : 28), xTitle, 10, "middle", `fill="${axCol}"`));
  out.push(
    `<text x="${fmt(f.left - 34)}" y="${fmt((f.top + f.bottom) / 2)}" font-size="10" fill="${axCol}" ` +
    `text-anchor="middle" transform="rotate(-90 ${fmt(f.left - 34)} ${fmt((f.top + f.bottom) / 2)})">` +
    `${escapeXml(yTitle)}</text>`,
  );

  // Secondary axis.
  if (panel.y2 && f.py2) {
    const xr = f.right;
    out.push(line(xr, f.top, xr, f.bottom, `stroke="${axCol}" stroke-width="0.9"`));
    for (const t of panel.y2.ticks) {
      const yp = f.py2(t);
      out.push(line(xr, yp, xr + tickLen, yp, `stroke="${axCol}" stroke-width="0.9"`));
      out.push(textAnchored(xr + 7, yp + 3, tickLabel(t, false), 8.5, "start", `fill="${axCol}"`));
    }
    out.push(
      `<text x="${fmt(xr + 30)}" y="${fmt((f.top + f.bottom) / 2)}" font-size="10" fill="${axCol}" ` +
      `text-anchor="middle" transform="rotate(90 ${fmt(xr + 30)} ${fmt((f.top + f.bottom) / 2)})">` +
      `${escapeXml(axisTitle(panel.y2))}</text>`,
    );
  }
  return out.join("\n");
}

function axisTitle(axis: Axis): string {
  return axis.unit ? `${axis.label} (${axis.unit})` : axis.label;
}

function logAwareLabel(x: number, y: number, v: number, log: boolean, anchor: string, fill: string): string {
  if (log) {
    const e = Math.round(Math.log10(v));
    return (
      `<text x="${fmt(x)}" y="${fmt(y)}" font-size="8.5" fill="${fill}" text-anchor="${anchor}">10` +
      `<tspan dy="-3.4" font-size="6.5">${e}</tspan></text>`
    );
  }
  return textAnchored(x, y, tickLabel(v, false), 8.5, anchor, `fill="${fill}"`);
}

function tickLabel(v: number, log: boolean): string {
  if (log) {
    const e = Math.round(Math.log10(v));
    return `1e${e}`;
  }
  if (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3)) {
    return v.toExponential(0).replace("+", "");
  }
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
}

/* ------------------------------------------------------------------ */
/* Regions, series                                                     */
/* ------------------------------------------------------------------ */

function renderRegions(fig: Figure, panel: Panel, f: Frame): string {
  const out: string[] = [];
  const romans = new Set(["I", "II", "III"]);
  panel.regions.forEach((rg, i) => {
    const pts = rg.polygon.map((p) => `${fmt(f.px(p.x))},${fmt(f.py(p.y))}`).join(" ");
    const fill = rg.fill === "hatch"
      ? `url(#hatch${i % 4})`
      : romans.has(rg.label) ? regionShade(i) : "#9e9e9e";
    const op = rg.fill === "hatch" ? "0.55" : romans.has(rg.label) ? "0.30" : "0.18";
    out.push(`<polygon points="${pts}" fill="${fill}" opacity="${op}"/>`);
    const c = centroid(rg.polygon);
    out.push(textAnchored(f.px(c.x), f.py(c.y), rg.label, 9.5, "middle", `fill="#555555" font-style="italic"`));
  });
  return out.join("\n");
}

function regionShade(i: number): string {
  const shades = ["#b3c6e7", "#c9e7b3", "#e7d9b3"];
  return shades[i % shades.length];
}

function renderSeries(fig: Figure, panel: Panel, spec: StyleSpec, f: Frame): string {
  if (panel.kind === "heatmap") return "";
  const out: string[] = [];
  const lw = spec.lineWidth;

  // Error bands under everything else (line series with bounds).
  for (const s of panel.series) {
    if (s.draw !== "line" || s.role === "reference") continue;
    if (!s.points.some((p) => p.lo !== undefined)) continue;
    const py = s.y2 && f.py2 ? f.py2 : f.py;
    const fwd = s.points.map((p) => `${fmt(f.px(p.x))},${fmt(py(p.lo ?? p.y))}`);
    const back = [...s.points].reverse().map((p) => `${fmt(f.px(p.x))},${fmt(py(p.hi ?? p.y))}`);
    out.push(
      `<polygon points="${[...fwd, ...back].join(" ")}" ` +
      `fill="${seriesColor(fig.style, fig.mono, s.color)}" opacity="0.16"/>`,
    );
  }

  // Bars.
  const barSeries = panel.series.filter((s) => s.draw === "bar");
  if (barSeries.length > 0) {
    const nS = barSeries.length;
    const groupW = f.px(1) - f.px(0);
    const barW = (groupW * 0.76) / nS;
    barSeries.forEach((s, si) => {
      const color = seriesColor(fig.style, fig.mono, s.color);
      const fill = fig.mono
        ? `url(#hatch${si % 4})`
        : spec.barGradient ? `url(#grad${s.color % spec.colors.length})` : color;
      for (const p of s.points) {
        const xc = f.px(p.x) - groupW * 0.38 + barW * (si + 0.5);
        const yTop = f.py(p.y);
        const yBase = f.bottom;
        out.push(rect(
          xc - barW / 2 + 0.5, Math.min(yTop, yBase), barW - 1, Math.abs(yBase - yTop),
          `fill="${fill}" stroke="${fig.mono ? "#262626" : "none"}" stroke-width="${fig.mono ? 0.8 : 0}"`,
        ));
        if (spec.barGradient) {
          out.push(line(xc - barW / 2 + 1, yTop + 0.7, xc + barW / 2 - 1, yTop + 0.7, `stroke="#ffffff" stroke-width="0.8" opacity="0.7"`));
        }
        if (p.lo !== undefined && p.hi !== undefined) {
          out.push(errorWhisker(xc, f.py(p.lo), f.py(p.hi), barW * 0.4));
        }
      }
    });
  }

  // Filled bands: violin bodies and any closed outline.
  for (const s of panel.series) {
    if (s.draw !== "band") continue;
    const color = seriesColor(fig.style, fig.mono, s.color);
    const pts = s.points.map((p) => `${fmt(f.px(p.x))},${fmt(f.py(p.y))}`).join(" ");
    out.push(
      `<polygon points="${pts}" fill="${fig.mono ? `url(#hatch${s.color % 4})` : color}" ` +
      `opacity="${fig.mono ? 0.75 : 0.55}" stroke="${color}" stroke-width="0.9"/>`,
    );
    if (s.stats) {
      const cx = f.px((s.points[0].x + s.points[s.points.length - 1].x) / 2);
      const bw = 5;
      out.push(rect(cx - bw / 2, f.py(s.stats.q3), bw, Math.abs(f.py(s.stats.q1) - f.py(s.stats.q3)),
        `fill="#ffffff" opacity="0.9" stroke="#262626" stroke-width="0.7"`));
      out.push(line(cx - bw / 2, f.py(s.stats.median), cx + bw / 2, f.py(s.stats.median),
        `stroke="#262626" stroke-width="1.4"`));
    }
  }

  // Lines, steps, scatter.
  for (const s of panel.series) {
    if (s.draw === "bar" || s.draw === "band") continue;
    const py = s.y2 && f.py2 ? f.py2 : f.py;
    const color = seriesColor(fig.style, fig.mono, s.color);
    const da = dashArray(s.dash, lw);
    if (s.draw === "line" || s.draw === "step") {
      const pts = s.points.map((p, i) => {
        const x = fmt(f.px(p.x));
        const y = fmt(py(p.y));
        if (s.draw === "step" && i > 0) {
          const prev = fmt(py(s.points[i - 1].y));
          return `${x},${prev} ${x},${y}`;
        }
        return `${x},${y}`;
      }).join(" ");
      const w = s.role === "reference" ? Math.max(lw * 0.7, 0.8) : lw;
      out.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${fmt(w)}"` +
        (da ? ` stroke-dasharray="${da}"` : "") + ` stroke-linejoin="round"/>`,
      );
    }
    if (s.marker !== "none" && s.role !== "reference") {
      for (const p of s.points) {
        out.push(markerGlyph(s.marker, f.px(p.x), py(p.y), 3.1, color));
      }
    }
    if (s.draw === "scatter" && s.role === "reference") {
      for (const p of s.points) {
        out.push(markerGlyph(s.marker, f.px(p.x), py(p.y), 3.1, color));
      }
    }
  }
  return out.join("\n");
}

function errorWhisker(x: number, yLo: number, yHi: number, cap: number): string {
  const c = `stroke="#262626" stroke-width="0.9"`;
  return [
    line(x, yLo, x, yHi, c),
    line(x - cap / 2, yLo, x + cap / 2, yLo, c),
    line(x - cap / 2, yHi, x + cap / 2, yHi, c),
  ].join("\n");
}

function markerGlyph(marker: Series["marker"], x: number, y: number, r: number, color: string): string {
  switch (marker) {
    case "circle":
      return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${color}"/>`;
    case "square":
      return rect(x - r, y - r, 2 * r, 2 * r, `fill="${color}"`);
    case "triangle":
      return poly([[x, y - r * 1.2], [x - r * 1.1, y + r], [x + r * 1.1, y + r]], `fill="${color}"`);
    case "diamond":
      return poly([[x, y - r * 1.3], [x + r * 1.1, y], [x, y + r * 1.3], [x - r * 1.1, y]], `fill="${color}"`);
    case "star":
      return starPath(x, y, r * 1.7, color);
    case "cross":
      return [
        line(x - r, y - r, x + r, y + r, `stroke="${color}" stroke-width="1.4"`),
        line(x - r, y + r, x + r, y - r, `stroke="${color}" stroke-width="1.4"`),
      ].join("");
    case "plus":
      return [
        line(x - r * 1.2, y, x + r * 1.2, y, `stroke="${color}" stroke-width="1.4"`),
        line(x, y - r * 1.2, x, y + r * 1.2, `stroke="${color}" stroke-width="1.4"`),
      ].join("");
    default:
      return "";
  }
}

function starPath(cx: number, cy: number, R: number, color: string): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? R : R * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return poly(pts, `fill="${color}"`);
}

/* ------------------------------------------------------------------ */
/* Heatmap                                                             */
/* ------------------------------------------------------------------ */

function renderHeatmapCells(fig: Figure, panel: Panel, f: Frame): string {
  const m = panel.matrix;
  if (!m) return "";
  const out: string[] = [];
  const lo = Math.min(...m.values);
  const hi = Math.max(...m.values);
  const cw = f.plotW / m.cols;
  const ch = f.plotH / m.rows;
  const gridOn = fig.artifacts.includes("grid-major");
  // Cells follow the axis mapper so row 0 sits where its tick label says.
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      const v = m.values[r * m.cols + c];
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      const color = fig.mono ? grayRamp(t) : viridis(t);
      out.push(rect(
        f.px(c - 0.5), f.py(r + 0.5), cw, ch,
        `fill="${color}"` + (gridOn ? ` stroke="#ffffff" stroke-width="0.7"` : ""),
      ));
      if (fig.artifacts.includes("cell-values")) {
        const tc = t > 0.62 ? "#1a1a1a" : "#f2f2f2";
        out.push(textAnchored(
          f.px(c), f.py(r) + 2.4,
          v.toFixed(2), Math.min(7.5, ch * 0.42), "middle", `fill="${tc}"`,
        ));
      }
    }
  }
  return out.join("\n");
}

/** Colorbar with its proudly nonsensical unit; lives right of the plot. */
function renderColorbar(fig: Figure, panel: Panel, f: Frame): string {
  const m = panel.matrix;
  if (!m) return "";
  const out: string[] = [];
  const lo = Math.min(...m.values);
  const hi = Math.max(...m.values);
  const cbX = f.right + 10;
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const t = 1 - i / (steps - 1);
    out.push(rect(cbX, f.top + (i * f.plotH) / steps, 10, f.plotH / steps + 0.5,
      `fill="${fig.mono ? grayRamp(t) : viridis(t)}"`));
  }
  out.push(rect(cbX, f.top, 10, f.plotH, `fill="none" stroke="#262626" stroke-width="0.7"`));
  for (const t of m.colorbar.ticks) {
    if (t < lo || t > hi) continue;
    const yy = f.top + (1 - (t - lo) / Math.max(hi - lo, 1e-9)) * f.plotH;
    out.push(line(cbX + 10, yy, cbX + 13, yy, `stroke="#262626" stroke-width="0.7"`));
    out.push(textAnchored(cbX + 15, yy + 2.6, tickLabel(t, false), 7.5, "start", `fill="#262626"`));
  }
  const cbTitle = m.colorbar.unit ? `${m.colorbar.label} (${m.colorbar.unit})` : m.colorbar.label;
  out.push(
    `<text x="${fmt(cbX + 32)}" y="${fmt((f.top + f.bottom) / 2)}" font-size="8.5" fill="#262626" ` +
    `text-anchor="middle" transform="rotate(90 ${fmt(cbX + 32)} ${fmt((f.top + f.bottom) / 2)})">` +
    `${escapeXml(cbTitle)}</text>`,
  );
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Radar                                                               */
/* ------------------------------------------------------------------ */

function renderRadarPanel(fig: Figure, panel: Panel, spec: StyleSpec, W: number, H: number): string {
  const out: string[] = [];
  const entries = panel.legend.entries;
  const legendW = entries.length > 0 ? legendWidth(panel.legend) : 0;
  const cx = (W - legendW) / 2;
  const cy = (H - 26) / 2 + 4;
  const R = Math.max(Math.min(cx - 64, cy - 30), 40);
  const S = panel.x.ticks.length;
  const rMax = panel.y.range[1];
  const angle = (s: number): number => -Math.PI / 2 + (s * 2 * Math.PI) / S;
  const at = (s: number, v: number): [number, number] => {
    const r = (Math.max(v, 0) / rMax) * R;
    return [cx + r * Math.cos(angle(s)), cy + r * Math.sin(angle(s))];
  };

  // Rings and spokes; the grid artifact thickens the rings.
  const gridOn = spec.gridAlways || fig.artifacts.includes("grid-major");
  const ringTicks = panel.y.ticks.filter((t) => t > 0);
  for (const t of ringTicks) {
    const rr = (t / rMax) * R;
    out.push(
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(rr)}" fill="none" ` +
      `stroke="${spec.gridColor}" stroke-width="${gridOn ? 0.9 : 0.5}" opacity="${gridOn ? 0.9 : 0.65}"/>`,
    );
    out.push(textAnchored(cx + 3, cy - rr - 2, tickLabel(t, false), 6.5, "start", `fill="#8c8c8c"`));
  }
  for (let s = 0; s < S; s++) {
    const [ex, ey] = at(s, rMax);
    out.push(line(cx, cy, ex, ey, `stroke="${spec.gridColor}" stroke-width="0.6" opacity="0.8"`));
    const label = panel.x.tickLabels?.[s] ?? String(s);
    const lx = cx + (R + 10) * Math.cos(angle(s));
    const ly = cy + (R + 10) * Math.sin(angle(s));
    const anchor = Math.abs(Math.cos(angle(s))) < 0.35 ? "middle" : Math.cos(angle(s)) > 0 ? "start" : "end";
    out.push(textAnchored(lx, ly + 3, label, 8.5, anchor, `fill="#262626"`));
  }

  // One polygon per method, ours drawn last so it sits on top.
  const ordered = [...panel.series].sort((a, b) => Number(a.role === "ours") - Number(b.role === "ours"));
  for (const s of ordered) {
    const color = seriesColor(fig.style, fig.mono, s.color);
    const pts = s.points.map((p) => at(p.x, p.y));
    out.push(poly(pts, `fill="${color}" fill-opacity="0.1" stroke="${color}" ` +
      `stroke-width="${s.role === "ours" ? 1.8 : 1.2}"` +
      (dashArray(s.dash, 1.2) ? ` stroke-dasharray="${dashArray(s.dash, 1.2)}"` : "")));
    for (const p of s.points) {
      const [mx, my] = at(p.x, p.y);
      out.push(markerGlyph(s.marker, mx, my, 2.6, color));
    }
  }

  // The radial lie.
  if (fig.artifacts.includes("normalized-to-ours")) {
    out.push(textAnchored(cx, H - 8, "(normalized to ours = 1.0)", 8, "middle",
      `fill="#666666" font-style="italic"`));
  }

  for (const a of panel.annotations) {
    if (a.type === "text" && a.boxed) {
      const [bx, by] = at(a.at.x, a.at.y);
      const w = a.text.length * 4.6 + 8;
      out.push(rect(bx + 6, by - 16, w, 13, `fill="#ffffff" stroke="#262626" stroke-width="0.7" opacity="0.92"`));
      out.push(textAnchored(bx + 10, by - 6.5, a.text, 8.5, "start", `fill="#262626"`));
    }
  }

  if (entries.length > 0) {
    const lh = 13;
    const lx = W - legendW - 6;
    const ly = 10;
    if (spec.legendBox) {
      out.push(rect(lx, ly, legendW, entries.length * lh + 8, `fill="#ffffff" opacity="0.9" stroke="#8c8c8c" stroke-width="0.7"`));
    }
    entries.forEach((e, i) => {
      const ey = ly + 10 + i * lh;
      const color = seriesColor(fig.style, fig.mono, e.color);
      out.push(line(lx + 5, ey, lx + 21, ey, `stroke="${color}" stroke-width="1.6"`));
      out.push(markerGlyph(e.marker, lx + 13, ey, 2.7, color));
      const series = panel.series.find((s) => s.id === e.seriesId);
      const bold = series?.bold ? ` font-weight="600"` : "";
      out.push(textAnchored(lx + 26, ey + 3, e.label, 8.5, "start", `fill="#262626"${bold}`));
    });
  }
  return out.join("\n");
}

function viridis(t: number): string {
  const x = Math.min(Math.max(t, 0), 1) * (VIRIDIS.length - 1);
  const i = Math.min(Math.floor(x), VIRIDIS.length - 2);
  const u = x - i;
  const a = VIRIDIS[i];
  const b = VIRIDIS[i + 1];
  const ch = (j: number): number => Math.round(a[j] + (b[j] - a[j]) * u);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

function grayRamp(t: number): string {
  const v = Math.round(35 + (1 - t) * 205);
  return `rgb(${v},${v},${v})`;
}

/* ------------------------------------------------------------------ */
/* Rug, annotations, legend, caption                                   */
/* ------------------------------------------------------------------ */

function renderRug(fig: Figure, panel: Panel, spec: StyleSpec, f: Frame): string {
  if (!fig.artifacts.includes("marginal-rug") || panel.kind !== "scatter") return "";
  const ours = panel.series.find((s) => s.role === "ours");
  if (!ours) return "";
  const color = seriesColor(fig.style, fig.mono, ours.color);
  const out: string[] = [];
  for (const p of ours.points) {
    out.push(line(f.px(p.x), f.bottom - 5, f.px(p.x), f.bottom - 1, `stroke="${color}" stroke-width="0.8" opacity="0.75"`));
    out.push(line(f.left + 1, f.py(p.y), f.left + 5, f.py(p.y), `stroke="${color}" stroke-width="0.8" opacity="0.75"`));
  }
  return out.join("\n");
}

function renderAnnotations(fig: Figure, panel: Panel, spec: StyleSpec, f: Frame): string {
  const out: string[] = [];
  for (const a of panel.annotations) {
    switch (a.type) {
      case "text": {
        const x = f.px(a.at.x);
        const y = f.py(a.at.y);
        if (a.boxed) {
          const w = a.text.length * 4.6 + 8;
          const bx = Math.min(x + 6, f.right - w - 2);
          const by = Math.max(y - 16, f.top + 2);
          out.push(rect(bx, by, w, 13, `fill="#ffffff" stroke="#262626" stroke-width="0.7" opacity="0.92"`));
          out.push(textAnchored(bx + 4, by + 9.5, a.text, 8.5, "start", `fill="#262626"`));
          out.push(line(x, y, bx, by + 9, `stroke="#262626" stroke-width="0.6"`));
        } else {
          out.push(textAnchored(x, y, a.text, 9, "middle", `fill="#262626"`));
        }
        break;
      }
      case "arrow": {
        const x1 = f.px(a.from.x);
        const y1 = f.py(a.from.y);
        const x2 = f.px(a.to.x);
        const y2 = f.py(a.to.y);
        out.push(line(x1, y1, x2, y2, `stroke="#262626" stroke-width="1"`));
        out.push(arrowHead(x1, y1, x2, y2));
        if (a.text) {
          out.push(textAnchored((x1 + x2) / 2 - 6, (y1 + y2) / 2 + 3, a.text, 8.5, "end", `fill="#262626" font-style="italic"`));
        }
        break;
      }
      case "stars": {
        const x = f.px(a.at.x);
        const y = f.py(a.at.y);
        const label = a.count === 0 ? "n.s." : "★".repeat(a.count);
        out.push(textAnchored(x, y, label, a.count === 0 ? 8.5 : 9.5, "middle",
          a.count === 0 ? `fill="#262626" font-style="italic"` : `fill="#262626"`));
        break;
      }
      case "hline": {
        const y = f.py(a.at);
        out.push(line(f.left, y, f.right, y, `stroke="#262626" stroke-width="1" stroke-dasharray="${dashArray(a.dash, 1) ?? "none"}"`));
        out.push(textAnchored(f.right - 4, y - 4, a.text, 8.5, "end", `fill="#262626" font-style="italic"`));
        break;
      }
      case "vline": {
        const x = f.px(a.at);
        out.push(line(x, f.top, x, f.bottom, `stroke="#262626" stroke-width="1" stroke-dasharray="${dashArray(a.dash, 1) ?? "none"}"`));
        out.push(textAnchored(x + 4, f.top + 10, a.text, 8.5, "start", `fill="#262626" font-style="italic"`));
        break;
      }
      case "inset": {
        out.push(renderInset(fig, panel, f, a.window, a.corner));
        break;
      }
      case "watermark":
        // Rendered at the figure level, across every panel.
        break;
    }
  }
  return out.join("\n");
}

function arrowHead(x1: number, y1: number, x2: number, y2: number): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = 5;
  const a1 = ang + Math.PI * 0.85;
  const a2 = ang - Math.PI * 0.85;
  return poly(
    [[x2, y2], [x2 + L * Math.cos(a1), y2 + L * Math.sin(a1)], [x2 + L * Math.cos(a2), y2 + L * Math.sin(a2)]],
    `fill="#262626"`,
  );
}

function renderInset(fig: Figure, panel: Panel, f: Frame, window: [Point, Point], corner: "ne" | "sw"): string {
  const out: string[] = [];
  const [w0, w1] = window;
  const wx0 = f.px(w0.x);
  const wx1 = f.px(w1.x);
  const wy0 = f.py(w0.y);
  const wy1 = f.py(w1.y);
  out.push(rect(Math.min(wx0, wx1), Math.min(wy0, wy1), Math.abs(wx1 - wx0), Math.abs(wy1 - wy0),
    `fill="none" stroke="#262626" stroke-width="0.7"`));

  const iw = f.plotW * 0.3;
  const ih = f.plotH * 0.3;
  const ix = corner === "ne" ? f.right - iw - 8 : f.left + 8;
  const iy = corner === "ne" ? f.top + 8 : f.bottom - ih - 8;
  out.push(rect(ix, iy, iw, ih, `fill="#ffffff" stroke="#262626" stroke-width="0.8"`));
  out.push(line(Math.min(wx0, wx1), Math.min(wy0, wy1), ix, iy + (corner === "ne" ? ih : 0), `stroke="#999999" stroke-width="0.5"`));
  out.push(line(Math.max(wx0, wx1), Math.min(wy0, wy1), ix + iw, iy + (corner === "ne" ? ih : 0), `stroke="#999999" stroke-width="0.5"`));

  const sx = (v: number): number => ix + ((v - w0.x) / Math.max(w1.x - w0.x, 1e-9)) * iw;
  const sy = (v: number): number => iy + ih - ((v - w0.y) / Math.max(w1.y - w0.y, 1e-9)) * ih;
  for (const s of panel.series) {
    if (s.draw !== "line" || s.y2) continue;
    const pts = s.points
      .filter((p) => p.x >= w0.x && p.x <= w1.x)
      .map((p) => `${fmt(sx(p.x))},${fmt(clampN(sy(p.y), iy, iy + ih))}`)
      .join(" ");
    if (!pts) continue;
    out.push(
      `<polyline points="${pts}" fill="none" stroke="${seriesColor(fig.style, fig.mono, s.color)}" ` +
      `stroke-width="1"/>`,
    );
  }
  return out.join("\n");
}

function legendWidth(legend: Legend): number {
  const longest = Math.max(...legend.entries.map((e) => e.label.length), 4);
  return longest * 4.8 + 34;
}

function renderLegend(fig: Figure, panel: Panel, spec: StyleSpec, f: Frame, outside: boolean): string {
  const entries = panel.legend.entries;
  const lh = 13;
  const w = legendWidth(panel.legend);
  const h = entries.length * lh + 8;
  let x: number;
  let y: number;
  if (outside) {
    x = f.right + (panel.y2 ? 40 : 8);
    y = f.top + 4;
  } else if (panel.legend.position === "over-data") {
    x = f.left + f.plotW * 0.5 - w / 2;
    y = f.top + f.plotH * 0.42;
  } else {
    const corner = bestCorner(panel, f);
    x = corner.includes("e") ? f.right - w - 6 : f.left + 6;
    y = corner.includes("n") ? f.top + 6 : f.bottom - h - 6;
  }
  const out: string[] = [];
  if (!outside) {
    out.push(rect(x, y, w, h,
      `fill="#ffffff" opacity="0.9"` +
      (spec.legendBox ? ` stroke="#8c8c8c" stroke-width="0.7"` : "")));
  }
  entries.forEach((e, i) => {
    const ey = y + 6 + i * lh + 4;
    const color = seriesColor(fig.style, fig.mono, e.color);
    const da = dashArray(e.dash, 1.4);
    const isBar = panel.kind === "bar";
    if (isBar) {
      out.push(rect(x + 6, ey - 4.5, 12, 8, `fill="${fig.mono ? `url(#hatch${i % 4})` : color}" stroke="#262626" stroke-width="0.5"`));
    } else {
      out.push(line(x + 5, ey, x + 21, ey, `stroke="${color}" stroke-width="1.6"` + (da ? ` stroke-dasharray="${da}"` : "")));
      out.push(markerGlyph(e.marker, x + 13, ey, 2.7, color));
    }
    const series = panel.series.find((s) => s.id === e.seriesId);
    const bold = series?.bold ? ` font-weight="600"` : "";
    out.push(textAnchored(x + 26, ey + 3, e.label, 8.5, "start", `fill="#262626"${bold}`));
  });
  return out.join("\n");
}

/** Corner with the fewest data points; deterministic "best" placement. */
function bestCorner(panel: Panel, f: Frame): string {
  const counts: Record<string, number> = { ne: 0, nw: 0, se: 0, sw: 0 };
  const midX = (f.left + f.right) / 2;
  const midY = (f.top + f.bottom) / 2;
  for (const s of panel.series) {
    const py = s.y2 && f.py2 ? f.py2 : f.py;
    for (const p of s.points) {
      const px = f.px(p.x);
      const key = (py(p.y) < midY ? "n" : "s") + (px > midX ? "e" : "w");
      counts[key] += 1;
    }
  }
  let best = "ne";
  for (const k of ["ne", "nw", "se", "sw"]) {
    if (counts[k] < counts[best]) best = k;
  }
  return best;
}

function renderCaptionBlock(fig: Figure, lines: string[], W: number, y: number): string {
  const out: string[] = [];
  lines.forEach((ln, i) => {
    out.push(textAnchored(14, y + i * 13, ln, 10, "start", `fill="#262626"`));
  });
  return out.join("\n");
}

function captionPlain(fig: Figure): string {
  return `${runsPlain(fig.caption.runs)}`;
}

function runsPlain(runs: Run[]): string {
  return runs
    .map((r) => {
      switch (r.k) {
        case "text": return r.s;
        case "bold": return r.s;
        case "math": return r.text;
        case "cite": return `[${r.ids.join(", ")}]`;
      }
    })
    .join("");
}

function wrapText(s: string, maxChars: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length > 0 && line.length + 1 + w.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line += (line.length > 0 ? " " : "") + w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Small SVG helpers                                                   */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rect(x: number, y: number, w: number, h: number, attrs: string): string {
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(Math.max(w, 0))}" height="${fmt(Math.max(h, 0))}" ${attrs}/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, attrs: string): string {
  return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" ${attrs}/>`;
}

function poly(pts: [number, number][], attrs: string): string {
  return `<polygon points="${pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ")}" ${attrs}/>`;
}

function text(x: number, y: number, s: string, size: number, attrs = ""): string {
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fmt(size)}" ${attrs}>${escapeXml(s)}</text>`;
}

function textAnchored(x: number, y: number, s: string, size: number, anchor: string, attrs = ""): string {
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fmt(size)}" text-anchor="${anchor}" ${attrs}>${escapeXml(s)}</text>`;
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

function clampN(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function lighten(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const up = (v: number): number => Math.round(v + (255 - v) * amt);
  return `rgb(${up(r)},${up(g)},${up(b)})`;
}
