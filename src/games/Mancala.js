// ============================================================
// MANCALA (Kalah) — two players on one phone, six pits each and a store.
//
// Pick up all the seeds in one of your pits and sow them one by one, round to
// the right, into the following pits and your own store (never the other
// player's store).
//   - Last seed in your store: go again.
//   - Last seed in an EMPTY pit on your side, with seeds opposite: capture
//     that seed and everything opposite into your store.
//   - When either side has no seeds left, the other side's seeds go to their
//     owner. Most seeds in the store wins (24–24 is a draw).
//
// The phone lies flat: your row is the near one, your store on your right, and
// it turns to whoever's up. Bot: looks ahead with minimax (deeper with skill).
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';

// ── Rules ───────────────────────────────────────────────────────────────────
// The board: 14 places. P1's pits 0–5, P1's store 6, P2's pits 7–12, P2's store 13.
export const SEEDS = 4;
export const store = p => (p ? 13 : 6);
export const pitsOf = p => (p ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5]);
export const owner = i => (i <= 6 ? 0 : 1);
export const newBoard = (n = SEEDS) => Array.from({ length: 14 }, (_, i) => (i === 6 || i === 13 ? 0 : n));
export const legal = (b, p) => pitsOf(p).filter(i => b[i] > 0);
export const opposite = i => 12 - i;
/**
 * Player p sows from pit i. Returns { board, path (every place a seed went), again, captured, over }.
 * When the game ends, the leftovers are swept into their owners' stores.
 */
export function sow(board, i, p) {
    const b = [...board], path = [];
    let n = b[i], at = i;
    b[i] = 0;
    while (n > 0) {
        at = (at + 1) % 14;
        if (at === store(1 - p)) continue;
        b[at]++; n--; path.push(at);
    }
    let captured = 0;
    if (at !== store(p) && owner(at) === p && b[at] === 1 && b[opposite(at)] > 0) {
        captured = b[opposite(at)] + 1;
        b[store(p)] += captured; b[at] = 0; b[opposite(at)] = 0;
    }
    const again = at === store(p);
    const over = pitsOf(0).every(k => b[k] === 0) || pitsOf(1).every(k => b[k] === 0);
    if (over) for (const q of [0, 1]) for (const k of pitsOf(q)) { b[store(q)] += b[k]; b[k] = 0; }
    return { board: b, path, again: again && !over, captured, over, last: at };
}
// Minimax (with alpha-beta) from p's view: store difference.
function search(b, p, me, depth, a, z) {
    const L = legal(b, p);
    if (!depth || !L.length) return b[store(me)] - b[store(1 - me)];
    let best = p === me ? -Infinity : Infinity;
    for (const i of L) {
        const r = sow(b, i, p);
        const v = r.over ? (r.board[store(me)] - r.board[store(1 - me)]) * 10 : search(r.board, r.again ? p : 1 - p, me, depth - 1, a, z);
        if (p === me) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); z = Math.min(z, v); }
        if (z <= a) break;
    }
    return best;
}
/** The bot's pit. */
export function botPit(b, p, skill = 1) {
    const depth = 1 + Math.round(skill * 5), L = legal(b, p);
    const scored = L.map(i => { const r = sow(b, i, p); return { i, v: r.over ? (r.board[store(p)] - r.board[store(1 - p)]) * 10 : search(r.board, r.again ? p : 1 - p, p, depth - 1, -Infinity, Infinity) }; });
    scored.sort((x, y) => y.v - x.v);
    const slip = scored.length > 1 && Math.random() < 0.25 - skill * 0.23;
    return scored[slip ? 1 : 0].i;
}

