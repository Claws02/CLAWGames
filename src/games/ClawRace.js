// ============================================================
// CLAW RACE — a dice race round a winding reef, 2 to 4 players on one phone.
//
// Each player's racers (their own character) wait in their nest beside their
// start island. ROLL, then tap a racer to hop it that many squares round the
// reef. Any roll brings a racer out; a 6 rolls again. Land on a rival and it
// splashes back to its nest, unless it's on a 🏝 SAFE island. Get every racer
// once round the reef and home to win (3 racers each at two players, 2 at 3–4).
//
// The reef: ➡️ currents push you 3 on, 🌀 whirlpools pull you 3 back,
// 🌿 kelp tunnels jump you 5 ahead, and a 🎁 surprise happens the moment you
// land on it:
//   🎲 ROLL AGAIN   another roll, right now
//   🚀 TURBO        this racer zooms 3 more squares
//   🔄 SWAP         pick any rival racer (not on an island) to trade places with
//   🛡 SHIELD       this racer can't be snapped, once
//
// On the shared board-game base (board/Tabletop.js, board/Dice.js,
// board/Pieces.js). Bots fill any seat; they score every move on a copy of the
// game (snaps, getting home, the reef's squares, danger) and pick their swaps.
// ============================================================
import { state } from '../AppHost.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog, slotCount, isBotSlot } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';
import * as Dice from './board/Dice.js';
import * as Pieces from './board/Pieces.js';

// ── The reef ────────────────────────────────────────────────────────────────
// A 48-square loop on an 11×11 board: four identical quarters turned round the
// middle, so every seat races the same track. Square t's [row, col] is TRACK[t].
export const Q = 12, L = 48, N = 11;
const QUARTER = [[10, 5], [10, 6], [10, 7], [10, 8], [9, 8], [8, 8], [8, 7], [7, 7], [6, 7], [6, 8], [6, 9], [6, 10]];
const rot = ([r, c]) => [N - 1 - c, r];
export const TRACK = (() => { const out = []; let q = QUARTER; for (let k = 0; k < 4; k++) { out.push(...q); q = q.map(rot); } return out; })();
// What each square of a quarter is (the same in all four): two safe islands
// (the start and halfway), two surprises, two currents, a whirlpool, a tunnel.
const KINDS = { 0: 'safe', 2: 'gift', 3: 'current', 5: 'whirl', 6: 'safe', 8: 'tunnel', 9: 'gift', 10: 'current' };
export const KIND = Array.from({ length: L }, (_, t) => KINDS[t % Q] || '');
export const JUMP = { current: 3, whirl: -3, tunnel: 5 };
export const GIFTS = ['again', 'turbo', 'swap', 'shield'];
export const GIFT_ICON = { again: '🎲', turbo: '🚀', swap: '🔄', shield: '🛡' };
export const GIFT_NAME = { again: 'ROLL AGAIN', turbo: 'TURBO +3', swap: 'SWAP', shield: 'SHIELD' };
// Which quarter each seat starts from, by how many are playing.
const QUARTERS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
// Each quarter's nest: the three free squares beside its start island.
const NEST0 = [[10, 3], [10, 2], [10, 1]];
export const NESTS = [0, 1, 2, 3].map(k => { let n = NEST0; for (let i = 0; i < k; i++) n = n.map(rot); return n; });

// ── Rules ───────────────────────────────────────────────────────────────────
// A racer's pos is how far it has come from its own start: -1 in the nest,
// 0..L-1 on the reef, L home. shield[p][c]: that racer can't be snapped, once.
export function newGame(n = 2, per = n > 2 ? 2 : 3) {
    return {
        n, per, quarter: QUARTERS[n],
        crabs: Array.from({ length: n }, () => new Array(per).fill(-1)),
        shield: Array.from({ length: n }, () => new Array(per).fill(false)),
        turn: 0,
    };
}
export const startOf = (g, p) => g.quarter[p] * Q;
export const cellOf = (g, p, pos) => (startOf(g, p) + pos) % L;
export const homeCount = (g, p) => g.crabs[p].filter(v => v >= L).length;
export const dest = (pos, steps) => (pos < 0 ? steps - 1 : pos + steps);
/** The moves the player to go has: one per distinct racer position. */
export function moves(g) {
    const p = g.turn, seen = new Set(), out = [];
    g.crabs[p].forEach((pos, c) => {
        if (pos >= L || seen.has(pos)) return;
        seen.add(pos);
        out.push({ c, from: pos });
    });
    return out;
}
/** Rival racers on reef square t (none on a safe island): [{ p, c }]. */
export function rivalsAt(g, p, t) {
    if (KIND[t] === 'safe') return [];
    const out = [];
    for (let q = 0; q < g.n; q++) if (q !== p) g.crabs[q].forEach((pos, c) => { if (pos >= 0 && pos < L && cellOf(g, q, pos) === t) out.push({ p: q, c }); });
    return out;
}
// Racer c of player p lands on pos: snap whoever's there (a shield saves its racer once).
function _land(g, p, pos) {
    const caught = [], saved = [];
    if (pos >= L) return { caught, saved };
    for (const v of rivalsAt(g, p, cellOf(g, p, pos))) {
        if (g.shield[v.p][v.c]) { g.shield[v.p][v.c] = false; saved.push(v); continue; }
        g.crabs[v.p][v.c] = -1;
        g.shield[v.p][v.c] = false;
        caught.push(v);
    }
    return { caught, saved };
}
/**
 * Move racer m.c of the player to go `steps` squares. opts: { rng }.
 * Mutates g and returns what happened, for the animation:
 * { path: [squares hopped], effect: { kind, to } | null, gift, turbo: { to } | null,
 *   caught: [{p, c}], saved: [{p, c}], home, again, won, swapping }
 * A 🎁 happens now: ROLL AGAIN sets again; TURBO moves the racer 3 more;
 * SHIELD shields it; SWAP leaves `swapping` true and the turn with this player
 * until swapWith() or skipSwap().
 */
