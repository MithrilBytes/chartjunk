/**
 * A matrix with a colorbar: smooth enough to look measured, a nonsense
 * colorbar unit, and one cell boxed "see text".
 */
import type { Annotation, Axis, Panel } from "../types.js";
import { lerp } from "../rng.js";
import { niceTicks } from "../shapes.js";
import { pickPool } from "../dials.js";
import {
  CLASSES_GOBBLE, CLASSES_PLAIN, HEATMAP_AXES_GOBBLE, HEATMAP_AXES_PLAIN,
  UNITS_GOBBLE, UNITS_PLAIN, Y_GOBBLE, Y_PLAIN, pickAxisWord,
} from "../vocabulary.js";
import { type PanelCtx, buildLegend, mark, planSeries } from "./common.js";

type Flavor = "field" | "confusion" | "winrate";

export function buildHeatmap(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const pair = pickPool(af, HEATMAP_AXES_PLAIN, HEATMAP_AXES_GOBBLE, g);
  const cbDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const cbWord = pickAxisWord(af, Y_PLAIN, Y_GOBBLE, cbDir, g);
  // The signature gag: the colorbar always carries a unit, gobble-leaning.
  const cbUnit = pickPool(af, UNITS_PLAIN, UNITS_GOBBLE, Math.max(g, 0.45));
  const xDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const yDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";

  // The flavor is a seeded pick, never a dial, so sweeps cannot flip it.
  const hf = ctx.root.fork(`layout:${ctx.p}:flavor`);
  const flavorU = hf.next();
  const flavor: Flavor = flavorU < 0.45 ? "field" : flavorU < 0.75 ? "confusion" : "winrate";

  const built = flavor === "field"
    ? buildField(ctx, pair)
    : flavor === "confusion"
      ? buildConfusion(ctx, g)
      : buildWinrate(ctx, g);
  const { rows, cols, values, rowLabels, colLabels, rowName, colName } = built;

  const vLo = Math.min(...values);
  const vHi = Math.max(...values);
  const cbTicks = niceTicks(vLo, vHi, 5);
  const cbLabel = flavor === "field" ? cbWord.label
    : flavor === "confusion" ? "Fraction of predictions"
    : "Win rate";
  if (flavor === "confusion") mark(ctx, "confusion-diagonal");
  if (flavor === "winrate") mark(ctx, "pairwise-grid");

  const x: Axis = {
    label: colName,
    scale: "linear",
    range: [-0.5, cols - 0.5],
    ticks: Array.from({ length: cols }, (_, i) => i),
    tickLabels: colLabels,
    betterIs: xDir,
  };
  const y: Axis = {
    label: rowName,
    scale: "linear",
    range: [-0.5, rows - 0.5],
    ticks: Array.from({ length: rows }, (_, i) => i),
    tickLabels: rowLabels,
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
      rowLabels,
      colLabels,
      colorbar: { label: cbLabel, unit: cbUnit, ticks: cbTicks.ticks },
    },
    regions: [],
    annotations,
    legend: buildLegend(ctx, []),
  };
}

interface BuiltMatrix {
  rows: number;
  cols: number;
  values: number[];
  rowLabels: string[];
  colLabels: string[];
  rowName: string;
  colName: string;
}

/** Two seeded bumps plus a gradient: measured-looking, means nothing. */
function buildField(ctx: PanelCtx, pair: readonly [string, string]): BuiltMatrix {
  const [rowName, colName] = pair;
  const lf = ctx.root.fork(`layout:${ctx.p}:matrix`);
  const rows = Math.min(12, 4 + Math.floor(ctx.dials.density * 7 + lf.next() * 0.999));
  const cols = Math.min(12, 4 + Math.floor(ctx.dials.density * 7 + lf.next() * 0.999));
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
  return {
    rows, cols, values,
    rowLabels: Array.from({ length: rows }, (_, i) => String(i + 1)),
    colLabels: Array.from({ length: cols }, (_, i) => String(i + 1)),
    rowName, colName,
  };
}

/** A confusion matrix with a diagonal it is very proud of. */
function buildConfusion(ctx: PanelCtx, g: number): BuiltMatrix {
  const lf = ctx.root.fork(`layout:${ctx.p}:matrix`);
  // Capped by the class pool so the dedupe always has a fresh fallback.
  const dim = Math.min(6, 4 + Math.floor(ctx.dials.density * 2 + lf.next() * 0.999));
  const cf = ctx.root.fork(`axes:${ctx.p}:classes`);
  const plain = cf.sample(CLASSES_PLAIN, 6);
  const gobble = cf.sample(CLASSES_GOBBLE, 5);
  const coins = Array.from({ length: 7 }, () => cf.next());
  const names: string[] = [];
  for (let i = 0; i < dim; i++) {
    // No class confuses itself with itself twice.
    const candidate = coins[i] < g ? gobble[i % gobble.length] : plain[i % plain.length];
    names.push(names.includes(candidate) ? plain[i % plain.length] : candidate);
  }
  const vf = ctx.root.fork(`series:${ctx.p}:field`);
  const values: number[] = [];
  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      const u = vf.next();
      const v = r === c ? lerp(0.58, 0.92, u) : lerp(0.01, 0.13, u);
      values.push(Number(v.toFixed(4)));
    }
  }
  return {
    rows: dim, cols: dim, values,
    rowLabels: names, colLabels: names,
    rowName: g > 0.6 ? "Quasi-actual" : "Actual",
    colName: g > 0.6 ? "Pseudo-predicted" : "Predicted",
  };
}

/** Pairwise win rates: ours' row glows, the diagonal holds at one half. */
function buildWinrate(ctx: PanelCtx, g: number): BuiltMatrix {
  const lf = ctx.root.fork(`layout:${ctx.p}:matrix`);
  const dim = Math.min(5, 3 + Math.floor(ctx.dials.density * 2 + lf.next() * 0.999));
  const plans = planSeries(ctx, dim, { markOurs: false });
  const names = plans.map((p) => p.label);
  const vf = ctx.root.fork(`series:${ctx.p}:field`);
  const values: number[] = new Array(dim * dim).fill(0.5);
  for (let r = 0; r < dim; r++) {
    for (let c = r + 1; c < dim; c++) {
      const u = vf.next();
      const base = r === 0 ? lerp(0.62, 0.88, u) : lerp(0.35, 0.65, u);
      values[r * dim + c] = Number(base.toFixed(4));
      values[c * dim + r] = Number((1 - base).toFixed(4));
    }
  }
  return {
    rows: dim, cols: dim, values,
    rowLabels: names, colLabels: names,
    rowName: "Method", colName: "Opponent",
  };
}
