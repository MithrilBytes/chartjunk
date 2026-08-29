/**
 * Point clouds with a trend line: the R² annotation, an "outlier
 * (excluded)" that is very much still plotted, and a marginal rug at
 * higher densities.
 */
import type { Annotation, Panel, Point, Series } from "../types.js";
import { lerp } from "../rng.js";
import { enforceGag } from "../shapes.js";
import {
  type AxisWords, type PanelCtx, applyLogNote, baselineStats, buildAxis, buildLegend,
  chooseAxisWords, envelope, mark, oursDelta, planSeries, pointCount, seriesCount, xRange,
} from "./common.js";

export function buildScatter(ctx: PanelCtx): Panel {
  const words: AxisWords = ctx.sharedWords ?? chooseAxisWords(ctx);
  const n = Math.min(3, ctx.shared ? ctx.shared.length : seriesCount(ctx));
  const nPts = pointCount(ctx);
  const plans = planSeries(ctx, n);
  const xr = xRange(words);

  // Cloud levels; ours (slot 0) gets its own fallback, then tracks best.
  const levels: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < plans.length; i++) {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    levels.push(lerp(0.4, 1.1, pf.next()));
    slopes.push(lerp(-0.5, 0.9, pf.next()));
  }
  if (plans.length > 1) {
    const others = levels.slice(1);
    const { best, spread } = baselineStats(others, words.yDir);
    const delta = oursDelta(ctx, best, spread, words.yDir);
    let target = enforceGag(best + delta, best, ctx.dials.confidence, words.yDir, words.yLog);
    if (words.yLog) target = Math.min(Math.max(target, best * 0.3), best * 2.5);
    levels[0] = target;
    slopes[0] = slopes[1 + others.indexOf(best)];
  }

  const clouds: Point[][] = plans.map((_, i) => {
    const cf = ctx.root.fork(`series:${ctx.p}:${i}:cloud`);
    const pts: Point[] = [];
    for (let k = 0; k < nPts; k++) {
      const u = cf.next();
      const noise = cf.next() * 2 - 1;
      const x = words.xLog
        ? Math.pow(10, lerp(Math.log10(xr[0]), Math.log10(xr[1]), u))
        : lerp(xr[0], xr[1], u);
      let y = levels[i] * (1 + slopes[i] * (u - 0.5)) * (1 + 0.08 * noise);
      if (words.yLog) y = Math.max(y, 1e-6);
      pts.push({ x, y });
    }
    return pts;
  });

  // Confidence-independent envelope from the baseline clouds plus the full
  // band ours can occupy: level range times the worst cloud scatter factor.
  const envValues: number[] = [];
  for (let i = 1; i < clouds.length; i++) envValues.push(...clouds[i].map((p) => p.y));
  if (plans.length > 1) {
    const { best, spread } = baselineStats(levels.slice(1), words.yDir);
    if (words.yLog) {
      envValues.push(best * 0.12, best * 4.1);
    } else {
      const lo = best - spread * 0.85;
      const hi = best + spread * 0.85;
      envValues.push(lo * 1.6, lo * 0.4, hi * 1.6);
    }
  } else {
    envValues.push(...clouds[0].map((p) => p.y));
  }
  const [envLo, envHi] = envelope(envValues, words.yLog);

  const series: Series[] = plans.map((plan, i) => ({
    id: `s${ctx.p}-${i}`,
    label: plan.label,
    role: plan.role,
    draw: "scatter",
    points: clouds[i],
    marker: plan.marker,
    dash: "solid",
    color: plan.color,
    bold: plan.bold,
  }));

  const x = buildAxis(words.x, words.xUnit, words.xDir, words.xLog, xr[0], xr[1]);
  const y = buildAxis(words.y, words.yUnit, words.yDir, words.yLog, envLo, envHi);
  applyLogNote(ctx, y);
  if (!(ctx.fired.has("log-scale-note") && y.scale === "log")) applyLogNote(ctx, x);

  // Embedding cosplay: the axes get renamed, the data stays put, and the
  // caption will assert cluster separation. If a log scale was already in
  // play, the reader now faces a logarithmic t-SNE axis, as one does.
  const tf = ctx.root.fork(`axes:${ctx.p}:tsne`);
  const umap = tf.chance(0.4);
  if (ctx.fired.has("tsne-axes")) {
    const stem = umap ? "UMAP" : "t-SNE";
    x.label = words.xLog ? `${stem} 1 (log scale)` : `${stem} 1`;
    y.label = words.yLog ? `${stem} 2 (log scale)` : `${stem} 2`;
    x.unit = undefined;
    y.unit = undefined;
    mark(ctx, "tsne-axes");
  }

  // Trend line through the ours cloud, least squares in screen space.
  const fitPts = clouds[0].map((p) => ({
    u: words.xLog ? Math.log10(p.x) : p.x,
    v: words.yLog ? Math.log10(p.y) : p.y,
  }));
  const mu = fitPts.reduce((s, p) => s + p.u, 0) / fitPts.length;
  const mv = fitPts.reduce((s, p) => s + p.v, 0) / fitPts.length;
  let num = 0;
  let den = 0;
  for (const p of fitPts) {
    num += (p.u - mu) * (p.v - mv);
    den += (p.u - mu) * (p.u - mu);
  }
  const slope = den > 1e-12 ? num / den : 0;
  const xsSorted = clouds[0].map((p) => p.x).sort((a, b) => a - b);
  const trendXs = [xsSorted[0], xsSorted[xsSorted.length - 1]];
  const trendPts: Point[] = trendXs.map((tx) => {
    const u = words.xLog ? Math.log10(tx) : tx;
    const v = mv + slope * (u - mu);
    const ty = words.yLog ? Math.pow(10, v) : v;
    return { x: tx, y: clampInto(ty, y.range) };
  });
  series.push({
    id: `s${ctx.p}-trend`,
    label: "",
    role: "reference",
    draw: "line",
    points: trendPts,
    marker: "none",
    dash: "dashed",
    color: plans[0].color,
    bold: false,
  });

  const annotations: Annotation[] = [];
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const r2corner = sf.chance(0.5);
  const outlierU = sf.next();
  if (ctx.fired.has("r-squared") && ctx.p === 0) {
    const r2 = lerp(0.3, 0.999, ctx.dials.confidence);
    const span = y.range[1] - y.range[0];
    annotations.push({
      type: "text",
      at: {
        x: posAlong(x.range, r2corner ? 0.14 : 0.86, words.xLog),
        y: y.range[1] - span * 0.07,
      },
      text: `R² = ${r2.toFixed(3)}`,
    });
    mark(ctx, "r-squared");
  }

  if (ctx.fired.has("excluded-outlier") && ctx.p === 0) {
    const ox = posAlong(x.range, 0.25 + outlierU * 0.5, words.xLog);
    const oy = words.yLog
      ? Math.pow(10, Math.log10(y.range[0]) + (Math.log10(y.range[1]) - Math.log10(y.range[0])) * 0.93)
      : y.range[0] + (y.range[1] - y.range[0]) * 0.93;
    series.push({
      id: `s${ctx.p}-outlier`,
      label: "",
      role: "reference",
      draw: "scatter",
      points: [{ x: ox, y: oy }],
      marker: "circle",
      dash: "solid",
      color: plans[0].color,
      bold: false,
    });
    annotations.push({ type: "text", at: { x: ox, y: oy }, text: "outlier (excluded)", boxed: true });
    mark(ctx, "excluded-outlier");
  }

  if (ctx.fired.has("marginal-rug")) {
    mark(ctx, "marginal-rug");
  }
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const pt = clouds[0][Math.min(Math.floor(outlierU * nPts), nPts - 1)];
    annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }

  return {
    kind: "scatter",
    x, y,
    series,
    regions: [],
    annotations,
    legend: buildLegend(ctx, series),
  };
}

function clampInto(v: number, range: [number, number]): number {
  return Math.min(Math.max(v, range[0]), range[1]);
}

function posAlong(range: [number, number], t: number, log: boolean): number {
  if (log) {
    const la = Math.log10(range[0]);
    const lb = Math.log10(range[1]);
    return Math.pow(10, la + (lb - la) * t);
  }
  return range[0] + (range[1] - range[0]) * t;
}
