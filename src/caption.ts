/**
 * Captions: "Figure N:" is the renderer's job; this builds the runs after
 * it. One templated sentence, then seeded boilerplate whose gates read the
 * gags that actually fired.
 */
import type { ArtifactId, Panel, Run } from "./types.js";
import type { DialValues } from "./dials.js";
import { lerp } from "./rng.js";
import type { Rng } from "./rng.js";
import { CAPTION_VERBS, type ResolvedVocab, acronym, citeNumber, nounPhrase } from "./vocabulary.js";
import { needsMath, texify } from "./tex.js";

export interface CaptionContext {
  phrase: string;
  method: string;
}

/** Subject phrase and method acronym; drawn before anything else needs them. */
export function captionContext(root: Rng, vocab: ResolvedVocab, g: number): CaptionContext {
  const cf = root.fork("caption:context");
  const phrase = nounPhrase(cf, vocab, g);
  const method = vocab.method ?? acronym(cf, phrase);
  return { phrase, method };
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

/** Text run, or a math run when the label carries math symbols. */
function labelRun(s: string): Run {
  return needsMath(s) ? { k: "math", latex: texify(s), text: s } : { k: "text", s };
}

export function buildCaption(
  root: Rng,
  dials: DialValues,
  vocab: ResolvedVocab,
  ctx: CaptionContext,
  gags: Set<ArtifactId>,
  markApplied: (id: ArtifactId) => void,
  panels: Panel[],
): { runs: Run[] } {
  const cf = root.fork("caption");
  const g = dials.gobbledygook;
  const verb = cf.pick(CAPTION_VERBS);
  const object = nounPhrase(cf, vocab, g);
  const first = panels[0];
  const xLabel = first ? stripNote(first.x.label) : "the budget";
  const yLabel = first ? stripNote(first.y.label) : "the objective";
  const nBaselines = first
    ? first.series.filter((s) => s.role === "baseline" || s.role === "oracle").length
    : cf.range(2, 5);
  const bold: Run = { k: "bold", s: `${ctx.method} (ours)` };

  let main: Run[];
  switch (verb) {
    case "Comparison of":
      main = [
        { k: "text", s: "Comparison of " }, bold,
        { k: "text", s: nBaselines > 1 ? ` against ${NUMBER_WORDS[Math.min(nBaselines, 6)]} baselines on the ${object}.` : ` against prior work on the ${object}.` },
      ];
      break;
    case "Effect of":
      main = [
        { k: "text", s: "Effect of " }, labelRun(xLabel),
        { k: "text", s: " on " }, labelRun(yLabel),
        { k: "text", s: " for " }, bold, { k: "text", s: "." },
      ];
      break;
    case "Scaling of":
      main = [
        { k: "text", s: "Scaling of " }, labelRun(yLabel),
        { k: "text", s: " with " }, labelRun(xLabel),
        { k: "text", s: " for " }, bold, { k: "text", s: " and baselines." },
      ];
      break;
    case "Ablation over":
      main = [
        { k: "text", s: `Ablation over the ${object} for ` }, bold, { k: "text", s: "." },
      ];
      break;
    default:
      main = [
        { k: "text", s: "Sensitivity of " }, bold,
        { k: "text", s: " to " }, labelRun(xLabel), { k: "text", s: "." },
      ];
  }

  // Boilerplate. Every draw happens whether or not the sentence lands.
  const runsOver = cf.pick([3, 5, 10] as const);
  const totalN = 900 + cf.int(700);
  const assumption = cf.pick(["2.3", "A", "B.1"] as const);
  const starCite = citeNumber(cf, vocab);
  const lieCoin = cf.next();
  const dirCoin = cf.next();
  const starCoin = cf.next();
  const extra1Coin = cf.next();
  const extra2Coin = cf.next();
  const logAny = panels.some((p) => p.x.scale === "log" || p.y.scale === "log" || p.y2?.scale === "log")
    || (panels.length === 0 && gags.has("log-axis"));
  const better = first ? first.y.betterIs : (dirCoin < 0.5 ? "higher" : "lower");
  const lie = lieCoin < 0.25;
  const claimed = lie ? (better === "lower" ? "Higher" : "Lower") : (better === "lower" ? "Lower" : "Higher");

  interface Candidate { runs: Run[]; ok: boolean; mark?: ArtifactId; u: number; }
  const candidates: Candidate[] = [
    {
      runs: [{ k: "text", s: `Error bars denote one standard deviation over ${runsOver} runs.` }],
      ok: gags.has("error-bars"),
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: `Shaded region is infeasible under Assumption ${assumption}.` }],
      ok: gags.has("infeasible-region"),
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: "Best viewed in color." }],
      ok: gags.has("best-viewed-in-color"),
      mark: "best-viewed-in-color",
      u: cf.next(),
    },
    {
      runs: [
        { k: "text", s: "★ denotes results reported in " },
        { k: "cite", ids: [starCite] },
        { k: "text", s: "." },
      ],
      ok: gags.has("significance-stars") && starCoin < 0.6,
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: `${claimed} is better.` }],
      ok: dirCoin < 0.65,
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: "Axes are logarithmic." }],
      ok: logAny,
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: "Results averaged over a single run." }],
      ok: dials.junk >= 0.5 && extra1Coin < 0.4,
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: "All hyperparameters were tuned on the test set." }],
      ok: dials.junk >= 0.7 && extra2Coin < 0.4,
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: `Each violin summarizes ${runsOver} runs.` }],
      ok: gags.has("kde-from-nothing"),
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: "The diagonal denotes chance." }],
      ok: gags.has("random-diagonal"),
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: "Cluster separation is evident." }],
      ok: gags.has("tsne-axes"),
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: "Percentages may not sum to 100 due to rounding." }],
      ok: gags.has("sum-drift"),
      mark: "sum-drift",
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: `Densities estimated from ${runsOver} samples.` }],
      ok: gags.has("smoothed-histogram"),
      u: cf.next(),
    },
    {
      runs: [{ k: "text", s: `In total, n = ${totalN}.` }],
      ok: gags.has("counts-drift"),
      mark: "counts-drift",
      u: cf.next(),
    },
  ];

  // "Best viewed in color." is an artifact in its own right: when it
  // fired, it always lands. The rest compete for the remaining slots.
  const want = Math.round(lerp(1, 4, dials.density));
  const forced = candidates.filter((c) => c.ok && c.mark !== undefined);
  const rest = candidates
    .filter((c) => c.ok && c.mark === undefined)
    .sort((a, b) => a.u - b.u)
    .slice(0, Math.max(want - forced.length, 0));
  const chosen = [...forced, ...rest].sort((a, b) => a.u - b.u);

  const runs: Run[] = [...main];
  for (const c of chosen) {
    runs.push({ k: "text", s: " " });
    runs.push(...c.runs);
    if (c.mark) markApplied(c.mark);
  }
  return { runs: mergeText(runs) };
}

/** The axis label without the "(log scale)" note the gag may have added. */
function stripNote(label: string): string {
  return label.replace(" (log scale)", "");
}

/** Merge adjacent text runs so renderers see clean strings. */
export function mergeText(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (r.k === "text" && prev?.k === "text") prev.s += r.s;
    else out.push(r.k === "text" ? { ...r } : r);
  }
  return out;
}
