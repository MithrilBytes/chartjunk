/**
 * Word pools. Two pools per slot; the second pool's draw probability is the
 * gobbledygook dial, and above 0.7 the prefixes stack. The invented names
 * (Wumpin, Nozzle, Snaggle, Quabosh) are kept from sylvanfranklin/nonsense
 * by way of theorem-ipsum, so shared vocabularies stay coherent.
 */
import type { Rng } from "./rng.js";
import { pickPool } from "./dials.js";

export interface AxisWord {
  label: string;
  /** Preferred unit, used most of the time when present. */
  unit?: string;
  /** Fixed direction; absent means the word tolerates either. */
  betterIs?: "higher" | "lower";
  /** Whether a log scale is craftsmanlike for this quantity. */
  logOk?: boolean;
  /** Plausible x range; log axes snap it to whole decades. */
  range?: [number, number];
}

/** Injected by callers; theorem-ipsum passes its paper's palette. */
export interface Vocabulary {
  nouns?: string[];
  adjectives?: string[];
  eponyms?: string[];
  method?: string;
  citations?: number[];
}

export const X_PLAIN: readonly AxisWord[] = [
  { label: "Epoch", range: [0, 100] },
  { label: "Iteration", logOk: true, range: [0, 5000] },
  { label: "n", logOk: true, range: [10, 100000] },
  { label: "d", logOk: true, range: [1, 1000] },
  { label: "Wall-clock time", unit: "s", logOk: true, range: [0, 120] },
  { label: "Batch size", logOk: true, range: [1, 1000] },
  { label: "Sequence length", logOk: true, range: [10, 10000] },
  { label: "λ", logOk: true, range: [0.0001, 1] },
  { label: "Temperature", range: [0, 2] },
  { label: "Sparsity", range: [0, 1] },
];

export const X_GOBBLE: readonly AxisWord[] = [
  { label: "Effective quasi-dimension", logOk: true, range: [1, 1000] },
  { label: "Renormalized budget", range: [0, 1] },
  { label: "Wumpin depth", range: [0, 12] },
  { label: "Nozzle index", range: [0, 8] },
];

export const Y_PLAIN: readonly AxisWord[] = [
  { label: "Loss", betterIs: "lower", logOk: true },
  { label: "Accuracy", unit: "%", betterIs: "higher" },
  { label: "Relative error", betterIs: "lower", logOk: true },
  { label: "Runtime", unit: "s", betterIs: "lower", logOk: true },
  { label: "Throughput", betterIs: "higher", logOk: true },
  { label: "Perplexity", betterIs: "lower", logOk: true },
  { label: "‖x − x*‖₂", betterIs: "lower", logOk: true },
  { label: "Speedup", unit: "×", betterIs: "higher" },
  { label: "Energy", betterIs: "lower" },
];

export const Y_GOBBLE: readonly AxisWord[] = [
  { label: "Pseudo-regret", logOk: true },
  { label: "Hyper-fidelity" },
  { label: "Normalized nonsense" },
  { label: "Coefficient of Wumpin" },
];

export const UNITS_PLAIN: readonly string[] = [
  "s", "ms", "%", "a.u.", "dB", "nats", "×10³", "normalized",
];

export const UNITS_GOBBLE: readonly string[] = [
  "μs / kg²", "a.u.²", "dimensionless, allegedly",
];

export interface BaselineWord {
  label: string;
  role: "baseline" | "oracle" | "reference";
  /** Replace [n] with a citation number. */
  cite?: boolean;
  /** Replace X with an ablation target. */
  ablation?: boolean;
}

export const BASELINES_PLAIN: readonly BaselineWord[] = [
  { label: "Baseline", role: "baseline" },
  { label: "Prior work [n]", role: "baseline", cite: true },
  { label: "SOTA [n]", role: "baseline", cite: true },
  { label: "Random", role: "reference" },
  { label: "Oracle", role: "oracle" },
  { label: "Upper bound", role: "oracle" },
  { label: "Lower bound (theory)", role: "oracle" },
  { label: "Ablation (w/o X)", role: "baseline", ablation: true },
  { label: "Ours (naive)", role: "baseline" },
];

