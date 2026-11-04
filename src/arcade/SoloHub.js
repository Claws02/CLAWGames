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
import * as Toast from './Toast.js';
import * as Trophies from './Trophies.js';

const $ = id => document.getElementById(id);
export const GAMES = [IceFloe, Paths, TreasureDig, Lighthouse, Coral, Kite, PearlDiver, Rebound];
const SCREENS = [...GAMES, PrizeShelf];   // everything that mounts on the shared screen
// Every game with a daily puzzle (Solo.todaysDailies picks three a day).
const DAILY = {
    critter: { icon: '🐾', title: 'Critter Square', levels: true },
    treasure: { icon: '💰', title: 'Treasure Dig' },
    lighthouse: { icon: '🗼', title: 'Lighthouse Beams', levels: true },
    icefloe: { icon: '🐧', title: 'Ice Floe', levels: true },
    paths: { icon: '🦑', title: 'Rock Pool Paths', levels: true },
};
let _show = null, _game = null;

export function init(show) {
    _show = show;
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

    const cards = [PrizeShelf, { meta: { id: 'critter', icon: '🐾', title: 'Critter Square', blurb: 'Every row and column holds each critter once; fences point to the bigger one.' }, bestText: CritterSquare.bestText }, ...GAMES];
    const list = $('solo-list');
    list.innerHTML = cards.map(g => `<button class="hub-card${g === PrizeShelf ? ' shelf' : ''}" data-game="${g.meta.id}"><span class="sc-ico">${g.meta.icon}</span>` +
        `<span class="sc-txt"><span class="sc-t bfont">${g.meta.title}</span><span class="sc-b">${g.meta.blurb}</span>` +
        `<span class="sc-best">${g.bestText() || 'not played yet'}</span></span><span class="sc-go bfont">›</span></button>`).join('');
    list.querySelectorAll('[data-game]').forEach(b => b.addEventListener('click', () => play(b.dataset.game)));
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
    if (!_game) return;
    try { _game.unmount(); } catch (e) { console.error('[solo] unmount', e); }
    _game = null;
}
