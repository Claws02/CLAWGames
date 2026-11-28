# Playroom Parkour — context for Claude

A pure 2D platformer: the player's own character, tiny, runs physics courses in a giant toy room.
No maths to solve: the physics is felt (sponges throw you back harder the farther you fall, ice keeps
you sliding, a ruler tips with your weight). CLAWGames-only game (lives in `src/games/`, never in
claw-core). Plain ES modules, no build, canvas 2D. THREE only once, at start: `HeroSprites.js` renders
your rigged character (claw-core `CharacterRig`) into a sheet of poses, then lets the WebGL context go.

**Never kicked out**: everything starts and ends in **the Toy Box** (the hub). Walk to a door, ▲ to
play; finish a course and you're back at that door with the next one open. ✕ in a course goes back to
the Toy Box; only ✕ in the Toy Box leaves the game.

**Courses are written by Claude and proven by a checker before anyone plays them.**

Play it in the app: SOLO → **Playroom Parkour**.

## Run / verify

```
node src/games/parkour/tools/check.mjs                 # every course + the hub (several minutes). Must be 0 errors, 0 warnings.
node src/games/parkour/tools/check.mjs c3 --verbose    # one course
node src/games/parkour/tools/check.mjs --write-tapes   # after a clean run: regenerate levels/tapes.js
node src/games/parkour/tests/physics.test.mjs          # each mechanic does what it says (96 checks)
node qa/parkour.js                                     # the app: buttons, ↺, poses, doors, every floor up, all 16 courses on their ★★★ routes, saves (needs :8140)
node scripts/capture-clips.js parkour                  # re-record the card clip after changing how it looks
```

## Map

| Path | What |
|---|---|
| `core/Rules.js` | every tunable: hero feel, bounce/slip/swing/gravity numbers, tile alphabet, device fields |
| `core/World.js` | `compile(level)`, `step(world, input)` one fixed frame, `snapshot/restore`, `hashState`, `toFlag` (the ↺ button). Pure, deterministic |
| `core/Solver.js` | best-first search over input bursts through the real `step()`; `navField` (walking distance, launchers as shortcuts); `route`, `replay` |
| `core/Lint.js` | the checker: data, reach, coins, flags, ghost + par, needs, traps, hub (`lintTraps` runs the traps layer on its own) |
| `levels/*.js` | one course per file; `levels/index.js` is the order + `HUB` |
| `levels/base.js` | **the Toy Box** (`kind: 'hub'`): four floors of doors (`portal`, `to` = course id or `soon`) numbered the way you walk (zig-zag up), three jack-in-the-boxes up (right wall, left wall, right wall), signs |
| `levels/tapes.js` | GENERATED checker routes (QA autoplay, the clip). Never hand-edit |
| `Render.js` | the toy room on a canvas; cosmetic only (may use Math.random / Math.sin). Picks the hero's pose each frame (`heroPose`), comic words, the OOF ghost |
| `HeroSprites.js` | your character's poses (run ×8, idle, blink, crouch, rise, apex, fall ×2, launch, tuck, skid, hang ×2, climb ×2, swim ×4, cheer ×4, wave ×2, hurt, cling ×2, pilot ×2, pogo ×2), rendered once into an atlas; `null` without WebGL (the portrait, then the emoji, stand in) |
| `Game.js` | one course or the hub in a DOM box: loop, thumb buttons, HUD (↺ back to the last flag, or restart before the first; R restarts), course-clear card |
| `Campaign.js` | the Toy Box ↔ courses; back at the same door; unlock messages |
| `Progress.js` | best times, coins, stars, unlocks (save schema v1; store injected) |
| `HubGame.js` | the SOLO card: full screen, hero = seat 1's character (sprite sheet + portrait), `Store` key `parkour`, event → arcade sfx |

## The mechanics

