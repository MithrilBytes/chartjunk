/**
 * Machinery shared by the kind builders: forked streams per component,
 * axis assembly, series scaffolding, error bars, and legends.
 *
 * The discipline throughout: every stream draws a fixed number of values
 * no matter where the dials sit, so sweeping one dial never reshuffles
 * anything another stream produced.
 */
import type {
  ArtifactId, Axis, Dash, Legend, LegendEntry, Marker, PanelKind, Point, Role, Series, StyleName,
} from "../types.js";
import type { DialValues } from "../dials.js";
import { pickPool } from "../dials.js";
import { lerp, type Rng } from "../rng.js";
import {
  errorHalfWidth, logTicks, niceTicks, oursMargin,
} from "../shapes.js";
import {
  ABLATION_TARGETS, BASELINES_GOBBLE, BASELINES_PLAIN, ORPHANS_GOBBLE, ORPHANS_PLAIN,
  X_GOBBLE, X_PLAIN, Y_GOBBLE, Y_PLAIN,
  type AxisWord, type ResolvedVocab, citeNumber, pickAxisWord, pickUnit,
} from "../vocabulary.js";
import { STYLES, seriesStyle } from "../styles.js";

export interface PanelCtx {
  root: Rng;
  /** Panel index within the figure. */
  p: number;
  kind: PanelKind;
  dials: DialValues;
  style: StyleName;
  mono: boolean;
  /** What the catalogue decided; builders consult this. */
  fired: Set<ArtifactId>;
  /** What actually landed on the figure; builders add to this. */
  applied: Set<ArtifactId>;
  vocab: ResolvedVocab;
  /** Method acronym for "(ours)". */
  method: string;
  /** Reused labels and styles when panels share a legend. */
  shared?: SeriesPlan[];
  /** Shared axis words in multi-panel figures. */
  sharedWords?: AxisWords;
  /** true for every panel but the one carrying the shared legend. */
  suppressLegend?: boolean;
}

export function mark(ctx: PanelCtx, id: ArtifactId): void {
  ctx.applied.add(id);
}

/* ------------------------------------------------------------------ */
/* Axes                                                                */
/* ------------------------------------------------------------------ */

export interface AxisWords {
  x: AxisWord;
  xUnit?: string;
  xDir: "higher" | "lower";
  y: AxisWord;
  yUnit?: string;
  yDir: "higher" | "lower";
  xLog: boolean;
  yLog: boolean;
}

/**
 * Choose axis words, directions, units, and scales for one panel. Scale
 * decisions honor the log-axis artifact: y goes log when the word
 * tolerates it, x only from density 0.6 up.
 */
export function chooseAxisWords(ctx: PanelCtx): AxisWords {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const yDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const xDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const y = pickAxisWord(af, Y_PLAIN, Y_GOBBLE, yDir, g);
  const x = pickAxisWord(af, X_PLAIN, X_GOBBLE, xDir, g);
  const yUnit = pickUnit(af, y, g);
  const xUnit = pickUnit(af, x, g);
  const xLogCoin = af.next();
  const canLog = ctx.fired.has("log-axis");
  const yLog = canLog && y.logOk === true;
  const xLog = canLog && ctx.dials.density >= 0.6 && xLogCoin < 0.8 && x.logOk === true;
  return { x, xUnit, xDir, y, yUnit, yDir, xLog, yLog };
}

/** Plausible x range from the word's hint, snapped to decades when log. */
export function xRange(words: AxisWords): [number, number] {
  const hint = words.x.range ?? [0, 10];
  if (!words.xLog) return hint;
  const lo = hint[0] > 0 ? hint[0] : Math.max(1, hint[1] / 1000);
  const t = logTicks(lo, Math.max(hint[1], lo * 10));
  return [t.lo, t.hi];
}

export interface BuiltAxis {
  axis: Axis;
  /** Map a data value to [0, 1] along the axis. */
  unit: (v: number) => number;
}

