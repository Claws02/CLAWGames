// The campaign, in play order. Add a level: create levels/<id>-<slug>.js,
// import it here, run `node tools/check.mjs`, then `--write-tapes`.
import m01 from './m01-first-shift.js';
import m02 from './m02-spring-loaded.js';
import m03 from './m03-heavy-lifting.js';
import m04 from './m04-ohm-sweet-ohm.js';
import m05 from './m05-series-run.js';
import m06 from './m06-shift-change.js';

import base from './base.js';

/** The hub (Home Base). Not in LEVELS: it has no exit, only doors. */
export const HUB = base;
export const LEVELS = [m01, m02, m03, m04, m05, m06].sort((a, b) => a.order - b.order);
export const byId = Object.fromEntries(LEVELS.map(l => [l.id, l]));
