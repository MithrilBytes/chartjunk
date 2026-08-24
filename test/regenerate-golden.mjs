/**
 * Regenerates the golden SVGs. Run through "npm run snapshots" after an
 * intentional rendering change, and eyeball the diff before committing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chartjunk } from "../dist/index.js";
import { GOLDEN_CASES } from "./golden-cases.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "golden");
mkdirSync(dir, { recursive: true });
for (const { kind, seed } of GOLDEN_CASES) {
  const svg = chartjunk({ seed, kind, format: "svg" });
  const file = join(dir, `${kind}-${seed}.svg`);
  writeFileSync(file, svg);
  process.stdout.write(`wrote ${file}\n`);
}
