// ============================================================
// KELP MAZE — race your crab across while you wall the other in, two players
// on one phone.
//
// Your crab starts in the middle of your edge; get it to the far edge first.
// On your go, EITHER step one square (up, down, left or right), OR plant a
// kelp wall two squares long in the gaps between squares to slow your rival
// down. You have 6 walls. A wall may never close off anyone's last way
// through. Crabs can't share a square: next to each other, you hop straight
// over, or step round to the side if a wall is behind.
//
// On the shared board-game base (board/Tabletop.js). Bot: compares the two
// shortest paths. Ahead, it runs; behind, it plants the wall that costs you
// the most steps for the fewest of its own. Lower skill misjudges.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';

// ── Rules ───────────────────────────────────────────────────────────────────
// Squares (r, c), 0..N-1, row 0 at the top. Player 0 starts bottom middle and
// races to row 0; player 1 starts top middle and races to row N-1. A wall sits
// at a gap point (r, c), 0..N-2, between rows r/r+1 and cols c/c+1: 'h' lies
// along the gap under row r (blocking up/down across cols c and c+1), 'v' along
// the gap right of col c (blocking left/right across rows r and r+1).
export const N = 7, WALLS = 6;
export const GOAL = [0, N - 1];
export const newGame = () => ({ pawn: [[N - 1, 3], [0, 3]], walls: [], left: [WALLS, WALLS], turn: 0 });
const has = (g, o, r, c) => g.walls.some(w => w.o === o && w.r === r && w.c === c);
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
/** Is the step from (r, c) to the square next to it (dr, dc) walled off? */
export function blocked(g, r, c, dr, dc) {
    if (dr === 1) return has(g, 'h', r, c) || has(g, 'h', r, c - 1);
    if (dr === -1) return has(g, 'h', r - 1, c) || has(g, 'h', r - 1, c - 1);
    if (dc === 1) return has(g, 'v', r, c) || has(g, 'v', r - 1, c);
    return has(g, 'v', r, c - 1) || has(g, 'v', r - 1, c - 1);
}
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
/** Steps from (r, c) to player p's goal row, ignoring crabs (Infinity: no way through). */
export function dist(g, p, from = g.pawn[p]) {
    const seen = new Array(N * N).fill(-1), q = [from];
    seen[from[0] * N + from[1]] = 0;
    while (q.length) {
        const [r, c] = q.shift(), d = seen[r * N + c];
        if (r === GOAL[p]) return d;
        for (const [dr, dc] of DIRS) {
            const rr = r + dr, cc = c + dc;
            if (!inside(rr, cc) || seen[rr * N + cc] >= 0 || blocked(g, r, c, dr, dc)) continue;
            seen[rr * N + cc] = d + 1; q.push([rr, cc]);
        }
    }
    return Infinity;
}
/** The squares the player to go can step to: [[r, c]…], hops included. */
export function steps(g) {
    const p = g.turn, [r, c] = g.pawn[p], [or, oc] = g.pawn[1 - p], out = [];
    for (const [dr, dc] of DIRS) {
        const rr = r + dr, cc = c + dc;
        if (!inside(rr, cc) || blocked(g, r, c, dr, dc)) continue;
        if (rr !== or || cc !== oc) { out.push([rr, cc]); continue; }
        // The rival is there: hop straight over, or step round it if that's walled.
        const jr = rr + dr, jc = cc + dc;
        if (inside(jr, jc) && !blocked(g, rr, cc, dr, dc)) { out.push([jr, jc]); continue; }
        for (const [sr, sc] of dr ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
            const xr = rr + sr, xc = cc + sc;
            if (inside(xr, xc) && !blocked(g, rr, cc, sr, sc) && (xr !== r || xc !== c)) out.push([xr, xc]);
        }
    }
    return out;
}
/** Can the player to go plant wall { o, r, c }? (In bounds, no overlap or crossing, nobody shut in.) */
export function canWall(g, w) {
    if (g.left[g.turn] <= 0 || w.r < 0 || w.r > N - 2 || w.c < 0 || w.c > N - 2) return false;
    if (has(g, 'h', w.r, w.c) || has(g, 'v', w.r, w.c)) return false;   // the same point: overlap or cross
    if (w.o === 'h' && (has(g, 'h', w.r, w.c - 1) || has(g, 'h', w.r, w.c + 1))) return false;
    if (w.o === 'v' && (has(g, 'v', w.r - 1, w.c) || has(g, 'v', w.r + 1, w.c))) return false;
    g.walls.push(w);
    const ok = dist(g, 0) < Infinity && dist(g, 1) < Infinity;
    g.walls.pop();
    return ok;
}
export function allWalls(g) {
    const out = [];
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) for (const o of ['h', 'v']) { const w = { o, r, c }; if (canWall(g, w)) out.push(w); }
    return out;
}
/** Play { step: [r, c] } or { wall: { o, r, c } }: 'win' | null. Mutates g. */
export function play(g, m) {
    const p = g.turn;
    if (m.step) { g.pawn[p] = [...m.step]; if (m.step[0] === GOAL[p]) return 'win'; }
    else { g.walls.push({ ...m.wall }); g.left[p]--; }
    g.turn = 1 - p;
    return null;
}
const copy = g => ({ pawn: g.pawn.map(x => [...x]), walls: g.walls.map(w => ({ ...w })), left: [...g.left], turn: g.turn });
/** The bot's move. */
export function botMove(g, skill = 1) {
    const p = g.turn, me = dist(g, p), them = dist(g, 1 - p);
    const runStep = () => {
        const opts = steps(g);
        if (Math.random() < (1 - skill) * 0.3) return opts[Math.floor(Math.random() * opts.length)];
        let best = null, bd = Infinity;
        for (const s of opts) { if (s[0] === GOAL[p]) return s; const d = dist(g, p, s); if (d < bd || (d === bd && Math.random() < 0.5)) { bd = d; best = s; } }
        return best;
    };
    const wobble = (1 - skill) * 4;
    // Ahead (they move second, so a tie is ahead), out of walls, or a slip: run.
    if (g.left[p] <= 0 || me - them + (Math.random() - 0.5) * wobble <= 0 || Math.random() < (1 - skill) * 0.5) return { step: runStep() };
    let best = null, bv = 0;
    for (const w of allWalls(g)) {
        g.walls.push(w);
        // When they're about to make it, a wall is worth nearly any cost to us.
        const v = (dist(g, 1 - p) - them) - (dist(g, p) - me) * (them <= 2 ? 0.3 : 1.1);
        g.walls.pop();
        if (v > bv || (v === bv && best && Math.random() < 0.3)) { bv = v; best = w; }
    }
    // Only worth a wall if it costs them at least a step (two when it's not urgent).
    // Worth a wall if it costs them two steps, one when they're close, anything when they win next go.
    return best && (bv >= 2 || (bv >= 1 && them <= 3) || (bv > 0 && them <= 1)) ? { wall: best } : { step: runStep() };
}

