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

## Status

- Done: `src/arcade/LairLogic.js` (the rules) and `qa/lair.mjs`: 33 checks pass. Beyond the rules,
  it plays the intended answer through (a coconut dropped in the current is carried into the
  cove and plugs vent A; across the stepping rocks to B; up over the cliff; the gull's back for
  the step; one coconut on the plate, one in the bullseye) and searches that the other ways are
  shut: 14,508 throws from the bank (none lands in the cove; every one that plugs A is carried
  there by the water), 540 straight at the vent (never), 1,890 wading or jumping strategies at
  vent B's rock (never reached), a bounce plus a trick shot off every coconut without the vent
  (6.3 high, the cliff is 8.5), and the step economy (over the step you are in with one coconut
  every time, never two, so the gull is the way).
- Design changes made while proving it: the channel is wider (cliff at 9.2, bank at 15.4) so a
  single jump can't reach vent B's rock; floating coconuts drift past rocks; only the cove's vent
  takes a floating coconut (a drift over B's rock can't spoil B); the eddy moves coconuts only,
  never a crab; the current is 6.5 and a wading crab makes 1.5.
- Done: `src/arcade/LairScreen.js` (the 3D chamber), wired into `Planet.js` (the Trick Hut opens
  the lair; a 💡 button reveals hints one at a time; the throw button is always there and says
  when the claws are empty), `qa/planet.js` plays the answer on screen. First clear pays 40
  shells; each new star 8 stardust.
- Waiting on Caleb: play it and say where it felt unfair, too easy or confusing.

## Next steps

1. Caleb plays chamber 1. Tune it from what he says (the lane the coconut can be dropped in is
   wide, so the first insight is cheap; the timing of the gull; how far the throw reaches).
2. Write down the template for chamber 2 from what was learned.
3. Then chamber 2: the next new rule (ideas: ink pools that can be crossed by a coconut raft;
   hot rock to hop across between cooling platforms; a tentacle that sweeps a bridge; bubble
   vents that lift a coconut as well as a crab).
