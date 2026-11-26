// ============================================================
// SPARKWRIGHT SPRINT — the arcade entry (claw-core minigame contract).
//
// Everyone runs the SAME verified campaign level, one at a time (pass &
// play), fastest wins. Across phones (parallel / Solo) each phone runs it
// alone and reports a score. The full campaign lives in preview.html for
// now; docs/INTEGRATION.md covers giving it an arcade screen of its own.
//
//   start(isBot, onWin, botSkill)   contract: onWin(winner, payouts?, standings) once
//   soloScore()                     banked score for SoloArena (higher = better)
//
// Score = round((CAP − seconds) × 10), 0 for a run that never finishes.
// Bots replay the solver's tape for the level (levels/tapes.js) and are
// handicapped by skill: reported time × (1 + (1 − skill) × 0.8).
// ============================================================
import { state } from '../../AppHost.js';
import * as Audio from '../../claw-core/engine/AudioManager.js';
// Namespace imports (CLAWGames shipping rule 6): a phone mixing a fresh file with a cached
// claw-core must not fail on a missing named export.
import * as MM from '../../claw-core/minigames/MinigameManager.js';
import * as Solo from '../../claw-core/minigames/SoloArena.js';
import { LEVELS } from './levels/index.js';
import { TAPES } from './levels/tapes.js';
import { createGame } from './Game.js';

const CAP_S = 60;               // a run slower than this scores 0
const TURN_WALL_MS = 75000;     // wall-clock backstop per turn (pauses, a phone left down)
const SEAT_COLOR = ['#ff3b3b', '#3b8eff', '#3dff8a', '#ffcf3d'];

let _done = false, _onWin = null, _botSkill = 0.55, _solo = false;
let _overlay = null, _game = null, _level = null, _slots = [], _times = {}, _soloScore = 0;
const _timers = [];

function _after(fn, ms) {
    const id = setTimeout(() => { _timers.splice(_timers.indexOf(id), 1); fn(); }, ms);
    _timers.push(id);
    return id;
}

export const scoreFor = s => (s == null ? 0 : Math.max(0, Math.round((CAP_S - s) * 10)));

export function start(isBot, onWin, botSkill = 0.55) {
    if (!state.mgActive) return;
    _destroy();   // a back-to-back start (Solo "again") must not inherit the last run's timers
    _done = false; _onWin = onWin; _botSkill = botSkill; _times = {}; _soloScore = 0;
    MM.registerMinigameCleanup(_destroy);
    _solo = Solo.isSolo();
    _slots = _solo ? [0] : MM.slots();
    // Same level on every phone (indexed draw); shared-screen everyone plays the
    // one level anyway, so the pick itself can't favour anybody.
    const r = _solo ? Solo.draw(0) : Math.random();
    _level = LEVELS[Math.floor(r * LEVELS.length) % LEVELS.length];
    _build();
    const n = document.getElementById('mg-neutral');
    if (n) n.textContent = 'GO!';
    _turn(0);
}

export function soloScore() { return _soloScore; }

/** For qa/sparkwright.js: what is running. */
export function debugState() { return { level: _level?.id, slots: _slots.slice(), times: { ..._times }, running: !!_game, done: _done }; }

function _build() {
    const mg = document.getElementById('minigame-layer');
    if (_overlay) _overlay.remove();
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#0b1622;touch-action:none;z-index:5;';
    mg.appendChild(_overlay);
}

function _card(html, button, onGo, autoMs) {
    const c = document.createElement('div');
    c.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0b1622;color:#d8ecff;font-family:ui-monospace,Menlo,monospace;text-align:center;padding:24px;z-index:3;';
    c.innerHTML = `<div style="max-width:340px">${html}${button ? `<button style="margin-top:16px;background:#5cb8e6;color:#0b1622;border:0;border-radius:10px;font:inherit;font-weight:700;font-size:16px;padding:14px 26px">${button}</button>` : ''}</div>`;
    _overlay.appendChild(c);
    const go = () => { if (c.isConnected) { c.remove(); onGo(); } };
    c.querySelector('button')?.addEventListener('pointerdown', e => { e.preventDefault(); go(); });
    if (autoMs) _after(go, autoMs);
    return c;
}

