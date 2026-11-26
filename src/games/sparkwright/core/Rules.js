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
// Every part also carries mass (kg — the hero carries the tray, so it changes
// how high a spring throws you) and cost ($ — the work order's budget).
export const PART_KINDS = {
    spring:   { k: [1000, 1e6] },                                   // N/m. Springs in one bench act in parallel: k adds
    motor:    { torque: [0.1, 100], rpm: [100, 50000] },            // N·m at the shaft, no-load-ish speed
    gear:     { ratio: [1, 1000], eff: [0.3, 1], maxTorque: [1, 1e5] },   // n:1 reduction; output torque rating (N·m) — over it, the teeth strip
    resistor: { ohms: [0, 1e6], watts: [0.05, 1000] },              // Ω (0 = jumper wire); power rating — over it, it burns
    fuse:     { amps: [0.05, 100] },                                // blows above this current
    battery:  { volts: [0.5, 100] },                                // V
};
export const PART_COMMON = { mass: [0, 100], cost: [0, 10000] };

// Bench slot kinds (what a slot accepts) — the same names as part kinds.
export const SOCKET_ACCEPTS = { spring: 'spring', motor: 'motor', gear: 'gear', resistor: 'resistor', fuse: 'fuse', battery: 'battery' };

// Teaching order. A level may only REQUIRE concepts taught at a lower
// `order`. Lint enforces it (layer 6).
export const CONCEPTS = [
    { id: 'move',     title: 'Run & jump',          formula: '',                          note: 'Your jump clears about 2.5 m. Anything higher needs a machine.' },
    { id: 'ladder',   title: 'Ladders',             formula: '',                          note: 'Hold ▲ or ▼ on a ladder to climb; JUMP lets go.' },
    { id: 'spring',   title: 'Spring energy',       formula: 'h = k·x² / (2·m·g)',        note: 'A compressed spring stores ½·k·x². All of it becomes height m·g·h. Stiffer spring, higher throw; heavier load, lower throw — the parts you carry count.' },
    { id: 'parallel', title: 'Springs in parallel', formula: 'k = k₁ + k₂',               note: 'Two springs pushing side by side add their stiffness. Two cheap springs can do the job of one expensive one.' },
    { id: 'torque',   title: 'Gear ratio',          formula: 'τ_out = τ·n·η    v = ω·r / n', note: 'A gearbox multiplies torque by its ratio n and divides speed by n. A stronger motor needs less reduction, so it can go faster.' },
    { id: 'ratings',  title: 'Ratings & margin',    formula: 'load ≤ rating',             note: 'Every part has a limit. A gearbox rated 180 N·m strips its teeth at 196. Engineers pick parts with margin above the worst case.' },
    { id: 'ohm',      title: "Ohm's law",           formula: 'I = V / R',                 note: 'Current is voltage pushed through resistance. More resistance, less current. Every load has a current it needs to run.' },
    { id: 'power',    title: 'Power in a resistor', formula: 'P = I²·R',                  note: 'A resistor turns current into heat. Too much power for its rating and it burns: the same 10 Ω comes in a tiny 0.25 W body and a chunky 5 W one.' },
    { id: 'fuse',     title: 'Fuses',               formula: 'I_run < I_fuse ≤ I_damage', note: 'A fuse is a deliberate weak link. Pick it above the running current and below what would damage the load, and it saves the load instead of the load burning.' },
    { id: 'series',   title: 'Series resistance',   formula: 'R = R₁ + R₂ + …',           note: 'Resistors in one line add up. The same current flows through all of them, so each must handle its own I²R.' },
    { id: 'voltage',  title: 'Choosing a supply',   formula: 'I = V / (R_load + R)',      note: 'The supply and the resistor work together: a bigger battery needs more resistance to land the same current.' },
];

export const FUSE_RESET_FRAMES = 90;      // a failure (fuse, burn, strip) ejects the parts; the device resets after 1.5 s
export const LIFT_RETURN_V = 2.5;         // unloaded lift drifts down, tiles/s
