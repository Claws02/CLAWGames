// ============================================================
// ROTATION — no game comes round again until the table has played every
// game it can. One deck per table size, saved, so it carries over between
// visits. Every way of playing deals from it (wheel, shuffle, draft, host
// picks) and every finished game, Quick Play included, is crossed off.
//
// When the deck runs out it starts again, minus the game just played, so a
// new cycle never opens with the game that closed the last one.
// ============================================================
import * as Catalog from './Catalog.js';
import * as Store from './Store.js';

const KEY = 'rotation';
const _deck = Store.load(KEY, {});            // { [tableSize]: { played: [type], last: type } }
const _slot = n => (_deck[n] ||= { played: [], last: null });

/** The games still to come round at a table of n. Never empty while any game fits. */
export function fresh(n) {
    const all = Catalog.eligible(n), s = _slot(n);
    const left = all.filter(t => !s.played.includes(t));
    if (left.length) return left;
    s.played = [];
    Store.save(KEY, _deck);
    const next = all.filter(t => t !== s.last);
    return next.length ? next : all;
}

/** Cross a finished game off the deck. */
export function mark(type, n) {
    const s = _slot(n);
    if (!s.played.includes(type)) s.played.push(type);
    s.last = type;
    Store.save(KEY, _deck);
}

/** How far through the deck this table is: { done, total }. */
export function progress(n) {
    const all = Catalog.eligible(n), s = _slot(n);
    return { done: all.filter(t => s.played.includes(t)).length, total: all.length };
}
