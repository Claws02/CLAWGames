// ============================================================
// BIG GRID — nine tic-tac-toes in one, two players on one phone.
//
// Take turns marking a square. The square you pick inside a small board
// SENDS your rival to the matching small board: top-right square, top-right
// board. If that board is already won or full, they can go anywhere. Get
// three in a row on a small board to win it. Win three small boards in a row
// to win the game; if the grid fills first, whoever won more boards wins.
//
// On the shared board-game base (board/Tabletop.js). Bot: a shallow search
// over a score that likes winning boards, blocking, the centre, and NOT
// sending you to a board you can win straight away; deeper with skill.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';

// ── Rules ───────────────────────────────────────────────────────────────────
// Cell k = board b (0..8) * 9 + square s (0..8); boards and squares row by row.
export const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const lineOf = (a, p) => LINES3.find(l => l.every(i => a[i] === p)) || null;
export const newGame = () => ({ cells: new Array(81).fill(-1), won: new Array(9).fill(-1), next: -1, turn: 0 });
// won[b]: -1 open, 0/1 its winner, 2 full with no winner.
const sq = (g, b) => g.cells.slice(b * 9, b * 9 + 9);
export const openBoard = (g, b) => g.won[b] === -1;
/** The boards the player to go may play in. */
export const boards = g => (g.next >= 0 && openBoard(g, g.next) ? [g.next] : [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(b => openBoard(g, b)));
export const moves = g => boards(g).flatMap(b => sq(g, b).map((v, s) => (v < 0 ? b * 9 + s : -1)).filter(k => k >= 0));
/** Play cell k for the player to go: 'win' (three boards in a row) | 'full' (no moves left) | null. Mutates g. */
export function play(g, k) {
    const p = g.turn, b = Math.floor(k / 9), s = k % 9;
    g.cells[k] = p;
    const small = sq(g, b);
    if (lineOf(small, p)) g.won[b] = p;
    else if (small.every(v => v >= 0)) g.won[b] = 2;
    g.next = s;
    if (lineOf(g.won, p)) return 'win';
    g.turn = 1 - p;
    return moves(g).length ? null : 'full';
}
export const boardsWon = (g, p) => g.won.filter(v => v === p).length;
const copy = g => ({ cells: [...g.cells], won: [...g.won], next: g.next, turn: g.turn });

// How close a 3×3 array is for p: lines with two of p and an empty third count most.
function lineScore(a, p, empty) {
    let s = 0;
    for (const l of LINES3) {
        if (l.some(i => a[i] === 2)) continue;   // a full board blocks that line of boards for both
        const mine = l.filter(i => a[i] === p).length, theirs = l.filter(i => a[i] !== p && a[i] !== empty).length;
        if (theirs) continue;
        s += mine === 2 ? 6 : mine === 1 ? 1 : 0;
    }
    return s;
}
/** The position for p (higher is better for p). */
export function evaluate(g, p) {
    let v = 0;
    v += 80 * (boardsWon(g, p) - boardsWon(g, 1 - p));
    v += 12 * (lineScore(g.won, p, -1) - lineScore(g.won, 1 - p, -1));
    for (let b = 0; b < 9; b++) {
        if (!openBoard(g, b)) continue;
        const a = sq(g, b), w = b === 4 ? 1.5 : 1;
        v += w * (lineScore(a, p, -1) - lineScore(a, 1 - p, -1));
        if (a[4] === p) v += 1; else if (a[4] === 1 - p) v -= 1;
    }
    return v;
}
function search(g, depth, alpha, beta, me) {
    const ms = moves(g);
    if (depth <= 0 || !ms.length) return evaluate(g, me);
    const maxing = g.turn === me;
    let best = maxing ? -Infinity : Infinity;
    for (const k of ms) {
        const c = copy(g), r = play(c, k);
        const v = r === 'win' ? (maxing ? 10000 + depth : -10000 - depth) : r === 'full' ? Math.sign(boardsWon(c, me) - boardsWon(c, 1 - me)) * 5000 : search(c, depth - 1, alpha, beta, me);
        if (maxing) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
        if (beta <= alpha) break;
    }
    return best;
}
/** The bot's cell. */
export function botMove(g, skill = 1) {
    const all = moves(g);
    if (!all.length) return -1;
    if (Math.random() < (1 - skill) * 0.3) return all[Math.floor(Math.random() * all.length)];
    // A wide-open choice of boards is expensive to search deeply.
    const depth = (all.length > 20 ? 1 : 2) + (skill > 0.7 ? 1 : 0);
    let best = [], bv = -Infinity;
    for (const k of all) {
        const c = copy(g), r = play(c, k);
        const v = r === 'win' ? 1e6 : r === 'full' ? Math.sign(boardsWon(c, g.turn) - boardsWon(c, 1 - g.turn)) * 5000 : search(c, depth, -Infinity, Infinity, g.turn) + Math.random() * 0.5;
        if (v > bv + 1e-9) { bv = v; best = [k]; } else if (Math.abs(v - bv) < 1e-9) best.push(k);
    }
    return best[Math.floor(Math.random() * best.length)];
}

// ── The game ────────────────────────────────────────────────────────────────
const CSS = `
.bg-grid{display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:calc(var(--c)*.14);width:calc(var(--c)*6.8);height:calc(var(--c)*6.8);background:#3f4652;padding:calc(var(--c)*.14);border-radius:calc(var(--c)*.3);box-sizing:border-box}
.bg-b{position:relative;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:2px;background:#cfd4dc;border-radius:calc(var(--c)*.14);overflow:hidden;transition:box-shadow .2s,opacity .2s}
.bg-b.live{box-shadow:0 0 0 calc(var(--c)*.07) var(--tc),0 0 calc(var(--c)*.3) var(--tc)}
.bg-b.dim{opacity:.55}
.bg-s{background:#fdf3e2;display:flex;align-items:center;justify-content:center;font:calc(var(--c)*.5) 'Bebas Neue',Impact,sans-serif;line-height:1}
.bg-s.last{background:#fff6b8}
.bg-s.x::before{content:'✕';color:var(--m0)}
.bg-s.o::before{content:'◯';color:var(--m1);font-size:.9em}
.bg-big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:calc(var(--c)*2) 'Bebas Neue',Impact,sans-serif;pointer-events:none;background:rgba(253,243,226,.82);animation:bgpop .35s ease-out}
.bg-big.x{color:var(--m0)} .bg-big.o{color:var(--m1)} .bg-big.d{color:#8a8f99;font-size:calc(var(--c)*.8)}
@keyframes bgpop{from{transform:scale(1.6);opacity:0}}
`;

let T = null, G = null, _skill = 0.55, _busy = false, _last = -1, _note = '';

export function start(isBot, onWin, botSkill = 0.55) {
    G = newGame(); _skill = botSkill; _busy = false; _last = -1; _note = '';
    G.turn = Math.random() < 0.5 ? 0 : 1;
    let html = '';
    for (let b = 0; b < 9; b++) {
        html += `<div class="bg-b" data-b="${b}">`;
        for (let s = 0; s < 9; s++) html += `<div class="bg-s" data-act="sq" data-k="${b * 9 + s}"></div>`;
        html += `</div>`;
    }
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'bg', css: CSS, cols: 7.5, rows: 12,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="bt-chips">${[0, 1].map(p => `<div class="bt-chip" data-p="${p}"><span class="nm"></span><b>0</b></div>`).join('')}</div>
            <div class="bg-grid">${html}</div>`,
        onAct: (act, el) => { if (act === 'sq' && !T.botTurn(G.turn)) _play(+el.dataset.k); },
    });
    T.el.style.setProperty('--m0', T.hex(0)); T.el.style.setProperty('--m1', T.hex(1));
    T.qa('.bt-chip').forEach((c, p) => { c.style.setProperty('--pc', T.hex(p)); c.querySelector('.nm').textContent = `${p ? '◯' : '✕'} ${T.name(p)}`; });
    T.face(G.turn, true);
    _render();
    if (T.botTurn(G.turn)) T.after(_botStep, 900);
}

function _play(k) {
    if (_busy || T.done || !moves(G).includes(k)) return;
    extendWatchdog(120000);
    const p = G.turn, b = Math.floor(k / 9), before = G.won[b];
    const r = play(G, k);
    _last = k; haptic([10]);
    _note = '';
    if (G.won[b] !== before && G.won[b] === p) { sfx('coin_gain'); T.wow('BOARD WON!'); } else sfx('tick');
    _render();
    if (r === 'win') { _busy = true; return T.after(() => _end(p, 'THREE BOARDS IN A ROW'), 1500); }
    if (r === 'full') {
        const a = boardsWon(G, 0), c = boardsWon(G, 1), w = a === c ? -1 : a > c ? 0 : 1;
        _busy = true; return T.after(() => _end(w, `THE GRID IS FULL · BOARDS ${a}–${c}`), 900);
    }
    const free = boards(G).length > 1;
    if (free) _note = `${T.name(G.turn)} CAN GO ANYWHERE`;
    _busy = true;
    T.after(() => { _busy = false; T.face(G.turn); _render(); if (T.botTurn(G.turn)) T.after(_botStep, 650 + Math.random() * 350); }, 380);
}

function _botStep() {
    if (T.done || !T.botTurn(G.turn)) return;
    const k = botMove(G, _skill);
    if (k >= 0) _play(k);
}

function _end(w, why) {
    const s = [boardsWon(G, 0), boardsWon(G, 1)];
    T.end({ winner: w, standings: s, head: w < 0 ? 'A DRAW!' : `${T.name(w)} WINS!`,
        html: `<p style="opacity:1;font-size:14px;margin-bottom:6px">${why}</p>` });
}

function _render() {
    if (!T || T.done) return;
    const p = G.turn, bot = T.botTurn(p), live = boards(G);
    T.head(p, `${T.name(p)}'S GO`, _note || (bot ? 'THINKING…' : live.length > 1 ? 'GO ANYWHERE LIT UP' : 'PLAY IN THE LIT BOARD'));
    T.el.style.setProperty('--tc', T.hex(p));
    T.qa('.bg-b').forEach(el => {
        const b = +el.dataset.b, w = G.won[b];
        el.classList.toggle('live', live.includes(b) && !_busy);
        el.classList.toggle('dim', !live.includes(b) && w === -1);
        let big = el.querySelector('.bg-big');
        if (w !== -1 && !big) { big = document.createElement('div'); big.className = `bg-big ${w === 0 ? 'x' : w === 1 ? 'o' : 'd'}`; big.textContent = w === 0 ? '✕' : w === 1 ? '◯' : 'FULL'; el.appendChild(big); }
    });
    T.qa('.bg-s').forEach(el => { const k = +el.dataset.k, v = G.cells[k]; el.className = `bg-s${v === 0 ? ' x' : v === 1 ? ' o' : ''}${k === _last ? ' last' : ''}`; });
    T.qa('.bt-chip').forEach((c, q) => { c.querySelector('b').textContent = boardsWon(G, q); c.classList.toggle('up', q === p); });
}

/** Probes. */
export function _debugState() { return copy(G); }
export function _probeTap() {
    if (!T || T.done || T.botTurn(G.turn) || _busy || T.locked()) return null;
    const k = botMove(G, 1);
    return k >= 0 ? `.bg-s[data-k="${k}"]` : null;
}
