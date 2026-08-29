/**
 * Curves against x: convergence, scaling, training. Log axes, error bands,
 * a bold "(ours)" whose lead is set by the confidence dial, and room for
 * the inset, secondary axis, gap arrow, and infeasible band gags.
 */
import type { Annotation, Axis, Panel, Region, Series } from "../types.js";
import { lerp } from "../rng.js";
import { decay, enforceGag, power, saturate, tGrid, tToX, walk } from "../shapes.js";
import { pickPool } from "../dials.js";
import { REGIONS_GOBBLE, REGIONS_PLAIN, pickAxisWord, pickUnit, Y_GOBBLE, Y_PLAIN } from "../vocabulary.js";
import {
  type AxisWords, type PanelCtx, applyLogNote, attachErrors, baselineStats, buildAxis,
  buildLegend, chooseAxisWords, envelope, jitter, mark, oursDelta, planSeries, pointCount,
  ramp, seriesCount, xRange,
} from "./common.js";

export function buildLine(ctx: PanelCtx): Panel {
  const words: AxisWords = ctx.sharedWords ?? chooseAxisWords(ctx);
  const n = ctx.shared ? ctx.shared.length : seriesCount(ctx);
  const nPts = pointCount(ctx);
  const plans = planSeries(ctx, n);
  const xr = xRange(words);
  const ts = tGrid(nPts);
  // With the extrapolation gag the data politely stops early and leaves
  // the last stretch of the axis to the dashed projection.
  const extrap = ctx.fired.has("extrapolated-region") && ctx.p === 0;
  const xs = ts.map((t) => tToX(extrap ? t * 0.72 : t, xr, words.xLog));

  // One family per panel; every method's curve comes from it. Walks stay
  // off log axes so the analytic range envelope below holds.
  const ff = ctx.root.fork(`series:${ctx.p}:family`);
  const walkCoin = ff.next();
  const family: "decay" | "power" | "saturate" | "walk" =
    words.xLog && words.yLog ? "power"
    : ctx.dials.density >= 0.6 && walkCoin < 0.35 && !words.yLog ? "walk"
    : words.yDir === "lower" ? "decay"
    : "saturate";

  // Baseline values; ours (slot 0) draws its own fallback curve first.
  const valueRows: number[][] = [];
  for (let i = 0; i < plans.length; i++) {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    const ef = ctx.root.fork(`errors:${ctx.p}:${i}:noise`);
    let vals: number[];
    if (family === "walk") {
      vals = walk(pf, nPts);
    } else {
      const curve = family === "decay" ? decay(pf) : family === "power" ? power(pf) : saturate(pf);
      vals = ts.map((t) => curve(t));
    }
    const level = 1 + 0.35 * (pf.next() - 0.5);
    vals = vals.map((v) => v * level * jitter(ef, 0.015));
    if (words.yLog) vals = vals.map((v) => Math.max(v, 1e-6));
    valueRows.push(vals);
  }

  // Ours tracks the best baseline and lands margin away at the end. On log
  // axes the target is clamped to a multiplicative band so the range
  // envelope can bound it without knowing the confidence.
  const finals = valueRows.slice(1).map((row) => row[nPts - 1]);
  if (finals.length > 0) {
    const { best, spread } = baselineStats(finals, words.yDir);
    const bestIdx = 1 + finals.indexOf(best);
    const bestRow = valueRows[bestIdx];
    const delta0 = oursDelta(ctx, best, spread, words.yDir);
    let target = enforceGag(best + delta0, best, ctx.dials.confidence, words.yDir, words.yLog);
    const of = ctx.root.fork(`errors:${ctx.p}:0:ours`);
    if (words.yLog) {
      // Multiplicative ramp on log axes: the curve scales toward the
      // target factor and can never dip below a fixed fraction of the
      // track it follows, whatever the family's shape.
      target = Math.min(Math.max(target, best * 0.3), best * 2.5);
      const factor = target / best;
      valueRows[0] = bestRow.map((v, k) => v * Math.pow(factor, ramp(ts[k])) * jitter(of, 0.012));
    } else {
      const delta = target - best;
      valueRows[0] = bestRow.map((v, k) => (v + ramp(ts[k]) * delta) * jitter(of, 0.012));
    }
  }

  // The y envelope covers every value ours can reach at any confidence:
  // the best baseline's row shifted by the full margin range, never the
  // actual ours values, so sweeping confidence cannot move the ticks.
  const envValues: number[] = [];
  for (let i = 1; i < valueRows.length; i++) envValues.push(...valueRows[i]);
  if (finals.length > 0) {
    const { best, spread } = baselineStats(finals, words.yDir);
    const bestIdx = 1 + finals.indexOf(best);
    const row = valueRows[bestIdx];
    if (words.yLog) {
      envValues.push(Math.min(...row) * 0.28, Math.max(...row) * 2.6);
    } else {
      envValues.push(Math.min(...row) - spread * 0.85, Math.max(...row) + spread * 0.85);
    }
  } else {
    envValues.push(...valueRows[0]);
  }
  const [envLo, envHi] = envelope(envValues, words.yLog);

  // Ids carry the panel index, not the shared plan's: shared plans are
  // built once for panel 0 and reused, but identity stays per panel.
  const series: Series[] = plans.map((plan, i) => ({
    id: `s${ctx.p}-${i}`,
    label: plan.label,
    role: plan.role,
    draw: "line",
    points: xs.map((x, k) => ({ x, y: valueRows[i][k] })),
    marker: plan.marker,
    dash: plan.dash,
    color: plan.color,
    bold: plan.bold,
  }));

  const x = buildAxis(words.x, words.xUnit, words.xDir, words.xLog, xr[0], xr[1]);
  const y = buildAxis(words.y, words.yUnit, words.yDir, words.yLog, envLo, envHi);
  applyLogNote(ctx, y);
  if (!(ctx.fired.has("log-scale-note") && y.scale === "log")) applyLogNote(ctx, x);

  // Secondary axis: the last baseline moves to its own scale on the right.
  let y2: Axis | undefined;
  const af2 = ctx.root.fork(`axes:${ctx.p}:y2`);
  const y2dir: "higher" | "lower" = af2.chance(0.5) ? "higher" : "lower";
  const y2word = pickAxisWord(af2, Y_PLAIN, Y_GOBBLE, y2dir, ctx.dials.gobbledygook);
  const y2unit = pickUnit(af2, y2word, ctx.dials.gobbledygook);
  if (ctx.fired.has("secondary-axis") && ctx.p === 0 && series.length >= 3) {
    const moved = series[series.length - 1];
    moved.y2 = true;
    const vals = moved.points.map((p) => p.y);
    y2 = buildAxis(y2word, y2unit, y2dir, false, Math.min(...vals), Math.max(...vals));
    mark(ctx, "secondary-axis");
  }

  attachErrors(ctx, series.filter((s) => !s.y2), words.yLog);

  const regions: Region[] = [];
  const annotations: Annotation[] = [];
  const rf = ctx.root.fork(`regions:${ctx.p}`);
  const regionLabel = pickPool(rf, REGIONS_PLAIN, REGIONS_GOBBLE, ctx.dials.gobbledygook);
  const limitCoin = rf.next();
  const primary = series.filter((s) => !s.y2);
  const allY = primary.flatMap((s) => s.points.map((p) => p.y));
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const limit = words.yDir === "lower"
    ? (words.yLog ? Math.max(y.range[0] * 1.4, yMin * lerp(0.4, 0.7, limitCoin)) : y.range[0] + (yMin - y.range[0]) * lerp(0.3, 0.7, limitCoin))
    : y.range[1] - (y.range[1] - yMax) * lerp(0.3, 0.7, limitCoin);

  if (ctx.fired.has("theoretical-limit") && ctx.p === 0) {
    annotations.push({ type: "hline", at: limit, text: "theoretical limit", dash: "dashed" });
    mark(ctx, "theoretical-limit");
  }
  if (ctx.fired.has("infeasible-region") && ctx.p === 0) {
    const [rLo, rHi] = y.range;
    const yEdge = words.yDir === "lower" ? rLo : rHi;
    regions.push({
      polygon: [
        { x: x.range[0], y: limit }, { x: x.range[1], y: limit },
        { x: x.range[1], y: yEdge }, { x: x.range[0], y: yEdge },
      ],
      fill: ctx.mono ? "hatch" : "shade",
      label: regionLabel,
    });
    mark(ctx, "infeasible-region");
  }

  // Gap arrow from the runner-up to ours at the final x.
  if (ctx.fired.has("gap-arrow") && ctx.p === 0 && finals.length > 0) {
    const { best } = baselineStats(finals, words.yDir);
    const xEnd = xs[nPts - 1];
    annotations.push({
      type: "arrow",
      from: { x: xEnd, y: best },
      to: { x: xEnd, y: valueRows[0][nPts - 1] },
      text: "gap",
    });
    mark(ctx, "gap-arrow");
  }

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeIdx = sf.int(nPts);
  const seeSeries = sf.int(Math.max(1, series.length));
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const s = series[Math.min(seeSeries, series.length - 1)];
    const pt = s.points[Math.min(seeIdx, s.points.length - 1)];
    annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }

  const insetCorner = sf.chance(0.5) ? "ne" : "sw";
  if (ctx.fired.has("inset-zoom") && ctx.p === 0) {
    const x0 = xs[Math.floor(nPts * 0.7)];
    const x1 = xs[nPts - 1];
    const windowY = primary.flatMap((s) => s.points.slice(Math.floor(nPts * 0.7)).map((p) => p.y));
    annotations.push({
      type: "inset",
      window: [
        { x: x0, y: Math.min(...windowY) },
        { x: x1, y: Math.max(...windowY) },
      ],
      corner: insetCorner,
    });
    mark(ctx, "inset-zoom");
  }

  if (ctx.fired.has("zero-suppressed")) {
    y.zeroSuppressed = true;
    mark(ctx, "zero-suppressed");
  }

  // The projection: ours continues, dashed and log-linearly straight,
  // from its last two points to the edge of the axis, where a star and a
  // box assure the reader it is merely projected.
  if (extrap && nPts >= 2) {
    const ours = series[0];
    const a = ours.points[nPts - 2];
    const b = ours.points[nPts - 1];
    const tv = (v: number): number => (words.yLog ? Math.log10(Math.max(v, 1e-12)) : v);
    const fv = (v: number): number => (words.yLog ? Math.pow(10, v) : v);
    const tx = (v: number): number => (words.xLog ? Math.log10(v) : v);
    const slope = (tv(b.y) - tv(a.y)) / Math.max(tx(b.x) - tx(a.x), 1e-12);
    const steps = 6;
    const projPoints = Array.from({ length: steps }, (_, k) => {
      const t = 0.72 + ((k + 1) / steps) * 0.28;
      const px = tToX(t, xr, words.xLog);
      const raw = fv(tv(b.y) + slope * (tx(px) - tx(b.x)));
      const yv = Math.min(Math.max(raw, y.range[0]), y.range[1]);
      return { x: px, y: yv };
    });
    series.push({
      id: `s${ctx.p}-projection`,
      label: "",
      role: "reference",
      draw: "line",
      points: [b, ...projPoints],
      marker: "none",
      dash: "dashed",
      color: ours.color,
      bold: false,
    });
    const end = projPoints[projPoints.length - 1];
    annotations.push({ type: "stars", at: end, count: 1 });
    annotations.push({ type: "text", at: end, text: "projected", boxed: true });
    mark(ctx, "extrapolated-region");
  }

  return {
    kind: "line",
    x, y, y2,
    series,
    regions,
    annotations,
    legend: buildLegend(ctx, series),
  };
}
