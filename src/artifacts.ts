/**
 * The artifact catalogue: every gag, the kinds it applies to, the dial that
 * governs it, and its firing threshold. Adding a gag means appending here
 * and teaching the kind builders to apply it; the catalogue is the backlog.
 *
 * Firing draws each artifact's coin from its own forked stream, so one
 * dial can never reshuffle another artifact's decision.
 */
import type { ArtifactId, Kind, PanelKind } from "./types.js";
import type { DialValues } from "./dials.js";
import { fires } from "./dials.js";
import type { Rng } from "./rng.js";

export interface ArtifactSpec {
  /** Panel kinds the gag can attach to; "any" means every plot kind. */
  kinds: readonly PanelKind[] | "any";
  /** Governing dial; null fires whenever applicable. */
  dial: "density" | "junk" | "confidence" | null;
  threshold: number;
}

const LEGEND_KINDS: readonly PanelKind[] = ["line", "scatter", "bar", "pareto"];

export const CATALOGUE: Record<ArtifactId, ArtifactSpec> = {
  "orphan-legend": { kinds: LEGEND_KINDS, dial: null, threshold: 0 },
  "ours-bold": { kinds: LEGEND_KINDS, dial: null, threshold: 0 },
  "error-bars": { kinds: ["bar", "line"], dial: null, threshold: 0 },
  "significance-stars": { kinds: ["bar"], dial: null, threshold: 0 },
  "r-squared": { kinds: ["scatter"], dial: null, threshold: 0 },
  "infeasible-region": { kinds: ["pareto", "phase", "line"], dial: "junk", threshold: 0.4 },
  "phase-regions": { kinds: ["phase"], dial: null, threshold: 0 },
  "hatched-unstable": { kinds: ["phase"], dial: null, threshold: 0 },
  "colorbar-unit": { kinds: ["heatmap"], dial: null, threshold: 0 },
  "log-axis": { kinds: ["line", "scatter", "pareto"], dial: "density", threshold: 0.3 },
  "zero-suppressed": { kinds: ["bar", "line"], dial: "confidence", threshold: 0.6 },
  "gap-arrow": { kinds: ["line", "bar"], dial: "confidence", threshold: 0.7 },
  "theoretical-limit": { kinds: ["pareto", "line"], dial: "junk", threshold: 0.3 },
  "excluded-outlier": { kinds: ["scatter"], dial: "junk", threshold: 0.3 },
  "marginal-rug": { kinds: ["scatter"], dial: "density", threshold: 0.5 },
  "boundary-equation": { kinds: ["phase"], dial: "junk", threshold: 0.3 },
  "see-text": { kinds: "any", dial: "junk", threshold: 0.4 },
  "cell-values": { kinds: ["heatmap"], dial: "junk", threshold: 0.6 },
  "grid-major": { kinds: "any", dial: "junk", threshold: 0.4 },
  "grid-minor": { kinds: "any", dial: "junk", threshold: 0.7 },
  "broken-axis": { kinds: ["bar"], dial: "junk", threshold: 0.5 },
  "rotated-ticks": { kinds: ["bar", "heatmap"], dial: "junk", threshold: 0.5 },
  "best-viewed-in-color": { kinds: "any", dial: "junk", threshold: 0.5 },
  "legend-over-data": { kinds: LEGEND_KINDS, dial: "junk", threshold: 0.6 },
  "log-scale-note": { kinds: ["line", "scatter", "pareto"], dial: "junk", threshold: 0.6 },
  "draft-watermark": { kinds: "any", dial: "junk", threshold: 0.9 },
  "inset-zoom": { kinds: ["line"], dial: "density", threshold: 0.6 },
  "secondary-axis": { kinds: ["line"], dial: "density", threshold: 0.7 },
  "panel-mismatch": { kinds: "any", dial: "density", threshold: 0.5 },
  "orphan-cross-panel": { kinds: "any", dial: "junk", threshold: 0.8 },
};

export const ARTIFACT_IDS = Object.keys(CATALOGUE) as ArtifactId[];

export interface ArtifactOptions {
  /** false suppresses the orphan legend entry (--no-orphan). */
  orphan: boolean;
  figureKind: Kind;
}

/**
 * Decide the whole catalogue up front. Kind builders consult the returned
 * set and report what they actually applied; the figure records the latter.
 */
export function resolveArtifacts(
  root: Rng,
  dials: DialValues,
  panelKinds: readonly PanelKind[],
  opts: ArtifactOptions,
): Set<ArtifactId> {
  const fired = new Set<ArtifactId>();
  for (const id of ARTIFACT_IDS) {
    const spec = CATALOGUE[id];
    const rng = root.fork("artifacts:" + id);
    const applicable =
      spec.kinds === "any"
        ? true
        : panelKinds.some((k) => (spec.kinds as readonly PanelKind[]).includes(k));
    // Always draw so consumption never depends on applicability or dials.
    let hit: boolean;
    if (id === "infeasible-region" && panelKinds.includes("pareto")) {
      rng.next();
      hit = true;
    } else if (spec.dial === null) {
      rng.next();
      hit = true;
    } else {
      hit = fires(rng, dials[spec.dial], spec.threshold);
    }
    if (!applicable || !hit) continue;
    if ((id === "orphan-legend" || id === "orphan-cross-panel") && !opts.orphan) continue;
    if (id === "panel-mismatch" && opts.figureKind !== "panels") continue;
    if (id === "orphan-cross-panel" && opts.figureKind !== "panels") continue;
    fired.add(id);
  }
  return fired;
}

/** Star count for the significance gag; 0 renders "n.s.". */
export function starCount(confidence: number): 0 | 1 | 2 | 3 {
  if (confidence <= 0.2) return 0;
  if (confidence < 0.45) return 1;
  if (confidence < 0.7) return 2;
  return 3;
}
