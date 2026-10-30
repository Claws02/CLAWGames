// ============================================================
// CLAWGames' OWN GAMES — the ones HundredBlockDash doesn't get.
//
// claw-core's registry tables are the roster both apps read. A game that
// belongs to the arcade alone adds its rows here, at startup, and hands its
// file to MinigameManager.registerMinigame. Nothing in claw-core changes, so
// HundredBlockDash never deals it. docs/ADDING_A_GAME.md is the checklist.
//
// Imported first thing in main.js, before any screen reads the roster.
// ============================================================
import {
    MG_TYPES, MG_INFO, MG_ORIENTATIONS, MG_ORIENTATION_MAP, MG_WATCHDOG_MS,
    MG_NET, MG_SHAPE, MG_PROFILE, MG_PARALLEL, MG_NET_INFO, MG_SOLO_MS,
} from '../claw-core/config/MinigameRegistry.js';
// A namespace import, not a named one: if a phone serves this file fresh and an
// older claw-core from its cache (Pages caches for 10 minutes), a missing
// named export would stop the whole app loading. This way the arcade still
// boots, just without its own games until the cache catches up.
import * as MinigameManager from '../claw-core/minigames/MinigameManager.js';

// The tabletop hold, worded for dice rather than golf balls.
MG_ORIENTATIONS.dicetable = {
    name: 'TABLETOP',
    subtitle: 'Lay it flat between you — it turns to whoever\'s up',
    huddle: false,
    upright: true,
    table: true,
    icon: '🎲',
    instructions: 'Lay the phone <b>flat on the table</b> between you: <b style="color:#ff3b3b">P1</b> at the <b>bottom</b> end, <b style="color:#3b8eff">P2</b> at the <b>top</b>.<br><br>You take it in <b>turns</b>. On your go the card <b>turns round to face you</b>: roll up to three times, tap dice to hold them, then pick a box and press <b>PLAY</b>.',
    thumbAnim: 'pulse',
};

// The same hold, worded for stacking.
MG_ORIENTATIONS.stacktable = {
    ...MG_ORIENTATIONS.dicetable,
    icon: '🐘',
    instructions: 'Lay the phone <b>flat on the table</b> between you: <b style="color:#ff3b3b">P1</b> at the <b>bottom</b> end, <b style="color:#3b8eff">P2</b> at the <b>top</b>.<br><br>You take it in <b>turns</b>. On your go the picture <b>turns round to face you</b>: drag to move the animal, <b>ROTATE</b> to turn it, <b>DROP</b> to let go.',
};

// Online only: played alone on every phone for a score (claw-core's
// SoloArena), so a room seats up to twelve. `onlineOnly` keeps them off the
// shared-screen grid, wheel and parties (Catalog.allTypes); Quick Play for
// one still has them.
const PHONE = { orientation: 'faceoff', net: 'parallel', shape: 'split', onlineOnly: true };

const GAMES = {
    stopclock: {
        ...PHONE,
        load: () => import('./StopClock.js'),
        info: { icon: '⏱️', title: 'STOP THE CLOCK', desc: 'Five target times. The clock starts, counts up for a second or so, then goes dark: tap STOP when you think the target has come round. The closer, the more points.' },
        netInfo: 'Five target times, the same on every phone. The clock counts up, then goes dark: tap STOP when you think the target has come round. 1000 points a round, minus a point for every 0.002 s you are off. Closest overall wins.',
        watchdogMs: 90000,
        profile: { genre: 'nerve', control: 'tap', wire: 'none', seats: [2, 4], live: false },
    },
    higherlower: {
        ...PHONE,
        load: () => import('./HigherLower.js'),
        info: { icon: '🃏', title: 'HIGHER OR LOWER', desc: 'One card face up: is the next one higher or lower? Aces high, the same rank is a free pass, six seconds a call. Keep going until you call it wrong.' },
        netInfo: 'The same deck on every phone. Is the next card HIGHER or LOWER? Aces high, the same rank is a free pass, and you get six seconds a call. One wrong call and you are out: 10 points a right call, plus a bonus for calling fast. Longest run wins.',
        watchdogMs: 150000, soloMs: 150000,
        profile: { genre: 'brain', control: 'tap', wire: 'none', seats: [2, 4], live: false },
    },
    yatzy: {
        load: () => import('./Yatzy.js'),
        info: { icon: '🎲', title: 'YATZY', desc: 'The full 13-box card. On your turn roll up to three times, tapping dice to hold the ones you want. Every open box in your column shows what it would score, so pick one and press PLAY. Score 63 or more in the top half for a +35 bonus. Highest total when both cards are full wins.' },
        orientation: 'dicetable',
        // No clock. Each turn pushes the watchdog on (extendWatchdog), so this
        // only has to cover the first turn.
        watchdogMs: 300000,
        net: 'local',
        shape: 'table',
        profile: { genre: 'brain', control: 'tap', wire: 'exact', seats: [2, 2], live: false },
    },
    pinball: {
        load: () => import('./Pinball.js'),
        info: { icon: '🕹️', title: 'CLAW PINBALL', desc: 'A claw-machine pinball table each, on your own half. Hold the left or right side to flip; flick up to nudge (three in a row TILTs). 120 seconds, highest score wins, and a drained ball is back in a second (your multiplier resets). Spell C-L-A-W in the top lanes to raise your multiplier. Clear the orange targets to light LOCK and send the other player an attack. With LOCK lit, the ramp feeds the claw: two prizes locked starts MULTIBALL, with jackpots on the ramp. The scoop starts missions; finish three for CLAW CRAZE.' },
        orientation: 'faceoff',
        // A 120 s clock of its own, plus the result: past the manager's 90 s default.
        watchdogMs: 150000,
        // Attacks cross between the tables, so it is one simulation.
        net: 'local',
        shape: 'split',
        profile: { genre: 'scramble', control: 'tap', wire: 'events', seats: [2, 2], live: false },
    },
    animalstack: {
        load: () => import('./AnimalStack.js'),
        info: { icon: '🐘', title: 'ANIMAL STACK', desc: 'One wobbly pile of animals on a tiny island, taken in turns. On your go the CLAW crane holds an animal over the pile: drag to move it, ROTATE to turn it, DROP to let go. If anything falls into the sea, whoever dropped last loses. Twenty seconds a turn, then the claw lets go wherever it is.' },
        orientation: 'stacktable',
        // No match clock: each turn pushes the watchdog on (extendWatchdog).
        watchdogMs: 120000,
        net: 'local',
        shape: 'table',
        profile: { genre: 'nerve', control: 'thumb', wire: 'snapshot', seats: [2, 2], live: false },
    },
};

for (const [type, g] of Object.entries(GAMES)) {
    if (typeof MinigameManager.registerMinigame !== 'function') break;
    if (!MG_TYPES.includes(type)) MG_TYPES.push(type);
    MG_INFO[type] = g.info;
    MG_ORIENTATION_MAP[type] = g.orientation;
    MG_WATCHDOG_MS[type] = g.watchdogMs;
    MG_NET[type] = g.net;
    MG_SHAPE[type] = g.shape;
    MG_PROFILE[type] = g.profile;
    if (g.onlineOnly) MG_INFO[type].onlineOnly = true;
    if (g.netInfo) MG_NET_INFO[type] = g.netInfo;
    if (g.soloMs) MG_SOLO_MS[type] = g.soloMs;
    // claw-core lists its parallel games once, at load; ours join afterwards.
    if (g.net === 'parallel' && !MG_PARALLEL.includes(type)) MG_PARALLEL.push(type);
    MinigameManager.registerMinigame(type, g.load);
}
