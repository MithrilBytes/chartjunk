/**
 * A matrix with a colorbar: smooth enough to look measured, a nonsense
 * colorbar unit, and one cell boxed "see text".
 */
import type { Annotation, Axis, Panel } from "../types.js";
import { lerp } from "../rng.js";
import { niceTicks } from "../shapes.js";
import { pickPool } from "../dials.js";
import {
  HEATMAP_AXES_GOBBLE, HEATMAP_AXES_PLAIN, UNITS_GOBBLE, UNITS_PLAIN,
  Y_GOBBLE, Y_PLAIN, pickAxisWord,
} from "../vocabulary.js";
import { type PanelCtx, buildLegend, mark } from "./common.js";

export function buildHeatmap(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const pair = pickPool(af, HEATMAP_AXES_PLAIN, HEATMAP_AXES_GOBBLE, g);
  const [rowName, colName] = pair;
  const cbDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const cbWord = pickAxisWord(af, Y_PLAIN, Y_GOBBLE, cbDir, g);
  // The signature gag: the colorbar always carries a unit, gobble-leaning.
  const cbUnit = pickPool(af, UNITS_PLAIN, UNITS_GOBBLE, Math.max(g, 0.45));
  const xDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const yDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";

  const lf = ctx.root.fork(`layout:${ctx.p}:matrix`);
  const rows = Math.min(12, 4 + Math.floor(ctx.dials.density * 7 + lf.next() * 0.999));
  const cols = Math.min(12, 4 + Math.floor(ctx.dials.density * 7 + lf.next() * 0.999));

  // Two seeded bumps plus a gradient: measured-looking, means nothing.
  const vf = ctx.root.fork(`series:${ctx.p}:field`);
  const bump = () => ({
    r: vf.next() * rows,
    c: vf.next() * cols,
    amp: lerp(0.35, 0.9, vf.next()),
    sig: lerp(1.2, 3.2, vf.next()),
  });
  const b1 = bump();
  const b2 = bump();
  const gradR = lerp(-0.25, 0.25, vf.next());
  const gradC = lerp(-0.25, 0.25, vf.next());
  const base = lerp(0.1, 0.3, vf.next());

  const nf = ctx.root.fork(`errors:${ctx.p}:field`);
  const values: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g1 = b1.amp * Math.exp(-((r - b1.r) ** 2 + (c - b1.c) ** 2) / (2 * b1.sig ** 2));
      const g2 = b2.amp * Math.exp(-((r - b2.r) ** 2 + (c - b2.c) ** 2) / (2 * b2.sig ** 2));
      const v = base + g1 + g2 + gradR * (r / rows) + gradC * (c / cols) + 0.04 * (nf.next() - 0.5);
      values.push(Number(v.toFixed(4)));
    }
  }

  const vLo = Math.min(...values);
  const vHi = Math.max(...values);
  const cbTicks = niceTicks(vLo, vHi, 5);

  const x: Axis = {
    label: colName,
    scale: "linear",
    range: [-0.5, cols - 0.5],
    ticks: Array.from({ length: cols }, (_, i) => i),
    tickLabels: Array.from({ length: cols }, (_, i) => String(i + 1)),
    betterIs: xDir,
  };
  const y: Axis = {
    label: rowName,
    scale: "linear",
    range: [-0.5, rows - 0.5],
    ticks: Array.from({ length: rows }, (_, i) => i),
    tickLabels: Array.from({ length: rows }, (_, i) => String(i + 1)),
    betterIs: yDir,
  };

  const annotations: Annotation[] = [];
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeR = sf.int(rows);
  const seeC = sf.int(cols);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    annotations.push({ type: "text", at: { x: seeC, y: seeR }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }
  if (ctx.fired.has("cell-values")) mark(ctx, "cell-values");
  if (ctx.fired.has("rotated-ticks")) mark(ctx, "rotated-ticks");
  mark(ctx, "colorbar-unit");

  return {
    kind: "heatmap",
    x, y,
    series: [],
    matrix: {
      rows,
      cols,
      values,
      rowLabels: y.tickLabels ?? [],
      colLabels: x.tickLabels ?? [],
      colorbar: { label: cbWord.label, unit: cbUnit, ticks: cbTicks.ticks },
    },
    regions: [],
    annotations,
    legend: buildLegend(ctx, []),
  };
}
