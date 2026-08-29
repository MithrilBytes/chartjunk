/**
 * Overlaid histograms of a metric, ours shifted the flattering way, each
 * topped by a kernel density estimated from a number of samples the
 * caption admits only in passing.
 */
import type { Axis, Panel, Series } from "../types.js";
import { lerp } from "../rng.js";
import { enforceGag, niceTicks } from "../shapes.js";
import { Y_GOBBLE, Y_PLAIN, pickAxisPair, pickUnit } from "../vocabulary.js";
import {
  type PanelCtx, buildLegend, jitter, mark, oursDelta, planSeries,
} from "./common.js";

export function buildHistogram(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  // The metric lives on the x axis here.
  const xDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const xPair = pickAxisPair(af, Y_PLAIN, Y_GOBBLE, xDir, g);
  const rawUnit = pickUnit(af, xPair.word, g);
  const xUnit = rawUnit === "%" ? undefined : rawUnit;

  const lf = ctx.root.fork(`layout:${ctx.p}:bins`);
  const bins = Math.min(18, 8 + Math.floor(ctx.dials.density * 8 + lf.next() * 0.999));
  const nDists = ctx.dials.density >= 0.7 ? 3 : 2;
  const plans = planSeries(ctx, Math.max(2, Math.min(nDists, ctx.shared ? ctx.shared.length : nDists)));

  // Gaussian parameters; ours' mean shifts toward the better end.
  const mus: number[] = [];
  const sigmas: number[] = [];
  for (let i = 0; i < plans.length; i++) {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    mus.push(lerp(0.55, 0.95, pf.next()));
    sigmas.push(lerp(0.08, 0.16, pf.next()));
  }
  if (plans.length > 1) {
    const best = mus[1];
    const spread = Math.max(sigmas[1] * 2, Math.abs(best) * 0.12);
    const delta = oursDelta(ctx, best, spread, xDir);
    mus[0] = enforceGag(best + delta, best, ctx.dials.confidence, xDir, true);
  }

  // A fixed bin grid wide enough for any confidence.
  const gridLo = Math.min(...mus.slice(1), mus[1] ?? mus[0]) - 0.55;
  const gridHi = Math.max(...mus.slice(1), mus[1] ?? mus[0]) + 0.55;
  const xt = niceTicks(Math.max(gridLo, 0.02), gridHi);
  const binW = (xt.hi - xt.lo) / bins;
  const centers = Array.from({ length: bins }, (_, b) => xt.lo + (b + 0.5) * binW);

  const N = 40;
  const pdf = (x: number, mu: number, sigma: number): number =>
    Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));

  const series: Series[] = [];
  plans.forEach((plan, i) => {
    const ef = ctx.root.fork(`errors:${ctx.p}:${i}:counts`);
    const counts = centers.map((c) =>
      Math.max(0, Math.round(N * pdf(c, mus[i], sigmas[i]) * binW * jitter(ef, 0.18))));
    series.push({
      id: `s${ctx.p}-${i}`,
      label: plan.label,
      role: plan.role,
      draw: "bar",
      points: centers.map((c, b) => ({ x: c, y: counts[b] })),
      marker: "none",
      dash: "solid",
      color: plan.color,
      bold: plan.bold,
    });
  });
  // Silky KDE overlays, one per distribution.
  plans.forEach((plan, i) => {
    const ks = Array.from({ length: 48 }, (_, k) => xt.lo + ((xt.hi - xt.lo) * k) / 47);
    series.push({
      id: `s${ctx.p}-kde-${i}`,
      label: "",
      role: "reference",
      draw: "line",
      points: ks.map((x) => ({ x, y: N * pdf(x, mus[i], sigmas[i]) * binW })),
      marker: "none",
      dash: "solid",
      color: plan.color,
      bold: false,
    });
  });
  mark(ctx, "smoothed-histogram");

  const peak = Math.max(...mus.map((mu, i) => N * pdf(mu, mu, sigmas[i]) * binW));
  const yt = niceTicks(0, peak * 1.35);
  const x: Axis = {
    label: xPair.word.label,
    unit: xUnit,
    scale: "linear",
    range: [xt.lo, xt.hi],
    ticks: xt.ticks,
    betterIs: xDir,
  };
  const y: Axis = {
    label: "Count",
    scale: "linear",
    range: [0, yt.hi],
    ticks: yt.ticks,
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };

  const panel: Panel = {
    kind: "histogram",
    x, y, series,
    regions: [],
    annotations: [],
    legend: buildLegend(ctx, series),
  };
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeBin = sf.int(bins);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const b = Math.min(seeBin, bins - 1);
    panel.annotations.push({
      type: "text",
      at: { x: centers[b], y: series[0].points[b].y },
      text: "see text",
      boxed: true,
    });
    mark(ctx, "see-text");
  }
  return panel;
}