// ── The game ────────────────────────────────────────────────────────────────
const S = 100 / N;   // percent per square
const CSS = `
.km-board{position:relative;width:calc(var(--c)*6.6);height:calc(var(--c)*6.6);background:#2c6e6a;border:calc(var(--c)*.09) solid #3f4652;border-radius:calc(var(--c)*.3);box-sizing:border-box}
.km-sq{position:absolute;border-radius:calc(var(--c)*.12);background:#d9efe6;box-shadow:inset 0 calc(var(--c)*-.05) 0 rgba(0,0,0,.12)}
.km-sq.goal0{background:color-mix(in srgb,var(--p0) 30%,#d9efe6)} .km-sq.goal1{background:color-mix(in srgb,var(--p1) 30%,#d9efe6)}
.km-sq.to::after{content:'';position:absolute;inset:30%;border-radius:50%;background:var(--tc);opacity:.45;animation:kmp 1s ease-in-out infinite}
@keyframes kmp{50%{transform:scale(1.3)}}
.km-pt{position:absolute;width:${S * 0.55}%;height:${S * 0.55}%;transform:translate(-50%,-50%);border-radius:50%;z-index:3;display:none}
.km.walling .km-pt{display:block}
.km-pt::after{content:'';position:absolute;inset:32%;border-radius:50%;background:#fff;opacity:.55}
.km-wall{position:absolute;border-radius:999px;background:linear-gradient(90deg,#2f9e44,#69db7c,#2f9e44);border:2px solid #1b4d2a;z-index:2;box-sizing:border-box}
.km-wall.v{background:linear-gradient(180deg,#2f9e44,#69db7c,#2f9e44)}
.km-wall.ghost{opacity:.7;background:#ffd200;border-color:#3f4652;animation:kmp 1s ease-in-out infinite}
.km-wall.bad{background:#e03131}
.km-crab{position:absolute;width:${S * 0.8}%;height:${S * 0.8}%;transform:translate(-50%,-50%);border-radius:50%;background:var(--cc);border:calc(var(--c)*.07) solid #3f4652;display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.48);transition:left .25s,top .25s;z-index:4;pointer-events:none}
.km-stock{display:flex;gap:calc(var(--c)*.4);font:800 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#3f4652}
.km-stock span{background:#fff;border:3px solid var(--pc);border-radius:999px;padding:2px 12px}
.bt-btn.on{background:#2f9e44;box-shadow:0 0 0 4px #ffd200}
`;