export function play(g, m, steps, opts = {}) {
    const p = g.turn, rng = opts.rng || Math.random;
    const from = g.crabs[p][m.c];
    let pos = dest(from, steps);
    const path = [];
    for (let k = from < 0 ? 0 : from + 1; k <= Math.min(pos, L - 1); k++) path.push(cellOf(g, p, k));
    let effect = null, gift = null, turbo = null;
    if (pos < L) {
        const kind = KIND[cellOf(g, p, pos)];
        if (JUMP[kind]) { pos = Math.max(0, pos + JUMP[kind]); effect = { kind, to: pos >= L ? -1 : cellOf(g, p, pos) }; }
        else if (kind === 'gift') gift = GIFTS[Math.floor(rng() * GIFTS.length)];
    }
    if (gift === 'turbo') { pos += 3; turbo = { to: pos >= L ? -1 : cellOf(g, p, Math.min(pos, L - 1)) }; }
    if (pos >= L) pos = L;
    g.crabs[p][m.c] = pos;
    if (gift === 'shield' && pos < L) g.shield[p][m.c] = true;
    const { caught, saved } = _land(g, p, pos);
    const won = homeCount(g, p) === g.per;
    const swapping = !won && gift === 'swap' && swapTargets(g, p).length > 0;
    const again = !won && (steps === 6 || opts.roll === 6 || gift === 'again');
    if (!won && !again && !swapping) g.turn = (p + 1) % g.n;
    return { path, effect, gift, turbo, caught, saved, home: pos >= L, again, won, swapping, c: m.c };
}
/** The rival racers player p could swap with: any on the reef, not on a safe island. [{ p, c }] */
export function swapTargets(g, p) {
    const out = [];
    for (let q = 0; q < g.n; q++) if (q !== p) g.crabs[q].forEach((pos, c) => { if (pos >= 0 && pos < L && KIND[cellOf(g, q, pos)] !== 'safe') out.push({ p: q, c }); });
    return out;
}
/** What a swap would change: racer (p, c) and rival (q, k) trade squares. { mine, theirs } new positions. */
export function swapResult(g, p, c, q, k) {
    const a = cellOf(g, p, g.crabs[p][c]), b = cellOf(g, q, g.crabs[q][k]);
    return { mine: (b - startOf(g, p) + L) % L, theirs: (a - startOf(g, q) + L) % L };
}
/** Do the swap, then pass the turn (unless the roll was a 6: `again`). */
export function swapWith(g, p, c, q, k, again = false) {
    const r = swapResult(g, p, c, q, k);
    g.crabs[p][c] = r.mine; g.crabs[q][k] = r.theirs;   // shields stay with their racers
    if (!again) g.turn = (p + 1) % g.n;
    return r;
}
export function skipSwap(g, again = false) { if (!again) g.turn = (g.turn + 1) % g.n; }
/** The bot's swap: the trade that gains it the most (its racer forward plus theirs back), or null if none gains. */
export function botSwap(g, p, c) {
    let best = null, bv = 0;
    for (const v of swapTargets(g, p)) {
        const r = swapResult(g, p, c, v.p, v.c);
        const gain = (r.mine - g.crabs[p][c]) + (g.crabs[v.p][v.c] - r.theirs);
        if (gain > bv) { bv = gain; best = v; }
    }
    return best;
}
const copy = g => ({ ...g, crabs: g.crabs.map(a => [...a]), shield: g.shield.map(a => [...a]) });

