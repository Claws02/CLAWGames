// ============================================================
// TRIVIA — ten general-knowledge questions, four answers each, ten seconds a
// question (src/games/TriviaQuestions.js: pitched at a 23-year-old in
// Massachusetts).
//
// A right answer scores 100, plus up to 100 more for answering fast. A wrong
// answer or the clock running out scores nothing; the right one is shown
// either way. Highest total wins.
//
// Online only (SoloArena): every phone gets the same ten questions with the
// answers in the same order, from the round's seed.
// ============================================================
import * as Solo from '../claw-core/minigames/SoloArena.js';
import { registerMinigameCleanup } from '../claw-core/minigames/MinigameManager.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { mount, neutral, finishSolo, notSolo } from './PhoneGame.js';
import { QUESTIONS } from './TriviaQuestions.js';

export const COUNT = 10;
const ANSWER_MS = 10000, REVEAL_MS = 1500, READY_MS = 900;
const COLORS = ['#3b9dff', '#ff9f1c', '#2fd67b', '#ff5fa2'];

let _done = true, _ui = null, _timers = [], _raf = 0;
let _set = [], _k = -1, _total = 0, _right = 0, _phase = '', _t0 = 0, _order = [];
let _head = null, _q = null, _bar = null, _fill = null, _btns = [], _sub = null;

/** What this phone has banked so far. */
export function soloScore() { return _total; }

/** The round's ten questions, from the shared seed: distinct, the same on every phone. */
export function pickSet(draw = Solo.draw) {
    const idx = QUESTIONS.map((_, i) => i);
    for (let j = idx.length - 1; j > 0; j--) {
        const m = Math.floor(draw(j) * (j + 1));
        [idx[j], idx[m]] = [idx[m], idx[j]];
    }
    return idx.slice(0, COUNT);
}

export function start(isBot, onWin) {
    if (notSolo(onWin)) return;
    _done = false; _k = -1; _total = 0; _right = 0; _timers = [];
    registerMinigameCleanup(_destroy);
    _set = pickSet();
    _ui = mount('radial-gradient(circle at 50% 25%, #23407a, #0d1a38)');
    const { el, root } = _ui;
    root.style.justifyContent = 'flex-start';
    _head = el('font-size:15px;letter-spacing:2px;opacity:.9;');
    _bar = el('width:100%;max-width:440px;height:10px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden;flex-shrink:0;');
    _fill = el('height:100%;width:100%;background:#ffd23f;', _bar);
    _q = el('font-size:clamp(20px,6vw,28px);line-height:1.25;max-width:440px;min-height:4.2em;display:flex;align-items:center;justify-content:center;');
    const list = el('display:flex;flex-direction:column;gap:10px;width:100%;max-width:440px;');
    _btns = [0, 1, 2, 3].map(i => {
        const b = document.createElement('button');
        b.style.cssText = `min-height:58px;padding:10px 14px;border:4px solid #2b1240;border-radius:16px;background:${COLORS[i]};` +
            'color:#1a0e2a;font:800 19px Nunito,system-ui,sans-serif;text-align:left;box-shadow:0 5px 0 #2b1240;touch-action:manipulation;';
        b.addEventListener('pointerdown', e => { e.preventDefault(); _answer(i); });
        list.appendChild(b);
        return b;
    });
    _sub = el('font-size:18px;min-height:1.4em;');
    _next();
}

function _destroy() {
    _done = true;
    cancelAnimationFrame(_raf);
    _timers.forEach(clearTimeout); _timers = [];
    _ui?.root.remove(); _ui = null;
}
const _after = (fn, ms) => _timers.push(setTimeout(() => { if (!_done) fn(); }, ms));

function _next() {
    _k++;
    if (_k >= COUNT) return _end();
    const [q, ...answers] = QUESTIONS[_set[_k]];
    // Answers in the round's order (answers[0] is the right one).
    _order = [0, 1, 2, 3].map(i => [i, Solo.draw(5000 + _k * 10 + i)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    _phase = 'ready';
    _head.textContent = `QUESTION ${_k + 1} OF ${COUNT} · ${_total} PTS`;
    _q.textContent = q;
    _sub.textContent = '';
    _fill.style.width = '100%';
    _btns.forEach((b, i) => {
        b.textContent = answers[_order[i]];
        b.style.opacity = '.55'; b.style.outline = ''; b.style.filter = '';
    });
    neutral(`QUESTION ${_k + 1} OF ${COUNT}`);
    // A beat to read the question before the clock (and the buttons) go.
    _after(() => {
        _phase = 'pick'; _t0 = performance.now();
        _btns.forEach(b => { b.style.opacity = '1'; });
        const tick = () => {
            if (_done || _phase !== 'pick') return;
            const left = 1 - (performance.now() - _t0) / ANSWER_MS;
            _fill.style.width = `${Math.max(0, left) * 100}%`;
            if (left <= 0) return _answer(-1);
            _raf = requestAnimationFrame(tick);
        };
        _raf = requestAnimationFrame(tick);
    }, READY_MS);
}

function _answer(i) {
    if (_phase !== 'pick') return;
    _phase = 'reveal';
    cancelAnimationFrame(_raf);
    const left = Math.max(0, 1 - (performance.now() - _t0) / ANSWER_MS);
    const rightAt = _order.indexOf(0);
    const ok = i === rightAt;
    const pts = ok ? 100 + Math.round(100 * left) : 0;
    if (ok) _right++;
    _total += pts;
    _btns.forEach((b, j) => {
        if (j === rightAt) b.style.outline = '5px solid #fff';
        else b.style.filter = 'grayscale(1) brightness(.7)';
    });
    _sub.innerHTML = ok ? `✅ Right! <b style="color:#4ade80">+${pts}</b>` : i < 0 ? '⏰ Out of time!' : '❌ Not quite';
    _head.textContent = `QUESTION ${_k + 1} OF ${COUNT} · ${_total} PTS`;
    sfx(ok ? 'land_good' : 'land_bad'); haptic([ok ? 15 : 60]);
    _after(_next, REVEAL_MS);
}

function _end() {
    _phase = 'over';
    _q.textContent = `${_right} of ${COUNT} right`;
    _btns.forEach(b => { b.style.display = 'none'; });
    _bar.style.display = 'none';
    _sub.textContent = `${_total} points`;
    sfx('mg_win');
    finishSolo(_total, `${_right}/${COUNT} RIGHT · ${_total} PTS`, _destroy);
}

export function _debugState() {
    return { phase: _phase, k: _k, total: _total, right: _right, q: _k >= 0 && _k < COUNT ? QUESTIONS[_set[_k]][0] : '', rightAt: _order.indexOf(0) };
}
