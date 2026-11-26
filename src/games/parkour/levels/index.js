// The courses, in play order. Add one: create levels/<id>-<slug>.js, import it
// here, give it a door in base.js, run `node tools/check.mjs`, then `--write-tapes`.
import c1 from './c1-bounce-house.js';
import c2 from './c2-slick-tricks.js';
import c3 from './c3-swing-set.js';
import c4 from './c4-topsy-turvy.js';
import base from './base.js';

/** The hub (the Toy Box). Not in COURSES: it has no goal, only doors. */
export const HUB = base;
export const COURSES = [c1, c2, c3, c4].sort((a, b) => a.order - b.order);
export const byId = Object.fromEntries(COURSES.map(c => [c.id, c]));
