// ============================================================
// ICE FLOE — the screen. Rules and the level maker: IceFloeLogic.js.
//
// Swipe on the floe (or tap an arrow, or use the keyboard) to send the
// penguin sliding. It only stops at a rock, the edge, or a patch of snow, and
// it has to STOP on the fish. Par is the fewest slides; UNDO and RESET are free.
// ============================================================
import { LEVELS, ROCK, SNOW, DIRS, generate, slide, stars } from './IceFloeLogic.js';
import * as Solo from './SoloStats.js';
import * as Share from './Share.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'icefloe', icon: '🐧', title: 'Ice Floe', blurb: 'Slide the penguin across the ice. It only stops at rocks and snow. Stop on the fish!', daily: true };

let _el = null, _p = null, _at = 0, _moves = 0, _hist = [], _daily = false, _busy = false, _over = false, _offs = [], _setTitle = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };

export function bestText() {
    const w = Solo.count('icefloeWins');
    return w ? `${w} floe${w === 1 ? '' : 's'} · ${Solo.count('icefloe3')} in par` : '';
}

export function mount(el, opts = {}) {
    _el = el; _setTitle = opts.title || (() => {});
    if (opts.daily) return start(Solo.dailyLevel(), Solo.rng(opts.seed), true);
    _pick();
}
export function unmount() { _offs.splice(0).forEach(off => off()); _el = null; }

function _pick() {
    _offs.splice(0).forEach(off => off());
    _el.innerHTML = `<p class="lead sg-lead">Swipe to slide the penguin. It only stops at a <b>rock</b>, the <b>edge</b> or <b>snow</b>. Make it stop <b>on the fish</b> in as few slides as you can.</p>
        ${Object.entries(LEVELS).map(([id, L]) => `<button class="go-btn bfont cs-level" data-level="${id}">${L.label} <span>${L.w}×${L.h}</span><small>par ${L.par[0]}–${L.par[1]} slides</small></button>`).join('')}`;
    _el.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => start(b.dataset.level)));
}