// How many rival racers could land on square t next go (racers on one square,
// a nest too, count once).
function threat(g, p, t) {
    if (KIND[t] === 'safe') return 0;
    let n = 0;
    for (let q = 0; q < g.n; q++) {
        if (q === p) continue;
        for (const pos of new Set(g.crabs[q])) {
            if (pos >= L) continue;
            for (let r = 1; r <= 6; r++) { const d = dest(pos, r); if (d < L && cellOf(g, q, d) === t) { n++; break; } }
        }
    }
    return n;
}
/** How good moving m `steps` squares is for the player to go. */
export function rate(g, m, steps) {
    const p = g.turn, c = copy(g), from = g.crabs[p][m.c];
    const r = play(c, m, steps, { rng: () => 0.99 });   // a surprise counts as a shield here
    const to = c.crabs[p][m.c];
    let v = Math.max(0, to) - Math.max(0, from);
    if (r.home) v += 60;
    v += r.caught.reduce((s, x) => s + 70 + Math.max(0, g.crabs[x.p][x.c]), 0);
    if (r.gift) v += 14;
    if (!r.home) {
        const t = cellOf(c, p, to);
        if (KIND[t] === 'safe') v += 12;
        if (!c.shield[p][m.c]) v -= threat(c, p, t) * (18 + to * 0.7);
    }
    if (from < 0) v += 22;
    else if (from < L && threat(g, p, cellOf(g, p, from)) && !g.shield[p][m.c]) v += 16 + from * 0.5;
    return v;
}
/** The bot's move. */
export function botMove(g, steps, skill = 1) {
    const all = moves(g);
    if (!all.length) return null;
    if (Math.random() < (1 - skill) * 0.4) return all.reduce((a, b) => (b.from > a.from ? b : a));
    return all.reduce((a, b) => (rate(g, b, steps) > rate(g, a, steps) ? b : a));
}

// ── The game ────────────────────────────────────────────────────────────────
const P = 100 / N;   // percent per square
const at = ([r, c]) => ({ x: (c + 0.5) * P, y: (r + 0.5) * P });

