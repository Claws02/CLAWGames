// ============================================================
// ROCK POOL PATHS — the screen. Rules and the pool maker: PathsLogic.js.
//
// Drag from a critter to draw its path through the pool; reach its twin to
// join them. Drag back over a path to shorten it; drawing across another path
// cuts that one. Solved when every pair is joined and no square is left empty.
// ============================================================
import { LEVELS, CRITTERS, COLORS, generate, check } from './PathsLogic.js';
import * as Solo from './SoloStats.js';
import * as Share from './Share.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'paths', icon: '🦑', title: 'Rock Pool Paths', blurb: 'Join each pair of critters. Paths can\'t cross, and every square must be used.', daily: true };

let _el = null, _p = null, _paths = [], _draw = -1, _daily = false, _t0 = 0, _timer = 0, _over = false, _offs = [], _setTitle = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function bestText() {
    const lv = ['hard', 'medium', 'easy'].find(l => Solo.best(`paths:${l}`) != null);
    return lv ? `best ${LEVELS[lv].label.toLowerCase()} ${_fmt(Solo.best(`paths:${lv}`))}` : '';
}

export function mount(el, opts = {}) {
    _el = el; _setTitle = opts.title || (() => {});
    if (opts.daily) return start(Solo.dailyLevel(), Solo.rng(opts.seed), true);
    _pick();
}
export function unmount() { _stop(); _offs.splice(0).forEach(off => off()); _el = null; }
function _stop() { if (_timer) clearInterval(_timer); _timer = 0; }

function _pick() {
    _stop(); _offs.splice(0).forEach(off => off());
    _el.innerHTML = `<p class="lead sg-lead">Drag from a critter to its twin. Paths can't cross, and <b>every square</b> in the pool must be used.</p>
        ${Object.entries(LEVELS).map(([id, L]) => `<button class="go-btn bfont cs-level" data-level="${id}">${L.label} <span>${L.n}×${L.n}</span><small>${Solo.best(`paths:${id}`) != null ? `best ${_fmt(Solo.best(`paths:${id}`))}` : 'not solved yet'}</small></button>`).join('')}`;
    _el.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => start(b.dataset.level)));
}

