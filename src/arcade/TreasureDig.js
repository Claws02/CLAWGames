// ============================================================
// TREASURE DIG — find three buried chests in as few digs as you can.
//
// A 7×7 beach. Tap sand to dig. A chest is found, or the hole shows how many
// steps (up, down, left, right) it is to the nearest chest still buried. The
// numbers stay live: when a chest comes up, every hole re-counts to the chests
// that are left, so each find tells you more. Hot holes glow red, cold ones blue.
// Stars by digs: ≤ 10 ★★★, ≤ 15 ★★, otherwise ★.
// ============================================================
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'treasure', icon: '💰', title: 'Treasure Dig', blurb: 'Three chests under the sand. Every hole tells you how far the nearest one is.', daily: true };
export const N = 7, CHESTS = 3, STARS = [10, 15];

// ---- the rules (no DOM) -------------------------------------------------------------
/** Where the chests are: CHESTS distinct squares of an N×N beach. */
export function bury(rnd = Math.random, n = N, k = CHESTS) {
    const all = [...Array(n * n).keys()];
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all.slice(0, k).sort((a, b) => a - b);
}
export const steps = (a, b, n = N) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n));
/** What a hole at k reads: steps to the nearest chest not yet found (null when none are left). */
export function reading(k, chests, found, n = N) {
    const left = chests.filter(c => !found.includes(c));
    return left.length ? Math.min(...left.map(c => steps(k, c, n))) : null;
}
export const stars = digs => (digs <= STARS[0] ? 3 : digs <= STARS[1] ? 2 : 1);

// ---- the screen -----------------------------------------------------------------------
let _el = null, _st = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };

export function bestText() { const b = Solo.best('treasure'); return b == null ? '' : `best ${b} digs`; }

export function mount(el, opts = {}) {
    _el = el;
    _new(opts);
}
export function unmount() { _el = null; _st = null; }

function _new(opts = {}) {
    const daily = !!opts.daily;
    _st = { daily, chests: bury(daily ? Solo.rng(opts.seed) : Math.random), dug: [], found: [], over: false };
    _el.innerHTML = `
        <p class="lead sg-lead">Tap the sand to dig. A hole shows how many steps to the nearest chest still buried.</p>
        <div class="td-top"><span class="bfont" id="td-found">💰 0 / ${CHESTS}</span><span class="bfont" id="td-digs">⛏️ 0 digs</span></div>
        <div class="td-board" id="td-board" style="--n:${N}"></div>
        <div class="td-key"><span class="h1">1</span><span class="h2">2</span><span class="h3">3</span><span class="h4">4+</span> steps away</div>
        <div class="cs-done" id="td-done" hidden>
            <div class="cs-done-h bfont" id="td-done-h"></div>
            <div class="cs-done-t bfont" id="td-done-t"></div>
            <div class="cs-done-best" id="td-done-best"></div>
            <button class="go-btn bfont" id="btn-td-again">A NEW BEACH</button>
        </div>`;
    _el.querySelector('#btn-td-again').addEventListener('click', () => _new({}));
    _paint();
}

/** Dig square k. Returns what it was: 'chest', a number, or null (already dug / over). */
export function dig(k) {
    const s = _st;
    if (!s || s.over || s.dug.includes(k) || k < 0 || k >= N * N) return null;
    s.dug.push(k);
    let out;
    if (s.chests.includes(k)) { s.found.push(k); out = 'chest'; _sfx('coin_gain'); }
    else { out = reading(k, s.chests, s.found); _sfx(out <= 1 ? 'land_good' : 'dice_land'); }
    try { Audio.haptic(out === 'chest' ? [40, 30, 80] : 10); } catch (e) {}
    if (s.found.length === CHESTS) _win();
    _paint();
    return out;
}

function _paint() {
    if (!_el) return;
    const s = _st, b = _el.querySelector('#td-board');
    let html = '';
    for (let k = 0; k < N * N; k++) {
        if (!s.dug.includes(k)) html += `<button class="td-sq sand" data-k="${k}" aria-label="Dig row ${Math.floor(k / N) + 1}, column ${k % N + 1}"></button>`;
        else if (s.chests.includes(k)) html += `<span class="td-sq chest" data-k="${k}">💰</span>`;
        else {
            const r = reading(k, s.chests, s.found);
            html += `<span class="td-sq hole h${r == null ? 0 : Math.min(r, 4)}" data-k="${k}">${r == null ? '' : r}</span>`;
        }
    }
    b.innerHTML = html;
    b.querySelectorAll('.sand').forEach(el => el.addEventListener('click', () => dig(+el.dataset.k)));
    _el.querySelector('#td-found').textContent = `💰 ${s.found.length} / ${CHESTS}`;
    _el.querySelector('#td-digs').textContent = `⛏️ ${s.dug.length} dig${s.dug.length === 1 ? '' : 's'}`;
}

function _win() {
    const s = _st, digs = s.dug.length, st = stars(digs);
    s.over = true;
    Solo.bump('treasureGames');
    if (st === 3) Solo.bump('treasure3');
    const isBest = Solo.record('treasure', digs, 'low');
    const firstDaily = s.daily && Solo.solveDaily('treasure');
    _sfx('win');
    Solo.won();
    _el.querySelector('#td-done').hidden = false;
    _el.querySelector('#td-done-h').textContent = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} ALL FOUND!`;
    _el.querySelector('#td-done-t').textContent = `${digs} digs`;
    _el.querySelector('#td-done-best').textContent = s.daily ? (firstDaily ? `📅 Today's beach dug up! Streak: ${Solo.streak()}` : "📅 Today's beach: already done.")
        : isBest ? '🏅 NEW BEST!' : `Best: ${Solo.best('treasure')} digs · ★★★ in ${STARS[0]} or fewer`;
    _el.querySelector('#td-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** Probes: the beach. */
export const _debug = () => (_st ? { ..._st, chests: _st.chests.slice(), dug: _st.dug.slice(), found: _st.found.slice() } : null);
