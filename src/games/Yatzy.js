// ============================================================
// YATZY — the full 13-box card, two players, taken in turns.
//
// A CLAWGames-only game: it lives in the app, not in claw-core, and is wired
// in by src/games/index.js. It still follows claw-core's minigame contract
// (HundredBlockDash docs/MINIGAME_STANDARD.md): start(isBot, onWin, botSkill),
// its own id-less overlay in #minigame-layer, one guarded onWin, everything
// released in _destroy.
//
// The hold is TABLETOP: the phone lies flat between the two players, and the
// whole card turns round to face whoever's up. Against a bot it stays facing
// the human.
//
// The point of this version is the arithmetic in plain sight: after every roll
// each open box in your column shows what it would score, the bonus rings count
// toward 63, and the totals tick up as you go.
//
// Bot: for each hold it samples rerolls and keeps the hold whose best box is
// worth most, where a box is worth its score minus what that box usually earns.
// Skill sets how many samples it takes and how often it picks a worse option.
// ============================================================

import { state } from '../AppHost.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { registerMinigameCleanup, extendWatchdog } from '../claw-core/minigames/MinigameManager.js';

// ── Rules ───────────────────────────────────────────────────────────────────
export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER = ['three', 'four', 'full', 'small', 'large', 'yatzy', 'chance'];
export const CATS  = [...UPPER, ...LOWER];
export const BONUS_AT = 63, BONUS = 35;
const ROLLS = 3;

const RULE = {
    ones: 'ONES: add up the 1s', twos: 'TWOS: add up the 2s', threes: 'THREES: add up the 3s',
    fours: 'FOURS: add up the 4s', fives: 'FIVES: add up the 5s', sixes: 'SIXES: add up the 6s',
    three: '3 OF A KIND: add up all five dice', four: '4 OF A KIND: add up all five dice',
    full: 'FULL HOUSE: three and a pair = 25', small: 'SMALL STRAIGHT: four in a row = 30',
    large: 'LARGE STRAIGHT: five in a row = 40', yatzy: 'YATZY: all five the same = 50',
    chance: 'CHANCE: add up all five dice',
};
const NAME = {
    ones: 'ONES', twos: 'TWOS', threes: 'THREES', fours: 'FOURS', fives: 'FIVES', sixes: 'SIXES',
    three: '3 OF A KIND', four: '4 OF A KIND', full: 'FULL HOUSE', small: 'SMALL STRAIGHT',
    large: 'LARGE STRAIGHT', yatzy: 'YATZY', chance: 'CHANCE',
};

const _sum = d => d.reduce((a, b) => a + b, 0);
function _counts(d) { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach(v => c[v]++); return c; }

/** What `dice` (five faces, 1–6) would score in box `cat`. */
export function scoreOf(cat, dice) {
    const c = _counts(dice), max = Math.max(...c);
    const has = run => run.every(v => c[v] > 0);
    const up = UPPER.indexOf(cat);
    if (up >= 0) return c[up + 1] * (up + 1);
    switch (cat) {
        case 'three':  return max >= 3 ? _sum(dice) : 0;
        case 'four':   return max >= 4 ? _sum(dice) : 0;
        case 'full':   return c.includes(3) && c.includes(2) ? 25 : 0;
        case 'small':  return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
        case 'large':  return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
        case 'yatzy':  return max === 5 ? 50 : 0;
        case 'chance': return _sum(dice);
    }
    return 0;
}

/** A card's running totals. Unfilled boxes count as nothing. */
export function totals(card) {
    const upper = UPPER.reduce((a, k) => a + (card[k] ?? 0), 0);
    const lower = LOWER.reduce((a, k) => a + (card[k] ?? 0), 0);
    const bonus = upper >= BONUS_AT ? BONUS : 0;
    return { upper, bonus, lower, total: upper + bonus + lower };
}

// ── Bot tuning ──────────────────────────────────────────────────────────────
// What each box earns in a typical game. A box is worth its score less this,
// so a 0 in Ones costs little and a 0 in Large Straight costs a lot.
const PAR = { ones: 2, twos: 5, threes: 8.5, fours: 12, fives: 15.5, sixes: 19,
              three: 15, four: 6, full: 16, small: 20, large: 16, yatzy: 8, chance: 22 };
