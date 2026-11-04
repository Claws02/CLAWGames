// ============================================================
// CORAL MERGE — the screen. Rules: CoralLogic.js.
//
// Tap a column to drop the next creature. Two of a kind touching merge into
// the next kind up (🐚 → 🐌 → 🦐 → 🦀 → 🐙 → 🐠 → 🐢 → 🐬 → 🐳 → 💎), and a
// merge that makes another pair keeps going. Every 12 drops the tide brings
// up a row of sand; merges wash it away. Best score is kept.
// ============================================================
import { COLS, ROWS, TIDE_EVERY, KINDS, NAMES, SAND, begin, drop, canDrop } from './CoralLogic.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'coral', icon: '🐳', title: 'Coral Merge', blurb: 'Drop creatures into the reef. Two alike merge into something bigger. Mind the tide!' };

let _el = null, _s = null, _pop = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };

export function bestText() { const b = Solo.best('coral'); return b == null ? '' : `best ${b} pts${Solo.best('coralTop') ? ` · up to ${KINDS[Solo.best('coralTop')]}` : ''}`; }

export function mount(el, opts = {}) { _el = el; start(opts.rnd); }
export function unmount() { _el = null; _s = null; }

/** A new reef. */
export function start(rnd = Math.random) {
    _s = begin(rnd);
    _el.innerHTML = `
        <div class="cm-top"><span class="bfont cm-score" id="cm-score">0</span>
            <span class="cm-next">NEXT <b id="cm-next"></b><i id="cm-after"></i></span>
            <span class="cm-tide" id="cm-tide"></span></div>
        <div class="cm-reef" id="cm-reef"></div>
        <div class="cm-ladder">${KINDS.map((k, i) => `<span title="${NAMES[i]}">${k}</span>`).join('<i>›</i>')}</div>
        <div class="cs-done" id="cm-done" hidden>
            <div class="cs-done-h bfont">🌊 THE REEF IS FULL</div>
            <div class="cs-done-t bfont" id="cm-done-t"></div>
            <div class="cs-done-best" id="cm-done-best"></div>
            <button class="go-btn bfont" id="btn-cm-again">A NEW REEF</button>
        </div>`;
    _el.querySelector('#btn-cm-again').addEventListener('click', () => start());
    _paint();
}

/** Drop into column c. */
export function tap(c) {
    if (!_s || _s.over) return null;
    const r = drop(_s, c);
    if (!r.ok) { _sfx('land_bad'); return r; }
    _pop = r.merges.length ? r.merges[r.merges.length - 1] : null;
    if (r.merges.length) { _sfx(r.merges.length > 1 ? 'coin_gain' : 'land_good'); try { Audio.haptic(r.merges.length > 1 ? [20, 30, 40] : 15); } catch (e) {} }
    else _sfx('dice_land');
    if (r.tide) _sfx('gate_roll');
    _paint(r);
    if (_s.over) _end();
    return r;
}

function _paint(r) {
    if (!_el) return;
    const reef = _el.querySelector('#cm-reef');
    let html = '';
    for (let c = 0; c < COLS; c++) {
        html += `<button class="cm-col${canDrop(_s, c) ? '' : ' full'}" data-c="${c}" aria-label="Drop in column ${c + 1}">`;
        for (let row = 0; row < ROWS; row++) {
            const v = _s.grid[row][c], popped = _pop && _pop.c === c && v === _pop.kind && row === _settled(c, _pop.kind);
            html += `<span class="cm-cell${v === SAND ? ' sand' : ''}${popped ? ' pop' : ''}">${v === null ? '' : v === SAND ? '' : KINDS[v]}</span>`;
        }
        html += '</button>';
    }
    reef.innerHTML = html;
    reef.querySelectorAll('.cm-col').forEach(b => b.addEventListener('click', () => tap(+b.dataset.c)));
    _el.querySelector('#cm-score').textContent = _s.score;
    _el.querySelector('#cm-next').textContent = KINDS[_s.next];
    _el.querySelector('#cm-after').textContent = KINDS[_s.after];
    const left = TIDE_EVERY - (_s.drops % TIDE_EVERY);
    _el.querySelector('#cm-tide').textContent = `🌊 tide in ${left}`;
    _el.querySelector('#cm-tide').classList.toggle('soon', left <= 3);
    if (r && r.merges.length > 1) _flash(`CHAIN ×${r.merges.length}!`);
}
const _settled = (c, kind) => { for (let y = ROWS - 1; y >= 0; y--) if (_s.grid[y][c] === kind) return y; return -1; };

function _flash(text) {
    const f = document.createElement('div');
    f.className = 'cm-flash bfont'; f.textContent = text;
    _el.querySelector('#cm-reef').appendChild(f);
    setTimeout(() => f.remove(), 900);
}

function _end() {
    Solo.bump('coralGames');
    const isBest = Solo.record('coral', _s.score, 'high');
    Solo.record('coralTop', _s.best, 'high');
    if (_s.best >= 6) Solo.bump('coralTurtle');
    _sfx(isBest ? 'win' : 'mg_lose'); Solo.won();
    _el.querySelector('#cm-done').hidden = false;
    _el.querySelector('#cm-done-t').textContent = `${_s.score} points · up to ${KINDS[_s.best]} ${NAMES[_s.best]}`;
    _el.querySelector('#cm-done-best').textContent = isBest ? '🏅 NEW BEST!' : `Best: ${Solo.best('coral')} points`;
    _el.querySelector('#cm-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** Probes: the reef. */
export const _debug = () => (_s ? { grid: _s.grid.map(r => r.slice()), score: _s.score, drops: _s.drops, next: _s.next, over: _s.over, best: _s.best } : null);
