// ============================================================
// CLAW GAMES — arcade shell entry.
//
// Home → seats → a mode:
//   Quick Play  grid → game → back to grid
//   Wheel       wheel → game → back to wheel
//   Party       setup → (pick → game → standings) × N → podium
// Every game runs through claw-core's MinigameManager.triggerStandalone,
// exactly as HundredBlockDash's own arcade runs it, with the table from Seats.
// ============================================================
import * as MinigameManager from './claw-core/minigames/MinigameManager.js';
import * as Audio from './claw-core/engine/AudioManager.js';
import { state, SEAT_STYLE } from './host/ArcadeState.js';
import * as Seats from './arcade/Seats.js';
import * as Grid from './arcade/Grid.js';
import * as Wheel from './arcade/Wheel.js';
import * as Stats from './arcade/Stats.js';
import * as Toast from './arcade/Toast.js';
import * as Party from './arcade/Party.js';
import * as PartyScreens from './arcade/PartyScreens.js';
import { MG_INFO } from './arcade/Catalog.js';

MinigameManager.init(null);
Audio.setMusicGate(() => !state.mgActive);

const $ = id => document.getElementById(id);

// ---- screen router ---------------------------------------------------------
const _history = [];
let _current = 'home';

function show(name, push = true) {
    if (push && _current !== name) _history.push(_current);
    _current = name;
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
    $('arcade').hidden = false;
    ['grid-who', 'wheel-who', 'party-who'].forEach(_paintWho);
    if (name === 'home') _paintHome();
}

function back() {
    // Leaving a party mid-way asks first; it can't be resumed.
    if (Party.party.active && ['standings', 'draft', 'wheel', 'grid'].includes(_current)
        && !confirm('Quit this party? The scores will be lost.')) return;
    if (Party.party.active && _current !== 'party') { Party.party.active = false; return goHome(); }
    show(_history.pop() || 'home', false);
}
function goHome() { _history.length = 0; show('home', false); }

document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', back));

function _paintWho(id) {
    const el = $(id);
    if (!el) return;
    const { count, bots } = Seats.seats;
    el.innerHTML = SEAT_STYLE.slice(0, count)
        .map((s, i) => `<i style="background:${s.hex}" title="${bots[i] ? 'Bot' : 'Human'}">${bots[i] ? '🤖' : ''}</i>`).join('');
}

function _paintHome() {
    const t = Stats.totals();
    $('home-stats').textContent = t.plays
        ? `🎲 ${t.plays} games played · 🏆 ${t.humanWins} won by humans · 🤖 ${t.botWins} by bots`
        : 'Tap Quick Play to start!';
}

// ---- play ------------------------------------------------------------------
// One entry point for every mode. onDone(winnerId, standings) runs after the
// result has been recorded and toasted.
function play(type, onDone) {
    const { count, bots, tier } = Seats.seats;
    const table = bots.slice(0, count);
    state.botDifficulty = tier;
    $('arcade').hidden = true;
    MinigameManager.triggerStandalone(type, table[1], count, {
        bots: table,
        onComplete: (winnerId, standings) => {
            Stats.record(type, winnerId, table);
            const who = winnerId < 0 ? null : state.players[winnerId];
            Toast.show(who ? `${table[winnerId] ? '🤖' : '🏆'} ${who.name} wins ${MG_INFO[type].title}!` : '🤝 Draw!',
                who ? SEAT_STYLE[winnerId].hex : null);
            (onDone || (() => show(_current, false)))(winnerId, standings);
        },
    });
}

// ---- quick play & wheel ----------------------------------------------------------
const MODES = {
    quick: () => { show('grid'); Grid.open(t => play(t)); },
    wheel: () => { show('wheel'); Wheel.open(t => play(t)); },
    party: () => { show('party'); PartyScreens.paintSetup(); },
};
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.go;
    show('seats');
    Seats.open(() => MODES[mode]());
}));

// ---- party -------------------------------------------------------------------------
function playPartyGame(type) {
    play(type, (winnerId, standings) => {
        Party.record(type, winnerId, standings);
        if (Party.finished()) { show('podium', false); PartyScreens.paintPodium(); return; }
        showStandings();
    });
}

// Shuffle names the next game on the standings card; the others choose it
// after the player taps on.
let _nextType = null;
function showStandings() {
    _nextType = Party.party.picker === 'shuffle' ? Party.shuffleNext() : null;
    show('standings', false);
    PartyScreens.paintStandings(_nextType);
}

function pickNext() {
    switch (Party.party.picker) {
        case 'shuffle': return playPartyGame(_nextType || Party.shuffleNext());
        case 'wheel':   show('wheel', false); return Wheel.open(playPartyGame, Party.pool);
        case 'draft':   show('draft', false); return PartyScreens.startDraft(playPartyGame);
        case 'pick':    show('grid', false);  return Grid.open(playPartyGame, Party.pool);
    }
}

$('btn-party-start').addEventListener('click', () => { Party.start(); showStandings(); });
$('btn-st-go').addEventListener('click', pickNext);
$('btn-podium-again').addEventListener('click', () => { Party.start(); showStandings(); });
$('btn-podium-home').addEventListener('click', goHome);

// Test hook for qa/: the shell's state, not the game's.
window.__claw = { show, play, seats: Seats.seats, state, party: Party.party };

Seats.init();
Wheel.init();
show('home', false);
