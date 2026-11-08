// ============================================================
// LIAR'S DICE — two players on one phone, five dice each under a cup.
//
// Everyone rolls in secret. Take turns bidding how many dice of one face are
// on the table altogether (yours and theirs), e.g. "three 5s". Each bid must
// go up: more dice, or the same number of a higher face. Or call LIAR!
//   - Call LIAR and the cups come off. At least that many: the bidder was
//     right and the caller loses a die. Fewer: the bidder loses a die.
//   - The loser starts the next round. Lose all your dice and you're out.
// 1s are NOT wild.
//
// On one phone your dice stay hidden under the cup: HOLD it to peek while the
// other player looks away. Against a bot your dice are always showing (the
// bot never looks). Bot: knows the odds of every bid from its own dice
// (binomial over the dice it can't see), calls LIAR when a bid is unlikely,
// and otherwise raises to the likeliest bid; lower skill misjudges more.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';
import * as Dice from './board/Dice.js';

// ── Rules ───────────────────────────────────────────────────────────────────
export const DICE = 5;
/** Is bid b a raise on bid a (a may be null)? */
export const raises = (b, a) => !a || b.n > a.n || (b.n === a.n && b.f > a.f);
export const countFace = (dice, f) => dice.filter(v => v === f).length;
/** Is the bid true on the table (all dice)? */
export const holds = (bid, all) => countFace(all, bid.f) >= bid.n;
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
/** P(at least k of m unseen dice show a given face). */
export function atLeast(k, m) {
    if (k <= 0) return 1;
    if (k > m) return 0;
    let p = 0;
    for (let j = k; j <= m; j++) p += choose(m, j) * Math.pow(1 / 6, j) * Math.pow(5 / 6, m - j);
    return p;
}
/** How likely a bid is, from dice `mine` with `unseen` dice under the other cup. */
export const chance = (bid, mine, unseen) => atLeast(bid.n - countFace(mine, bid.f), unseen);
/** The bot's move: { liar: true } or { bid: { n, f } }. */
export function botMove(cur, mine, unseen, skill = 1) {
    const total = mine.length + unseen, noise = (1 - skill) * 0.25;
    if (cur && cur.n > total) return { liar: true };
    if (cur && chance(cur, mine, unseen) < 0.42 + (Math.random() - 0.5) * noise * 2) return { liar: true };
    const cands = [];
    for (let f = 1; f <= 6; f++) for (let n = 1; n <= total; n++) {
        const b = { n, f };
        if (!raises(b, cur)) continue;
        if (cur && n > cur.n + 1) break;   // a raise of at most one more die
        cands.push({ b, v: chance(b, mine, unseen) + countFace(mine, f) * 0.02 + (Math.random() - 0.5) * noise });
        if (!cur) break;   // opening: the lowest count of each face, then pushed up below
    }
    if (!cur) {   // open on what you hold most of, bid about what's likely there
        let f = 6, best = -1;
        for (let k = 6; k >= 1; k--) if (countFace(mine, k) > best) { best = countFace(mine, k); f = k; }
        const n = Math.max(1, best + Math.floor(unseen / 6) - (Math.random() < 0.5 ? 1 : 0));
        return { bid: { n: Math.max(1, n), f } };
    }
    cands.sort((a, b) => b.v - a.v);
    if (!cands.length || cands[0].v < 0.3) return { liar: true };
    return { bid: cands[0].b };
}

