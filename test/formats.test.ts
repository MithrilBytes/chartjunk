import { describe, expect, it } from "vitest";
import { chartjunk, generateFigure, renderMarkdown } from "../src/index.js";
import { DIAL_CORNERS, PLOT_KINDS, checkXml } from "./helpers.js";

describe("text format", () => {
  it("never exceeds 72 columns", () => {
    for (const kind of PLOT_KINDS) {
      for (const dials of DIAL_CORNERS) {
        const txt = chartjunk({ seed: `txt-${kind}`, kind, format: "text", ...dials });
        for (const line of txt.split("\n")) {
          expect(line.length, `${kind}: "${line}"`).toBeLessThanOrEqual(72);
        }
      }
    }
  });

  it("draws axes and a caption", () => {
    const txt = chartjunk({ seed: "txt", kind: "line", format: "text" });
    expect(txt).toContain("└");
    expect(txt).toContain("│");
    expect(txt).toContain("Figure 1:");
  });

  it("shades heatmaps with quartile blocks", () => {
    const txt = chartjunk({ seed: "txt-h", kind: "heatmap", format: "text" });
    expect(/[░▒▓█]/.test(txt)).toBe(true);
  });
});

describe("html format", () => {
  it("wraps inline svg in a figure with a figcaption", () => {
    const html = chartjunk({ seed: "html", kind: "bar", format: "html", number: 2 });
    expect(html).toContain('<figure class="chartjunk">');
    expect(html).toContain("<figcaption><strong>Figure 2:</strong>");
    expect(html).toContain("</figure>");
    const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6);
    expect(checkXml(svg)).toBeNull();
    expect(html.includes("NaN")).toBe(false);
  });

  it("bolds ours in the caption", () => {
    const html = chartjunk({ seed: "html-b", kind: "line", format: "html" });
    expect(html).toContain("<strong>");
  });
});

describe("markdown format", () => {
  it("inlines a data uri without a sidecar reference", () => {
    const md = chartjunk({ seed: "md", kind: "line", format: "markdown" });
    expect(md).toContain("![Figure 1:");
    expect(md).toContain("data:image/svg+xml;charset=utf-8,");
    expect(md).toContain("**Figure 1:**");
  });

  it("references the sidecar when one is named", () => {
    const fig = generateFigure({ seed: "md-side", kind: "bar" });
    const md = renderMarkdown(fig, { svgRef: "fig7.svg" });
    expect(md).toContain("](fig7.svg)");
    expect(md.includes("data:image")).toBe(false);
  });
});
