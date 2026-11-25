// ============================================================
// CODE BREAKER — crack each other's secret code, two players on one phone.
//
// Each player secretly sets a code of 4 pegs from 6 colours (repeats
// allowed). Then take turns guessing the other's code. Every guess is marked:
//   ●  a peg the right colour in the right spot
//   ○  a right colour, but in the wrong spot
// Crack it in fewer guesses than they need for yours to win. If the first
// player cracks it, the second still gets that turn to tie. Ten guesses each.
//
// On the shared board-game base (board/Tabletop.js). Bot: guesses only codes
// that fit every mark so far (about five guesses to crack one); lower skill
// sometimes guesses carelessly.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';

// ── Rules ───────────────────────────────────────────────────────────────────
export const PEGS = 4, COLOURS = 6, TRIES = 10;
// Each colour also has a symbol, so it reads without colour vision too.
export const PALETTE = [
    { hex: '#ef4444', sym: '●' }, { hex: '#3b82f6', sym: '■' }, { hex: '#22c55e', sym: '▲' },
    { hex: '#facc15', sym: '★' }, { hex: '#a855f7', sym: '◆' }, { hex: '#f97316', sym: '♥' },
];
/** The marks for guess g against code c: { exact, near }. */
export function mark(g, c) {
    let exact = 0;
    const gc = new Array(COLOURS).fill(0), cc = new Array(COLOURS).fill(0);
    for (let i = 0; i < PEGS; i++) { if (g[i] === c[i]) exact++; gc[g[i]]++; cc[c[i]]++; }
    let both = 0;
    for (let k = 0; k < COLOURS; k++) both += Math.min(gc[k], cc[k]);
    return { exact, near: both - exact };
}
/** Every code, as arrays. */
export const ALL = (() => { const out = []; for (let n = 0; n < COLOURS ** PEGS; n++) { const a = []; let x = n; for (let i = 0; i < PEGS; i++) { a.push(x % COLOURS); x = Math.floor(x / COLOURS); } out.push(a); } return out; })();
export const randomCode = () => Array.from({ length: PEGS }, () => Math.floor(Math.random() * COLOURS));
/** The codes that fit every guess and mark so far. */
export const fits = rows => ALL.filter(c => rows.every(r => { const m = mark(r.guess, c); return m.exact === r.exact && m.near === r.near; }));
/** The bot's next guess, from its rows so far. */
export function botGuess(rows, skill = 1) {
    if (!rows.length) return [0, 0, 1, 1];
    if (Math.random() < (1 - skill) * 0.8) return randomCode();
    const left = fits(rows);
    return left.length ? left[Math.floor(Math.random() * left.length)] : randomCode();
}
/**
 * Who has won, once both have had the same number of guesses (or someone is
 * out of them): { winner (-1 a draw), done }. solved[p]: the guess number
 * player p cracked it on, or 0.
 */
export function verdict(solved, used) {
    const [a, b] = solved;
    if (used[0] !== used[1] && !(used[0] >= TRIES && used[1] >= TRIES)) return { done: false };
    if (a && b) return { done: true, winner: a === b ? -1 : a < b ? 0 : 1 };
    if (a || b) return { done: true, winner: a ? 0 : 1 };
    if (used[0] >= TRIES && used[1] >= TRIES) return { done: true, winner: -1 };
    return { done: false };
}

