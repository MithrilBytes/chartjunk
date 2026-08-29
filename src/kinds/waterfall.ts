/**
 * The ablation waterfall: a baseline, a staircase of generous
 * contributions, one small honest negative, and a final bold total the
 * contributions overshoot. The gap between the last step and the total is
 * rendered faithfully; nobody has ever asked about it.
 */
import type { Annotation, Axis, Panel, Series } from "../types.js";
import { lerp } from "../rng.js";
import { niceTicks } from "../shapes.js";
import { starCount } from "../artifacts.js";
import { pickPool } from "../dials.js";
import {
  CONTRIBUTIONS_GOBBLE, CONTRIBUTIONS_PLAIN, NEGATIVE_CONTRIBUTIONS,
} from "../vocabulary.js";
import { type PanelCtx, mark } from "./common.js";

export function buildWaterfall(ctx: PanelCtx): Panel {
  const g = ctx.dials.gobbledygook;
  const lf = ctx.root.fork(`layout:${ctx.p}:steps`);
  const nContrib = Math.min(5, 3 + Math.floor(ctx.dials.density * 2 + lf.next() * 0.999));

  const af = ctx.root.fork(`axes:${ctx.p}`);
  const plain = af.sample(CONTRIBUTIONS_PLAIN, 7);
  const gobble = af.sample(CONTRIBUTIONS_GOBBLE, 4);
  const coins = Array.from({ length: 7 }, () => af.next());
  const negLabel = af.pick(NEGATIVE_CONTRIBUTIONS);
  const negAt = 1 + af.int(Math.max(nContrib - 1, 1));

  const vf = ctx.root.fork(`series:${ctx.p}:values`);
  const base = lerp(0.5, 0.7, vf.next());
  const gain = lerp(0.15, 0.4, vf.next()) * base;
  const overshoot = lerp(1.18, 1.42, vf.next());
  const rawWeights = Array.from({ length: nContrib }, () => 0.3 + vf.next());
  const negValue = -lerp(0.02, 0.05, vf.next()) * base;
  const weightSum = rawWeights.reduce((s, w) => s + w, 0);
  // Positive steps sum to more than the eventual gain plus the honest dip.
  const positives = rawWeights.map((w) => (w / weightSum) * (gain * overshoot - negValue));

  interface Step { label: string; from: number; to: number; kind: "base" | "plus" | "minus" | "ours"; }
  const steps: Step[] = [{ label: "Baseline", from: 0, to: base, kind: "base" }];
  let cum = base;
  let posIdx = 0;
  for (let i = 0; i < nContrib; i++) {
    if (i === negAt) {
      steps.push({ label: `− ${negLabel}`, from: cum, to: cum + negValue, kind: "minus" });
      cum += negValue;
    }
    const name = coins[i] < g ? gobble[i % gobble.length] : plain[i];
    steps.push({ label: `+ ${name}`, from: cum, to: cum + positives[posIdx], kind: "plus" });
    cum += positives[posIdx];
    posIdx += 1;
  }
  if (negAt >= nContrib) {
    steps.push({ label: `− ${negLabel}`, from: cum, to: cum + negValue, kind: "minus" });
    cum += negValue;
  }
  steps.push({ label: `${ctx.method} (ours)`, from: 0, to: base + gain, kind: "ours" });
  mark(ctx, "contributions-exceed");

  const series: Series[] = steps.map((step, i) => ({
    id: `s${ctx.p}-${i}`,
    label: step.label,
    role: step.kind === "ours" ? "ours" as const : step.kind === "base" ? "baseline" as const : "reference" as const,
    draw: "bar" as const,
    points: [{ x: i, y: step.to, lo: step.from }],
    marker: "none" as const,
    dash: "solid" as const,
    color: step.kind === "plus" ? 2 : step.kind === "minus" ? 3 : 0,
    bold: step.kind === "ours",
  }));
  mark(ctx, "ours-bold");

  const yTop = Math.max(cum, base + gain) * 1.18;
  const yt = niceTicks(0, yTop);
  const x: Axis = {
    label: "Component",
    scale: "linear",
    range: [-0.5, steps.length - 0.5],
    ticks: steps.map((_, i) => i),
    tickLabels: steps.map((s) => s.label),
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };
  const y: Axis = {
    label: "Score",
    scale: "linear",
    range: [0, yt.hi],
    ticks: yt.ticks,
    betterIs: "higher",
  };

  const annotations: Annotation[] = [];
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const biggest = positives.indexOf(Math.max(...positives));
  sf.next();
  if (ctx.fired.has("significance-stars") && ctx.p === 0) {
    const step = steps.find((s, i) => s.kind === "plus" && steps.slice(0, i).filter((q) => q.kind === "plus").length === biggest);
    if (step) {
      const at = steps.indexOf(step);
      annotations.push({
        type: "stars",
        at: { x: at, y: Math.min(step.to * 1.08, yt.hi * 0.97) },
        count: starCount(ctx.dials.confidence),
      });
      mark(ctx, "significance-stars");
    }
  }
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const idx = sf.int(steps.length);
    const step = steps[Math.min(idx, steps.length - 1)];
    annotations.push({
      type: "text",
      at: { x: steps.indexOf(step), y: step.to },
      text: "see text",
      boxed: true,
    });
    mark(ctx, "see-text");
  }
  if (ctx.fired.has("rotated-ticks")) mark(ctx, "rotated-ticks");

  return {
    kind: "waterfall",
    x, y, series,
    regions: [],
    annotations,
    legend: { position: "best", entries: [] },
  };
}
