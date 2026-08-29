/**
 * chartjunk: seeded generator of scientific-looking figures with no
 * underlying data.
 *
 *   import { chartjunk } from "./dist/index.js";
 *   console.log(chartjunk({ seed: 42, kind: "pareto", format: "svg" }));
 */
import type { Figure, Kind } from "./types.js";
import { type GenerateOptions, generateFigure, randomSeed } from "./figure.js";
import { renderSvg } from "./render/svg.js";
import { renderJson } from "./render/json.js";
import { TIKZ_PREAMBLE, renderTikz } from "./render/tikz.js";
import { renderHtml } from "./render/html.js";
import { type MarkdownOptions, markdownSidecarSvg, renderMarkdown } from "./render/markdown.js";
import { renderText } from "./render/text.js";

export type Format = "svg" | "tikz" | "html" | "markdown" | "text" | "json";

export type {
  Annotation, ArtifactId, Axis, Caption, Dash, Figure, Kind, Legend, LegendEntry,
  Marker, Matrix, Panel, PanelKind, Point, Region, Role, Run, Series, SizeName, StyleName,
} from "./types.js";
export type { GenerateOptions } from "./figure.js";
export type { Vocabulary } from "./vocabulary.js";
export type { DialValues } from "./dials.js";
export type { Seed } from "./rng.js";

export { generateFigure, randomSeed };
export { Rng } from "./rng.js";
export { ARTIFACT_IDS, ARTIFACT_NOTES, CATALOGUE } from "./artifacts.js";
export { TIKZ_PREAMBLE, markdownSidecarSvg, renderHtml, renderMarkdown, renderSvg, renderText, renderTikz };
export type { MarkdownOptions };

/** Render a generated Figure to the given format. */
export function render(fig: Figure, format: Format = "svg"): string {
  switch (format) {
    case "svg": return renderSvg(fig);
    case "tikz": return renderTikz(fig);
    case "html": return renderHtml(fig);
    case "markdown": return renderMarkdown(fig);
    case "text": return renderText(fig);
    case "json": return renderJson(fig);
  }
}

/** Generate a figure and render it in one call. */
export function chartjunk(opts: GenerateOptions & { format?: Format } = {}): string {
  const { format = "svg", ...rest } = opts;
  return render(generateFigure(rest), format);
}

type KindOptions = Omit<GenerateOptions, "kind"> & { format?: Format };

function kindShortcut(kind: Kind): (opts?: KindOptions) => string {
  return (opts = {}) => chartjunk({ ...opts, kind });
}

/** One kind, one call. */
export const line = kindShortcut("line");
export const scatter = kindShortcut("scatter");
export const bar = kindShortcut("bar");
export const heatmap = kindShortcut("heatmap");
export const pareto = kindShortcut("pareto");
export const phase = kindShortcut("phase");
export const roc = kindShortcut("roc");
export const profile = kindShortcut("profile");
export const bump = kindShortcut("bump");
export const radar = kindShortcut("radar");
export const violin = kindShortcut("violin");
export const pie = kindShortcut("pie");
export const waterfall = kindShortcut("waterfall");
export const area = kindShortcut("area");
export const histogram = kindShortcut("histogram");
export const venn = kindShortcut("venn");
export const panels = kindShortcut("panels");
export const caption = kindShortcut("caption");
export const figure = kindShortcut("figure");

export const VERSION = "0.1.0";
