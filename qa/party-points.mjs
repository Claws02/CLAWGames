// Party scoring rules. usage: node qa/party-points.mjs
import { pointsFor } from '../src/arcade/Party.js';
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? 'ok  ' : 'FAIL', m, JSON.stringify(a), ok ? '' : 'want ' + JSON.stringify(b)); if (!ok) process.exitCode = 1; };
eq(pointsFor(1, null, 2), [0, 3], '2P winner only');
eq(pointsFor(-1, null, 2), [2, 2], '2P draw shares 3+0 -> 1.5 rounds to 2');
eq(pointsFor(2, null, 4), [1, 1, 4, 1], '4P winner only: others share 2+1+0 -> 1 each');
eq(pointsFor(0, [9, 5, 7, 1], 4), [4, 1, 2, 0], '4P standings ranked');
eq(pointsFor(0, [9, 9, 3], 3), [3, 3, 0], '3P tie at top shares 4+2');
eq(pointsFor(0, [0, 0, 0, 0], 4), [4, 1, 1, 1], 'flat standings fall back to winner');
