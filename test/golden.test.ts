/**
 * Golden snapshots: byte-identical SVG for eight pinned seeds. After an
 * intentional rendering change, regenerate with "npm run snapshots" and
 * review the diff.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chartjunk } from "../src/index.js";
import type { Kind } from "../src/index.js";
// eslint-disable-next-line
// @ts-expect-error plain data module shared with the regenerate script
import { GOLDEN_CASES } from "./golden-cases.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "golden");

describe("golden snapshots", () => {
  for (const { kind, seed } of GOLDEN_CASES as { kind: Kind; seed: string }[]) {
    it(`${kind} (${seed})`, () => {
      const expected = readFileSync(join(dir, `${kind}-${seed}.svg`), "utf8");
      expect(chartjunk({ seed, kind, format: "svg" })).toBe(expected);
    });
  }
});
