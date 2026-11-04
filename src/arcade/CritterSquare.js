// ============================================================
// CRITTER SQUARE — a little pet logic puzzle for one. The rules and the
// puzzle maker are in CritterLogic.js; this is the screen.
//
//   pick a level (Easy 4×4 · Medium 5×5 · Hard 6×6) → tap a square, tap a
//   critter → every row and column holds each critter once, and every fence
//   opens towards the bigger critter → SOLVED, with your time and your best.
//
// Squares that break a rule glow red as soon as they do. 💡 HINT fills in one
// square (the one picked, or one that's empty or wrong). A puzzle left half
// done is still there to CONTINUE until a new one is started.
// ============================================================
import { CRITTERS, NAMES, LEVELS, generate, conflicts, solved } from './CritterLogic.js';
import * as Store from './Store.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

const $ = id => document.getElementById(id);
let _p = null;          // the puzzle: { level, n, solution, givens, fences }
let _grid = [];         // what's on the board now
let _sel = -1;          // the picked square
let _t0 = 0, _paused = 0, _hints = 0, _done = false, _timer = 0;
let _daily = false;     // today's puzzle (SoloHub's TODAY): Medium, from the date

const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _buzz = p => { try { Audio.haptic(p); } catch (e) {} };
const _bests = () => Store.load('critterBest', {});
const _fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const _secs = () => (_done ? _paused : _paused + (performance.now() - _t0) / 1000);

/** Shown when the screen opens: the levels, and CONTINUE if a puzzle is half done. */
export function open() {
    _stopClock();
    $('cs-pick').hidden = false; $('cs-play').hidden = true;
    const best = _bests();
    document.querySelectorAll('#cs-pick .cs-level').forEach(b => {
        const L = LEVELS[b.dataset.level];
        b.innerHTML = `${L.label} <span>${L.n}×${L.n}</span><small>${best[b.dataset.level] ? `best ${_fmt(best[b.dataset.level])}` : 'not solved yet'}</small>`;
    });
    // A daily is played from TODAY; the level picker only continues an ordinary puzzle.
    $('btn-cs-continue').hidden = !(_p && !_done && !_daily);
    if (_p && !_done) $('btn-cs-continue').textContent = `▶ CONTINUE ${LEVELS[_p.level].label} · ${_fmt(_paused)}`;
    _paintSizes($('cs-sizes'), 6);
}

/** Leaving the screen pauses the clock. */
export function leave() { _stopClock(); }

export function init() {
    document.querySelectorAll('#cs-pick .cs-level').forEach(b => b.addEventListener('click', () => start(b.dataset.level)));
    $('btn-cs-continue').addEventListener('click', () => _resume());
    $('btn-cs-hint').addEventListener('click', hint);
    $('btn-cs-again').addEventListener('click', () => start(_p.level));   // after a daily: an ordinary one
    $('btn-cs-levels').addEventListener('click', open);
    document.addEventListener('visibilitychange', () => { if (document.hidden) _stopClock(); else if (!$('cs-play').hidden && !_done && !$('scr-critter').hidden) _startClock(); });
}

/** One line for the SOLO hub's card: the best time at the hardest level solved. */
export function bestText() {
    const b = _bests();
    const lv = ['hard', 'medium', 'easy'].find(l => b[l]);
    return lv ? `best ${LEVELS[lv].label.toLowerCase()} ${_fmt(b[lv])}` : '';
}

/** Today's puzzle: a Medium square from the date's seed, the same on every phone. */
export function startDaily(seed) { start('medium', Solo.rng(seed), true); }

/** A new puzzle at this level. */
export function start(level, rnd = Math.random, daily = false) {
    _daily = daily;
    _p = generate(level, rnd);
    _grid = _p.givens.slice();
    _sel = _grid.indexOf(-1);
    _hints = 0; _done = false; _paused = 0;
    _resume();
}

function _resume() {
    $('cs-pick').hidden = true; $('cs-play').hidden = false; $('cs-done').hidden = true; $('cs-tray').hidden = false;
    $('cs-level').textContent = `${_daily ? '📅 DAILY' : LEVELS[_p.level].label} · ${_p.n}×${_p.n}`;
    _paintSizes($('cs-sizes2'), _p.n);
    _paintTray();
    _paint();
    _startClock();
}

function _startClock() {
    _stopClock();
    if (!_p || _done) return;
    _t0 = performance.now();
    _timer = setInterval(() => { $('cs-time').textContent = _fmt(_secs()); }, 250);
    $('cs-time').textContent = _fmt(_secs());
}
function _stopClock() {
    if (_timer) { clearInterval(_timer); _timer = 0; _paused = _secs(); }
}

// "🐭 < 🐱 < 🐶 …": the size order, always on screen.
function _paintSizes(el, n) {
    el.innerHTML = CRITTERS.slice(0, n).map((c, i) => `<span title="${NAMES[i]}">${c}</span>`).join('<i>&lt;</i>');
    el.setAttribute('aria-label', `Smallest to biggest: ${NAMES.slice(0, n).join(', ')}`);
}

function _paintTray() {
    const t = $('cs-tray');
    t.innerHTML = CRITTERS.slice(0, _p.n).map((c, v) => `<button class="cs-pet" data-v="${v}" aria-label="${NAMES[v]}">${c}</button>`).join('') +
        '<button class="cs-pet cs-erase" data-v="-1" aria-label="Clear">⌫</button>';
    t.querySelectorAll('.cs-pet').forEach(b => b.addEventListener('click', () => place(+b.dataset.v)));
}

