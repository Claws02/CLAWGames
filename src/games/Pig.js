// ============================================================
// PIG — the push-your-luck dice game, two players on one phone.
//
// On your go, ROLL one die as often as you dare: every roll adds to this
// turn's pot, but a 1 loses the whole pot and ends your go. HOLD banks the pot.
// First to 100 wins (you win the moment your bank reaches it).
//
// On the shared board-game base (board/Tabletop.js, board/Dice.js); the phone
// lies flat and turns to whoever's up. Bot: holds at a target that moves with
// the score (pushes harder when behind, plays safe when ahead), and always
// holds when the pot would win; lower skill wobbles the target.
// ============================================================
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { extendWatchdog } from '../claw-core/minigames/MinigameManager.js';
import { tabletop } from './board/Tabletop.js';
import * as Dice from './board/Dice.js';

// ── Rules ───────────────────────────────────────────────────────────────────
export const GOAL = 100;
/** After rolling `face` with `pot` in hand: the new pot, and whether the go is over (a 1). */
export const rollInto = (pot, face) => (face === 1 ? { pot: 0, bust: true } : { pot: pot + face, bust: false });
/** The bot's hold target: 20, more when behind, less when ahead, and never past what wins. */
export function holdAt(me, them, wobble = 0) {
    let t = 20 + Math.round((them - me) / 6) + wobble;
    if (them >= 80) t = Math.max(t, 30);   // they're nearly home: push for it
    return Math.max(10, Math.min(GOAL - me, t));
}

const CSS = `
.pg-bank{display:flex;flex-direction:column;gap:calc(var(--c)*.12);width:calc(var(--c)*6.6)}
.pg-lane{display:flex;align-items:center;gap:8px;font:800 calc(var(--c)*.22) Nunito,system-ui,sans-serif;color:#3f4652}
.pg-lane .nm{width:calc(var(--c)*1.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-track{flex:1;height:calc(var(--c)*.42);background:rgba(255,255,255,.6);border:3px solid #3f4652;border-radius:999px;position:relative;overflow:hidden}
.pg-fill{position:absolute;left:0;top:0;bottom:0;background:var(--pc);transition:width .4s}
.pg-pot{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,var(--pc) 0 6px,#fff 6px 12px);opacity:.75;transition:left .4s,width .3s}
.pg-lane b{font:calc(var(--c)*.5) 'Bebas Neue',Impact,sans-serif;width:calc(var(--c)*.9);text-align:right}
.pg-lane.up .nm{text-decoration:underline 3px var(--pc)}
.pg-mid{display:flex;align-items:center;gap:calc(var(--c)*.5);min-height:calc(var(--c)*2.4)}
.pg-mid .bd-die{width:calc(var(--c)*1.9);height:calc(var(--c)*1.9)}
.pg-potbox{background:#fff;border:4px solid #3f4652;border-radius:calc(var(--c)*.3);padding:calc(var(--c)*.1) calc(var(--c)*.35);text-align:center;color:#3f4652;min-width:calc(var(--c)*2)}
.pg-potbox small{display:block;font:900 calc(var(--c)*.18) Nunito,system-ui,sans-serif;letter-spacing:1px}
.pg-potbox b{font:calc(var(--c)*1.0) 'Bebas Neue',Impact,sans-serif;line-height:1}
.pg-potbox.bust{background:#ffd6d6;animation:pgshake .4s}
@keyframes pgshake{25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.pg-rolls{font:800 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#3f4652;min-height:1.3em;letter-spacing:2px}
`;

let T = null, _bank = [0, 0], _turn = 0, _pot = 0, _face = 0, _rolls = [], _phase = 'roll', _note = '', _skill = 0.55, _wobble = 0;

export function start(isBot, onWin, botSkill = 0.55) {
    _bank = [0, 0]; _pot = 0; _face = 0; _rolls = []; _note = ''; _skill = botSkill;
    _turn = Math.random() < 0.5 ? 0 : 1;
    T = tabletop({
        isBot, onWin, cls: 'pg', css: CSS + Dice.DICE_CSS, cols: 7.5, rows: 12,
        html: `<div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
            <div class="pg-bank">${[0, 1].map(p => `<div class="pg-lane" data-p="${p}"><span class="nm"></span><div class="pg-track"><div class="pg-fill"></div><div class="pg-pot"></div></div><b>0</b></div>`).join('')}</div>
            <div class="pg-mid"><div class="bd-die blank" data-act="roll"></div><div class="pg-potbox"><small>THIS TURN</small><b>0</b></div></div>
            <div class="pg-rolls"></div>
            <div class="bt-row"><button class="bt-btn" data-act="roll">ROLL</button><button class="bt-btn go" data-act="hold">HOLD</button></div>`,
        onAct: (act) => { if (T.botTurn(_turn)) return; if (act === 'roll') _roll(); else if (act === 'hold') _hold(); },
    });
    T.qa('.pg-lane').forEach((l, p) => { l.style.setProperty('--pc', T.hex(p)); l.querySelector('.nm').textContent = T.name(p); });
    T.face(_turn, true);
    _newGo();
}