export const BASELINES_GOBBLE: readonly BaselineWord[] = [
  { label: "Wumpin et al. [n]", role: "baseline", cite: true },
  { label: "Snaggle and Quabosh [n]", role: "baseline", cite: true },
  { label: "Renormalized baseline", role: "baseline" },
  { label: "Quasi-SOTA [n]", role: "baseline", cite: true },
];

export const ABLATION_TARGETS: readonly string[] = [
  "attention", "momentum", "the prior", "caching", "dropout",
  "the Wumpin term", "warm restarts", "the second stage",
];

export const ORPHANS_PLAIN: readonly string[] = [
  "Ideal", "Baseline (retrained)", "[n] (reproduced)", "Theoretical",
  "Ours (v2)", "Full model",
];

export const ORPHANS_GOBBLE: readonly string[] = [
  "Wumpin (original)", "Hyper-ideal", "Quasi-oracle",
];

export const REGIONS_PLAIN: readonly string[] = [
  "infeasible", "intractable", "unstable", "not converged",
  "requires oracle", "out of memory", "beyond this work",
];

export const REGIONS_GOBBLE: readonly string[] = [
  "quasi-infeasible", "sub-Wumpin regime", "renormalization fails",
];

export const CAPTION_VERBS: readonly string[] = [
  "Comparison of", "Effect of", "Scaling of", "Ablation over", "Sensitivity to",
];

/** Bar-group and heatmap axis naming. */
export const GROUP_AXIS_PLAIN: readonly string[] = ["Dataset", "Benchmark", "Task"];
export const GROUP_AXIS_GOBBLE: readonly string[] = ["Wumpin class", "Regime", "Nozzle family"];

export const GROUPS_PLAIN: readonly string[] = [
  "Synthetic", "Real-world", "Held-out", "Transfer", "Noisy", "Ablated",
];
export const GROUPS_GOBBLE: readonly string[] = [
  "Wumpin-9", "Snaggle-XL", "Quabosh-v2", "Hyper-set", "Nozzle-mini",
];

export const HEATMAP_AXES_PLAIN: readonly [string, string][] = [
  ["Layer", "Head"], ["Depth", "Width"], ["Block", "Expert"], ["Row", "Column"],
];
export const HEATMAP_AXES_GOBBLE: readonly [string, string][] = [
  ["Wumpin index", "Nozzle index"], ["Quasi-layer", "Pseudo-head"],
];

/** Stacked above gobbledygook 0.7. Trailing space means a word prefix. */
export const PREFIXES: readonly string[] = [
  "quasi-", "pseudo-", "hyper-", "renormalized ", "effective ",
];

export const NOUNS: readonly string[] = [
  "embeddings", "estimator", "benchmark", "regime", "operator", "manifold",
  "kernel", "ensemble", "sampler", "objective", "curriculum", "decoder",
];

export const ADJECTIVES: readonly string[] = [
  "sparse", "adversarial", "variational", "convex", "amortized", "spectral",
  "causal", "latent", "stochastic", "hierarchical",
];

export const EPONYMS: readonly string[] = ["Wumpin", "Nozzle", "Snaggle", "Quabosh"];

/** Merge caller-supplied vocabulary over the local pools. */
export interface ResolvedVocab {
  nouns: readonly string[];
  adjectives: readonly string[];
  eponyms: readonly string[];
  method?: string;
  citations?: readonly number[];
}

export function resolveVocab(v?: Vocabulary): ResolvedVocab {
  return {
    nouns: v?.nouns?.length ? v.nouns : NOUNS,
    adjectives: v?.adjectives?.length ? v.adjectives : ADJECTIVES,
    eponyms: v?.eponyms?.length ? v.eponyms : EPONYMS,
    method: v?.method,
    citations: v?.citations,
  };
}

