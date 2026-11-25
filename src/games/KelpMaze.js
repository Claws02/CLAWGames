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
import * as Pieces from './board/Pieces.js';

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
    else { g.walls.push({ ...m.wall, by: p }); g.left[p]--; }
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
.km{background:linear-gradient(180deg,#56c2d6 0%,#2a8fb0 55%,#1d6a8e 100%)}
.km.p2{background:linear-gradient(180deg,#6aa9e8 0%,#3f7fc9 55%,#2c5d9e 100%)}
.km .bt-hint,.km .km-stock{color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.35)}
.km-sea{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.km-sea::before{content:'';position:absolute;inset:-10% -30%;background:repeating-linear-gradient(105deg,rgba(255,255,255,.09) 0 4%,transparent 4% 11%);animation:kmrays 14s linear infinite}
@keyframes kmrays{to{transform:translateX(12%)}}
.km-fish{position:absolute;left:-15%;font-size:calc(var(--c)*.5);animation:kmswim linear infinite;opacity:.85}
@keyframes kmswim{to{transform:translateX(calc(100vw + 40%))}}
.km-board{position:relative;width:calc(var(--c)*6.6);height:calc(var(--c)*6.6);border:calc(var(--c)*.1) solid #3f4652;border-radius:calc(var(--c)*.35);box-sizing:border-box;
  background:radial-gradient(circle at 30% 20%,#2f97a3,#1b5f6f);box-shadow:0 calc(var(--c)*.14) 0 #3f4652,inset 0 0 calc(var(--c)*.5) rgba(0,0,0,.35)}
.km-sq{position:absolute;border-radius:calc(var(--c)*.14);
  background:radial-gradient(circle at 25% 30%,rgba(255,255,255,.55) 0 4%,transparent 5%),radial-gradient(circle at 70% 72%,rgba(160,120,70,.35) 0 5%,transparent 6%),radial-gradient(circle at 60% 25%,rgba(160,120,70,.25) 0 3%,transparent 4%),linear-gradient(160deg,#f7e8c2,#e8d29c);
  box-shadow:inset 0 calc(var(--c)*-.06) 0 rgba(120,85,40,.3)}
.km-sq.goal0,.km-sq.goal1{background:radial-gradient(circle at 30% 70%,rgba(255,255,255,.5) 0 10%,transparent 11%),radial-gradient(circle at 70% 30%,rgba(255,255,255,.35) 0 8%,transparent 9%),linear-gradient(160deg,color-mix(in srgb,var(--gc) 55%,#ffd6c9),color-mix(in srgb,var(--gc) 75%,#7a2e3a))}
.km-sq.goal0{--gc:var(--p0)} .km-sq.goal1{--gc:var(--p1)}
.km-sq.to::after{content:'';position:absolute;inset:26%;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,var(--tc) 45%,transparent 70%);opacity:.9;animation:kmp 1s ease-in-out infinite}
@keyframes kmp{50%{transform:scale(1.3)}}
.km-pt{position:absolute;width:${S * 0.6}%;height:${S * 0.6}%;transform:translate(-50%,-50%);border-radius:50%;z-index:5;display:none}
.km.walling .km-pt{display:block}
.km-pt::after{content:'';position:absolute;inset:30%;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#ffd6e8 50%,#ff8fb8);box-shadow:0 0 calc(var(--c)*.2) #fff;animation:kmp 1.4s ease-in-out infinite}
.km-wall{position:absolute;z-index:3;box-sizing:border-box;border-radius:calc(var(--c)*.2);border:calc(var(--c)*.05) solid #5a1e30;
  background:radial-gradient(circle at 12% 40%,rgba(255,255,255,.6) 0 9%,transparent 10%),radial-gradient(circle at 34% 62%,rgba(255,255,255,.45) 0 8%,transparent 9%),radial-gradient(circle at 58% 35%,rgba(255,255,255,.55) 0 9%,transparent 10%),radial-gradient(circle at 84% 60%,rgba(255,255,255,.45) 0 8%,transparent 9%),
    linear-gradient(var(--wd,0deg),color-mix(in srgb,var(--wc) 35%,#d6365e),color-mix(in srgb,var(--wc) 25%,#ff8f8f) 55%,color-mix(in srgb,var(--wc) 20%,#ffc2a8));
  box-shadow:0 calc(var(--c)*.08) 0 rgba(0,0,0,.4),inset 0 calc(var(--c)*-.05) 0 rgba(0,0,0,.2)}
.km-wall.v{--wd:90deg}
.km-wall.grow.h{animation:kmgrowh .55s cubic-bezier(.3,1.5,.5,1)} .km-wall.grow.v{animation:kmgrowv .55s cubic-bezier(.3,1.5,.5,1)}
@keyframes kmgrowh{from{transform:scaleX(0)}} @keyframes kmgrowv{from{transform:scaleY(0)}}
.km-frond{position:absolute;font-size:calc(var(--c)*.55);transform-origin:50% 100%;animation:kmsway 2.6s ease-in-out infinite alternate;pointer-events:none;filter:drop-shadow(0 1px 0 rgba(0,0,0,.3))}
.km-wall.h .km-frond{bottom:30%;transform:translateX(-50%)} .km-wall.v .km-frond{left:50%;transform:translate(-50%,-50%)}
@keyframes kmsway{from{rotate:-10deg}to{rotate:10deg}}
.km-wall.ghost{opacity:.75;animation:kmp 1s ease-in-out infinite;--wc:#ffd200}
.km-wall.bad{--wc:#e03131;filter:grayscale(.2)}
.km-crab{position:absolute;width:${S * 0.86}%;height:${S * 0.86}%;transform:translate(-50%,-50%);z-index:6;pointer-events:none;transition:left .32s cubic-bezier(.3,1.3,.5,1),top .32s cubic-bezier(.3,1.3,.5,1)}
.km-crab .ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 40% 30%,#fff,var(--cc) 70%);border:calc(var(--c)*.07) solid #3f4652;box-shadow:0 calc(var(--c)*.1) 0 rgba(0,0,0,.35);overflow:hidden}
.km-crab .pc-face{position:absolute;inset:5%;width:90%;height:90%;border-radius:50%;object-fit:cover}
.km-crab .pc-face.emoji{display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.48)}
.km-crab.up .ring{box-shadow:0 0 0 calc(var(--c)*.08) #fff,0 0 calc(var(--c)*.35) var(--cc),0 calc(var(--c)*.1) 0 rgba(0,0,0,.35)}
.km-crab.hop .ring{animation:kmhop .32s ease-out}
@keyframes kmhop{40%{transform:translateY(-35%) scale(1.08)}}
.km-stock{display:flex;gap:calc(var(--c)*.3);font:800 calc(var(--c)*.2) Nunito,system-ui,sans-serif}
.km-stock>span{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.92);color:#3f4652;text-shadow:none;border:3px solid var(--pc);border-radius:999px;padding:2px 10px 2px 3px}
.km-stock .mini{width:calc(var(--c)*.5);height:calc(var(--c)*.5);border-radius:50%;background:var(--pc);overflow:hidden;display:inline-flex;align-items:center;justify-content:center}
.km-stock .mini .pc-face{width:100%;height:100%;object-fit:cover}
.km-stock .mini .pc-face.emoji{font-size:calc(var(--c)*.3)}
.km-stock .pips{letter-spacing:-2px}
.bt-btn.on{background:#e8557a;box-shadow:0 0 0 4px #ffd200}
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
    Pieces.prepare(2);
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'km', css: CSS, cols: 7.5, rows: 12.5,
        html: `<div class="km-sea">${[['🐠', 18, 16, 0], ['🐟', 34, 21, -7], ['🐡', 62, 19, -12], ['🐠', 80, 24, -4]].map(([f, y, d, l]) => `<i class="km-fish" style="top:${y}%;animation-duration:${d}s;animation-delay:${l}s">${f}</i>`).join('')}</div>
            <div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="km-stock">${[0, 1].map(p => `<span data-p="${p}"></span>`).join('')}</div>
            <div class="km-board">${html}<div class="km-walls"></div><div class="km-ghost"></div><div class="km-crabs">${[0, 1].map(q => `<div class="km-crab" data-p="${q}"><div class="ring">${Pieces.pieceHTML(q)}</div></div>`).join('')}</div></div>
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

const wallEl = (w, cls = '') => `<div class="km-wall ${w.o}${cls}" style="${wallBox(w)};--wc:${w.by === undefined ? '#ffd200' : T.hex(w.by)}">`
    + (cls.includes('ghost') ? '' : [0.25, 0.75].map((f, k) => `<i class="km-frond" style="${w.o === 'h' ? `left:${f * 100}%` : `top:${f * 100}%`};animation-delay:-${k * 1.3}s">🌿</i>`).join('')) + `</div>`;

const wallBox = w => (w.o === 'h'
    ? `left:${w.c * S + S * 0.05}%;top:${(w.r + 1) * S - S * 0.16}%;width:${S * 1.9}%;height:${S * 0.32}%`
    : `left:${(w.c + 1) * S - S * 0.16}%;top:${w.r * S + S * 0.05}%;width:${S * 0.32}%;height:${S * 1.9}%`);

function _render() {
    if (!T || T.done) return;
    const p = _up, bot = T.botTurn(p) || _busy;
    const hint = _note || (_busy ? '' : T.botTurn(p) ? 'THINKING…' : _walling ? (_ghost ? 'TAP IT AGAIN TO TURN IT · PLACE TO GROW IT' : 'TAP A PEARL BETWEEN SQUARES FOR YOUR WALL') : 'STEP TO A GLOWING SQUARE, OR GROW A 🌿 WALL');
    T.head(p, `${T.name(p)}'S GO`, hint);
    T.el.classList.toggle('walling', _walling && !bot);
    T.el.style.setProperty('--tc', T.hex(p));
    const to = bot || _walling || _busy ? [] : steps(G);
    T.qa('.km-sq').forEach(el => el.classList.toggle('to', to.some(([r, c]) => r === +el.dataset.r && c === +el.dataset.c)));
    // Placed walls stay put; only a new one is added, and it grows in.
    const box = T.q('.km-walls');
    if (box.children.length > G.walls.length) box.innerHTML = '';
    for (let k = box.children.length; k < G.walls.length; k++) box.insertAdjacentHTML('beforeend', wallEl(G.walls[k], ' grow'));
    T.q('.km-ghost').innerHTML = _ghost ? wallEl(_ghost, ` ghost${canWall(G, _ghost) || bot ? '' : ' bad'}`) : '';
    // The crabs slide (and hop) from square to square.
    T.qa('.km-crab').forEach(el => {
        const q = +el.dataset.p, [r, c] = G.pawn[q], at = `${r},${c}`;
        el.style.setProperty('--cc', T.hex(q));
        if (el.dataset.at && el.dataset.at !== at) { el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
        el.dataset.at = at;
        el.style.left = `${(c + 0.5) * S}%`; el.style.top = `${(r + 0.5) * S}%`;
        el.classList.toggle('up', q === p && !_busy);
    });
    T.qa('.km-stock > span').forEach(el => {
        const q = +el.dataset.p;
        el.style.setProperty('--pc', T.hex(q));
        el.innerHTML = `<i class="mini">${Pieces.pieceHTML(q)}</i>${T.name(q)} <span class="pips">${'🌿'.repeat(G.left[q]) || '—'}</span>`;
    });
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
