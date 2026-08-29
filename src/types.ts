/**
 * The Figure IR. generateFigure returns one of these plain structures and
 * every renderer walks it, so content is identical across formats.
 *
 * Axis gags that only change how a plot is drawn (zeroSuppressed, broken)
 * are view properties: range and ticks stay honest and stable, and the
 * renderers crop, compress, and hide ticks as needed.
 */

export type Kind =
  | "figure"
  | "line"
  | "scatter"
  | "bar"
  | "heatmap"
  | "pareto"
  | "phase"
  | "roc"
  | "profile"
  | "bump"
  | "radar"
  | "violin"
  | "panels"
  | "caption";

/** Kinds a panel can hold; the rest are figure-level wrappers. */
export type PanelKind = Exclude<Kind, "figure" | "panels" | "caption">;

export type StyleName = "matplotlib" | "ggplot" | "pgfplots" | "excel";
export type SizeName = "single" | "double" | "square" | "wide";
export type Marker = "circle" | "square" | "triangle" | "diamond" | "star" | "cross" | "plus" | "none";
export type Dash = "solid" | "dashed" | "dotted" | "dashdot";

export interface Point {
  x: number;
  y: number;
  /** Error bounds, when the error-bars artifact fired. */
  lo?: number;
  hi?: number;
}

export interface Axis {
  label: string;
  unit?: string;
  scale: "linear" | "log";
  /** Data coordinates. */
  range: [number, number];
  ticks: number[];
  /** Categorical tick labels (bar groups, heatmap rows), one per tick. */
  tickLabels?: string[];
  minorTicks?: number[];
  /** Rendered as the classic double-slash gap; contains no points. */
  broken?: [number, number];
  /** Rendered cropped to just under the data minimum instead of the range. */
  zeroSuppressed?: boolean;
  /** Property of the label; drives who wins. */
  betterIs: "higher" | "lower";
}

export type Role = "ours" | "baseline" | "oracle" | "reference";

export interface Series {
  id: string;
  label: string;
  role: Role;
  draw: "line" | "scatter" | "bar" | "step" | "band";
  points: Point[];
  marker: Marker;
  dash: Dash;
  /** Index into the style cycle. */
  color: number;
  /** Label rendered bold; always true for ours. */
  bold: boolean;
  /** Plotted against the panel's secondary axis. */
  y2?: boolean;
  /** Box statistics inside a violin. */
  stats?: { median: number; q1: number; q3: number };
}

export interface LegendEntry {
  label: string;
  marker: Marker;
  dash: Dash;
  color: number;
  /** null = orphan: nothing on the plot corresponds. */
  seriesId: string | null;
}

export interface Legend {
  position: "best" | "over-data" | "outside";
  /** Rendering order. */
  entries: LegendEntry[];
}

export interface Region {
  polygon: Point[];
  fill: "shade" | "hatch";
  label: string;
}

export type Annotation =
  | { type: "text"; at: Point; text: string; boxed?: boolean }
  | { type: "arrow"; from: Point; to: Point; text?: string }
  /** count 0 renders "n.s.". */
  | { type: "stars"; at: Point; count: 0 | 1 | 2 | 3 }
  | { type: "vline" | "hline"; at: number; text: string; dash: Dash }
  | { type: "inset"; window: [Point, Point]; corner: "ne" | "sw" }
  | { type: "watermark"; text: string };

/** Heatmap cells; row-major values, rows x cols. */
export interface Matrix {
  rows: number;
  cols: number;
  values: number[];
  rowLabels: string[];
  colLabels: string[];
  colorbar: { label: string; unit?: string; ticks: number[] };
}

export interface Panel {
  /** "(a)" and so on, in multi-panel figures. */
  label?: string;
  kind: PanelKind;
  x: Axis;
  y: Axis;
  y2?: Axis;
  series: Series[];
  matrix?: Matrix;
  /** Shaded or hatched, with a label. */
  regions: Region[];
  annotations: Annotation[];
  legend: Legend;
}

/**
 * Caption text as styled runs. The math run carries both a LaTeX and a
 * Unicode form so every renderer, and theorem-ipsum's, can do the right
 * thing without a math parser.
 */
export type Run =
  | { k: "text"; s: string }
  | { k: "bold"; s: string }
  | { k: "math"; latex: string; text: string }
  | { k: "cite"; ids: number[] };

export interface Caption {
  runs: Run[];
}

/** Every gag in the catalogue. artifacts.ts holds the firing rules. */
export type ArtifactId =
  | "orphan-legend"
  | "ours-bold"
  | "error-bars"
  | "significance-stars"
  | "r-squared"
  | "infeasible-region"
  | "phase-regions"
  | "hatched-unstable"
  | "colorbar-unit"
  | "log-axis"
  | "zero-suppressed"
  | "gap-arrow"
  | "theoretical-limit"
  | "excluded-outlier"
  | "marginal-rug"
  | "boundary-equation"
  | "see-text"
  | "cell-values"
  | "grid-major"
  | "grid-minor"
  | "broken-axis"
  | "rotated-ticks"
  | "best-viewed-in-color"
  | "legend-over-data"
  | "log-scale-note"
  | "draft-watermark"
  | "inset-zoom"
  | "secondary-axis"
  | "panel-mismatch"
  | "orphan-cross-panel"
  | "auc-in-legend"
  | "random-diagonal"
  | "rank-inverted"
  | "normalized-to-ours"
  | "kde-from-nothing"
  | "confusion-diagonal"
  | "pairwise-grid"
  | "extrapolated-region"
  | "tsne-axes";

export interface Figure {
  seed: string;
  /** For "Figure 3:"; caller-supplied, default 1. */
  number: number;
  kind: Kind;
  style: StyleName;
  size: SizeName;
  mono: boolean;
  /** 1..6. Empty only for kind "caption". */
  panels: Panel[];
  caption: Caption;
  /** Every gag that fired; used by tests and the demo's sins overlay. */
  artifacts: ArtifactId[];
}