const CSS = `
.cr{background:linear-gradient(180deg,#5ccbe0,#2f97c0)}
.cr.p2{background:linear-gradient(180deg,#6aa9e8,#3f7fc9)}
.cr .bt-hint{color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.35)}
.cr-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--c)*.12)}
.cr-chip{display:flex;align-items:center;gap:4px;background:#fff;border:3px solid var(--pc);border-radius:999px;padding:1px calc(var(--c)*.15) 1px 2px;font:800 calc(var(--c)*.18) Nunito,system-ui,sans-serif;color:#3f4652;transition:transform .2s}
.cr-chip.up{transform:scale(1.08);box-shadow:0 0 0 3px #ffd200}
.cr-chip .mini{width:calc(var(--c)*.45);height:calc(var(--c)*.45);border-radius:50%;background:var(--pc);overflow:hidden;display:inline-flex;align-items:center;justify-content:center}
.cr-chip .mini .pc-face{width:100%;height:100%;object-fit:cover}
.cr-chip .mini .pc-face.emoji{font-size:calc(var(--c)*.28)}
.cr-chip b{font:calc(var(--c)*.32) 'Bebas Neue',Impact,sans-serif}
.cr-board{position:relative;width:calc(var(--c)*7.2);height:calc(var(--c)*7.2);border:calc(var(--c)*.1) solid #3f4652;border-radius:calc(var(--c)*.45);overflow:hidden;box-sizing:border-box;
  background:radial-gradient(circle at 50% 50%,#fff3c4 0 8%,transparent 9%),radial-gradient(circle at 18% 22%,rgba(255,255,255,.25) 0 5%,transparent 6%),radial-gradient(circle at 80% 78%,rgba(255,255,255,.2) 0 6%,transparent 7%),
  radial-gradient(ellipse at 50% 50%,#4fc0d0,#2a8fb0 75%);box-shadow:0 calc(var(--c)*.14) 0 #3f4652,inset 0 0 calc(var(--c)*.6) rgba(0,0,0,.3)}
.cr-board svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cr-board path.reef{fill:none;stroke:#e9cf98;stroke-width:7.8;stroke-linejoin:round;stroke-linecap:round;opacity:.6}
.cr-board path.tun{fill:none;stroke:#2f9e44;stroke-width:1.3;stroke-dasharray:1.8 1.3;stroke-linecap:round;opacity:.9}
.cr-deco{position:absolute;transform:translate(-50%,-50%);font-size:calc(var(--c)*.36);opacity:.9;pointer-events:none}
.cr-sq{position:absolute;width:${P * 0.9}%;height:${P * 0.9}%;transform:translate(-50%,-50%);border-radius:calc(var(--c)*.14);overflow:hidden;
  background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.6) 0 6%,transparent 7%),linear-gradient(160deg,#f8e9c4,#e6cf98);box-shadow:inset 0 calc(var(--c)*-.05) 0 rgba(120,85,40,.3),0 calc(var(--c)*.04) 0 rgba(0,0,0,.2);
  display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.34)}
.cr-sq i{position:relative;font-style:normal;pointer-events:none;z-index:1}
/* Safe islands: green, with a SAFE tag, impossible to miss. */
.cr-sq.safe{background:radial-gradient(circle at 50% 60%,#ffe9a8 0 34%,transparent 36%),linear-gradient(160deg,#7be08f,#2fb35a);box-shadow:inset 0 0 0 calc(var(--c)*.05) #fff,0 calc(var(--c)*.04) 0 rgba(0,0,0,.25)}
.cr-sq.safe i{font-size:calc(var(--c)*.3);margin-top:-18%}
.cr-sq.safe b{position:absolute;bottom:4%;left:0;right:0;text-align:center;font:calc(var(--c)*.15) 'Bebas Neue',Impact,sans-serif;color:#fff;letter-spacing:1px;text-shadow:0 1px 0 #1d6b35;z-index:1}
.cr-sq.safe.mine{box-shadow:inset 0 0 0 calc(var(--c)*.08) var(--sc),0 calc(var(--c)*.04) 0 rgba(0,0,0,.25)}
.cr-sq.gift{background:linear-gradient(160deg,#fff1a8,#ffc94d)}
.cr-sq.current{background:linear-gradient(160deg,#c9f2ff,#8fdcf2)}
/* Whirlpools: the water turns underneath; the square itself stays put. */
.cr-sq.whirl{background:#4aa8d3}
.cr-sq.whirl::before{content:'';position:absolute;inset:-25%;background:repeating-conic-gradient(from 0deg,#bfe9f7 0 30deg,#4aa8d3 30deg 60deg);animation:crspin 6s linear infinite}
.cr-sq.whirl i{animation:crspin 2.4s linear infinite reverse;display:inline-block;font-size:calc(var(--c)*.42);filter:drop-shadow(0 0 3px #fff) drop-shadow(0 0 2px #fff)}
@keyframes crspin{to{transform:rotate(-360deg)}}
.cr-sq.tunnel{background:linear-gradient(160deg,#c6f0c0,#7fd28a)}
.cr-sq.can{box-shadow:0 0 0 calc(var(--c)*.08) #ffd200,0 0 calc(var(--c)*.3) #ffd200;z-index:2}
.cr-nest{position:absolute;width:${P * 0.9}%;height:${P * 0.9}%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--sc) 30%,#fff) 0 55%,var(--sc) 57% 64%,transparent 66%);opacity:.95}
.cr-nest.can{box-shadow:0 0 0 calc(var(--c)*.08) #ffd200,0 0 calc(var(--c)*.3) #ffd200;z-index:2}
.cr-mid{position:absolute;left:${P * 4}%;top:${P * 4}%;width:${P * 3}%;height:${P * 3}%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--c)*.06)}
.cr-mid .bd-die{width:calc(var(--c)*1.2);height:calc(var(--c)*1.2)}
.cr-mid .tag{font:calc(var(--c)*.24) 'Bebas Neue',Impact,sans-serif;color:#3f4652;letter-spacing:1px;background:rgba(255,255,255,.85);border-radius:999px;padding:0 8px}
.cr-legend{display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--c)*.1);font:800 calc(var(--c)*.17) Nunito,system-ui,sans-serif;color:#24414a}
.cr-legend span{background:rgba(255,255,255,.85);border-radius:999px;padding:1px calc(var(--c)*.14)}
.cr-legend .s{background:#2fb35a;color:#fff}
.cr-crab{position:absolute;width:${P * 0.7}%;height:${P * 0.7}%;transform:translate(-50%,-50%);z-index:4;pointer-events:none;transition:left .1s ease-out,top .1s ease-out}
.cr-crab.slow{transition:left .45s cubic-bezier(.3,1.2,.5,1),top .45s cubic-bezier(.3,1.2,.5,1)}
.cr-crab .ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 40% 30%,#fff,var(--cc) 70%);border:calc(var(--c)*.05) solid #3f4652;box-shadow:0 calc(var(--c)*.06) 0 rgba(0,0,0,.35);overflow:hidden}
.cr-crab .pc-face{position:absolute;inset:4%;width:92%;height:92%;border-radius:50%;object-fit:cover}
.cr-crab .pc-face.emoji{display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.28)}
.cr-crab.hop .ring{animation:crhop .1s ease-out}
@keyframes crhop{50%{transform:translateY(-30%)}}
.cr-crab.spin .ring{animation:crwhirl .45s linear}
@keyframes crwhirl{to{transform:rotate(-720deg) scale(.7)}}
.cr-crab.home{opacity:0;transform:translate(-50%,-50%) scale(.2);transition:all .4s}
.cr-crab.shield .ring{box-shadow:0 0 0 calc(var(--c)*.06) #fff,0 0 calc(var(--c)*.28) #4dabf7}
.cr-crab.shield::after{content:'🛡';position:absolute;right:-22%;top:-22%;font-size:calc(var(--c)*.24);z-index:5}
.cr-crab.pick{pointer-events:auto;cursor:pointer;z-index:7;animation:crpick .7s ease-in-out infinite}
.cr-crab.pick .ring{box-shadow:0 0 0 calc(var(--c)*.08) #ffd200,0 0 calc(var(--c)*.35) #ffd200}
@keyframes crpick{50%{transform:translate(-50%,-50%) scale(1.18)}}
.cr-splash{position:absolute;transform:translate(-50%,-50%);font-size:calc(var(--c)*.8);z-index:6;pointer-events:none;animation:crsplash .8s ease-out forwards}
@keyframes crsplash{0%{transform:translate(-50%,-50%) scale(.3);opacity:1}100%{transform:translate(-50%,-80%) scale(1.5);opacity:0}}
`;