const ROLL_TIME = 0.6;      // s the dice tumble
const FACE_STEP = 0.07;     // s between faces while tumbling
const FLIP_MS   = 450;      // the card turning round to the next player

// ── Module state ────────────────────────────────────────────────────────────
let _done = false, _onWin = null, _isBot = false, _botSkill = 0.55;
let _overlay = null, _frame = null, _af = null, _last = 0;
let _cards = null;          // [ {cat: score} × 2 ]
let _turn = 0, _dice = null, _held = null, _rollsUsed = 0, _pick = null;
let _rolling = null;        // { t, step } while the dice tumble
let _lockUntil = 0, _facing = 0, _flash = null, _note = '';
let _el = {};
const _cleanups = [];
const _timers   = [];

function _after(fn, ms) {
    const id = setTimeout(() => { _timers.splice(_timers.indexOf(id), 1); if (!_done) fn(); }, ms);
    _timers.push(id);
    return id;
}

const _isBotTurn = () => _isBot && _turn === 1;
const _name = p => (state.players?.[p]?.name || (p ? 'P2' : 'P1')).toUpperCase();
const _hex  = p => state.players?.[p]?.hex || (p ? '#3b9dff' : '#ff4d6d');

// ── Lifecycle ───────────────────────────────────────────────────────────────
export function start(isBot, onWin, botSkill = 0.55) {
    if (!state.mgActive) return;
    _done = false; _onWin = onWin; _isBot = isBot; _botSkill = botSkill;
    _cards = [{}, {}];
    _turn = Math.random() < 0.5 ? 0 : 1;
    _facing = _isBot ? 0 : _turn;
    _last = 0; _lockUntil = 0; _rolling = null; _flash = null;
    registerMinigameCleanup(_destroy);   // R3
    _build();
    _newTurn(true);
    _af = requestAnimationFrame(_tick);
}

