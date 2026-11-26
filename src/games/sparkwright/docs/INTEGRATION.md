# Integration into CLAWGames

**Status: merged to `main` on Nov 25 2026** (rebased onto `main` @ 1f27fe4, claw-core @ e6e6ddb). No
claw-core change was needed. HundredBlockDash never sees it.

## What landed

| Path | What |
|---|---|
| `src/games/sparkwright/**` | engine, levels, checker, renderer, game shell, arcade adapter, preview, docs, tools, tests |
| `src/games/index.js` | `sparkwright` entry in `GAMES`; listed as *memorable* (pass-and-play: P2 watched P1's part choice) |
| `qa/sparkwright.js` | probe: roster, vs-bot pass-and-play, solo (same seed → same level, score > 0) |
| `assets/clips/sparkwright.{mp4,jpg}`, `src/arcade/Clips.js` | the game card clip (needed by `qa/gamecards.js`) |
| `scripts/capture-clips.js` | framing for the clip (`PARTY.sparkwright`) |
| `CLAUDE.md`, `docs/STATUS.md` | pointers here |

## Gates (all green at merge)

```bash
node src/games/sparkwright/tools/check.mjs          # 6 levels · 0 errors · 0 warnings
node src/games/sparkwright/tests/devices.test.mjs   # 4 passed
node qa/sparkwright.js                              # ALL OK
npm run smoke                                       # 5 games end to end, unchanged
node qa/gamecards.js                                # every card has a clip (re-shoot: node scripts/capture-clips.js sparkwright)
node qa/trophies.js                                 # saves untouched
```

## Gotchas found while integrating

1. **`MG_PARALLEL` is built once**, when `MinigameRegistry.js` evaluates, *before* `src/games/index.js` adds arcade-only rows. `index.js` pushes parallel games in (and sets `MG_SOLO_MS` from `soloMs`); without that a CLAWGames-only parallel game is invisible to Solo and Play Together.
2. **Back-to-back starts.** Solo "again" calls `start()` straight after the score callback. A delayed `_destroy` from the previous run was killing the new one. Now `start()` and the solo finish both destroy synchronously. Keep it that way.
3. **Smoke can't press START.** `QA_ONLY=sparkwright node qa/smoke.js` passes but takes about 100 s: the human seat waits at the START card and hits the 75 s DNF backstop. Either teach smoke to press any visible `#minigame-layer button` with START, or ignore it (the dedicated probe covers the game).
4. `window.__swrAutoplay = true` (QA only) makes the human seat play the solver tape too. It's set by `qa/sparkwright.js` in an init script and nowhere else.

## Done since the first merge

- **Campaign in the app (Home Base).** SOLO → Sparkwright opens the full campaign full-screen: a walkable hub with a door per shift, BACK TO BASE after every clear (at the same door, next door unlocked), ✕ in a shift returns to base, ✕ at base returns to the solo hub. Field Manual door. Saves via `Store` (`sparkwright`, schema v1).
- Arcade sprint renamed `sparkwright` → `sparksprint` so the campaign card can own `sparkwright` (clips renamed to match).
- Engine events mapped to claw-core sfx (`HubGame.js`).

- **The Workbench (v2 puzzles).** Work orders with budgets and specs, multi-slot benches, mass/cost/ratings, strip/burn failures with incident reports, ★★★ design reviews, maths only after testing. All six shifts reworked; the checker groups every bench build by effect.

## Next tasks

1. **Solo label** for the sprint: `src/arcade/Solo.js` `UNIT`: `sparksprint: 'pts'`, or a time `fmt`.
2. **Trophies (optional)**: "all shifts under par", "first fuse blown". Keep `qa/trophies.js` green.
3. **World 1/2 expansion** (DESIGN.md M1/M2): more shifts, each with a door in `levels/base.js`.

## Not verified here

- On-device feel (iPhone touch latency, safe areas in the Capacitor shell). Tested only in headless Chrome at 412×892 with touch events and at 1280×720 with the keyboard.
- Play Together across real phones (the parallel path was exercised through `SoloArena.play` locally).
- Audio: the overlay calls `sfx('mg_win')` in a try/catch; it wasn't listened to.
