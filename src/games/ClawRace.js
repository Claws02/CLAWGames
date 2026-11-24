// ============================================================
// CLAW RACE — a dice race round the rock pool, two players on one phone.
//
// Three crabs each wait in their nest. ROLL the die, then tap a crab to move
// it that many squares round the pool (anticlockwise, from your own rock).
// Any roll brings a crab out of the nest. Land on a rival crab and it's sent
// back to its nest, unless it's sitting on a safe rock (the four ⛰ squares).
// Roll a 6 and you go again. A crab that gets all the way round is home; get
// all three home to win.
//
// On the shared board-game base (board/Tabletop.js, board/Dice.js). Bot:
// scores every move it could make (capture, get home, escape danger, come out,
// avoid landing where a rival can reach) and plays the best; lower skill
// sometimes just moves its front crab.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';
import * as Dice from './board/Dice.js';

// ── Rules ───────────────────────────────────────────────────────────────────
// The track is the 24 squares round the edge of a 7×7 board, numbered from the
// bottom-left corner rightwards (anticlockwise). Player 0 starts on square 3
// (bottom middle), player 1 on square 15 (top middle). A crab's `pos` is how
// far it has come from its own start: -1 in the nest, 0..23 on the track,
// LAP (24) home.
export const LAP = 24, CRABS = 3, START = [3, 15], SAFE = [3, 9, 15, 21];
export const cellOf = (p, pos) => (START[p] + pos) % LAP;
export const newGame = () => ({ crabs: [new Array(CRABS).fill(-1), new Array(CRABS).fill(-1)], turn: 0 });
export const homeCount = (g, p) => g.crabs[p].filter(v => v >= LAP).length;
/** Where crab c of player p ends up with roll r: its new pos. */
export const dest = (pos, r) => (pos < 0 ? r - 1 : Math.min(LAP, pos + r));
/** The moves the player to go has with roll r: one per distinct crab position, [{ c, from, to }]. */
export function moves(g, r) {
    const p = g.turn, seen = new Set(), out = [];
    g.crabs[p].forEach((pos, c) => {
        if (pos >= LAP || seen.has(pos)) return;
        seen.add(pos);
        out.push({ c, from: pos, to: dest(pos, r) });
    });
    return out;
}
/** Rival crabs sitting on track square `cell` (not on a safe rock): [crab index…]. */
export function victims(g, p, cell) {
    if (SAFE.includes(cell)) return [];
    const q = 1 - p;
    return g.crabs[q].map((pos, c) => (pos >= 0 && pos < LAP && cellOf(q, pos) === cell ? c : -1)).filter(c => c >= 0);
}
/** Make move m with roll r: { caught, home, again, won }. Mutates g (and passes the turn unless it goes again). */
export function play(g, m, r) {
    const p = g.turn;
    g.crabs[p][m.c] = m.to;
    let caught = 0;
    if (m.to < LAP) {
        const v = victims(g, p, cellOf(p, m.to));
        v.forEach(c => { g.crabs[1 - p][c] = -1; });
        caught = v.length;
    }
    const won = homeCount(g, p) === CRABS;
    const again = !won && r === 6;
    if (!won && !again) g.turn = 1 - p;
    return { caught, home: m.to >= LAP, again, won };
}
// How many rival crabs could land on `cell` next roll (from the track, or out of
// their nest). Crabs on the same square (the nest too) are one threat, not several.
function threat(g, p, cell) {
    if (SAFE.includes(cell)) return 0;
    const q = 1 - p;
    let n = 0;
    for (const pos of new Set(g.crabs[q])) {
        if (pos >= LAP) continue;
        for (let r = 1; r <= 6; r++) { const d = dest(pos, r); if (d < LAP && cellOf(q, d) === cell) { n++; break; } }
    }
    return n;
}
/** How good move m is for the player to go (higher is better). */
export function rate(g, m) {
    const p = g.turn;
    let v = m.to - Math.max(0, m.from);
    if (m.to >= LAP) v += 60;
    else {
        const cell = cellOf(p, m.to);
        const vic = victims(g, p, cell);
        if (vic.length) v += 70 + vic.reduce((s, c) => s + Math.max(0, g.crabs[1 - p][c]), 0);
        if (SAFE.includes(cell)) v += 12;
        v -= threat(g, p, cell) * (20 + m.to * 0.8);
    }
    if (m.from < 0) v += 25;
    else if (m.from < LAP && threat(g, p, cellOf(p, m.from))) v += 18 + m.from * 0.6;
    return v;
}
/** The bot's move for roll r. */
export function botMove(g, r, skill = 1) {
    const all = moves(g, r);
    if (!all.length) return null;
    if (Math.random() < (1 - skill) * 0.4) return all.reduce((a, b) => (b.from > a.from ? b : a));
    return all.reduce((a, b) => (rate(g, b) > rate(g, a) ? b : a));
}