/** A new floe at this level (daily: from today's seed). */
export function start(level, rnd = Math.random, daily = false) {
    _offs.splice(0).forEach(off => off());
    _p = generate(level, rnd); _at = _p.start; _moves = 0; _hist = []; _daily = daily; _busy = false; _over = false;
    _setTitle(daily ? 'Ice Floe · Daily' : 'Ice Floe');
    _el.innerHTML = `
        <div class="cs-top"><span class="bfont">${daily ? '📅 DAILY · ' : ''}${LEVELS[level].label}</span><span class="bfont" id="if-moves"></span>
            <span><button class="ghost-btn bfont if-small" id="btn-if-undo">↶</button><button class="ghost-btn bfont if-small" id="btn-if-reset">↺</button></span></div>
        <div class="if-board" id="if-board"></div>
        <div class="if-pad">
            <button class="cs-pet" data-dir="up" aria-label="Up">⬆️</button>
            <button class="cs-pet" data-dir="left" aria-label="Left">⬅️</button>
            <button class="cs-pet" data-dir="down" aria-label="Down">⬇️</button>
            <button class="cs-pet" data-dir="right" aria-label="Right">➡️</button>
        </div>
        <div class="cs-done" id="if-done" hidden>
            <div class="cs-done-h bfont" id="if-done-h"></div>
            <div class="cs-done-t bfont" id="if-done-t"></div>
            <div class="cs-done-best" id="if-done-best"></div>
            <button class="go-btn bfont" id="btn-if-again">ANOTHER FLOE</button>
            <button class="ghost-btn bfont" id="btn-if-levels">CHANGE LEVEL</button>
        </div>`;
    _build();
    _el.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => move(b.dataset.dir)));
    _el.querySelector('#btn-if-undo').addEventListener('click', undo);
    _el.querySelector('#btn-if-reset').addEventListener('click', reset);
    _el.querySelector('#btn-if-again').addEventListener('click', () => start(daily ? Solo.dailyLevel() : level));
    _el.querySelector('#btn-if-levels').addEventListener('click', _pick);
    // Swipes on the floe, and the arrow keys
    const b = _el.querySelector('#if-board');
    let sx = 0, sy = 0, down = false;
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(b, 'pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; e.preventDefault(); }, { passive: false });
    on(b, 'pointerup', e => {
        if (!down) return; down = false;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    on(window, 'keydown', e => { const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (d) { e.preventDefault(); move(d); } });
    _hud();
}

// The floe: a grid of squares, and the penguin on top, moved by transform.
function _build() {
    const b = _el.querySelector('#if-board'), { w, h, grid } = _p;
    b.style.setProperty('--w', w); b.style.setProperty('--h', h);
    b.style.gridTemplateColumns = `repeat(${w}, var(--cell))`;
    b.innerHTML = grid.map((v, k) => `<span class="if-sq${v === ROCK ? ' rock' : v === SNOW ? ' snow' : ''}">${v === ROCK ? '🪨' : k === _p.fish ? '🐟' : ''}</span>`).join('') +
        '<span class="if-peng" id="if-peng">🐧</span>';
    _place(false);
}

function _place(animate, cells = 0) {
    const pg = _el.querySelector('#if-peng'), w = _p.w;
    pg.style.transition = animate ? `transform ${Math.min(0.45, 0.06 + cells * 0.045)}s cubic-bezier(.3,.7,.4,1)` : 'none';
    pg.style.transform = `translate(calc(${_at % w} * (var(--cell) + 3px)), calc(${Math.floor(_at / w)} * (var(--cell) + 3px)))`;
}

/** Slide in a direction. Returns where it stopped. */
export function move(dir) {
    if (_over || _busy || !_p || !DIRS[dir]) return _at;
    const to = slide(_p, _p.grid, _at, dir);
    if (to === _at) { _sfx('land_bad'); return _at; }
    const cells = Math.abs(Math.floor(to / _p.w) - Math.floor(_at / _p.w)) + Math.abs((to % _p.w) - (_at % _p.w));
    _hist.push(_at); _at = to; _moves++;
    _place(true, cells);
    _busy = true;
    setTimeout(() => { _busy = false; }, Math.min(450, 60 + cells * 45));
    _sfx(_p.grid[to] === SNOW ? 'dice_land' : 'swap');
    try { Audio.haptic(12); } catch (e) {}
    _hud();
    if (to === _p.fish) setTimeout(_win, Math.min(450, 60 + cells * 45));
    return to;
}
export function undo() { if (_over || _busy || !_hist.length) return; _at = _hist.pop(); _moves++; _place(true, 1); _hud(); }
export function reset() { if (_over || _busy) return; _at = _p.start; _hist = []; _moves = 0; _place(false); _hud(); }

function _hud() { const m = _el && _el.querySelector('#if-moves'); if (m) m.textContent = `${_moves} / par ${_p.par}`; }

function _win() {
    if (!_el || _over) return;
    _over = true;
    const st = stars(_moves, _p.par);
    Solo.bump('icefloeWins');
    if (st === 3) Solo.bump('icefloe3');
    if (st === 3 && _p.level === 'hard') Solo.bump('icefloeHard3');
    const res = _daily ? Solo.solveDaily('icefloe') : null;
    _sfx('win'); Solo.won();
    const stars3 = `${'★'.repeat(st)}${'☆'.repeat(3 - st)}`;
    _el.querySelector('#if-done').hidden = false;
    _el.querySelector('#if-done-h').textContent = `${stars3} FISH!`;
    _el.querySelector('#if-done-t').textContent = `${_moves} slide${_moves === 1 ? '' : 's'} · par ${_p.par}`;
    _el.querySelector('#if-done-best').textContent = _daily ? Solo.dailyLine(res, "Today's floe") : st === 3 ? 'In par: perfect!' : `★★★ in ${_p.par} slides`;
    if (_daily) _el.querySelector('#if-done').insertBefore(Share.button(Share.dailyText('🐧 Ice Floe', `${_moves} slides (par ${_p.par}) ${stars3}`)), _el.querySelector('#btn-if-again'));
    _el.querySelector('#btn-if-again').textContent = _daily ? 'AN EXTRA FLOE' : 'ANOTHER FLOE';
    _el.querySelector('#if-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** Probes: the floe. */
export const _debug = () => (_p ? { p: _p, at: _at, moves: _moves, over: _over, busy: _busy } : null);
