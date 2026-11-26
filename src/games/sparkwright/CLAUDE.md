# Sparkwright — context for Claude

A field-engineer platformer that teaches mechanical, electrical and (later) drone engineering by making
the concept the mechanic. Each shift is a **work order**: you build a system on a **Workbench** from
parts with spec sheets (mass, cost, ratings), test it in the world, and get a ★★★ design review.
The maths shows up only after you've tried a build. CLAWGames-only game (lives in `src/games/`,
never in claw-core). Plain ES modules, no build, canvas 2D, no THREE.

**Levels are written by Claude and proven by a 6-layer checker before anyone plays them.**

Play it in the app: SOLO → **Sparkwright** (the campaign: Home Base hub + every shift, saves with
`Store`), or the grid's **SPARKWRIGHT SPRINT** (`sparksprint`, a pass-and-play race on one level).

## Run / verify

```
node src/games/sparkwright/tools/check.mjs            # all 6 layers, every level (≈30 s). Must be 0/0.
node src/games/sparkwright/tools/check.mjs m05 --verbose   # one level, list the ★★★ builds
node src/games/sparkwright/tools/check.mjs --write-tapes   # after a clean run: regenerate levels/tapes.js
node src/games/sparkwright/tests/devices.test.mjs     # device maths vs hand-worked numbers
npm run serve  →  /src/games/sparkwright/preview.html?all   # campaign preview (?all unlocks every level)
node qa/sparkwright.js                                # campaign playthrough + arcade sprint end to end, needs :8140
QA_ONLY=sparksprint node qa/smoke.js                  # ~100 s: smoke can't press START, human seat DNFs
node src/games/sparkwright/tools/build-preview.mjs out.html   # one-file preview (esbuild via npx)
node src/games/sparkwright/tools/new-level.mjs m07 "Name" elec  # scaffold a level + register it
```

## Map

| Path | What |
|---|---|
| `core/Rules.js` | every tunable: player feel, SI constants, tile alphabet, part kinds, CONCEPTS order |
| `core/Devices.js` | the engineering, pure SI functions (parallel springs, motor+gearbox with ratings, series circuit with fuse/power ratings). HUD shows their `lines` |
| `core/Review.js` | the design review: ★ cleared + the work order's two checks (budget, spec) |
| `core/World.js` | `compile(level)`, `step(world, input)` one fixed frame, `hashState`, `readouts`. Pure, deterministic |
| `core/Solver.js` | BFS over macros through the real `step()`; `solve()`, `replay()`, tapes |
| `core/Lint.js` | the 6 layers; the puzzle layer evaluates every bench build analytically and runs the solver once per effect group |
| `levels/*.js` | one level per file (JSON-shaped object); `levels/index.js` is the campaign order + `HUB` |
| `levels/base.js` | **Home Base**, the hub (`kind: 'hub'`): doors (`portal`, `to` = level id / `manual` / `soon`) and signs. Every campaign level needs a door here (lint) |
| `levels/tapes.js` | GENERATED solver tapes; arcade bot + qa replay them. Never hand-edit |
| `Render.js` | canvas drawing; cosmetic state only (may use Math.random) |
| `Game.js` | one level in a DOM box: loop, two-thumb controls, the Workbench, incident reports, design-review card |
| `Campaign.js` | the whole game in one box: Home Base ↔ shifts, BACK TO BASE at the same door, Field Manual. Never exits between shifts |
| `Progress.js` | cleared levels, best times, unlocks (save schema v1; store injected) |
| `HubGame.js` | SoloHub card: full-screen campaign, `Store` saves under `sparkwright`, event → arcade sfx |
| `Sparkwright.js` | arcade adapter `sparksprint` (minigame contract): pass-and-play race, solo score, bot = tape |
| `preview.html` | the same campaign standalone (localStorage). `?all` unlocks every door, `?reset` wipes progress |
| `docs/` | DESIGN (roadmap), LEVEL_FORMAT, DESIGN-BRIEF (for level-designer agents), INTEGRATION |

## Rules

- `core/` stays pure: no DOM, no `Math.random`, no clocks, no `Math.sin`. Same input tape → same frames on every device (layer 5 checks it).
- Device maths lives ONLY in `Devices.js`. The engine, lint and HUD all call it, so what the player reads is what the world does.
- A level ships with **0 errors, 0 warnings**, then `--write-tapes`. A changed tunable in `Rules.js` re-proves every level: run the checker.
- Every device concept must have a complete wrong build that fails, a ★★★ build, and ★ checks that bite (layer 3).
- Sneaky teaching: never put a build's outcome on the bench. Maths appears after a test, an incident, or the clear.
- Never write real-product specs. Parts are generic ("Gearbox 80:1"); numbers are plausible, maths exact.
- `_`-prefixed names stay file-private (CLAWGames/HBD parsecheck convention).
- Arcade glue: `src/games/index.js` (`sparksprint` entry) and `src/arcade/SoloHub.js` (`HubGame` in `GAMES`).
- Adding a level = level file + register in `levels/index.js` + a door in `levels/base.js` (the hub lint fails until it has one).
- `window.__swrAutoplay` (QA only) makes shifts play their solver tape; `window.__swrCampaign` exposes the live campaign to probes.

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
