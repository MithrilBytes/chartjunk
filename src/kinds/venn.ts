/**
 * A venn of dataset overlap: two or three translucent circles, region
 * counts that disagree with the stated total, and one intersection that
 * defers to text. The circles are honest; nothing else is.
 */
import type { Annotation, Axis, Panel, Point, Region } from "../types.js";
import { pickPool } from "../dials.js";
import { SETS_GOBBLE, SETS_PLAIN } from "../vocabulary.js";
import { type PanelCtx, buildLegend, mark } from "./common.js";

const CIRCLE_STEPS = 48;

export function buildVenn(ctx: PanelCtx): Panel {
  const af = ctx.root.fork(`axes:${ctx.p}`);
  const g = ctx.dials.gobbledygook;
  const lf = ctx.root.fork(`layout:${ctx.p}:sets`);
  const three = lf.next() < ctx.dials.density * 0.9;

  const nameA = pickPool(af, SETS_PLAIN, SETS_GOBBLE, g);
  let nameB = pickPool(af, SETS_PLAIN, SETS_GOBBLE, g);
  let nameC = pickPool(af, SETS_PLAIN, SETS_GOBBLE, g);
  if (nameB === nameA) nameB = SETS_PLAIN.find((s) => s !== nameA) ?? "Test";
  if (nameC === nameA || nameC === nameB) {
    nameC = SETS_PLAIN.find((s) => s !== nameA && s !== nameB) ?? "Held-out";
  }

  const cf = ctx.root.fork(`series:${ctx.p}:counts`);
  const counts = Array.from({ length: 7 }, () => 40 + cf.int(760));
  mark(ctx, "counts-drift");

  const circles: { cx: number; cy: number; r: number; label: string }[] = three
    ? [
        { cx: 0.42, cy: 0.6, r: 0.26, label: nameA },
        { cx: 0.62, cy: 0.6, r: 0.26, label: nameB },
        { cx: 0.52, cy: 0.4, r: 0.26, label: nameC },
      ]
    : [
        { cx: 0.4, cy: 0.5, r: 0.28, label: nameA },
        { cx: 0.62, cy: 0.5, r: 0.28, label: nameB },
      ];

  const regions: Region[] = circles.map((c) => ({
    polygon: circlePolygon(c.cx, c.cy, c.r),
    fill: ctx.mono ? "hatch" as const : "shade" as const,
    label: c.label,
  }));

  const annotations: Annotation[] = [];
  const spots: Point[] = three
    ? [
        { x: 0.32, y: 0.66 }, { x: 0.72, y: 0.66 }, { x: 0.52, y: 0.28 },
        { x: 0.52, y: 0.68 }, { x: 0.4, y: 0.46 }, { x: 0.64, y: 0.46 },
        { x: 0.52, y: 0.52 },
      ]
    : [
        { x: 0.3, y: 0.5 }, { x: 0.72, y: 0.5 }, { x: 0.51, y: 0.5 },
      ];
  spots.forEach((at, i) => {
    annotations.push({ type: "text", at, text: String(counts[i % counts.length]) });
  });

  const sf = ctx.root.fork(`annotations:${ctx.p}`);
  const seeSpot = sf.int(spots.length);
  if (ctx.fired.has("see-text") && ctx.p === 0) {
    const at = spots[Math.min(seeSpot, spots.length - 1)];
    annotations.push({ type: "text", at: { x: at.x + 0.03, y: at.y - 0.06 }, text: "see text", boxed: true });
    mark(ctx, "see-text");
  }

  const unit: Axis = {
    label: "",
    scale: "linear",
    range: [0, 1],
    ticks: [0, 0.5, 1],
    betterIs: af.chance(0.5) ? "higher" : "lower",
  };
  return {
    kind: "venn",
    x: { ...unit },
    y: { ...unit, betterIs: af.chance(0.5) ? "higher" : "lower" },
    series: [],
    regions,
    annotations,
    legend: buildLegend(ctx, []),
  };
}

function circlePolygon(cx: number, cy: number, r: number): Point[] {
  const pts: Point[] = [];
  for (let k = 0; k < CIRCLE_STEPS; k++) {
    const a = (2 * Math.PI * k) / CIRCLE_STEPS;
    pts.push({
      x: Number((cx + r * Math.cos(a)).toFixed(5)),
      y: Number((cy + r * Math.sin(a)).toFixed(5)),
    });
  }
  return pts;
}
