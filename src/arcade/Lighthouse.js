// ============================================================
// LIGHTHOUSE BEAMS — the screen. Rules and the puzzle maker: LighthouseLogic.js.
//
// Tap sea to build a lighthouse (tap again to take it down). Its beams light
// the row and column until a rock. A boat lit once turns green, lit twice turns
// red; lighthouses that shine on each other turn red; one that lights no boat
// is outlined. Solved when every boat is lit exactly once.
// ============================================================
import { LEVELS, SEA, ROCK, BOAT, generate, check } from './LighthouseLogic.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'lighthouse', icon: '🗼', title: 'Lighthouse Beams', blurb: 'Light every boat exactly once. Lighthouses must never shine on each other.', daily: true };

let _el = null, _p = null, _lights = [], _daily = false, _hints = 0, _t0 = 0, _timer = 0, _over = false, _setTitle = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function bestText() {
    const lv = ['hard', 'medium', 'easy'].find(l => Solo.best(`lighthouse:${l}`) != null);
    return lv ? `best ${LEVELS[lv].label.toLowerCase()} ${_fmt(Solo.best(`lighthouse:${lv}`))}` : '';
}

export function mount(el, opts = {}) {
    _el = el; _setTitle = opts.title || (() => {});
    if (opts.daily) return start('medium', Solo.rng(opts.seed), true);
    _pick();
}
export function unmount() { _stop(); _el = null; }

function _stop() { if (_timer) clearInterval(_timer); _timer = 0; }

function _pick() {
    _stop();
    _el.innerHTML = `
        <p class="lead sg-lead">Tap the sea to build lighthouses. Beams shine along the row and column until a rock.</p>
        <ul class="lh-rules"><li>Every <b>⛵ boat</b> lit by exactly <b>one</b> lighthouse</li><li>No lighthouse shines on <b>another</b></li><li>Every lighthouse lights a boat</li></ul>
        ${Object.entries(LEVELS).map(([id, L]) => `<button class="go-btn bfont cs-level" data-level="${id}">${L.label} <span>${L.n}×${L.n}</span><small>${Solo.best(`lighthouse:${id}`) != null ? `best ${_fmt(Solo.best(`lighthouse:${id}`))}` : 'not solved yet'}</small></button>`).join('')}`;
    _el.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => start(b.dataset.level)));
}

/** A new puzzle at this level (daily: from today's seed, the same on every phone). */
export function start(level, rnd = Math.random, daily = false) {
    _p = generate(level, rnd); _lights = []; _daily = daily; _hints = 0; _over = false;
    _setTitle(daily ? 'Lighthouse Beams · Daily' : 'Lighthouse Beams');
    _el.innerHTML = `
        <div class="cs-top"><span class="bfont">${daily ? '📅 DAILY' : LEVELS[level].label} · ${_p.n}×${_p.n}</span><span class="cs-time bfont" id="lh-time">0:00</span><button class="ghost-btn bfont" id="btn-lh-hint">💡 HINT</button></div>
        <div class="lh-status" id="lh-status"></div>
        <div class="lh-board" id="lh-board" style="--n:${_p.n}"></div>
        <div class="cs-done" id="lh-done" hidden>
            <div class="cs-done-h bfont">🗼 ALL BOATS SAFE!</div>
            <div class="cs-done-t bfont" id="lh-done-t"></div>
            <div class="cs-done-best" id="lh-done-best"></div>
            <button class="go-btn bfont" id="btn-lh-again">ANOTHER COAST</button>
            <button class="ghost-btn bfont" id="btn-lh-levels">CHANGE LEVEL</button>
        </div>`;
    _el.querySelector('#btn-lh-hint').addEventListener('click', hint);
    _el.querySelector('#btn-lh-again').addEventListener('click', () => start(daily ? 'medium' : level));
    _el.querySelector('#btn-lh-levels').addEventListener('click', _pick);
    _t0 = performance.now();
    _timer = setInterval(() => { const t = _el && _el.querySelector('#lh-time'); if (t) t.textContent = _fmt((performance.now() - _t0) / 1000); }, 250);
    _paint();
}

