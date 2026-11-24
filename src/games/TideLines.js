// ============================================================
// TIDE LINES — three in a row that keeps moving, two players on one phone.
//
// Nine points on a grid, joined by lines (across, down and diagonally).
// Each player has three shells. First place them, one each in turn, on any
// empty point. Then, on your go, slide one of your shells along a line to the
// empty point next to it. Three of yours in a straight row wins, placing or
// sliding. A player who can't move loses; 40 slides without a winner is a draw.
//
// On the shared board-game base (board/Tabletop.js). Bot: looks ahead
// (minimax with memo, deeper with skill); lower skill sometimes plays any
// legal move.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';

// ── Rules ───────────────────────────────────────────────────────────────────
// Points 0..8, row by row. Every point joins the points round it (8 ways).
export const SHELLS = 3, MAX_SLIDES = 40;
export const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const ADJ = Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3), c = i % 3, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) out.push(rr * 3 + cc);
    }
    return out;
});
export const newGame = () => ({ cells: new Array(9).fill(-1), placed: [0, 0], turn: 0, slides: 0 });
export const placing = (g, p = g.turn) => g.placed[p] < SHELLS;
/** Three in a row for p? */
export const wins = (cells, p) => LINES3.some(l => l.every(i => cells[i] === p));
/** Every legal move for the player to go: { from: -1 | point, to }. */
export function moves(g) {
    const p = g.turn, out = [];
    if (placing(g)) { g.cells.forEach((v, i) => { if (v < 0) out.push({ from: -1, to: i }); }); return out; }
    g.cells.forEach((v, i) => { if (v === p) ADJ[i].forEach(j => { if (g.cells[j] < 0) out.push({ from: i, to: j }); }); });
    return out;
}
/** Play a move in place; returns the result: 'win' | 'draw' | 'stuck' (the next player can't move: the mover wins) | null. */
export function play(g, m) {
    const p = g.turn;
    if (m.from < 0) { g.cells[m.to] = p; g.placed[p]++; }
    else { g.cells[m.from] = -1; g.cells[m.to] = p; g.slides++; }
    if (wins(g.cells, p)) return 'win';
    g.turn = 1 - p;
    if (!moves(g).length) return 'stuck';
    if (g.slides >= MAX_SLIDES) return 'draw';
    return null;
}
const copy = g => ({ cells: [...g.cells], placed: [...g.placed], turn: g.turn, slides: g.slides });

// Minimax from the mover's side: +100 - depth for a win, 0 for a draw or the horizon.
function search(g, depth, memo) {
    const key = g.cells.join('') + g.placed.join('') + g.turn + depth;
    if (memo.has(key)) return memo.get(key);
    let best = -Infinity;
    for (const m of moves(g)) {
        const c = copy(g), r = play(c, m);
        const v = r === 'win' || r === 'stuck' ? 100 - (8 - depth) : r === 'draw' || depth <= 0 ? 0 : -search(c, depth - 1, memo);
        if (v > best) best = v;
        if (best >= 99) break;
    }
    if (best === -Infinity) best = -100;
    memo.set(key, best);
    return best;
}
/** The bot's move. */
export function botMove(g, skill = 1) {
    const all = moves(g);
    if (!all.length) return null;
    if (Math.random() < (1 - skill) * 0.35) return all[Math.floor(Math.random() * all.length)];
    const depth = Math.round(2 + skill * 6), memo = new Map();
    let best = [], bv = -Infinity;
    for (const m of all) {
        const c = copy(g), r = play(c, m);
        const v = r === 'win' || r === 'stuck' ? 1000 : r === 'draw' ? 0 : -search(c, depth - 1, memo);
        if (v > bv) { bv = v; best = [m]; } else if (v === bv) best.push(m);
    }
    return best[Math.floor(Math.random() * best.length)];
}

