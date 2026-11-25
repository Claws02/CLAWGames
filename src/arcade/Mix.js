// ============================================================
// MIX — which kind of games get dealt: a party's playlist, the TV's wheel.
//
// Every game has a GENRE (the registry's, shown on its card) and a LENGTH:
//   ⚡ QUICK   under a minute or so: most action minigames
//   ⏱ MEDIUM  1–3 minutes: golf, bowling, kart, pinball, the stacking games
//   🐢 LONG    3 minutes and up: the board games
// A length comes from an estimate in minutes (ESTIMATE below, else the game's
// shape and watchdog), which also gives a party its expected running time.
//
// A mix is a PRESET (Everything, Quick Fire, Board Game Night, Brain Teasers,
// Action Packed) or CUSTOM: any genres × any lengths. Each place that deals
// keeps its own mix (Mix.create('party'), Mix.create('tv')), saved per phone.
// ============================================================
import * as Store from './Store.js';
import * as Catalog from './Catalog.js';
// Namespace: a phone with an older cached registry still boots.
import * as Registry from '../claw-core/config/MinigameRegistry.js';

export const LENGTHS = {
    quick:  { icon: '⚡', name: 'QUICK',  sub: 'under a minute' },
    medium: { icon: '⏱', name: 'MEDIUM', sub: '1–3 min' },
    long:   { icon: '🐢', name: 'LONG',   sub: 'board games, 3–5 min' },
};

// Minutes a game takes at two players, intro and result included, where the
// shape and watchdog would guess wrong.
const ESTIMATE = {
    // board games
    yatzy: 6, shutbox: 3, pig: 3, dotsboxes: 3, mancala: 3.5, liarsdice: 4, biggrid: 3.5,
    kelpmaze: 3, clawrace: 3.5, hotdice: 3,
    // turn-based but short
    fourinarow: 2, memorymatch: 2, tidelines: 1.5, brainrot: 2.5, animalstack: 2,
    // the long action games
    minigolf: 2.5, bowling: 2.5, kartgp: 2.5, pinball: 2.5, penalty: 2, barrage: 2, shellgame: 1.5,
};
// Table games that are stacking games, not board games.
const NOT_BOARD = new Set(['brainrot', 'animalstack']);

/** About how many minutes one game of `type` takes. */
export function minutes(type) {
    if (ESTIMATE[type]) return ESTIMATE[type];
    if (isBoard(type)) return 3.5;
    const w = Registry.MG_WATCHDOG_MS?.[type] || 90000;
    return w <= 90000 ? 1 : 2;
}
export const lengthOf = type => { const m = minutes(type); return m < 1.25 ? 'quick' : m < 3 ? 'medium' : 'long'; };
export const isBoard = type => Registry.MG_SHAPE?.[type] === 'table' && !NOT_BOARD.has(type);
export const genreOf = type => Catalog.genreOf(type);

export const PRESETS = {
    everything: { icon: '🎉', name: 'EVERYTHING',       sub: 'every game that fits',     test: () => true },
    quick:      { icon: '⚡', name: 'QUICK FIRE',       sub: 'under a minute each',      test: t => lengthOf(t) === 'quick' },
    board:      { icon: '🎲', name: 'BOARD GAME NIGHT', sub: 'turn-based table games',   test: t => isBoard(t) },
    brain:      { icon: '🧠', name: 'BRAIN TEASERS',    sub: 'think, don\'t twitch',     test: t => genreOf(t) === 'brain' },
    action:     { icon: '💥', name: 'ACTION PACKED',    sub: 'fast hands, no boards',    test: t => !isBoard(t) && lengthOf(t) !== 'long' },
    custom:     { icon: '✏️', name: 'CUSTOM',           sub: 'pick genres and lengths',  test: null },
};

