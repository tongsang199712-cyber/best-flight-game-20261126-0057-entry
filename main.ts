// Kestrel Valley — hand-in program for the make.fun "best flight game" bounty.
//
// The deliverable is the static game under game/ plus its screenshots under
// screenshots/. This program copies both into the output directory and writes
// dossier.json there with the vendored make.fun library, byte for byte the
// way the gate rebuilds it. It runs on Node 22 with the standard library
// only, does no network access, and writes the same bytes on every run.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the game first, then the screenshots, in a fixed order so two runs
// over the same repository produce identical output trees.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the gate's own limits (reference/gate.json): they do
// not shape the game, they only refuse to hand in an entry the scorer would
// refuse anyway — too many screenshots, an oversized game tree, or a path
// long enough to crowd /output's own 1,000-entry budget.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
