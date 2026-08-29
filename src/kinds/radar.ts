/**
 * The capability radar: five to eight spokes of incommensurable virtues,
 * one polygon per method, and a radial note claiming everything was
 * normalized to ours. It was not. Area reads as merit; nobody checks.
 */
import type { Axis, Panel, Series } from "../types.js";
import { lerp } from "../rng.js";
import { enforceGag } from "../shapes.js";
import { SPOKES_GOBBLE, SPOKES_PLAIN } from "../vocabulary.js";
import {
  type PanelCtx, baselineStats, buildLegend, jitter, mark, oursDelta,
  planSeries, seriesCount,
} from "./common.js";

export function buildRadar(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const lf = ctx.root.fork(`layout:${ctx.p}:spokes`);
  const spokes = Math.min(8, 5 + Math.floor(ctx.dials.density * 3 + lf.next() * 0.999));

  // Spoke names, fixed draws: both pools sampled, coins decide per spoke.
  // A gobble name that already appeared falls back to the plain draw, so
  // no capability gets measured twice, even here.
  const plain = af.sample(SPOKES_PLAIN, 8);
  const gobble = af.sample(SPOKES_GOBBLE, 5);
  const coins = Array.from({ length: 8 }, () => af.next());
  const names: string[] = [];
  for (let s = 0; s < spokes; s++) {
    const candidate = coins[s] < g ? gobble[s % gobble.length] : plain[s];
    names.push(names.includes(candidate) ? plain[s] : candidate);
  }

  const n = Math.min(4, Math.max(2, ctx.shared ? ctx.shared.length : seriesCount(ctx)));
  const plans = planSeries(ctx, n);

  // Values per method per spoke; ours lands margin over the per-spoke best.
  const rows: number[][] = plans.map((_, i) => {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    return Array.from({ length: 8 }, () => lerp(0.25, 0.9, pf.next())).slice(0, spokes);
  });
  for (let s = 0; s < spokes; s++) {
    const others = rows.slice(1).map((r) => r[s]);
    if (others.length === 0) continue;
    const { best, spread } = baselineStats(others, "higher");
    const delta = oursDelta(ctx, best, spread, "higher");
    let target = enforceGag(best + delta, best, ctx.dials.confidence, "higher", true);
    target = Math.min(Math.max(target, 0.1), 1.0);
    rows[0][s] = target;
  }
  const ef = ctx.root.fork(`errors:${ctx.p}:jitter`);
  for (let i = 1; i < rows.length; i++) {
    for (let s = 0; s < spokes; s++) rows[i][s] = Math.min(rows[i][s] * jitter(ef, 0.01), 1);
  }

  const series: Series[] = plans.map((plan, i) => ({
    id: `s${ctx.p}-${i}`,
    label: plan.label,
    role: plan.role,
    draw: "line" as const,
    points: rows[i].map((v, s) => ({ x: s, y: v })),
    marker: plan.marker,
    dash: plan.dash,
    color: plan.color,
    bold: plan.bold,
  }));

  const x: Axis = {
    label: "Capability",
    scale: "linear",
    range: [-0.5, spokes - 0.5],
    ticks: Array.from({ length: spokes }, (_, s) => s),
    tickLabels: names,
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };
  const y: Axis = {
    label: "Score",
    scale: "linear",
    range: [0, 1.05],
    ticks: [0, 0.25, 0.5, 0.75, 1],
    betterIs: "higher",
  };
  mark(ctx, "normalized-to-ours");

  const panel: Panel = {
    kind: "radar",
    x, y, series,
    regions: [],
    annotations: [],
    legend: buildLegend(ctx, series),
  };

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeSpoke = sf.int(spokes);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const pt = series[0].points[Math.min(seeSpoke, spokes - 1)];
    panel.annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }
  return panel;
}
