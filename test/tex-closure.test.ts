/**
 * Closes the text-to-TeX funnel. Every word the generator can ever draw is
 * harvested from the vocabulary and caption sources and pushed through the
 * TeX mappers; every macro those mappings emit must be defined by a package
 * that TIKZ_PREAMBLE actually loads. The preamble is parsed here, so a
 * mapping that needs an unloaded package fails this suite at commit time
 * instead of failing a scheduled compile on the day a seed draws it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIKZ_PREAMBLE, generateFigure, render } from "../src/index.js";
import { needsMath, texText, texify } from "../src/tex.js";
import { DIAL_CORNERS, PLOT_KINDS } from "./helpers.js";

/** Who defines each macro the renderer may emit. "kernel" is plain LaTeX. */
const MACRO_PACKAGE: Record<string, string> = {
  addlegendentry: "pgfplots",
  addlegendimage: "pgfplots",
  addplot: "pgfplots",
  begin: "kernel",
  bfseries: "kernel",
  caption: "kernel",
  cdot: "kernel",
  definecolor: "pgfplots",
  draw: "pgfplots",
  end: "kernel",
  itshape: "kernel",
  lVert: "amsmath",
  lambda: "kernel",
  mathrm: "kernel",
  mu: "kernel",
  node: "pgfplots",
  propto: "kernel",
  rVert: "amsmath",
  scriptsize: "kernel",
  small: "kernel",
  star: "kernel",
  surd: "kernel",
  tau: "kernel",
  textasciicircum: "kernel",
  textasciitilde: "kernel",
  textbf: "kernel",
  textdollar: "kernel",
  textit: "kernel",
  times: "kernel",
  tiny: "kernel",
};

const PROVIDED = new Set([
  "kernel",
  ...[...TIKZ_PREAMBLE.matchAll(/\\usepackage\{(\w+)\}/g)].map((m) => m[1]),
]);

const PRINTABLE = /^[\x20-\x7e]*$/;

function checkMacros(tex: string, where: string): void {
  for (const m of tex.match(/\\[a-zA-Z]+/g) ?? []) {
    const pkg = MACRO_PACKAGE[m.slice(1)];
    expect(pkg, `${where}: unknown macro ${m}`).toBeDefined();
    expect(PROVIDED.has(pkg), `${where}: ${m} needs ${pkg}, absent from the preamble`).toBe(true);
  }
}

/** All string literals in a source file; template holes become "0". */
function literals(path: string): string[] {
  const src = readFileSync(new URL(path, import.meta.url), "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    out.push(m[1].replace(/\\(.)/g, "$1"));
  }
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    out.push(m[1].replace(/\$\{[^}]*\}/g, "0").replace(/\\(.)/g, "$1"));
  }
  return out;
}

describe("tex closure", () => {
  const words = [...literals("../src/vocabulary.ts"), ...literals("../src/caption.ts")];

  it("the harvest reaches the pools", () => {
    expect(words.length).toBeGreaterThan(200);
    expect(words.some((w) => w.includes("‖"))).toBe(true);
  });

  it("every pool word maps through texText into provided macros", () => {
    for (const w of words) {
      const t = texText(w);
      expect(PRINTABLE.test(t), `texText(${JSON.stringify(w)}) = ${t}`).toBe(true);
      checkMacros(t, JSON.stringify(w));
    }
  });

  it("every math-bearing word maps through texify with specials escaped", () => {
    for (const w of words) {
      if (!needsMath(w)) continue;
      const t = texify(w);
      expect(PRINTABLE.test(t), `texify(${JSON.stringify(w)}) = ${t}`).toBe(true);
      expect(/(?<!\\)[%&#]/.test(t), `${JSON.stringify(w)}: bare special in ${t}`).toBe(false);
      expect(/[$~]/.test(t), `${JSON.stringify(w)}: raw dollar or tilde in ${t}`).toBe(false);
      checkMacros(t, JSON.stringify(w));
    }
  });

  it("rendered tikz is printable ascii outside comments, macros all provided", () => {
    for (const kind of PLOT_KINDS) {
      for (let s = 0; s < 6; s++) {
        for (const dials of DIAL_CORNERS) {
          const tikz = render(generateFigure({ seed: `closure-${s}`, kind, ...dials }), "tikz");
          checkMacros(tikz, `${kind} closure-${s}`);
          for (const line of tikz.split("\n")) {
            if (line.startsWith("%")) continue;
            expect(PRINTABLE.test(line), `${kind} closure-${s}: ${line}`).toBe(true);
          }
        }
      }
    }
  });
});