// Whose go the screen shows: it changes with the board turning round, not the moment a move is played.
let _up = 0;
let T = null, G = null, _skill = 0.55, _busy = false, _note = '', _walling = false, _ghost = null;

export function start(isBot, onWin, botSkill = 0.55) {
    G = newGame(); _skill = botSkill; _busy = false; _note = ''; _walling = false; _ghost = null;
    G.turn = Math.random() < 0.5 ? 0 : 1;
    _up = G.turn;
    let html = '';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
        html += `<div class="km-sq${r === 0 ? ' goal0' : r === N - 1 ? ' goal1' : ''}" data-act="sq" data-r="${r}" data-c="${c}" style="left:${c * S + S * 0.06}%;top:${r * S + S * 0.06}%;width:${S * 0.88}%;height:${S * 0.88}%"></div>`;
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++)
        html += `<div class="km-pt" data-act="pt" data-r="${r}" data-c="${c}" style="left:${(c + 1) * S}%;top:${(r + 1) * S}%"></div>`;
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'km', css: CSS, cols: 7.5, rows: 12.5,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="km-stock">${[0, 1].map(p => `<span data-p="${p}"></span>`).join('')}</div>
            <div class="km-board">${html}<div class="km-walls"></div><div class="km-crabs"></div></div>
            <div class="bt-row"><button class="bt-btn alt" data-act="wallmode">🌿 WALL</button><button class="bt-btn go" data-act="place">PLACE</button></div>`,
        onAct: (act, el) => {
            if (T.botTurn(G.turn) || _busy) return;
            if (act === 'sq') _tapSq(+el.dataset.r, +el.dataset.c);
            else if (act === 'wallmode') { _walling = !_walling && G.left[G.turn] > 0; _ghost = null; if (!G.left[G.turn]) _note = 'NO WALLS LEFT'; haptic([6]); _render(); }
            else if (act === 'pt') _tapPt(+el.dataset.r, +el.dataset.c);
            else if (act === 'place') _place();
        },
    });
    T.el.style.setProperty('--p0', T.hex(0)); T.el.style.setProperty('--p1', T.hex(1));
    T.face(G.turn, true);
    _render();
    if (T.botTurn(G.turn)) T.after(_botStep, 900);
}

function _tapSq(r, c) {
    if (!steps(G).some(([a, b]) => a === r && b === c)) return;
    _walling = false; _ghost = null;
    _do({ step: [r, c] });
}
// A gap point: first tap lays the wall across, the next turns it upright, the next across again.
function _tapPt(r, c) {
    if (!_walling) return;
    _ghost = _ghost && _ghost.r === r && _ghost.c === c ? { o: _ghost.o === 'h' ? 'v' : 'h', r, c } : { o: 'h', r, c };
    haptic([6]); sfx('tick');
    _note = canWall(G, _ghost) ? '' : 'A WALL CAN\'T GO THERE';
    _render();
}
function _place() {
    if (!_walling || !_ghost) { _note = _walling ? 'TAP A GAP POINT FIRST' : 'TAP 🌿 WALL FIRST'; return _render(); }
    if (!canWall(G, _ghost)) { _note = 'A WALL CAN\'T GO THERE'; return _render(); }
    const w = _ghost;
    _walling = false; _ghost = null;
    _do({ wall: w });
}

function _do(m) {
    extendWatchdog(120000);
    const p = G.turn, r = play(G, m);
    haptic([10]); sfx(m.wall ? 'coin_gain' : 'tick');
    _note = m.wall ? `${T.name(p)} PLANTS KELP` : '';
    _busy = true;
    _render();
    if (r === 'win') { T.wow('MADE IT ACROSS!'); return T.after(() => _end(p), 1500); }
    T.after(() => { _busy = false; _note = ''; _up = G.turn; T.face(G.turn); _render(); if (T.botTurn(G.turn)) T.after(_botStep, 650 + Math.random() * 350); }, m.wall ? 700 : 380);
}

function _botStep() {
    if (T.done || !T.botTurn(G.turn)) return;
    const m = botMove(G, _skill);
    if (m.wall) { _ghost = m.wall; _render(); T.after(() => { _ghost = null; _do(m); }, 600); }
    else _do(m);
}

function _end(w) {
    const d = [dist(G, 0), dist(G, 1)].map(x => (x === Infinity ? 99 : x));
    T.end({ winner: w, standings: [w === 0 ? 1 : 0, w === 1 ? 1 : 0], head: `${T.name(w)} WINS!`,
        html: `<p style="opacity:1;font-size:14px;margin-bottom:6px">${T.name(1 - w)} WAS ${d[1 - w]} STEP${d[1 - w] === 1 ? '' : 'S'} AWAY</p>` });
}

const wallBox = w => (w.o === 'h'
    ? `left:${w.c * S + S * 0.08}%;top:${(w.r + 1) * S - S * 0.09}%;width:${S * 1.84}%;height:${S * 0.18}%`
    : `left:${(w.c + 1) * S - S * 0.09}%;top:${w.r * S + S * 0.08}%;width:${S * 0.18}%;height:${S * 1.84}%`);

function _render() {
    if (!T || T.done) return;
    const p = _up, bot = T.botTurn(p) || _busy;
    const hint = _note || (_busy ? '' : T.botTurn(p) ? 'THINKING…' : _walling ? (_ghost ? 'TAP IT AGAIN TO TURN IT · PLACE TO PLANT' : 'TAP A GAP POINT FOR YOUR WALL') : 'STEP (TAP A GLOWING SQUARE) OR PLANT A 🌿 WALL');
    T.head(p, `${T.name(p)}'S GO`, hint);
    T.el.classList.toggle('walling', _walling && !bot);
    T.el.style.setProperty('--tc', T.hex(p));
    const to = bot || _walling || _busy ? [] : steps(G);
    T.qa('.km-sq').forEach(el => el.classList.toggle('to', to.some(([r, c]) => r === +el.dataset.r && c === +el.dataset.c)));
    T.q('.km-walls').innerHTML = G.walls.map(w => `<div class="km-wall ${w.o}" style="${wallBox(w)}"></div>`).join('')
        + (_ghost ? `<div class="km-wall ${_ghost.o} ghost${canWall(G, _ghost) || bot ? '' : ' bad'}" style="${wallBox(_ghost)}"></div>` : '');
    T.q('.km-crabs').innerHTML = G.pawn.map(([r, c], q) => `<div class="km-crab" style="--cc:${T.hex(q)};left:${(c + 0.5) * S}%;top:${(r + 0.5) * S}%">🦀</div>`).join('');
    T.qa('.km-stock span').forEach(el => { const q = +el.dataset.p; el.style.setProperty('--pc', T.hex(q)); el.textContent = `${T.name(q)} 🌿 ${G.left[q]}`; });
    const [wb, pb] = T.qa('.bt-btn');
    wb.classList.toggle('on', _walling); wb.classList.toggle('off', bot || !G.left[p]);
    wb.textContent = `🌿 WALL · ${G.left[p]}`;
    pb.classList.toggle('off', bot || !_walling || !_ghost || !canWall(G, _ghost));
}

/** Probes. */
export function _debugState() { return copy(G); }
export function _probeTap() {
    if (!T || T.done || T.botTurn(G.turn) || _busy || T.locked()) return null;
    if (!T._plan || T._plan.for !== G.walls.length + ':' + G.pawn.join()) T._plan = { for: G.walls.length + ':' + G.pawn.join(), m: botMove(G, 1) };
    const m = T._plan.m;
    if (m.step) return `.km-sq[data-r="${m.step[0]}"][data-c="${m.step[1]}"]`;
    const w = m.wall;
    if (!_walling) return '.bt-btn[data-act="wallmode"]';
    if (!_ghost || _ghost.r !== w.r || _ghost.c !== w.c || _ghost.o !== w.o) return `.km-pt[data-r="${w.r}"][data-c="${w.c}"]`;
    return '.bt-btn[data-act="place"]';
}