// ── DOM (R2) ────────────────────────────────────────────────────────────────
const CSS = `
.yz{position:absolute;inset:0;overflow:hidden;touch-action:none;background:#f4997b;font-family:Nunito,system-ui,sans-serif;user-select:none;-webkit-user-select:none}
.yz-frame{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--c)*.22);padding:12px;box-sizing:border-box;transition:transform ${FLIP_MS}ms cubic-bezier(.5,0,.3,1)}
.yz-frame.flip{transform:rotate(180deg)}
.yz-head{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:calc(var(--c)*1.1)}
.yz-turn{font:calc(var(--c)*.42) 'Bebas Neue',Impact,sans-serif;letter-spacing:2px;color:#fff;padding:4px 16px;border-radius:999px;border:3px solid #3f4652}
.yz-hint{font-weight:800;font-size:calc(var(--c)*.22);color:#3f4652;min-height:1.3em;text-align:center}
.yz-card{display:flex;background:#fdecd2;border:calc(var(--c)*.09) solid #3f4652;border-radius:calc(var(--c)*.32);padding:calc(var(--c)*.12) 0}
.yz-half{display:grid;grid-template-columns:repeat(3,var(--c));grid-auto-rows:calc(var(--c)*1.13);column-gap:calc(var(--c)*.14);padding:0 calc(var(--c)*.14)}
.yz-half+.yz-half{border-left:3px solid #f2c9a0}
.yz-row{display:contents}
.yz-ico,.yz-cell{align-self:center;height:var(--c);border-radius:calc(var(--c)*.16);box-sizing:border-box;display:flex;align-items:center;justify-content:center;position:relative}
.yz-ico{background:#fff;border:3px solid #7a4e6a;font:calc(var(--c)*.5) 'Bebas Neue',Impact,sans-serif;color:#3f4652;flex-direction:column;line-height:.9}
.yz-ico small{font:800 calc(var(--c)*.15) Nunito,system-ui,sans-serif;letter-spacing:.5px}
.yz-ico.yz-big{font-size:calc(var(--c)*.68)}
.yz-ico.yz-fan small{font-size:calc(var(--c)*.17);margin-top:1px}
.yz-ico.yz-yatzy{font-size:calc(var(--c)*.36);color:#ffd200;-webkit-text-stroke:1.5px #3f4652;transform:rotate(-8deg)}
.yz-cell{font:calc(var(--c)*.5) 'Bebas Neue',Impact,sans-serif;color:#3f4652;background:var(--pc-soft);border:3px solid transparent}
.yz-cell.mine{border-color:var(--pc)}
.yz-cell.filled{background:var(--pc);color:#fff;border-color:transparent;box-shadow:inset 0 -4px 0 rgba(0,0,0,.15)}
.yz-cell.ghost{color:rgba(63,70,82,.55)}
.yz-cell.ghost.zero{color:rgba(63,70,82,.28)}
.yz-cell.pick{background:#fff;color:#3f4652;border-color:#3f4652;border-width:4px;transform:scale(1.08);z-index:1}
.yz-cell.pop{animation:yzpop .5s ease-out}
@keyframes yzpop{0%{transform:scale(1.35)}100%{transform:scale(1)}}
.yz-bonus{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,var(--c));column-gap:calc(var(--c)*.14);align-items:center}
.yz-blab{font:900 calc(var(--c)*.19) Nunito,system-ui,sans-serif;color:#3f4652;line-height:1.1}
.yz-blab b{display:block;font:calc(var(--c)*.42) 'Bebas Neue',Impact,sans-serif;color:#8a3fb0}
.yz-ring{width:var(--c);height:var(--c);border-radius:50%;background:#fdf3e2;border:calc(var(--c)*.08) solid #f2c9a0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;font:calc(var(--c)*.3) 'Bebas Neue',Impact,sans-serif;color:#3f4652;line-height:1}
.yz-ring.got{border-color:var(--pc);background:#fff}
.yz-ring small{font:800 calc(var(--c)*.14) Nunito,system-ui,sans-serif}
.yz-tot{display:flex;gap:calc(var(--c)*.3);align-items:center}
.yz-tchip{display:flex;align-items:baseline;gap:6px;background:#fff;border:3px solid var(--pc);border-radius:999px;padding:2px 14px;font:800 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#3f4652}
.yz-tchip b{font:calc(var(--c)*.46) 'Bebas Neue',Impact,sans-serif}
.yz-tchip.up{box-shadow:0 0 0 3px #3f4652}
.yz-tray{display:flex;gap:calc(var(--c)*.2)}
.yz-die{width:calc(var(--c)*1.08);height:calc(var(--c)*1.08);border-radius:calc(var(--c)*.2);background:#fff;border:calc(var(--c)*.07) solid #3f4652;box-sizing:border-box;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:calc(var(--c)*.12);position:relative;transition:transform .15s}
.yz-die.blank{background:#5f6670}
.yz-die.blank::after{content:'★';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:calc(var(--c)*.42)}
.yz-die.held{transform:translateY(calc(var(--c)*-.16));border-color:#ffb400;box-shadow:0 4px 0 #3f4652}
.yz-die.held::after{content:'HELD';position:absolute;left:0;right:0;bottom:calc(var(--c)*-.34);text-align:center;font:800 calc(var(--c)*.17) Nunito,system-ui,sans-serif;color:#3f4652}
.yz-die.tumble{transform:rotate(var(--r))}
.yz-pip{width:70%;height:70%;border-radius:50%;background:#1b1b1f;place-self:center}
.yz-mini{display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);width:70%;height:70%}
.yz-mini .yz-pip{width:62%;height:62%}
.yz-btns{display:flex;gap:calc(var(--c)*.2);width:calc(var(--c)*6.8)}
.yz-btn{flex:1;height:calc(var(--c)*1.1);border:0;border-radius:calc(var(--c)*.2);font:calc(var(--c)*.6) 'Bebas Neue',Impact,sans-serif;letter-spacing:2px;color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18)}
.yz-roll{background:#d2584a;flex:1.6}
.yz-roll.off,.yz-play.off{opacity:.45}
.yz-play{background:#3f4652}
.yz-play.go{background:#2fae67}
.yz-rp{display:inline-flex;width:calc(var(--c)*.42);height:calc(var(--c)*.42);border-radius:7px;border:2.5px solid #3f4652;background:#fff;color:#3f4652;font-size:calc(var(--c)*.3);align-items:center;justify-content:center;letter-spacing:0}
.yz-rp.used{opacity:.35}
.yz-end{position:absolute;inset:0;display:flex;flex-direction:column;background:rgba(40,30,40,.55)}
.yz-endhalf{flex:1;display:flex;align-items:center;justify-content:center}
.yz-endhalf.top{transform:rotate(180deg)}
.yz-endbox{background:#fdecd2;border:4px solid #3f4652;border-radius:18px;padding:10px 18px;text-align:center;color:#3f4652;font-weight:800}
.yz-endbox h2{margin:0 0 6px;font:normal 34px 'Bebas Neue',Impact,sans-serif;letter-spacing:2px}
.yz-endbox table{border-collapse:collapse;margin:0 auto 6px;font-size:14px}
.yz-endbox td,.yz-endbox th{padding:2px 10px}
.yz-endbox tr.t td{border-top:2px solid #3f4652;font:22px 'Bebas Neue',Impact,sans-serif}
.yz-endbox p{margin:0;font-size:12px;opacity:.7}
`;

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const _pips = (n, cls = '') => Array.from({ length: 9 }, (_, i) =>
    PIPS[n].includes(i) ? `<span class="yz-pip ${cls}"></span>` : '<span></span>').join('');
