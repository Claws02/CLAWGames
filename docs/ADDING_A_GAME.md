# Adding a game

Every game follows the same contract: HundredBlockDash's
[`docs/MINIGAME_STANDARD.md`](https://github.com/Claws02/hundredblockdash/blob/main/docs/MINIGAME_STANDARD.md)
(rules R1–R7 and the shipping checklist) and claw-core's `minigames/PLAN.md`
(the rubric and gates). This page covers the step those documents don't: **where
the game lives and every table it has to be listed in.**

## 1. Pick where it lives

| The game is for | It lives in | HBD gets it? |
|---|---|---|
| both apps | `claw-core/minigames/<Name>.js` | yes, on the next pointer bump |
| **CLAWGames only** | `CLAWGames/src/games/<Name>.js` | never |

## 2. The file

Copy `src/claw-core/minigames/_template.js` (2D) or `_template3d.js` (3D stage).
From `src/games/`, the imports are:

```js
import { state } from '../AppHost.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { registerMinigameCleanup } from '../claw-core/minigames/MinigameManager.js';
```

`start(isBot, onWin, botSkill = 0.55)` runs after GO. It ends with
`onWin(winnerId, payouts?, standings?)` exactly once. Pass `standings`
(a score for each seat) when the game has a score.

## 3. Register it

A **CLAWGames-only** game adds one entry to `GAMES` in `src/games/index.js`.
The loop there fills every table below and calls `registerMinigame`.

A **shared** game is added by hand to each table in
`claw-core/config/MinigameRegistry.js`, and to `MG_MODULES` in `MinigameManager.js`:

| Table | What it says | Without it |
|---|---|---|
| `MG_TYPES` | the game exists | never listed |
| `MG_INFO` | `icon`, `title`, `desc` (plus `descPlain` for coin games) | not listed in the arcade (`Catalog.allTypes`) |
| `MG_ORIENTATION_MAP` | which hold it uses (a key of `MG_ORIENTATIONS`) | defaults to face-off |
| `MG_PROFILE` | genre, control, wire, seats, live, roomy | treated as a 2-seat reflex game |
| `MG_SHAPE` | arena / split / table / relay | blocked reasons read wrong |
| `MG_NET` | `local` or `parallel` | `parallel` games miss Play Together |
| `MG_WATCHDOG_MS` | only if it can run past 90 s | force-ended as a tie at 90 s |
| `MG_MODULES` (manager) | the lazy `import()` | the manager loads the first game in the roster instead |

A shared game also needs a row in HBD's `qa/surfaces.js`.

A game with no clock that can run long should call `extendWatchdog(ms)` from
`MinigameManager` at each turn, as Mini Golf and Yatzy do, so a slow game is
never called a tie while someone is still playing it.

## 4. Gates

```bash
npm run serve                 # :8140
node qa/<game>.js             # a probe of its own: rules, a game vs a bot, the hold
QA_ONLY=<type> node qa/smoke.js
npm run smoke                 # nothing else broke
```

Then go through MINIGAME_STANDARD §8, the shipping checklist.

**Reference:** Yatzy (`src/games/Yatzy.js`, `qa/yatzy.js`) is a CLAWGames-only
game. It is turn-based, uses the tabletop hold, and extends the watchdog each turn.
