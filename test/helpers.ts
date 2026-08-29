/**
 * Shared test machinery: a dependency-free XML well-formedness check and a
 * deep scan for numbers that should never appear in the IR.
 */

/** Returns null when well-formed, else a short reason. */
export function checkXml(s: string): string | null {
  const stack: string[] = [];
  let roots = 0;
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      if (badText(s.slice(i))) return `stray & or < after ${i}`;
      break;
    }
    if (badText(s.slice(i, lt))) return `stray & near ${i}`;
    const gt = s.indexOf(">", lt);
    if (gt === -1) return `unclosed tag at ${lt}`;
    const tag = s.slice(lt, gt + 1);
    const m = /^<(\/)?([A-Za-z][\w:-]*)((?:\s+[A-Za-z][\w:-]*="[^"<]*")*)\s*(\/)?>$/.exec(tag);
    if (!m) return `malformed tag ${tag.slice(0, 60)}`;
    const [, closing, name, , selfClose] = m;
    if (closing) {
      const open = stack.pop();
      if (open !== name) return `mismatched </${name}> after <${open}>`;
    } else if (!selfClose) {
      if (stack.length === 0) roots += 1;
      stack.push(name);
    } else if (stack.length === 0) {
      roots += 1;
    }
    i = gt + 1;
  }
  if (stack.length > 0) return `unclosed <${stack[stack.length - 1]}>`;
  if (roots !== 1) return `${roots} roots`;
  return null;
}

function badText(t: string): boolean {
  const noEntities = t.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, "");
  return noEntities.includes("&") || noEntities.includes("<");
}

/** Path of the first non-finite number anywhere in the value, or null. */
export function findNonFinite(v: unknown, path = "$"): string | null {
  if (typeof v === "number") {
    return Number.isFinite(v) ? null : path;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = findNonFinite(v[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      const r = findNonFinite(val, `${path}.${k}`);
      if (r) return r;
    }
    return null;
  }
  return null;
}

export const DIAL_CORNERS = [
  { density: 0, junk: 0, confidence: 0, gobbledygook: 0 },
  { density: 0.5, junk: 0.5, confidence: 0.5, gobbledygook: 0.5 },
  { density: 1, junk: 1, confidence: 1, gobbledygook: 1 },
  { density: 1, junk: 0, confidence: 1, gobbledygook: 0 },
  { density: 0, junk: 1, confidence: 0, gobbledygook: 1 },
] as const;

export const PLOT_KINDS = [
  "line", "scatter", "bar", "heatmap", "pareto", "phase",
  "roc", "profile", "bump", "radar", "violin", "panels",
] as const;
