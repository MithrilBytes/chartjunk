/**
 * Performance profiles after Dolan and More, "Benchmarking optimization
 * software with performance profiles", Math. Program. 91 (2002): the
 * fraction of problems solved within a budget ratio, as staircases. Ours
 * solves everything, eventually, from above.
 */
import type { Axis, Panel, Series } from "../types.js";
import { lerp } from "../rng.js";
import { enforceGag, logTicks, niceTicks } from "../shapes.js";
import {
  PROFILE_X_GOBBLE, PROFILE_X_PLAIN, PROFILE_Y_GOBBLE, PROFILE_Y_PLAIN, pickAxisPair, pickUnit,
} from "../vocabulary.js";
import {
  type PanelCtx, applyLogNote, baselineStats, buildLegend, jitter, mark, oursDelta,
  planSeries, pointCount, seriesCount,
} from "./common.js";

export function buildProfile(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const xPair = pickAxisPair(af, PROFILE_X_PLAIN, PROFILE_X_GOBBLE, "lower", g);
  const yPair = pickAxisPair(af, PROFILE_Y_PLAIN, PROFILE_Y_GOBBLE, "higher", g);
  const xUnit = pickUnit(af, xPair.word, g);
  const xLog = ctx.fired.has("log-axis") && xPair.base.logOk === true;
  const hint = xPair.base.range ?? [1, 16];

  const n = ctx.shared ? ctx.shared.length : seriesCount(ctx);
  const nPts = pointCount(ctx);
  const plans = planSeries(ctx, n);

  // A shared budget grid; confidence may move heights, never positions.
  const xt = xLog ? logTicks(hint[0], hint[1], false) : niceTicks(hint[0], hint[1]);
  const [x0, x1] = [xt.lo, xt.hi];
  const xs: number[] = [];
  for (let i = 0; i < nPts; i++) {
    const t = Math.pow(i / (nPts - 1), 1.3);
    xs.push(xLog
      ? Math.pow(10, Math.log10(x0) + t * (Math.log10(x1) - Math.log10(x0)))
      : x0 + t * (x1 - x0));
  }

  // Start fraction, plateau, and rate per method.
  const starts: number[] = [];
  const plateaus: number[] = [];
  const rates: number[] = [];
  for (let i = 0; i < plans.length; i++) {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    starts.push(lerp(0.05, 0.35, pf.next()));
    plateaus.push(lerp(0.55, 0.9, pf.next()));
    rates.push(lerp(0.4, 2.2, pf.next()));
  }
  if (plans.length > 1) {
    const { best, spread } = baselineStats(plateaus.slice(1), "higher");
    const delta = oursDelta(ctx, best, spread, "higher");
    let target = enforceGag(best + delta, best, ctx.dials.confidence, "higher", false);
    target = Math.min(Math.max(target, 0.3), 1.0);
    plateaus[0] = target;
    starts[0] = Math.min(Math.max(starts[0], target * 0.25), target);
  }

  const series: Series[] = plans.map((plan, i) => {
    const ef = ctx.root.fork(`errors:${ctx.p}:${i}:noise`);
    const points = xs.map((x) => {
      const t = xLog
        ? (Math.log10(x) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))
        : (x - x0) / (x1 - x0);
      let y = starts[i] + (plateaus[i] - starts[i]) * (1 - Math.exp(-3.2 * rates[i] * t));
      y = Math.min(Math.max(y * jitter(ef, 0.006), 0), 1);
      return { x, y };
    });
    return {
      id: `s${ctx.p}-${i}`,
      label: plan.label,
      role: plan.role,
      draw: "step" as const,
      points,
      marker: "none" as const,
      dash: plan.dash,
      color: plan.color,
      bold: plan.bold,
    };
  });

  const x: Axis = {
    label: xPair.word.label,
    unit: xUnit,
    scale: xLog ? "log" : "linear",
    range: [x0, x1],
    ticks: xt.ticks,
    minorTicks: xLog ? (xt as { minor?: number[] }).minor : undefined,
    betterIs: "lower",
  };
  const yTicks = niceTicks(0, 1);
  const y: Axis = {
    label: yPair.word.label,
    scale: "linear",
    range: [0, 1.05],
    ticks: yTicks.ticks.filter((t) => t <= 1.05),
    betterIs: "higher",
  };
  applyLogNote(ctx, x);

  const panel: Panel = {
    kind: "profile",
    x, y, series,
    regions: [],
    annotations: [],
    legend: buildLegend(ctx, series),
  };

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeIdx = sf.int(nPts);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const pt = series[0].points[Math.min(seeIdx, nPts - 1)];
    panel.annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }
  return panel;
}
