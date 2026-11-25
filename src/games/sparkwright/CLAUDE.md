# Sparkwright — context for Claude

A field-engineer platformer that teaches mechanical, electrical and (later) drone engineering by making
the concept the mechanic: you fit real parts (springs, gearboxes, resistors, batteries) into sockets,
and the device maths decides whether you get through. CLAWGames-only game (lives in `src/games/`,
never in claw-core). Plain ES modules, no build, canvas 2D, no THREE.

**Levels are written by Claude and proven by a 6-layer checker before anyone plays them.**

## Run / verify

```
node src/games/sparkwright/tools/check.mjs            # all 6 layers, every level (≈30 s). Must be 0/0.
node src/games/sparkwright/tools/check.mjs m05 --verbose   # one level, list every part choice that works
node src/games/sparkwright/tools/check.mjs --write-tapes   # after a clean run: regenerate levels/tapes.js
node src/games/sparkwright/tests/devices.test.mjs     # device maths vs hand-worked numbers
npm run serve  →  /src/games/sparkwright/preview.html?all   # campaign preview (?all unlocks every level)
node qa/sparkwright.js                                # arcade entry end to end (vs bot + solo), needs :8140
QA_ONLY=sparkwright node qa/smoke.js                  # ~100 s: smoke can't press START, human seat DNFs
node src/games/sparkwright/tools/build-preview.mjs out.html   # one-file preview (esbuild via npx)
node src/games/sparkwright/tools/new-level.mjs m07 "Name" elec  # scaffold a level + register it
```

## Map

| Path | What |
|---|---|
| `core/Rules.js` | every tunable: player feel, SI constants, tile alphabet, part kinds, CONCEPTS order |
| `core/Devices.js` | the engineering, pure SI functions (spring, geared lift, series circuit). HUD shows their `lines` |
| `core/World.js` | `compile(level)`, `step(world, input)` one fixed frame, `hashState`, `readouts`. Pure, deterministic |
| `core/Solver.js` | BFS over macros through the real `step()`; `solve()`, `replay()`, tapes |
| `core/Lint.js` | the 6 layers (data, layout, puzzle, reach/softlock, ghost, progress) |
| `levels/*.js` | one level per file (JSON-shaped object); `levels/index.js` is the campaign order |
| `levels/tapes.js` | GENERATED solver tapes; arcade bot + qa replay them. Never hand-edit |
| `Render.js` | canvas drawing; cosmetic state only (may use Math.random) |
| `Game.js` | one level in a DOM box: loop, two-thumb controls, part tray, readouts, win card |
| `Sparkwright.js` | arcade adapter (minigame contract): pass-and-play race, solo score, bot = tape |
| `preview.html` | standalone campaign with unlocks + best times (localStorage, try/catch) |
| `docs/` | DESIGN (roadmap), LEVEL_FORMAT, DESIGN-BRIEF (for level-designer agents), INTEGRATION |

## Rules

- `core/` stays pure: no DOM, no `Math.random`, no clocks, no `Math.sin`. Same input tape → same frames on every device (layer 5 checks it).
- Device maths lives ONLY in `Devices.js`. The engine, lint and HUD all call it, so what the player reads is what the world does.
- A level ships with **0 errors, 0 warnings**, then `--write-tapes`. A changed tunable in `Rules.js` re-proves every level: run the checker.
- Every device concept must have a wrong answer that fails (layer 3). If every part works, the level teaches nothing.
- Never write real-product specs. Parts are generic ("Gearbox 80:1"); numbers are plausible, maths exact.
- `_`-prefixed names stay file-private (CLAWGames/HBD parsecheck convention).
- The arcade glue is `src/games/index.js` (`sparkwright` entry). It pushes the type into `MG_PARALLEL` itself.

## Task → doc

| Task | Read |
|---|---|
| Write or fix levels | `docs/LEVEL_FORMAT.md`, `docs/DESIGN-BRIEF.md` |
| New device / part kind | `docs/DESIGN.md` §Devices, then `Devices.js` → `World.js` → `Lint.js` (layer 1 + DEVICE_CONCEPT) → `Render.js` |
| Arcade screen / saves / Solo labels | `docs/INTEGRATION.md` |
| Roadmap, drone world | `docs/DESIGN.md` |

## Token rules

- Don't read `levels/tapes.js` (generated) or `dist-preview.html`.
- To learn the engine read `World.js` top comment + `step()`; to learn levels read one level file + LEVEL_FORMAT.
