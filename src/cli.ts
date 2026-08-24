#!/usr/bin/env node
/**
 * chartjunk CLI.
 *
 *   node dist/cli.js --seed 42 -k pareto -o fig1.svg
 *   node dist/cli.js -k bar --confidence 1 --junk 0.8
 */
import { writeFileSync } from "node:fs";
import { type Format, VERSION, chartjunk } from "./index.js";
import type { Kind, SizeName, StyleName } from "./types.js";

const KINDS = ["figure", "line", "scatter", "bar", "heatmap", "pareto", "phase", "panels", "caption"];
const FORMATS = ["svg", "json"];
const STYLE_NAMES = ["matplotlib", "ggplot", "pgfplots", "excel"];
const SIZE_NAMES = ["single", "double", "square", "wide"];

const HELP = `chartjunk ${VERSION}

Usage: chartjunk [options]

Options:
  -s, --seed <seed>       any string or number; same seed, same figure
  -k, --kind <kind>       figure | line | scatter | bar | heatmap | pareto
                          | phase | panels | caption      (default: figure)
  -f, --format <format>   svg | json                      (default: svg,
                          or inferred from the --out extension)
      --density <0..1>    series, points, panels, insets
      --junk <0..1>       non-data ink: grids, boxes, notes, watermarks
      --confidence <0..1> how far ahead "(ours)" lands; error bar width
      --gobbledygook <0..1>  incoherence of the labels
                          (each dial defaults to 0.5)
      --style <style>     matplotlib | ggplot | pgfplots | excel
      --size <size>       single | double | square | wide
      --panels <2..6>     panel count for -k panels
      --number <n>        figure number in the caption (default: 1)
      --mono              grayscale: dashes and hatching carry the series
      --no-orphan         suppress the orphan legend entry
  -o, --out <file>        write to a file instead of stdout
  -h, --help              show this help
  -v, --version           show version

Examples:
  chartjunk --seed perverse-margin-42
  chartjunk -k bar --confidence 1 --junk 0.8 -o fig2.svg
  chartjunk -k figure -f json | jq .artifacts
`;

interface Args {
  seed?: string | number;
  format?: Format;
  kind: string;
  density?: number;
  junk?: number;
  confidence?: number;
  gobbledygook?: number;
  style?: string;
  size?: string;
  panels?: number;
  number?: number;
  mono: boolean;
  orphan: boolean;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { kind: "figure", mono: false, orphan: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) fail(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "-h": case "--help":
        process.stdout.write(HELP);
        process.exit(0);
        break;
      case "-v": case "--version":
        process.stdout.write(VERSION + "\n");
        process.exit(0);
        break;
      case "-s": case "--seed": {
        const raw = next();
        args.seed = /^-?\d+$/.test(raw) ? Number(raw) : raw;
        break;
      }
      case "-f": case "--format": {
        const f = next();
        if (!FORMATS.includes(f)) {
          fail(`unknown format "${f}" (expected ${FORMATS.join(" | ")})`);
        }
        args.format = f as Format;
        break;
      }
      case "-k": case "--kind": {
        const k = next();
        if (!KINDS.includes(k)) fail(`unknown kind "${k}" (try --help)`);
        args.kind = k;
        break;
      }
      case "--density": args.density = dial(next(), a); break;
      case "--junk": args.junk = dial(next(), a); break;
      case "--confidence": args.confidence = dial(next(), a); break;
      case "--gobbledygook": args.gobbledygook = dial(next(), a); break;
      case "--style": {
        const s = next();
        if (!STYLE_NAMES.includes(s)) fail(`unknown style "${s}" (expected ${STYLE_NAMES.join(" | ")})`);
        args.style = s;
        break;
      }
      case "--size": {
        const s = next();
        if (!SIZE_NAMES.includes(s)) fail(`unknown size "${s}" (expected ${SIZE_NAMES.join(" | ")})`);
        args.size = s;
        break;
      }
      case "--panels": {
        const p = num(next(), a);
        if (p < 2 || p > 6) fail(`--panels expects 2 to 6`);
        args.panels = p;
        break;
      }
      case "--number": args.number = num(next(), a); break;
      case "--mono": args.mono = true; break;
      case "--no-orphan": args.orphan = false; break;
      case "-o": case "--out": args.out = next(); break;
      default:
        fail(`unknown option "${a}" (try --help)`);
    }
  }
  return args;
}

function fail(msg: string): never {
  process.stderr.write(`chartjunk: ${msg}\n`);
  process.exit(1);
}

function num(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(`invalid number "${raw}" for ${flag}`);
  return n;
}

function dial(raw: string, flag: string): number {
  const n = num(raw, flag);
  if (n < 0 || n > 1) fail(`${flag} expects a value from 0 to 1`);
  return n;
}

function inferFormat(out?: string): Format {
  if (out?.endsWith(".json")) return "json";
  return "svg";
}

const args = parseArgs(process.argv.slice(2));
const format: Format = args.format ?? inferFormat(args.out);

const output = chartjunk({
  seed: args.seed,
  kind: args.kind as Kind,
  format,
  density: args.density,
  junk: args.junk,
  confidence: args.confidence,
  gobbledygook: args.gobbledygook,
  style: args.style as StyleName | undefined,
  size: args.size as SizeName | undefined,
  panels: args.panels,
  number: args.number,
  mono: args.mono,
  orphan: args.orphan,
});

const final = output.endsWith("\n") ? output : output + "\n";
if (args.out) {
  writeFileSync(args.out, final);
  process.stderr.write(`chartjunk: wrote ${args.out}\n`);
} else {
  process.stdout.write(final);
}
