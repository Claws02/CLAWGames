// ============================================================
// APP HOST — CLAWGames' side of the claw-core contract.
//
// claw-core's files import exactly these names from src/AppHost.js. In
// HundredBlockDash they are the board game's real modules; here they are the
// arcade's, and most are deliberately small: the arcade has no board, no
// economy and no tabletop mirror mode.
// ============================================================

import { state, playerCount, setPlayerCount } from './host/ArcadeState.js';
import { skillFor } from './host/BotTiers.js';
import * as Toast from './arcade/Toast.js';
export { DISTRICT_BIOMES, HBD_BIOMES } from './host/biomes.js';
export { state, playerCount, setPlayerCount };

// The bot opponents. The core asks one question of them: how good are they.
export const Bot = { skill: () => skillFor(state.botDifficulty) };

// Tabletop mirror mode (both ends of a phone lying flat) is a HundredBlockDash
// feature the arcade does not offer yet, so every card is shown once, upright.
export const DualRead = {
    isMirrorMode: () => false,
    pressedSide: () => 0,
    present: () => false,
    refresh() {}, clearAll() {}, unmirror() {},
};

// The arcade has no coins on screen; results toast instead.
export const loadUIManager = () => Promise.resolve({
    animateCoinDisplay() {}, updateUI() {},
    toast: (msg, color) => Toast.show(msg, color),
});

// Stage scenery borrowed from the board's renderer. Not available outside
// HundredBlockDash yet: every prop is an empty group, so stages render their
// floor, lights and players without the roadside dressing.
export const PROP_KIT = new Proxy({}, { get: () => () => new THREE.Group() });

// There is no board render loop to pause while a 3D stage owns the GPU.
export function setBoardPaused() {}

// Payouts are only read on the board path; the arcade keeps its own tally.
export const MINIGAME_REWARD = 0;
export const MINIGAME_PLACE_COINS = { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] };
