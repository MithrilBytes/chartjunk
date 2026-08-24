/**
 * The confidence gag, exactly: below 0.2 the ours error interval overlaps
 * the best baseline's; above 0.9 it does not.
 */
import { describe, expect, it } from "vitest";
import { generateFigure } from "../src/index.js";
import type { Panel, Point, Series } from "../src/index.js";

function bestBaseline(panel: Panel, at: (s: Series) => Point): Series {
  const candidates = panel.series.filter((s) => s.role === "baseline" || s.role === "oracle");
  const better = panel.y.betterIs;
  return candidates.reduce((a, b) =>
    (better === "higher" ? at(b).y > at(a).y : at(b).y < at(a).y) ? b : a);
}

function overlaps(a: Point, b: Point): boolean {
  const aLo = a.lo ?? a.y;
  const aHi = a.hi ?? a.y;
  const bLo = b.lo ?? b.y;
  const bHi = b.hi ?? b.y;
  return aLo <= bHi && bLo <= aHi;
}

function checkKind(kind: "line" | "bar", confidence: number, wantOverlap: boolean): void {
  for (let i = 0; i < 15; i++) {
    const fig = generateFigure({ seed: `gag-${kind}-${i}`, kind, confidence });
    const panel = fig.panels[0];
    const ours = panel.series.find((s) => s.role === "ours");
    expect(ours).toBeDefined();
    if (!ours) continue;
    const baselines = panel.series.filter((s) => s.role === "baseline" || s.role === "oracle");
    expect(baselines.length).toBeGreaterThan(0);
    if (kind === "line") {
      const last = (s: Series): Point => s.points[s.points.length - 1];
      const best = bestBaseline(panel, last);
      expect(
        overlaps(last(ours), last(best)),
        `${fig.seed}: ours ${JSON.stringify(last(ours))} vs ${best.label} ${JSON.stringify(last(best))}`,
      ).toBe(wantOverlap);
    } else {
      for (let gI = 0; gI < ours.points.length; gI++) {
        const at = (s: Series): Point => s.points[gI];
        const best = bestBaseline(panel, at);
        expect(
          overlaps(at(ours), at(best)),
          `${fig.seed} group ${gI}`,
        ).toBe(wantOverlap);
      }
    }
  }
}

describe("the confidence gag", () => {
  it("overlaps at confidence 0.1", () => {
    checkKind("line", 0.1, true);
    checkKind("bar", 0.1, true);
  });

  it("separates at confidence 0.95", () => {
    checkKind("line", 0.95, false);
    checkKind("bar", 0.95, false);
  });

  it("ours can lose outright at confidence 0", () => {
    let losses = 0;
    for (let i = 0; i < 40; i++) {
      const fig = generateFigure({ seed: `loser-${i}`, kind: "line", confidence: 0 });
      const panel = fig.panels[0];
      const ours = panel.series.find((s) => s.role === "ours");
      const baselines = panel.series.filter((s) => s.role === "baseline" || s.role === "oracle");
      if (!ours || baselines.length === 0) continue;
      const last = (s: Series): Point => s.points[s.points.length - 1];
      const better = panel.y.betterIs;
      const bestVal = better === "higher"
        ? Math.max(...baselines.map((s) => last(s).y))
        : Math.min(...baselines.map((s) => last(s).y));
      const oursWins = better === "higher" ? last(ours).y > bestVal : last(ours).y < bestVal;
      if (!oursWins) losses += 1;
      expect(ours.bold).toBe(true);
    }
    expect(losses).toBeGreaterThan(10);
  });
});
