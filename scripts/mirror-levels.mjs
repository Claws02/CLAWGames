// Makes the 30 Mirror Lagoon levels into src/arcade/MirrorLevels.js (the par
// search is too slow for a phone). Seeded, so a rerun makes the same levels.
// usage: node scripts/mirror-levels.mjs
import { writeFileSync } from 'fs';
import { make, LEVEL_COUNT, recipe } from '../src/arcade/MirrorLogic.js';
import { rng, hash } from '../src/arcade/SoloStats.js';

const levels = [];
for (let i = 0; i < LEVEL_COUNT; i++) {
    const rnd = rng(hash(`mirror2:${i}`));
    let lv = null, tries = 0;
    while (!lv) { lv = make(i, rnd); tries++; if (tries > 20000) throw new Error(`level ${i + 1}: nothing after ${tries} tries`); }
    const R = recipe(i);
    console.log(`${String(i + 1).padStart(2)}. ${lv.w}×${lv.h}  ${Object.keys(lv.mirrors).length} mirrors + ${Object.keys(lv.fixed).length} bolted  ${lv.lanterns.length} lanterns (${lv.lanterns.map(l => l.c).join('')})  ${lv.glass.length} glass  ${lv.rocks.length} rocks  par ${lv.par} (wanted ${R.minPar}–${R.maxPar})  ${tries} tries`);
    levels.push(lv);
}
writeFileSync(new URL('../src/arcade/MirrorLevels.js', import.meta.url), `// ============================================================
// MIRROR LAGOON LEVELS — made by scripts/mirror-levels.mjs (each par found by
// an exact search: MirrorLogic.par). Don't edit by hand; qa/aimgames.mjs
// re-proves every one.
// ============================================================
export const LEVELS = ${JSON.stringify(levels)};
`);
console.log('wrote src/arcade/MirrorLevels.js');
