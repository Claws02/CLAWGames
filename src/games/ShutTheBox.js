// ============================================================
// SHUT THE BOX — two players on one phone, a box of tiles 1–12 each.
//
// A CLAWGames-only game on the shared board-game base (board/Tabletop.js,
// board/Dice.js), wired in by src/games/index.js.
//
// Rules (this version):
//   - Roll two dice. Shut ONE tile: either die's number, or the two added up.
//     A 3 and a 4 can shut the 3, the 4 or the 7.
//   - When none of those three is still open, you're stuck and your go ends.
//   - Each player plays their whole box in turn: the first until stuck, then
//     the second, who knows the score to beat.
//   - Your score is how many tiles you shut (0–12; all 12 is shutting the box).
//     More wins; the same is a draw.
//
// The phone lies flat between you (the tabletop hold) and turns round to face
// whoever's up; against a bot it stays with the human.
//
// Bot: it knows, for every box, how many more tiles it can expect to shut
// from there (worked out exactly over all 4096 boxes), and shuts the tile that
// leaves the best box. Lower skill sometimes shuts a different open tile.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';
import * as Dice from './board/Dice.js';

// ── Rules ───────────────────────────────────────────────────────────────────
export const TILES = 12;
const bit = n => 1 << (n - 1);
/** The tiles a roll can shut: each die's number and their total, if still open. mask: shut tiles (bit n-1 = tile n). */
export function options(dice, mask) {
    const [a, b] = dice;
    return [...new Set([a, b, a + b])].filter(n => n >= 1 && n <= TILES && !(mask & bit(n))).sort((x, y) => x - y);
}
export const count = mask => { let c = 0; for (let n = 1; n <= TILES; n++) if (mask & bit(n)) c++; return c; };
export const openTotal = mask => { let s = 0; for (let n = 1; n <= TILES; n++) if (!(mask & bit(n))) s += n; return s; };

// How many more tiles you can expect to shut from box `mask`, playing your best.
const _ev = new Float64Array(1 << TILES).fill(-1);
export function expected(mask) {
    if (_ev[mask] >= 0) return _ev[mask];
    let sum = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
        let best = -1;
        for (const n of options([a, b], mask)) best = Math.max(best, 1 + expected(mask | bit(n)));
        sum += Math.max(0, best);
    }
    return (_ev[mask] = sum / 36);
}
/** The tile that leaves the best box (ties: the bigger tile, the harder one to shut later). */
export function bestTile(dice, mask) {
    let best = null, v = -1;
    for (const n of options(dice, mask)) { const e = expected(mask | bit(n)); if (e > v + 1e-12 || (Math.abs(e - v) <= 1e-12 && n > best)) { v = e; best = n; } }
    return best;
}

// ── The game ────────────────────────────────────────────────────────────────
const CSS = `
.sb{background:#f4997b}
.sb.p2{background:#7fb3e6}
.sb-box{background:linear-gradient(#a8743f,#7b4f25);border:calc(var(--c)*.08) solid #3f2a14;border-radius:calc(var(--c)*.3);padding:calc(var(--c)*.22);box-shadow:inset 0 0 0 calc(var(--c)*.06) #c8935a,0 calc(var(--c)*.1) 0 #3f2a14}
.sb-felt{background:radial-gradient(#3c9a63,#256b43);border-radius:calc(var(--c)*.18);padding:calc(var(--c)*.2) calc(var(--c)*.16);display:grid;grid-template-columns:repeat(6,calc(var(--c)*.92));gap:calc(var(--c)*.14) calc(var(--c)*.1)}
.sb-tile{height:calc(var(--c)*1.5);border-radius:calc(var(--c)*.14);background:linear-gradient(#fff8ea,#f1dcb6);border:calc(var(--c)*.05) solid #6b4a24;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:calc(var(--c)*.72) 'Bebas Neue',Impact,sans-serif;color:#3f4652;position:relative;transition:transform .25s,opacity .25s;transform-origin:50% 100%}
.sb-tile.shut{transform:perspective(200px) rotateX(70deg);background:#5a3b1c;color:rgba(255,255,255,.25);border-color:#3f2a14}
.sb-tile.opt{background:#fffbe6;border-color:#ffd200;box-shadow:0 0 0 calc(var(--c)*.07) #ffd200,0 0 calc(var(--c)*.35) #ffe680;animation:sbbob 1s ease-in-out infinite}
.sb-tile.opt i{position:absolute;bottom:calc(var(--c)*-.05);left:0;right:0;text-align:center;font:900 calc(var(--c)*.17) Nunito,system-ui,sans-serif;font-style:normal;color:#b45309}
.sb-tile.pop{animation:sbpop .45s ease-out}
@keyframes sbbob{50%{transform:translateY(calc(var(--c)*-.08))}}
@keyframes sbpop{0%{transform:scale(1.25)}100%{transform:perspective(200px) rotateX(70deg)}}
.sb-tray{display:flex;align-items:center;gap:calc(var(--c)*.3);min-height:calc(var(--c)*1.5)}
.sb-sum{font:calc(var(--c)*.8) 'Bebas Neue',Impact,sans-serif;color:#3f4652;min-width:calc(var(--c)*1.4);text-align:center}
.sb-chip{flex-direction:column;align-items:center;gap:2px;padding:4px 12px;max-width:calc(var(--c)*3.4);border-radius:calc(var(--c)*.25)}
.sb-top{display:flex;align-items:baseline;gap:6px;white-space:nowrap;max-width:100%;overflow:hidden}
.sb-name{overflow:hidden;text-overflow:ellipsis}
.sb-mini{display:flex;gap:2px}
.sb-mini s{width:calc(var(--c)*.13);height:calc(var(--c)*.22);border-radius:2px;background:rgba(63,70,82,.18);text-decoration:none}
.sb-mini s.on{background:var(--pc)}
.sb-chip small{font:800 calc(var(--c)*.16) Nunito,system-ui,sans-serif;opacity:.7}
.sb-wow{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:calc(var(--c)*1.1) 'Bebas Neue',Impact,sans-serif;color:#ffd200;-webkit-text-stroke:3px #3f4652;letter-spacing:3px;animation:sbwow 1.8s ease-out forwards}
@keyframes sbwow{0%{transform:scale(.3) rotate(-10deg);opacity:0}20%{transform:scale(1.1) rotate(-4deg);opacity:1}80%{opacity:1}100%{transform:scale(1) rotate(-4deg);opacity:0}}
`;

