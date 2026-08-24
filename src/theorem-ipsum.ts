/**
 * The theorem-ipsum adapter. A paper passes its seed, figure number, and
 * vocabulary; gobbledygook passes straight through, density follows the
 * paper's length dial, junk holds at 0.5, and confidence sits at 0.7,
 * because papers want to win. Import from "chartjunk/theorem-ipsum".
 */
import type { Figure } from "./types.js";
import type { Seed } from "./rng.js";
import type { Vocabulary } from "./vocabulary.js";
import { type GenerateOptions, generateFigure } from "./figure.js";

export interface FigureRequest {
  seed: Seed;
  /** For "Figure 3:"; drives the caption and cross-references. */
  number: number;
  /** The paper's noun palette and bibliography numbers. */
  vocabulary?: Vocabulary;
  /** Shared dial; the paper's value passes through unchanged. */
  gobbledygook?: number;
  /** The paper's length dial; figures densify with the prose. */
  length?: number;
}

export type FigureProvider = (req: FigureRequest) => Figure;

/** Build a provider, optionally pinning any generate option. */
export function theoremIpsumFigures(overrides?: Partial<GenerateOptions>): FigureProvider {
  return (req) =>
    generateFigure({
      seed: req.seed,
      number: req.number,
      vocabulary: req.vocabulary,
      gobbledygook: req.gobbledygook,
      density: req.length,
      junk: 0.5,
      confidence: 0.7,
      ...overrides,
    });
}

/** The default provider theorem-ipsum plugs in. */
export const figures: FigureProvider = theoremIpsumFigures();
