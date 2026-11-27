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
    // Round 3
    WALL_SLIDE: 2.2,                       // touching a velcro wall in the air: you slide down it no faster than this
    WALL_JUMP_V: 13.5,                     // JUMP off a velcro wall: up this fast…
    WALL_KICK: 7.5,                        // …and away from it this fast
    WALL_STEER: 10,                        // frames after a wall jump when ◀ ▶ only steer gently (so you don't stick straight back)
    WALL_COYOTE: 5,                        // frames after leaving a velcro wall when JUMP still kicks off it
    PLANE_CRUISE: 7,                       // a paper plane sets off at this speed (tiles/s)
    PLANE_MIN: 3,                          // slower than this it stalls and drops
    PLANE_MAX: 11,
    PLANE_SINK: 1.5,                       // let go of JUMP and it glides down this fast
    PLANE_DIVE: 5,                         // press ◀/▶ the way it flies: it dives this fast (to land where you want)
    PLANE_FAN: 0.25,                       // fans carry planes (× their push, as a speed): an updraft lifts you high
                                           // without slowing you (a weak updraft, ay ≈ −30, can't lift you on foot)
    PLANE_SETTLE: 7,                       // how quickly it eases back into its glide
    PLANE_LIFT: 15,                        // hold JUMP: it pulls up (tiles/s²)…
    PLANE_CLIMB: 5,                        // …no faster than this
    PLANE_TRADE: 2.2,                      // climbing turns speed into height, diving turns height back into speed
    PLANE_LOSS: 0.4,                       // and a little is lost (tiles/s²): no flying for ever
    PLANE_BACK: 150,                       // frames before a used plane is back on its stand
    POGO_MIN: 11,                          // on a pogo stick every landing bounces you: at least this (≈ 1.6 tiles)…
    POGO_KEEP: 0.9,                        // …giving back this much of the fall…
    POGO_HELD: 4.5,                        // …plus this with JUMP held as you land
    POGO_MAX: 22,                          // (≈ 6.4 tiles)
    POGO_TIP: 0.4,                         // on a pogo stick you bounce on spikes: off their tips, this far into the tile
    GATE_TIME: 240,                        // stand on a button and its gate stays open this long (frames); per-button `time`
    // Round 4
    HAND_RANGE: 6.5,                       // sticky hand: JUMP in the air fires it at the nearest hook this close (above you or level)
    HAND_PULL: 16,                         // a pull hook reels you in this fast (tiles/s)…
    HAND_NEAR: 1.1,                        // …to this far from it
    HAND_HOP: 11,                          // JUMP at a pull hook: a hop up off it
    DUCK_BOB: 0.16,                        // rubber ducks rock on the waves this much (tiles)…
    DUCK_WAVE: 100,                        // …once every this many frames
    DUCK_SINK: 0.55,                       // a wobbly duck sinks this fast while you stand on it (tiles/s)…
    DUCK_FLOAT: 0.8,                       // …and bobs back up this fast when you're off it
    DUCK_UNDER: 0.85,                      // sunk deeper than this, it's under: you're in the water
    WARP_POP: 9,                           // a warp box pops you out of its twin this fast…
    WARP_COOL: 45,                         // …and won't warp you again for this many frames
};

// Tile alphabet for maps. Anything else is a checker error.
export const TILE = {
    EMPTY: '.', SOLID: '#', ONEWAY: '=', SPIKES: '^', SPIKES_DOWN: 'v', LADDER: 'H', START: 'S', GOAL: 'G',
    ICE: 'I', BELT_L: '<', BELT_R: '>', SPONGE: 'T', CRUMBLE: 'C', WATER: '~',
    TICK_RED: 'R', TICK_BLUE: 'B',         // tick-tock blocks (solid on their half of the beat)
    VELCRO: 'W',                           // a velcro wall: solid; slide down it, jump off it
    FISH: 'F',                             // a pond full of snappy fish: fall in (below its surface's top half) and it's back to the flag
};
export const TILE_CHARS = new Set(Object.values(TILE));
/** Tiles you stand on (and bump into). Crumble blocks are solid until they fall; tick-tock blocks come and go (World.solidAt). */
export const SOLID_TILES = new Set(['#', 'I', '<', '>', 'T', 'C', 'W']);
export const TICK_TILES = new Set(['R', 'B']);

// Device fields the checker validates (type → required numeric/str fields).
export const DEVICES = {
    spring:  ['x', 'y'],                   // jack-in-the-box; dx: -1|0|1 throws you sideways (kick tiles/s, default 8), power (×SPRING_V)
    cannon:  ['x', 'y', 'aim'],            // aim: [[vx,vy]] fixed or [[a],[b]] sweeping; period frames; power
    fan:     ['x', 'y', 'w', 'h', 'ax', 'ay'],   // a push zone (tiles/s²); `lift`: how fast it carries a paper plane up (tiles/s, default ay × PLANE_FAN)
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
    plane:   ['x', 'y', 'dir'],            // a paper plane on its stand: centre x, top y, flying dir ±1. Touch it to ride; hold JUMP to pull up; ◀/▶ away from dir lets go
    pogo:    ['x', 'y'],                   // a pogo stick stand (tile x, y): touch it and you bounce everywhere (even on spikes) until water or a rack
    rack:    ['x', 'y'],                   // a pogo rack (tile x, y): touch it and you put the pogo stick down
    button:  ['x', 'y', 'gate'],           // a floor button (tile x, y): stand on it and gate `gate` opens for `time` frames
    gate:    ['x', 'y', 'w', 'h'],         // a toy-castle gate: solid tiles (x, y, w, h) unless its button holds it open
    hook:    ['x', 'y'],                   // a hook for the sticky hand (JUMP in the air near it): swing from it; pull: true reels you in
    duck:    ['x', 'y', 'w', 'to', 'period'],   // a rubber duck boat floating on the water (top-left x, y), drifting to `to` and back; sink: true sinks while you stand on it
    warp:    ['x', 'y', 'to'],             // a warp toy box (tile x, y): land on it and you pop out of box `to`; g: -1 for a box on the ceiling
};
