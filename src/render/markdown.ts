/**
 * Markdown: an image reference plus a caption paragraph. The CLI writes
 * the SVG as a sidecar next to --out and passes its name; without one the
 * image inlines as a data URI so the output stays self-contained.
 */
import type { Figure, Run } from "../types.js";
import { renderSvg } from "./svg.js";
import { plainCaption } from "./text.js";

export interface MarkdownOptions {
  /** Relative path the image tag should reference, e.g. "fig1.svg". */
  svgRef?: string;
}

export function renderMarkdown(fig: Figure, opts: MarkdownOptions = {}): string {
  const plain = plainCaption(fig.caption.runs);
  const ref = opts.svgRef
    ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSvg(fig, { caption: false }))}`;
  const alt = `Figure ${fig.number}: ${plain}`.replaceAll("[", "(").replaceAll("]", ")");
  return [
    `![${alt}](${ref})`,
    "",
    `**Figure ${fig.number}:** ${runsMarkdown(fig.caption.runs)}`,
  ].join("\n") + "\n";
}

/** The sidecar the CLI writes next to --out. */
export function markdownSidecarSvg(fig: Figure): string {
  return renderSvg(fig, { caption: false });
}

function runsMarkdown(runs: Run[]): string {
  return runs
    .map((r) => {
      switch (r.k) {
        case "text": return escapeMd(r.s);
        case "bold": return `**${escapeMd(r.s)}**`;
        case "math": return `*${escapeMd(r.text)}*`;
        case "cite": return `\\[${r.ids.join(", ")}\\]`;
      }
    })
    .join("");
}

function escapeMd(s: string): string {
  return s.replace(/([*_`[\]])/g, "\\$1");
}