// ── The game ────────────────────────────────────────────────────────────────
// Track square → [row, col] on the 7×7 board.
export const RC = Array.from({ length: LAP }, (_, t) =>
    t <= 6 ? [6, t] : t <= 12 ? [12 - t, 6] : t <= 18 ? [0, 18 - t] : [t - 18, 0]);

const CSS = `
.cr-board{position:relative;display:grid;grid-template:repeat(7,1fr)/repeat(7,1fr);gap:calc(var(--c)*.05);width:calc(var(--c)*6.8);height:calc(var(--c)*6.8);background:#7ec8d8;padding:calc(var(--c)*.1);border:calc(var(--c)*.09) solid #3f4652;border-radius:calc(var(--c)*.35);box-sizing:border-box}
.cr-sq{position:relative;background:#f6e3b4;border-radius:calc(var(--c)*.14);box-shadow:inset 0 calc(var(--c)*-.06) 0 rgba(0,0,0,.12)}
.cr-sq.safe{background:#b9b2a5}
.cr-sq.safe::before{content:'⛰';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.42);opacity:.55}
.cr-sq.start0{box-shadow:inset 0 0 0 calc(var(--c)*.07) var(--p0)}
.cr-sq.start1{box-shadow:inset 0 0 0 calc(var(--c)*.07) var(--p1)}
.cr-mid{grid-area:2/2/7/7;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:calc(var(--c)*.12) 0}
.cr-nest{display:flex;align-items:center;gap:calc(var(--c)*.12);padding:calc(var(--c)*.08) calc(var(--c)*.2);border-radius:999px;background:rgba(255,255,255,.6);border:3px solid var(--nc);font:800 calc(var(--c)*.18) Nunito,system-ui,sans-serif;color:#3f4652;min-height:calc(var(--c)*.6)}
.cr-nest.can{box-shadow:0 0 0 calc(var(--c)*.08) #ffd200;animation:crglow 1s ease-in-out infinite}
@keyframes crglow{50%{box-shadow:0 0 0 calc(var(--c)*.16) #ffd200}}
.cr-nest .cr-crab{position:static;margin:0}
.cr-home{font:calc(var(--c)*.34) 'Bebas Neue',Impact,sans-serif;color:#3f4652;letter-spacing:1px}
.cr-mid .bd-die{width:calc(var(--c)*1.35);height:calc(var(--c)*1.35)}
.cr-crab{position:absolute;left:50%;top:50%;width:calc(var(--c)*.72);height:calc(var(--c)*.72);margin:calc(var(--c)*-.36) 0 0 calc(var(--c)*-.36);border-radius:50%;background:var(--cc);border:calc(var(--c)*.06) solid #3f4652;display:flex;align-items:center;justify-content:center;font-size:calc(var(--c)*.4);transition:transform .2s;pointer-events:none}
.cr-crab.two{transform:translate(-18%,-18%)} .cr-crab.two+.cr-crab{transform:translate(18%,18%)}
.cr-crab b{position:absolute;right:-30%;top:-30%;background:#3f4652;color:#fff;border-radius:999px;font:calc(var(--c)*.22) 'Bebas Neue',Impact,sans-serif;padding:0 5px}
.cr-sq.can{box-shadow:0 0 0 calc(var(--c)*.08) #ffd200;z-index:2}
.cr-sq.can .cr-crab{animation:crhop .7s ease-in-out infinite}
@keyframes crhop{50%{transform:translateY(-18%)}}
.cr-sq.aim{background:#fff6b8}
`;

