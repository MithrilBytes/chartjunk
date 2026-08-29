import { describe, expect, it } from "vitest";
import { generateFigure } from "../src/index.js";
import type { ArtifactId } from "../src/index.js";
import { PLOT_KINDS } from "./helpers.js";

/** What may fire when every dial sits at zero. */
const ALWAYS_ON: Record<string, ArtifactId[]> = {
  line: ["orphan-legend", "ours-bold", "error-bars"],
  scatter: ["orphan-legend", "ours-bold", "r-squared"],
  bar: ["orphan-legend", "ours-bold", "error-bars", "significance-stars"],
  pareto: ["orphan-legend", "ours-bold", "infeasible-region"],
  heatmap: ["colorbar-unit", "confusion-diagonal", "pairwise-grid"],
  phase: ["phase-regions", "hatched-unstable"],
  roc: ["orphan-legend", "ours-bold", "auc-in-legend", "random-diagonal"],
  profile: ["orphan-legend", "ours-bold"],
  bump: ["orphan-legend", "ours-bold", "rank-inverted"],
  radar: ["orphan-legend", "ours-bold", "normalized-to-ours"],
  violin: ["ours-bold", "kde-from-nothing", "significance-stars"],
  pie: ["orphan-legend", "other-largest", "sum-drift", "hole-number"],
  waterfall: ["ours-bold", "contributions-exceed", "significance-stars"],
  area: ["orphan-legend", "other-grows", "indistinct-colors"],
  histogram: ["orphan-legend", "ours-bold", "smoothed-histogram"],
  venn: ["orphan-legend", "counts-drift"],
  panels: [
    "orphan-legend", "ours-bold", "error-bars", "significance-stars", "r-squared",
    "auc-in-legend", "random-diagonal",
  ],
};

describe("fullness", () => {
  it("every kind fires at least 8 artifacts at density = junk = 1", () => {
    for (const kind of PLOT_KINDS) {
      for (let i = 0; i < 10; i++) {
        const fig = generateFigure({ seed: `full-${i}`, kind, density: 1, junk: 1 });
        expect(fig.artifacts.length, `${kind}/full-${i}: ${fig.artifacts.join(", ")}`)
          .toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("only the always-on set fires at zero", () => {
    for (const kind of PLOT_KINDS) {
      for (let i = 0; i < 10; i++) {
        const fig = generateFigure({
          seed: `empty-${i}`, kind, density: 0, junk: 0, confidence: 0, gobbledygook: 0,
        });
        const allowed = new Set(ALWAYS_ON[kind]);
        for (const id of fig.artifacts) {
          expect(allowed.has(id), `${kind}/empty-${i}: unexpected ${id}`).toBe(true);
        }
      }
    }
  });

  it("--no-orphan suppresses the orphan everywhere", () => {
    for (let i = 0; i < 10; i++) {
      const fig = generateFigure({ seed: `no-orphan-${i}`, kind: "line", junk: 1, orphan: false });
      expect(fig.artifacts.includes("orphan-legend")).toBe(false);
      for (const panel of fig.panels) {
        expect(panel.legend.entries.every((e) => e.seriesId !== null)).toBe(true);
      }
    }
  });

  it("the excel style refuses to drop below junk 0.5", () => {
    const clean = generateFigure({ seed: "excel-junk", style: "excel", junk: 0 });
    const half = generateFigure({ seed: "excel-junk", style: "excel", junk: 0.5 });
    expect(JSON.stringify(clean)).toBe(JSON.stringify(half));
  });
});
