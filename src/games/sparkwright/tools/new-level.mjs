// usage: node tools/new-level.mjs <id> "<Name>" <world: mech|elec|drone> [order]
// Scaffolds levels/<id>-<slug>.js with a closed room and registers it in levels/index.js.
// Then edit it and run `node tools/check.mjs <id> --verbose` until 0 errors / 0 warnings.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../levels/index.js';

const [id, name, world = 'mech', orderArg] = process.argv.slice(2);
if (!id || !name) { console.log('usage: node tools/new-level.mjs <id> "<Name>" <world> [order]'); process.exit(1); }
if (LEVELS.some(l => l.id === id)) { console.log(`level ${id} already exists`); process.exit(1); }
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const order = orderArg ? +orderArg : Math.max(0, ...LEVELS.map(l => l.order)) + 1;
const file = `${id}-${slug}.js`;
const dir = new URL('../levels/', import.meta.url);
const path = fileURLToPath(new URL(file, dir));
if (existsSync(path)) { console.log(`${file} exists`); process.exit(1); }

const W = 22;
const row = inner => '#' + inner.padEnd(W - 2, '.') + '#';
const map = ['#'.repeat(W), ...Array.from({ length: 6 }, () => row('')), row('S').slice(0, W - 2) + 'G#', '#'.repeat(W)];
writeFileSync(path, `// ${name} — <one line: the idea, and the hand-worked device numbers>
export default {
    id: '${id}', world: '${world}', order: ${order}, name: '${name.replace(/'/g, "\\'")}',
    teaches: [], requires: ['move'],
    brief: 'State the requirement, never the answer.',
    map: [
${map.map(r => `        '${r}',`).join('\n')}
    ],
    parts: [],
    devices: [],
    solution: {},
    par: { seconds: 5 },
};
`);
const idx = fileURLToPath(new URL('index.js', dir));
let src = readFileSync(idx, 'utf8');
const v = id.replace(/[^A-Za-z0-9_]/g, '_');
src = src.replace(/(import [^\n]+\n)(?![\s\S]*import )/, `$1import ${v} from './${file}';\n`);
src = src.replace(/export const LEVELS = \[([^\]]*)\]/, (m, list) => `export const LEVELS = [${list.trim()}, ${v}]`);
writeFileSync(idx, src);
console.log(`created levels/${file} (order ${order}) and registered it. Next: node tools/check.mjs ${id} --verbose`);
