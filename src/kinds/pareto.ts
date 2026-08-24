/**
 * Trade-off frontier: quality up, cost right, a shaded region labeled
 * infeasible above the frontier, a dashed theoretical limit, and ours
 * sitting exactly on the curve it was drawn from.
 */
import type { Annotation, Panel, Point, Region, Series } from "../types.js";
import { lerp } from "../rng.js";
import { frontier, logTicks } from "../shapes.js";
import { pickPool } from "../dials.js";
import {
  REGIONS_GOBBLE, REGIONS_PLAIN, Y_GOBBLE, Y_PLAIN, type AxisWord, pickAxisWord, pickUnit,
} from "../vocabulary.js";
import {
  type PanelCtx, applyLogNote, buildAxis, buildLegend, mark, planSeries, seriesCount,
} from "./common.js";

const FALLBACK_X: AxisWord = { label: "Runtime", unit: "s", betterIs: "lower", logOk: true };

export function buildPareto(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  // Cost right, quality up: both axes come from the metric pools.
  let xWord = pickAxisWord(af, Y_PLAIN, Y_GOBBLE, "lower", g);
  const yWord = pickAxisWord(af, Y_PLAIN, Y_GOBBLE, "higher", g);
  const xUnit = pickUnit(af, xWord, g);
  // Quality stays a fraction whatever the label says, so gobbledygook can
  // swap words without moving a point; a percent unit would contradict it.
  const rawUnit = pickUnit(af, yWord, g);
  const yUnit = rawUnit === "%" ? undefined : rawUnit;
  if (xWord.label === yWord.label) xWord = FALLBACK_X;
  const xLog = ctx.fired.has("log-axis") && xWord.logOk === true;

  const xrRaw: [number, number] = [0.5, 50];
  const xr: [number, number] = xLog
    ? (() => { const t = logTicks(xrRaw[0], xrRaw[1]); return [t.lo, t.hi] as [number, number]; })()
    : xrRaw;

  const ff = ctx.root.fork(`series:${ctx.p}:frontier`);
  const f = frontier(ff);

  const n = ctx.shared ? ctx.shared.length : seriesCount(ctx);
  const plans = planSeries(ctx, n);

  // Method positions along the frontier; baselines hang below it by a
  // fixed dominance gap, ours sits exactly on it.
  const pf = ctx.root.fork(`series:${ctx.p}:positions`);
  const tOurs = lerp(0.45, 0.8, pf.next());
  const points: Point[][] = plans.map((_, i) => {
    const u = pf.next();
    const gap = 0.05 + 0.1 * pf.next();
    const t = i === 0 ? tOurs : lerp(0.08, 0.95, u);
    const q = i === 0 ? f(t) : Math.max(f(t) - gap, 0.12);
    return [{ x: tOnX(t, xr, xLog), y: q }];
  });

  // No error bars and no confidence coupling here, so a plain data range does.
  const ys = points.flatMap((pts) => pts.map((p) => p.y));
  const dataLo = Math.min(...ys) * 0.85;
  const dataHi = Math.max(...ys, f(1)) * 1.12;

  const series: Series[] = plans.map((plan, i) => ({
    id: `s${ctx.p}-${i}`,
    label: plan.label,
    role: plan.role,
    draw: "scatter",
    points: points[i],
    marker: plan.marker,
    dash: "solid",
    color: plan.color,
    bold: plan.bold,
  }));

  const x = buildAxis(xWord, xUnit, "lower", xLog, xr[0], xr[1]);
  const y = buildAxis(yWord, yUnit, "higher", false, dataLo, dataHi);
  applyLogNote(ctx, x);

  const regions: Region[] = [];
  const annotations: Annotation[] = [];
  const rf = ctx.root.fork(`regions:${ctx.p}`);
  const regionLabel = pickPool(rf, REGIONS_PLAIN, REGIONS_GOBBLE, g);
  const limitU = rf.next();

  // The infeasible polygon traces the frontier and closes along the top.
  const steps = 24;
  const poly: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    poly.push({ x: tOnX(t, xr, xLog), y: clamp(f(t), y.range) });
  }
  poly.push({ x: xr[1], y: y.range[1] });
  poly.push({ x: xr[0], y: y.range[1] });
  regions.push({
    polygon: poly,
    fill: ctx.mono ? "hatch" : "shade",
    label: regionLabel,
  });
  mark(ctx, "infeasible-region");

  if (ctx.fired.has("theoretical-limit") && ctx.p === 0) {
    const fMax = f(1);
    const at = Math.min(y.range[1] * 0.985, fMax * lerp(1.03, 1.08, limitU));
    annotations.push({ type: "hline", at, text: "theoretical limit", dash: "dashed" });
    mark(ctx, "theoretical-limit");
  }

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeIdx = sf.int(Math.max(1, series.length));
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const s = series[Math.min(seeIdx, series.length - 1)];
    const pt = s.points[0];
    annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }

  return {
    kind: "pareto",
    x, y,
    series,
    regions,
    annotations,
    legend: buildLegend(ctx, series),
  };
}

function tOnX(t: number, range: [number, number], log: boolean): number {
  if (log) {
    const la = Math.log10(range[0]);
    const lb = Math.log10(range[1]);
    return Math.pow(10, la + (lb - la) * t);
  }
  return range[0] + (range[1] - range[0]) * t;
}

function clamp(v: number, range: [number, number]): number {
  return Math.min(Math.max(v, range[0]), range[1]);
}
