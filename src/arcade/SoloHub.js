// ============================================================
// SOLO HUB — the single-player games, behind one home-screen card.
//
//   home → SOLO GAMES → TODAY (the daily puzzles and the streak) + a card per
//   game with its best → a game (on its own screen for Critter Square, on the
//   shared 'sologame' screen for the rest).
//
// A game on the shared screen is a module with:
//   meta      { id, icon, title, blurb, daily? }
//   mount(el, { daily, seed, title(text) })   build itself inside `el` and run
//   unmount()                                 stop everything (timers, rAF, listeners)
//   bestText()                                one line for its card: "best 7 digs"
// ============================================================
import * as Solo from './SoloStats.js';
import * as CritterSquare from './CritterSquare.js';
import * as TreasureDig from './TreasureDig.js';
import * as Lighthouse from './Lighthouse.js';
import * as PearlDiver from './PearlDiver.js';
import * as Rebound from './Rebound.js';
import * as IceFloe from './IceFloe.js';
import * as Paths from './Paths.js';
import * as Coral from './Coral.js';
import * as Kite from './Kite.js';
import * as PrizeShelf from './PrizeShelf.js';
import * as Orbit from './Orbit.js';
import * as ReefDrop from './ReefDrop.js';
import * as Mirror from './Mirror.js';
import * as Toast from './Toast.js';
import * as Trophies from './Trophies.js';
import * as GameCards from './GameCards.js';
import * as Catalog from './Catalog.js';
import * as Arcade from './Solo.js';

const $ = id => document.getElementById(id);
export const GAMES = [Rebound, Orbit, ReefDrop, Mirror, IceFloe, Paths, TreasureDig, Lighthouse, Coral, Kite, PearlDiver];
const SCREENS = [...GAMES, PrizeShelf];   // everything that mounts on the shared screen
// Every game with a daily puzzle (Solo.todaysDailies picks three a day).
const DAILY = {
    critter: { icon: '🐾', title: 'Critter Square', levels: true },
    treasure: { icon: '💰', title: 'Treasure Dig' },
    lighthouse: { icon: '🗼', title: 'Lighthouse Beams', levels: true },
    icefloe: { icon: '🐧', title: 'Ice Floe', levels: true },
    paths: { icon: '🦑', title: 'Rock Pool Paths', levels: true },
    rebound: { icon: '🦪', title: 'Rebound' },
};
let _show = null, _game = null, _arcade = null, _arcadeGames = [];

/** show(screen); opts.arcade(type) plays one of the high-score games (opts.arcadeGames) and comes back here. */
export function init(show, opts = {}) {
    _show = show; _arcade = opts.arcade || null; _arcadeGames = opts.arcadeGames || [];
    Solo.onWon(() => Trophies.announce(1200));
}

/** The hub screen. */
export function open() {
    leaveGame();
    // Missed a day? A tide pass keeps the streak going.
    const spent = Solo.usePasses();
    if (spent) Toast.show(`🌊 ${spent === 1 ? 'A tide pass' : `${spent} tide passes`} saved your streak!`, '#38bdf8');
    const ids = Solo.todaysDailies(), level = Solo.dailyLevel();
    const streak = Solo.streak(), done = ids.filter(id => Solo.dailyDone(id)).length;
    $('solo-streak').textContent = (streak ? `🔥 ${streak} day${streak === 1 ? '' : 's'} in a row` : 'Solve one a day to start a streak') +
        ` · 🌊 ${Solo.passes()} tide pass${Solo.passes() === 1 ? '' : 'es'}`;
    $('solo-today-n').textContent = done === ids.length ? 'all done! 🌊' : `${done} of ${ids.length} · ${level}`;
    const today = $('solo-today');
    today.innerHTML = ids.map(id => { const g = DAILY[id], d = Solo.dailyDone(id);
        return `<button class="hub-day${d ? ' done' : ''}" data-daily="${id}"><span class="sd-ico">${g.icon}</span><span class="sd-t">${g.title}</span>` +
            `<span class="sd-s bfont">${d ? '✓ DONE' : g.levels ? level.toUpperCase() : 'PLAY'}</span></button>`; }).join('');
    today.querySelectorAll('[data-daily]').forEach(b => b.addEventListener('click', () => playDaily(b.dataset.daily)));

    const own = [PrizeShelf, { meta: { id: 'critter', icon: '🐾', title: 'Critter Square', blurb: 'Every row and column holds each critter once; fences point to the bigger one.' }, bestText: CritterSquare.bestText }, ...GAMES];
    const list = $('solo-list');
    const card = (id, icon, title, sub, extra = '') => `<div class="card has-clip solo-card${extra}" role="button" tabindex="0" data-game="${id}">${GameCards.media(id, icon)}` +
        `<span class="cn">${title}</span><span class="cs">${sub}</span></div>`;
    list.innerHTML =
        `<div class="grid-head">🧩 Puzzles & games</div>` +
        own.map(g => card(g.meta.id, g.meta.icon, g.meta.title, g.bestText() || 'not played yet', g === PrizeShelf ? ' shelf' : '')).join('') +
        (_arcade && _arcadeGames.length ? `<div class="grid-head">🕹️ Arcade · beat your high score</div>` +
            _arcadeGames.map(t => { const i = Catalog.MG_INFO[t], b = Arcade.best(t); return card(t, i.icon, i.title, b ? `🏆 ${Arcade.fmt(t, b.score)}` : 'no score yet', ' arcade'); }).join('') : '');
    list.querySelectorAll('[data-game]').forEach(b => b.addEventListener('click', () => _preview(b.dataset.game, own)));
    GameCards.watch(list);
}

// A tap on a card: the preview (the clip big, how to play, the best), then PLAY.
function _preview(id, own) {
    const g = own.find(x => x.meta.id === id);
    if (g) return GameCards.preview({ id, icon: g.meta.icon, title: g.meta.title, desc: g.meta.blurb, best: g.bestText() || '', onPlay: () => play(id) });
    const i = Catalog.MG_INFO[id], b = Arcade.best(id), gen = Catalog.genreOf(id);
    GameCards.preview({ id, icon: i.icon, title: i.title, tag: Catalog.MG_GENRES[gen]?.name || gen, tagClass: `g-${gen}`, desc: Catalog.descOf(id),
        best: b ? `🏆 Best ${Arcade.fmt(id, b.score)} · ${b.name}` : 'No score yet: set the first one!', onPlay: () => _arcade && _arcade(id) });
}

/** Open a game (not its daily). */
export function play(id, opts = {}) {
    if (id === 'critter') { _show('critter'); return; }
    const g = SCREENS.find(x => x.meta.id === id);
    if (!g) return;
    _show('sologame');
    leaveGame();
    _game = g;
    $('sg-title').textContent = opts.daily ? `${g.meta.title} · Daily` : g.meta.title;
    const body = $('sg-body');
    body.innerHTML = '';
    body.dataset.game = id;
    g.mount(body, { daily: !!opts.daily, seed: opts.seed, title: t => { $('sg-title').textContent = t; } });
}

/** Today's puzzle: the same for everyone today, from the date. */
export function playDaily(id) {
    const seed = Solo.dailySeed(id);
    if (id === 'critter') { _show('critter'); CritterSquare.startDaily(seed, Solo.dailyLevel()); return; }
    play(id, { daily: true, seed });
}

/** Leaving the game screen stops the game. */
export function leaveGame() {
    GameCards.stopAll(); GameCards.closePreview();
    if (!_game) return;
    try { _game.unmount(); } catch (e) { console.error('[solo] unmount', e); }
    _game = null;
}
