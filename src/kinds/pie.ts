/**
 * The pie: shares of something that went wrong, with Other as the largest
 * slice, percentages that drift past 100 at higher junk, and a donut
 * variant whose hole holds a big number related to nothing.
 */
import type { Annotation, Axis, Panel, Series } from "../types.js";
import { lerp } from "../rng.js";
import { seriesStyle } from "../styles.js";
import { SLICES_GOBBLE, SLICES_PLAIN } from "../vocabulary.js";
import { type PanelCtx, buildLegend, mark } from "./common.js";

export function buildPie(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const lf = ctx.root.fork(`layout:${ctx.p}:slices`);
  const n = Math.min(7, 4 + Math.floor(ctx.dials.density * 3 + lf.next() * 0.999));
  const donut = lf.chance(0.45);
  const holeNumber = 800 + lf.int(9000);

  // Slice names; the last one is always Other, and Other always wins.
  const plain = af.sample(SLICES_PLAIN, 7);
  const gobble = af.sample(SLICES_GOBBLE, 4);
  const coins = Array.from({ length: 7 }, () => af.next());
  const names: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const candidate = coins[i] < g ? gobble[i % gobble.length] : plain[i];
    names.push(names.includes(candidate) ? plain[i] : candidate);
  }
  names.push("Other");

  const vf = ctx.root.fork(`series:${ctx.p}:shares`);
  const weights = Array.from({ length: n }, () => 0.4 + vf.next());
  const largest = Math.max(...weights);
  const largestAt = weights.indexOf(largest);
  [weights[largestAt], weights[n - 1]] = [weights[n - 1], largest * 1.12];
  // The drift is the seed's own sin, not a dial's, so sweeping junk never
  // moves a slice. Some pies are honest to within rounding; some are not.
  const total = weights.reduce((s, w) => s + w, 0);
  const drift = lerp(1.0, 1.05, vf.next());
  const scale = (100 / total) * drift;
  if (drift > 1.015) mark(ctx, "sum-drift");
  const shares = weights.map((w) => Number((w * scale).toFixed(1)));
  mark(ctx, "other-largest");
  if (donut) mark(ctx, "hole-number");

  const series: Series[] = names.map((name, i) => {
    const style = seriesStyle(ctx.style, ctx.mono, i, "baseline");
    return {
      id: `s${ctx.p}-${i}`,
      label: name,
      role: "baseline" as const,
      draw: "bar" as const,
      points: [{ x: i, y: shares[i] }],
      marker: "none" as const,
      dash: "solid" as const,
      color: style.color,
      bold: false,
    };
  });

  const x: Axis = {
    label: "Category",
    scale: "linear",
    range: [-0.5, n - 0.5],
    ticks: Array.from({ length: n }, (_, i) => i),
    tickLabels: names,
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };
  const y: Axis = {
    label: "Share",
    unit: "%",
    scale: "linear",
    range: [0, 110],
    ticks: [0, 25, 50, 75, 100],
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };

  const annotations: Annotation[] = [];
  if (donut) {
    annotations.push({
      type: "text",
      at: { x: -0.5, y: 0 },
      text: `n = ${String(holeNumber).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
    });
  }
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeSlice = sf.int(n);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    annotations.push({
      type: "text",
      at: { x: Math.min(seeSlice, n - 1), y: shares[Math.min(seeSlice, n - 1)] / 2 },
      text: "see text",
      boxed: true,
    });
    mark(ctx, "see-text");
  }

  return {
    kind: "pie",
    x, y, series,
    regions: [],
    annotations,
    legend: buildLegend(ctx, series),
  };
}
