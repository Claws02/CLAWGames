// ============================================================
// PLAYROOM PARKOUR RULES — every tunable the engine, solver and checker share.
//
// Pure data. Changing a number here changes what the checker proves, so run
// `node src/games/parkour/tools/check.mjs` after any edit.
//
// Units: TILES (x right, y DOWN) and seconds. The feel is game-tuned, not
// real: physics you can feel, never a number you have to work out.
// ============================================================

export const DT = 1 / 60;                 // fixed step, seconds: never frame-rate

// The hero: run, jump, fall.
export const P = {
    W: 0.7, H: 0.9,                        // hero box, tiles
    G: 38,                                 // gravity, tiles/s²
    JUMP_V: 14,                            // apex ≈ JUMP_V²/(2G) ≈ 2.6 tiles
    JUMP_CUT: 5,                           // let go of JUMP early → a short hop
    MAX_FALL: 18,
    RUN: 6.5,                              // tiles/s
    ACC_GROUND: 70, ACC_AIR: 45, FRICTION: 70,
    AIR_DRAG: 4,                           // faster than a run in the air (a launch) fades at this rate
    COYOTE: 6, BUFFER: 6,                  // frames
    CLIMB: 4.5, LADDER_JUMP: 0.8,
};

// Bounce & launch
export const BOUNCE = {
    KEEP: 0.85,                            // a sponge gives back this share of your landing speed…
    MIN: 13,                               // …but always at least this (a small hop: ≈ 2.2 tiles)
    HELD: 5,                               // + this if JUMP is held as you land
    MAX: 26,
    SPRING_V: 23,                          // jack-in-the-box: ≈ 7 tiles straight up (power scales it)
    CANNON_V: 17,                          // toy cannon muzzle speed (power scales it)
    CANNON_HOLD: 12,                       // frames inside before JUMP fires
};

// Slippery & pushy
export const SLIP = {
    ICE_ACC: 9, ICE_FRICTION: 2.5,         // the slick tabletop: slow to start, slow to stop
    CONVEYOR: 3.5,                         // belt speed, tiles/s
    FAN_MAX: 11,                           // fans can't push faster than this
    MAGNET_MAX: 12,
};

// Swing & ride
export const SWING = {
    GRAB: 0.6,                             // reach to catch a yo-yo, tiles from its handle
    PUMP: 7,                               // ◀ ▶ on a swing pushes this hard (tiles/s² along the swing)
    DAMP: 0.08,                            // swings slowly lose speed
    LET_GO_UP: 4,                          // JUMP off a swing adds this much lift
    REGRAB: 18,                            // frames before you can catch a swing again
    CRUMBLE_SHAKE: 24,                     // frames standing on an ABC block before it falls
    CRUMBLE_BACK: 150,                     // frames before it's back
    SEESAW_PUSH: 2.2,                      // how hard your weight tips a seesaw (slope/s² per tile from the pivot)
    SEESAW_RETURN: 1.2, SEESAW_DAMP: 2.5,
    SEESAW_MAX: 0.7,                       // steepest slope
};

// Gravity tricks
export const GRAV = {
    LOW: 0.32,                             // balloon zone: gravity × this…
    LOW_JUMP: 0.68,                        // …jump × this (higher, floatier: ≈ 3.5 tiles)
    LOW_FALL: 6,
    WATER: 0.22,                           // in the fish tank: sink at gravity × this
    WATER_FALL: 3.2, WATER_RUN: 0.6,       // slow fall, slower walk
    SWIM: 7.5,                             // JUMP in water: a stroke up
    LEAP: 13,                              // JUMP with your head out of the water: a leap out
};

// New toys (round 2)
export const TOYS = {
    BUMP_V: 15,                            // a pinball bumper pops you up this fast (≈ 3 tiles; power scales it)…
    BUMP_SIDE: 10,                         // …and away from its middle this fast (straight up if you land on top)
    BUMP_DOWN: 6,                          // hit it from underneath: knocked down instead
    BUMP_REACH: 0.42,                      // it hits when your middle comes this close to its rim
    BUMP_COOL: 8,                          // frames before the same bumper can hit you again
    BUBBLE_RISE: 2.8,                      // a bubble floats you up (against gravity) this fast, tiles/s
    BUBBLE_STEER: 3,                       // ◀ ▶ drift inside a bubble
    BUBBLE_EASE: 14,                       // how quickly a bubble picks up its drift (tiles/s²)
    BUBBLE_GRAB: 0.75,                     // touch a bubble within this of its middle and you're in
    BUBBLE_LIFE: 300,                      // frames before it pops by itself
    BUBBLE_BACK: 90,                       // frames before the wand blows a new one
    BUBBLE_POP: 0.85,                      // JUMP pops it: a jump × this
    TICK: 120,                             // tick-tock blocks: red is solid for the first half of each beat, blue the second
};

// Tile alphabet for maps. Anything else is a checker error.
export const TILE = {
    EMPTY: '.', SOLID: '#', ONEWAY: '=', SPIKES: '^', SPIKES_DOWN: 'v', LADDER: 'H', START: 'S', GOAL: 'G',
    ICE: 'I', BELT_L: '<', BELT_R: '>', SPONGE: 'T', CRUMBLE: 'C', WATER: '~',
    TICK_RED: 'R', TICK_BLUE: 'B',         // tick-tock blocks (solid on their half of the beat)
};
export const TILE_CHARS = new Set(Object.values(TILE));
/** Tiles you stand on (and bump into). Crumble blocks are solid until they fall; tick-tock blocks come and go (World.solidAt). */
export const SOLID_TILES = new Set(['#', 'I', '<', '>', 'T', 'C']);
export const TICK_TILES = new Set(['R', 'B']);

// Device fields the checker validates (type → required numeric/str fields).
export const DEVICES = {
    spring:  ['x', 'y'],                   // jack-in-the-box; dx: -1|0|1 throws you sideways (kick tiles/s, default 8), power (×SPRING_V)
    cannon:  ['x', 'y', 'aim'],            // aim: [[vx,vy]] fixed or [[a],[b]] sweeping; period frames; power
    fan:     ['x', 'y', 'w', 'h', 'ax', 'ay'],   // a push zone (tiles/s²)
    magnet:  ['x', 'y', 'r', 'pull'],      // pulls you toward (x, y) inside radius r
    rope:    ['x', 'y', 'len'],            // a yo-yo swing anchored at (x, y)
    mover:   ['x', 'y', 'w', 'to', 'period'],   // a toy car shuttling (x,y) ↔ to [x,y]; stand on top
    seesaw:  ['x', 'y', 'half'],           // a ruler on an eraser: pivot (x, y), half-length
    lowg:    ['x', 'y', 'w', 'h'],         // balloon zone
    flip:    ['x', 'y', 'w', 'h', 'dir'],  // dir 'up' = fall to the ceiling, 'down' = back to normal
    coin:    ['x', 'y'],
    flag:    ['x', 'y'],                   // checkpoint
    portal:  ['x', 'y', 'to'],             // hub doors
    sign:    ['x', 'y', 'text'],
    bumper:  ['x', 'y', 'r'],              // a pinball bumper, centre (x, y), radius r: touch it and it knocks you away; power
    bubble:  ['x', 'y'],                   // a bubble wand's bubble at (x, y): touch it to float inside; ◀ ▶ steer, JUMP pops; rise (tiles/s)
    train:   ['path', 'w', 'speed'],       // a toy train: a platform w wide looping along path [[x,y],…] (its top-left) at speed tiles/s
};
