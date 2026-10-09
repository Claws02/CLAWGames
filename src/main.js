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
import * as Trophies from './arcade/Trophies.js';
import * as Toast from './arcade/Toast.js';
import * as Party from './arcade/Party.js';
import * as PartyScreens from './arcade/PartyScreens.js';
import { MG_INFO } from './arcade/Catalog.js';
import * as Together from './arcade/Together.js';
import * as Confirm from './arcade/Confirm.js';
import * as Profiles from './arcade/Profiles.js';
import * as PlayersScreen from './arcade/PlayersScreen.js';
import { isHost as Room_isHost } from './net/Room.js';

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
    if (name === 'trophies') _paintTrophies();
    if (name === 'players') PlayersScreen.paintList();
    if (name === 'together') Together.prefill();
}

function openProfile(id) {
    show('player');
    PlayersScreen.paintProfile(id, () => show(_history.pop() || 'home', false));
}

async function back() {
    // Backing out of the room leaves it (a host leaving closes it for everyone).
    if (['room', 'netcard', 'netresult'].includes(_current)) {
        if (Room_isHost() && !(await Confirm.ask('Close the room for everyone?', 'CLOSE IT'))) return;
        Together.leave();
        return goHome();
    }
    // Leaving a party mid-way asks first; it can't be resumed.
    if (Party.party.active && ['standings', 'draft', 'wheel', 'grid'].includes(_current)
        && !(await Confirm.ask('Quit this party? The scores will be lost.', 'QUIT'))) return;
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
    const c = Trophies.count();
    $('home-trophies-n').textContent = `${c.earned} / ${c.total}`;
    $('home-players-n').textContent = Profiles.list().length || '';
    const t = Stats.totals();
    $('home-stats').textContent = t.plays
        ? `🎲 ${t.plays} games played · 🏆 ${t.humanWins} won by humans · 🤖 ${t.botWins} by bots`
        : 'Tap Quick Play to start!';
}

function _paintTrophies() {
    const list = Trophies.all().sort((a, b) => !!b.earned - !!a.earned);
    const c = Trophies.count();
    $('trophy-sum').textContent = c.earned ? `${c.earned} of ${c.total} earned` : 'None yet. Play a game to start earning.';
    $('trophy-list').innerHTML = list.map(t => `
        <div class="trophy${t.earned ? ' got' : ''}">
            <span class="t-ico">${t.icon}</span>
            <span class="t-body"><b class="bfont">${t.name}</b><small>${t.how}</small>
                ${t.earned ? `<em>Earned ${t.earned}</em>`
                           : `<i class="t-bar"><i style="width:${Math.round(t.have / t.goal * 100)}%"></i></i><em>${t.have} / ${t.goal}</em>`}
            </span>
        </div>`).join('');
}

// ---- play ------------------------------------------------------------------
// One entry point for every mode. onDone(winnerId, standings) runs after the
// result has been recorded and toasted.
function play(type, onDone, via = 'quick') {
    const { count, bots, tier } = Seats.seats;
    const table = bots.slice(0, count);
    const who = Seats.table();
    state.botDifficulty = tier;
    Seats.applyToState();
    $('arcade').hidden = true;
    MinigameManager.triggerStandalone(type, table[1], count, {
        bots: table,
        onComplete: (winnerId, standings) => {
            Stats.record(type, winnerId, table, { tier, via });
            Profiles.record(type, winnerId, who, table);
            const won = winnerId < 0 ? null : state.players[winnerId];
            Toast.show(won ? `${table[winnerId] ? '🤖' : '🏆'} ${won.name} wins ${MG_INFO[type].title}!` : '🤝 Draw!',
                won ? SEAT_STYLE[winnerId].hex : null);
            Trophies.announce();
            (onDone || (() => show(_current, false)))(winnerId, standings);
        },
    });
}

// ---- quick play & wheel ----------------------------------------------------------
const MODES = {
    quick: () => { show('grid'); Grid.open(t => play(t)); },
    wheel: () => { show('wheel'); Wheel.open(t => play(t, null, 'wheel')); },
    party: () => { show('party'); PartyScreens.paintSetup(); },
};
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.go;
    // One phone, one player: Play Together has no local seat setup.
    if (mode === 'together') return show('together');
    if (mode === 'trophies' || mode === 'players') return show(mode);
    show('seats');
    Seats.open(() => MODES[mode]());
}));

// ---- party -------------------------------------------------------------------------
function playPartyGame(type, via = 'party') {
    play(type, (winnerId, standings) => {
        Party.record(type, winnerId, standings);
        if (Party.finished()) {
            Stats.recordParty(Party.ranking().some(r => r.place === 0 && !r.bot));
            Trophies.announce(1400);
            show('podium', false); PartyScreens.paintPodium(); return;
        }
        showStandings();
    }, via);
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
        case 'wheel':   show('wheel', false); return Wheel.open(t => playPartyGame(t, 'wheel'), Party.pool);
        case 'draft':   show('draft', false); return PartyScreens.startDraft(playPartyGame);
        case 'pick':    show('grid', false);  return Grid.open(playPartyGame, Party.pool);
    }
}

$('btn-party-start').addEventListener('click', () => { Party.start(); showStandings(); });
$('btn-st-go').addEventListener('click', pickNext);
$('btn-podium-again').addEventListener('click', () => { Party.start(); showStandings(); });
$('btn-podium-home').addEventListener('click', goHome);

// Test hook for qa/: the shell's state, not the game's.
window.__claw = { show, play, seats: Seats.seats, state, party: Party.party, openProfile };

Seats.init();
PlayersScreen.init(openProfile);
Together.init(show, goHome);
// Builds hosted where peer-to-peer connections are blocked set CLAW_NO_P2P:
// Play Together is then shown as app-only rather than failing on tap.
if (window.CLAW_NO_P2P) {
    const b = document.querySelector('.b-online');
    b.disabled = true;
    b.querySelector('.sub').textContent = 'In the phone app';
}
Wheel.init();
show('home', false);