// ── The game ────────────────────────────────────────────────────────────────
const CSS = `
.tl-board{position:relative;width:calc(var(--c)*6.2);height:calc(var(--c)*6.2);background:#bfe6e8;border:calc(var(--c)*.09) solid #3f4652;border-radius:calc(var(--c)*.4);box-shadow:inset 0 0 0 calc(var(--c)*.12) #9fd6da}
.tl-board svg{position:absolute;inset:0;width:100%;height:100%}
.tl-board line{stroke:#3f4652;stroke-width:2.2;stroke-linecap:round;opacity:.55}
.tl-pt{position:absolute;width:calc(var(--c)*1.25);height:calc(var(--c)*1.25);margin:calc(var(--c)*-.625) 0 0 calc(var(--c)*-.625);border-radius:50%;display:flex;align-items:center;justify-content:center}
.tl-pt::after{content:'';width:calc(var(--c)*.3);height:calc(var(--c)*.3);border-radius:50%;background:#3f4652;opacity:.5}
.tl-pt.to::after{width:calc(var(--c)*.55);height:calc(var(--c)*.55);opacity:.35;background:var(--tc);animation:tlpulse 1s ease-in-out infinite}
@keyframes tlpulse{50%{transform:scale(1.25)}}
.tl-shell{position:absolute;width:calc(var(--c)*1.05);height:calc(var(--c)*1.05);margin:calc(var(--c)*-.525) 0 0 calc(var(--c)*-.525);border-radius:50%;background:var(--sc);border:calc(var(--c)*.08) solid #3f4652;box-shadow:inset 0 calc(var(--c)*-.12) 0 rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.55);transition:left .3s,top .3s,transform .2s;pointer-events:none}
.tl-shell.sel{transform:scale(1.18);box-shadow:0 0 0 calc(var(--c)*.1) #fff,0 0 0 calc(var(--c)*.18) var(--sc)}
.tl-shell.win{animation:tlwin .6s ease-in-out infinite alternate}
@keyframes tlwin{to{transform:scale(1.2)}}
.tl-hand{display:flex;gap:calc(var(--c)*.15);min-height:calc(var(--c)*.6)}
.tl-hand i{width:calc(var(--c)*.5);height:calc(var(--c)*.5);border-radius:50%;background:var(--sc);border:3px solid #3f4652}
`;

// Whose go the screen shows: it changes with the board turning round, not the moment a move is played.
let _up = 0;
let T = null, G = null, _sel = -1, _skill = 0.55, _busy = false, _note = '', _won = null;
const XY = i => ({ x: 12 + (i % 3) * 38, y: 12 + Math.floor(i / 3) * 38 });   // percent across the board

