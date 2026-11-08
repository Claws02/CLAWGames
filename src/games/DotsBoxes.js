// ============================================================
// DOTS AND BOXES — 4×4 boxes, two players on one phone.
//
// Take turns drawing a line between two dots next to each other. Close the
// fourth side of a box and it's yours, and you go again. When every line is
// drawn, most boxes wins (8–8 is a draw).
//
// On the shared board-game base (board/Tabletop.js). Bot: takes any box it
// can; otherwise draws a safe line (one that hands no box over); when none
// is left, it gives away the shortest chain it can. Lower skill sometimes
// misses a box or a safe line.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';

// ── Rules ───────────────────────────────────────────────────────────────────
// Lines are numbered: horizontals first (row r = 0..N, col c = 0..N-1), then
// verticals (row r = 0..N-1, col c = 0..N). Box (r, c) has top, bottom, left, right.
export const N = 4;
export const H = (r, c, n = N) => r * n + c;
export const V = (r, c, n = N) => (n + 1) * n + r * (n + 1) + c;
export const LINES = (n = N) => 2 * n * (n + 1);
export const sides = (r, c, n = N) => [H(r, c, n), H(r + 1, c, n), V(r, c, n), V(r, c + 1, n)];
/** The boxes a line borders: [[r, c], …] (one or two). */
export function boxesOf(l, n = N) {
    const out = [];
    if (l < (n + 1) * n) { const r = Math.floor(l / n), c = l % n; if (r > 0) out.push([r - 1, c]); if (r < n) out.push([r, c]); }
    else { const k = l - (n + 1) * n, r = Math.floor(k / (n + 1)), c = k % (n + 1); if (c > 0) out.push([r, c - 1]); if (c < n) out.push([r, c]); }
    return out;
}
export const newBoard = (n = N) => ({ n, lines: new Array(LINES(n)).fill(-1), boxes: new Array(n * n).fill(-1) });
const drawn = (b, r, c) => sides(r, c, b.n).filter(l => b.lines[l] >= 0).length;
/** Player p draws line l: the boxes it closes (each is then p's). */
export function draw(b, l, p) {
    b.lines[l] = p;
    let got = 0;
    for (const [r, c] of boxesOf(l, b.n)) if (drawn(b, r, c) === 4) { b.boxes[r * b.n + c] = p; got++; }
    return got;
}
export const open = b => b.lines.map((v, i) => (v < 0 ? i : -1)).filter(i => i >= 0);
export const over = b => b.lines.every(v => v >= 0);
export const score = (b, p) => b.boxes.filter(v => v === p).length;
const copy = b => ({ n: b.n, lines: [...b.lines], boxes: [...b.boxes] });
/** Lines that close a box right now. */
export const takers = b => open(b).filter(l => boxesOf(l, b.n).some(([r, c]) => drawn(b, r, c) === 3));
/** Lines that hand no box over (no box ends up with three sides). */
export const safe = b => open(b).filter(l => boxesOf(l, b.n).every(([r, c]) => drawn(b, r, c) < 2));
// How many boxes the other player would then take in a row (greedy), after line l.
function giveaway(b, l) {
    const c = copy(b); draw(c, l, 0);
    let n = 0;
    for (let t = takers(c); t.length; t = takers(c)) n += draw(c, t[0], 1);
    return n;
}
/** The bot's line. */
export function botLine(b, skill = 1) {
    const take = takers(b), sf = safe(b), all = open(b);
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    if (take.length && Math.random() > 0.25 - skill * 0.24) return rnd(take);
    const s2 = sf.filter(l => !take.includes(l));
    if (s2.length && Math.random() > 0.2 - skill * 0.18) return rnd(s2);
    if (take.length) return rnd(take);
    let best = null, bv = Infinity;
    for (const l of all) { const g = giveaway(b, l); if (g < bv) { bv = g; best = l; } }
    return best;
}

// ── The game ────────────────────────────────────────────────────────────────
const CSS = `
.db-board{position:relative;width:var(--bw);height:var(--bw);background:#fdf3e2;border:calc(var(--c)*.09) solid #3f4652;border-radius:calc(var(--c)*.3);box-sizing:content-box;padding:calc(var(--c)*.35)}
.db-in{position:relative;width:100%;height:100%}
.db-box{position:absolute;border-radius:calc(var(--c)*.12);display:flex;align-items:center;justify-content:center;font:calc(var(--c)*.6) 'Bebas Neue',Impact,sans-serif;color:#fff;transform:scale(0);transition:transform .25s}
.db-box.got{transform:scale(1)}
.db-line{position:absolute;display:flex;align-items:center;justify-content:center}
.db-line i{display:block;background:rgba(63,70,82,.12);border-radius:999px;transition:background .2s}
.db-line.h i{width:86%;height:calc(var(--c)*.16)}
.db-line.v i{height:86%;width:calc(var(--c)*.16)}
.db-line.on i{background:var(--lc)}
.db-line.last i{box-shadow:0 0 0 3px #fff,0 0 0 5px var(--lc)}
.db-line.aim i{background:rgba(63,70,82,.45)}
.db-dot{position:absolute;width:calc(var(--c)*.32);height:calc(var(--c)*.32);margin:calc(var(--c)*-.16) 0 0 calc(var(--c)*-.16);border-radius:50%;background:#3f4652;pointer-events:none}
`;

