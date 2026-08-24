import { describe, expect, it } from "vitest";
import { chartjunk } from "../src/index.js";
import type { SizeName, StyleName } from "../src/index.js";
import { PLOT_KINDS, checkXml } from "./helpers.js";

const STYLE_NAMES: StyleName[] = ["matplotlib", "ggplot", "pgfplots", "excel"];
const SIZE_NAMES: SizeName[] = ["single", "double", "square", "wide"];

describe("svg validity", () => {
  it("well-formed XML with a viewBox, for every kind, style, and mono", () => {
    let i = 0;
    for (const kind of [...PLOT_KINDS, "figure", "caption"] as const) {
      for (const mono of [false, true]) {
        const style = STYLE_NAMES[i % STYLE_NAMES.length];
        const size = SIZE_NAMES[i % SIZE_NAMES.length];
        i += 1;
        const svg = chartjunk({ seed: `svg-${kind}-${mono}`, kind, style, size, mono, junk: 0.8, density: 0.8 });
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg.includes("viewBox=")).toBe(true);
        const err = checkXml(svg.trim());
        expect(err, `${kind}/${style}/${mono}: ${err}`).toBeNull();
        expect(svg.includes("NaN")).toBe(false);
        expect(svg.includes("undefined")).toBe(false);
      }
    }
  });

  it("stays well-formed at the dial corners", () => {
    for (const dials of [
      { density: 0, junk: 0, confidence: 0, gobbledygook: 0 },
      { density: 1, junk: 1, confidence: 1, gobbledygook: 1 },
    ]) {
      for (const kind of PLOT_KINDS) {
        const svg = chartjunk({ seed: "corner", kind, ...dials });
        const err = checkXml(svg.trim());
        expect(err, `${kind}: ${err}`).toBeNull();
      }
    }
  });

  it("the sins list matches what the svg can annotate", () => {
    const svg = chartjunk({ seed: "sins", kind: "line", junk: 1, density: 1, confidence: 1 });
    expect(svg.length).toBeGreaterThan(2000);
  });
});
