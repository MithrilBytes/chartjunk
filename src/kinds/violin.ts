/**
 * Violins: one silky kernel density per method, estimated from three runs.
 * Ours tightens into a confident spike as the dial rises; the caption
 * admits the sample size in the smallest possible voice.
 */
import type { Annotation, Axis, Panel, Point, Series } from "../types.js";
import { lerp } from "../rng.js";
import { enforceGag, niceTicks } from "../shapes.js";
import { starCount } from "../artifacts.js";
import { Y_GOBBLE, Y_PLAIN, pickAxisWord, pickUnit } from "../vocabulary.js";
import {
  type PanelCtx, baselineStats, mark, oursDelta, planSeries, seriesCount,
} from "./common.js";

const PROFILE_STEPS = 15;

export function buildViolin(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const yDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const yWord = pickAxisWord(af, Y_PLAIN, Y_GOBBLE, yDir, g);
  const rawUnit = pickUnit(af, yWord, g);
  const yUnit = rawUnit === "%" ? undefined : rawUnit;

  const n = Math.min(4, Math.max(2, ctx.shared ? ctx.shared.length : seriesCount(ctx)));
  const plans = planSeries(ctx, n);

  // Level and spread per method; ours narrows with confidence.
  const levels: number[] = [];
  const sigmas: number[] = [];
  const lobes: number[] = [];
  for (let i = 0; i < plans.length; i++) {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    levels.push(lerp(0.45, 1.05, pf.next()));
    sigmas.push(lerp(0.05, 0.13, pf.next()));
    lobes.push(pf.next());
  }
  if (plans.length > 1) {
    const others = levels.slice(1);
    const { best, spread } = baselineStats(others, yDir);
    const delta = oursDelta(ctx, best, spread, yDir);
    levels[0] = enforceGag(best + delta, best, ctx.dials.confidence, yDir, true);
    sigmas[0] = lerp(0.16, 0.025, ctx.dials.confidence);
  }

  // Confidence-independent envelope: level bounds plus the fattest tails.
  const envValues: number[] = [];
  for (let i = 1; i < plans.length; i++) {
    envValues.push(levels[i] - 2.8 * sigmas[i], levels[i] + 2.8 * sigmas[i]);
  }
  if (plans.length > 1) {
    const { best, spread } = baselineStats(levels.slice(1), yDir);
    envValues.push(best - spread * 0.85 - 0.18 * 2.8, best + spread * 0.85 + 0.18 * 2.8);
  } else {
    envValues.push(levels[0] - 2.8 * sigmas[0], levels[0] + 2.8 * sigmas[0]);
  }
  const yt = niceTicks(Math.min(...envValues), Math.max(...envValues));

  const series: Series[] = plans.map((plan, i) => {
    const outline = violinOutline(i, levels[i], sigmas[i], lobes[i]);
    return {
      id: `s${ctx.p}-${i}`,
      label: plan.label,
      role: plan.role,
      draw: "band" as const,
      points: outline,
      marker: "none" as const,
      dash: "solid" as const,
      color: plan.color,
      bold: plan.bold,
      stats: {
        median: levels[i],
        q1: levels[i] - 0.67 * sigmas[i],
        q3: levels[i] + 0.67 * sigmas[i],
      },
    };
  });

  const x: Axis = {
    label: "Method",
    scale: "linear",
    range: [-0.5, n - 0.5],
    ticks: Array.from({ length: n }, (_, i) => i),
    tickLabels: plans.map((p) => p.label),
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };
  const y: Axis = {
    label: yWord.label,
    unit: yUnit,
    scale: "linear",
    range: [yt.lo, yt.hi],
    ticks: yt.ticks,
    betterIs: yDir,
  };
  mark(ctx, "kde-from-nothing");
  if (ctx.fired.has("rotated-ticks")) mark(ctx, "rotated-ticks");
  if (ctx.fired.has("zero-suppressed")) {
    y.zeroSuppressed = true;
    mark(ctx, "zero-suppressed");
  }

  const annotations: Annotation[] = [];
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeIdx = sf.int(n);
  if (ctx.fired.has("significance-stars") && ctx.p === 0 && n > 1) {
    const others = levels.slice(1);
    const { best } = baselineStats(others, yDir);
    const bestIdx = 1 + others.indexOf(best);
    const top = Math.max(levels[0] + 2.9 * sigmas[0], levels[bestIdx] + 2.9 * sigmas[bestIdx]);
    annotations.push({
      type: "stars",
      at: { x: (0 + bestIdx) / 2, y: Math.min(top, yt.hi * 0.97 + yt.lo * 0.03) },
      count: starCount(ctx.dials.confidence),
    });
    mark(ctx, "significance-stars");
  }
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    annotations.push({
      type: "text",
      at: { x: Math.min(seeIdx, n - 1), y: levels[Math.min(seeIdx, n - 1)] },
      text: "see text",
      boxed: true,
    });
    mark(ctx, "see-text");
  }

  return {
    kind: "violin",
    x, y, series,
    regions: [],
    annotations,
    legend: { position: "best", entries: [] },
  };
}

/**
 * Closed outline around (m, level): right side up, left side down. Widths
 * come from the normalized offset alone, so the x coordinates are bitwise
 * identical whatever sigma the confidence dial chose.
 */
function violinOutline(m: number, level: number, sigma: number, lobe: number): Point[] {
  const wMax = 0.36;
  const twoLobed = lobe > 0.72;
  const width = (t: number): number => {
    const d1 = Math.exp(-(t * t) / 2);
    const d2 = twoLobed ? 0.7 * Math.exp(-((t - 1.4) ** 2) / (2 * 0.36)) : 0;
    return wMax * Math.min(d1 + d2, 1);
  };
  const ts: number[] = [];
  for (let k = 0; k <= PROFILE_STEPS; k++) {
    ts.push(-2.8 + (5.6 * k) / PROFILE_STEPS);
  }
  const right = ts.map((t) => ({ x: m + width(t), y: level + t * sigma }));
  const left = [...ts].reverse().map((t) => ({ x: m - width(t), y: level + t * sigma }));
  return [...right, ...left];
}
