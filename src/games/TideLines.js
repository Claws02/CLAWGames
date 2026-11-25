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
import * as Pieces from './board/Pieces.js';

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
.tl{background:linear-gradient(180deg,#8fd3e8,#5fb6d6)}
.tl.p2{background:linear-gradient(180deg,#9cc4f0,#6f9fe0)}
.tl-board{position:relative;width:calc(var(--c)*6.4);height:calc(var(--c)*6.4);border-radius:calc(var(--c)*.9);border:calc(var(--c)*.1) solid #3f4652;overflow:hidden;
  background:radial-gradient(ellipse at 50% 50%,#7fd6df 0 52%,#5ec1cf 64%,#e9cf98 72%,#f3dfb0 80%,#e4c487 100%);
  box-shadow:inset 0 0 0 calc(var(--c)*.12) #c9a66b,inset 0 calc(var(--c)*.12) calc(var(--c)*.4) rgba(0,0,0,.25),0 calc(var(--c)*.14) 0 #3f4652}
.tl-board::before{content:'';position:absolute;inset:-20%;background:repeating-radial-gradient(circle at 30% 40%,rgba(255,255,255,.18) 0 calc(var(--c)*.12),transparent calc(var(--c)*.12) calc(var(--c)*.5));animation:tlshim 9s linear infinite;pointer-events:none}
@keyframes tlshim{to{transform:translate(8%,6%) rotate(6deg)}}
.tl-rock{position:absolute;border-radius:45% 55% 50% 50%;background:radial-gradient(circle at 35% 30%,#a7a093,#6f685e);box-shadow:inset 0 calc(var(--c)*-.06) 0 rgba(0,0,0,.25);pointer-events:none}
.tl-weed{position:absolute;font-size:calc(var(--c)*.5);pointer-events:none;transform-origin:50% 100%;animation:tlsway 3s ease-in-out infinite alternate}
@keyframes tlsway{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}
.tl-bub{position:absolute;bottom:-10%;width:calc(var(--c)*.16);height:calc(var(--c)*.16);border-radius:50%;border:2px solid rgba(255,255,255,.7);pointer-events:none;animation:tlbub 6s linear infinite}
@keyframes tlbub{to{transform:translateY(calc(var(--c)*-7)) translateX(calc(var(--c)*.3));opacity:0}}
.tl-board svg{position:absolute;inset:0;width:100%;height:100%}
.tl-board line.u{stroke:#3d8a96;stroke-width:4.2;stroke-linecap:round;opacity:.55}
.tl-board line.o{stroke:#f6efd8;stroke-width:2;stroke-linecap:round;stroke-dasharray:3 2.2;opacity:.95}
.tl-pt{position:absolute;width:calc(var(--c)*1.3);height:calc(var(--c)*1.3);margin:calc(var(--c)*-.65) 0 0 calc(var(--c)*-.65);border-radius:50%;display:flex;align-items:center;justify-content:center}
.tl-pt::after{content:'';width:calc(var(--c)*.38);height:calc(var(--c)*.38);border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#c9c2b4 55%,#8f887c);box-shadow:0 2px 0 rgba(0,0,0,.25)}
.tl-pt.to::after{width:calc(var(--c)*.6);height:calc(var(--c)*.6);background:radial-gradient(circle,#fff 0 20%,var(--tc) 22% 60%,transparent 62%);opacity:.85;animation:tlpulse 1s ease-in-out infinite;box-shadow:none}
@keyframes tlpulse{50%{transform:scale(1.25)}}
.tl-shell{position:absolute;width:calc(var(--c)*1.2);height:calc(var(--c)*1.2);margin:calc(var(--c)*-.6) 0 0 calc(var(--c)*-.6);border-radius:50%;background:radial-gradient(circle at 40% 30%,#fff,var(--sc) 70%);border:calc(var(--c)*.09) solid #3f4652;box-shadow:0 calc(var(--c)*.1) 0 rgba(0,0,0,.3),inset 0 0 0 calc(var(--c)*.05) rgba(255,255,255,.5);transition:left .32s cubic-bezier(.3,1.4,.5,1),top .32s cubic-bezier(.3,1.4,.5,1),transform .2s;pointer-events:none}
.tl-shell .pc-face{position:absolute;inset:6%;width:88%;height:88%;border-radius:50%;object-fit:cover}
.tl-shell .pc-face.emoji{display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.6)}
.tl-shell::after{content:'🐚';position:absolute;right:-18%;bottom:-14%;font-size:calc(var(--c)*.42);filter:drop-shadow(0 1px 0 #3f4652)}
.tl-shell.sel{transform:translateY(calc(var(--c)*-.15)) scale(1.15);box-shadow:0 0 0 calc(var(--c)*.1) #fff,0 0 calc(var(--c)*.4) var(--sc),0 calc(var(--c)*.2) 0 rgba(0,0,0,.25)}
.tl-shell.win{animation:tlwin .5s ease-in-out infinite alternate;box-shadow:0 0 0 calc(var(--c)*.12) #ffd200,0 0 calc(var(--c)*.6) #ffd200}
@keyframes tlwin{to{transform:translateY(calc(var(--c)*-.2)) scale(1.18)}}
.tl-hand{display:flex;align-items:center;gap:calc(var(--c)*.15);min-height:calc(var(--c)*.75);font:800 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#24414a}
.tl-hand i{position:relative;width:calc(var(--c)*.7);height:calc(var(--c)*.7);border-radius:50%;background:var(--sc);border:3px solid #3f4652;overflow:hidden}
.tl-hand i .pc-face{width:100%;height:100%;object-fit:cover}
.tl-hand i .pc-face.emoji{display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.36);font-style:normal}
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
    const line = cls => segs.map(([a, b]) => { const A = XY(a), B = XY(b); return `<line class="${cls}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`; }).join('');
    const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${line('u')}${line('o')}</svg>`;
    // The tide pool's dressing: rocks on the rim, weed that sways, bubbles.
    const scene = [[2, 3, 1.1, .8], [80, 4, .9, .7], [5, 82, .8, .9], [84, 84, 1.2, .8], [46, -3, .7, .5], [-3, 45, .6, .8]]
        .map(([x, y, w, h]) => `<i class="tl-rock" style="left:${x}%;top:${y}%;width:calc(var(--c)*${w});height:calc(var(--c)*${h})"></i>`).join('')
        + [[10, 70], [86, 22], [70, 88]].map(([x, y], k) => `<i class="tl-weed" style="left:${x}%;top:${y}%;animation-delay:-${k}s">🌿</i>`).join('')
        + [20, 45, 68, 85].map((x, k) => `<i class="tl-bub" style="left:${x}%;animation-delay:-${k * 1.6}s"></i>`).join('');
    Pieces.prepare(2);
    const pts = Array.from({ length: 9 }, (_, i) => `<div class="tl-pt" data-act="pt" data-i="${i}" style="left:${XY(i).x}%;top:${XY(i).y}%"></div>`).join('');
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'tl', css: CSS, cols: 7.5, rows: 12,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="tl-hand" data-hand="1"></div>
            <div class="tl-board">${scene}${svg}${pts}<div class="tl-shells"></div></div>
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
        `<div class="tl-shell${i === _sel ? ' sel' : ''}${_won && _won.includes(i) ? ' win' : ''}" style="--sc:${T.hex(v)};left:${XY(i).x}%;top:${XY(i).y}%">${Pieces.pieceHTML(v)}</div>`)).join('');
    T.qa('.tl-hand').forEach(h => {
        const q = +h.dataset.hand, left = SHELLS - G.placed[q];
        h.style.setProperty('--sc', T.hex(q));
        h.innerHTML = left ? `${T.name(q)} · ${`<i>${Pieces.pieceHTML(q)}</i>`.repeat(left)}` : '';
    });
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
