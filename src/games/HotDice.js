// ============================================================
// HOT DICE — push-your-luck with six dice, two players on one phone.
//
// ROLL all six. Tap the dice that score to keep them, then ROLL the rest to
// add more, or BANK this turn's points. A roll with nothing that scores is a
// BUST: this turn's points are gone. Keep all six scoring and they're HOT:
// roll all six again. First to 3,000 banked wins.
//
//   1 = 100   5 = 50   three of a kind = face × 100 (three 1s = 1,000),
//   each die past three doubles it   1-2-3-4-5-6 = 1,500   three pairs = 750
//
// On the shared board-game base (board/Tabletop.js, board/Dice.js). Bot:
// keeps the set that leaves it the best go, and banks at a target that rises
// with the dice it has left to roll and moves with the score.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';
import * as Dice from './board/Dice.js';

// ── Rules ───────────────────────────────────────────────────────────────────
export const GOAL = 3000, DICE = 6;
/** What a set of kept dice scores, or 0 if any of them doesn't score. */
export function score(vals) {
    if (!vals.length) return 0;
    const n = [0, 0, 0, 0, 0, 0, 0];
    vals.forEach(v => n[v]++);
    if (vals.length === 6) {
        if (n.slice(1).every(c => c === 1)) return 1500;
        if (n.filter(c => c === 2).length === 3) return 750;
    }
    let s = 0;
    for (let f = 1; f <= 6; f++) {
        let c = n[f];
        if (c >= 3) { s += (f === 1 ? 1000 : f * 100) * 2 ** (c - 3); c = 0; }
        if (f === 1) s += c * 100;
        else if (f === 5) s += c * 50;
        else if (c > 0) return 0;
    }
    return s;
}
/** Every scoring choice from a roll: [{ idx: [positions in vals], score }]. */
export function choices(vals) {
    const out = [];
    for (let m = 1; m < 1 << vals.length; m++) {
        const idx = vals.map((_, i) => i).filter(i => m & (1 << i));
        const s = score(idx.map(i => vals[i]));
        if (s > 0) out.push({ idx, score: s });
    }
    return out;
}
export const bust = vals => choices(vals).length === 0;
const WORD = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
/**
 * The scoring sets on the table, named for people: [{ label, score, idx }].
 * idx: positions in vals. A straight or three pairs is the whole roll; three
 * or more of a face is one set; every other 1 and 5 is a set of its own.
 */
export function combos(vals) {
    const n = [0, 0, 0, 0, 0, 0, 0];
    vals.forEach(v => n[v]++);
    const all = vals.map((_, i) => i);
    if (vals.length === 6 && n.slice(1).every(c => c === 1)) return [{ label: 'STRAIGHT 1–6', score: 1500, idx: all }];
    if (vals.length === 6 && n.filter(c => c === 2).length === 3) return [{ label: 'THREE PAIRS', score: 750, idx: all }];
    const out = [];
    for (let f = 1; f <= 6; f++) {
        const at = all.filter(i => vals[i] === f);
        if (at.length >= 3) out.push({ label: `${WORD[at.length]} ${f}s`, score: (f === 1 ? 1000 : f * 100) * 2 ** (at.length - 3), idx: at });
        else if (f === 1 || f === 5) at.forEach(i => out.push({ label: `A ${f}`, score: f === 1 ? 100 : 50, idx: [i] }));
    }
    return out;
}
/** The bot's bank target with `left` dice to roll next (6 after hot dice). */
export function bankAt(left, me, them, wobble = 0) {
    let t = [0, 250, 300, 400, 550, 1000, 2000][left] || 300;
    if (them - me > 1000) t *= 1.35; else if (me - them > 1000) t *= 0.8;
    if (them >= GOAL - 500) t = Math.max(t, GOAL - me);   // they're nearly home: go for it
    return Math.max(150, Math.round(t + wobble));
}
/**
 * The bot's plan for this roll: which dice to keep and whether to bank after.
 * vals: the free dice's faces; pot: this turn so far; kept: dice already set aside.
 */