/** A mix kept under `key`: { preset, genres, lengths }, with what it allows. */
export function create(key) {
    const all = () => ({ preset: 'everything', genres: Object.keys(Catalog.MG_GENRES || {}), lengths: Object.keys(LENGTHS) });
    const saved = Store.load('mix.' + key, null);
    const s = { ...all(), ...(saved || {}) };
    if (!PRESETS[s.preset]) s.preset = 'everything';
    const save = () => Store.save('mix.' + key, { preset: s.preset, genres: s.genres, lengths: s.lengths });
    const m = {
        get state() { return s; },
        allows(type) {
            if (s.preset !== 'custom') return PRESETS[s.preset].test(type);
            return s.genres.includes(genreOf(type)) && s.lengths.includes(lengthOf(type));
        },
        /** The games of `list` this mix deals. */
        filter: list => list.filter(t => m.allows(t)),
        setPreset(id) { if (PRESETS[id]) { s.preset = id; save(); } },
        toggle(kind, id) {
            const arr = kind === 'genre' ? s.genres : s.lengths;
            const i = arr.indexOf(id);
            if (i >= 0) arr.splice(i, 1); else arr.push(id);
            s.preset = 'custom'; save();
        },
        /** The mix in words, for a hint line. */
        label() { const p = PRESETS[s.preset]; return `${p.icon} ${p.name}`; },
    };
    return m;
}

/** About how many minutes `games` games dealt from `list` will take, standings between them included. */
export function estimate(list, games) {
    if (!list.length) return 0;
    const avg = list.reduce((a, t) => a + minutes(t), 0) / list.length;
    return Math.max(1, Math.round(games * (avg + 0.3)));
}

/**
 * Balanced mixing: after a long game, deal something shorter when the pool
 * has it, so a mixed party never runs board game after board game.
 */
export function balance(list, lastType) {
    if (!lastType || lengthOf(lastType) !== 'long') return list;
    const short = list.filter(t => lengthOf(t) !== 'long');
    return short.length ? short : list;
}

/**
 * Paint a mix picker into `host`: the presets (with how many games each would
 * deal from `base`, empty ones hidden), and, for CUSTOM, a chip per genre and
 * length found in `base`. onChange() after every tap.
 */
export function paint(host, mix, base, onChange) {
    const s = mix.state;
    const count = id => (id === 'custom' ? null : base.filter(PRESETS[id].test).length);
    const presets = Object.entries(PRESETS).filter(([id]) => id === 'custom' || id === 'everything' || count(id) > 0);
    const genres = Object.entries(Catalog.MG_GENRES || {}).filter(([g]) => base.some(t => genreOf(t) === g));
    const lengths = Object.entries(LENGTHS).filter(([l]) => base.some(t => lengthOf(t) === l));
    host.innerHTML =
        `<div class="mix-presets">${presets.map(([id, p]) =>
            `<button class="mix-preset${s.preset === id ? ' sel' : ''}" data-preset="${id}"><span class="mi">${p.icon}</span><span class="ml bfont">${p.name}</span>` +
            `<span class="ms">${id === 'custom' ? p.sub : `${count(id)} games · ${p.sub}`}</span></button>`).join('')}</div>` +
        (s.preset === 'custom'
            ? `<div class="mix-custom"><div class="mix-row">${lengths.map(([l, L]) => `<button class="mix-chip${s.lengths.includes(l) ? ' on' : ''}" data-kind="length" data-id="${l}">${L.icon} ${L.name} <small>${L.sub}</small></button>`).join('')}</div>` +
              `<div class="mix-row">${genres.map(([g, G]) => `<button class="mix-chip g-${g}${s.genres.includes(g) ? ' on' : ''}" data-kind="genre" data-id="${g}">${G.name}</button>`).join('')}</div></div>`
            : '');
    host.querySelectorAll('.mix-preset').forEach(b => b.addEventListener('click', () => { mix.setPreset(b.dataset.preset); onChange(); }));
    host.querySelectorAll('.mix-chip').forEach(b => b.addEventListener('click', () => { mix.toggle(b.dataset.kind, b.dataset.id); onChange(); }));
}