export function start(isBot, onWin, botSkill = 0.55) {
    G = newGame(); _sel = -1; _skill = botSkill; _busy = false; _note = ''; _won = null;
    G.turn = Math.random() < 0.5 ? 0 : 1;
    _up = G.turn;
    const seen = new Set(), segs = [];
    ADJ.forEach((js, i) => js.forEach(j => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!seen.has(k)) { seen.add(k); segs.push([i, j]); } }));
    const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${segs.map(([a, b]) => { const A = XY(a), B = XY(b); return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`; }).join('')}</svg>`;
    const pts = Array.from({ length: 9 }, (_, i) => `<div class="tl-pt" data-act="pt" data-i="${i}" style="left:${XY(i).x}%;top:${XY(i).y}%"></div>`).join('');
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'tl', css: CSS, cols: 7.5, rows: 12,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="tl-hand" data-hand="1"></div>
            <div class="tl-board">${svg}${pts}<div class="tl-shells"></div></div>
            <div class="tl-hand" data-hand="0"></div>`,
        onAct: (act, el) => { if (act === 'pt' && !T.botTurn(G.turn)) _tap(+el.dataset.i); },
    });
    T.face(G.turn, true);
    _render();
    if (T.botTurn(G.turn)) T.after(_botStep, 900);
}

function _tap(i) {
    if (_busy || T.done || _won) return;
    const p = G.turn;
    if (placing(G)) { if (G.cells[i] < 0) _do({ from: -1, to: i }); return; }
    if (G.cells[i] === p) { _sel = _sel === i ? -1 : i; haptic([8]); return _render(); }
    if (_sel >= 0 && G.cells[i] < 0 && ADJ[_sel].includes(i)) _do({ from: _sel, to: i });
}

function _do(m) {
    extendWatchdog(120000);
    const p = G.turn, r = play(G, m);
    _sel = -1; haptic([10]); sfx(m.from < 0 ? 'tick' : 'coin_gain');
    _note = '';
    if (r === 'win') { _won = LINES3.find(l => l.every(i => G.cells[i] === p)); _render(); _busy = true; T.wow('THREE IN A ROW!'); return T.after(() => _end(p, 'THREE IN A ROW'), 1500); }
    if (r === 'stuck') { _busy = true; _render(); return T.after(() => _end(p, `${T.name(1 - p)} CAN'T MOVE`), 900); }
    if (r === 'draw') { _busy = true; _render(); return T.after(() => _end(-1, `${MAX_SLIDES} SLIDES, NO LINE`), 900); }
    _busy = true; _render();
    T.after(() => { _busy = false; _up = G.turn; T.face(G.turn); _render(); if (T.botTurn(G.turn)) T.after(_botStep, 600 + Math.random() * 300); }, 380);
}

function _botStep() {
    if (T.done || !T.botTurn(G.turn) || _won) return;
    const m = botMove(G, _skill);
    if (!m) return;
    if (m.from >= 0) { _sel = m.from; _render(); T.after(() => _do(m), 420); }
    else _do(m);
}

function _end(w, why) {
    T.end({ winner: w, standings: w < 0 ? [0, 0] : [w === 0 ? 1 : 0, w === 1 ? 1 : 0],
        head: w < 0 ? 'A DRAW!' : `${T.name(w)} WINS!`, html: `<p style="opacity:1;font-size:14px;margin-bottom:6px">${why}</p>` });
}

function _render() {
    if (!T || T.done) return;
    const p = _up, bot = T.botTurn(p) || _busy;
    const hint = _note || (_busy ? '' : bot ? 'THINKING…' : placing(G) ? `PLACE A SHELL · ${SHELLS - G.placed[p]} LEFT` : _sel >= 0 ? 'NOW TAP WHERE IT SLIDES' : 'TAP ONE OF YOURS, THEN SLIDE IT');
    T.head(p, `${T.name(p)}'S GO`, hint);
    const tc = T.hex(p);
    const to = !bot && !placing(G) && _sel >= 0 ? ADJ[_sel].filter(j => G.cells[j] < 0) : !bot && placing(G) ? G.cells.map((v, i) => (v < 0 ? i : -1)).filter(i => i >= 0) : [];
    T.qa('.tl-pt').forEach(el => { const i = +el.dataset.i; el.classList.toggle('to', to.includes(i)); el.style.setProperty('--tc', tc); });
    T.q('.tl-shells').innerHTML = G.cells.map((v, i) => (v < 0 ? '' :
        `<div class="tl-shell${i === _sel ? ' sel' : ''}${_won && _won.includes(i) ? ' win' : ''}" style="--sc:${T.hex(v)};left:${XY(i).x}%;top:${XY(i).y}%">🐚</div>`)).join('');
    T.qa('.tl-hand').forEach(h => { const q = +h.dataset.hand; h.style.setProperty('--sc', T.hex(q)); h.innerHTML = '<i></i>'.repeat(SHELLS - G.placed[q]); });
}

/** Probes. */
export function _debugState() { return { ...copy(G), sel: _sel }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(G.turn) || _busy || T.locked() || _won) return null;
    const m = botMove(G, 1);
    if (!m) return null;
    if (m.from >= 0 && _sel !== m.from) return `.tl-pt[data-i="${m.from}"]`;
    return `.tl-pt[data-i="${m.to}"]`;
}
