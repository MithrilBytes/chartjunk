/**
 * Grouped bars, methods by datasets: error bars, significance stars, a bold
 * "(ours)" that wins by exactly the margin confidence buys, and the broken
 * or zero-suppressed y axis when the dials ask for it.
 */
import type { Annotation, Axis, Panel, Series } from "../types.js";
import { enforceGag, niceTicks } from "../shapes.js";
import { pickPool } from "../dials.js";
import { starCount } from "../artifacts.js";
import {
  GROUPS_GOBBLE, GROUPS_PLAIN, GROUP_AXIS_GOBBLE, GROUP_AXIS_PLAIN,
  Y_GOBBLE, Y_PLAIN, pickAxisWord, pickUnit,
} from "../vocabulary.js";
import {
  type PanelCtx, attachErrors, baselineStats, buildLegend, jitter, mark,
  oursDelta, planSeries, seriesCount,
} from "./common.js";

export function buildBar(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  // Fixed draws, then shared words override when panels share a legend.
  const drawnDir: "higher" | "lower" = af.chance(0.5) ? "higher" : "lower";
  const drawnWord = pickAxisWord(af, Y_PLAIN, Y_GOBBLE, drawnDir, g);
  const drawnUnit = pickUnit(af, drawnWord, g);
  const yDir = ctx.sharedWords?.yDir ?? drawnDir;
  const yWord = ctx.sharedWords?.y ?? drawnWord;
  // Values stay in abstract units whatever the label says, so the
  // gobbledygook dial can swap words without moving a single bar. A
  // percent unit would contradict fraction-sized bars; drop it.
  const rawUnit = ctx.sharedWords ? ctx.sharedWords.yUnit : drawnUnit;
  const yUnit = rawUnit === "%" ? undefined : rawUnit;
  const xLabel = pickPool(af, GROUP_AXIS_PLAIN, GROUP_AXIS_GOBBLE, g);

  const lf = ctx.root.fork(`layout:${ctx.p}:groups`);
  const nGroups = Math.min(5, 2 + Math.floor(ctx.dials.density * 3 + lf.next() * 0.999));
  const plainNames = af.sample(GROUPS_PLAIN, 5);
  const gobbleNames = af.sample(GROUPS_GOBBLE, 5);
  const nameCoins = [af.next(), af.next(), af.next(), af.next(), af.next()];
  const groupNames: string[] = [];
  for (let i = 0; i < nGroups; i++) {
    groupNames.push(nameCoins[i] < g ? gobbleNames[i % gobbleNames.length] : plainNames[i]);
  }

  const n = ctx.shared ? ctx.shared.length : seriesCount(ctx);
  const plans = planSeries(ctx, n);

  // A base level per group, method offsets around it.
  const base = 0.35;
  const top = 1.4;
  const vf = ctx.root.fork(`series:${ctx.p}:values`);
  const groupBase: number[] = [];
  for (let gI = 0; gI < 5; gI++) {
    const u = vf.next();
    if (gI < nGroups) groupBase.push(base + (top - base) * (0.25 + 0.6 * u));
  }
  const rows: number[][] = plans.map((_, i) => {
    const pf = ctx.root.fork(`series:${ctx.p}:${i}:params`);
    const out: number[] = [];
    for (let gI = 0; gI < 5; gI++) {
      const u = pf.next();
      if (gI < nGroups) out.push(groupBase[gI] * (1 + 0.22 * (u - 0.5)));
    }
    return out;
  });

  const ef = ctx.root.fork(`errors:${ctx.p}:jitter`);
  for (let i = 1; i < rows.length; i++) {
    for (let gI = 0; gI < nGroups; gI++) rows[i][gI] *= jitter(ef, 0.01);
  }

  // Ours, per group: best baseline plus the margin, gag enforced.
  const spreadByGroup: number[] = [];
  for (let gI = 0; gI < nGroups; gI++) {
    const others = rows.slice(1).map((r) => r[gI]);
    if (others.length === 0) {
      spreadByGroup.push(Math.abs(rows[0][gI]) * 0.25);
      continue;
    }
    const { best, spread } = baselineStats(others, yDir);
    spreadByGroup.push(spread);
    const delta = oursDelta(ctx, best, spread, yDir);
    rows[0][gI] = enforceGag(best + delta, best, ctx.dials.confidence, yDir, true);
  }

  const series: Series[] = plans.map((plan, i) => ({
    id: `s${ctx.p}-${i}`,
    label: plan.label,
    role: plan.role,
    draw: "bar",
    points: rows[i].map((v, gI) => ({ x: gI, y: v })),
    marker: "none",
    dash: plan.dash,
    color: plan.color,
    bold: plan.bold,
  }));
  attachErrors(ctx, series, false);

  // Confidence-independent envelope: bounded by the baselines plus the
  // full margin range, never by where ours actually landed, so sweeping
  // confidence cannot move the ticks. Headroom covers the widest bars.
  let hi = 0;
  for (let gI = 0; gI < nGroups; gI++) {
    const others = rows.slice(1).map((r) => r[gI]);
    const colMax = others.length > 0 ? Math.max(...others) : rows[0][gI];
    hi = Math.max(hi, colMax + spreadByGroup[gI] * 0.85);
  }
  const yt = niceTicks(0, hi * 1.5);
  const y: Axis = {
    label: yWord.label,
    unit: yUnit,
    scale: "linear",
    range: [0, yt.hi],
    ticks: yt.ticks.filter((t) => t >= 0),
    betterIs: yDir,
  };
  const x: Axis = {
    label: xLabel,
    scale: "linear",
    range: [-0.5, nGroups - 0.5],
    ticks: groupNames.map((_, i) => i),
    tickLabels: groupNames,
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };

  const annotations: Annotation[] = [];
  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const starGroup = sf.int(nGroups);
  const seeGroup = sf.int(nGroups);
  const seeSeries = sf.int(Math.max(1, series.length));

  if (ctx.fired.has("significance-stars") && ctx.p === 0) {
    const oursTop = rows[0][starGroup];
    const yAt = Math.min(oursTop * 1.22 + yt.hi * 0.02, yt.hi * 0.97);
    annotations.push({ type: "stars", at: { x: starGroup, y: yAt }, count: starCount(ctx.dials.confidence) });
    mark(ctx, "significance-stars");
  }

  if (ctx.fired.has("gap-arrow") && ctx.p === 0 && series.length >= 2) {
    const others = rows.slice(1).map((r) => r[starGroup]);
    const { best } = baselineStats(others, yDir);
    annotations.push({
      type: "arrow",
      from: { x: starGroup + 0.28, y: best },
      to: { x: starGroup + 0.28, y: rows[0][starGroup] },
      text: "gap",
    });
    mark(ctx, "gap-arrow");
  }

  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const s = series[Math.min(seeSeries, series.length - 1)];
    const pt = s.points[Math.min(seeGroup, s.points.length - 1)];
    annotations.push({ type: "text", at: { x: pt.x, y: pt.y }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }

  // The gap bounds come from the baselines and the worst-case margin, so
  // they hold for every confidence and never swallow a bar or its lo bar.
  let safeMin = Infinity;
  for (let gI = 0; gI < nGroups; gI++) {
    const others = rows.slice(1).map((r) => r[gI]);
    if (others.length === 0) {
      safeMin = Math.min(safeMin, rows[0][gI]);
    } else {
      safeMin = Math.min(safeMin, Math.min(...others) - spreadByGroup[gI] * 0.85);
    }
  }
  if (ctx.fired.has("broken-axis") && safeMin * 0.55 > yt.hi * 0.09) {
    y.broken = [yt.hi * 0.06, safeMin * 0.55];
    mark(ctx, "broken-axis");
  }
  if (ctx.fired.has("zero-suppressed")) {
    y.zeroSuppressed = true;
    mark(ctx, "zero-suppressed");
  }
  if (ctx.fired.has("rotated-ticks")) {
    mark(ctx, "rotated-ticks");
  }

  return {
    kind: "bar",
    x, y,
    series,
    regions: [],
    annotations,
    legend: buildLegend(ctx, series),
  };
}