export function plan(vals, pot, kept, me, them, wobble = 0) {
    const all = choices(vals);
    if (!all.length) return null;
    let best = null, bv = -Infinity;
    for (const c of all) {
        let left = DICE - kept - c.idx.length;
        if (left === 0) left = 6;                              // hot dice
        const total = pot + c.score;
        const bank = me + total >= GOAL || total >= bankAt(left, me, them, wobble);
        // Banking: take the most. Rolling on: points now, plus what the dice left are worth.
        const v = bank ? total + 10000 : c.score + [0, 25, 55, 95, 150, 250, 400][left];
        if (v > bv) { bv = v; best = { idx: c.idx, score: c.score, bank }; }
    }
    return best;
}

// ── The game ────────────────────────────────────────────────────────────────
const CSS = `
.hd-bank{display:flex;flex-direction:column;gap:calc(var(--c)*.12);width:calc(var(--c)*6.6)}
.hd-lane{display:flex;align-items:center;gap:8px;font:800 calc(var(--c)*.22) Nunito,system-ui,sans-serif;color:#3f4652}
.hd-lane .nm{width:calc(var(--c)*1.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hd-track{flex:1;height:calc(var(--c)*.42);background:rgba(255,255,255,.6);border:3px solid #3f4652;border-radius:999px;position:relative;overflow:hidden}
.hd-fill{position:absolute;left:0;top:0;bottom:0;background:var(--pc);transition:width .4s}
.hd-pot{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,var(--pc) 0 6px,#fff 6px 12px);opacity:.75;transition:left .4s,width .3s}
.hd-lane b{font:calc(var(--c)*.46) 'Bebas Neue',Impact,sans-serif;width:calc(var(--c)*1.2);text-align:right}
.hd-lane.up .nm{text-decoration:underline 3px var(--pc)}
.hd-tray{display:grid;grid-template-columns:repeat(3,auto);gap:calc(var(--c)*.3);padding:calc(var(--c)*.3);background:#2f6b4f;border:calc(var(--c)*.09) solid #3f4652;border-radius:calc(var(--c)*.35);box-shadow:inset 0 0 calc(var(--c)*.4) rgba(0,0,0,.35)}
.hd-tray .bd-die{width:calc(var(--c)*1.45);height:calc(var(--c)*1.45);transition:transform .15s,opacity .2s,box-shadow .15s}
.hd-tray .bd-die{position:relative}
.hd-tray .bd-die.pick{transform:translateY(calc(var(--c)*-.15));box-shadow:0 0 0 calc(var(--c)*.11) #2fae67,0 calc(var(--c)*.08) 0 #3f4652}
.hd-tray .bd-die.pick::after{content:'✓';position:absolute;right:calc(var(--c)*-.2);top:calc(var(--c)*-.2);width:calc(var(--c)*.42);height:calc(var(--c)*.42);border-radius:50%;background:#2fae67;color:#fff;font:900 calc(var(--c)*.28)/calc(var(--c)*.42) Nunito,system-ui,sans-serif;text-align:center;border:2px solid #fff}
.hd-tray .bd-die.kept{opacity:.35;transform:scale(.86)}
.hd-pots{display:flex;gap:calc(var(--c)*.25);align-items:stretch}
.hd-box{background:#fff;border:4px solid #3f4652;border-radius:calc(var(--c)*.3);padding:calc(var(--c)*.06) calc(var(--c)*.3);text-align:center;color:#3f4652;min-width:calc(var(--c)*2.2)}
.hd-box small{display:block;font:900 calc(var(--c)*.17) Nunito,system-ui,sans-serif;letter-spacing:1px}
.hd-box b{font:calc(var(--c)*.8) 'Bebas Neue',Impact,sans-serif;line-height:1}
.hd-box.bad b{color:#c0392b}
.hd-box.bust{background:#ffd6d6;animation:hdshake .4s}
@keyframes hdshake{25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.hd-tray .bd-die.can{box-shadow:0 0 0 calc(var(--c)*.07) #fff6b8,0 0 calc(var(--c)*.35) #ffd200,0 calc(var(--c)*.08) 0 #3f4652;animation:hdglow 1.1s ease-in-out infinite}
.hd-tray .bd-die.can.pick{animation:none}
@keyframes hdglow{50%{box-shadow:0 0 0 calc(var(--c)*.1) #ffd200,0 0 calc(var(--c)*.5) #ffd200,0 calc(var(--c)*.08) 0 #3f4652}}
.hd-combos{display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--c)*.12);min-height:calc(var(--c)*.5);max-width:calc(var(--c)*7)}
.hd-combo{display:flex;align-items:center;gap:calc(var(--c)*.1);border:3px solid #3f4652;border-radius:999px;background:#fff6b8;padding:2px calc(var(--c)*.2);font:calc(var(--c)*.32) 'Bebas Neue',Impact,sans-serif;letter-spacing:1px;color:#3f4652}
.hd-combo b{color:#2f9e44}
.hd-combo.on{background:#2fae67;color:#fff;box-shadow:0 0 0 3px #fff}
.hd-combo.on b{color:#fff}
.hd-card{display:grid;grid-template-columns:auto auto;gap:calc(var(--c)*.06) calc(var(--c)*.3);background:rgba(255,255,255,.75);border:3px solid #3f4652;border-radius:calc(var(--c)*.25);padding:calc(var(--c)*.12) calc(var(--c)*.22)}
.hd-row{display:flex;align-items:center;gap:calc(var(--c)*.1);font:800 calc(var(--c)*.17) Nunito,system-ui,sans-serif;color:#3f4652;white-space:nowrap}
.hd-row b{font:calc(var(--c)*.3) 'Bebas Neue',Impact,sans-serif;letter-spacing:1px}
.hd-mini{display:flex;gap:2px}
.hd-mini .bd-die{width:calc(var(--c)*.4);height:calc(var(--c)*.4);border-width:2px;border-radius:calc(var(--c)*.07);padding:calc(var(--c)*.04);box-shadow:none}
.hd-row.wide{grid-column:1/3;justify-content:center}
`;