function _turn(i) {
    if (_done) return;
    if (i >= _slots.length) return _finish();
    const slot = _slots[i];
    const bot = !_solo && MM.isBotSlot(slot);
    MM.extendWatchdog?.(TURN_WALL_MS + 30000);
    const who = _solo ? 'YOUR SHIFT' : `P${slot + 1}${bot ? ' · BOT' : ''}`;
    const col = SEAT_COLOR[slot] || '#d8ecff';
    const intro = `<div style="color:${col};font-size:28px;letter-spacing:.14em;font-weight:700">${who}</div>
        <div style="margin-top:10px;color:#ffcf3d;letter-spacing:.1em">${_level.name.toUpperCase()}</div>
        <div style="margin-top:8px;font-size:13px;line-height:1.5;color:#9fbad3">${_level.brief}</div>
        <div style="margin-top:8px;font-size:12px;color:#6f8fae">Par ${_level.par.seconds}s · fastest to the exit wins</div>`;
    _card(intro, bot ? null : (_solo || i === 0 ? 'START' : `PASS TO P${slot + 1} · START`), () => _run(i, slot, bot), bot ? 1400 : null);
}

function _run(i, slot, bot) {
    if (_done) return;
    let ended = false;
    const end = seconds => {
        if (ended || _done) return;
        ended = true;
        _times[slot] = seconds;
        if (_solo) _soloScore = scoreFor(seconds);
        _after(() => { _game?.destroy(); _game = null; _turn(i + 1); }, 1300);
    };
    _game = createGame(_overlay, {
        level: _level,
        title: `${_solo ? '' : `P${slot + 1} · `}${_level.name.toUpperCase()}`,
        // window.__swrAutoplay: QA only — the human seat plays the solver tape too.
        tape: bot || window.__swrAutoplay ? TAPES[_level.id] : null,
        cardOnWin: false,
        showRetry: false,
        onWin: r => {
            // Bot handicap: the replay is the solver's route; skill sets how much slower it "really" was.
            const s = bot ? +(r.seconds * (1 + (1 - _botSkill) * 0.8) * (0.97 + Solo.draw(100 + slot) * 0.06)).toFixed(2) : r.seconds;
            try { Audio.sfx('mg_win'); } catch (e) {}
            end(s);
        },
    });
    _after(() => end(null), TURN_WALL_MS);   // never finished: DNF
}

function _finish() {
    if (_done) return;
    _done = true;
    const scores = _slots.map(s => scoreFor(_times[s]));
    if (_solo) {
        state.mgActive = false;
        const score = _soloScore;
        _destroy();               // first: the score callback may start the next run straight away
        Solo.soloFinish(score);
        return;
    }
    const top = Math.max(...scores);
    const winners = _slots.filter((s, k) => scores[k] === top);
    const winner = top === 0 || winners.length > 1 ? -1 : winners[0];
    state.mgActive = false;
    const rows = _slots.map(s => `<div style="color:${SEAT_COLOR[s]}">P${s + 1}  ${_times[s] == null ? 'DNF' : _times[s].toFixed(2) + ' s'}</div>`).join('');
    _card(`<div style="font-size:22px;letter-spacing:.12em;color:#3dffa2">${winner < 0 ? 'DRAW' : `P${winner + 1} WINS`}</div><div style="margin-top:10px;line-height:1.7">${rows}</div>`, null, () => {}, null);
    const n = document.getElementById('mg-neutral');
    if (n) n.textContent = winner < 0 ? 'DRAW!' : `P${winner + 1} WINS!`;
    try { Audio.sfx(winner < 0 ? 'land_bad' : 'mg_win'); } catch (e) {}
    _after(() => { _destroy(); _onWin(winner, undefined, scores); }, 1800);
}

function _destroy() {
    _done = true;
    _timers.forEach(clearTimeout); _timers.length = 0;
    try { _game?.destroy(); } catch (e) {}
    _game = null;
    if (_overlay) { _overlay.remove(); _overlay = null; }
}
