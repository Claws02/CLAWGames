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

## Next tasks for the code session (in order)

1. **Campaign screen in the arcade.** The full campaign only lives in `preview.html` today. Add `src/arcade/Sparkwright.js` modelled on `src/arcade/Golf.js`: level cards with best time and par star, unlocks, then `createGame(root, { level, onWin, onExit, onNext })`. Persist with `Store.load/save('sparkwright', …)` and a schema version, not raw localStorage. Add a tile or button where Golf has one.
2. **Solo label.** `src/arcade/Solo.js` `UNIT` map: add `sparkwright: 'pts'`, or a custom `fmt` that shows the time (score = round((60 − s) × 10)).
3. **Audio/haptics.** `Game.js` emits events (`jump`, `land`, `spring`, `install`, `fuse`, `stall`, `death`, `win`). Map them to existing claw-core `sfx` names. Only `mg_win` / `land_bad` are used so far.
4. **Ship size.** `scripts/build-web.js` ships all of `src/`, including `sparkwright/{tools,tests,docs,preview.html}` (small). Exclude them if you care.
5. **Trophies (optional).** "All levels under par", "first fuse blown". `qa/trophies.js` covers save migrations, so keep it green.

## Not verified here

- On-device feel (iPhone touch latency, safe areas in the Capacitor shell). Tested only in headless Chrome at 412×892 with touch events and at 1280×720 with the keyboard.
- Play Together across real phones (the parallel path was exercised through `SoloArena.play` locally).
- Audio: the overlay calls `sfx('mg_win')` in a try/catch; it wasn't listened to.
