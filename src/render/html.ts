/**
 * A self-contained <figure> with inline SVG and a <figcaption>, matching
 * theorem-ipsum's HTML output style.
 */
import type { Figure, Run } from "../types.js";
import { renderSvg } from "./svg.js";

export function renderHtml(fig: Figure): string {
  const svg = renderSvg(fig, { caption: false });
  return [
    `<figure class="chartjunk">`,
    svg.trimEnd(),
    `<figcaption><strong>Figure ${fig.number}:</strong> ${runsHtml(fig.caption.runs)}</figcaption>`,
    `</figure>`,
  ].join("\n") + "\n";
}

export function runsHtml(runs: Run[]): string {
  return runs
    .map((r) => {
      switch (r.k) {
        case "text": return escapeHtml(r.s);
        case "bold": return `<strong>${escapeHtml(r.s)}</strong>`;
        case "math": return `<em>${escapeHtml(r.text)}</em>`;
        case "cite": return `[${r.ids.join(", ")}]`;
      }
    })
    .join("");
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
