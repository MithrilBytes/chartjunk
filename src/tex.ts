/**
 * Unicode label text to LaTeX. Labels live in the IR as plain Unicode so
 * every renderer can use them directly; TikZ and caption math runs map
 * through this table.
 */

const CHAR_MAP: readonly [string, string][] = [
  ["‖x − x*‖₂", "\\lVert x - x^{*} \\rVert_{2}"],
  ["×10³", "\\times 10^{3}"],
  ["μs / kg²", "\\mu\\mathrm{s} / \\mathrm{kg}^{2}"],
  ["a.u.²", "\\mathrm{a.u.}^{2}"],
  ["λ", "\\lambda"],
  ["μ", "\\mu"],
  ["τ", "\\tau"],
  ["★", "\\star"],
  ["∝", "\\propto"],
  ["√", "\\sqrt "],
  ["²", "^{2}"],
  ["³", "^{3}"],
  ["₂", "_{2}"],
  ["×", "\\times "],
  ["−", "-"],
  ["·", "\\cdot "],
];

/** True when the string needs math mode in TeX output. */
export function needsMath(s: string): boolean {
  return /[λμτ‖×−₂²³∝√·★]/.test(s);
}

/** Map a Unicode label to TeX math source (no surrounding dollars). */
export function texify(s: string): string {
  let out = s;
  for (const [from, to] of CHAR_MAP) out = out.split(from).join(to);
  return out;
}

/**
 * Text-mode TeX for a label: specials escaped, math tokens wrapped in
 * dollars. Multi-character tokens map first so their pieces never split.
 */
export function texText(s: string): string {
  let out = s
    .replaceAll("\\", "")
    .replaceAll("%", "\\%")
    .replaceAll("&", "\\&")
    .replaceAll("#", "\\#")
    .replaceAll("_", "\\_")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}");
  for (const [from, to] of CHAR_MAP) {
    out = out.split(from).join(`$${to}$`);
  }
  return out.replaceAll("$$", "");
}