// ── The game ────────────────────────────────────────────────────────────────
const CSS = `
.cb{background:linear-gradient(180deg,#2b2f45,#151827)}
.cb.p2{background:linear-gradient(180deg,#24314f,#121a2e)}
.cb .bt-hint{color:#e7e9f5}
.cb-vault{display:flex;align-items:center;gap:calc(var(--c)*.2);background:#3a3f5c;border:3px solid #0d0f1a;border-radius:calc(var(--c)*.25);padding:calc(var(--c)*.1) calc(var(--c)*.25);color:#e7e9f5;font:800 calc(var(--c)*.18) Nunito,system-ui,sans-serif}
.cb-vault .code{display:flex;gap:4px}
.cb-peek{background:#5b6185;color:#fff;border:0;border-radius:999px;padding:4px 12px;font:900 calc(var(--c)*.18) Nunito,system-ui,sans-serif;touch-action:none}
.cb-board{display:flex;flex-direction:column;gap:calc(var(--c)*.08);background:#0f1220;border:calc(var(--c)*.07) solid #000;border-radius:calc(var(--c)*.3);padding:calc(var(--c)*.15) calc(var(--c)*.25);box-shadow:inset 0 0 calc(var(--c)*.4) rgba(0,0,0,.8)}
.cb-row{display:flex;align-items:center;gap:calc(var(--c)*.25);opacity:.95}
.cb-row .n{width:calc(var(--c)*.35);font:calc(var(--c)*.26) 'Bebas Neue',Impact,sans-serif;color:#6b7194;text-align:right}
.cb-row .pegs{display:flex;gap:calc(var(--c)*.12)}
.cb-row.cur{background:rgba(255,255,255,.06);border-radius:calc(var(--c)*.2);outline:2px dashed #6b7194;outline-offset:2px}
.cb-row.empty{opacity:.35}
.cb-peg{width:calc(var(--c)*.5);height:calc(var(--c)*.5);border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.7),var(--pc) 45%);border:2px solid #000;display:flex;align-items:center;justify-content:center;font:900 calc(var(--c)*.24)/1 Nunito,system-ui,sans-serif;color:rgba(0,0,0,.55);box-shadow:0 2px 0 #000}
.cb-peg.hole{background:#1d2133;box-shadow:inset 0 2px 4px #000;color:transparent}
.cb-peg.hide{background:#5b6185;color:#fff}
.cb-marks{display:grid;grid-template-columns:repeat(2,auto);gap:3px;margin-left:calc(var(--c)*.1)}
.cb-marks i{width:calc(var(--c)*.2);height:calc(var(--c)*.2);border-radius:50%;background:#2a2f45;border:1px solid #000}
.cb-marks i.x{background:#2fd67b;box-shadow:0 0 4px #2fd67b}
.cb-marks i.o{background:#fff}
.cb-rows{display:flex;flex-direction:column;gap:calc(var(--c)*.08)}
.cb-title{font:calc(var(--c)*.26) 'Bebas Neue',Impact,sans-serif;letter-spacing:1px;color:#aeb3d4;text-align:center}
.cb-palette{display:flex;gap:calc(var(--c)*.15)}
.cb-palette .cb-peg{width:calc(var(--c)*.85);height:calc(var(--c)*.85);font-size:calc(var(--c)*.4);cursor:pointer}
.cb-palette .cb-peg:active{transform:translateY(2px)}
.cb-them{font:800 calc(var(--c)*.18) Nunito,system-ui,sans-serif;color:#aeb3d4;text-align:center}
.cb-key{font:800 calc(var(--c)*.17) Nunito,system-ui,sans-serif;color:#aeb3d4;text-align:center}
.cb-key b{color:#2fd67b} .cb-key em{color:#fff;font-style:normal}
`;

let T = null, _skill = 0.55, _turn = 0, _first = 0, _phase = 'set', _codes = [null, null], _rows = [[], []], _cur = [], _solved = [0, 0], _note = '', _peek = false;

const peg = (k, cls = '', act = '') => (k === undefined || k === null
    ? `<span class="cb-peg hole ${cls}"></span>`
    : `<span class="cb-peg ${cls}" style="--pc:${PALETTE[k].hex}"${act}>${PALETTE[k].sym}</span>`);