const HOUSE = '<svg viewBox="0 0 24 24" width="80%" height="80%"><path fill="#3f4652" d="M12 2 1 12h3v10h6v-6h4v6h6V12h3z"/></svg>';
// A fanned hand of `n` cards pivoting on one point, the front card solid.
function _fan(n) {
    const spread = n === 4 ? 22 : 18, cards = Array.from({ length: n }, (_, i) => {
        const a = (i - (n - 1) / 2) * spread, front = i === n - 1;
        return `<rect x="10.5" y="1.5" width="11" height="15" rx="1.8" transform="rotate(${a} 16 24)" fill="${front ? '#3f4652' : '#fff'}" stroke="#3f4652" stroke-width="1.5"/>`;
    }).join('');
    return `<svg viewBox="-2 -0.5 36 21" width="94%" height="60%">${cards}</svg>`;
}

function _icon(cat) {
    const up = UPPER.indexOf(cat);
    if (up >= 0) return `<div class="yz-mini">${_pips(up + 1)}</div>`;
    return {
        three: '3x', four: '4x', full: HOUSE,
        small: `${_fan(4)}<small>SMALL</small>`, large: `${_fan(5)}<small>LARGE</small>`, yatzy: 'YATZY', chance: '?<small>CHANCE</small>',
    }[cat];
}

const ICO_CLASS = { yatzy: ' yz-yatzy', three: ' yz-big', four: ' yz-big', small: ' yz-fan', large: ' yz-fan' };

function _build() {
    const mg = document.getElementById('minigame-layer');
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _overlay = document.createElement('div');
    _overlay.className = 'yz';
    const row = cat => `<div class="yz-row"><div class="yz-ico${ICO_CLASS[cat] || ''}" data-act="rule" data-cat="${cat}">${_icon(cat)}</div>` +
        [0, 1].map(p => `<div class="yz-cell" data-act="cell" data-cat="${cat}" data-p="${p}" style="--pc:${_hex(p)};--pc-soft:${_hex(p)}33"></div>`).join('') + '</div>';
    _overlay.innerHTML = `<style>${CSS}</style><div class="yz-frame">
        <div class="yz-head"><div class="yz-turn"></div><div class="yz-hint"></div></div>
        <div class="yz-card">
          <div class="yz-half">${UPPER.map(row).join('')}
            <div class="yz-bonus"><div class="yz-blab">BONUS<b>+${BONUS}</b></div>${[0, 1].map(p =>
                `<div class="yz-ring" data-p="${p}" style="--pc:${_hex(p)}"></div>`).join('')}</div></div>
          <div class="yz-half">${LOWER.map(row).join('')}</div>
        </div>
        <div class="yz-tot">${[0, 1].map(p => `<div class="yz-tchip" data-p="${p}" style="--pc:${_hex(p)}">${_name(p)} <b>0</b></div>`).join('')}</div>
        <div class="yz-tray">${[0, 1, 2, 3, 4].map(i => `<div class="yz-die blank" data-act="die" data-i="${i}"></div>`).join('')}</div>
        <div class="yz-btns"><button class="yz-btn yz-roll" data-act="roll">ROLL ${[1, 2, 3].map(n => `<span class="yz-rp">${n}</span>`).join('')}</button>
          <button class="yz-btn yz-play off" data-act="play">PLAY</button></div>
      </div>`;
    _frame = _overlay.querySelector('.yz-frame');
    const q = s => [..._overlay.querySelectorAll(s)];
    _el = {
        turn: q('.yz-turn')[0], hint: q('.yz-hint')[0], roll: q('.yz-roll')[0], play: q('.yz-play')[0],
        rp: q('.yz-rp'), dice: q('.yz-die'), rings: q('.yz-ring'), chips: q('.yz-tchip'),
        cell: Object.fromEntries(CATS.map(c => [c, [0, 1].map(p => _overlay.querySelector(`.yz-cell[data-cat="${c}"][data-p="${p}"]`))])),
    };

    const onDown = e => {
        if (_done) return;
        const t = e.target.closest('[data-act]');
        if (!t) return;
        e.preventDefault();
        const act = t.dataset.act;
        if (act === 'end') { _finishNow(); return; }
        if (act === 'rule') { _note = RULE[t.dataset.cat]; _render(); return; }
        if (_isBotTurn() || _rolling || performance.now() < _lockUntil) return;
        if (act === 'roll') _roll();
        else if (act === 'die') _toggleHold(+t.dataset.i);
        else if (act === 'cell') _select(t.dataset.cat, +t.dataset.p);
        else if (act === 'play') _commit();
    };
    _overlay.addEventListener('pointerdown', onDown);
    _cleanups.push(() => _overlay.removeEventListener('pointerdown', onDown));
    const onResize = () => _resize();
    window.addEventListener('resize', onResize);
    _cleanups.push(() => window.removeEventListener('resize', onResize));

    mg.appendChild(_overlay);
    _resize();
}

