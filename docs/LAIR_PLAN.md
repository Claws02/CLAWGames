# Old Ink's Lair: plan and status

The puzzle game inside Tiny Planet, entered through the Trick Hut. It replaces the first
Coconut Trials, which are archived in `src/arcade/archive/` (see the README there).

**Rule for this work:** make ONE chamber a real puzzle, prove it, have Caleb play it, tune
it, and only then write more chambers from what was learned.

## Story

Old Ink, a giant octopus (the crab's natural predator), has stolen the Tide Pearl that kept
the planet's tides gentle. Without it the sea runs in rip currents. The Trick Hut stands over
the mouth of his lair; each chamber is a small puzzle planet; seagulls are his lookouts.

## Decisions Caleb made

- Villain: Old Ink the octopus, with seagull allies. Gulls can be beaten by jumping on them
  (while they dive or walk) or hitting them with a coconut.
- Coconuts are collected, the crab holds at most 3, and throwing is always available while
  it holds one. A thrown coconut is picked up again by walking to it. One lost off the map
  respawns.
- "Jobs keep them": a coconut doing a job stays there (plugging a vent, on a plate, stuck in
  a bullseye). So the puzzle is which coconuts can be got back, and in what order.
- A gull that catches you steals one coconut; bonk it and it drops it. With nothing to steal
  it knocks you back to the last flag.
- Chambers are small planets (not flat rooms), to match the rest of the game.
- Retire the old trials but archive them; some pieces are worth reusing.
- Water is not a floor that kills: it is a current that carries you onto urchins. Things you
  can't touch come from the villain's world (urchins, ink, tentacles, hot rock).
- Only a couple of ways through; every shortcut shut by something natural.

## Chamber 1: The Drowned Stair (`STAIR` in `src/arcade/LairLogic.js`)

Layout, by distance from the top of the planet (the pearl):

| Distance | What |
|---|---|
| over 13.2 | the beach: start, the palm and the chamber's three coconuts |
| 9.2 to 13.2 | the rip channel, running east to an urchin reef; stepping rocks out to vent B's rock; vent A in a walled cove on the far side, downstream |
| 9.2 | the cliff (8.5 high: no jump, bounce or trick shot clears it) |
| 5.6 to 9.2 | the shelf, where the gull walks; a one-way slide back to the beach |
| 5.6 | the tall step (2 high: a jump won't clear it, a bounce will) |
| inside | a pressure plate (holds the inner gate) and a bullseye (opens the outer gate) |
| 3, 1.8, 0 | the two gates, and the pearl |

The answer:
1. Vents share pressure: only the first unplugged one blows. A is open, so A blows uselessly.
   A coconut can't be thrown into A (the cove's wall), but one dropped in the FAR side of the
   current UPSTREAM is carried into the cove and plugs it. The hazard is the tool.
2. Now B blows. Across the stepping rocks, onto B, lifted over the cliff, carrying two.
3. Up there are three jobs (step, plate, bullseye) and two coconuts. So the step is climbed
   by jumping on the gull's back, and the coconuts go on the plate and into the bullseye.

## Status when paused

- Done: `src/arcade/LairLogic.js` (all the rules above: carrying and picking up coconuts,
  the current, eddy, urchins, rocks, linked vents and the lift, the gull, plates, bullseyes,
  gates, flags, the one-way slide).
- In progress: `qa/lair.mjs`, the proof. 15 of 30 checks fail. Most cascade from the first:
  the scripted answer's opening throw doesn't end with vent A plugged, so everything after it
  in `solve()` fails too. The search check shows 1615 of 14508 bank throws DO plug A, so the
  mechanic works; the script's aim (or the eddy's reach, or where the throw lands) is off.
  Other things the output suggests need a look:
  - a crab that wades in is not reaching the urchins (it may be stopping somewhere);
  - some plugging throws land as far round as 74 degrees (the cove is at 70): tighten the
    eddy or the cove's mouth so only upstream drops work;
  - a coconut lost to the urchins isn't ending up back under the palm in that test;
  - wading can reach vent B's rock from the bank, which should be impossible.
- Not started: `LairScreen.js` (the 3D), wiring into `Planet.js`, the browser probe, docs.
- The app still plays the archived trials (Planet.js imports them from `archive/`), so
  nothing is broken while this is unfinished.

## Next steps, in order

1. Get `node qa/lair.mjs` to pass: fix the rules or the level until the answer plays through
   and every "other way" check holds. Tune the level, not the tests, where the test states
   the intended design.
2. `src/arcade/LairScreen.js`: the scene for a chamber, on Tiny Planet's renderer (start from
   `archive/TrickScreen.js`). New things to draw: the current (moving streaks), urchins,
   rocks, vents with bubbles (and the cove), the cliff, the palm and coconuts, the gull (its
   shadow and landing ring are the telegraph), the plate, bullseye, gates, the pearl, and
   Old Ink behind the last gate. HUD: coconuts held (up to 3), a hint button that reveals
   `hints` one at a time, restart.
3. Wire into `Planet.js` in place of the trials: the Trick Hut opens "Old Ink's Lair" with the
   story and chamber 1. First clear pays shells and stardust into the city.
4. Browser probe: enter through the hut, pick up coconuts, throw, and play the answer on
   screen. Update `qa/planet.js`, README, `docs/STATUS.md`. Smoke. PR with a "Play it" line.
5. Caleb plays it. Tune. Then write down the template for chamber 2.
