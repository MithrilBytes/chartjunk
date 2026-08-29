/**
 * The orchestrator: resolves options, decides the kind and panel plan,
 * fires the artifact catalogue, builds panels and the caption, and
 * assembles the Figure every renderer walks.
 */
import type { ArtifactId, Figure, Kind, Panel, PanelKind, SizeName, StyleName } from "./types.js";
import { Rng, type Seed } from "./rng.js";
import { type DialValues, resolveDials } from "./dials.js";
import { ARTIFACT_IDS, resolveArtifacts } from "./artifacts.js";
import { STYLES } from "./styles.js";
import { type Vocabulary, resolveVocab } from "./vocabulary.js";
import { buildCaption, captionContext } from "./caption.js";
import {
  type AxisWords, type PanelCtx, type SeriesPlan, chooseAxisWords, planSeries, seriesCount,
} from "./kinds/common.js";
import { buildLine } from "./kinds/line.js";
import { buildScatter } from "./kinds/scatter.js";
import { buildBar } from "./kinds/bar.js";
import { buildHeatmap } from "./kinds/heatmap.js";
import { buildPareto } from "./kinds/pareto.js";
import { buildPhase } from "./kinds/phase.js";
import { buildRoc } from "./kinds/roc.js";
import { buildProfile } from "./kinds/profile.js";
import { buildBump } from "./kinds/bump.js";
import { buildRadar } from "./kinds/radar.js";
import { buildViolin } from "./kinds/violin.js";