let T = null, _boxes = [0, 0], _played = [false, false], _turn = 0, _dice = [0, 0], _opts = [], _phase = 'roll', _note = '', _botSkill = 0.55, _flash = 0, _first = 0;

export function start(isBot, onWin, botSkill = 0.55) {
    _boxes = [0, 0]; _played = [false, false]; _dice = [0, 0]; _opts = []; _note = ''; _botSkill = botSkill; _flash = 0;
    _turn = _first = Math.random() < 0.5 ? 0 : 1;
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'sb', css: CSS + Dice.DICE_CSS, cols: 7.5, rows: 14,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="bt-chips">${[0, 1].map(p => `<div class="bt-chip sb-chip" data-p="${p}"><span class="sb-top"><span class="sb-name"></span><b>0</b></span><span class="sb-mini">${'<s></s>'.repeat(TILES)}</span></div>`).join('')}</div>
            <div class="sb-box"><div class="sb-felt">${Array.from({ length: TILES }, (_, i) => `<div class="sb-tile" data-act="tile" data-n="${i + 1}">${i + 1}</div>`).join('')}</div></div>
            <div class="sb-tray"><div class="bd-die blank" data-act="roll"></div><div class="bd-die blank" data-act="roll"></div><div class="sb-sum"></div></div>
            <button class="bt-btn" data-act="roll">ROLL</button>`,
        onAct,
    });
    T.qa('.sb-chip').forEach((c, p) => { c.style.setProperty('--pc', T.hex(p)); c.querySelector('.sb-name').textContent = T.name(p); });
    T.face(_turn, true);
    _newGo();
}

const _el = () => ({ turn: T.q('.bt-turn'), hint: T.q('.bt-hint'), btn: T.q('.bt-btn'), dice: T.qa('.bd-die'), sum: T.q('.sb-sum'), tiles: T.qa('.sb-tile'), chips: T.qa('.sb-chip') });

function onAct(act, el) {
    if (T.botTurn(_turn)) return;
    if (act === 'roll') _roll();
    else if (act === 'tile') _shut(+el.dataset.n);
}

function _newGo() {
    _phase = 'roll'; _dice = [0, 0]; _opts = [];
    const other = 1 - _turn;
    _note = _played[other] ? `SHUT ${count(_boxes[other]) + 1} TO BEAT ${T.name(other)}` : '';
    _render();
    if (T.botTurn(_turn)) T.after(_roll, 900);
}

async function _roll() {
    if (_phase !== 'roll' || !T || T.done) return;
    _phase = 'rolling'; _opts = []; _note = '';
    extendWatchdog(120000);   // no clock: each roll pushes the watchdog on
    sfx('dice_throw');
    _render();
    const faces = await Dice.roll(T, _el().dice);
    if (!T || T.done) return;
    _dice = faces;
    sfx('dice_land');
    _opts = options(_dice, _boxes[_turn]);
    if (!_opts.length) return _stuck();
    _phase = 'pick';
    _render();
    if (T.botTurn(_turn)) T.after(_botPick, 650 + Math.random() * 450 - _botSkill * 200);
}

function _shut(n) {
    if (_phase !== 'pick' || !_opts.includes(n)) return;
    _boxes[_turn] |= bit(n);
    _flash = n;
    sfx('coin_gain'); haptic([12]);
    _opts = [];
    if (count(_boxes[_turn]) === TILES) {
        _phase = 'done';
        _note = `${T.name(_turn)} SHUT THE BOX!`;
        _render(); _wow('SHUT THE BOX!');
        sfx('mg_win'); haptic('heavy');
        T.after(_endGo, 2000);
        return;
    }
    _phase = 'roll';
    _render();
    if (T.botTurn(_turn)) T.after(_roll, 700 + Math.random() * 300);
}

function _stuck() {
    _phase = 'done';
    const [a, b] = _dice;
    _note = `${a} · ${b} · ${a + b} ALL SHUT: ${T.name(_turn)} IS STUCK ON ${count(_boxes[_turn])}`;
    sfx('land_bad'); haptic([40, 30, 40]);
    _render();
    T.after(_endGo, 2200);
}

function _endGo() {
    _played[_turn] = true;
    if (_played[0] && _played[1]) return _end();
    _turn = 1 - _turn;
    T.face(_turn);
    T.after(_newGo, 300);
}

function _end() {
    const c = _boxes.map(count), w = c[0] === c[1] ? -1 : c[0] > c[1] ? 0 : 1;
    const head = w < 0 ? `A DRAW AT ${c[0]}!` : `${T.name(w)} WINS!`;
    const html = `<table><tr><th></th><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr>
        <tr><td style="text-align:left">Left open</td><td>${openTotal(_boxes[0])}</td><td>${openTotal(_boxes[1])}</td></tr>
        <tr class="t"><td style="text-align:left">TILES SHUT</td><td>${c[0]}</td><td>${c[1]}</td></tr></table>`;
    T.end({ winner: w, standings: c, head, html });
}

function _wow(text) {
    const d = document.createElement('div'); d.className = 'sb-wow'; d.textContent = text;
    T.frame.appendChild(d); T.after(() => d.remove(), 1900);
}

// ── Bot ─────────────────────────────────────────────────────────────────────
function _botPick() {
    if (_phase !== 'pick') return;
    const best = bestTile(_dice, _boxes[_turn]);
    const slip = _opts.length > 1 && Math.random() < 0.3 - _botSkill * 0.28;
    const n = slip ? _opts.filter(x => x !== best)[Math.floor(Math.random() * (_opts.length - 1))] : best;
    _render(n);
    T.after(() => _shut(n), 450);
}

// ── Render ──────────────────────────────────────────────────────────────────
function _render(botAim = 0) {
    if (!T || T.done) return;
    const e = _el(), p = _turn, bot = T.botTurn(p), [a, b] = _dice;
    e.turn.textContent = `${T.name(p)}'S BOX`;
    e.turn.style.background = T.hex(p);
    T.el.classList.toggle('p2', p === 1);
    e.hint.textContent = _note || (bot ? (_phase === 'pick' ? 'PICKING…' : 'ROLLING…')
        : _phase === 'roll' ? (count(_boxes[p]) ? 'ROLL AGAIN' : 'TAP ROLL')
        : _phase === 'pick' ? `SHUT ONE: ${_opts.join(' OR ')}` : '');
    e.tiles.forEach((t, i) => {
        const n = i + 1, shut = !!(_boxes[p] & bit(n)), opt = _phase === 'pick' && _opts.includes(n);
        t.className = 'sb-tile' + (shut ? ' shut' : '') + (opt ? ' opt' : '') + (n === _flash ? ' pop' : '');
        t.innerHTML = `${n}${opt ? `<i>${n === a + b ? `${a}+${b}` : 'DIE'}</i>` : ''}`;
        if (botAim === n) t.style.boxShadow = '0 0 0 4px #3f4652'; else t.style.boxShadow = '';
    });
    _flash = 0;
    e.sum.textContent = a ? `= ${a + b}` : '';
    if (_phase !== 'rolling') e.dice.forEach((d, i) => Dice.paint(d, _dice[i]));
    e.btn.classList.toggle('off', _phase !== 'roll' || bot);
    e.chips.forEach((c, q) => {
        c.querySelector('b').textContent = count(_boxes[q]);
        c.classList.toggle('up', q === p);
        c.querySelectorAll('.sb-mini s').forEach((s, i) => s.classList.toggle('on', !!(_boxes[q] & bit(i + 1))));
    });
}

/** Probes: what a sensible player would tap now (null: wait). */
export function _probeTap() {
    if (!T || T.done || T.botTurn(_turn) || T.locked()) return null;
    if (_phase === 'roll') return '.sb .bt-btn';
    if (_phase === 'pick') return `.sb-tile[data-n="${bestTile(_dice, _boxes[_turn])}"]`;
    return null;
}
/** Probes: the game's state. */
export function _debugState() { return { turn: _turn, phase: _phase, dice: [..._dice], opts: [..._opts], boxes: [..._boxes], played: [..._played], first: _first }; }
