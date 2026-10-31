// ============================================================
// HIGHER OR LOWER — one deck, one card at a time, until you call it wrong.
//
// A card is face up: is the next one HIGHER or LOWER? Aces are high, and the
// same rank again is a free pass. Six seconds a call (out of time is out).
// 10 points a right call, plus up to 9 for how quickly you call on average,
// so two players on the same streak still have a winner.
//
// Online only (SoloArena): every phone deals the same deck from the round's
// seed, so everyone faces the same run of cards.
// ============================================================
import * as Solo from '../claw-core/minigames/SoloArena.js';
import { registerMinigameCleanup } from '../claw-core/minigames/MinigameManager.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { mount, button, neutral, finishSolo, notSolo } from './PhoneGame.js';

const PICK_MS = 6000, SHOW_MS = 900, MAX_CALLS = 40;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = [['♠', '#1f1530'], ['♥', '#e11d48'], ['♦', '#e11d48'], ['♣', '#1f1530']];

let _done = true, _ui = null, _timers = [], _raf = 0;
let _deck = [], _i = 0, _pass = 0, _right = 0, _bonus = 0, _phase = '', _t0 = 0;
let _card = null, _nextCard = null, _head = null, _sub = null, _bar = null, _hi = null, _lo = null;

/** 10 a right call, plus the average speed bonus (0–9). */
export function soloScore() { return _right * 10 + (_right ? Math.min(9, Math.round(_bonus / _right)) : 0); }

export function start(isBot, onWin) {
    if (notSolo(onWin)) return;
    _done = false; _right = 0; _bonus = 0; _timers = [];
    registerMinigameCleanup(_destroy);
    _pass = 0; _deck = _shuffled(0);
    _i = 0;
    _ui = mount('radial-gradient(circle at 50% 30%, #11603f, #08301f)');
    const { el, root } = _ui;
    _head = el('font-size:16px;letter-spacing:2px;opacity:.9;');
    const table = el('display:flex;gap:14px;align-items:center;justify-content:center;');
    _card = el('', table); _nextCard = el('', table);
    _sub = el('font-size:18px;min-height:1.4em;');
    _bar = el('width:min(80vw,320px);height:10px;border-radius:99px;background:rgba(255,255,255,.2);overflow:hidden;', root);
    const fill = el('height:100%;width:100%;background:#ffd23f;', _bar);
    _bar.fill = fill;
    const row = el('display:flex;gap:14px;');
    _hi = button(row, '▲ HIGHER', '#4ade80', () => _call(1));
    _lo = button(row, '▼ LOWER', '#ff9f1c', () => _call(-1));
    _paint(_card, _deck[0]); _paint(_nextCard, null);
    _ask();
}

function _destroy() {
    _done = true;
    cancelAnimationFrame(_raf);
    _timers.forEach(clearTimeout); _timers = [];
    _ui?.root.remove(); _ui = null;
}
const _after = (fn, ms) => _timers.push(setTimeout(() => { if (!_done) fn(); }, ms));

// A 52-card deck in the round's order; pass k deals the k-th shuffle.
function _shuffled(k) {
    const d = [];
    for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) d.push({ r, s });
    for (let j = d.length - 1; j > 0; j--) {
        const m = Math.floor(Solo.draw(k * 1000 + j) * (j + 1));
        [d[j], d[m]] = [d[m], d[j]];
    }
    return d;
}

function _paint(box, c) {
    box.style.cssText = 'width:min(34vw,140px);aspect-ratio:5/7;border-radius:14px;border:4px solid #2b1240;box-shadow:0 6px 0 #2b1240;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Bebas Neue",sans-serif;line-height:1;' +
        (c ? `background:#fff8ee;color:${SUITS[c.s][1]};` : 'background:repeating-linear-gradient(45deg,#ff5fa2 0 10px,#c2185b 10px 20px);');
    box.innerHTML = c ? `<span style="font-size:min(16vw,68px)">${RANKS[c.r]}</span><span style="font-size:min(12vw,50px)">${SUITS[c.s][0]}</span>` : '';
}

function _ask() {
    _phase = 'pick'; _t0 = performance.now();
    _head.textContent = `STREAK ${_right} · ${soloScore()} PTS`;
    _sub.textContent = `Next card: higher or lower than ${RANKS[_deck[_i].r]}?`;
    [_hi, _lo].forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    neutral(`STREAK ${_right}`);
    const tick = () => {
        if (_done || _phase !== 'pick') return;
        const left = 1 - (performance.now() - _t0) / PICK_MS;
        _bar.fill.style.width = `${Math.max(0, left) * 100}%`;
        if (left <= 0) return _call(0);                 // out of time
        _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

function _call(dir) {
    if (_phase !== 'pick') return;
    _phase = 'show';
    cancelAnimationFrame(_raf);
    [_hi, _lo].forEach(b => { b.disabled = true; b.style.opacity = '.45'; });
    const secs = (performance.now() - _t0) / 1000;
    const cur = _deck[_i], nxt = _deck[_i + 1];
    _paint(_nextCard, nxt);
    const same = nxt.r === cur.r;
    const ok = dir !== 0 && (same || Math.sign(nxt.r - cur.r) === dir);
    if (ok) {
        _right++;
        _bonus += Math.max(0, 9 - Math.floor(secs / 0.5));
        _sub.textContent = same ? 'Same rank: free pass!' : 'Right!';
        sfx('land_good'); haptic([12]);
    } else {
        _sub.textContent = dir === 0 ? 'Out of time!' : 'Wrong call!';
        sfx('land_bad'); haptic([60]);
    }
    _head.textContent = `STREAK ${_right} · ${soloScore()} PTS`;
    _after(() => {
        if (!ok || _right >= MAX_CALLS) return _end();
        // The next card slides over; a finished deck is reshuffled the same way everywhere.
        _i++;
        if (_i >= _deck.length - 1) { _deck = [_deck[_i], ..._shuffled(++_pass)]; _i = 0; }
        _paint(_card, _deck[_i]); _paint(_nextCard, null);
        _ask();
    }, SHOW_MS);
}

function _end() {
    _phase = 'over';
    _sub.textContent = `${_right} in a row`;
    _hi.parentElement.style.display = 'none'; _bar.style.display = 'none';
    sfx('mg_win');
    const score = soloScore();
    finishSolo(score, `${_right} IN A ROW · ${score} PTS`, _destroy);
}

export function _debugState() { return { phase: _phase, right: _right, cur: _deck[_i], next: _deck[_i + 1] }; }