// R4: one size unit, from whichever axis binds. 6 columns across, and about
// 14 cell-heights down for the head, card, totals, tray and buttons.
function _resize() {
    if (!_overlay) return;
    const w = _overlay.clientWidth || window.innerWidth, h = _overlay.clientHeight || window.innerHeight;
    const c = Math.floor(Math.max(28, Math.min((w - 24) / 7.5, (h - 24) / 15, 92)));
    _overlay.style.setProperty('--c', c + 'px');
}

// ── Turn flow ───────────────────────────────────────────────────────────────
function _newTurn(first = false) {
    _dice = [0, 0, 0, 0, 0]; _held = [false, false, false, false, false];
    _rollsUsed = 0; _pick = null; _note = '';
    extendWatchdog(240000);   // a turn may take a while; an abandoned game still ends
    const face = _isBot ? 0 : _turn;
    if (face !== _facing) {
        _facing = face;
        _frame.classList.toggle('flip', _facing === 1);
        _lockUntil = performance.now() + FLIP_MS;
    } else if (first) _frame.classList.toggle('flip', _facing === 1);
    _render();
    if (_isBotTurn()) _after(_botStep, 700 + Math.random() * 400);
}

function _roll() {
    if (_rollsUsed >= ROLLS) return;
    if (_held.every(Boolean)) { _note = 'ALL FIVE HELD: TAP ONE TO FREE IT'; _render(); return; }
    _rollsUsed++;
    _pick = null; _note = '';
    _rolling = { t: 0, step: 0 };
    sfx('dice_throw');
    _render();
}

function _settleRoll() {
    _rolling = null;
    _dice = _dice.map((v, i) => _held[i] ? v : 1 + Math.floor(Math.random() * 6));
    sfx('dice_land');
    if (Math.max(..._counts(_dice)) === 5) { _note = 'YATZY!'; haptic('heavy'); }
    _render();
    if (_isBotTurn()) _after(_botStep, _botThinkMs());
}

function _toggleHold(i) {
    if (_rollsUsed === 0 || _rollsUsed >= ROLLS) return;
    _held[i] = !_held[i];
    haptic([8]);
    _render();
}

function _select(cat, p) {
    if (p !== _turn || _rollsUsed === 0 || _cards[p][cat] !== undefined) return;
    _pick = _pick === cat ? null : cat;
    _note = '';
    _render();
}

function _commit() {
    if (!_pick) { _note = _rollsUsed ? 'PICK A BOX IN YOUR COLUMN FIRST' : 'ROLL FIRST'; _render(); return; }
    const cat = _pick, p = _turn, s = scoreOf(cat, _dice);
    const hadBonus = totals(_cards[p]).bonus > 0;
    _cards[p][cat] = s;
    _pick = null;
    _flash = { cat, p };
    if (cat === 'yatzy' && s) { sfx('mg_win'); haptic('heavy'); }
    else sfx(s > 0 ? 'coin_gain' : 'land_bad');
    if (!hadBonus && totals(_cards[p]).bonus) _after(() => sfx('bell'), 250);
    _note = `${_name(p)} +${s} ${NAME[cat]}`;
    _render();
    if (CATS.every(c => _cards[0][c] !== undefined && _cards[1][c] !== undefined)) {
        _lockUntil = Infinity;
        _after(_showEnd, 900);
        return;
    }
    _lockUntil = performance.now() + 700;
    _after(() => { _turn = 1 - _turn; _newTurn(); }, 700);
}

