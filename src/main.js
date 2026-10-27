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
import './games/index.js';   // the arcade's own games, before anything reads the roster
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
import * as Rotation from './arcade/Rotation.js';
import * as Vetoes from './arcade/Vetoes.js';
import { MG_INFO } from './arcade/Catalog.js';
import * as Together from './arcade/Together.js';
import * as Confirm from './arcade/Confirm.js';
import * as Profiles from './arcade/Profiles.js';
import * as PlayersScreen from './arcade/PlayersScreen.js';
import * as Golf from './arcade/Golf.js';
import * as Solo from './arcade/Solo.js';
import * as Store from './arcade/Store.js';
import { lastRound as golfRound } from './claw-core/minigames/MiniGolf.js';
import { faceHTML, portraits } from './arcade/Characters.js';
import { isHost as Room_isHost } from './net/Room.js';
import * as TvHost from './arcade/TvHost.js';
import * as Drinks from './arcade/Drinks.js';

// Quick Play for one: "1" on Quick Play's seats screen (kept between visits).
let _quickSolo = !!Store.load('quickSolo', false);

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
    ['grid-who', 'wheel-who', 'party-who', 'golf-who'].forEach(_paintWho);
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
    // The TV's wheel backs out to the TV room, not out of it.
    if (TvHost.active() && _current === 'wheel') { show('tvroom', false); return TvHost.repaint(); }
    // Backing out of the room leaves it (a host leaving closes it for everyone).
    if (['room', 'netcard', 'netresult', 'tvroom', 'tvround', 'tvresult'].includes(_current)) {
        if (Room_isHost() && !(await Confirm.ask('Close the room for everyone?', 'CLOSE IT'))) return;
        Together.leave();
        TvHost.stop();
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
    const solo = (id === 'golf-who' && Golf.settings().mode === 'solo') || (id === 'grid-who' && _quickSolo);
    const bots = solo ? [false] : Seats.seats.bots, count = solo ? 1 : Seats.seats.count;
    el.innerHTML = SEAT_STYLE.slice(0, count)
        .map((s, i) => `<i style="background:${s.hex}" title="${bots[i] ? 'Bot' : 'Human'}">${bots[i] ? '🤖' : ''}</i>`).join('');
}

function _paintHome() {
    const c = Trophies.count();
    $('home-trophies-n').textContent = `${c.earned} / ${c.total}`;
    $('home-players-n').textContent = Profiles.list().length || '';
    _paintCrew();
    $('home-mode').textContent = Drinks.isOn() ? '🍺 DRINKING MODE · drink responsibly' : '🎉 PARTY MODE';
    $('home-mode').classList.toggle('drinking', Drinks.isOn());
    const t = Stats.totals();
    $('home-stats').textContent = t.plays
        ? `🎲 ${t.plays} games played · 🏆 ${t.humanWins} won by humans · 🤖 ${t.botWins} by bots`
        : 'Tap PARTY to start!';
}

