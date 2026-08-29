/**
 * Stacked area: where the budget went, over time. Components share one
 * barely distinguishable hue, and Other grows until it swallows the plot,
 * which the caption does not mention.
 */
import type { Axis, Panel, Series } from "../types.js";
import { lerp } from "../rng.js";
import { seriesStyle } from "../styles.js";
import { niceTicks } from "../shapes.js";
import { COMPONENTS_GOBBLE, COMPONENTS_PLAIN, X_GOBBLE, X_PLAIN, pickAxisPair } from "../vocabulary.js";
import { type PanelCtx, buildLegend, mark, pointCount } from "./common.js";

export function buildArea(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const xDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const xPair = pickAxisPair(af, X_PLAIN, X_GOBBLE, xDir, g);
  const lf = ctx.root.fork(`layout:${ctx.p}:components`);
  const K = Math.min(6, 4 + Math.floor(ctx.dials.density * 2 + lf.next() * 0.999));
  const T = Math.max(8, Math.min(30, pointCount(ctx)));

  const plain = af.sample(COMPONENTS_PLAIN, 7);
  const gobble = af.sample(COMPONENTS_GOBBLE, 4);
  const coins = Array.from({ length: 7 }, () => af.next());
  const names: string[] = [];
  for (let k = 0; k < K - 1; k++) {
    const candidate = coins[k] < g ? gobble[k % gobble.length] : plain[k];
    names.push(names.includes(candidate) ? plain[k] : candidate);
  }
  names.push("Other");

  const hint = xPair.base.range ?? [0, 100];
  const xt = niceTicks(hint[0], hint[1]);
  const xs = Array.from({ length: T }, (_, t) => xt.lo + ((xt.hi - xt.lo) * t) / (T - 1));

  // Raw weights walk gently; Other's ramps up and takes over.
  const rows: number[][] = [];
  for (let k = 0; k < K; k++) {
    const wf = ctx.root.fork(`series:${ctx.p}:${k}:walk`);
    let w = lerp(0.6, 1.4, wf.next());
    const row: number[] = [];
    for (let t = 0; t < T; t++) {
      w = Math.max(0.15, w + 0.16 * (wf.next() - 0.5));
      const ramp = k === K - 1 ? 0.5 + 2.6 * Math.pow(t / (T - 1), 1.6) : 1;
      row.push(w * ramp);
    }
    rows.push(row);
  }
  const shares: number[][] = rows.map(() => new Array(T).fill(0));
  for (let t = 0; t < T; t++) {
    let total = 0;
    for (let k = 0; k < K; k++) total += rows[k][t];
    for (let k = 0; k < K; k++) shares[k][t] = Number((rows[k][t] / total).toFixed(4));
  }
  mark(ctx, "other-grows");
  mark(ctx, "indistinct-colors");

  const series: Series[] = names.map((name, k) => {
    const style = seriesStyle(ctx.style, ctx.mono, k, "baseline");
    return {
      id: `s${ctx.p}-${k}`,
      label: name,
      role: "baseline" as const,
      draw: "band" as const,
      points: xs.map((x, t) => ({ x, y: shares[k][t] })),
      marker: "none" as const,
      dash: "solid" as const,
      color: style.color,
      bold: false,
    };
  });

  const x: Axis = {
    label: xPair.word.label,
    scale: "linear",
    range: [xt.lo, xt.hi],
    ticks: xt.ticks,
    betterIs: xDir,
  };
  const y: Axis = {
    label: "Share of budget",
    scale: "linear",
    range: [0, 1],
    ticks: [0, 0.25, 0.5, 0.75, 1],
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };

  const panel: Panel = {
    kind: "area",
    x, y, series,
    regions: [],
    annotations: [],
    legend: buildLegend(ctx, series),
  };
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeT = sf.int(T);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const t = Math.min(seeT, T - 1);
    panel.annotations.push({
      type: "text",
      at: { x: xs[t], y: Math.min(shares[K - 1][t], 0.9) },
      text: "see text",
      boxed: true,
    });
    mark(ctx, "see-text");
  }
  return panel;
}

