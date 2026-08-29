/**
 * ROC curves: ours hugs the corner, the diagonal marks chance, and every
 * legend entry quotes an AUC to three decimals that nobody computed. The
 * curve family y = x^(1/k) gives AUC = k/(k+1) in closed form.
 */
import type { Annotation, Axis, Panel, Series } from "../types.js";
import { lerp } from "../rng.js";
import { enforceGag, niceTicks } from "../shapes.js";
import { pickAxisWord } from "../vocabulary.js";
import {
  ROC_X_GOBBLE, ROC_X_PLAIN, ROC_Y_GOBBLE, ROC_Y_PLAIN,
} from "../vocabulary.js";
import {
  type PanelCtx, baselineStats, buildLegend, jitter, mark, oursDelta,
  planSeries, pointCount, seriesCount,
} from "./common.js";

export function buildRoc(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const xWord = pickAxisWord(af, ROC_X_PLAIN, ROC_X_GOBBLE, "lower", g);
  const yWord = pickAxisWord(af, ROC_Y_PLAIN, ROC_Y_GOBBLE, "higher", g);

  const n = ctx.shared ? ctx.shared.length : seriesCount(ctx);
  const nPts = pointCount(ctx);
  const plans = planSeries(ctx, n);

  // Curve steepness per method; ours derives from a target AUC.
  const ks: number[] = [];
  for (let i = 0; i < plans.length; i++) {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    ks.push(lerp(1.5, 5, pf.next()));
  }
  const aucOf = (k: number): number => k / (k + 1);
  if (plans.length > 1) {
    const aucs = ks.slice(1).map(aucOf);
    const { best, spread } = baselineStats(aucs, "higher");
    const delta = oursDelta(ctx, best, spread, "higher");
    let target = enforceGag(best + delta, best, ctx.dials.confidence, "higher", false);
    target = Math.min(Math.max(target, 0.52), 0.995);
    ks[0] = target / (1 - target);
  }

  // A fixed FPR grid, denser near the corner where the action is.
  const xs: number[] = [];
  for (let i = 0; i < nPts; i++) xs.push(Math.pow(i / (nPts - 1), 1.6));

  const series: Series[] = plans.map((plan, i) => {
    const ef = ctx.root.fork(`errors:${ctx.p}:${i}:noise`);
    const points = xs.map((x) => {
      let y = Math.pow(x, 1 / ks[i]) * jitter(ef, 0.006);
      y = Math.min(Math.max(y, x * 0.98), 1);
      return { x, y };
    });
    return {
      id: `s${ctx.p}-${i}`,
      label: plan.label,
      role: plan.role,
      draw: "line" as const,
      points,
      marker: "none" as const,
      dash: plan.dash,
      color: plan.color,
      bold: plan.bold,
    };
  });

  const xt = niceTicks(0, 1);
  const x: Axis = {
    label: xWord.label, scale: "linear", range: [0, 1], ticks: xt.ticks, betterIs: "lower",
  };
  const y: Axis = {
    label: yWord.label, scale: "linear", range: [0, 1], ticks: xt.ticks, betterIs: "higher",
  };

  const annotations: Annotation[] = [];
  series.push({
    id: `s${ctx.p}-chance`,
    label: "",
    role: "reference",
    draw: "line",
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    marker: "none",
    dash: "dashed",
    color: 3,
    bold: false,
  });
  annotations.push({
    type: "text",
    at: { x: 0.58, y: 0.53 },
    text: "random",
  });
  mark(ctx, "random-diagonal");

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeIdx = sf.int(nPts);
  const orphanAucU = sf.next();
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const pt = series[0].points[Math.min(seeIdx, nPts - 1)];
    annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }

  const legend = buildLegend(ctx, series);
  // Every entry gets its three decimals; the orphan's is drawn from air.
  for (const e of legend.entries) {
    const idx = series.findIndex((s) => s.id === e.seriesId);
    const auc = idx >= 0 ? aucOf(ks[idx]) : lerp(0.9, 0.989, orphanAucU);
    e.label = `${e.label} (AUC = ${auc.toFixed(3)})`;
  }
  if (legend.entries.length > 0) mark(ctx, "auc-in-legend");

  return { kind: "roc", x, y, series, regions: [], annotations, legend };
}