let T = null, B = null, _turn = 0, _last = -1, _note = '', _skill = 0.55, _busy = false;

export function start(isBot, onWin, botSkill = 0.55) {
    B = newBoard(); _last = -1; _note = ''; _skill = botSkill; _busy = false;
    _turn = Math.random() < 0.5 ? 0 : 1;
    const g = 100 / N;   // percent per box
    let html = '';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) html += `<div class="db-box" data-b="${r * N + c}" style="left:calc(${c * g}% + 6%);top:calc(${r * g}% + 6%);width:${g - 12}%;height:${g - 12}%"></div>`;
    for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) html += `<div class="db-line h" data-act="line" data-l="${H(r, c)}" style="left:${c * g + 3}%;top:calc(${r * g}% - ${g * 0.22}%);width:${g - 6}%;height:${g * 0.44}%"><i></i></div>`;
    for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) html += `<div class="db-line v" data-act="line" data-l="${V(r, c)}" style="top:${r * g + 3}%;left:calc(${c * g}% - ${g * 0.22}%);height:${g - 6}%;width:${g * 0.44}%"><i></i></div>`;
    for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) html += `<div class="db-dot" style="left:${c * g}%;top:${r * g}%"></div>`;
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'db', css: CSS, cols: 7.5, rows: 12,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="bt-chips">${[0, 1].map(p => `<div class="bt-chip" data-p="${p}"><span class="nm"></span><b>0</b></div>`).join('')}</div>
            <div class="db-board" style="--bw:calc(var(--c)*6.2)"><div class="db-in">${html}</div></div>`,
        onAct: (act, el) => { if (act === 'line' && !T.botTurn(_turn)) _play(+el.dataset.l); },
    });
    T.qa('.bt-chip').forEach((c, p) => { c.style.setProperty('--pc', T.hex(p)); c.querySelector('.nm').textContent = T.name(p); });
    T.face(_turn, true);
    _render();
    if (T.botTurn(_turn)) T.after(_botStep, 900);
}

function _play(l) {
    if (_busy || B.lines[l] >= 0 || T.done) return;
    extendWatchdog(120000);
    const p = _turn, got = draw(B, l, p);
    _last = l;
    haptic([10]);
    if (got) { sfx('coin_gain'); _note = got > 1 ? `${T.name(p)} CLOSES TWO!` : `${T.name(p)} TAKES A BOX · GO AGAIN`; }
    else { sfx('tick'); _note = ''; }
    _render();
    if (over(B)) { _busy = true; return T.after(_end, 900); }
    if (!got) { _turn = 1 - _turn; _busy = true; T.after(() => { _busy = false; T.face(_turn); _render(); if (T.botTurn(_turn)) T.after(_botStep, 700 + Math.random() * 300); }, 350); return; }
    if (T.botTurn(_turn)) T.after(_botStep, 450 + Math.random() * 250);
}

function _botStep() {
    if (T.done || !T.botTurn(_turn) || over(B)) return;
    const l = botLine(B, _skill);
    T.q(`.db-line[data-l="${l}"]`)?.classList.add('aim');
    T.after(() => _play(l), 300);
}

function _end() {
    const s = [score(B, 0), score(B, 1)], w = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1;
    T.end({ winner: w, standings: s, head: w < 0 ? `A DRAW AT ${s[0]}!` : `${T.name(w)} WINS!`,
        html: `<table><tr><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr><tr class="t"><td>${s[0]}</td><td>${s[1]}</td></tr></table>` });
}

function _render() {
    if (!T || T.done) return;
    const p = _turn, bot = T.botTurn(p);
    T.head(p, `${T.name(p)}'S GO`, _note || (bot ? 'THINKING…' : 'DRAW A LINE · CLOSE A BOX TO GO AGAIN'));
    T.qa('.db-line').forEach(el => {
        const l = +el.dataset.l, v = B.lines[l];
        el.className = `db-line ${el.classList.contains('h') ? 'h' : 'v'}${v >= 0 ? ' on' : ''}${l === _last ? ' last' : ''}`;
        if (v >= 0) el.style.setProperty('--lc', T.hex(v));
    });
    T.qa('.db-box').forEach(el => {
        const v = B.boxes[+el.dataset.b];
        el.classList.toggle('got', v >= 0);
        if (v >= 0) { el.style.background = T.hex(v); el.textContent = T.name(v)[0]; }
    });
    T.qa('.bt-chip').forEach((c, q) => { c.querySelector('b').textContent = score(B, q); c.classList.toggle('up', q === p); });
}

/** Probes. */
export function _debugState() { return { turn: _turn, lines: [...B.lines], boxes: [...B.boxes] }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(_turn) || _busy || T.locked() || over(B)) return null;
    return `.db-line[data-l="${botLine(B, 1)}"]`;
}
