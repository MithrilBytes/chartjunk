/**
 * One table for colors, dash arrays, and marker shapes so SVG and TikZ
 * agree. Renderers map through this module and never invent styling.
 */
import type { Dash, Marker, Role, StyleName } from "./types.js";

export interface StyleSpec {
  /** Series color cycle, hex. */
  colors: readonly string[];
  /** Grayscale cycle used under --mono. */
  monoColors: readonly string[];
  /** Dash cycle by series slot; mono forces variety. */
  dashes: readonly Dash[];
  /** SVG font stack. */
  font: string;
  serif: boolean;
  baseFontPx: number;
  lineWidth: number;
  ticksOut: boolean;
  /** box = four spines, none = ggplot's frameless panel. */
  frame: "box" | "none";
  panelBg?: string;
  gridColor: string;
  /** Grid drawn even at junk 0, as ggplot does. */
  gridAlways: boolean;
  legendBox: boolean;
  legendDefault: "best" | "outside";
  /** Bars get a vertical gradient and fake bevel. */
  barGradient: boolean;
  /** The style refuses to be tasteful below this junk value. */
  minJunk: number;
}

/** matplotlib tab10 cycle (matplotlib.org, "Choosing Colormaps"). */
const TAB10 = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
] as const;

/** ggplot2 default discrete scale, scales::hue_pal() at n = 6. */
const GGPLOT6 = [
  "#f8766d", "#b79f00", "#00ba38", "#00bfc4", "#619cff", "#f564e3",
] as const;

/** pgfplots default cycle list (pgfplots manual, "cycle list"). */
const PGF = [
  "#0000ff", "#ff0000", "#734d26", "#000000", "#008080", "#ff8000",
] as const;

/** Office theme accent colors, the Excel 2013+ default chart cycle. */
const OFFICE = [
  "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47",
] as const;

const MONO = ["#000000", "#4d4d4d", "#8c8c8c", "#b3b3b3", "#666666", "#262626"] as const;

const SOLID_ONLY: readonly Dash[] = ["solid", "solid", "solid", "solid", "solid", "solid"];
const VARIED: readonly Dash[] = ["solid", "dashed", "dotted", "dashdot", "solid", "dashed"];

export const STYLES: Record<StyleName, StyleSpec> = {
  matplotlib: {
    colors: TAB10,
    monoColors: MONO,
    dashes: SOLID_ONLY,
    font: "'DejaVu Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    serif: false,
    baseFontPx: 11,
    lineWidth: 1.5,
    ticksOut: true,
    frame: "box",
    gridColor: "#b0b0b0",
    gridAlways: false,
    legendBox: true,
    legendDefault: "best",
    barGradient: false,
    minJunk: 0,
  },
  ggplot: {
    colors: GGPLOT6,
    monoColors: MONO,
    dashes: SOLID_ONLY,
    font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    serif: false,
    baseFontPx: 11,
    lineWidth: 1.6,
    ticksOut: true,
    frame: "none",
    panelBg: "#ebebeb",
    gridColor: "#ffffff",
    gridAlways: true,
    legendBox: false,
    legendDefault: "outside",
    barGradient: false,
    minJunk: 0,
  },
  pgfplots: {
    colors: PGF,
    monoColors: MONO,
    dashes: VARIED,
    font: "'CMU Serif', 'Computer Modern', Georgia, 'Times New Roman', serif",
    serif: true,
    baseFontPx: 11,
    lineWidth: 1.0,
    ticksOut: false,
    frame: "box",
    gridColor: "#c8c8c8",
    gridAlways: false,
    legendBox: true,
    legendDefault: "best",
    barGradient: false,
    minJunk: 0,
  },
  excel: {
    colors: OFFICE,
    monoColors: MONO,
    dashes: SOLID_ONLY,
    font: "Calibri, 'Segoe UI', Arial, sans-serif",
    serif: false,
    baseFontPx: 11,
    lineWidth: 2.0,
    ticksOut: true,
    frame: "box",
    gridColor: "#d9d9d9",
    gridAlways: true,
    legendBox: false,
    legendDefault: "outside",
    barGradient: true,
    minJunk: 0.5,
  },
};

/** Marker cycle for non-ours series; the star is reserved for ours. */
const MARKER_CYCLE: readonly Marker[] = ["circle", "square", "triangle", "diamond", "cross", "plus"];

export interface SeriesStyle {
  color: number;
  marker: Marker;
  dash: Dash;
}

/** Style slot for the i-th series; ours always gets the star. */
export function seriesStyle(style: StyleName, mono: boolean, slot: number, role: Role): SeriesStyle {
  const spec = STYLES[style];
  const dashes = mono ? VARIED : spec.dashes;
  return {
    color: slot % (mono ? spec.monoColors.length : spec.colors.length),
    marker: role === "ours" ? "star" : MARKER_CYCLE[slot % MARKER_CYCLE.length],
    dash: dashes[slot % dashes.length],
  };
}

export function seriesColor(style: StyleName, mono: boolean, index: number): string {
  const spec = STYLES[style];
  const cycle = mono ? spec.monoColors : spec.colors;
  return cycle[index % cycle.length];
}

/** pgfplots equivalents, used by the TikZ renderer. */
export const TIKZ_MARKS: Record<Marker, string> = {
  circle: "*",
  square: "square*",
  triangle: "triangle*",
  diamond: "diamond*",
  star: "star",
  cross: "x",
  plus: "+",
  none: "none",
};

export const TIKZ_DASH: Record<Dash, string> = {
  solid: "solid",
  dashed: "dashed",
  dotted: "densely dotted",
  dashdot: "dash dot",
};

/** SVG stroke-dasharray patterns, scaled by line width. */
export function dashArray(dash: Dash, width: number): string | undefined {
  switch (dash) {
    case "solid": return undefined;
    case "dashed": return `${4 * width},${2.4 * width}`;
    case "dotted": return `${width},${1.8 * width}`;
    case "dashdot": return `${4 * width},${1.6 * width},${width},${1.6 * width}`;
  }
}