// The scoring card, in pictures: tiny dice, then what they're worth.
const mini = vs => `<span class="hd-mini">${vs.map(v => `<span class="bd-die">${Dice.dieHtml(v)}</span>`).join('')}</span>`;
const CARD = `<div class="hd-card">
    <div class="hd-row">${mini([1])}<b>100</b></div>
    <div class="hd-row">${mini([5])}<b>50</b></div>
    <div class="hd-row">${mini([4, 4, 4])}<b>400</b> <span>(face × 100)</span></div>
    <div class="hd-row">${mini([1, 1, 1])}<b>1000</b></div>
    <div class="hd-row">${mini([2, 2, 3, 3, 6, 6])}<b>750</b> <span>pairs</span></div>
    <div class="hd-row">${mini([4, 4, 4, 4])}<b>×2</b> <span>each extra</span></div>
    <div class="hd-row wide">STRAIGHT: all six in one roll ${mini([1, 2, 3, 4, 5, 6])}<b>1500</b></div>
</div>`;

let T = null, _bank = [0, 0], _turn = 0, _pot = 0, _dice = [], _phase = 'roll', _note = '', _skill = 0.55, _wobble = 0;
// _dice: [{ v, kept (set aside earlier this go), pick (chosen from this roll) }]

export function start(isBot, onWin, botSkill = 0.55) {
    _bank = [0, 0]; _note = ''; _skill = botSkill;
    _turn = Math.random() < 0.5 ? 0 : 1;
    T = tabletop({
        isBot, onWin, probe: () => _probeTap(), cls: 'hd', css: CSS + Dice.DICE_CSS, cols: 7.5, rows: 13,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="hd-bank">${[0, 1].map(p => `<div class="hd-lane" data-p="${p}"><span class="nm"></span><div class="hd-track"><div class="hd-fill"></div><div class="hd-pot"></div></div><b>0</b></div>`).join('')}</div>
            <div class="hd-tray">${Array.from({ length: DICE }, (_, i) => `<div class="bd-die blank" data-act="die" data-i="${i}"></div>`).join('')}</div>
            <div class="hd-pots"><div class="hd-box" data-box="pot"><small>THIS TURN</small><b>0</b></div><div class="hd-box" data-box="sel"><small>PICKED</small><b>0</b></div></div>
            <div class="bt-row"><button class="bt-btn" data-act="roll">ROLL</button><button class="bt-btn go" data-act="bank">BANK</button></div>
            <div class="hd-combos"></div>
            ${CARD}`,
        onAct: (act, el) => { if (T.botTurn(_turn)) return; if (act === 'die') _pick(+el.dataset.i); else if (act === 'combo') _pickCombo(+el.dataset.k); else if (act === 'roll') _roll(); else if (act === 'bank') _bankIt(); },
    });
    T.qa('.hd-lane').forEach((l, p) => { l.style.setProperty('--pc', T.hex(p)); l.querySelector('.nm').textContent = T.name(p); });
    T.face(_turn, true);
    _newGo();
}

const _free = () => _dice.map((d, i) => (!d.kept ? i : -1)).filter(i => i >= 0);
const _picked = () => _dice.map((d, i) => (d.pick ? i : -1)).filter(i => i >= 0);
const _selScore = () => score(_picked().map(i => _dice[i].v));

function _newGo() {
    _pot = 0; _phase = 'roll';
    _dice = Array.from({ length: DICE }, () => ({ v: 0, kept: false, pick: false }));
    _wobble = Math.round((Math.random() - 0.5) * (1 - _skill) * 400);
    _render();
    if (T.botTurn(_turn)) T.after(_botStep, 900);
}

function _pick(i) {
    if (_phase !== 'pick' || T.done || _dice[i].kept) return;
    _dice[i].pick = !_dice[i].pick;
    haptic([6]); sfx('tick');
    _render();
}

// The sets on the table now, with positions in _dice.
function _combos() {
    const free = _free();
    return combos(free.map(i => _dice[i].v)).map(c => ({ ...c, idx: c.idx.map(k => free[k]) }));
}
// Tap a set's label: pick all its dice (or drop them if they're all picked).
function _pickCombo(k) {
    const c = _combos()[k];
    if (_phase !== 'pick' || !c) return;
    const on = c.idx.every(i => _dice[i].pick);
    c.idx.forEach(i => { _dice[i].pick = !on; });
    haptic([6]); sfx('tick');
    _render();
}

async function _roll() {
    if (T.done) return;
    if (_phase === 'pick') {
        // Roll on: what's picked is set aside and added to the pot.
        const s = _selScore();
        if (!s) { _note = 'PICK DICE THAT SCORE FIRST'; return _render(); }
        _pot += s;
        _dice.forEach(d => { if (d.pick) { d.kept = true; d.pick = false; } });
        if (_dice.every(d => d.kept)) { _dice.forEach(d => { d.kept = false; }); T.wow('HOT DICE!'); sfx('coin_gain'); }
    } else if (_phase !== 'roll') return;
    _phase = 'rolling'; _note = '';
    extendWatchdog(120000);
    sfx('dice_throw'); _render();
    const free = _free();
    const faces = await Dice.roll(T, free.map(i => T.q(`.hd-tray .bd-die[data-i="${i}"]`)), free.length);
    if (T.done) return;
    free.forEach((i, k) => { _dice[i].v = faces[k]; });
    if (bust(faces)) {
        _phase = 'bust'; _note = `BUST! ${T.name(_turn)} LOSES ${_pot ? _pot : 'THE TURN'}`;
        _pot = 0;
        sfx('land_bad'); haptic([40, 30, 40]);
        _render(true);
        return T.after(_nextGo, 1900);
    }
    sfx('dice_land');
    _phase = 'pick';
    _render();
    if (T.botTurn(_turn)) T.after(_botStep, 700 + Math.random() * 400);
}

function _bankIt() {
    if (_phase !== 'pick' || T.done) return;
    const s = _selScore();
    if (!s) { _note = 'PICK DICE THAT SCORE TO BANK'; return _render(); }
    _phase = 'banked';
    _bank[_turn] += _pot + s;
    sfx('coin_gain'); haptic([12]);
    _note = `${T.name(_turn)} BANKS ${_pot + s}`;
    _pot = 0;
    _dice.forEach(d => { if (d.pick) { d.kept = true; d.pick = false; } });
    _render();
    if (_bank[_turn] >= GOAL) { T.wow(`${T.name(_turn)} HITS ${GOAL}!`); return T.after(_end, 1500); }
    T.after(_nextGo, 1100);
}

function _nextGo() { _turn = 1 - _turn; _note = ''; T.face(_turn); T.after(_newGo, 300); }

function _end() {
    const w = _bank[0] >= GOAL ? 0 : 1;
    T.end({ winner: w, standings: [..._bank], head: `${T.name(w)} WINS!`,
        html: `<table><tr><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr><tr class="t"><td>${_bank[0]}</td><td>${_bank[1]}</td></tr></table>` });
}

// The plan for whoever's up, from the dice on the table.
function _plan() {
    const free = _free();
    const p = plan(free.map(i => _dice[i].v), _pot, DICE - free.length, _bank[_turn], _bank[1 - _turn], T.botTurn(_turn) ? _wobble : 0);
    return p ? { ...p, idx: p.idx.map(k => free[k]) } : null;
}

function _botStep() {
    if (T.done || !T.botTurn(_turn)) return;
    if (_phase === 'roll') return _roll();
    if (_phase !== 'pick') return;
    const p = _plan();
    if (!p) return;
    // Pick the dice one at a time, so a person can follow it.
    const want = p.idx.find(i => !_dice[i].pick);
    if (want !== undefined) { _pick(want); return T.after(_botStep, 280); }
    T.after(() => (p.bank ? _bankIt() : _roll()), 450);
}

function _render(busted = false) {
    if (!T || T.done) return;
    const p = _turn, bot = T.botTurn(p), sel = _selScore(), anyPick = _picked().length > 0;
    const hint = _note || (bot ? 'THINKING…' : _phase === 'roll' ? 'ROLL ALL SIX'
        : _phase === 'pick' ? (anyPick ? (sel ? `KEEP ${sel} · ROLL ${_free().length - _picked().length || 6} MORE, OR BANK ${_pot + sel}` : 'THOSE DON\'T ALL SCORE') : 'TAP THE GLOWING DICE (OR A SET BELOW)') : '');
    T.head(p, `${T.name(p)}'S GO`, hint);
    T.qa('.hd-lane').forEach((l, q) => {
        const w = Math.min(100, _bank[q] / GOAL * 100), pot = q === p ? Math.min(100 - w, (_pot + sel) / GOAL * 100) : 0;
        l.querySelector('.hd-fill').style.width = w + '%';
        const po = l.querySelector('.hd-pot'); po.style.left = w + '%'; po.style.width = pot + '%';
        l.querySelector('b').textContent = _bank[q];
        l.classList.toggle('up', q === p);
    });
    const sets = _phase === 'pick' ? _combos() : [];
    const can = new Set(sets.flatMap(c => c.idx));
    T.qa('.hd-tray .bd-die').forEach(el => {
        const i = +el.dataset.i, d = _dice[i];
        if (_phase !== 'rolling' || d.kept) Dice.paint(el, d.v);
        el.classList.toggle('kept', d.kept); el.classList.toggle('pick', d.pick);
        el.classList.toggle('can', can.has(i));
    });
    T.q('.hd-combos').innerHTML = sets.map((c, k) =>
        `<button class="hd-combo${c.idx.every(i => _dice[i].pick) ? ' on' : ''}" data-act="combo" data-k="${k}" aria-label="${c.label}, ${c.score}">${c.idx.length === 6 ? c.label : mini(c.idx.map(i => _dice[i].v))}<b>${c.score}</b></button>`).join('');
    const pot = T.q('[data-box="pot"]'), sb = T.q('[data-box="sel"]');
    pot.querySelector('b').textContent = _pot; pot.classList.toggle('bust', busted);
    sb.querySelector('b').textContent = sel; sb.classList.toggle('bad', anyPick && !sel);
    const [rb, bb] = T.qa('.bt-btn');
    rb.classList.toggle('off', bot || !(_phase === 'roll' || (_phase === 'pick' && sel)));
    bb.classList.toggle('off', bot || !(_phase === 'pick' && sel));
}

/** Probes. */
export function _debugState() { return { turn: _turn, bank: [..._bank], pot: _pot, phase: _phase, dice: _dice.map(d => ({ ...d })) }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(_turn) || T.locked()) return null;
    if (_phase === 'roll') return '.bt-btn[data-act="roll"]';
    if (_phase !== 'pick') return null;
    const p = _plan();
    if (!p) return null;
    const wrong = _picked().find(i => !p.idx.includes(i));
    if (wrong !== undefined) return `.hd-tray .bd-die[data-i="${wrong}"]`;
    const want = p.idx.find(i => !_dice[i].pick);
    if (want !== undefined) return `.hd-tray .bd-die[data-i="${want}"]`;
    return p.bank ? '.bt-btn[data-act="bank"]' : '.bt-btn[data-act="roll"]';
}