// ── The game ────────────────────────────────────────────────────────────────
const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const CSS = `
.ld .bd-die{width:calc(var(--c)*.82);height:calc(var(--c)*.82);border-radius:calc(var(--c)*.14);padding:calc(var(--c)*.08);box-shadow:0 calc(var(--c)*.05) 0 #3f4652}
.ld .bd-die.hit{border-color:#ffb400;background:#fff3c4;transform:translateY(calc(var(--c)*-.12))}
.ld-side{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:calc(var(--c)*1.6)}
.ld-who{font:800 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#3f4652}
.ld-who b{font:calc(var(--c)*.34) 'Bebas Neue',Impact,sans-serif;margin-left:6px}
.ld-row{display:flex;gap:calc(var(--c)*.12);min-height:calc(var(--c)*.9);align-items:center}
.ld-cup{width:calc(var(--c)*3.6);height:calc(var(--c)*1.1);border-radius:calc(var(--c)*.5) calc(var(--c)*.5) calc(var(--c)*.15) calc(var(--c)*.15);background:linear-gradient(#8a5a2c,#5a3a1c);border:calc(var(--c)*.07) solid #3f2a14;display:flex;align-items:center;justify-content:center;font:900 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#fde68a;letter-spacing:1px;box-shadow:0 calc(var(--c)*.08) 0 #3f2a14}
.ld-cup.shake{animation:ldshake .6s}
@keyframes ldshake{20%{transform:rotate(-8deg)}40%{transform:rotate(7deg)}60%{transform:rotate(-5deg)}80%{transform:rotate(3deg)}}
.ld-bid{background:#fff;border:4px solid #3f4652;border-radius:calc(var(--c)*.3);padding:calc(var(--c)*.08) calc(var(--c)*.4);text-align:center;color:#3f4652;min-width:calc(var(--c)*4)}
.ld-bid small{display:block;font:900 calc(var(--c)*.17) Nunito,system-ui,sans-serif;letter-spacing:1px}
.ld-bid b{font:calc(var(--c)*.8) 'Bebas Neue',Impact,sans-serif;line-height:1}
.ld-bid b span{font-family:system-ui,sans-serif;font-size:.9em}
.ld-pick{display:flex;flex-direction:column;gap:calc(var(--c)*.15);align-items:center}
.ld-step{display:flex;align-items:center;gap:calc(var(--c)*.2)}
.ld-step button,.ld-face{width:calc(var(--c)*.82);height:calc(var(--c)*.82);border-radius:calc(var(--c)*.18);border:3px solid #3f4652;background:#fff;font:calc(var(--c)*.55) 'Bebas Neue',Impact,sans-serif;color:#3f4652;padding:0}
.ld-step b{font:calc(var(--c)*.7) 'Bebas Neue',Impact,sans-serif;color:#3f4652;min-width:calc(var(--c)*.8);text-align:center}
.ld-faces{display:flex;gap:calc(var(--c)*.1)}
.ld-face{font:calc(var(--c)*.62) system-ui,sans-serif;line-height:1}
.ld-face.on{background:#3f4652;color:#fff}
.ld-pick.off{opacity:.35;pointer-events:none}
.ld-out{font:900 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#fff;background:#d2584a;border-radius:999px;padding:2px 10px}
`;

let T = null, _dice = [[], []], _turn = 0, _bid = null, _bidder = -1, _pick = { n: 1, f: 2 }, _phase = 'roll', _note = '', _skill = 0.55, _peek = false, _reveal = null;

