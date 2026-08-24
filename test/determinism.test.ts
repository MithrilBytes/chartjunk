import { describe, expect, it } from "vitest";
import { chartjunk, generateFigure } from "../src/index.js";
import { PLOT_KINDS } from "./helpers.js";

describe("determinism", () => {
  it("same seed, same bytes, every format and kind", () => {
    for (const kind of [...PLOT_KINDS, "figure", "caption"] as const) {
      for (const seed of ["alpha", 42, "figure-7"]) {
        for (const format of ["svg", "json"] as const) {
          const a = chartjunk({ seed, kind, format });
          const b = chartjunk({ seed, kind, format });
          expect(a, `${kind}/${seed}/${format}`).toBe(b);
        }
      }
    }
  });

  it("same seed, same bytes, at dial extremes", () => {
    for (const dials of [{ density: 0, junk: 0, confidence: 0, gobbledygook: 0 }, { density: 1, junk: 1, confidence: 1, gobbledygook: 1 }]) {
      const a = chartjunk({ seed: "corner", ...dials });
      const b = chartjunk({ seed: "corner", ...dials });
      expect(a).toBe(b);
    }
  });

  it("100 seeds all differ", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(chartjunk({ seed: `distinct-${i}`, format: "svg" }));
    }
    expect(seen.size).toBe(100);
  });

  it("the IR records the seed as a string", () => {
    expect(generateFigure({ seed: 7 }).seed).toBe("7");
    expect(generateFigure({ seed: "seven" }).seed).toBe("seven");
  });
});
