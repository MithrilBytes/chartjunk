/**
 * Bump chart: method ranks across rounds, lines crossing like shoelaces.
 * The baselines shuffle honestly from their own streams; ours simply takes
 * whatever rank is left over each round, and the schedule of leftovers
 * happens to end at first place.
 */
import type { Axis, Panel, Series } from "../types.js";
import { pickPool } from "../dials.js";
import { BUMP_X_GOBBLE, BUMP_X_PLAIN } from "../vocabulary.js";
import {
  type PanelCtx, buildLegend, mark, planSeries, seriesCount,
} from "./common.js";

export function buildBump(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const xLabel = pickPool(af, BUMP_X_PLAIN, BUMP_X_GOBBLE, g);
  const redundantNote = af.chance(0.6);

  const lf = ctx.root.fork(`layout:${ctx.p}:rounds`);
  const rounds = Math.min(9, 4 + Math.floor(ctx.dials.density * 5 + lf.next() * 0.999));

  const n = Math.max(2, ctx.shared ? ctx.shared.length : seriesCount(ctx));
  const plans = planSeries(ctx, n);

  // Each round, the baselines draw distinct ranks; ours gets the leftover.
  // The last round's shuffle is nudged so the leftover is first place.
  const rf = ctx.root.fork(`series:${ctx.p}:ranks`);
  const ranksByRound: number[][] = [];
  for (let t = 0; t < rounds; t++) {
    const pool = Array.from({ length: n }, (_, i) => i + 1);
    const perm = rf.sample(pool, n);
    // A permutation of 1..n; baselines take the first n-1 in order, ours
    // takes what remains.
    const taken = perm.slice(0, n - 1);
    const leftover = pool.find((r) => !taken.includes(r)) ?? n;
    ranksByRound.push([leftover, ...taken]);
  }
  const last = ranksByRound[rounds - 1];
  if (last[0] !== 1) {
    // Swap whoever holds rank 1 with ours; the record will show a surge.
    const holder = last.indexOf(1);
    [last[0], last[holder]] = [last[holder], last[0]];
  }

  const series: Series[] = plans.map((plan, i) => ({
    id: `s${ctx.p}-${i}`,
    label: plan.label,
    role: plan.role,
    draw: "line" as const,
    points: ranksByRound.map((ranks, t) => ({ x: t + 1, y: ranks[i] })),
    marker: plan.marker,
    dash: plan.dash,
    color: plan.color,
    bold: plan.bold,
  }));

  const x: Axis = {
    label: xLabel,
    scale: "linear",
    range: [0.5, rounds + 0.5],
    ticks: Array.from({ length: rounds }, (_, t) => t + 1),
    tickLabels: xLabel === "Year"
      ? Array.from({ length: rounds }, (_, t) => String(2019 + t))
      : undefined,
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };
  const y: Axis = {
    label: redundantNote ? "Rank (lower is better)" : "Rank",
    scale: "linear",
    range: [0.5, n + 0.5],
    ticks: Array.from({ length: n }, (_, i) => i + 1),
    betterIs: "lower",
  };
  mark(ctx, "rank-inverted");

  const panel: Panel = {
    kind: "bump",
    x, y, series,
    regions: [],
    annotations: [],
    legend: buildLegend(ctx, series),
  };

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeRound = sf.int(rounds);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const pt = series[0].points[Math.min(seeRound, rounds - 1)];
    panel.annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }
  return panel;
}