let T = null, G = null, _roll = 0, _phase = 'roll', _note = '', _skill = 0.55, _opts = [], _bots = [], _up = 0;
// _disp[p][c]: where a racer is shown mid-animation: a reef square, 'hold' (stay where it
// is drawn), or null (wherever the rules have it). _swap: the racer that's choosing a swap.
let _disp = null, _swap = null;

const _bot = p => !!_bots[p];
// A seat's colour, before the table exists too (the squares are built first).
const T_hex = p => state.players?.[p]?.hex || ['#ff4d6d', '#3b9dff', '#2fd67b', '#ffc928'][p];

export function start(isBot, onWin, botSkill = 0.55) {
    const n = Math.max(2, Math.min(4, slotCount() || 2));
    _bots = Array.from({ length: n }, (_, p) => (n === 2 ? (p === 1 && isBot) : isBotSlot(p)));
    G = newGame(n); _roll = 0; _phase = 'roll'; _note = ''; _skill = botSkill; _opts = []; _swap = null;
    G.turn = Math.floor(Math.random() * n); _up = G.turn;
    _disp = G.crabs.map(a => a.map(() => null));
    Pieces.prepare(n);
    // The reef: the sand path under the squares, kelp tunnels, decoration in the open water.
    const pathD = 'M' + TRACK.map(t => { const { x, y } = at(t); return `${x} ${y}`; }).join(' L') + ' Z';
    const tunnels = TRACK.map((t, i) => (KIND[i] === 'tunnel' ? (() => { const a = at(t), b = at(TRACK[(i + JUMP.tunnel) % L]), mx = (a.x + b.x) / 2 + (50 - (a.x + b.x) / 2) * 0.5, my = (a.y + b.y) / 2 + (50 - (a.y + b.y) / 2) * 0.5; return `<path class="tun" d="M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}"/>`; })() : '')).join('');
    const ICON = { gift: '🎁', whirl: '🌀', tunnel: '🌿', safe: '🏝️' };
    const used = new Set(G.quarter.map(q => q * Q));
    const squares = TRACK.map((t, i) => {
        const { x, y } = at(t), k = KIND[i];
        let icon = ICON[k] || '';
        if (k === 'current') {   // an arrow pointing along the reef
            const a = TRACK[i], b = TRACK[(i + 1) % L];
            icon = b[1] > a[1] ? '➡️' : b[1] < a[1] ? '⬅️' : b[0] > a[0] ? '⬇️' : '⬆️';
        }
        const seat = used.has(i) ? G.quarter.indexOf(i / Q) : -1;
        return `<div class="cr-sq ${k}${seat >= 0 ? ' mine' : ''}" data-act="sq" data-t="${i}" style="left:${x}%;top:${y}%${seat >= 0 ? `;--sc:${T_hex(seat)}` : ''}"><i>${icon}</i>${k === 'safe' ? '<b>SAFE</b>' : ''}</div>`;
    }).join('');
    const nests = G.quarter.map((q, p) => NESTS[q].map(cell => { const { x, y } = at(cell); return `<div class="cr-nest" data-act="nest" data-p="${p}" style="left:${x}%;top:${y}%;--sc:${T_hex(p)}"></div>`; }).join('')).join('');
    const taken = (r, c) => TRACK.some(t => t[0] === r && t[1] === c) || NESTS.some(nn => nn.some(t => t[0] === r && t[1] === c)) || (r >= 4 && r <= 6 && c >= 4 && c <= 6);
    const deco = [[1, 1, '🐚'], [2, 4, '🐠'], [8, 1, '⭐'], [9, 6, '🐚'], [6, 2, '🌿'], [4, 8, '🐡'], [0, 0, '🌿'], [10, 10, '🐚'], [0, 10, '⭐'], [10, 0, '🐟'], [3, 5, '🐙'], [7, 5, '🦐']]
        .filter(([r, c]) => !taken(r, c))
        .map(([r, c, e]) => { const { x, y } = at([r, c]); return `<i class="cr-deco" style="left:${x}%;top:${y}%">${e}</i>`; }).join('');
    const crabs = G.crabs.map((a, p) => a.map((_, c) => `<div class="cr-crab" data-act="crab" data-p="${p}" data-c="${c}"><div class="ring">${Pieces.pieceHTML(p)}</div></div>`).join('')).join('');
    T = tabletop({
        isBot: n === 2 && isBot, onWin, probe: () => _probeTap(), cls: 'cr', css: CSS + Dice.DICE_CSS, cols: 7.6, rows: 12,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="cr-chips">${G.crabs.map((_, p) => `<div class="cr-chip" data-p="${p}"></div>`).join('')}</div>
            <div class="cr-board"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="reef" d="${pathD}"/>${tunnels}</svg>${deco}${squares}${nests}
                <div class="cr-mid"><div class="bd-die blank" data-act="roll"></div><div class="tag"></div></div>${crabs}</div>
            <div class="cr-legend"><span class="s">🏝️ SAFE</span><span>➡️ +3</span><span>🌀 −3</span><span>🌿 +5</span><span>🎁 SURPRISE</span></div>
            <div class="bt-row"><button class="bt-btn" data-act="roll">ROLL</button><button class="bt-btn alt" data-act="skip" hidden>NO SWAP</button></div>`,
        onAct: (act, el) => {
            if (_bot(G.turn)) return;
            if (act === 'roll') _doRoll();
            else if (act === 'sq') _tapSquare(+el.dataset.t);
            else if (act === 'nest' && +el.dataset.p === G.turn) _tapNest();
            else if (act === 'crab') _tapCrab(+el.dataset.p, +el.dataset.c);
            else if (act === 'skip') _pickSwap(null);
        },
    });
    _face();
    _render();
    if (_bot(G.turn)) T.after(_botStep, 900);
}

// Two players: the board turns to whoever's up. Three or four sit round it, so it stays put.
function _face(first = true) { if (G.n === 2) T.face(G.turn, first); }

async function _doRoll() {
    if (_phase !== 'roll' || T.done) return;
    _phase = 'rolling'; _note = '';
    extendWatchdog(120000);
    sfx('dice_throw'); _render();
    const [f] = await Dice.roll(T, [T.q('.cr-mid .bd-die')], 1);
    if (T.done) return;
    _roll = f; sfx('dice_land');
    _opts = moves(G);
    _phase = 'move';
    _render();
    if (_bot(G.turn)) return T.after(_botStep, 420 + Math.random() * 200);
    if (_opts.length === 1) T.after(() => _phase === 'move' && _move(_opts[0]), 700);
}

function _tapSquare(t) {
    if (_phase !== 'move') return;
    const m = _opts.find(o => o.from >= 0 && o.from < L && cellOf(G, G.turn, o.from) === t);
    if (m) _move(m);
}
function _tapNest() {
    if (_phase !== 'move') return;
    const m = _opts.find(o => o.from < 0);
    if (m) _move(m);
}
// A racer tapped: in a swap, a rival to trade with; otherwise, whoever's square it is.
function _tapCrab(p, c) {
    if (_phase === 'swap') { if (swapTargets(G, G.turn).some(v => v.p === p && v.c === c)) _pickSwap({ p, c }); return; }
    if (_phase === 'move' && p === G.turn) {
        const pos = G.crabs[p][c];
        if (pos < 0) _tapNest(); else if (pos < L) _tapSquare(cellOf(G, p, pos));
    }
}

const wait = ms => new Promise(ok => T.after(ok, ms));

async function _move(m) {
    if (_phase !== 'move' || T.done) return;
    _phase = 'anim';
    const p = G.turn, steps = _roll;
    // Racers that are about to move (this one, and any it snaps) stay drawn where they are until their moment.
    const r = play(G, m, steps, { roll: _roll });
    _disp[p][m.c] = 'hold';
    r.caught.forEach(v => { _disp[v.p][v.c] = 'hold'; });
    haptic([10]);
    _render();
    // Hop square by square.
    const el = T.q(`.cr-crab[data-p="${p}"][data-c="${m.c}"]`);
    const hop = async t => { _disp[p][m.c] = t; _layout(); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); sfx('tick'); await wait(110); };
    for (const t of r.path) { if (T.done) return; await hop(t); }
    if (r.effect) {
        T.wow(r.effect.kind === 'whirl' ? 'WHIRLPOOL!' : r.effect.kind === 'current' ? 'CURRENT!' : 'KELP TUNNEL!');
        sfx(r.effect.kind === 'whirl' ? 'land_bad' : 'coin_gain');
        await wait(250);
        el.classList.add(r.effect.kind === 'whirl' ? 'spin' : 'slow');
        _disp[p][m.c] = r.effect.to >= 0 ? r.effect.to : null;
        _layout();
        await wait(450);
        el.classList.remove('spin', 'slow');
    }
    if (r.gift) {
        T.wow(`${GIFT_ICON[r.gift]} ${GIFT_NAME[r.gift]}`); sfx('coin_gain');
        await wait(550);
        if (r.turbo) { el.classList.add('slow'); _disp[p][m.c] = r.turbo.to >= 0 ? r.turbo.to : null; _layout(); await wait(450); el.classList.remove('slow'); }
    }
    _disp[p][m.c] = null;
    if (r.caught.length) {
        _splash(cellOf(G, p, G.crabs[p][m.c]));
        T.wow('SNAP!'); sfx('coin_gain'); haptic([30, 20, 30]);
        r.caught.forEach(v => { _disp[v.p][v.c] = null; T.q(`.cr-crab[data-p="${v.p}"][data-c="${v.c}"]`)?.classList.add('slow'); });
    }
    if (r.saved.length) T.wow('🛡 SHIELDED!');
    _note = r.caught.length ? `SNAP! ${r.caught.map(v => T.name(v.p)).filter((x, i, a) => a.indexOf(x) === i).join(' & ')} BACK TO THE NEST`
        : r.saved.length ? `${T.name(r.saved[0].p)}'S SHIELD HOLDS` : r.home ? `${T.name(p)} GETS ONE HOME!`
        : r.gift === 'shield' ? '🛡 THIS RACER IS SHIELDED' : r.gift === 'again' ? '🎲 ROLL AGAIN!' : r.gift === 'turbo' ? '🚀 ZOOM!'
        : r.again ? 'A SIX: GO AGAIN' : '';
    _render();
    T.after(() => T.qa('.cr-crab.slow').forEach(x => x.classList.remove('slow')), 500);
    if (r.won) { T.wow('ALL HOME!'); return T.after(() => _end(p), 1500); }
    if (r.swapping) {
        // SWAP: pick a rival racer (or NO SWAP); the turn waits.
        _swap = { c: m.c, again: r.again };
        _phase = 'swap';
        _note = '🔄 TAP A RIVAL RACER TO SWAP WITH';
        _render();
        if (_bot(G.turn)) T.after(_botStep, 700);
        return;
    }
    if (r.gift === 'swap') _note = '🔄 NOBODY TO SWAP WITH';
    _next(r.again, r.caught.length || r.gift ? 900 : r.effect ? 600 : 380);
}

function _pickSwap(v) {
    if (_phase !== 'swap' || !_swap) return;
    const p = G.turn, { c, again } = _swap;
    _swap = null;
    if (v) {
        swapWith(G, p, c, v.p, v.c, again);
        _note = `🔄 SWAPPED WITH ${T.name(v.p)}!`; sfx('coin_gain'); haptic([12]);
        T.qa(`.cr-crab[data-p="${p}"][data-c="${c}"], .cr-crab[data-p="${v.p}"][data-c="${v.c}"]`).forEach(el => el.classList.add('slow'));
        T.after(() => T.qa('.cr-crab.slow').forEach(el => el.classList.remove('slow')), 500);
    } else { skipSwap(G, again); _note = 'NO SWAP'; }
    _phase = 'anim';
    _render();
    _next(again, 700);
}

// The next go: the same player again (a 6, ROLL AGAIN), or the board turns to the next.
function _next(again, ms) {
    T.after(() => {
        _phase = 'roll'; _roll = 0;
        if (!again) { _note = ''; _up = G.turn; _face(false); }
        _render();
        if (_bot(G.turn)) T.after(_botStep, 400 + Math.random() * 200);
    }, ms);
}

function _splash(t) {
    const d = document.createElement('div');
    d.className = 'cr-splash'; d.textContent = '💦';
    const { x, y } = at(TRACK[t]);
    d.style.left = x + '%'; d.style.top = y + '%';
    T.q('.cr-board').appendChild(d);
    T.after(() => d.remove(), 900);
}

function _botStep() {
    if (T.done || !_bot(G.turn)) return;
    if (_phase === 'roll') return _doRoll();
    if (_phase === 'swap') return _pickSwap(botSwap(G, G.turn, _swap.c));
    if (_phase !== 'move') return;
    const m = botMove(G, _roll, _skill);
    if (!m) return;
    T.after(() => _move(m), 260);
}

function _end(w) {
    const s = G.crabs.map((_, p) => homeCount(G, p));
    T.end({ winner: w, standings: s, head: `${T.name(w)} WINS!`,
        html: `<table><tr>${s.map((_, p) => `<th style="color:${T.hex(p)}">${T.name(p)}</th>`).join('')}</tr><tr class="t">${s.map(v => `<td>${v} HOME</td>`).join('')}</tr></table>` });
}

// Every racer to its square: the nest, the reef (a little apart when they share one), or home.
function _layout() {
    const share = new Map();
    G.crabs.forEach((a, p) => a.forEach((pos, c) => {
        if (_disp[p][c] !== null) return;
        if (pos >= 0 && pos < L) { const t = cellOf(G, p, pos); share.set(t, (share.get(t) || 0) + 1); }
    }));
    const seen = new Map();
    const picks = _phase === 'swap' && !_bot(G.turn) ? swapTargets(G, G.turn) : [];
    T.qa('.cr-crab').forEach(el => {
        const p = +el.dataset.p, c = +el.dataset.c, pos = G.crabs[p][c], d = _disp[p][c];
        el.style.setProperty('--cc', T.hex(p));
        el.classList.toggle('shield', !!G.shield[p][c] && pos >= 0 && pos < L);
        el.classList.toggle('pick', picks.some(v => v.p === p && v.c === c));
        if (d === 'hold') return;
        let x, y;
        if (d !== null) ({ x, y } = at(TRACK[d]));
        else if (pos < 0) ({ x, y } = at(NESTS[G.quarter[p]][c % 3]));
        else if (pos >= L) ({ x, y } = { x: 50, y: 50 });
        else {
            const t = cellOf(G, p, pos), n = share.get(t) || 1, k = seen.get(t) || 0;
            seen.set(t, k + 1);
            ({ x, y } = at(TRACK[t]));
            if (n > 1) { const a = (k / n) * Math.PI * 2; x += Math.cos(a) * P * 0.2; y += Math.sin(a) * P * 0.2; }
        }
        el.classList.toggle('home', pos >= L && d === null);
        el.style.left = x + '%'; el.style.top = y + '%';
    });
}

function _render() {
    if (!T || T.done) return;
    const p = _up, bot = _bot(p), mine = !bot && G.turn === p;
    const hint = _note || (_phase === 'anim' ? '' : bot ? 'THINKING…' : _phase === 'roll' ? 'ROLL THE DIE' : _phase === 'move' ? `MOVE ${_roll} · TAP A RACER${_opts.some(o => o.from < 0) ? ' (OR YOUR NEST)' : ''}` : '');
    T.head(p, `${T.name(p)}'S GO`, hint);
    const can = _phase === 'move' && mine ? _opts : [];
    T.qa('.cr-sq').forEach(el => { const t = +el.dataset.t; el.classList.toggle('can', can.some(o => o.from >= 0 && o.from < L && cellOf(G, G.turn, o.from) === t)); });
    T.qa('.cr-nest').forEach(el => el.classList.toggle('can', +el.dataset.p === G.turn && can.some(o => o.from < 0)));
    T.qa('.cr-chip').forEach(el => {
        const q = +el.dataset.p;
        el.style.setProperty('--pc', T.hex(q));
        el.classList.toggle('up', q === p);
        el.innerHTML = `<i class="mini">${Pieces.pieceHTML(q)}</i>${T.name(q)} <b>🏠${homeCount(G, q)}/${G.per}</b>`;
    });
    if (_phase !== 'rolling') Dice.paint(T.q('.cr-mid .bd-die'), _roll);
    T.q('.cr-mid .tag').textContent = _roll ? `MOVE ${_roll}` : 'ROLL';
    T.q('.bt-btn[data-act="roll"]').classList.toggle('off', !mine || _phase !== 'roll');
    T.q('.bt-btn[data-act="roll"]').hidden = _phase === 'swap' && mine;
    T.q('.bt-btn[data-act="skip"]').hidden = !(_phase === 'swap' && mine);
    _layout();
}

/** Probes. */
export function _debugState() { return { n: G.n, crabs: G.crabs.map(a => [...a]), shield: G.shield.map(a => [...a]), turn: G.turn, roll: _roll, phase: _phase }; }
export function _probeTap() {
    if (!T || T.done || _bot(G.turn) || T.locked()) return null;
    if (_phase === 'roll') return '.bt-btn[data-act="roll"]';
    if (_phase === 'swap') { const v = botSwap(G, G.turn, _swap.c); return v ? `.cr-crab[data-p="${v.p}"][data-c="${v.c}"]` : '.bt-btn[data-act="skip"]'; }
    if (_phase !== 'move') return null;
    const m = botMove(G, _roll, 1);
    if (!m) return null;
    return m.from < 0 ? `.cr-nest[data-p="${G.turn}"]` : `.cr-sq[data-t="${cellOf(G, G.turn, m.from)}"]`;
}