// ── Loop (R1: only the tumble moves) ────────────────────────────────────────
function _tick() {
    if (_done) return;
    _af = requestAnimationFrame(_tick);
    const now = performance.now();
    const dt = _last === 0 ? 1 / 60 : Math.min((now - _last) / 1000, 0.1);
    _last = now;
    if (!_rolling) return;
    _rolling.t += dt; _rolling.step += dt;
    if (_rolling.step >= FACE_STEP) {
        _rolling.step = 0;
        _el.dice.forEach((d, i) => {
            if (_held[i]) return;
            _paintDie(d, 1 + Math.floor(Math.random() * 6));
            d.classList.add('tumble');
            d.style.setProperty('--r', `${Math.random() * 40 - 20}deg`);
        });
    }
    if (_rolling.t >= ROLL_TIME) {
        _el.dice.forEach(d => d.classList.remove('tumble'));
        _settleRoll();
    }
}

// ── Render ──────────────────────────────────────────────────────────────────
function _paintDie(d, v) {
    d.classList.toggle('blank', !v);
    if (d._v !== v) { d.innerHTML = v ? _pips(v) : ''; d._v = v; }
}

function _render() {
    if (!_overlay) return;
    const p = _turn, rolled = _rollsUsed > 0 && !_rolling, bot = _isBotTurn();
    _el.turn.textContent = `${_name(p)}'S TURN`;
    _el.turn.style.background = _hex(p);
    _el.hint.textContent = _note || (bot ? 'THINKING…'
        : !_rollsUsed ? 'TAP ROLL'
        : _rollsUsed < ROLLS ? 'TAP DICE TO HOLD · PICK A BOX, OR ROLL AGAIN'
        : 'PICK A BOX');

    CATS.forEach(cat => [0, 1].forEach(q => {
        const el = _el.cell[cat][q], have = _cards[q][cat];
        const filled = have !== undefined;
        const ghost = !filled && q === p && rolled;
        const s = ghost ? scoreOf(cat, _dice) : null;
        el.className = 'yz-cell' + (filled ? ' filled' : '') + (!filled && q === p ? ' mine' : '') +
            (ghost ? ' ghost' : '') + (ghost && !s ? ' zero' : '') + (ghost && _pick === cat ? ' pick' : '') +
            (_flash && _flash.cat === cat && _flash.p === q ? ' pop' : '');
        el.textContent = filled ? have : ghost ? s : '';
    }));
    _flash = null;

    [0, 1].forEach(q => {
        const t = totals(_cards[q]);
        const r = _el.rings[q];
        r.classList.toggle('got', t.bonus > 0);
        r.innerHTML = t.bonus ? `+${BONUS}<small>${t.upper}/63</small>` : `${t.upper}/63`;
        _el.chips[q].querySelector('b').textContent = t.total;
        _el.chips[q].classList.toggle('up', q === p);
    });

    if (!_rolling) _el.dice.forEach((d, i) => { _paintDie(d, _dice[i]); d.classList.toggle('held', _held[i] && _rollsUsed > 0); });
    _el.rp.forEach((s, i) => s.classList.toggle('used', i < _rollsUsed));
    _el.roll.classList.toggle('off', _rollsUsed >= ROLLS || bot);
    _el.play.classList.toggle('off', !_pick);
    _el.play.classList.toggle('go', !!_pick);
}

// ── Bot (§5: skill-scaled, always noisy) ────────────────────────────────────
function _botThinkMs() { return 650 - _botSkill * 250 + Math.random() * 450; }

function _value(cat, s, card) {
    let v = s - PAR[cat];
    const up = UPPER.indexOf(cat);
    if (up >= 0 && totals(card).bonus === 0 && s >= 3 * (up + 1)) v += 5;   // on pace for the bonus
    return v;
}

