// ============================================================
// ARCADE STATE — the `state` object claw-core reads and writes.
//
// The core touches a small, known set of fields (see AppHost.js and
// docs/DESIGN.md §6); this provides those and nothing from the board game.
// ============================================================

export const SEAT_STYLE = [
    { name: 'Red',    color: 0xff4d6d, hex: '#ff4d6d', charType: 'slime' },
    { name: 'Blue',   color: 0x3b9dff, hex: '#3b9dff', charType: 'boxy'  },
    { name: 'Green',  color: 0x2fd67b, hex: '#2fd67b', charType: 'bunny' },
    { name: 'Yellow', color: 0xffc928, hex: '#ffc928', charType: 'ghost' },
];
export const MIN_SEATS = 2, MAX_SEATS = 4;

export function makePlayer(id) {
    const s = SEAT_STYLE[id] || SEAT_STYLE[0];
    // coins/mgWins exist because shared scoreboard code reads them.
    return { id, name: s.name, color: s.color, hex: s.hex, charType: s.charType,
             isBot: false, coins: 0, coinsEarned: 0, mgWins: 0 };
}

export const state = {
    playStyle:          'arcade',
    botDifficulty:      'medium',
    gameState:          'INIT',
    cameraState:        'INIT',
    currentRound:       0,
    players:            [makePlayer(0), makePlayer(1)],
    mgActive:           false,
    mgType:             null,
    mgLastType:         null,
    mgBag:              [],
    mgReady:            [false, false],
    mgDevice:           null,
    lastMinigameWinner: null,
    lastMinigameTied:   false,
};

export function playerCount() { return state.players.length; }

export function setPlayerCount(n) {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, n | 0));
    const kept = state.players.slice(0, count);
    while (kept.length < count) kept.push(makePlayer(kept.length));
    state.players = kept;
    state.mgReady = kept.map(() => false);
    return count;
}
