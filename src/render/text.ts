/**
 * Plain text, 72 columns: box-drawing axes, marker characters, quartile
 * shades for heatmaps, and the caption below. For theorem-ipsum's
 * plain-text papers.
 */
import type { Figure, Panel, Run, Series } from "../types.js";

const WIDTH = 72;
const PLOT_LEFT = 7;
const PLOT_W = WIDTH - PLOT_LEFT - 2;
const PLOT_H = 13;

const MARKERS = ["·", "×", "▲", "■", "◆", "+"];
const OURS_MARK = "★";
const SHADES = ["░", "▒", "▓", "█"];

export function renderText(fig: Figure): string {
  const out: string[] = [];
  fig.panels.forEach((panel, i) => {
    if (fig.panels.length > 1 && panel.label) out.push(panel.label);
    out.push(...renderPanelText(fig, panel, i === 0 || panel.kind !== fig.panels[0].kind));
    out.push("");
  });
  const notes = footnotes(fig);
  if (notes) out.push(notes, "");
  out.push(...wrap(`Figure ${fig.number}: ${plainCaption(fig.caption.runs)}`));
  return out.map((l) => l.replace(/\s+$/, "")).join("\n") + "\n";
}

function renderPanelText(fig: Figure, panel: Panel, withLegend: boolean): string[] {
  const grid: string[][] = Array.from({ length: PLOT_H }, () => Array(PLOT_W).fill(" "));
  const [x0, x1] = panel.x.range;
  const [y0, y1] = panel.y.range;
  const logX = panel.x.scale === "log";
  const logY = panel.y.scale === "log";
  const nx = (v: number): number => {
    const t = logX
      ? (Math.log10(Math.max(v, 1e-12)) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))
      : (v - x0) / (x1 - x0);
    return Math.max(0, Math.min(PLOT_W - 1, Math.round(t * (PLOT_W - 1))));
  };
  const ny = (v: number): number => {
    const t = logY
      ? (Math.log10(Math.max(v, 1e-12)) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))
      : (v - y0) / (y1 - y0);
    const row = Math.round(t * (PLOT_H - 1));
    // Bump charts want rank 1 on top; everyone else wants low values low.
    const flipped = panel.kind === "bump" ? row : PLOT_H - 1 - row;
    return Math.max(0, Math.min(PLOT_H - 1, flipped));
  };

  if (panel.kind === "heatmap" && panel.matrix) {
    return renderHeatmapText(fig, panel);
  }
  if (panel.kind === "radar") {
    return renderRadarText(panel);
  }
  if (panel.kind === "violin") {
    return renderViolinText(panel);
  }

  // Regions shade sparsely so series stay legible.
  for (const rg of panel.regions) {
    shadeRegion(grid, rg.polygon.map((p) => ({ c: nx(p.x), r: ny(p.y) })));
  }
  for (const rg of panel.regions) {
    const cx = Math.round(rg.polygon.reduce((s, p) => s + nx(p.x), 0) / rg.polygon.length);
    const cy = Math.round(rg.polygon.reduce((s, p) => s + ny(p.y), 0) / rg.polygon.length);
    stamp(grid, cy, cx - Math.floor(rg.label.length / 2), rg.label);
  }

  for (const a of panel.annotations) {
    if (a.type === "hline") {
      const r = ny(a.at);
      for (let c = 0; c < PLOT_W; c++) if (c % 2 === 0) grid[r][c] = "╌";
    }
  }

  const bars = panel.series.filter((s) => s.draw === "bar");
  if (bars.length > 0) {
    drawBars(grid, panel, bars, nx, ny);
  }

  // Lines and clouds; ours draws last so it wins the cell.
  const drawable = panel.series
    .filter((s) => s.draw !== "bar" && !s.y2)
    .sort((a, b) => Number(a.role === "ours") - Number(b.role === "ours"));
  for (const s of drawable) {
    const mark = markFor(panel, s);
    if ((s.draw === "line" || s.draw === "step") && s.points.length > 1) {
      for (let c = nx(s.points[0].x); c <= nx(s.points[s.points.length - 1].x); c++) {
        const v = interpolateAtColumn(s, c, nx);
        if (v !== undefined) grid[ny(v)][c] = mark;
      }
    } else {
      for (const p of s.points) grid[ny(p.y)][nx(p.x)] = mark;
    }
  }

  for (const a of panel.annotations) {
    if (a.type === "stars") {
      const label = a.count === 0 ? "n.s." : OURS_MARK.repeat(a.count);
      stamp(grid, ny(a.at.y), nx(a.at.x) - 1, label);
    }
  }

  // Assemble with the frame and tick labels.
  const lines: string[] = [];
  lines.push(" ".repeat(PLOT_LEFT) + axisTitle(panel.y).slice(0, PLOT_W));
  const yTickRows = new Map<number, string>();
  for (const t of pickThree(panel.y.ticks)) {
    yTickRows.set(ny(t), fmtTick(t, logY));
  }
  for (let r = 0; r < PLOT_H; r++) {
    const label = yTickRows.get(r) ?? "";
    const joint = yTickRows.has(r) ? "┤" : "│";
    lines.push(label.padStart(PLOT_LEFT - 1) + joint + grid[r].join(""));
  }
  const xAxis: string[] = Array(PLOT_W).fill("─");
  const tickCols: [number, string][] = [];
  const xt = panel.x.tickLabels
    ? panel.x.ticks.map((t, i) => [t, panel.x.tickLabels?.[i] ?? ""] as [number, string])
    : pickThree(panel.x.ticks).map((t) => [t, fmtTick(t, logX)] as [number, string]);
  for (const [t] of xt) xAxis[nx(t)] = "┬";
  lines.push(" ".repeat(PLOT_LEFT - 1) + "└" + xAxis.join(""));
  const labelRow = Array(PLOT_W + PLOT_LEFT).fill(" ");
  for (const [t, s] of xt) tickCols.push([nx(t), s]);
  for (const [c, s] of tickCols) {
    const start = Math.min(Math.max(PLOT_LEFT + c - Math.floor(s.length / 2), 0), WIDTH - s.length);
    for (let i = 0; i < s.length; i++) labelRow[start + i] = s[i];
  }
  lines.push(labelRow.join(""));
  const xTitle = axisTitle(panel.x);
  lines.push(" ".repeat(Math.max(PLOT_LEFT + Math.floor((PLOT_W - xTitle.length) / 2), 0)) + xTitle.slice(0, PLOT_W));

  if (withLegend && panel.legend.entries.length > 0) {
    lines.push("");
    lines.push(...wrap(panel.legend.entries
      .map((e) => {
        const s = panel.series.find((x) => x.id === e.seriesId);
        const mark = s ? markFor(panel, s) : MARKERS[e.color % MARKERS.length];
        return `${mark} ${e.label}`;
      })
      .join("   ")));
  }
  return lines;
}

