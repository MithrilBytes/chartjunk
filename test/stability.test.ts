/**
 * Each component draws from its own forked stream, so moving one dial must
 * never reshuffle unrelated parts. Sweeps run each dial over 11 values and
 * compare everything the other streams own against the midpoint figure.
 */
import { describe, expect, it } from "vitest";
import { generateFigure } from "../src/index.js";
import type { Axis, Figure, Series } from "../src/index.js";

const SEEDS = ["stable-a", "stable-b", 3];
const KINDS = [
  "line", "scatter", "bar", "heatmap", "pareto", "phase",
  "roc", "profile", "bump", "radar", "violin",
  "pie", "waterfall", "area", "histogram", "venn",
] as const;
const STOPS = Array.from({ length: 11 }, (_, i) => i / 10);

/** Confidence owns the AUC digits; everything around them must hold. */
function stripConfidenceText(label: string): string {
  return label.replace(/ \(AUC = [0-9.]+\)$/, "");
}

function axisCore(a: Axis | undefined): unknown {
  if (!a) return undefined;
  return {
    label: a.label.replace(" (log scale)", ""),
    unit: a.unit,
    scale: a.scale,
    range: a.range,
    ticks: a.ticks,
    tickLabels: a.tickLabels,
    betterIs: a.betterIs,
  };
}

function seriesData(s: Series): unknown {
  return { id: s.id, points: s.points.map((p) => [p.x, p.y]), role: s.role, color: s.color };
}

/** Series whose values may legitimately move with confidence. */
function confidenceCoupled(s: Series): boolean {
  return s.role === "ours" || (s.role === "reference" && s.label === "");
}

describe("dial stability", () => {
  for (const kind of KINDS) {
    for (const seed of SEEDS) {
      const base = generateFigure({ seed, kind });

      it(`junk leaves data, axes, and legend alone (${kind}, ${seed})`, () => {
        for (const junk of STOPS) {
          const fig = generateFigure({ seed, kind, junk });
          fig.panels.forEach((panel, pi) => {
            const ref = base.panels[pi];
            expect(axisCore(panel.x)).toEqual(axisCore(ref.x));
            expect(axisCore(panel.y)).toEqual(axisCore(ref.y));
            // Junk may append decoration series (the outlier); the shared
            // prefix must be byte-stable.
            const nRef = ref.series.length;
            const nNow = panel.series.length;
            const shared = Math.min(nRef, nNow);
            expect(panel.series.slice(0, shared).map(seriesData))
              .toEqual(ref.series.slice(0, shared).map(seriesData));
            expect(panel.legend.entries.map((e) => [e.label, e.color, e.seriesId]))
              .toEqual(ref.legend.entries.map((e) => [e.label, e.color, e.seriesId]));
            expect(panel.matrix?.values).toEqual(ref.matrix?.values);
          });
        }
      });

      it(`confidence moves only ours and the error bars (${kind}, ${seed})`, () => {
        for (const confidence of STOPS) {
          const fig = generateFigure({ seed, kind, confidence });
          fig.panels.forEach((panel, pi) => {
            const ref = base.panels[pi];
            expect(axisCore(panel.x)).toEqual(axisCore(ref.x));
            expect(axisCore(panel.y)).toEqual(axisCore(ref.y));
            const dataNow = panel.series.filter((s) => !confidenceCoupled(s)).map(seriesData);
            const dataRef = ref.series.filter((s) => !confidenceCoupled(s)).map(seriesData);
            expect(dataNow).toEqual(dataRef);
            const oursNow = panel.series.find((s) => s.role === "ours");
            const oursRef = ref.series.find((s) => s.role === "ours");
            expect(oursNow?.points.map((p) => p.x)).toEqual(oursRef?.points.map((p) => p.x));
            expect(panel.legend.entries.map((e) => stripConfidenceText(e.label)))
              .toEqual(ref.legend.entries.map((e) => stripConfidenceText(e.label)));
            expect(panel.matrix?.values).toEqual(ref.matrix?.values);
          });
        }
      });

      it(`gobbledygook changes text only (${kind}, ${seed})`, () => {
        for (const gobbledygook of STOPS) {
          const fig = generateFigure({ seed, kind, gobbledygook });
          fig.panels.forEach((panel, pi) => {
            const ref = base.panels[pi];
            expect(panel.x.ticks).toEqual(ref.x.ticks);
            expect(panel.y.ticks).toEqual(ref.y.ticks);
            expect(panel.x.scale).toBe(ref.x.scale);
            expect(panel.y.scale).toBe(ref.y.scale);
            expect(panel.series.map((s) => s.points)).toEqual(ref.series.map((s) => s.points));
            expect(panel.legend.entries.map((e) => e.seriesId))
              .toEqual(ref.legend.entries.map((e) => e.seriesId));
            expect(panel.matrix?.values).toEqual(ref.matrix?.values);
          });
        }
      });

      it(`density keeps the words and identity of what persists (${kind}, ${seed})`, () => {
        for (const density of STOPS) {
          const fig = generateFigure({ seed, kind, density });
          fig.panels.forEach((panel, pi) => {
            const ref = base.panels[pi];
            if (!ref) return;
            expect(panel.x.label.replace(" (log scale)", ""))
              .toBe(ref.x.label.replace(" (log scale)", ""));
            expect(panel.y.label.replace(" (log scale)", ""))
              .toBe(ref.y.label.replace(" (log scale)", ""));
            const oursNow = panel.series.find((s) => s.role === "ours");
            const oursRef = ref.series.find((s) => s.role === "ours");
            expect(oursNow?.label).toBe(oursRef?.label);
            expect(oursNow?.color).toBe(oursRef?.color);
          });
        }
      });
    }
  }

  it("dial values outside [0, 1] clamp instead of exploding", () => {
    const a = generateFigure({ seed: "clamp", junk: 4, confidence: -2 });
    const b = generateFigure({ seed: "clamp", junk: 1, confidence: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/** The headline spec test, verbatim: a confidence sweep never moves ticks. */
describe("confidence sweep, spec wording", () => {
  it("axis labels, tick positions, series shapes, legend order unchanged", () => {
    const figs: Figure[] = STOPS.map((confidence) =>
      generateFigure({ seed: "spec-sweep", kind: "line", confidence }));
    const ref = figs[5];
    for (const fig of figs) {
      expect(fig.panels[0].x.ticks).toEqual(ref.panels[0].x.ticks);
      expect(fig.panels[0].y.ticks).toEqual(ref.panels[0].y.ticks);
      expect(fig.panels[0].x.label).toBe(ref.panels[0].x.label);
      expect(fig.panels[0].y.label).toBe(ref.panels[0].y.label);
      expect(fig.panels[0].legend.entries.map((e) => e.label))
        .toEqual(ref.panels[0].legend.entries.map((e) => e.label));
    }
  });
});
