# Playroom Parkour — context for Claude

A pure 2D platformer: the player's own character, tiny, runs physics courses in a giant toy room.
No maths to solve: the physics is felt (sponges throw you back harder the farther you fall, ice keeps
you sliding, a ruler tips with your weight). CLAWGames-only game (lives in `src/games/`, never in
claw-core). Plain ES modules, no build, canvas 2D, no THREE (except the arcade's portrait renderer
for the hero).

**Never kicked out**: everything starts and ends in **the Toy Box** (the hub). Walk to a door, ▲ to
play; finish a course and you're back at that door with the next one open. ✕ in a course goes back to
the Toy Box; only ✕ in the Toy Box leaves the game.

**Courses are written by Claude and proven by a checker before anyone plays them.**

Play it in the app: SOLO → **Playroom Parkour**.

## Run / verify

```
node src/games/parkour/tools/check.mjs                 # every course + the hub (≈80 s). Must be 0 errors, 0 warnings.
node src/games/parkour/tools/check.mjs c3 --verbose    # one course
node src/games/parkour/tools/check.mjs --write-tapes   # after a clean run: regenerate levels/tapes.js
node src/games/parkour/tests/physics.test.mjs          # each mechanic does what it says (33 checks)
node qa/parkour.js                                     # the app: buttons, doors, all 4 courses on their ★★★ routes, saves (needs :8140)
node scripts/capture-clips.js parkour                  # re-record the card clip after changing how it looks
```

## Map

| Path | What |
|---|---|
| `core/Rules.js` | every tunable: hero feel, bounce/slip/swing/gravity numbers, tile alphabet, device fields |
| `core/World.js` | `compile(level)`, `step(world, input)` one fixed frame, `snapshot/restore`, `hashState`. Pure, deterministic |
| `core/Solver.js` | best-first search over input bursts through the real `step()`; `navField` (walking distance, launchers as shortcuts); `route`, `replay` |
| `core/Lint.js` | the checker: data, reach, coins, flags, ghost + par, needs, hub |
| `levels/*.js` | one course per file; `levels/index.js` is the order + `HUB` |
| `levels/base.js` | **the Toy Box** (`kind: 'hub'`): doors (`portal`, `to` = course id or `soon`) and signs |
| `levels/tapes.js` | GENERATED checker routes (QA autoplay, the clip). Never hand-edit |
| `Render.js` | the toy room on a canvas; cosmetic only (may use Math.random / Math.sin) |
| `Game.js` | one course or the hub in a DOM box: loop, thumb buttons, HUD, course-clear card |
| `Campaign.js` | the Toy Box ↔ courses; back at the same door; unlock messages |
| `Progress.js` | best times, coins, stars, unlocks (save schema v1; store injected) |
| `HubGame.js` | the SOLO card: full screen, hero = seat 1's character portrait, `Store` key `parkour`, event → arcade sfx |

## The mechanics (one course each so far)

| Family | Pieces | Course |
|---|---|---|
| Bounce & launch | sponge tile `T` (bounce from the height you fell, more with JUMP held), `spring` (jack-in-the-box; `dx`+`kick` throws sideways), `cannon` (climb in, JUMP fires; two `aim`s + `period` sweeps) | c1 Bounce House |
| Slippery & pushy | ice `I`, belts `<` `>`, `fan` zones (push in the air, drift on the ground), `magnet` (pull toward a point) | c2 Slick Tricks |
| Swing & ride | `rope` (yo-yo: jump into the string, JUMP lets go), `mover` (toy car / elevator, ride on top), ABC blocks `C` (fall after you stand on them, come back), `seesaw` (ruler; tips toward your weight; `tilt` = resting slope) | c3 Swing Set |
| Gravity tricks | `lowg` balloon zone, `flip` zones (`dir: 'up'` falls to the ceiling, `'down'` back), water `~` (sink slowly, JUMP swims, leap out with your head above the surface) | c4 Topsy-Turvy |

Also: `coin` (exactly 3 per course), `flag` (checkpoint; falls put you back there), spikes `^` `v`,
shelves `=` (one-way), ladders `H`, the toy chest `G` (the goal), `sign` (text in the world).

## Rules

- `core/` stays pure: no DOM, no `Math.random`, no clocks, no `Math.sin` (sqrt is fine). Same input tape → same frames (the ghost layer checks it).
- A course ships with **0 errors, 0 warnings**, then `--write-tapes`. A changed tunable in `Rules.js` re-proves every course: run the checker.
- Every course lists `needs`: device ids, device types or tiles the course is built around. The checker takes each away and the goal must go out of reach, so a mechanic can never be skipped by accident.
- Par must be at least the checker's route time (it errors otherwise) and not more than 2.5× it (a warning). Set it ~1.5× the route.
- Adding a course = level file + register in `levels/index.js` + a door in `levels/base.js` (the hub check fails until it has one) + rerun the checker and `--write-tapes`.
- `window.__ppkAutoplay` (QA only) makes courses play their ★★★ tape; `window.__ppkCampaign` exposes the live campaign to probes.
- `_`-prefixed names stay file-private (CLAWGames/HBD parsecheck convention). Arcade imports are namespace imports (cache safety).

## Course design rules (what worked)

- One mechanic family per course: teach it safely, test it, then twist it (c1: one held bounce → the shaft → the big drop).
- 3 coins: one on the way (rewards using the mechanic), one off the path, one that needs the mechanic done well.
- A flag before each hard section; never a flag in an upside-down stretch.
- Leave headroom over launches (a jack or cannon that hits the ceiling falls short) and margin on landings (the checker's `fly.mjs`-style traces are worth doing; land well inside a platform, not on its lip).
- If the search is slow or fails, it's usually the state space, not the course: `hashState` keys moving things only near the hero. Check a section with a search from a point just before it.

## Token rules

- Don't read `levels/tapes.js` (generated).
- To learn the engine read `World.js` top comment + `step()`; to learn courses read one level file + this file.