function _bestBox(dice, card) {
    return CATS.filter(c => card[c] === undefined)
        .map(c => ({ cat: c, v: _value(c, scoreOf(c, dice), card) }))
        .sort((a, b) => b.v - a.v);
}

function _botHold() {
    const card = _cards[1], n = Math.round(12 + _botSkill * 70);
    const opts = [];
    for (let mask = 0; mask < 32; mask++) {
        const keep = i => (mask >> i) & 1;
        let ev = 0;
        if (mask === 31) ev = _bestBox(_dice, card)[0].v;
        else for (let k = 0; k < n; k++) {
            const d = _dice.map((v, i) => keep(i) ? v : 1 + Math.floor(Math.random() * 6));
            ev += _bestBox(d, card)[0].v / n;
        }
        opts.push({ mask, ev });
    }
    opts.sort((a, b) => b.ev - a.ev);
    const slip = Math.random() < 0.38 - _botSkill * 0.33;
    return opts[slip ? 1 + Math.floor(Math.random() * 3) : 0].mask;
}

// One visible action per step, so the human can follow what the bot did.
function _botStep() {
    if (_done || !_isBotTurn() || _rolling) return;
    if (_rollsUsed === 0) { _roll(); return; }
    if (_rollsUsed < ROLLS) {
        const mask = _botHold();
        const want = [0, 1, 2, 3, 4].map(i => !!((mask >> i) & 1));
        if (want.every(Boolean)) return _botPick();
        const diff = want.findIndex((w, i) => w !== _held[i]);
        if (diff >= 0) { _held[diff] = want[diff]; _render(); _after(_botStep, 260 + Math.random() * 200); return; }
        _roll();
        return;
    }
    _botPick();
}

function _botPick() {
    const ranked = _bestBox(_dice, _cards[1]);
    const slip = ranked.length > 1 && Math.random() < 0.25 - _botSkill * 0.22;
    _pick = ranked[slip ? 1 : 0].cat;
    _render();
    _after(_commit, 700 + Math.random() * 300);
}

// ── End (R6) ────────────────────────────────────────────────────────────────
let _endTotals = null, _winner = -1;

function _showEnd() {
    const t = [0, 1].map(q => totals(_cards[q]));
    _endTotals = t;
    _winner = t[0].total === t[1].total ? -1 : t[0].total > t[1].total ? 0 : 1;
    sfx(_winner < 0 ? 'land_bad' : 'mg_win');
    haptic('heavy');
    const head = _winner < 0 ? `TIE AT ${t[0].total}!` : `${_name(_winner)} WINS!`;
    const rows = [['Upper', 'upper'], [`Bonus (63+)`, 'bonus'], ['Lower', 'lower']]
        .map(([l, k]) => `<tr><td style="text-align:left">${l}</td><td>${t[0][k]}</td><td>${t[1][k]}</td></tr>`).join('');
    const box = `<div class="yz-endbox"><h2>${head}</h2><table>
        <tr><th></th><th style="color:${_hex(0)}">${_name(0)}</th><th style="color:${_hex(1)}">${_name(1)}</th></tr>${rows}
        <tr class="t"><td style="text-align:left">TOTAL</td><td>${t[0].total}</td><td>${t[1].total}</td></tr></table><p>TAP TO FINISH</p></div>`;
    const end = document.createElement('div');
    end.className = 'yz-end';
    end.dataset.act = 'end';
    // Lying flat, both ends read it; against a bot, only the human's end.
    end.innerHTML = (_isBot ? '' : `<div class="yz-endhalf top">${box}</div>`) + `<div class="yz-endhalf">${box}</div>`;
    _overlay.appendChild(end);
    _after(_finishNow, 9000);
}

function _finishNow() {
    if (_done || !_endTotals) return;
    _done = true;
    state.mgActive = false;
    const w = _winner, standings = _endTotals.map(t => t.total);
    _destroy();
    _onWin(w, undefined, standings);
}

// ── Cleanup (R3) ────────────────────────────────────────────────────────────
function _destroy() {
    _done = true;
    _timers.forEach(clearTimeout); _timers.length = 0;
    _cleanups.forEach(f => { try { f(); } catch (e) {} }); _cleanups.length = 0;
    if (_af) { cancelAnimationFrame(_af); _af = null; }
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _frame = null; _el = {}; _rolling = null; _endTotals = null; _last = 0;
}