// The board is a (2n-1)×(2n-1) grid: squares on even tracks, fences between them.
function _paint() {
    const n = _p.n, b = $('cs-board');
    const bad = conflicts(n, _grid, _p.fences);
    const fence = {};
    _p.fences.forEach(f => { fence[`${f.a}-${f.b}`] = f; });
    b.style.setProperty('--n', n);
    // Plain numbers here: a calc() repeat count isn't safe on every Safari.
    b.style.gridTemplateColumns = b.style.gridTemplateRows = `repeat(${n - 1}, var(--sq) var(--gap)) var(--sq)`;
    let html = '';
    for (let R = 0; R < 2 * n - 1; R++) for (let C = 0; C < 2 * n - 1; C++) {
        const r = R >> 1, c = C >> 1;
        if (R % 2 === 0 && C % 2 === 0) {
            const k = r * n + c, v = _grid[k], given = _p.givens[k] >= 0;
            html += `<button class="cs-sq${given ? ' given' : ''}${k === _sel ? ' sel' : ''}${bad.has(k) ? ' bad' : ''}" data-k="${k}" aria-label="Row ${r + 1}, column ${c + 1}: ${v >= 0 ? NAMES[v] : 'empty'}">${v >= 0 ? CRITTERS[v] : ''}</button>`;
        } else if (R % 2 === 0) {
            const f = fence[`${r * n + c}-${r * n + c + 1}`];
            // The open side faces the bigger critter: '>' when the left one is bigger.
            html += `<span class="cs-fence h">${f ? `<b>${f.big === 'a' ? '&gt;' : '&lt;'}</b>` : ''}</span>`;
        } else if (C % 2 === 0) {
            const f = fence[`${r * n + c}-${(r + 1) * n + c}`];
            html += `<span class="cs-fence v">${f ? `<b>${f.big === 'a' ? '∨' : '∧'}</b>` : ''}</span>`;
        } else html += '<span></span>';
    }
    b.innerHTML = html;
    b.querySelectorAll('.cs-sq').forEach(el => el.addEventListener('click', () => pick(+el.dataset.k)));
    $('cs-tray').querySelectorAll('.cs-pet').forEach(el => { el.disabled = _done || _sel < 0 || _p.givens[_sel] >= 0; });
    $('btn-cs-hint').textContent = `💡 HINT${_hints ? ` (${_hints})` : ''}`;
    $('btn-cs-hint').disabled = _done;
}

/** Pick a square. A filled-in starting square can't be picked. */
export function pick(k) {
    if (_done || _p.givens[k] >= 0) return;
    _sel = k;
    _paint();
}

/** Put a critter (or -1: clear) in the picked square. */
export function place(v) {
    if (_done || _sel < 0 || _p.givens[_sel] >= 0) return;
    _grid[_sel] = _grid[_sel] === v ? -1 : v;   // the same critter again takes it out
    _buzz(12);
    if (conflicts(_p.n, _grid, _p.fences).has(_sel)) _sfx('land_bad');
    _check();
}

/** Fill one square correctly: the picked one if it's empty or wrong, else the first that is. */
export function hint() {
    if (_done) return;
    const wrong = k => _p.givens[k] < 0 && _grid[k] !== _p.solution[k];
    const k = _sel >= 0 && wrong(_sel) ? _sel : _grid.findIndex((_, i) => wrong(i));
    if (k < 0) return;
    _grid[k] = _p.solution[k];
    _sel = k;
    _hints++;
    _check();
}

function _check() {
    if (solved(_p.n, _grid, _p.fences)) return _win();
    // Move on to the next empty square after a correct-looking placement.
    if (_grid[_sel] >= 0 && !conflicts(_p.n, _grid, _p.fences).has(_sel)) {
        const n2 = _p.n * _p.n;
        for (let i = 1; i <= n2; i++) { const k = (_sel + i) % n2; if (_grid[k] < 0) { _sel = k; break; } }
    }
    _paint();
}

function _win() {
    _stopClock();
    _done = true; _sel = -1;
    const t = _paused, best = _bests(), prev = best[_p.level];
    // A best time only counts without hints.
    const isBest = !_daily && !_hints && (!prev || t < prev);
    Solo.bump('critterSolved');
    if (_p.level === 'hard' && !_hints) Solo.bump('critterHard');
    const firstDaily = _daily && Solo.solveDaily('critter');
    if (isBest) { best[_p.level] = Math.round(t * 10) / 10; Store.save('critterBest', best); }
    _sfx('win');
    Solo.won();
    _paint();
    $('cs-time').textContent = _fmt(t);
    $('cs-done').hidden = false;
    $('cs-tray').hidden = true;   // nothing left to place: the card takes its spot
    $('cs-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    $('cs-done-t').textContent = `${_fmt(t)}${_hints ? ` · ${_hints} hint${_hints === 1 ? '' : 's'}` : ''}`;
    $('cs-done-best').textContent = _daily ? (firstDaily ? `📅 Today's puzzle solved! Streak: ${Solo.streak()}` : "📅 Today's puzzle: already solved.")
        : isBest ? '🏅 NEW BEST TIME!' : _hints ? 'Solve one without hints to set a best time.' : `Best: ${_fmt(prev)}`;
    $('btn-cs-again').textContent = _daily ? 'A NEW MEDIUM PUZZLE' : 'NEXT PUZZLE';
}

/** For probes: the puzzle on screen. */
export const _debug = () => ({ p: _p, grid: _grid.slice(), sel: _sel, done: _done, hints: _hints });
