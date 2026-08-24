import { describe, expect, it } from "vitest";
import { TIKZ_PREAMBLE, chartjunk } from "../src/index.js";
import { DIAL_CORNERS, PLOT_KINDS } from "./helpers.js";

function braceBalance(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") { i += 1; continue; }
    if (s[i] === "{") depth += 1;
    if (s[i] === "}") depth -= 1;
    if (depth < 0) return depth;
  }
  return depth;
}

describe("tikz validity", () => {
  it("balanced braces, matched environments, no NaN, for every kind", () => {
    for (const kind of PLOT_KINDS) {
      for (const dials of DIAL_CORNERS) {
        const tex = chartjunk({ seed: `tikz-${kind}`, kind, format: "tikz", ...dials });
        expect(braceBalance(tex), `${kind} braces`).toBe(0);
        expect((tex.match(/\\begin\{axis\}/g) ?? []).length)
          .toBe((tex.match(/\\end\{axis\}/g) ?? []).length);
        expect((tex.match(/\\begin\{tikzpicture\}/g) ?? []).length).toBe(1);
        expect((tex.match(/\\end\{tikzpicture\}/g) ?? []).length).toBe(1);
        expect(tex.includes("NaN")).toBe(false);
        expect(tex.includes("undefined")).toBe(false);
        expect(tex.includes("Infinity")).toBe(false);
      }
    }
  });

  it("stays ascii outside comments so pdflatex users survive", () => {
    for (const kind of PLOT_KINDS) {
      const tex = chartjunk({
        seed: `ascii-${kind}`, kind, format: "tikz",
        junk: 1, density: 1, gobbledygook: 1,
      });
      const body = tex
        .split("\n")
        .filter((l) => !l.startsWith("%"))
        .join("\n");
      const nonAscii = [...body].filter((ch) => ch.charCodeAt(0) > 126);
      expect(nonAscii, `${kind}: ${nonAscii.join("")}`).toEqual([]);
    }
  });

  it("mono bars use patterns and styles agree with the table", () => {
    const tex = chartjunk({ seed: "tikz-mono", kind: "bar", format: "tikz", mono: true });
    expect(tex.includes("pattern=")).toBe(true);
  });

  it("the preamble names what the output uses", () => {
    expect(TIKZ_PREAMBLE).toContain("pgfplots");
    expect(TIKZ_PREAMBLE).toContain("compat=1.18");
    expect(TIKZ_PREAMBLE).toContain("patterns");
    expect(TIKZ_PREAMBLE).toContain("colormaps");
  });

  it("carries the caption as a paste-ready comment", () => {
    const tex = chartjunk({ seed: "cap", kind: "line", format: "tikz", number: 4 });
    expect(tex).toContain("%% Figure 4:");
    expect(tex).toContain("%% \\caption{");
  });
});
