/**
 * The four dials, 0 to 1, default 0.5, and the helpers that keep dial
 * sweeps stable: every stream draws a fixed number of values no matter
 * where the dials sit, so moving one dial never reshuffles unrelated parts.
 */
import { lerp, type Rng } from "./rng.js";

export interface DialValues {
  /** Series count, point density, panels, insets, secondary axes. */
  density: number;
  /** Non-data ink: grids, boxes, notes, watermarks, legend placement. */
  junk: number;
  /** How comically far ahead "(ours)" is, and how small the error bars. */
  confidence: number;
  /** Incoherence of the labels; shared with theorem-ipsum's dial. */
  gobbledygook: number;
}

export const DEFAULT_DIALS: DialValues = {
  density: 0.5,
  junk: 0.5,
  confidence: 0.5,
  gobbledygook: 0.5,
};

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function resolveDials(partial?: Partial<DialValues>): DialValues {
  return {
    density: clamp01(partial?.density ?? DEFAULT_DIALS.density),
    junk: clamp01(partial?.junk ?? DEFAULT_DIALS.junk),
    confidence: clamp01(partial?.confidence ?? DEFAULT_DIALS.confidence),
    gobbledygook: clamp01(partial?.gobbledygook ?? DEFAULT_DIALS.gobbledygook),
  };
}

/** Firing probability at the threshold; rises to certainty at dial 1. */
const FIRING_FLOOR = 0.35;

/**
 * Threshold-plus-coin firing rule. Below the threshold the gag never
 * fires; at the threshold it fires FIRING_FLOOR of the time; at dial 1 it
 * always fires, so full-dial figures are exhaustively junked while figures
 * at the same intermediate value still vary by seed. The coin is drawn
 * unconditionally to keep stream consumption fixed.
 */
export function fires(rng: Rng, value: number, threshold: number): boolean {
  const coin = rng.next();
  if (value < threshold) return false;
  const span = 1 - threshold;
  const p = span <= 0 ? 1 : lerp(FIRING_FLOOR, 1, (value - threshold) / span);
  return coin < p;
}

/**
 * Pick from the plain or the gobbledygook pool with probability g of the
 * latter. Both indexes and the coin are drawn unconditionally so a
 * gobbledygook sweep changes only the text, never later draws.
 */
export function pickPool<T>(rng: Rng, plain: readonly T[], gobble: readonly T[], g: number): T {
  const pi = rng.int(plain.length);
  const gi = rng.int(gobble.length);
  const coin = rng.next();
  return coin < g && gobble.length > 0 ? gobble[gi] : plain[pi];
}

export { lerp };
