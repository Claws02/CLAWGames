// ============================================================
// CLAW GAMES — arcade shell entry.
//
// Screens: home → seats → (grid | wheel) → game → back where you came from.
// A game is run by claw-core's MinigameManager exactly as HundredBlockDash's
// own arcade runs it (triggerStandalone), with the table from Seats.
// ============================================================
import * as MinigameManager from './claw-core/minigames/MinigameManager.js';
import * as Audio from './claw-core/engine/AudioManager.js';
import { state } from './host/ArcadeState.js';
import * as Seats from './arcade/Seats.js';
import * as Grid from './arcade/Grid.js';
import * as Wheel from './arcade/Wheel.js';
import * as Stats from './arcade/Stats.js';
import * as Toast from './arcade/Toast.js';
import { MG_INFO } from './arcade/Catalog.js';
import { SEAT_STYLE } from './host/ArcadeState.js';

MinigameManager.init(null);
Audio.setMusicGate(() => !state.mgActive);

// ---- screen router ---------------------------------------------------------
const _history = [];
let _current = 'home';

function show(name, push = true) {
    if (push && _current !== name) _history.push(_current);
    _current = name;
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
    document.getElementById('arcade').hidden = false;
    if (name === 'home') _paintHome();
    if (name === 'grid') { _paintWho('grid-who'); Grid.open(play); }
    if (name === 'wheel') { _paintWho('wheel-who'); Wheel.open(play); }
}
function back() { show(_history.pop() || 'home', false); }

document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', back));

// Home buttons go through seat setup first, then on to their mode.
let _mode = 'grid';
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    _mode = b.dataset.go === 'wheel' ? 'wheel' : 'grid';
    show('seats');
    Seats.open(() => show(_mode));
}));

function _paintWho(id) {
    const el = document.getElementById(id);
    const { count, bots } = Seats.seats;
    el.innerHTML = SEAT_STYLE.slice(0, count)
        .map((s, i) => `<i style="background:${s.hex}" title="${bots[i] ? 'Bot' : 'Human'}">${bots[i] ? '🤖' : ''}</i>`).join('');
}

function _paintHome() {
    const t = Stats.totals();
    document.getElementById('home-stats').textContent = t.plays
        ? `🎲 ${t.plays} games played · 🏆 ${t.humanWins} won by humans · 🤖 ${t.botWins} by bots`
        : 'Tap Quick Play to start!';
}

// ---- play ------------------------------------------------------------------
function play(type) {
    const { count, bots, tier } = Seats.seats;
    const table = bots.slice(0, count);
    state.botDifficulty = tier;
    document.getElementById('arcade').hidden = true;
    MinigameManager.triggerStandalone(type, table[1], count, {
        bots: table,
        onComplete: winnerId => {
            Stats.record(type, winnerId, table);
            const who = winnerId < 0 ? null : state.players[winnerId];
            Toast.show(who ? `${table[winnerId] ? '🤖' : '🏆'} ${who.name} wins ${MG_INFO[type].title}!` : '🤝 Draw!',
                who ? SEAT_STYLE[winnerId].hex : null);
            show(_current, false);
        },
    });
}

// Test hook for qa/: the shell's state, not the game's.
window.__claw = { show, play, seats: Seats.seats, state };

Seats.init();
Wheel.init();
show('home', false);
