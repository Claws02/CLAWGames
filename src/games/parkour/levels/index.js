// The courses, in play order. Add one: create levels/<id>-<slug>.js, import it
// here, give it a door in base.js, run `node tools/check.mjs`, then `--write-tapes`.
import c1 from './c1-bounce-house.js';
import c2 from './c2-slick-tricks.js';
import c3 from './c3-swing-set.js';
import c4 from './c4-topsy-turvy.js';
import c5 from './c5-pinball-party.js';
import c6 from './c6-bubble-bath.js';
import c7 from './c7-train-set.js';
import c8 from './c8-tick-tock-clock.js';
import c9 from './c9-bookshelf-climb.js';
import c10 from './c10-paper-sky.js';
import c11 from './c11-pogo-park.js';
import c12 from './c12-toy-castle.js';
import c13 from './c13-sticky-hands.js';
import c14 from './c14-duck-pond.js';
import c15 from './c15-magic-boxes.js';
import c16 from './c16-grand-finale.js';
import base from './base.js';

/** The hub (the Toy Box). Not in COURSES: it has no goal, only doors. */
export const HUB = base;
export const COURSES = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16].sort((a, b) => a.order - b.order);
export const byId = Object.fromEntries(COURSES.map(c => [c.id, c]));
