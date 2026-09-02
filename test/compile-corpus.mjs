/**
 * Writes a compilable corpus: every kind under hostile dial corners, the
 * pinned regression seeds, a few composition picks, and the daily date
 * seeds for today through --days ahead, as one wrapper document.
 *
 *   node test/compile-corpus.mjs --out /tmp/corpus --days 7
 *   tectonic /tmp/corpus/corpus.tex --outdir /tmp/corpus
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}
const out = resolve(flag("--out", "corpus"));
const days = Number(flag("--days", "0"));

mkdirSync(out, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(out, "lib.mjs"),
  logLevel: "silent",
});
const lib = await import(pathToFileURL(join(out, "lib.mjs")).href);
const { TIKZ_PREAMBLE, generateFigure, render } = lib;

const KINDS = [
  "line", "scatter", "bar", "heatmap", "pareto", "phase",
  "roc", "profile", "bump", "radar", "violin",
  "pie", "waterfall", "area", "histogram", "venn", "panels",
];

const cases = [
  { kind: "line", seed: "3", junk: 0.8 },
  { kind: "bar", seed: "4", junk: 0.8 },
  { kind: "bar", seed: "11", junk: 0.8 },
  { kind: "heatmap", seed: "9", junk: 0.8 },
  { kind: "panels", seed: "6", junk: 0.8 },
];
for (const kind of KINDS) {
  cases.push({ kind, seed: "corpus-a", density: 1, junk: 1, confidence: 0, gobbledygook: 1 });
  cases.push({ kind, seed: "corpus-b", density: 0, junk: 0.8, confidence: 1, gobbledygook: 0 });
}
for (let i = 0; i < 3; i++) cases.push({ seed: `corpus-mix-${i}` });
for (let i = 0; i <= days; i++) {
  cases.push({ seed: new Date(Date.now() + i * 86400000).toISOString().slice(0, 10) });
}

const inputs = [];
cases.forEach((c, i) => {
  const name = `body-${String(i).padStart(3, "0")}.tex`;
  writeFileSync(join(out, name), render(generateFigure(c), "tikz"));
  inputs.push(`\\input{${name}}`);
});

const doc = [
  "\\documentclass{article}",
  "\\pagestyle{empty}",
  TIKZ_PREAMBLE,
  "\\begin{document}",
  inputs.join("\n\\par\\bigskip\n"),
  "\\end{document}",
  "",
].join("\n");
writeFileSync(join(out, "corpus.tex"), doc);
console.log(`chartjunk: wrote ${cases.length} bodies and corpus.tex to ${out}`);