function markFor(panel: Panel, s: Series): string {
  if (s.role === "ours") return OURS_MARK;
  if (s.role === "reference" && s.label === "") return "·";
  return MARKERS[s.color % MARKERS.length];
}

function interpolateAtColumn(s: Series, col: number, nx: (v: number) => number): number | undefined {
  for (let i = 1; i < s.points.length; i++) {
    const c0 = nx(s.points[i - 1].x);
    const c1 = nx(s.points[i].x);
    if (col >= c0 && col <= c1) {
      const t = c1 > c0 ? (col - c0) / (c1 - c0) : 0;
      return s.points[i - 1].y + (s.points[i].y - s.points[i - 1].y) * t;
    }
  }
  return undefined;
}

function drawBars(
  grid: string[][], panel: Panel, bars: Series[],
  nx: (v: number) => number, ny: (v: number) => number,
): void {
  const nS = bars.length;
  bars.forEach((s, si) => {
    const ch = si === 0 && s.role === "ours" ? SHADES[3] : SHADES[(3 - (si % 4) + 4) % 4];
    for (const p of s.points) {
      const center = nx(p.x + ((si - (nS - 1) / 2) * 0.76) / nS);
      const top = ny(p.y);
      for (let r = top; r < grid.length; r++) {
        grid[r][center] = ch;
        if (center + 1 < grid[0].length && nS <= 3) grid[r][center + 1] = ch;
      }
    }
  });
}

function renderHeatmapText(fig: Figure, panel: Panel): string[] {
  const m = panel.matrix;
  if (!m) return [];
  const lo = Math.min(...m.values);
  const hi = Math.max(...m.values);
  const cellW = Math.max(1, Math.min(3, Math.floor((PLOT_W - 2) / m.cols)));
  const lines: string[] = [];
  lines.push(" ".repeat(PLOT_LEFT) + axisTitle(panel.y).slice(0, PLOT_W));
  for (let r = m.rows - 1; r >= 0; r--) {
    let row = "";
    for (let c = 0; c < m.cols; c++) {
      const v = m.values[r * m.cols + c];
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      row += SHADES[Math.min(3, Math.floor(t * 4))].repeat(cellW);
    }
    const label = m.rowLabels[r] ?? "";
    lines.push(label.padStart(PLOT_LEFT - 1) + "│" + row.slice(0, PLOT_W));
  }
  lines.push(" ".repeat(PLOT_LEFT - 1) + "└" + "─".repeat(Math.min(m.cols * cellW, PLOT_W)));
  const colRow = m.colLabels.map((l) => l.padEnd(cellW).slice(0, cellW)).join("");
  lines.push(" ".repeat(PLOT_LEFT) + colRow.slice(0, PLOT_W));
  lines.push(" ".repeat(PLOT_LEFT) + axisTitle(panel.x).slice(0, PLOT_W));
  const cb = m.colorbar;
  const unit = cb.unit ? ` (${cb.unit})` : "";
  lines.push("");
  lines.push(...wrap(`${SHADES[0]} low  ${SHADES[3]} high: ${cb.label}${unit}`));
  return lines;
}

