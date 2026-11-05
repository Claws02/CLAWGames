// ============================================================
// ICE FLOE — the screen. Rules and the level maker: IceFloeLogic.js.
//
// Swipe on the floe (or tap an arrow, or use the keyboard) to send the
// penguin sliding. It only stops at a rock, the edge, or a patch of snow, and
// it has to STOP on the fish. Par is the fewest slides; UNDO and RESET are free.
//
// The juice: the penguin waddles while it waits, leans into a slide (facing
// the way it goes) leaving an icy streak, squashes when it stops, bonks on a
// rock, kicks up a puff on snow and shakes its head at a wall; the fish flops;
// the ice glints; and on the fish it hops up and gobbles it.
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
    const crack = k => ((k * 7919) % 11 === 0 ? ' crack' : (k * 104729) % 13 === 0 ? ' crack2' : '');
    b.innerHTML = grid.map((v, k) => `<span class="if-sq${v === ROCK ? ' rock' : v === SNOW ? ' snow' : crack(k)}" style="--d:${((k % w) + Math.floor(k / w)) * 0.12}">${v === ROCK ? '<i class="if-rock">🪨</i>' : k === _p.fish ? '<i class="if-fish" id="if-fish">🐟</i>' : ''}</span>`).join('') +
        '<span class="if-peng" id="if-peng"><i class="if-peng-in" id="if-peng-in">🐧</i></span>';
    _face = 1;
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
    if (to === _at) { _sfx('land_bad'); _anim('nope', 400); return _at; }
    const cells = Math.abs(Math.floor(to / _p.w) - Math.floor(_at / _p.w)) + Math.abs((to % _p.w) - (_at % _p.w));
    const from = _at, dur = Math.min(450, 60 + cells * 45);
    _hist.push(_at); _at = to; _moves++;
    _trail(from, to, dur);
    _anim(`slide-${dir}`, dur);
    _place(true, cells);
    _busy = true;
    setTimeout(() => { _busy = false; }, dur);
    setTimeout(() => _landed(to, dir), dur);
    _sfx(_p.grid[to] === SNOW ? 'dice_land' : 'swap');
    try { Audio.haptic(12); } catch (e) {}
    _hud();
    if (to === _p.fish) setTimeout(_win, Math.min(450, 60 + cells * 45));
    return to;
}
export function undo() { if (_over || _busy || !_hist.length) return; _at = _hist.pop(); _moves++; _place(true, 1); _hud(); }
export function reset() { if (_over || _busy) return; _at = _p.start; _hist = []; _moves = 0; _place(false); _hud(); }

// The penguin's inner element plays one animation at a time (it faces left or right).
let _face = 1;
function _anim(name, ms) {
    const pg = _el && _el.querySelector('#if-peng-in');
    if (!pg) return;
    if (name === 'slide-left') _face = -1; else if (name === 'slide-right') _face = 1;
    pg.style.setProperty('--face', _face);
    pg.className = 'if-peng-in';
    void pg.offsetWidth;   // restart the animation
    pg.classList.add(name);
    clearTimeout(pg._t);
    if (ms) pg._t = setTimeout(() => { pg.classList.remove(name); }, ms + 40);
}
// What it stopped against: a rock (bonk), the edge (bump), or snow (a puff).
function _landed(k, dir) {
    if (!_el) return;
    const [dr, dc] = DIRS[dir], w = _p.w, r = Math.floor(k / w) + dr, c = (k % w) + dc;
    const out = r < 0 || c < 0 || r >= _p.h || c >= w, next = out ? -1 : r * w + c;
    if (_p.grid[k] === SNOW) { _anim('land', 380); _fx(k, ['❄️', '❄️', '✨'], 'puff'); }
    else if (!out && _p.grid[next] === ROCK) { _anim('bonk', 520); _fx(k, ['💫'], 'dizzy'); try { Audio.haptic([15, 30, 15]); } catch (e) {} }
    else _anim('land', 380);
}
// A little effect over square k: each emoji drifts off and fades.
function _fx(k, emojis, kind) {
    const b = _el.querySelector('#if-board'), w = _p.w;
    emojis.forEach((e, i) => {
        const s = document.createElement('i');
        s.className = `if-fx ${kind}`; s.textContent = e;
        s.style.setProperty('--x', k % w); s.style.setProperty('--y', Math.floor(k / w)); s.style.setProperty('--i', i - (emojis.length - 1) / 2);
        b.appendChild(s); setTimeout(() => s.remove(), 900);
    });
}
// An icy streak along the slide.
function _trail(a, b, ms) {
    const bd = _el.querySelector('#if-board'), w = _p.w;
    const r0 = Math.min(Math.floor(a / w), Math.floor(b / w)), r1 = Math.max(Math.floor(a / w), Math.floor(b / w));
    const c0 = Math.min(a % w, b % w), c1 = Math.max(a % w, b % w);
    const t = document.createElement('i');
    t.className = `if-trail ${r0 === r1 ? 'h' : 'v'}`;
    t.style.setProperty('--x', c0); t.style.setProperty('--y', r0); t.style.setProperty('--cw', c1 - c0 + 1); t.style.setProperty('--ch', r1 - r0 + 1);
    t.style.animationDuration = `${ms + 500}ms`;
    bd.insertBefore(t, bd.querySelector('#if-peng'));
    setTimeout(() => t.remove(), ms + 600);
}

function _hud() { const m = _el && _el.querySelector('#if-moves'); if (m) m.textContent = `${_moves} / par ${_p.par}`; }

function _win() {
    if (!_el || _over) return;
    _over = true;
    const st = stars(_moves, _p.par);
    _el.querySelector('#if-fish')?.classList.add('eaten');
    _anim('eat', 0);
    _fx(_at, ['💕', '💖', '💕'], 'love');
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