export function buildAxis(
  word: AxisWord,
  unitLabel: string | undefined,
  dir: "higher" | "lower",
  log: boolean,
  dataLo: number,
  dataHi: number,
): Axis {
  if (log) {
    const t = logTicks(Math.max(dataLo, 1e-12), Math.max(dataHi, 1e-11), false);
    return {
      label: word.label,
      unit: unitLabel,
      scale: "log",
      range: [t.lo, t.hi],
      ticks: t.ticks,
      minorTicks: t.minor,
      betterIs: dir,
    };
  }
  const t = niceTicks(dataLo, dataHi);
  return {
    label: word.label,
    unit: unitLabel,
    scale: "linear",
    range: [t.lo, t.hi],
    ticks: t.ticks,
    betterIs: dir,
  };
}

/** Append the redundant note the log-scale-note artifact asks for. */
export function applyLogNote(ctx: PanelCtx, axis: Axis): void {
  if (ctx.fired.has("log-scale-note") && axis.scale === "log") {
    axis.label = `${axis.label} (log scale)`;
    mark(ctx, "log-scale-note");
  }
}

/* ------------------------------------------------------------------ */
/* Series scaffolding                                                  */
/* ------------------------------------------------------------------ */

export interface SeriesPlan {
  id: string;
  label: string;
  role: Role;
  marker: Marker;
  dash: Dash;
  color: number;
  bold: boolean;
}

/** Series count from density: one at 0, five at 1. */
export function seriesCount(ctx: PanelCtx): number {
  const lf = ctx.root.fork(`layout:${ctx.p}`);
  const wobble = lf.next();
  return Math.min(5, 1 + Math.floor(ctx.dials.density * 4 + wobble * 0.999));
}

/** Point count from density: exactly six at 0, dense at 1. */
export function pointCount(ctx: PanelCtx): number {
  const lf = ctx.root.fork(`layout:${ctx.p}:points`);
  const wobble = lf.next();
  return 6 + Math.round(ctx.dials.density * (34 + wobble * 10));
}

/**
 * Labels, roles, and style slots for n series. Ours is always slot 0 in
 * construction order; the legend shuffles later. Fixed draws throughout.
 */
export function planSeries(ctx: PanelCtx, n: number): SeriesPlan[] {
  if (ctx.shared) return ctx.shared.slice(0, Math.max(1, n));
  const sf = ctx.root.fork(`series:${ctx.p}:labels`);
  const g = ctx.dials.gobbledygook;
  const plans: SeriesPlan[] = [];
  const oursStyle = seriesStyle(ctx.style, ctx.mono, 0, "ours");
  plans.push({
    id: `s${ctx.p}-0`,
    label: `${ctx.method} (ours)`,
    role: "ours",
    bold: true,
    ...oursStyle,
  });
  mark(ctx, "ours-bold");
  // Draw a full hand of baseline labels regardless of n.
  const plainPicks = sf.sample(BASELINES_PLAIN, 4);
  const gobblePicks = sf.sample(BASELINES_GOBBLE, 4);
  const coins = [sf.next(), sf.next(), sf.next(), sf.next()];
  const cites = [citeNumber(sf, ctx.vocab), citeNumber(sf, ctx.vocab), citeNumber(sf, ctx.vocab), citeNumber(sf, ctx.vocab)];
  const ablation = sf.pick(ABLATION_TARGETS);
  for (let i = 1; i < n; i++) {
    const j = i - 1;
    // The label may come from either pool, but the role always comes from
    // the plain draw: whether a series is an oracle or gets error bars
    // must not move with the gobbledygook dial.
    const plainWord = plainPicks[j % plainPicks.length];
    const gobbleWord = gobblePicks[j % gobblePicks.length];
    const word = coins[j] < g ? gobbleWord : plainWord;
    const role = plainWord.role;
    let label = word.label;
    if (word.cite) label = label.replace("[n]", `[${cites[j]}]`);
    if (word.ablation) label = label.replace("X", ablation);
    const style = seriesStyle(ctx.style, ctx.mono, i, role);
    plans.push({ id: `s${ctx.p}-${i}`, label, role, bold: false, ...style });
  }
  return plans;
}

/* ------------------------------------------------------------------ */
/* Error bars and the confidence machinery                             */
/* ------------------------------------------------------------------ */