/** A new pool at this level (daily: from today's seed). */
export function start(level, rnd = Math.random, daily = false) {
    _stop(); _offs.splice(0).forEach(off => off());
    _p = generate(level, rnd); _paths = _p.ends.map(() => []); _draw = -1; _daily = daily; _over = false;
    _setTitle(daily ? 'Rock Pool Paths · Daily' : 'Rock Pool Paths');
    _el.innerHTML = `
        <div class="cs-top"><span class="bfont">${daily ? '📅 DAILY · ' : ''}${LEVELS[level].label}</span><span class="cs-time bfont" id="pp-time">0:00</span><button class="ghost-btn bfont" id="btn-pp-clear">CLEAR</button></div>
        <div class="lh-status" id="pp-status"></div>
        <div class="pp-board" id="pp-board"></div>
        <div class="cs-done" id="pp-done" hidden>
            <div class="cs-done-h bfont">🦑 ALL JOINED!</div>
            <div class="cs-done-t bfont" id="pp-done-t"></div>
            <div class="cs-done-best" id="pp-done-best"></div>
            <button class="go-btn bfont" id="btn-pp-again">ANOTHER POOL</button>
            <button class="ghost-btn bfont" id="btn-pp-levels">CHANGE LEVEL</button>
        </div>`;
    const b = _el.querySelector('#pp-board');
    b.style.setProperty('--n', _p.n);
    _el.querySelector('#btn-pp-clear').addEventListener('click', () => { if (!_over) { _paths = _p.ends.map(() => []); _paint(); } });
    _el.querySelector('#btn-pp-again').addEventListener('click', () => start(daily ? Solo.dailyLevel() : level));
    _el.querySelector('#btn-pp-levels').addEventListener('click', _pick);
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(b, 'pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); begin(_cellAt(e)); }, { passive: false });
    on(b, 'pointermove', e => { if (_draw >= 0) extend(_cellAt(e)); });
    on(b, 'pointerup', () => end());
    on(b, 'pointercancel', () => end());
    _t0 = performance.now();
    _timer = setInterval(() => { const t = _el && _el.querySelector('#pp-time'); if (t) t.textContent = _fmt((performance.now() - _t0) / 1000); }, 250);
    _paint();
}

function _cellAt(e) {
    const r = _el.querySelector('#pp-board').getBoundingClientRect(), n = _p.n;
    const c = Math.floor((e.clientX - r.left) / (r.width / n)), rr = Math.floor((e.clientY - r.top) / (r.height / n));
    return c < 0 || c >= n || rr < 0 || rr >= n ? -1 : rr * n + c;
}
const _pairAt = k => _p.ends.findIndex(([a, b]) => a === k || b === k);
const _pathAt = k => _paths.findIndex(p => p.includes(k));
const _adj = (a, b) => Math.abs(Math.floor(a / _p.n) - Math.floor(b / _p.n)) + Math.abs(a % _p.n - b % _p.n) === 1;
const _joined = i => { const p = _paths[i], [a, b] = _p.ends[i]; return p.length > 1 && ((p[0] === a && p[p.length - 1] === b) || (p[0] === b && p[p.length - 1] === a)); };

/** Start drawing from square k: a critter starts its path afresh, a path square picks it up there. */
export function begin(k) {
    if (_over || k < 0) return;
    const pair = _pairAt(k);
    if (pair >= 0) { _paths[pair] = [k]; _draw = pair; }
    else {
        const i = _pathAt(k);
        if (i < 0) return;
        _paths[i] = _paths[i].slice(0, _paths[i].indexOf(k) + 1); _draw = i;
    }
    _paint();
}

/** Drag on to square k. */
export function extend(k) {
    if (_over || _draw < 0 || k < 0) return;
    const p = _paths[_draw], last = p[p.length - 1];
    if (k === last) return;
    const back = p.indexOf(k);
    if (back >= 0) { _paths[_draw] = p.slice(0, back + 1); return _paint(); }   // back over its own path
    if (!_adj(last, k) || _joined(_draw)) return;
    const pair = _pairAt(k);
    if (pair >= 0 && pair !== _draw) return;                                   // another critter: blocked
    const other = _pathAt(k);
    if (other >= 0 && other !== _draw) _paths[other] = _paths[other].slice(0, _paths[other].indexOf(k));   // cut it
    p.push(k);
    if (pair === _draw) { _sfx('land_good'); try { Audio.haptic(20); } catch (e) {} }
    _paint();
}

export function end() {
    if (_draw < 0) return;
    _draw = -1;
    if (check(_p.n, _p.ends, _paths).solved) _win();
}

function _paint() {
    if (!_el) return;
    const n = _p.n, b = _el.querySelector('#pp-board'), c = check(_p.n, _p.ends, _paths);
    let cells = '';
    for (let k = 0; k < n * n; k++) {
        const pair = _pairAt(k), i = c.used.has(k) ? c.used.get(k) : -1;
        cells += `<span class="pp-sq" style="${i >= 0 ? `background:${COLORS[i]}33` : ''}">${pair >= 0 ? `<b class="pp-end${_joined(pair) ? ' on' : ''}" style="background:${COLORS[pair]}">${CRITTERS[pair]}</b>` : ''}</span>`;
    }
    // The paths, as thick lines through the squares' centres.
    const lines = _paths.map((p, i) => (p.length > 1 ? `<polyline points="${p.map(k => `${(k % n) + 0.5},${Math.floor(k / n) + 0.5}`).join(' ')}" stroke="${COLORS[i]}" />` : '')).join('');
    b.innerHTML = cells + `<svg class="pp-svg" viewBox="0 0 ${n} ${n}" preserveAspectRatio="none">${lines}</svg>`;
    const joined = _p.ends.filter((_, i) => _joined(i)).length;
    _el.querySelector('#pp-status').textContent = `🔗 ${joined} of ${_p.ends.length} joined · ${Math.round((c.used.size / (n * n)) * 100)}% of the pool`;
}

function _win() {
    _over = true; _stop();
    const t = (performance.now() - _t0) / 1000;
    Solo.bump('pathsWins');
    if (_p.level === 'hard') Solo.bump('pathsHard');
    const isBest = !_daily && Solo.record(`paths:${_p.level}`, Math.round(t * 10) / 10, 'low');
    const res = _daily ? Solo.solveDaily('paths') : null;
    _sfx('win'); Solo.won();
    _el.querySelector('#pp-time').textContent = _fmt(t);
    _el.querySelector('#pp-done').hidden = false;
    _el.querySelector('#pp-done-t').textContent = _fmt(t);
    _el.querySelector('#pp-done-best').textContent = _daily ? Solo.dailyLine(res, "Today's pool") : isBest ? '🏅 NEW BEST TIME!' : `Best: ${_fmt(Solo.best(`paths:${_p.level}`))}`;
    if (_daily) _el.querySelector('#pp-done').insertBefore(Share.button(Share.dailyText('🦑 Rock Pool Paths', `${LEVELS[_p.level].label.toLowerCase()} in ${_fmt(t)}`)), _el.querySelector('#btn-pp-again'));
    _el.querySelector('#btn-pp-again').textContent = _daily ? 'AN EXTRA POOL' : 'ANOTHER POOL';
    _el.querySelector('#pp-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** Probes: the pool. */
export const _debug = () => (_p ? { p: _p, paths: _paths.map(x => x.slice()), over: _over } : null);