/** Radar in 72 columns: one line per spoke, ours against the best rival. */
function renderRadarText(panel: Panel): string[] {
  const lines: string[] = [];
  const ours = panel.series.find((s) => s.role === "ours");
  const rivals = panel.series.filter((s) => s.role !== "ours");
  lines.push("Capability".padEnd(20) + "ours".padEnd(16) + "best of the rest");
  const spokes = panel.x.tickLabels ?? [];
  for (let s = 0; s < spokes.length; s++) {
    const ov = ours?.points[s]?.y ?? 0;
    const bv = Math.max(...rivals.map((r) => r.points[s]?.y ?? 0), 0);
    const bar = (v: number): string => "█".repeat(Math.max(1, Math.round(v * 9)));
    lines.push(
      spokes[s].slice(0, 19).padEnd(20) +
      `${bar(ov)} ${ov.toFixed(2)}`.padEnd(16) +
      `${bar(bv)} ${bv.toFixed(2)}`,
    );
  }
  lines.push("");
  lines.push(...wrap("(normalized to ours = 1.0)"));
  if (panel.legend.entries.length > 0) {
    lines.push(...wrap(panel.legend.entries
      .map((e) => {
        const s = panel.series.find((x) => x.id === e.seriesId);
        return `${s ? markFor(panel, s) : MARKERS[e.color % MARKERS.length]} ${e.label}`;
      })
      .join("   ")));
  }
  return lines.map((l) => l.slice(0, WIDTH));
}

/** Violins in 72 columns: an ascii box plot per method on a shared scale. */
function renderViolinText(panel: Panel): string[] {
  const lines: string[] = [];
  const [y0, y1] = panel.y.range;
  const span = Math.max(y1 - y0, 1e-9);
  const scaleW = 44;
  const col = (v: number): number =>
    Math.max(0, Math.min(scaleW - 1, Math.round(((v - y0) / span) * (scaleW - 1))));
  lines.push(" ".repeat(22) + axisTitle(panel.y).slice(0, scaleW + 6));
  panel.series.forEach((s, i) => {
    const row = Array(scaleW).fill(" ");
    const lo = Math.min(...s.points.map((p) => p.y));
    const hi = Math.max(...s.points.map((p) => p.y));
    for (let c = col(lo); c <= col(hi); c++) row[c] = "─";
    row[col(lo)] = "├";
    row[col(hi)] = "┤";
    if (s.stats) {
      for (let c = col(s.stats.q1); c <= col(s.stats.q3); c++) row[c] = "▓";
      row[col(s.stats.median)] = "█";
    }
    const label = (panel.x.tickLabels?.[i] ?? s.label).slice(0, 20);
    lines.push(label.padEnd(21) + row.join(""));
  });
  lines.push(" ".repeat(21) + `${fmtTick(y0, false)}`.padEnd(scaleW - 6) + `${fmtTick(y1, false)}`);
  return lines.map((l) => l.slice(0, WIDTH));
}

function shadeRegion(grid: string[][], poly: { c: number; r: number }[]): void {
  // Even-odd fill on the character grid, sparse so text stays legible.
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if ((r + c) % 2 !== 0) continue;
      if (inside(poly, c, r) && grid[r][c] === " ") grid[r][c] = "░";
    }
  }
}

function inside(poly: { c: number; r: number }[], c: number, r: number): boolean {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.r > r !== b.r > r && c < ((b.c - a.c) * (r - a.r)) / (b.r - a.r) + a.c) odd = !odd;
  }
  return odd;
}

function stamp(grid: string[][], r: number, c: number, s: string): void {
  if (r < 0 || r >= grid.length) return;
  for (let i = 0; i < s.length; i++) {
    const cc = c + i;
    if (cc >= 0 && cc < grid[0].length) grid[r][cc] = s[i];
  }
}

function footnotes(fig: Figure): string {
  const notes: string[] = [];
  for (const panel of fig.panels) {
    for (const a of panel.annotations) {
      if (a.type === "text") notes.push(`[${a.text}]`);
      if (a.type === "arrow" && a.text) notes.push(`[${a.text} →]`);
      if (a.type === "watermark") notes.push(`[${a.text}]`);
    }
    if (panel.y2) notes.push("[secondary axis omitted at this resolution]");
  }
  if (fig.artifacts.includes("error-bars")) notes.push("[error bars omitted at this resolution]");
  const unique = [...new Set(notes)];
  return unique.length > 0 ? wrap(unique.join(" ")).join("\n") : "";
}

function pickThree(ticks: number[]): number[] {
  if (ticks.length <= 3) return ticks;
  return [ticks[0], ticks[Math.floor(ticks.length / 2)], ticks[ticks.length - 1]];
}

function fmtTick(v: number, log: boolean): string {
  if (log) {
    const e = Math.round(Math.log10(v));
    return `1e${e}`;
  }
  if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) return v.toExponential(0).replace("+", "");
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function axisTitle(axis: Panel["x"]): string {
  return axis.unit ? `${axis.label} (${axis.unit})` : axis.label;
}

export function plainCaption(runs: Run[]): string {
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

function wrap(s: string): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length > 0 && line.length + 1 + w.length > WIDTH) {
      lines.push(line);
      line = w;
    } else {
      line += (line.length > 0 ? " " : "") + w;
    }
  }
  if (line) lines.push(line);
  return lines;
}