/** Attach lo/hi to every point; relative width from confidence. */
export function attachErrors(ctx: PanelCtx, series: Series[], log: boolean): void {
  if (!ctx.fired.has("error-bars")) return;
  const h0 = errorHalfWidth(ctx.dials.confidence);
  for (const s of series) {
    if (s.role === "reference") continue;
    const ef = ctx.root.fork(`errors:${ctx.p}:${s.id}:bars`);
    for (const pt of s.points) {
      const h = h0 * (1 + 0.35 * (ef.next() - 0.5));
      if (log) {
        pt.lo = pt.y / (1 + h);
        pt.hi = pt.y * (1 + h);
      } else {
        pt.lo = pt.y - h * Math.abs(pt.y);
        pt.hi = pt.y + h * Math.abs(pt.y);
      }
    }
  }
  mark(ctx, "error-bars");
}

/** Best baseline value and spread, with a floor so margins never vanish. */
export function baselineStats(values: number[], dir: "higher" | "lower"): { best: number; spread: number } {
  const best = dir === "higher" ? Math.max(...values) : Math.min(...values);
  const spread = values.length > 1
    ? Math.max(...values) - Math.min(...values)
    : 0;
  return { best, spread: Math.max(spread, Math.abs(best) * 0.25, 1e-6) };
}

/** Signed offset for ours at the comparison point. */
export function oursDelta(ctx: PanelCtx, best: number, spread: number, dir: "higher" | "lower"): number {
  const m = oursMargin(ctx.dials.confidence, spread);
  return (dir === "higher" ? 1 : -1) * m;
}

/**
 * Envelope bounds for the y axis. The caller passes every value the axis
 * must cover including the extremes ours can reach at any confidence, so
 * the resulting range never moves when confidence sweeps. The margins
 * cover the widest possible error bars (relative half-width 0.35).
 */
export function envelope(values: number[], log: boolean): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (log) {
    return [Math.max(min * 0.6, 1e-12), max * 1.5];
  }
  const lo = min - Math.abs(min) * 0.45;
  const hi = max + Math.abs(max) * 0.45;
  const span = hi - lo || 1;
  return [lo - span * 0.03, hi + span * 0.03];
}

/* ------------------------------------------------------------------ */
/* Legends                                                             */
/* ------------------------------------------------------------------ */

export function buildLegend(ctx: PanelCtx, series: Series[]): Legend {
  const lf = ctx.root.fork(`legend:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const labeled = series.filter((s) => s.label !== "");
  const ours = labeled.filter((s) => s.role === "ours");
  const rest = lf.sample(labeled.filter((s) => s.role !== "ours"), labeled.length);
  const oursFirst = lf.chance(0.6);
  const oursAt = lf.int(rest.length + 1);
  const insertAt = lf.int(Math.max(1, labeled.length + 1));
  const orphanWord = pickPool(lf, ORPHANS_PLAIN, ORPHANS_GOBBLE, g);
  const orphanCite = citeNumber(lf, ctx.vocab);
  const ordered = oursFirst ? [...ours, ...rest] : spliceIn(rest, oursAt, ours);
  const entries: LegendEntry[] = ordered.map((s) => ({
    label: s.label,
    marker: s.marker,
    dash: s.dash,
    color: s.color,
    seriesId: s.id,
  }));
  // Exactly one orphan per figure: it rides the first panel's legend.
  if (ctx.fired.has("orphan-legend") && !ctx.suppressLegend && ctx.p === 0) {
    const slot = seriesStyle(ctx.style, ctx.mono, labeled.length, "baseline");
    entries.splice(Math.min(insertAt, entries.length), 0, {
      label: orphanWord.replace("[n]", `[${orphanCite}]`),
      marker: slot.marker,
      dash: slot.dash,
      color: slot.color,
      seriesId: null,
    });
    mark(ctx, "orphan-legend");
  }
  const spec = STYLES[ctx.style];
  let position: Legend["position"] = spec.legendDefault;
  if (ctx.fired.has("legend-over-data")) {
    position = "over-data";
    if (!ctx.suppressLegend) mark(ctx, "legend-over-data");
  }
  return { position, entries: ctx.suppressLegend ? [] : entries };
}

function spliceIn<T>(arr: T[], at: number, items: T[]): T[] {
  const out = arr.slice();
  out.splice(at, 0, ...items);
  return out;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Per-point multiplicative jitter, drawn from one errors fork. */
export function jitter(rng: Rng, amount: number): number {
  return 1 + amount * (rng.next() * 2 - 1);
}

export function makePoint(x: number, y: number): Point {
  return { x, y };
}

export function ramp(t: number): number {
  return Math.pow(t, 0.7);
}

export { lerp };
