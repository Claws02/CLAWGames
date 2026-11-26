// ============================================================
// SPARKWRIGHT RULES — every tunable the engine, solver and lint share.
//
// Pure data. Changing a number here changes what every level's checker
// proves, so run `node tools/check.mjs` after any edit.
//
// Units: the grid is in TILES (1 tile = 1 m for device maths, see SI).
// Player feel (gravity, jump) is game-tuned, not real — a platformer
// engineer jumps 2.5 m. Devices are honest: they compute their result in
// SI and the engine maps the RESULT (a height, a speed, a current) into the
// world. See docs/DESIGN.md "Honest devices, stylised hero".
// ============================================================

export const DT = 1 / 60;                 // fixed step, seconds — never frame-rate

export const P = {
    W: 0.7, H: 0.9,                        // player box, tiles
    G: 38,                                 // game gravity, tiles/s²
    JUMP_V: 14,                            // apex ≈ JUMP_V²/(2G) = 2.58 tiles
    JUMP_CUT: 5,                           // release jump early → vy capped here
    MAX_FALL: 18,
    RUN: 6.5,                              // tiles/s
    ACC_GROUND: 70, ACC_AIR: 45, FRICTION: 70,
    COYOTE: 6, BUFFER: 6,                  // frames
    CLIMB: 4.5,                            // ladder speed, tiles/s
    LADDER_JUMP: 0.8,                      // jump-off-ladder fraction of JUMP_V
};

/** Derived limits the lint and the level brief use. Keep in sync with P. */
export const LIMITS = {
    JUMP_HEIGHT: (P.JUMP_V * P.JUMP_V) / (2 * P.G),   // 2.58 tiles (feet rise)
    // Max ledge the hero can climb onto by jumping: feet must clear the top.
    MAX_STEP_UP: 2,
    MAX_GAP: 4,                                        // tiles, running jump
};

export const SI = {
    g: 9.81,           // m/s² — devices use real gravity
    TILE_M: 1,         // 1 tile = 1 m for device outcomes
    HERO_KG: 80,       // the engineer (plus tools)
};

// Tile alphabet for level maps. Anything else is a lint error.
export const TILE = {
    EMPTY: '.', SOLID: '#', ONEWAY: '=', SPIKES: '^', SPIKES_DOWN: 'v', LADDER: 'H', START: 'S', GOAL: 'G',
};
export const TILE_CHARS = new Set(Object.values(TILE));

// Part kinds and the fields each must carry (lint checks types and ranges).
export const PART_KINDS = {
    spring:   { k: [1000, 1e6] },                     // N/m
    gear:     { ratio: [1, 1000], eff: [0.3, 1] },    // n:1 reduction, efficiency
    resistor: { ohms: [0, 1e6] },                     // Ω (0 = jumper wire)
    battery:  { volts: [0.5, 100] },                  // V
};

// What each socket kind accepts.
export const SOCKET_ACCEPTS = { spring: 'spring', gear: 'gear', resistor: 'resistor', battery: 'battery' };

// Teaching order. A level may only REQUIRE concepts taught at a lower
// `order`. Lint enforces it (layer 6).
export const CONCEPTS = [
    { id: 'move',      title: 'Run & jump' },
    { id: 'ladder',    title: 'Ladders' },
    { id: 'spring',    title: 'Spring energy  (h = k·x² / 2mg)' },
    { id: 'torque',    title: 'Gear ratio: torque vs speed' },
    { id: 'ohm',       title: "Ohm's law  (I = V / R)" },
    { id: 'fuse',      title: 'Fuses & current limits' },
    { id: 'series',    title: 'Series resistance' },
    { id: 'voltage',   title: 'Choosing a supply voltage' },
];

export const FUSE_RESET_FRAMES = 90;      // blown fuse ejects the part, resets after 1.5 s
export const LIFT_RETURN_V = 2.5;         // unloaded lift drifts down, tiles/s