/** A bracketed citation number, from the paper's bibliography when injected. */
export function citeNumber(rng: Rng, vocab: ResolvedVocab): number {
  const local = rng.range(1, 30);
  const idx = rng.next();
  const pool = vocab.citations;
  if (pool && pool.length > 0) return pool[Math.floor(idx * pool.length)];
  return local;
}

/**
 * Axis word for one direction, drawn as a matched pair: the range, log
 * eligibility, and direction always come from the plain draw, and the
 * gobbledygook draw only overrides the display text. Sweeping the dial
 * therefore changes labels, never ticks or scales. Draw counts are fixed.
 */
export function pickAxisPair(
  rng: Rng,
  plain: readonly AxisWord[],
  gobble: readonly AxisWord[],
  dir: "higher" | "lower",
  g: number,
): { base: AxisWord; word: AxisWord } {
  const p = plain.filter((w) => !w.betterIs || w.betterIs === dir);
  const q = gobble.filter((w) => !w.betterIs || w.betterIs === dir);
  const pp = p.length ? p : plain;
  const qq = q.length ? q : gobble;
  const pi = rng.int(pp.length);
  const gi = rng.int(qq.length);
  const coin = rng.next();
  const base = pp[pi];
  if (coin < g && qq.length > 0) {
    const over = qq[gi];
    return {
      base,
      word: {
        label: over.label,
        unit: over.unit ?? base.unit,
        betterIs: base.betterIs,
        logOk: base.logOk,
        range: base.range,
      },
    };
  }
  return { base, word: base };
}

export function pickAxisWord(
  rng: Rng,
  plain: readonly AxisWord[],
  gobble: readonly AxisWord[],
  dir: "higher" | "lower",
  g: number,
): AxisWord {
  return pickAxisPair(rng, plain, gobble, dir, g).word;
}

/** Attach a unit to an axis label; preferred unit most of the time. */
export function pickUnit(rng: Rng, word: AxisWord, g: number): string | undefined {
  const usePreferred = rng.next() < 0.75;
  const attachAnyway = rng.next() < 0.3 + g * 0.4;
  const pooled = pickPool(rng, UNITS_PLAIN, UNITS_GOBBLE, g);
  if (word.unit && usePreferred) return word.unit;
  if (attachAnyway) return pooled;
  return word.unit;
}

/** "sparse Wumpin embeddings", with prefixes stacking above g 0.7. */
export function nounPhrase(rng: Rng, vocab: ResolvedVocab, g: number): string {
  const adj = rng.pick(vocab.adjectives);
  const noun = rng.pick(vocab.nouns);
  const ep = rng.pick(vocab.eponyms);
  const pattern = rng.next();
  const pre1 = rng.pick(PREFIXES);
  const pre2 = rng.pick(PREFIXES);
  const stack1 = rng.next() < g;
  const stack2 = rng.next() < (g > 0.7 ? (g - 0.7) * 2 : 0);
  let head = adj;
  if (stack1 && g > 0.3) head = joinPrefix(pre1, head);
  if (stack2 && pre2 !== pre1) head = joinPrefix(pre2, head);
  if (pattern < 0.35) return `${head} ${noun}`;
  if (pattern < 0.7) return `${head} ${ep} ${noun}`;
  return `${ep} ${noun}`;
}

function joinPrefix(prefix: string, word: string): string {
  return prefix + word;
}

/** 3 to 7 letter method acronym derived from a noun phrase. */
export function acronym(rng: Rng, phrase: string): string {
  const words = phrase.split(/[\s-]+/).filter((w) => /[a-z]/i.test(w));
  const initials = words.map((w) => w[0]);
  const consonants = words
    .flatMap((w) => w.slice(1).split(""))
    .filter((ch) => /[bcdfghjklmnpqrstvwxz]/i.test(ch));
  const pool = [...initials, ...consonants, ...phrase.replace(/[^a-z]/gi, "").split("")];
  const want = rng.range(3, 7);
  const n = Math.min(want, Math.max(3, pool.length));
  let out = pool.slice(0, n).join("").toUpperCase();
  while (out.length < 3) out += "X";
  return out;
}
