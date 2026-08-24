/**
 * The Figure IR, verbatim. For the theorem-ipsum plugin and debugging.
 */
import type { Figure } from "../types.js";

export function renderJson(fig: Figure): string {
  return JSON.stringify(fig, null, 2) + "\n";
}
