/**
 * Regime diagram: regions I, II, III between dashed boundary curves, a
 * hatched "unstable" corner, and a boxed boundary equation nobody derives.
 */
import type { Annotation, Panel, Point, Region, Series } from "../types.js";
import { lerp } from "../rng.js";
import { pickPool } from "../dials.js";
import {
  REGIONS_GOBBLE, REGIONS_PLAIN, X_GOBBLE, X_PLAIN, type AxisWord, pickAxisPair, pickUnit,
} from "../vocabulary.js";
import { type PanelCtx, buildAxis, buildLegend, mark } from "./common.js";

const STEPS = 32;

export function buildPhase(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  // Two control parameters; both axes draw from the x pools.
  const xDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const yDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const xPair = pickAxisPair(af, X_PLAIN, X_GOBBLE, xDir, g);
  let yPair = pickAxisPair(af, X_PLAIN, X_GOBBLE, yDir, g);
  const xUnit = pickUnit(af, xPair.word, g);
  const yUnit = pickUnit(af, yPair.word, g);
  // Collisions resolve on the plain identity so the fallback, and with it
  // the axis range, cannot depend on the gobbledygook dial.
  if (yPair.base.label === xPair.base.label) {
    const fallback: AxisWord = xPair.base.label === "Temperature"
      ? { label: "Sparsity", range: [0, 1] }
      : { label: "Temperature", range: [0, 2] };
    yPair = { base: fallback, word: fallback };
  }
  const xWord = xPair.word;
  const yWord = yPair.word;
  const xr = xPair.base.range ?? [0, 10];
  const yr = yPair.base.range ?? [0, 10];

  const x = buildAxis(xWord, xUnit, xDir, false, xr[0], xr[1]);
  const y = buildAxis(yWord, yUnit, yDir, false, yr[0], yr[1]);
  const [xLo, xHi] = x.range;
  const [yLo, yHi] = y.range;

  // Two nested boundary curves in axis units.
  const bf = ctx.root.fork(`series:${ctx.p}:boundaries`);
  const p1 = lerp(0.6, 1.8, bf.next());
  const h1 = lerp(0.55, 0.85, bf.next());
  const p2 = lerp(1.2, 2.6, bf.next());
  const h2 = lerp(0.25, 0.45, bf.next());
  const curve = (h: number, p: number) => (t: number): number =>
    yLo + (yHi - yLo) * h * Math.pow(t, p);
  const b1 = curve(h1, p1);
  const b2 = curve(h2, p2);

  const sample = (fn: (t: number) => number): Point[] => {
    const pts: Point[] = [];
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS;
      pts.push({ x: xLo + (xHi - xLo) * t, y: clamp(fn(t), yLo, yHi) });
    }
    return pts;
  };
  const b1pts = sample(b1);
  const b2pts = sample(b2);

  const series: Series[] = [
    {
      id: `s${ctx.p}-b1`, label: "", role: "reference", draw: "line",
      points: b1pts, marker: "none", dash: "dashed", color: 3, bold: false,
    },
    {
      id: `s${ctx.p}-b2`, label: "", role: "reference", draw: "line",
      points: b2pts, marker: "none", dash: "dashed", color: 3, bold: false,
    },
  ];

  // Regions between the boundaries, plus the hatched corner.
  const regions: Region[] = [];
  const bottom: Point[] = [{ x: xLo, y: yLo }, { x: xHi, y: yLo }];
  regions.push({ polygon: [...bottom, ...reversed(b2pts)], fill: "shade", label: "I" });
  regions.push({ polygon: [...b2pts, ...reversed(b1pts)], fill: "shade", label: "II" });
  regions.push({
    polygon: [...b1pts, { x: xHi, y: yHi }, { x: xLo, y: yHi }],
    fill: "shade",
    label: "III",
  });
  mark(ctx, "phase-regions");

  const cornerX = xLo + (xHi - xLo) * 0.72;
  regions.push({
    polygon: [
      { x: cornerX, y: b1(0.72) }, { x: xHi, y: b1(1) },
      { x: xHi, y: yHi }, { x: cornerX, y: yHi },
    ].map((p) => ({ x: p.x, y: clamp(p.y, yLo, yHi) })),
    fill: "hatch",
    label: "unstable",
  });
  mark(ctx, "hatched-unstable");

  const annotations: Annotation[] = [];
  const rf = ctx.root.fork(`regions:${ctx.p}`);
  const drawnLabel = pickPool(rf, REGIONS_PLAIN, REGIONS_GOBBLE, g);
  // The hatched corner already says unstable; no doubling up.
  const regionLabel = drawnLabel === "unstable" ? "not converged" : drawnLabel;
  if (ctx.fired.has("infeasible-region") && ctx.p === 0) {
    regions.push({
      polygon: [
        { x: xLo, y: yLo }, { x: xLo + (xHi - xLo) * 0.14, y: yLo },
        { x: xLo + (xHi - xLo) * 0.14, y: yHi }, { x: xLo, y: yHi },
      ],
      fill: ctx.mono ? "hatch" : "shade",
      label: regionLabel,
    });
    mark(ctx, "infeasible-region");
  }

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const eqPick = sf.int(4);
  const eqT = lerp(0.45, 0.7, sf.next());
  if (ctx.fired.has("boundary-equation") && ctx.p === 0) {
    const sx = symbolOf(xWord.label);
    const sy = symbolOf(yWord.label);
    const eqs = [
      `${sy} ∝ ${sx}²`,
      `${sy} ∝ √${sx}`,
      `${sy}·${sx} = const`,
      `${sy} = O(${sx} log ${sx})`,
    ];
    annotations.push({
      type: "text",
      at: { x: xLo + (xHi - xLo) * eqT, y: clamp(b1(eqT) * 1.02, yLo, yHi) },
      text: eqs[eqPick],
      boxed: true,
    });
    mark(ctx, "boundary-equation");
  }

  const seeT = sf.next();
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const t = 0.2 + seeT * 0.5;
    annotations.push({
      type: "text",
      at: { x: xLo + (xHi - xLo) * t, y: clamp(b2(t), yLo, yHi) },
      text: "see text",
      boxed: true,
    });
    mark(ctx, "see-text");
  }

  return {
    kind: "phase",
    x, y,
    series,
    regions,
    annotations,
    legend: buildLegend(ctx, series),
  };
}

/** A one-character symbol for the boundary equation. */
function symbolOf(label: string): string {
  if (label.includes("λ")) return "λ";
  if (label.toLowerCase().startsWith("temp")) return "T";
  const ch = label.replace(/[^a-zA-Z]/g, "")[0] ?? "x";
  return ch;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function reversed<T>(arr: T[]): T[] {
  return [...arr].reverse();
}
