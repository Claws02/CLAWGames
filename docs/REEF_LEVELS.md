# Reef Drop levels: how to add them

Reefs are data. Don't hand-place coordinates, and don't touch `ReefDropLogic.js` to add levels.

| File | What it is |
|---|---|
| `scripts/reef-recipes.mjs` | **Edit this.** Short recipes for generated worlds. |
| `scripts/reef-base.json` | The 54 hand-made reefs (worlds 1–9), frozen. Leave alone. |
| `scripts/reef-levels.mjs` | The generator: base plus recipes → `src/arcade/ReefDropLevels.js`. |
| `scripts/reef-check.mjs` | A quiet check of every reef, with an optional contact sheet. |
| `scripts/reef-lib.mjs` | The checks themselves (shared). |
| `src/arcade/ReefBuild.js` | Layout helpers (`grid`, `ring`, `wave`, `wheel`, `slider`, `build`). |
| `src/arcade/ReefDropLevels.js` | Generated. Never edit by hand. |

## Add a world of remix reefs (no new rules)

1. Append a world to `RECIPES` in `scripts/reef-recipes.mjs`, usually six reefs: an easy one that teaches the twist, then medium ones, then a hard finale.
   ```js
   { world: '🐠 Coral Caves', reefs: [
       { name: 'Cave Mouth', band: 'easy', layout: 'grid', oysters: 4, starfish: 2, extras: { ghosts: 4 }, hint: '👻 …' },
       { name: 'Echo Wheel', band: 'medium', layout: 'bands', oysters: 4, puffers: 1, movers: 'wheel' },
       { name: 'Cave Heart', band: 'hard', layout: 'any', oysters: 5, golden: 1, puffers: 2, movers: 'both', extras: { anglers: 1, clams: 1 } },
   ] },
   ```
2. Generate: `npm run reef:levels`. One line comes back per reef. A `FAIL` line names the closest miss: loosen that recipe (fewer pieces, another layout, or another band) and run it again. Nothing is written until every recipe passes. Use `--dry` to try without writing.
3. Look: `node scripts/reef-check.mjs 55-60 --sheet` writes `qa-shots/reefs.png`, a single image of those reefs, using the numbers players see.
4. Ship: `npm run reef:check` (one line: `REEFS OK: n/n …`), plus `npm run smoke`. `qa/aimgames.mjs` also covers every reef. The trophy rule and the in-game reef count pick up new reefs automatically.

Recipe fields:
- `band`: `easy`, `medium` or `hard`. This is how often a random flinger wins: 25–80%, 8–40% or 2–18%.
- `layout`: `grid`, `rings`, `waves`, `diamond`, `bands`, `spiral` or `any`.
- Piece counts: `oysters`, `golden`, `puffers`, `eels`, `rocks`, `chests`, `starfish`.
- `movers`: `none`, `wheel`, `slider` or `both`.
- `extras`: `{ jellies, whirls, lifts, anglers, currents, clams, ghosts }`, as counts.
- Optional: `crab: { period, a }` and `hint`.

The same recipe always makes the same reef: the seed comes from the world and reef name.

## Every reef must pass (`scripts/reef-lib.mjs`)
- A greedy player wins it with at least 5 pearls left.
- Nothing comes below `CLEAR_Y` (Shelly's shell). `build()` squeezes a reef up if it does.
- No drop lasts 15 s or more, so nothing gets stuck.
- Generated reefs must also land in their difficulty band.

## A brand-new piece (a new rule)
This still needs code:
1. The rule in `ReefDropLogic.js`.
2. Its drawing in `ReefDrop.js`.
3. A rule test in `qa/aimgames.mjs`.
4. If it's an extra like `clams`, a few lines in `attempt()` in `scripts/reef-levels.mjs` so recipes can ask for it.

After that, worlds using it are recipes again.