let T = null, G = null, _roll = 0, _phase = 'roll', _note = '', _skill = 0.55, _opts = [];

export function start(isBot, onWin, botSkill = 0.55) {
    G = newGame(); _roll = 0; _phase = 'roll'; _note = ''; _skill = botSkill; _opts = [];
    G.turn = Math.random() < 0.5 ? 0 : 1;
    let sq = '';
    RC.forEach(([r, c], t) => {
        const cls = `cr-sq${SAFE.includes(t) ? ' safe' : ''}${t === START[0] ? ' start0' : t === START[1] ? ' start1' : ''}`;
        sq += `<div class="${cls}" data-act="sq" data-t="${t}" style="grid-area:${r + 1}/${c + 1}"></div>`;
    });
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'cr', css: CSS + Dice.DICE_CSS, cols: 7.5, rows: 12,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="cr-board">${sq}<div class="cr-mid">
                <div class="cr-nest" data-act="nest" data-p="1"></div>
                <div class="bt-row"><span class="cr-home" data-home="1"></span><div class="bd-die blank" data-act="roll"></div><span class="cr-home" data-home="0"></span></div>
                <div class="cr-nest" data-act="nest" data-p="0"></div>
            </div></div>
            <div class="bt-row"><button class="bt-btn" data-act="roll">ROLL</button></div>`,
        onAct: (act, el) => {
            if (T.botTurn(G.turn)) return;
            if (act === 'roll') _doRoll();
            else if (act === 'sq') _tapCell(+el.dataset.t);
            else if (act === 'nest' && +el.dataset.p === G.turn) _tapNest();
        },
    });
    T.el.style.setProperty('--p0', T.hex(0)); T.el.style.setProperty('--p1', T.hex(1));
    T.face(G.turn, true);
    _render();
    if (T.botTurn(G.turn)) T.after(_botStep, 900);
}

async function _doRoll() {
    if (_phase !== 'roll' || T.done) return;
    _phase = 'rolling'; _note = '';
    extendWatchdog(120000);
    sfx('dice_throw'); _render();
    const [f] = await Dice.roll(T, [T.q('.cr-mid .bd-die')], 1);
    if (T.done) return;
    _roll = f; sfx('dice_land');
    _opts = moves(G, f);
    _phase = 'move';
    _render();
    if (T.botTurn(G.turn)) return T.after(_botStep, 650 + Math.random() * 300);
    // Only one thing it can do: do it.
    if (_opts.length === 1) T.after(() => _move(_opts[0]), 650);
}

function _tapCell(t) {
    if (_phase !== 'move') return;
    const m = _opts.find(o => o.from >= 0 && o.from < LAP && cellOf(G.turn, o.from) === t);
    if (m) _move(m);
}
function _tapNest() {
    if (_phase !== 'move') return;
    const m = _opts.find(o => o.from < 0);
    if (m) _move(m);
}

function _move(m) {
    if (_phase !== 'move' || T.done) return;
    const p = G.turn, r = play(G, m, _roll);
    _phase = 'moved'; haptic([10]);
    _note = r.caught ? `SNAP! BACK TO THE NEST` : r.home ? 'A CRAB GETS HOME!' : r.again ? 'A SIX: GO AGAIN' : '';
    if (r.caught) { sfx('coin_gain'); T.wow('SNAP!'); haptic([30, 20, 30]); } else if (r.home) sfx('coin_gain'); else sfx('tick');
    _render();
    if (r.won) { T.wow('ALL HOME!'); return T.after(() => _end(p), 1500); }
    T.after(() => {
        _phase = 'roll'; _roll = 0;
        if (!r.again) { _note = ''; T.face(G.turn); }
        _render();
        if (T.botTurn(G.turn)) T.after(_botStep, 600 + Math.random() * 300);
    }, r.caught ? 1100 : 600);
}

function _botStep() {
    if (T.done || !T.botTurn(G.turn)) return;
    if (_phase === 'roll') return _doRoll();
    if (_phase !== 'move') return;
    const m = botMove(G, _roll, _skill);
    if (!m) return;
    if (m.from >= 0 && m.from < LAP) T.q(`.cr-sq[data-t="${cellOf(G.turn, m.from)}"]`)?.classList.add('aim');
    T.after(() => _move(m), 380);
}

function _end(w) {
    const s = [homeCount(G, 0), homeCount(G, 1)];
    T.end({ winner: w, standings: s, head: `${T.name(w)} WINS!`,
        html: `<table><tr><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr><tr class="t"><td>${s[0]} HOME</td><td>${s[1]} HOME</td></tr></table>` });
}

function _render() {
    if (!T || T.done) return;
    const p = G.turn, bot = T.botTurn(p);
    const hint = _note || (bot ? 'THINKING…' : _phase === 'roll' ? 'ROLL THE DIE' : _phase === 'move' ? `MOVE A CRAB ${_roll} · TAP IT${_opts.some(o => o.from < 0) ? ' (OR YOUR NEST)' : ''}` : '');
    T.head(p, `${T.name(p)}'S GO`, hint);
    const can = _phase === 'move' && !bot ? _opts : [];
    T.qa('.cr-sq').forEach(el => {
        const t = +el.dataset.t, here = [];
        [0, 1].forEach(q => G.crabs[q].forEach(pos => { if (pos >= 0 && pos < LAP && cellOf(q, pos) === t) here.push(q); }));
        const by = [0, 1].map(q => here.filter(x => x === q).length).map((n, q) => (n ? { q, n } : null)).filter(Boolean);
        el.innerHTML = by.map((b, k) => `<div class="cr-crab${by.length > 1 && k === 0 ? ' two' : ''}" style="--cc:${T.hex(b.q)}">🦀${b.n > 1 ? `<b>${b.n}</b>` : ''}</div>`).join('');
        el.classList.toggle('can', can.some(o => o.from >= 0 && o.from < LAP && cellOf(p, o.from) === t));
        el.classList.remove('aim');
    });
    T.qa('.cr-nest').forEach(el => {
        const q = +el.dataset.p, n = G.crabs[q].filter(v => v < 0).length;
        el.style.setProperty('--nc', T.hex(q));
        el.innerHTML = `${T.name(q)}'S NEST ${'<div class="cr-crab" style="--cc:' + T.hex(q) + '">🦀</div>'.repeat(n)}`;
        el.classList.toggle('can', q === p && can.some(o => o.from < 0));
    });
    T.qa('.cr-home').forEach(el => { const q = +el.dataset.home; el.style.color = T.hex(q); el.textContent = `🏠 ${homeCount(G, q)}/${CRABS}`; });
    if (_phase !== 'rolling') Dice.paint(T.q('.cr-mid .bd-die'), _roll);
    T.q('.bt-btn[data-act="roll"]').classList.toggle('off', bot || _phase !== 'roll');
}

/** Probes. */
export function _debugState() { return { crabs: G.crabs.map(a => [...a]), turn: G.turn, roll: _roll, phase: _phase }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(G.turn) || T.locked()) return null;
    if (_phase === 'roll') return '.bt-btn[data-act="roll"]';
    if (_phase !== 'move') return null;
    const m = botMove(G, _roll, 1);
    if (!m) return null;
    return m.from < 0 ? `.cr-nest[data-p="${G.turn}"]` : `.cr-sq[data-t="${cellOf(G.turn, m.from)}"]`;
}