/** Build or take down a lighthouse on square k. */
export function toggle(k) {
    if (_over || !_p || _p.grid[k] !== SEA) return;
    const i = _lights.indexOf(k);
    if (i >= 0) _lights.splice(i, 1); else _lights.push(k);
    try { Audio.haptic(10); } catch (e) {}
    const c = check(_p.n, _p.grid, _lights);
    if (i < 0 && (c.clash.has(k) || c.twice.length)) _sfx('land_bad');
    if (c.solved) return _win();
    _paint();
}

/** Take down a wrong lighthouse, or else build one that belongs. */
export function hint() {
    if (_over || !_p) return;
    const wrong = _lights.find(l => !_p.solution.includes(l));
    const missing = _p.solution.find(l => !_lights.includes(l));
    if (wrong != null) _lights.splice(_lights.indexOf(wrong), 1);
    else if (missing != null) _lights.push(missing);
    else return;
    _hints++;
    if (check(_p.n, _p.grid, _lights).solved) return _win();
    _paint();
}

function _paint() {
    if (!_el) return;
    const n = _p.n, c = check(n, _p.grid, _lights), b = _el.querySelector('#lh-board');
    let html = '';
    for (let k = 0; k < n * n; k++) {
        const v = _p.grid[k];
        if (v === ROCK) { html += '<span class="lh-sq rock">🪨</span>'; continue; }
        if (v === BOAT) {
            const h = c.boatHits[k] || 0;
            html += `<span class="lh-sq boat${h === 1 ? ' ok' : h > 1 ? ' bad' : ''}${c.lit.has(k) ? ' lit' : ''}">⛵</span>`;
            continue;
        }
        const L = _lights.includes(k);
        html += `<button class="lh-sq sea${c.lit.has(k) ? ' lit' : ''}${L ? ' light' : ''}${c.clash.has(k) ? ' bad' : ''}${c.idle.has(k) ? ' idle' : ''}" data-k="${k}" aria-label="${L ? 'Lighthouse' : 'Sea'}, row ${Math.floor(k / n) + 1}, column ${k % n + 1}">${L ? '🗼' : ''}</button>`;
    }
    b.innerHTML = html;
    b.querySelectorAll('.sea').forEach(el => el.addEventListener('click', () => toggle(+el.dataset.k)));
    const boats = _p.grid.filter(v => v === BOAT).length;
    _el.querySelector('#lh-status').textContent = `⛵ ${boats - c.unlit.length - c.twice.length} of ${boats} boats safe · 🗼 ${_lights.length}`;
    _el.querySelector('#btn-lh-hint').textContent = `💡 HINT${_hints ? ` (${_hints})` : ''}`;
}

function _win() {
    _over = true; _stop();
    const t = (performance.now() - _t0) / 1000;
    _paint();
    Solo.bump('lighthouseSolved');
    if (_p.level === 'hard' && !_hints) Solo.bump('lighthouseHard');
    const isBest = !_daily && !_hints && Solo.record(`lighthouse:${_p.level}`, Math.round(t * 10) / 10, 'low');
    const firstDaily = _daily && Solo.solveDaily('lighthouse');
    _sfx('win');
    Solo.won();
    _el.querySelector('#lh-time').textContent = _fmt(t);
    _el.querySelector('#lh-done').hidden = false;
    _el.querySelector('#lh-done-t').textContent = `${_fmt(t)}${_hints ? ` · ${_hints} hint${_hints === 1 ? '' : 's'}` : ''}`;
    _el.querySelector('#lh-done-best').textContent = _daily ? (firstDaily ? `📅 Today's coast is safe! Streak: ${Solo.streak()}` : "📅 Today's coast: already done.")
        : isBest ? '🏅 NEW BEST TIME!' : _hints ? 'Solve one without hints to set a best time.' : `Best: ${_fmt(Solo.best(`lighthouse:${_p.level}`))}`;
    _el.querySelector('#lh-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** Probes: the board. */
export const _debug = () => (_p ? { p: _p, lights: _lights.slice(), over: _over, hints: _hints } : null);
