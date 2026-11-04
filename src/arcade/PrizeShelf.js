// ============================================================
// PRIZE SHELF — the claw machine and the collection.
//
// Every daily puzzle solved is a claw token. Here a token buys one drop: the
// claw swings across the machine; tap DROP to let it go. Stop it over the
// glowing lucky spot for a better chance of something rare. Every drop wins a
// plush critter; a repeat is a ✨ sparkle, and five sparkles make a free token.
// The shelf below shows what you've won (❔ for the ones still to find).
// ============================================================
import { PRIZES, byId, draw } from './Prizes.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'shelf', icon: '🧸', title: 'Prize Shelf', blurb: 'Spend claw tokens from the daily puzzles on the claw machine. 60 plush critters to collect.' };

let _el = null, _raf = 0, _x = 0.5, _dir = 1, _lucky = 0.5, _busy = false, _t0 = 0;
const SPEED = 0.55;          // the claw's swing, in machine widths per second
const LUCKY_W = 0.16;        // how wide the lucky spot is
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };

export function bestText() {
    const n = Object.keys(Solo.shelf()).length, t = Solo.tokens();
    return `${n} / ${PRIZES.length} collected${t ? ` · 🎟️ ${t} to spend` : ''}`;
}

export function mount(el) {
    _el = el;
    el.innerHTML = `
        <div class="ps-head"><span class="bfont" id="ps-tokens"></span><span class="bfont" id="ps-spark"></span></div>
        <div class="ps-machine" id="ps-machine">
            <div class="ps-lucky" id="ps-lucky"></div>
            <div class="ps-claw" id="ps-claw"><i class="ps-wire"></i><b class="ps-grip"><i class="l"></i><i class="r"></i></b><span class="ps-held" id="ps-held"></span></div>
            <div class="ps-pile" id="ps-pile"></div>
        </div>
        <button class="go-btn bfont" id="btn-ps-drop">DROP!</button>
        <p class="hint" id="ps-hint"></p>
        <div class="ps-won" id="ps-won" hidden></div>
        <div class="panel-h bfont ps-h">🧸 Your shelf <span id="ps-count"></span></div>
        <div class="ps-shelf" id="ps-shelf"></div>`;
    el.querySelector('#btn-ps-drop').addEventListener('click', () => dropClaw());
    _el.querySelector('#ps-pile').textContent = PRIZES.filter((_, i) => i % 3 === 0).map(p => p.icon).join('');
    _newLucky();
    _paint();
    _t0 = performance.now();
    let last = _t0;
    const tick = now => {
        if (!_el) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (!_busy) { _x += _dir * SPEED * dt; if (_x > 0.92) { _x = 0.92; _dir = -1; } if (_x < 0.08) { _x = 0.08; _dir = 1; } }
        const claw = _el.querySelector('#ps-claw'); if (claw) claw.style.left = `${_x * 100}%`;
        _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}
export function unmount() { cancelAnimationFrame(_raf); _raf = 0; _el = null; _busy = false; }

function _newLucky() { _lucky = 0.15 + Math.random() * 0.7; const l = _el.querySelector('#ps-lucky'); l.style.left = `${(_lucky - LUCKY_W / 2) * 100}%`; l.style.width = `${LUCKY_W * 100}%`; }

/** Spend a token and drop the claw where it is. Resolves with the prize (or null: no token / busy). */
export function dropClaw(at = null) {
    if (!_el || _busy || !Solo.spendToken()) { if (_el && !Solo.tokens()) _hint('No tokens yet: solve today\'s daily puzzles to earn them.'); return Promise.resolve(null); }
    _busy = true;
    if (at != null) _x = at;
    const lucky = Math.abs(_x - _lucky) <= LUCKY_W / 2;
    const prize = draw(Math.random, lucky, Solo.shelf());
    const res = Solo.addPrize(prize.id);
    _paint();
    _el.querySelector('#ps-won').hidden = true;
    const claw = _el.querySelector('#ps-claw');
    claw.classList.add('down');
    _sfx('gate_roll');
    return new Promise(done => {
        setTimeout(() => {
            if (!_el) return done(prize);
            _el.querySelector('#ps-held').textContent = prize.icon;
            claw.classList.remove('down'); claw.classList.add('up');
            _sfx('gate_open');
        }, 650);
        setTimeout(() => {
            if (!_el) return done(prize);
            claw.classList.remove('up');
            _el.querySelector('#ps-held').textContent = '';
            _reveal(prize, res, lucky);
            _busy = false;
            _newLucky();
            _paint();
            Solo.won();
            done(prize);
        }, 1400);
    });
}

function _reveal(prize, res, lucky) {
    const w = _el.querySelector('#ps-won');
    w.hidden = false;
    w.className = `ps-won ${prize.rarity}`;
    const name = prize.id.replace(/\b\w/g, c => c.toUpperCase());
    w.innerHTML = `<span class="ps-big">${prize.icon}</span><span><b class="bfont">${name}</b><small>${prize.rarity.toUpperCase()}${lucky ? ' · 🍀 lucky drop' : ''}</small>` +
        `<em>${res.fresh ? '✨ NEW for your shelf!' : `A repeat: +1 sparkle${res.bonus ? ' · 5 sparkles = a free token! 🎟️' : ''}`}</em></span>`;
    _sfx(prize.rarity === 'legendary' ? 'win' : prize.rarity === 'rare' ? 'coin_gain' : 'land_good');
    try { Audio.haptic(prize.rarity === 'common' ? 20 : [40, 40, 80]); } catch (e) {}
    if (res.fresh && prize.rarity === 'legendary') Solo.bump('legendary');
}

function _hint(t) { const h = _el && _el.querySelector('#ps-hint'); if (h) h.textContent = t; }

function _paint() {
    if (!_el) return;
    const shelf = Solo.shelf(), t = Solo.tokens();
    _el.querySelector('#ps-tokens').textContent = `🎟️ ${t} token${t === 1 ? '' : 's'}`;
    _el.querySelector('#ps-spark').textContent = `✨ ${Solo.sparkles()} / 5`;
    _el.querySelector('#btn-ps-drop').disabled = _busy || !t;
    _hint(t ? 'Tap DROP when the claw is over the glowing spot for a luckier prize.' : 'No tokens yet: every daily puzzle you solve earns one.');
    const n = Object.keys(shelf).length;
    _el.querySelector('#ps-count').textContent = `${n} / ${PRIZES.length}`;
    _el.querySelector('#ps-shelf').innerHTML = PRIZES.map(p => (shelf[p.id]
        ? `<span class="ps-slot ${p.rarity}" title="${p.id}">${p.icon}${shelf[p.id] > 1 ? `<i>×${shelf[p.id]}</i>` : ''}</span>`
        : `<span class="ps-slot empty ${p.rarity}" title="still to find">❔</span>`)).join('');
}

/** Probes: where the claw and the lucky spot are. */
export const _debug = () => ({ x: _x, lucky: _lucky, busy: _busy, luckyW: LUCKY_W });
export { byId };