// ── The game ────────────────────────────────────────────────────────────────
const CSS = `
.mc-board{display:grid;grid-template-columns:calc(var(--c)*1.1) repeat(6,calc(var(--c)*.92)) calc(var(--c)*1.1);grid-template-rows:repeat(2,calc(var(--c)*1.25));gap:calc(var(--c)*.1);background:linear-gradient(#b07a43,#7f5229);border:calc(var(--c)*.09) solid #3f2a14;border-radius:calc(var(--c)*.6);padding:calc(var(--c)*.22);box-shadow:0 calc(var(--c)*.1) 0 #3f2a14}
.mc-pit,.mc-store{background:radial-gradient(#5a3a1c,#3d260f);border-radius:50%;box-shadow:inset 0 calc(var(--c)*.08) calc(var(--c)*.12) rgba(0,0,0,.5);position:relative;display:flex;align-items:center;justify-content:center}
.mc-store{grid-row:1/3;border-radius:calc(var(--c)*.5)}
.mc-pit b,.mc-store b{position:absolute;font:calc(var(--c)*.36) 'Bebas Neue',Impact,sans-serif;color:#fff;text-shadow:0 2px 0 #000;z-index:2}
.mc-pit b{bottom:calc(var(--c)*-.1);right:calc(var(--c)*-.02)}
.mc-store b{bottom:calc(var(--c)*.08);font-size:calc(var(--c)*.5)}
.mc-seeds{position:absolute;inset:14%}
.mc-seeds s{position:absolute;width:calc(var(--c)*.2);height:calc(var(--c)*.2);border-radius:50%;text-decoration:none;box-shadow:inset -2px -2px 0 rgba(0,0,0,.25)}
.mc-pit.mine{box-shadow:inset 0 calc(var(--c)*.08) calc(var(--c)*.12) rgba(0,0,0,.5),0 0 0 3px var(--pc)}
.mc-pit.can{cursor:pointer;box-shadow:inset 0 calc(var(--c)*.08) calc(var(--c)*.12) rgba(0,0,0,.5),0 0 0 4px #ffd200}
.mc-pit.hot,.mc-store.hot{background:radial-gradient(#8a5a2c,#5a3a1c)}
.mc-pit.drop{animation:mcdrop .25s}
@keyframes mcdrop{50%{transform:scale(1.12)}}
.mc-store.p0{grid-column:8}
.mc-store.p1{grid-column:1}
.mc-store.p0,.mc-store.p1{box-shadow:inset 0 calc(var(--c)*.08) calc(var(--c)*.12) rgba(0,0,0,.5),0 0 0 3px var(--pc)}
`;
const SEED_COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ffffff', '#ff9f43'];
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

let T = null, B = null, _turn = 0, _note = '', _skill = 0.55, _busy = false, _hot = -1;