export interface GenerateOptions extends Partial<DialValues> {
  seed?: Seed;
  kind?: Kind;
  style?: StyleName;
  size?: SizeName;
  /** Figure number in the caption, default 1. */
  number?: number;
  /** Grayscale: dashes and hatching carry the series distinction. */
  mono?: boolean;
  /** false suppresses the orphan legend entry. */
  orphan?: boolean;
  /** Panel count for kind "panels", 2 to 6. */
  panels?: number;
  vocabulary?: Vocabulary;
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

const SINGLE_KINDS: readonly [PanelKind, number][] = [
  ["line", 3], ["bar", 2.2], ["scatter", 1.6], ["pareto", 1.6],
  ["radar", 1.6], ["roc", 1.4], ["violin", 1.4], ["profile", 1.2],
  ["bump", 1.2], ["heatmap", 1.1], ["phase", 1.1],
];
const PANEL_BASE_KINDS: readonly [PanelKind, number][] = [
  ["line", 3], ["bar", 2], ["scatter", 1.5], ["roc", 1],
];
const MISMATCH_KINDS: readonly PanelKind[] = ["heatmap", "pareto", "phase", "radar"];
const PANEL_LETTERS = ["a", "b", "c", "d", "e", "f"];

export function generateFigure(opts: GenerateOptions = {}): Figure {
  const seed = opts.seed ?? randomSeed();
  const root = new Rng(seed);
  const style = opts.style ?? "matplotlib";
  const rawDials = resolveDials(opts);
  const dials: DialValues = {
    ...rawDials,
    junk: Math.max(rawDials.junk, STYLES[style].minJunk),
  };
  const mono = opts.mono === true;
  const orphan = opts.orphan !== false;
  const number = opts.number ?? 1;
  const requested = opts.kind ?? "figure";

  // Layout decisions, all drawn up front from one stream.
  const layout = root.fork("layout");
  const kindPick = layout.weighted(SINGLE_KINDS);
  const panelsCoin = layout.next();
  const countU = layout.next();
  const basePick = layout.weighted(PANEL_BASE_KINDS);
  const mismatchIdxU = layout.next();
  const mismatchPick = layout.pick(MISMATCH_KINDS);

  let publicKind: Kind;
  let panelKinds: PanelKind[];
  if (requested === "caption") {
    publicKind = "caption";
    panelKinds = [];
  } else if (requested === "panels" || (requested === "figure" && dials.density >= 0.7 && panelsCoin < (dials.density - 0.7) * 1.8)) {
    publicKind = "panels";
    const count = clampInt(opts.panels ?? 2 + Math.floor(countU * (1 + dials.density * 4)), 2, 6);
    panelKinds = Array.from({ length: count }, () => basePick);
  } else if (requested === "figure") {
    publicKind = kindPick;
    panelKinds = [kindPick];
  } else {
    publicKind = requested;
    panelKinds = [requested as PanelKind];
  }

  const vocab = resolveVocab(opts.vocabulary);
  const cctx = captionContext(root, vocab, dials.gobbledygook);
  const applied = new Set<ArtifactId>();

  // Two-pass artifact resolution around the panel mismatch: per-id forks
  // make the second pass return identical coins for every unchanged gag.
  const passA = resolveArtifacts(root, dials, panelKinds, { orphan, figureKind: publicKind });
  let mismatchAt = -1;
  if (passA.has("panel-mismatch") && publicKind === "panels" && panelKinds.length >= 2) {
    mismatchAt = 1 + Math.floor(mismatchIdxU * (panelKinds.length - 1));
    panelKinds[mismatchAt] = mismatchPick;
  }
  const fired = mismatchAt >= 0
    ? resolveArtifacts(root, dials, panelKinds, { orphan, figureKind: publicKind })
    : passA;

  // Shared identity across panels: one set of series plans and axis words.
  const baseCtx: PanelCtx = {
    root, p: 0, kind: panelKinds[0] ?? "line", dials, style, mono,
    fired, applied, vocab, method: cctx.method,
  };
  let shared: SeriesPlan[] | undefined;
  let sharedWords: AxisWords | undefined;
  if (publicKind === "panels") {
    sharedWords = chooseAxisWords(baseCtx);
    shared = planSeries(baseCtx, seriesCount(baseCtx));
  }

  const panels: Panel[] = panelKinds.map((kind, p) => {
    const isMismatch = p === mismatchAt;
    const ctx: PanelCtx = {
      root, p, kind, dials, style, mono, fired, applied, vocab,
      method: cctx.method,
      shared: isMismatch ? undefined : shared,
      sharedWords: isMismatch ? undefined : sharedWords,
      suppressLegend: publicKind === "panels" && p !== 0 && !isMismatch,
    };
    const panel = buildPanel(ctx);
    if (publicKind === "panels") panel.label = `(${PANEL_LETTERS[p]})`;
    return panel;
  });
  if (mismatchAt >= 0) applied.add("panel-mismatch");

  // The orphan entry may point into a different panel at high junk.
  if (fired.has("orphan-cross-panel") && publicKind === "panels" && panels.length >= 2) {
    const xf = root.fork("legend:cross");
    const targetPanel = 1 + xf.int(panels.length - 1);
    const entry = panels[0].legend.entries.find((e) => e.seriesId === null);
    const candidates = panels[targetPanel].series.filter((s) => s.label !== "");
    if (entry && candidates.length > 0) {
      entry.seriesId = candidates[xf.int(candidates.length)].id;
      applied.add("orphan-cross-panel");
    }
  }

  // Figure-wide ink gags.
  if (panels.length > 0) {
    if (fired.has("grid-major")) applied.add("grid-major");
    if (fired.has("grid-minor")) applied.add("grid-minor");
    if (fired.has("draft-watermark")) {
      panels[0].annotations.push({ type: "watermark", text: "PRELIMINARY" });
      applied.add("draft-watermark");
    }
  }

  // The caption gates on what landed, except for the one gag only the
  // caption itself can land.
  const gagsForCaption = publicKind === "caption" ? fired : new Set(applied);
  if (publicKind !== "caption" && fired.has("best-viewed-in-color")) {
    gagsForCaption.add("best-viewed-in-color");
  }
  const caption = buildCaption(
    root, dials, vocab, cctx, gagsForCaption, (id) => applied.add(id), panels,
  );

  return {
    seed: String(seed),
    number,
    kind: publicKind,
    style,
    size: opts.size ?? (publicKind === "panels" ? "double" : "single"),
    mono,
    panels,
    caption,
    artifacts: ARTIFACT_IDS.filter((id) => applied.has(id)),
  };
}

function buildPanel(ctx: PanelCtx): Panel {
  switch (ctx.kind) {
    case "line": return buildLine(ctx);
    case "scatter": return buildScatter(ctx);
    case "bar": return buildBar(ctx);
    case "heatmap": return buildHeatmap(ctx);
    case "pareto": return buildPareto(ctx);
    case "phase": return buildPhase(ctx);
    case "roc": return buildRoc(ctx);
    case "profile": return buildProfile(ctx);
    case "bump": return buildBump(ctx);
    case "radar": return buildRadar(ctx);
    case "violin": return buildViolin(ctx);
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