function _newGo() {
    _pot = 0; _face = 0; _rolls = []; _phase = 'roll';
    _wobble = Math.round((Math.random() - 0.5) * (1 - _skill) * 16);
    _render();
    if (T.botTurn(_turn)) T.after(_botStep, 900);
}

async function _roll() {
    if (_phase !== 'roll' || T.done) return;
    _phase = 'rolling'; _note = '';
    extendWatchdog(120000);
    sfx('dice_throw'); _render();
    const [f] = await Dice.roll(T, [T.q('.pg-mid .bd-die')], 1);
    if (T.done) return;
    _face = f; _rolls.push(f);
    const r = rollInto(_pot, f);
    _pot = r.pot;
    if (r.bust) {
        _phase = 'bust'; _note = `A 1! ${T.name(_turn)} LOSES THE POT`;
        sfx('land_bad'); haptic([40, 30, 40]);
        _render(true);
        T.after(_nextGo, 1700);
        return;
    }
    sfx('dice_land');
    if (_bank[_turn] + _pot >= GOAL) { _render(); return T.after(_hold, 500); }   // that's the game: bank it
    _phase = 'roll';
    _render();
    if (T.botTurn(_turn)) T.after(_botStep, 600 + Math.random() * 400);
}

function _hold() {
    if ((_phase !== 'roll' && _phase !== 'rolling') || !_pot) { if (!_pot && _phase === 'roll') { _note = 'ROLL AT LEAST ONCE'; _render(); } return; }
    _phase = 'held';
    _bank[_turn] += _pot;
    sfx('coin_gain'); haptic([12]);
    _note = `${T.name(_turn)} BANKS ${_pot}`;
    _pot = 0;
    _render();
    if (_bank[_turn] >= GOAL) { T.wow(`${T.name(_turn)} HITS ${GOAL}!`); return T.after(_end, 1400); }
    T.after(_nextGo, 1000);
}

function _nextGo() { _turn = 1 - _turn; _note = ''; T.face(_turn); T.after(_newGo, 300); }

function _end() {
    const w = _bank[0] >= GOAL ? 0 : 1;
    T.end({ winner: w, standings: [..._bank], head: `${T.name(w)} WINS!`,
        html: `<table><tr><th style="color:${T.hex(0)}">${T.name(0)}</th><th style="color:${T.hex(1)}">${T.name(1)}</th></tr><tr class="t"><td>${_bank[0]}</td><td>${_bank[1]}</td></tr></table>` });
}

function _botStep() {
    if (_phase !== 'roll' || !T.botTurn(_turn)) return;
    const target = holdAt(_bank[1], _bank[0], _wobble);
    if (_pot >= target) _hold(); else _roll();
}

function _render(bust = false) {
    if (!T || T.done) return;
    const p = _turn, bot = T.botTurn(p);
    T.head(p, `${T.name(p)}'S GO`, _note || (bot ? 'THINKING…' : _phase === 'roll' ? (_pot ? `ROLL AGAIN, OR HOLD TO BANK ${_pot}` : 'ROLL (A 1 LOSES THE POT)') : ''));
    T.qa('.pg-lane').forEach((l, q) => {
        const w = Math.min(100, _bank[q]), pot = q === p ? Math.min(100 - w, _pot) : 0;
        l.querySelector('.pg-fill').style.width = w + '%';
        const po = l.querySelector('.pg-pot'); po.style.left = w + '%'; po.style.width = pot + '%';
        l.querySelector('b').textContent = _bank[q];
        l.classList.toggle('up', q === p);
    });
    const box = T.q('.pg-potbox');
    box.querySelector('b').textContent = _pot; box.classList.toggle('bust', bust);
    if (_phase !== 'rolling') Dice.paint(T.q('.pg-mid .bd-die'), _face);
    T.q('.pg-rolls').textContent = _rolls.length ? _rolls.join(' · ') : '';
    const [rb, hb] = T.qa('.bt-btn');
    rb.classList.toggle('off', _phase !== 'roll' || bot);
    hb.classList.toggle('off', _phase !== 'roll' || bot || !_pot);
}

/** Probes: the state, and what a sensible human would tap now (null: wait). */
export function _debugState() { return { turn: _turn, bank: [..._bank], pot: _pot, phase: _phase }; }
export function _probeTap() {
    if (!T || T.done || T.botTurn(_turn) || _phase !== 'roll' || T.locked()) return null;
    return _pot >= holdAt(_bank[_turn], _bank[1 - _turn]) ? '.bt-btn[data-act="hold"]' : '.bt-btn[data-act="roll"]';
}