export function start(isBot, onWin, botSkill = 0.55) {
    B = newBoard(); _note = ''; _skill = botSkill; _busy = false; _hot = -1;
    _turn = Math.random() < 0.5 ? 0 : 1;
    // Seen from P1's end: P2's row along the top, right to left (12 … 7), P1's along the bottom (0 … 5).
    const cell = (i, row, col) => `<div class="mc-pit" data-act="pit" data-i="${i}" style="grid-row:${row};grid-column:${col}"><div class="mc-seeds"></div><b></b></div>`;
    let pits = '';
    for (let k = 0; k < 6; k++) pits += cell(12 - k, 1, k + 2) + cell(k, 2, k + 2);
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'mc', css: CSS, cols: 9, rows: 11,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="bt-chips">${[0, 1].map(p => `<div class="bt-chip" data-p="${p}"><span class="nm"></span><b>0</b></div>`).join('')}</div>
            <div class="mc-board"><div class="mc-store p1" data-i="13"><div class="mc-seeds"></div><b></b></div>${pits}<div class="mc-store p0" data-i="6"><div class="mc-seeds"></div><b></b></div></div>`,
        onAct: (act, el) => { if (act === 'pit' && !T.botTurn(_turn)) _move(+el.dataset.i); },
    });
    T.qa('.bt-chip').forEach((c, p) => { c.style.setProperty('--pc', T.hex(p)); c.querySelector('.nm').textContent = T.name(p); });
    T.q('.mc-store.p0').style.setProperty('--pc', T.hex(0)); T.q('.mc-store.p1').style.setProperty('--pc', T.hex(1));
    T.face(_turn, true);
    _render();
    if (T.botTurn(_turn)) T.after(_botStep, 1000);
}

function _move(i) {
    if (_busy || T.done || owner(i) !== _turn || i === store(_turn) || !B[i]) return;
    extendWatchdog(120000);
    _busy = true;
    const p = _turn, r = sow(B, i, p);
    // sow it visibly, a seed at a time
    const show = [...B]; show[i] = 0; _hot = i;
    sfx('tick'); haptic([10]);
    _render(show);
    r.path.forEach((at, k) => T.after(() => { show[at]++; _hot = at; _render(show, at); sfx('tick'); }, 140 * (k + 1)));
    T.after(() => {
        B = r.board; _hot = -1;
        _note = r.over ? 'NO SEEDS LEFT ON ONE SIDE' : r.captured ? `${T.name(p)} CAPTURES ${r.captured}!` : r.again ? `IN THE STORE: ${T.name(p)} GOES AGAIN` : '';
        if (r.captured) { sfx('coin_gain'); haptic([20, 20, 40]); } else if (r.again) sfx('bell');
        _render();
        if (r.over) return T.after(_end, 1200);
        const next = r.again ? p : 1 - p;
        T.after(() => {
            _busy = false;
            if (next !== _turn) { _turn = next; T.face(_turn); }
            _render();
            if (T.botTurn(_turn)) T.after(_botStep, 700 + Math.random() * 300);
        }, r.again || r.captured ? 700 : 350);
    }, 140 * r.path.length + 250);
}

function _botStep() {
    if (T.done || _busy || !T.botTurn(_turn)) return;
    _move(botPit(B, _turn, _skill));
}

function _end() {
    const s = [B[6], B[13]], w = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1;
    T.end({ winner: w, standings: s, head: w < 0 ? `A DRAW AT ${s[0]}!` : `${T.name(w)} WINS!`,
        html: `<table><tr><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr><tr class="t"><td>${s[0]}</td><td>${s[1]}</td></tr></table>` });
}

function _seeds(el, n, i) {
    if (el._n === n) return;
    el._n = n;
    const big = el.parentElement.classList.contains('mc-store');
    let h = '';
    for (let k = 0; k < Math.min(n, big ? 30 : 14); k++) {
        const a = rnd(i, k) * Math.PI * 2, rr = Math.sqrt(rnd(k, i + 3)) * 0.4;
        h += `<s style="left:${(0.5 + Math.cos(a) * rr) * 100 - 8}%;top:${(0.5 + Math.sin(a) * rr * (big ? 1.8 : 1)) * 100 - 8}%;background:${SEED_COLORS[(i * 3 + k) % SEED_COLORS.length]}"></s>`;
    }
    el.innerHTML = h;
}

function _render(show = B, dropAt = -1) {
    if (!T || T.done) return;
    const p = _turn, bot = T.botTurn(p);
    T.head(p, `${T.name(p)}'S GO`, _note || (bot ? 'THINKING…' : _busy ? '' : 'TAP ONE OF YOUR PITS TO SOW'));
    T.qa('.mc-pit,.mc-store').forEach(el => {
        const i = +el.dataset.i, n = show[i];
        _seeds(el.querySelector('.mc-seeds'), n, i);
        el.querySelector('b').textContent = n;
        if (el.classList.contains('mc-pit')) {
            el.style.setProperty('--pc', T.hex(owner(i)));
            el.classList.toggle('mine', owner(i) === p && !bot);
            el.classList.toggle('can', owner(i) === p && !bot && !_busy && n > 0);
        }
        el.classList.toggle('hot', i === _hot);
        if (i === dropAt) { el.classList.remove('drop'); void el.offsetWidth; el.classList.add('drop'); }
    });
    T.qa('.bt-chip').forEach((c, q) => { c.querySelector('b').textContent = show[store(q)]; c.classList.toggle('up', q === p); });
}

/** Probes. */
export function _debugState() { return { turn: _turn, board: [...B], busy: _busy }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(_turn) || _busy || T.locked() || !legal(B, _turn).length) return null;
    return `.mc-pit[data-i="${botPit(B, _turn, 0.6)}"]`;
}
