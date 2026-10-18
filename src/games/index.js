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
    MG_NET, MG_SHAPE, MG_PROFILE,
} from '../claw-core/config/MinigameRegistry.js';
import { registerMinigame } from '../claw-core/minigames/MinigameManager.js';

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

const GAMES = {
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
};

for (const [type, g] of Object.entries(GAMES)) {
    if (!MG_TYPES.includes(type)) MG_TYPES.push(type);
    MG_INFO[type] = g.info;
    MG_ORIENTATION_MAP[type] = g.orientation;
    MG_WATCHDOG_MS[type] = g.watchdogMs;
    MG_NET[type] = g.net;
    MG_SHAPE[type] = g.shape;
    MG_PROFILE[type] = g.profile;
    registerMinigame(type, g.load);
}