export function start(isBot, onWin, botSkill = 0.55) {
    _skill = botSkill; _codes = [null, null]; _rows = [[], []]; _cur = []; _solved = [0, 0]; _note = ''; _peek = false;
    _first = _turn = Math.random() < 0.5 ? 0 : 1;
    _phase = 'set';
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'cb', css: CSS, cols: 7.5, rows: 13,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="cb-vault"><span class="lbl">YOUR CODE</span><span class="code"></span><button class="cb-peek">👁 HOLD TO PEEK</button></div>
            <div class="cb-them"></div>
            <div class="cb-board"><div class="cb-title"></div><div class="cb-rows"></div></div>
            <div class="cb-palette">${PALETTE.map((_, k) => `<span class="cb-peg" data-act="pick" data-k="${k}" style="--pc:${PALETTE[k].hex}">${PALETTE[k].sym}</span>`).join('')}</div>
            <div class="bt-row"><button class="bt-btn alt" data-act="undo">⌫ UNDO</button><button class="bt-btn go" data-act="ok">GUESS</button></div>
            <div class="cb-key"><b>●</b> right colour, right spot · <em>○</em> right colour, wrong spot</div>`,
        onAct: (act, el) => {
            if (T.botTurn(_turn)) return;
            if (act === 'pick') _pick(+el.dataset.k);
            else if (act === 'undo') { _cur.pop(); haptic([6]); _render(); }
            else if (act === 'ok') _ok();
        },
    });
    // Hold to peek at your own code (pointer events of its own, not a tap).
    const pk = T.q('.cb-peek');
    const on = e => { e.preventDefault(); _peek = true; _render(); }, off = () => { if (_peek) { _peek = false; _render(); } };
    pk.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => pk.addEventListener(t, off));
    // Against the bot, its code is set already.
    if (T.isBot) _codes[1] = randomCode();
    if (T.isBot && _turn === 1) _turn = 0;     // the human sets theirs first
    T.face(_turn, true);
    _render();
}

function _pick(k) {
    if (_cur.length >= PEGS || T.done) return;
    _cur.push(k); haptic([6]); sfx('tick');
    _render();
}

function _ok() {
    if (_cur.length < PEGS || T.done) { _note = 'FILL ALL FOUR PEGS'; return _render(); }
    extendWatchdog(120000);
    if (_phase === 'set') {
        _codes[_turn] = _cur.slice(); _cur = [];
        sfx('coin_gain'); haptic([12]);
        if (!_codes[0] || !_codes[1]) {
            // The other one sets theirs now: the table turns, this code is hidden.
            _turn = 1 - _turn; _note = 'CODE LOCKED · NOW THE OTHER PLAYER SETS ONE';
            T.face(_turn); _render();
            return;
        }
        _phase = 'guess'; _turn = _first; _note = 'BOTH CODES LOCKED · START CRACKING!';
        T.face(_turn); _render();
        if (T.botTurn(_turn)) T.after(_botStep, 1100);
        return;
    }
    _guess(_cur.slice());
}

function _guess(g) {
    const p = _turn, m = mark(g, _codes[1 - p]);
    _rows[p].push({ guess: g, ...m });
    _cur = [];
    if (m.exact === PEGS && !_solved[p]) { _solved[p] = _rows[p].length; T.wow('CRACKED!'); sfx('mg_win'); haptic([20, 30, 20]); }
    else { sfx(m.exact ? 'coin_gain' : 'tick'); haptic([10]); }
    _note = m.exact === PEGS ? `${T.name(p)} CRACKED IT IN ${_rows[p].length}!` : `${m.exact} ● · ${m.near} ○`;
    const used = [_rows[0].length, _rows[1].length];
    const v = verdict(_solved, used);
    _render();
    if (v.done) return T.after(() => _end(v.winner), 1500);
    // Whoever's cracked it waits; the other keeps guessing until the counts match.
    const next = _solved[1 - p] ? p : 1 - p;
    T.after(() => { _turn = next; _note = ''; T.face(_turn); _render(); if (T.botTurn(_turn)) T.after(_botStep, 800); }, 900);
}

function _botStep() {
    if (T.done || !T.botTurn(_turn) || _phase !== 'guess') return;
    const g = botGuess(_rows[1], _skill);
    // Show it going in, peg by peg.
    let i = 0;
    const put = () => { if (T.done) return; _cur = g.slice(0, ++i); _render(); if (i < PEGS) T.after(put, 220); else T.after(() => _guess(g), 400); };
    put();
}

function _end(w) {
    const s = [0, 1].map(p => (_solved[p] ? TRIES + 1 - _solved[p] : 0));
    const line = p => (_solved[p] ? `cracked in ${_solved[p]}` : 'not cracked');
    T.end({ winner: w, standings: s, head: w < 0 ? 'A DRAW!' : `${T.name(w)} WINS!`,
        html: `<table><tr><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr><tr><td>${line(0)}</td><td>${line(1)}</td></tr>
            <tr><td>${_codes[0].map(k => PALETTE[k].sym).join('')}</td><td>${_codes[1].map(k => PALETTE[k].sym).join('')}</td></tr></table>` });
}

function _render() {
    if (!T || T.done) return;
    const p = _turn, bot = T.botTurn(p), set = _phase === 'set';
    T.head(p, set ? `${T.name(p)}: SET YOUR CODE` : `${T.name(p)}'S GO`,
        _note || (bot ? 'THINKING…' : set ? `PICK 4 PEGS (${T.name(1 - p)}, LOOK AWAY!)` : `GUESS ${T.name(1 - p)}'S CODE · TRY ${_rows[p].length + 1} OF ${TRIES}`));
    // Your own code: hidden unless you hold to peek (and while you're setting it, it's the row below).
    const mine = _codes[p];
    T.q('.cb-vault .code').innerHTML = mine ? mine.map(k => (_peek && !bot ? peg(k) : '<span class="cb-peg hide">?</span>')).join('') : '<span style="opacity:.6">not set yet</span>';
    T.q('.cb-vault').style.visibility = set || bot ? 'hidden' : 'visible';
    // Words for whoever holds the phone: against the bot that's always the person, even on the bot's go.
    const them = _rows[1 - p], best = them.reduce((b, r) => Math.max(b, r.exact), 0);
    const plural = n => `${n} guess${n === 1 ? '' : 'es'}`;
    T.q('.cb-them').textContent = set ? ''
        : bot ? `YOU: ${plural(them.length)} at ${T.name(p)}'S code${_solved[1 - p] ? ` · CRACKED IN ${_solved[1 - p]}` : ''}`
        : `${T.name(1 - p)}: ${plural(them.length)} at your code${_solved[1 - p] ? ' · CRACKED IT' : them.length ? ` · best ${best} ●` : ''}`;
    T.q('.cb-title').textContent = set ? 'YOUR SECRET CODE' : bot ? `${T.name(p)}'S GUESSES AT YOUR CODE` : `YOUR GUESSES AT ${T.name(1 - p)}'S CODE`;
    // The board: this player's guesses at the other's code, then the row being made.
    const rows = set ? [] : _rows[p];
    let html = rows.map((r, i) => `<div class="cb-row"><span class="n">${i + 1}</span><span class="pegs">${r.guess.map(k => peg(k)).join('')}</span>` +
        `<span class="cb-marks">${'<i class="x"></i>'.repeat(r.exact)}${'<i class="o"></i>'.repeat(r.near)}${'<i></i>'.repeat(PEGS - r.exact - r.near)}</span></div>`).join('');
    const solved = !set && _solved[p];
    if (!solved && (set || rows.length < TRIES)) html += `<div class="cb-row cur"><span class="n">${set ? '🔒' : rows.length + 1}</span><span class="pegs">${Array.from({ length: PEGS }, (_, i) => peg(_cur[i])).join('')}</span><span class="cb-marks">${'<i></i>'.repeat(PEGS)}</span></div>`;
    const blank = set ? 0 : Math.max(0, Math.min(3, TRIES - rows.length - 1));
    html += Array.from({ length: blank }, () => `<div class="cb-row empty"><span class="n"></span><span class="pegs">${'<span class="cb-peg hole"></span>'.repeat(PEGS)}</span><span class="cb-marks">${'<i></i>'.repeat(PEGS)}</span></div>`).join('');
    T.q('.cb-rows').innerHTML = html;
    const ok = T.q('.bt-btn[data-act="ok"]');
    ok.textContent = set ? '🔒 LOCK CODE' : 'GUESS';
    ok.classList.toggle('off', bot || _cur.length < PEGS || solved);
    T.q('.bt-btn[data-act="undo"]').classList.toggle('off', bot || !_cur.length);
    T.q('.cb-palette').style.opacity = bot || solved ? '.4' : '1';
}

/** Probes. */
export function _debugState() { return { phase: _phase, turn: _turn, codes: _codes.map(c => c && [...c]), rows: _rows.map(r => r.length), solved: [..._solved] }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(_turn) || T.locked()) return null;
    if (_phase === 'set') {
        if (!T._probeCode) T._probeCode = [randomCode(), randomCode()];
        const want = T._probeCode[_turn];
        if (_cur.length < PEGS) return `.cb-palette .cb-peg[data-k="${want[_cur.length]}"]`;
        return '.bt-btn[data-act="ok"]';
    }
    if (_solved[_turn]) return null;
    // Play it well: aim at a code that fits every mark so far.
    if (!T._probeAim || T._probeAim.n !== _rows[_turn].length || T._probeAim.p !== _turn) T._probeAim = { n: _rows[_turn].length, p: _turn, g: botGuess(_rows[_turn], 1) };
    const g = T._probeAim.g;
    for (let i = 0; i < _cur.length; i++) if (_cur[i] !== g[i]) return '.bt-btn[data-act="undo"]';
    if (_cur.length < PEGS) return `.cb-palette .cb-peg[data-k="${g[_cur.length]}"]`;
    return '.bt-btn[data-act="ok"]';
}
