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

// The same hold, worded for Shut the Box.
MG_ORIENTATIONS.boxtable = {
    ...MG_ORIENTATIONS.dicetable,
    icon: '📦',
    instructions: 'Lay the phone <b>flat on the table</b> between you: <b style="color:#ff3b3b">P1</b> at the <b>bottom</b> end, <b style="color:#3b8eff">P2</b> at the <b>top</b>.<br><br>You each play your <b>whole box</b> in turn, and it <b>turns round to face you</b>: ROLL, then shut one tile, either die or the two added up.',
};

// The rest of the quick board games: the same hold, each in its own words.
const tableHold = (icon, how) => ({
    ...MG_ORIENTATIONS.dicetable, icon,
    instructions: `Lay the phone <b>flat on the table</b> between you: <b style="color:#ff3b3b">P1</b> at the <b>bottom</b> end, <b style="color:#3b8eff">P2</b> at the <b>top</b>.<br><br>${how}`,
});
MG_ORIENTATIONS.pigtable = tableHold('🐷', 'You take it in <b>turns</b>, and it <b>turns round to face you</b>. ROLL as often as you dare (a <b>1</b> loses this turn\'s points), then HOLD to bank them. First to <b>100</b>.');
MG_ORIENTATIONS.dotstable = tableHold('✏️', 'You take it in <b>turns</b>, and it <b>turns round to face you</b>. Tap between two dots to draw a line; close a box to claim it and <b>go again</b>.');
MG_ORIENTATIONS.mancalatable = tableHold('🫘', 'Your pits are the <b>near row</b>, your store on your <b>right</b>, and it <b>turns round to face you</b>. Tap a pit to sow its seeds round to the right.');
MG_ORIENTATIONS.liartable = tableHold('🤥', 'Your dice hide under your cup: on your go, <b>hold the cup to peek</b> while the other player looks away. Bid how many of a face are on the table, or call <b>LIAR!</b>');

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
    trivia: {
        ...PHONE,
        load: () => import('./Trivia.js'),
        info: { icon: '❓', title: 'TRIVIA', desc: 'Ten general-knowledge questions, four answers each, ten seconds a question. A right answer scores 100, plus up to 100 more for answering fast.' },
        netInfo: 'Ten questions, the same on every phone: Massachusetts, science, geography, history, TV, music, sport and food. Four answers, ten seconds each. A right answer scores 100, plus up to 100 more the faster you are. Highest total wins.',
        // Ten questions at up to ~12 s each: past the 90 s default round.
        watchdogMs: 160000, soloMs: 150000,
        profile: { genre: 'brain', control: 'tap', wire: 'none', seats: [2, 4], live: false },
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
    shutbox: {
        load: () => import('./ShutTheBox.js'),
        info: { icon: '📦', title: 'SHUT THE BOX', desc: 'A box of tiles 1 to 12 each. Roll two dice and shut ONE tile: either die\'s number, or the two added up (a 3 and a 4 shuts the 3, the 4 or the 7). When all three are already shut, you\'re stuck. Play your whole box, then the other player tries to beat it. Most tiles shut wins.' },
        orientation: 'boxtable',
        // No clock: each roll pushes the watchdog on (extendWatchdog).
        watchdogMs: 180000,
        net: 'local',
        shape: 'table',
        profile: { genre: 'brain', control: 'tap', wire: 'exact', seats: [2, 2], live: false },
    },
    pig: {
        load: () => import('./Pig.js'),
        info: { icon: '🐷', title: 'PIG', desc: 'Push your luck. On your go, roll one die as often as you dare: every roll adds to this turn\'s points, but roll a 1 and you lose them all and your go ends. HOLD to bank what you have. First to 100 wins.' },
        orientation: 'pigtable',
        watchdogMs: 180000,
        net: 'local',
        shape: 'table',
        profile: { genre: 'brain', control: 'tap', wire: 'exact', seats: [2, 2], live: false },
    },
    dotsboxes: {
        load: () => import('./DotsBoxes.js'),
        info: { icon: '✏️', title: 'DOTS AND BOXES', desc: 'Take turns drawing a line between two dots. Close the fourth side of a box to claim it, and go again. When every line is drawn, most boxes wins.' },
        orientation: 'dotstable',
        watchdogMs: 180000,
        net: 'local',
        shape: 'table',
        profile: { genre: 'brain', control: 'tap', wire: 'exact', seats: [2, 2], live: false },
    },
    mancala: {
        load: () => import('./Mancala.js'),
        info: { icon: '🫘', title: 'MANCALA', desc: 'Pick up the seeds in one of your pits and sow them one by one round to the right, into your store too. Last seed in your store: go again. Last seed in an empty pit on your side: capture it and everything opposite. When a side runs out, most seeds in the store wins.' },
        orientation: 'mancalatable',
        watchdogMs: 180000,
        net: 'local',
        shape: 'table',
        profile: { genre: 'brain', control: 'tap', wire: 'exact', seats: [2, 2], live: false },
    },
    liarsdice: {
        load: () => import('./LiarsDice.js'),
        info: { icon: '🤥', title: "LIAR'S DICE", desc: 'Five dice each, hidden under your cup. Bid how many of one face are on the whole table (yours and theirs): each bid must go up. Or call LIAR! and the cups come off: whoever was wrong loses a die. Lose all five and you are out.' },
        orientation: 'liartable',
        watchdogMs: 180000,
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

// Games you can REMEMBER: pass the phone plays the same seed in turn, so the
// second player on a shared phone has watched the first one's answers. Rooms
// keep these off SURPRISE ME and the TV's wheel while a phone is shared
// (Together.fairPool). Flagged here, not in claw-core, so HundredBlockDash is
// untouched; a missing game is skipped.
for (const type of [
    'trivia',        // the same ten questions, the right answers lit up
    'higherlower',   // the same deck, in the same order
    'stopclock',     // the same five target times
    'shellgame',     // the same shuffles
    'balloonpump',   // the same hidden pop limits
]) if (MG_INFO[type]) MG_INFO[type].memorable = true;