export function start(isBot, onWin, botSkill = 0.55) {
    _dice = [Array(DICE).fill(0), Array(DICE).fill(0)]; _bid = null; _bidder = -1; _note = ''; _skill = botSkill; _peek = false; _reveal = null;
    _turn = Math.random() < 0.5 ? 0 : 1;
    const side = who => `<div class="ld-side" data-side="${who}"><div class="ld-who"></div><div class="ld-row"></div></div>`;
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'ld', css: CSS + Dice.DICE_CSS, cols: 7.5, rows: 15,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            ${side('them')}
            <div class="ld-bid"><small></small><b></b></div>
            ${side('me')}
            <div class="ld-pick"><div class="ld-step"><button data-act="minus">−</button><b class="ld-n">1</b><button data-act="plus">+</button></div>
              <div class="ld-faces">${[1, 2, 3, 4, 5, 6].map(f => `<button class="ld-face" data-act="face" data-f="${f}">${FACES[f]}</button>`).join('')}</div></div>
            <div class="bt-row"><button class="bt-btn go" data-act="bid">BID</button><button class="bt-btn" data-act="liar">LIAR!</button></div>`,
        onAct,
    });
    const up = () => { if (_peek) { _peek = false; _render(); } };
    T.el.addEventListener('pointerup', up); T.el.addEventListener('pointercancel', up); T.el.addEventListener('pointerleave', up);
    T.face(_turn, true);
    _newRound();
}

const _me = () => (T.isBot ? 0 : _turn);   // whose dice sit at the near end
const _total = () => _dice[0].length + _dice[1].length;

function onAct(act, el) {
    if (act === 'peek') { if (_phase === 'bid' && !T.isBot) { _peek = true; _render(); } return; }
    if (T.botTurn(_turn) || _phase !== 'bid') return;
    if (act === 'minus') _pick.n = Math.max(1, _pick.n - 1);
    else if (act === 'plus') _pick.n = Math.min(_total(), _pick.n + 1);
    else if (act === 'face') _pick.f = +el.dataset.f;
    else if (act === 'bid') return _makeBid({ ..._pick });
    else if (act === 'liar') return _callLiar();
    haptic([6]); _render();
}

function _newRound() {
    _phase = 'roll'; _bid = null; _bidder = -1; _reveal = null; _peek = false;
    extendWatchdog(150000);
    sfx('dice_throw');
    T.qa('.ld-cup').forEach(c => c.classList.add('shake'));
    _dice = _dice.map(d => d.map(() => 1 + Math.floor(Math.random() * 6)));
    _render(true);
    T.after(() => {
        sfx('dice_land');
        _phase = 'bid';
        _pick = _minRaise();
        _render();
        if (T.botTurn(_turn)) T.after(_botStep, 1100);
    }, 750);
}

function _minRaise() {
    if (!_bid) { const mine = _dice[_turn]; let f = 2, c = -1; for (let k = 6; k >= 1; k--) if (countFace(mine, k) > c) { c = countFace(mine, k); f = k; } return { n: 1, f }; }
    return _bid.f < 6 ? { n: _bid.n, f: _bid.f + 1 } : { n: _bid.n + 1, f: 1 };
}

function _makeBid(b) {
    if (!raises(b, _bid) || b.n > _total()) { _note = _bid ? `BEAT ${_bid.n} × ${FACES[_bid.f]}: MORE DICE, OR A HIGHER FACE` : 'PICK A BID'; _render(); return; }
    _bid = b; _bidder = _turn; _note = '';
    sfx('tick'); haptic([10]);
    _turn = 1 - _turn; _peek = false;
    _phase = 'pass';
    _render();
    T.after(() => { T.face(_turn); _phase = 'bid'; _pick = _minRaise(); _render(); if (T.botTurn(_turn)) T.after(_botStep, 900 + Math.random() * 600); }, 500);
}

function _callLiar() {
    if (!_bid) { _note = 'NOTHING TO CALL YET: MAKE THE FIRST BID'; _render(); return; }
    _phase = 'reveal'; _peek = false;
    const all = [..._dice[0], ..._dice[1]], have = countFace(all, _bid.f), right = have >= _bid.n;
    const loser = right ? _turn : _bidder;
    _reveal = { have, right, loser, caller: _turn };
    _note = `${T.name(_turn)} CALLS LIAR! THERE ${have === 1 ? 'IS' : 'ARE'} ${have} × ${FACES[_bid.f]}: ${right ? 'THE BID STANDS' : 'CAUGHT LYING'}`;
    sfx(right ? 'land_bad' : 'coin_gain'); haptic([30, 30, 60]);
    T.face(T.isBot ? 0 : loser);
    _render();
    T.after(() => {
        _dice[loser] = _dice[loser].slice(1);
        sfx('land_bad');
        _note = `${T.name(loser)} LOSES A DIE (${_dice[loser].length} LEFT)`;
        _render();
        if (!_dice[loser].length) return T.after(() => _end(1 - loser), 1200);
        T.after(() => { _turn = loser; T.face(_turn); _note = ''; T.after(_newRound, 300); }, 1800);
    }, 2600);
}

function _botStep() {
    if (T.done || _phase !== 'bid' || !T.botTurn(_turn)) return;
    const m = botMove(_bid, _dice[1], _dice[0].length, _skill);
    if (m.liar && _bid) return _callLiar();
    const b = m.bid && raises(m.bid, _bid) ? m.bid : _minRaise();
    _pick = b; _render();
    T.after(() => _makeBid(b), 500);
}

function _end(w) {
    T.end({ winner: w, standings: [_dice[0].length, _dice[1].length], head: `${T.name(w)} WINS!`,
        html: `<table><tr><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr><tr class="t"><td>${_dice[0].length}</td><td>${_dice[1].length}</td></tr></table><p style="opacity:1;margin-bottom:6px">dice left</p>` });
}

function _render(shaking = false) {
    if (!T || T.done) return;
    const p = _turn, bot = T.botTurn(p), me = _me(), them = 1 - me, show = !!_reveal;
    T.head(p, `${T.name(p)}'S BID`, _note || (bot ? 'THINKING…' : _phase !== 'bid' ? '' : T.isBot ? (_bid ? 'RAISE THE BID, OR CALL LIAR!' : 'MAKE THE FIRST BID') : 'HOLD YOUR CUP TO PEEK · THEN BID OR CALL LIAR!'));
    const row = (q, visible) => _dice[q].map(v => `<div class="bd-die${show && _bid && v === _bid.f ? ' hit' : ''}">${visible ? Dice.dieHtml(v) : ''}</div>`).join('');
    const cup = (q, peekable) => `<div class="ld-cup${shaking ? ' shake' : ''}"${peekable ? ' data-act="peek"' : ''}>${peekable ? 'HOLD TO PEEK' : `${_dice[q].length} DICE`}</div>`;
    const mineVisible = show || T.isBot || _peek;
    for (const [where, q] of [['them', them], ['me', me]]) {
        const s = T.q(`.ld-side[data-side="${where}"]`);
        s.querySelector('.ld-who').innerHTML = `${T.name(q)}<b style="color:${T.hex(q)}">${'●'.repeat(_dice[q].length)}${'○'.repeat(DICE - _dice[q].length)}</b>`;
        const visible = where === 'me' ? mineVisible : show;
        s.querySelector('.ld-row').innerHTML = visible ? row(q, true) : cup(q, where === 'me' && !T.isBot && q === p);
    }
    const bd = T.q('.ld-bid');
    bd.querySelector('small').textContent = _bid ? `${T.name(_bidder)} BIDS` : 'NO BID YET';
    bd.querySelector('b').innerHTML = _bid ? `${_bid.n} × <span>${FACES[_bid.f]}</span>` : '—';
    const canAct = _phase === 'bid' && !bot;
    T.q('.ld-pick').classList.toggle('off', !canAct);
    T.q('.ld-n').textContent = _pick.n;
    T.qa('.ld-face').forEach(f => f.classList.toggle('on', +f.dataset.f === _pick.f));
    const [bb, lb] = T.qa('.bt-btn');
    bb.classList.toggle('off', !canAct || !raises(_pick, _bid));
    bb.textContent = `BID ${_pick.n} × ${FACES[_pick.f]}`;
    lb.classList.toggle('off', !canAct || !_bid);
}

/** Probes. */
export function _debugState() { return { turn: _turn, phase: _phase, bid: _bid, dice: _dice.map(d => [...d]) }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(_turn) || _phase !== 'bid' || T.locked()) return null;
    const m = botMove(_bid, _dice[_turn], _dice[1 - _turn].length, 1);
    if (m.liar && _bid) return '.bt-btn[data-act="liar"]';
    const b = m.bid && raises(m.bid, _bid) ? m.bid : _minRaise();
    if (b.f !== _pick.f) return `.ld-face[data-f="${b.f}"]`;
    if (b.n > _pick.n) return '.ld-step [data-act="plus"]';
    if (b.n < _pick.n) return '.ld-step [data-act="minus"]';
    return '.bt-btn[data-act="bid"]';
}