// The crew on the home screen: everyone saved on this phone, tap to edit,
// + to add. Each wears a seat colour by position, as on the Players screen.
function _paintCrew() {
    const host = $('home-crew'), profs = Profiles.list();
    SEAT_STYLE.forEach((s, k) => portraits([...new Set(profs.filter((_, i) => i % 4 === k).map(p => p.char))], s.color));
    host.innerHTML = '';
    profs.forEach((p, i) => {
        const s = SEAT_STYLE[i % SEAT_STYLE.length];
        const b = document.createElement('button');
        b.className = 'crew-face';
        b.dataset.id = p.id;
        b.innerHTML = `<span class="dot" style="background:${s.hex}">${faceHTML(p.char, s.color)}</span><span class="nm"></span>`;
        b.querySelector('.nm').textContent = p.name;
        b.addEventListener('click', () => openProfile(p.id));
        host.appendChild(b);
    });
    const add = document.createElement('button');
    add.className = 'crew-face add';
    add.id = 'btn-crew-add';
    add.innerHTML = `<span class="dot">＋</span><span class="nm">Add</span>`;
    add.addEventListener('click', () => openProfile(Profiles.create('', Profiles.freeChar())));
    host.appendChild(add);
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
function play(type, onDone, via = 'quick', opts = {}) {
    const { bots, tier } = Seats.seats;
    // Solo (Mini Golf only): the first seat alone, against par.
    const count = opts.solo ? 1 : Seats.seats.count;
    const table = opts.solo ? [false] : bots.slice(0, count);
    const who = Seats.table();
    state.botDifficulty = tier;
    Seats.applyToState();
    $('arcade').hidden = true;
    MinigameManager.triggerStandalone(type, table[1], count, {
        bots: table, solo: !!opts.solo,
        onComplete: (winnerId, standings) => {
            Stats.record(type, winnerId, table, { tier, via });
            Rotation.mark(type, count);
            Profiles.record(type, winnerId, who, table);
            // Any round of mini golf — a party's three holes or a full course — goes on the golf record.
            if (type === 'minigolf') {
                const g = Golf.record(golfRound(), table.map((_, i) => state.players[i]?.name || `P${i + 1}`), table);
                if (g?.newBest) setTimeout(() => Toast.show(`⛳ New best on ${g.newBest.holes} holes: ${g.newBest.strokes} by ${g.newBest.name}!`, '#2fd67b'), 1600);
            }
            const won = winnerId < 0 ? null : state.players[winnerId];
            const gr = opts.solo && type === 'minigolf' ? golfRound() : null;
            if (gr?.challenge) {
                Toast.show(gr.success ? `🎯 Trick shot! ${'★'.repeat(gr.stars)}${'☆'.repeat(3 - gr.stars)}` : '🎯 Missed it — have another go', gr.success ? '#2fd67b' : null);
            } else if (gr) {
                const d = gr.toPar[0];
                Toast.show(`⛳ ${gr.totals[0]} strokes · ${d === 0 ? 'level par' : d < 0 ? `${-d} under par` : `${d} over par`}`, SEAT_STYLE[0].hex);
            } else Toast.show(won ? `${table[winnerId] ? '🤖' : '🏆'} ${won.name} wins ${MG_INFO[type].title}!` : '🤝 Draw!',
                won ? SEAT_STYLE[winnerId].hex : null);
            Trophies.announce();
            (onDone || (() => show(_current, false)))(winnerId, standings);
        },
    });
}

// ---- quick play & wheel ----------------------------------------------------------
const MODES = {
    quick: () => { show('grid'); _quickSolo ? openSoloGrid() : openQuickGrid(); },
    wheel: () => { Vetoes.reset(); show('wheel'); openQuickWheel(); },
    party: () => { show('party'); PartyScreens.paintSetup(); },
    golf: () => { show('golf'); paintGolf(); },
};
// Mini Golf: the clubhouse — course, holes, turns or chaos — and back to it after the round.
function paintGolf() {
    const back = () => { show('golf', false); paintGolf(); };
    Golf.paint(() => play('minigolf', back, 'golf', { solo: Golf.settings().mode === 'solo' }), () => _paintWho('golf-who'),
        // A trick shot is played alone, whoever is at the table.
        () => play('minigolf', back, 'golf', { solo: true }));
}
// Quick Play: the grid, with the wheel one tap away (the SPIN chip).
function openQuickGrid() {
    $('btn-grid-spin').hidden = false;
    _paintWho('grid-who');
    Grid.open(t => play(t));
}
// Quick Play for one ("1" on the seats screen): no bots, the high-score table.
function openSoloGrid() {
    $('btn-grid-spin').hidden = true;
    _paintWho('grid-who');
    Grid.open(playSolo, null, { solo: true });
}
function playSolo(type) {
    Seats.applyToState();
    Solo.play(type, Seats.seatName(0), res => {
        show('soloresult');
        Solo.paintResult(res, () => playSolo(type), () => { show('grid', false); openSoloGrid(); });
        if (res.isBest) Toast.show(`🏆 New high score on ${MG_INFO[type].title}!`, '#2fd67b');
    });
}
$('btn-grid-spin').addEventListener('click', () => {
    if (Party.party.active) return;
    Vetoes.reset(); show('wheel'); openQuickWheel();
});

// Back from a wheel game to a freshly dealt wheel: the game just played has
// left the rotation. The session's vetoes carry on.
function openQuickWheel() {
    Wheel.open(t => play(t, () => { show('wheel', false); openQuickWheel(); }, 'wheel'));
}

document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.go;
    // One phone, one player: Play Together has no local seat setup.
    if (mode === 'together') return show('together');
    if (mode === 'trophies' || mode === 'players') return show(mode);
    show('seats');
    // Mini Golf and Quick Play can be played alone: "1" on the seats screen.
    const solo = mode === 'golf' ? { on: Golf.settings().mode === 'solo', set: on => Golf.setMode(on ? 'solo' : 'turns') }
        : mode === 'quick' ? { on: _quickSolo, set: on => { _quickSolo = on; Store.save('quickSolo', on); } }
        : null;
    Seats.open(() => MODES[mode](), solo);
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

const partyMeta = () => `GAME ${Party.party.round + 1} OF ${Party.party.length}` + (Party.finalNext() ? ' · ⚡ x2' : '');

// Shuffle names the next game on the standings card; a veto swaps it.
$('btn-st-veto').addEventListener('click', () => {
    if (!_nextType || !Vetoes.use()) return;
    Party.veto(_nextType);
    _nextType = Party.shuffleNext();
    try { Audio.sfx('land_bad'); Audio.haptic([80]); } catch (e) {}
    PartyScreens.paintStandings(_nextType);
});

function pickNext() {
    switch (Party.party.picker) {
        case 'shuffle': return playPartyGame(_nextType || Party.shuffleNext());
        case 'wheel':   show('wheel', false); return Wheel.open(t => playPartyGame(t, 'wheel'), Party.pool, partyMeta);
        case 'draft':   show('draft', false); return PartyScreens.startDraft(playPartyGame);
        case 'pick':    show('grid', false);  $('btn-grid-spin').hidden = true; return Grid.open(playPartyGame, Party.pool);
    }
}

$('btn-party-start').addEventListener('click', () => { Party.start(); showStandings(); });
$('btn-st-go').addEventListener('click', pickNext);
$('btn-podium-again').addEventListener('click', () => { Party.start(); showStandings(); });
$('btn-podium-home').addEventListener('click', goHome);

// Test hook for qa/: the shell's state, not the game's.
window.__claw = { show, play, seats: Seats.seats, state, party: Party.party, openProfile };

Seats.init();
Golf.init();
PlayersScreen.init(openProfile);
Together.init(show, goHome);
TvHost.init(show, () => _current);
// The Easter egg: five quick taps on the crab flip party mode ⇄ drinking mode.
document.querySelector('.logo-claw').addEventListener('click', () => {
    if (!Drinks.tap()) return;
    try { Audio.sfx(Drinks.isOn() ? 'win' : 'land_bad'); Audio.haptic([60, 40, 60]); } catch (e) {}
    Toast.show(Drinks.isOn() ? '🍺 DRINKING MODE UNLOCKED. Losers drink! Know your limits.' : '🎉 Back to party mode', Drinks.isOn() ? '#ff9f1c' : null);
    _paintHome();
});
// Builds hosted where peer-to-peer connections are blocked set CLAW_NO_P2P:
// Play Together is then shown as app-only rather than failing on tap.
if (window.CLAW_NO_P2P) {
    const b = document.querySelector('.b-online');
    b.disabled = true;
    b.querySelector('.sub').textContent = 'In the phone app';
}
Wheel.init();
PartyScreens.initDraft();
show('home', false);
// A join link from the TV (?join=ABCD) lands on Play Together, code filled in.
if (new URLSearchParams(location.search).get('join')) show('together');