| Family | Pieces | Course |
|---|---|---|
| Bounce & launch | sponge tile `T` (bounce from the height you fell, more with JUMP held), `spring` (jack-in-the-box; `dx`+`kick` throws sideways), `cannon` (climb in, JUMP fires; two `aim`s + `period` sweeps) | c1 Bounce House |
| Slippery & pushy | ice `I`, belts `<` `>`, `fan` zones (push in the air, drift on the ground), `magnet` (pull toward a point) | c2 Slick Tricks |
| Swing & ride | `rope` (yo-yo: jump into the string, JUMP lets go), `mover` (toy car / elevator, ride on top), ABC blocks `C` (fall after you stand on them, come back), `seesaw` (ruler; tips toward your weight; `tilt` = resting slope) | c3 Swing Set |
| Gravity tricks | `lowg` balloon zone, `flip` zones (`dir: 'up'` falls to the ceiling, `'down'` back), water `~` (sink slowly, JUMP swims, leap out with your head above the surface) | c4 Topsy-Turvy |
| **Round 4 toys** | `hook` (the sticky hand: JUMP again in the air fires it at the nearest hook within 6.5 tiles, above you or level, in sight: swing like a yo-yo; `pull: true` reels you up to it, dragging you up a wall face rather than dropping you, and JUMP, even pressed while it's still reeling, hops you off with a full jump), `duck` (rubber duck boat: a ride drifting `x`→`to` on the water, rocking on the waves; `sink: true` sinks while you stand on it and bobs back up), snappy-fish pond tiles `F` (fall in past the top half: back to the flag; no swimming), `warp` (a box: land on it and you pop out of its twin `to`; a twin with `g: -1` hangs from the ceiling and you come out upside down) | c13 Sticky Hands, c14 Duck Pond, c15 Magic Boxes, c16 Grand Finale (the expert remix: sponges→velcro→ice→cannon→yo-yo→button+plane→pogo→warp) |
| **Round 3 toys** | velcro tiles `W` (solid; touching one in the air you slide slowly, JUMP kicks you up and away: two facing make a climbable chimney), `plane` (paper plane on a peg: walk into it to ride; it glides down, hold JUMP to pull up (costs speed, can stall), ◀/▶ toward its `dir` dives, away lets go; fans carry it; touching anything ends the flight), `pogo` + `rack` (grab the pogo stick and every landing bounces you, higher with JUMP held; spikes are safe to bounce on; water or a rack takes it away; a flag remembers whether you had it), `button` + `gate` (stand on a button and its gate lifts for `time` frames, then shuts; a gate shutting around you lets you out) | c9 Bookshelf Climb, c10 Paper Sky, c11 Pogo Park, c12 Toy Castle: a step harder, each mixing older toys |
| **New toys** (round 2) | `bumper` (pinball: pops you up and away from its middle; land on top → straight up; from underneath → knocked down; `power`), `bubble` (touch it → float inside, ◀ ▶ steer, JUMP pops, touching anything pops, fans blow it, `rise`; the wand re-blows), `train` (a ride looping along `path` at `speed`, hills and loops; `phase`), tick-tock tiles `R` / `B` (red solid the first half of each beat, blue the second; `level.tick.period`, default 120 frames; a block that comes on around you lets you out) | c5 Pinball Party, c6 Bubble Bath, c7 Train Set, c8 Tick-Tock Clock: bigger, two-floor maps, each mixing families |

Also: `coin` (exactly 3 per course), `flag` (checkpoint; falls put you back there), spikes `^` `v`,
shelves `=` (one-way), ladders `H`, the toy chest `G` (the goal), `sign` (text in the world).

## Rules

- `core/` stays pure: no DOM, no `Math.random`, no clocks, no `Math.sin` (sqrt is fine). Same input tape → same frames (the ghost layer checks it).
- A course ships with **0 errors, 0 warnings**, then `--write-tapes`. A changed tunable in `Rules.js` re-proves every course: run the checker.
- **No pit you can't get out of** (the traps layer): from every floor, the goal, a floor the routes use, or a hazard (back to the flag) must be reachable. A dead-end pit gets spikes (or a spring out). A floor the search couldn't decide is a warning.
- Every course lists `needs`: device ids, device types or tiles the course is built around. The checker takes each away and the goal must go out of reach, so a mechanic can never be skipped by accident.
- Par must be at least the checker's route time AND its ★★★ route time (every coin; ★★★ is one run), or it errors; not more than 2.5× the route (a warning). Set it ~1.5× the route, or a little over the ★★★ route if a coin costs a long detour.
- Adding a course = level file + register in `levels/index.js` + a door in `levels/base.js` (the hub check fails until it has one; doors 1–4 on the floor, 5–8, 9–12 and 13–16 on the shelves, in the order you walk past them: left to right on the floor and the third shelf, right to left on the second and the top shelf, where the jacks drop you off at the right; a 17th takes the 'soon' door's spot at the top shelf's left end) + rerun the checker and `--write-tapes`.
- Big courses list `route`: their flag and coin ids in the order a run meets them. The checker then searches waypoint to waypoint (reach: the flags; ★★★: everything), and each segment gets the full search budget.
- **No ladders a course needs**: the touch buttons have no ▲ ▼ in courses (only keyboard does). Drops and springs instead.
- `window.__ppkAutoplay` (QA only) makes courses play their ★★★ tape; `window.__ppkCampaign` exposes the live campaign to probes.
- `_`-prefixed names stay file-private (CLAWGames/HBD parsecheck convention). Arcade imports are namespace imports (cache safety).

## Course design rules (what worked)

- Teach a piece safely, test it, then twist it (c1: one held bounce → the shaft → the big drop). c1–c4 are one family each; c5–c8 each bring one new toy and mix it with the older families.
- 3 coins: one on the way (rewards using the mechanic), one off the path, one that needs the mechanic done well.
- A flag before each hard section; never a flag in an upside-down stretch.
- Leave headroom over launches (a jack or cannon that hits the ceiling falls short) and margin on landings (the checker's `fly.mjs`-style traces are worth doing; land well inside a platform, not on its lip).
- If the search is slow or fails, it's usually the state space, not the course: `hashState` keys moving things only near the hero. Check a section with a search from a point just before it, and from a few different start frames (`w.s.t`): a section that only works at one moment of a loop will fail the full run.
- Bumpers throw you AWAY from their middle: put them behind you (or under you) for the way you want to go. A bumper in a gap is a stepping stone: land on top.
- Bubbles are slow (2.8 tiles/s): use `rise` to speed up long climbs, and keep ceilings clear (a bubble pops on anything). Through tick-tock shelves, space the shelves `rise × half a beat` apart so the beat stays with you.
- Trains: give the player a safe spot to wait right where they board, and keep loops short (≈5 s): a long wait blows up the search (and bores the player).
- Velcro: a 1-wide velcro wall is sticky on both faces. Where only the inside of a chimney should stick, back it with a plain `#` column. Chimneys 3 wide climb ≈2.4 tiles a kick, 4 wide ≈1.4. A chimney needs a way IN: stop one wall ~3 tiles above the floor and run the other's velcro down to the floor (c9's first chimney; even a hop then touches velcro). A sealed foot leaves only the outside of one wall, which the solver can climb (Toy Castle's took 18 exact kicks) and a thumb can't.
- Planes glide very far (a 4-tile drop ≈ 25 tiles). Pulling up costs speed: from boarding you can climb only ≈1.8 tiles, so climbs need an updraft (`fan`, weak enough, ay ≈ −30, that it can't lift you on foot). Never ask for a climb right off the stand: a phone thumb isn't frame-perfect (Paper Sky's plane 2 needed one; 0 of 168 kid-style presses made it). Test a takeoff with a grid of press times × hold lengths, and aim for nearly all of them working.
- Pogo: the biggest bounce is ≈6.4 tiles and takes 4–5 held bounces to build up. Pogo states are settled at each bounce, so a section check needs `--pogo` in the scratch tools, and flags remember the stick.
- Gates: give each race at least 1.5 s to spare over the checker's route (a kid stops at the edge of each pit), and check that every coin on a timed stretch can be reached in one jump (a coin that costs a detour may cost the gate).
- **The checker proves a route exists, not that a thumb can do it.** For every hard section, run a grid of kid-style inputs (press early/late × JUMP held short/long × a pause first) and aim for nearly all of them working: Paper Sky's plane 2 (0 of 168) and Toy Castle (a sealed chimney, a cannon you walked under, 0.15 s spike jumps) both passed the checker.
- A cannon you reach on foot sits on the floor (its tile has solid under it): you walk in. One a tile up is walked under. A cannon in the air needs a way to fall into it (c16 slides you off the ice into it). Aim it so every flight input except holding ◀ the whole way lands well inside the target.
- Spikes on a flat floor: a jump over a 3-wide strip has a 9-frame window (from the very lip you clip the spikes' corner). Sink the spikes into a 1-deep pit (30 frames) or keep flat strips ≤ 2 wide (19 frames). Don't put spikes where letting go of ▶ on a long drop lands you.
- Sticky hand: the hook must be in range from the top of a FULL jump (a tap is a short hop). Spread hooks ≥ 8 apart in a chain or a swing skips one (a big pumped swing can still skip one: list the hooks that can't be skipped in `needs`).
- A hook must be catchable wherever the press lands in a jump: put it ABOVE the jump's top (the hand ignores hooks below you), or a natural JUMP-JUMP rhythm carries you over it and the press does nothing (Sticky Hands' last hook: only a quick tap caught it).
- A green (pull) hook beside a ledge: hang it no more than ~0.3 below the ledge top; its hop is a full jump, which clears the ledge by ~0.7 from a still hang.
- Don't ask for a let-go onto a moving ride over spikes (Sticky Hands' car: 1 in 20 kid tries). Swing to a wide ledge (≥ 5, out of plain-jump reach) with a flag, and let the ride pull up flush beside it.
- Ducks only matter over something you can't swim: put them on snappy-fish ponds (`F`), not water. Float them 0.25 below the bank top so you can walk on from the bank.
- Warp boxes: watch for shortcuts (a 'decoy' twin behind a wall is a free pass; a long ceiling walk can reach a later box), wall them off. A box must be in jumping reach (≤ 2 tiles up).
- A waiting spot for a ride must be within 10 tiles of its track, or the solver can't tell the moments apart and gives up waiting.

## Token rules

- Don't read `levels/tapes.js` (generated).
- To learn the engine read `World.js` top comment + `step()`; to learn courses read one level file + this file.
