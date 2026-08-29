import { describe, expect, it } from "vitest";
import { generateFigure, render } from "../src/index.js";
import type { Axis, Figure, Panel, Point } from "../src/index.js";
import { DIAL_CORNERS, PLOT_KINDS, findNonFinite } from "./helpers.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => `structure-${i}`);

function figures(): Figure[] {
  const out: Figure[] = [];
  for (const kind of PLOT_KINDS) {
    for (const seed of SEEDS) {
      for (const dials of DIAL_CORNERS) {
        out.push(generateFigure({ seed, kind, ...dials }));
      }
    }
  }
  return out;
}

function inRange(v: number, axis: Axis, eps: number): boolean {
  const [a, b] = axis.range;
  const span = Math.abs(b - a) || 1;
  return v >= a - span * eps && v <= b + span * eps;
}

function pointAxisValues(p: Point): number[] {
  const out = [p.y];
  if (p.lo !== undefined) out.push(p.lo);
  if (p.hi !== undefined) out.push(p.hi);
  return out;
}

describe("structure invariants", () => {
  const figs = figures();

  it("legend entries resolve; the orphan is exactly one", () => {
    for (const fig of figs) {
      const cross = fig.artifacts.includes("orphan-cross-panel");
      const orphaned = fig.artifacts.includes("orphan-legend");
      let nulls = 0;
      let foreign = 0;
      for (const panel of fig.panels) {
        const ids = new Set(panel.series.map((s) => s.id));
        const allIds = new Set(fig.panels.flatMap((p) => p.series.map((s) => s.id)));
        for (const e of panel.legend.entries) {
          if (e.seriesId === null) {
            nulls += 1;
          } else if (!ids.has(e.seriesId)) {
            expect(allIds.has(e.seriesId), `${fig.seed}: entry points nowhere`).toBe(true);
            foreign += 1;
          }
        }
      }
      if (cross) {
        expect(foreign, fig.seed).toBe(1);
        expect(nulls, fig.seed).toBe(0);
      } else if (orphaned) {
        expect(nulls, fig.seed).toBe(1);
        expect(foreign, fig.seed).toBe(0);
      } else {
        expect(nulls + foreign, fig.seed).toBe(0);
      }
    }
  });

  it("every point lies inside its axis range", () => {
    for (const fig of figs) {
      for (const panel of fig.panels) {
        for (const s of panel.series) {
          const yAxis = s.y2 && panel.y2 ? panel.y2 : panel.y;
          for (const p of s.points) {
            expect(inRange(p.x, panel.x, 1e-9), `${fig.seed}/${fig.kind} x=${p.x}`).toBe(true);
            for (const v of pointAxisValues(p)) {
              expect(inRange(v, yAxis, 1e-9), `${fig.seed}/${fig.kind}/${s.id} y=${v}`).toBe(true);
            }
          }
        }
        for (const rg of panel.regions) {
          for (const p of rg.polygon) {
            expect(inRange(p.x, panel.x, 1e-6), `${fig.seed} region x`).toBe(true);
            expect(inRange(p.y, panel.y, 1e-6), `${fig.seed} region y`).toBe(true);
          }
        }
      }
    }
  });

  it("log axes are strictly positive with power-of-ten ticks", () => {
    for (const fig of figs) {
      for (const panel of fig.panels) {
        for (const axis of [panel.x, panel.y, panel.y2].filter(Boolean) as Axis[]) {
          const sorted = [...axis.ticks].sort((a, b) => a - b);
          expect(axis.ticks, `${fig.seed} ticks sorted`).toEqual(sorted);
          for (const t of axis.ticks) {
            expect(inRange(t, axis, 1e-9), `${fig.seed} tick in range`).toBe(true);
          }
          if (axis.scale !== "log") continue;
          expect(axis.range[0], fig.seed).toBeGreaterThan(0);
          for (const t of axis.ticks) {
            const e = Math.log10(t);
            expect(Math.abs(e - Math.round(e)), `${fig.seed} tick ${t}`).toBeLessThan(1e-9);
          }
          for (const s of panel.series) {
            if (s.y2 && panel.y2 !== axis) continue;
            for (const p of s.points) {
              const v = axis === panel.x ? p.x : p.y;
              expect(v, `${fig.seed} log positive`).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("exactly one bold ours where the kind has methods", () => {
    const oursKinds = [
      "line", "scatter", "bar", "pareto", "roc", "profile", "bump", "radar",
      "violin", "histogram", "waterfall",
    ];
    for (const fig of figs) {
      for (const panel of fig.panels) {
        const ours = panel.series.filter((s) => s.role === "ours");
        if (oursKinds.includes(panel.kind)) {
          expect(ours.length, `${fig.seed}/${panel.kind}`).toBe(1);
          expect(ours[0].bold, fig.seed).toBe(true);
        } else {
          expect(ours.length, `${fig.seed}/${panel.kind}`).toBe(0);
        }
      }
    }
  });

  it("violin stats sit inside their axis range", () => {
    for (const fig of figs) {
      for (const panel of fig.panels) {
        for (const s of panel.series) {
          if (!s.stats) continue;
          for (const v of [s.stats.median, s.stats.q1, s.stats.q3]) {
            expect(inRange(v, panel.y, 1e-9), `${fig.seed} stat ${v}`).toBe(true);
          }
          expect(s.stats.q1).toBeLessThanOrEqual(s.stats.median);
          expect(s.stats.median).toBeLessThanOrEqual(s.stats.q3);
        }
      }
    }
  });

  it("a broken gap contains no points", () => {
    for (const fig of figs) {
      for (const panel of fig.panels) {
        const gap = panel.y.broken;
        if (!gap) continue;
        expect(gap[0]).toBeLessThan(gap[1]);
        expect(inRange(gap[0], panel.y, 1e-9)).toBe(true);
        expect(inRange(gap[1], panel.y, 1e-9)).toBe(true);
        for (const s of panel.series) {
          if (s.y2) continue;
          for (const p of s.points) {
            for (const v of pointAxisValues(p)) {
              const inside = v > gap[0] && v < gap[1];
              expect(inside, `${fig.seed} value ${v} in gap [${gap}]`).toBe(false);
            }
          }
        }
      }
    }
  });

  it("no NaN anywhere in the IR or in rendered output", () => {
    for (const fig of figs) {
      expect(findNonFinite(fig), fig.seed).toBeNull();
      const svg = render(fig, "svg");
      expect(svg.includes("NaN"), `${fig.seed} svg NaN`).toBe(false);
      expect(svg.includes("undefined"), `${fig.seed} svg undefined`).toBe(false);
      expect(svg.includes("Infinity"), `${fig.seed} svg Infinity`).toBe(false);
    }
  });

  it("panel labels run (a) through (f) and match the count", () => {
    for (const fig of figs) {
      if (fig.kind !== "panels") continue;
      expect(fig.panels.length).toBeGreaterThanOrEqual(2);
      expect(fig.panels.length).toBeLessThanOrEqual(6);
      fig.panels.forEach((p: Panel, i: number) => {
        expect(p.label).toBe(`(${"abcdef"[i]})`);
      });
    }
  });
});
