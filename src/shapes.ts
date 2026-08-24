/**
 * Curve families and axis arithmetic. No data anywhere: every series is a
 * parametric family evaluated on a grid, with seeded parameters and noise.
 */
import { lerp, type Rng } from "./rng.js";

/** Evaluate on t in [0, 1]; the caller maps t onto the x axis. */
export type Curve = (t: number) => number;

/** c + a·e^(−bt) plus a floor: loss curves; a line then a floor on log-y. */
export function decay(rng: Rng): Curve {
  const a = lerp(0.5, 2.5, rng.next());
  const b = lerp(2.5, 6.5, rng.next());
  const c = lerp(0.03, 0.4, rng.next());
  return (t) => c + a * Math.exp(-b * t);
}

/** a·t^b on a shifted grid: scaling laws, straight on log-log. */
export function power(rng: Rng): Curve {
  const a = lerp(0.5, 2, rng.next());
  const b = lerp(0.5, 2.5, rng.next());
  return (t) => a * Math.pow(0.05 + 0.95 * t, b);
}

/** Logistic: accuracy against data, saturating politely. */
export function saturate(rng: Rng): Curve {
  const y0 = lerp(0.35, 0.55, rng.next());
  const gain = lerp(0.25, 0.42, rng.next());
  const k = lerp(6, 14, rng.next());
  const t0 = lerp(0.35, 0.65, rng.next());
  return (t) => y0 + gain / (1 + Math.exp(-k * (t - t0)));
}

/** Concave, increasing, saturating: a Pareto frontier in quality terms. */
export function frontier(rng: Rng): Curve {
  const y0 = lerp(0.3, 0.45, rng.next());
  const y1 = lerp(0.85, 0.97, rng.next());
  const k = lerp(2.5, 5, rng.next());
  return (t) => y0 + (y1 - y0) * (1 - Math.exp(-k * t));
}

/** Random walk with drift and jitter: a training curve having a bad day. */
export function walk(rng: Rng, n: number): number[] {
  const drift = lerp(-0.5, -0.15, rng.next());
  const sigma = lerp(0.02, 0.06, rng.next());
  const start = lerp(0.8, 1.4, rng.next());
  const out: number[] = [];
  let y = start;
  for (let i = 0; i < n; i++) {
    out.push(y);
    y += drift / n + sigma * (rng.next() * 2 - 1);
  }
  return out;
}

/** Evaluation grid in t, uniform; log axes space the x values, not t. */
export function tGrid(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(n === 1 ? 0 : i / (n - 1));
  return out;
}

/** Map t in [0, 1] onto a data range, in log space for log axes. */
export function tToX(t: number, range: [number, number], log: boolean): number {
  if (log) {
    const la = Math.log10(range[0]);
    const lb = Math.log10(range[1]);
    return Math.pow(10, lerp(la, lb, t));
  }
  return lerp(range[0], range[1], t);
}

/**
 * Loose nice-number tick labeling.
 * Heckbert, "Nice numbers for graph labels", Graphics Gems (1990).
 */
export function niceTicks(lo: number, hi: number, target = 5): {
  lo: number; hi: number; ticks: number[]; step: number;
} {
  if (hi - lo < 1e-12) hi = lo + 1;
  const range = niceNum(hi - lo, false);
  const step = niceNum(range / (target - 1), true);
  const graphLo = Math.floor(lo / step) * step;
  const graphHi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  const n = Math.round((graphHi - graphLo) / step);
  for (let i = 0; i <= n; i++) ticks.push(roundTo(graphLo + i * step, step));
  return { lo: graphLo, hi: graphHi, ticks, step };
}

function niceNum(x: number, round: boolean): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

/** Snap away float dust so ticks serialize as 0.3, not 0.30000000000000004. */
function roundTo(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const r = Number(v.toFixed(Math.min(12, decimals + 1)));
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Log range with power-of-ten ticks and 2..9 minor ticks. snap widens the
 * range to whole decades; unsnapped keeps the data range and only extends
 * downward when no decade falls inside, so tight data stays tight.
 */
export function logTicks(lo: number, hi: number, snap = true): {
  lo: number; hi: number; ticks: number[]; minor: number[];
} {
  let a: number;
  let b: number;
  if (snap) {
    const la = Math.floor(Math.log10(lo));
    let lb = Math.ceil(Math.log10(hi));
    if (lb <= la) lb = la + 1;
    a = Math.pow(10, la);
    b = Math.pow(10, lb);
  } else {
    a = lo;
    b = Math.max(hi, lo * 1.5);
    const first = Math.pow(10, Math.ceil(Math.log10(a) - 1e-9));
    if (first > b) a = Math.pow(10, Math.floor(Math.log10(a)));
  }
  const ticks: number[] = [];
  const minor: number[] = [];
  const eLo = Math.ceil(Math.log10(a) - 1e-9);
  const eHi = Math.floor(Math.log10(b) + 1e-9);
  for (let e = eLo - 1; e <= eHi; e++) {
    const decade = Math.pow(10, e);
    if (decade >= a * 0.999999 && decade <= b * 1.000001) ticks.push(decade);
    for (let m = 2; m <= 9; m++) {
      const v = m * decade;
      if (v > a && v < b) minor.push(v);
    }
  }
  return { lo: a, hi: b, ticks, minor };
}

/** Relative error half-width; the gag shrinks it as confidence grows. */
export function errorHalfWidth(confidence: number): number {
  return lerp(0.35, 0.01, confidence);
}

/**
 * Where ours lands relative to the best baseline. margin is
 * lerp(−0.1, 0.6, confidence) × spread in the winning direction, so low
 * confidence lets ours lose while still bold and starred.
 */
export function oursMargin(confidence: number, spread: number): number {
  return lerp(-0.1, 0.6, confidence) * spread;
}

/**
 * Enforce the confidence gag exactly: below 0.2 the ours interval must
 * overlap the best baseline's; above 0.9 it must not. Returns an adjusted
 * ours value at the comparison point.
 */
export function enforceGag(
  ours: number,
  best: number,
  confidence: number,
  betterIs: "higher" | "lower",
  positiveOnly: boolean,
): number {
  const h = errorHalfWidth(confidence);
  const sign = betterIs === "higher" ? 1 : -1;
  const gapNow = sign * (ours - best);
  const touch = h * (Math.abs(ours) + Math.abs(best));
  let out = ours;
  if (confidence < 0.2 && Math.abs(gapNow) > touch * 0.8) {
    // Pull toward the baseline, keeping whether ours wins or loses.
    const dir = gapNow === 0 ? -1 : Math.sign(gapNow);
    out = best + sign * dir * touch * 0.5;
  } else if (confidence > 0.9 && gapNow < touch * 1.2) {
    out = best + sign * Math.max(touch * 1.6, Math.abs(best) * 0.04);
  }
  if (positiveOnly && out <= 0) out = Math.abs(best) * 0.05 + 1e-6;
  return out;
}
