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

## Changes after the first play-test (Caleb on a phone)

- He fell through the floating rocks to the sea floor: rocks now have a height (`ROCK_H`) so a crab stands on top and falls off the sides, with a blink of grace for a jump off an edge.
- The vent didn't lift him: nothing said which vent was blowing, and he may never have stood on B. Standing on a quiet vent now says "only one vent blows, and it's A", and a bubble column shows the lift. The lift is tested with a held stick and a jump, not a teleport.
- A wall "broken if I go backwards": the invisible barrier at the channel's west end. It is needed (without it a crab walks the dry ledge to the cliff foot and is carried straight onto B's rock), so it is now drawn as a dam of spring rocks with a waterfall, where the current starts.
- Walking off a rock fell only 0.22 s, enough to glide across a small gap; and rocks set one downstream of another let the current deliver a crab from one to the next. Now two rocks in a straight line across the current, gaps of about 1.4 to 1.5.
- Controls: left half stick, right half camera.
- Art: the ink-outlined cartoon style (`Toon.js`).

## Old Ink, a boss fight (after the second play-test)

- He now sits on the pearl, behind the inner crystal fence, and fights from there. The chamber inside the outer gate is the arena (a ring 1.2 wide, going round him); the fence round the pearl stays shut until he is down, whatever is on the plate.
- Three rounds. In each he winds up and **slams where the crab stands** (a red ring fills, then lands; walk out of it or jump), then goes **dizzy** for 5.5 s. Only a coconut at his head in that window hurts him (awake, it bounces off). Round 1: 3 slams, 1.15 s wind-up; round 2: 4 slams, 0.95 s; round 3: 5 slams, 0.8 s. A slam that lands knocks the crab back to the edge of the arena and counts as a fall (no star), but never sends it back to a flag.
- Coconut piles keep turning up round the chamber (4 at the start, a fresh pile whenever two or fewer are lying about); the claws still hold three.
- With Old Ink down: a coconut on the plate opens the fence, and the pearl is theirs.
- Vent B lifts to 9.2 (was 10.4) against the 8.5 cliff.

### Boss fight, second version
- Dizzy no longer comes on a timer: his eight arms sway round him (`armLon`), and a coconut that hits an arm stuns it for 7 s. **Any two stunned arms** make him dizzy (5.5 s), and only then does a coconut at his head hurt him. He slams in between, with a breather every few slams.
- Aiming is by arm: arms are 10° wide and sway, so a throw has to find one.

## Tiny Planet town after night 22
- Nights flattened: night 22 is 28 stars over 23 s (was 61 over 12 s); big ones cap at 3 a night; later nights are longer (`nightLen`).
- Towers level up to 3 (GROW button beside a tower: 10 🐚 3 🥥, then 20 🐚 6 🥥): +2 charges and a wider bubble each level.
- A crab under a falling star catches it even inside a tower's bubble (the tower keeps its charge); a jump catches a big star.

### Boss fight, third version (after the third play-test)
- The arms were too hard to hit, so there is no stunning any more: **three coconuts on Old Ink's head end him**, and the arms are for dodging (slams, red ring) and for show. He is shaken for 1.3 s after each hit (a coconut then bounces off), and the next round is faster.
- **Touching him** (inside 1.45 of the pearl) knocks the crab back to the edge and counts as a fall, like a slam.
- The plate's coconut holds the pearl's fence open at once (the fence no longer waits for the fight). The pearl itself can't be taken until Old Ink is down.

### After the fourth play-test
- Old Ink can only be hit **for 1.5 s after a slam lands** (his arm is stuck in the ground and his head glows); any other time another arm swats the coconut away.
- The slide at the back of the shelf has a **rope ladder**: rolled up until the shelf's flag is reached, then it unrolls and the slide works both ways (a fall into the water no longer means redoing the vent). The coconut total stays three, so it can't carry an extra one up.
- The master plan for the next chambers is `PUZZLE_RULES.md`; the how-to is `LAIR_GUIDE.md`.

## World 1 (after the fifth play-test)
The Drowned Stair was too much as a first chamber, so it is now the **fourth** chamber and the boss of World 1, and three short
teaching chambers come first: **Coconut Beach** (pick up, jump, throw, bounce, plate), **Bubble Stream** (vents, a stream, urchins)
and **Gull Yard** (the gull's back is the way over the step; the same economy as the Stair's shelf). Two new pieces made them
possible: a step can be taller for coconuts than for the crab (`nutH`: you bounce over, nothing can be thrown over, so no coconut ends
up out of reach), and a vent that a thrown coconut can drop into (`drop`). `qa/lair-world1.mjs` plays all three and checks what
each one must teach. Every chamber is open while testing (`ALL_OPEN`).

## Coconut Beach rebuilt as a sandcastle fort (after the sixth play-test)
Caleb found it too simple, and found a soft-lock: standing on the plate (gate open) and throwing a coconut inside, then stepping
off, left it behind the shut gate. Fixed for every chamber: a coconut lying inside a shut gate rolls out to the gate's foot.
The new Coconut Beach: break a cracked sandcastle wall with two throws, ride a log across a deep moat, push a sand block to the
court wall to climb onto it, a coconut on the plate drops the red gate and the bullseye inside drops the blue one for six
seconds. Three golden shells (over the palm, on the outer wall top by the vines, over the moat). New pieces: wall tops, ledges,
vines, sand blocks, cracked walls, timed gates, switch gates, logs, deep water, golden shells (`PUZZLE_RULES.md`).
Bubble Stream and Gull Yard are next, as a river and as sea stacks, once Caleb has played this one.

## Better walls, signal lines, the arrival card (after the seventh play-test)
- Sandcastle walls are one hand-patted wall each (wider at the foot, bumpy, darker course lines, lighter top), with battlements,
  bucket-shaped towers at each end and along the way (alternate ones fly a red flag). Towers frame the cracked section and the slide.
  The cracked section is the same wall in grey stone, jagged on top, with glowing orange cracks.
- **Signal lines** (Portal 2's dotted lines): dots on the ground from every plate and bullseye to each gate it works, in the gate's
  colour; dim when off, bright with a pulse running along when on; a timed one goes dark dot by dot as its time runs out.
  Bullseyes get a ring in their gate's colour.
- **Arrival card** (Portal's chamber sign): the chamber number, world, name and an icon for every piece in it, built from the
  chamber's own data (`lairPieces` in `Planet.js`), on the right for five seconds when you arrive.

## Bubble Stream rebuilt: levels and trick shots (after the eighth play-test)
- **Bullseyes hold their gate only while a coconut is in them.** Walk into one to take the coconut back; the gate shuts again.
- **Height:** chambers can have terraces (`ledges`), ramps (a ledge with `h1`: the height runs from `h` at `r0` to `h1` at `r1`),
  shelves and stone posts (`posts`, a pillar is a tall one). Throws land level with the floor you stand on, so a throw from a
  terrace arcs out and carries further. The camera stays above terraces and looks down when a cliff is behind the crab.
- **Trick-shot pieces:** jelly pads (`pads`: a coconut landing on one is thrown up and on; a crab stepping on one is bounced),
  bank shots (coconuts bounce properly off posts, ledge sides and walls), moving bullseyes (`log: i` rides a log), hanging coconuts
  (`hangs`: knock one loose and it drops), urchins that are safe for coconuts (`nutSafe`) and `drains` that roll a coconut out of a
  place no crab can reach.
- **The new Bubble Stream** (a river valley on three levels): off the jelly pad into vent A on its shelf; ride vent B over the deep
  river onto the terrace; bank a coconut off the post down the spiked lane into the cove's bullseye (the green gate drops); up the
  ramp to the mesa; knock the hanging coconut onto the pillar's plate (or lob one) and the gold fence drops. Golden shells: on a
  post (bounce off a jelly pad), in a cage opened by the bullseye riding a log, over the river (steer through it on vent B).
- Proven by `qa/lair-world1.mjs`: the answer, and that each shortcut is shut (no direct throw into vent A, no bounce onto the mesa
  or over the gold fence, no throw over the cove wall, nothing from the terrace onto the pillar, every cove hit is a bank shot).

## The bank shot remodelled, and the goal always in view (after the ninth play-test)
Caleb found the spiked-lane bank shot confusing, skipped it with a coconut (a trick-shot bounce onto the mesa), and couldn't
see where the pearl was. Now:
- **The bank shot reads at a glance**: a painted throw spot with crab footprints, a big yellow bumper with arrows (in the way a
  coconut glances off) standing in a deep pool, and the bullseye at the end of a short chute that faces only the bumper. Yellow
  dots on the ground run spot → bumper → bullseye. The aim preview turns **green** when a throw will end in a bullseye (any
  chamber). A coconut that falls in the pool washes back up at the spot. A bullseye can be `tall` (it catches over a bigger height).
- **No skipping**: the green fence now runs round the whole mesa (the bullseye holds it open), so no bounce or trick shot gets
  onto the mesa early. `qa/lair-world1.mjs` throws at the bullseye from all over the terrace: nothing gets in except off the bumper.
- **The goal in view**: every chamber opens on the pearl and swoops over the planet to the crab (the arrival card waits until
  the swoop is done), and a 🔮 compass at the top left always points to the pearl with its distance.
- Fixed: the ground height at the very centre of a ledge read as 0, so the pearl sat inside the mesa.
- New pieces: `pools` (deep, round, coconuts wash to `to`), bumper and chute bars, `spots` (a painted throw spot and its guide).

## Small fixes (after the tenth play-test)
- The pearl compass is gone (the opening swoop shows the pearl instead).
- Bubble Stream: vent A's shelf is lower (3), and its jelly pad is now an **aimed pad** (Portal's launch pad): whatever lands on
  it is thrown onto the vent, whichever way it came in (`pads: [{ p, r, to }]`, an arrow on the pad shows where). About half of all
  throws from in front of it now plug the vent; still none plugs it without the pad. The aim turns green for a vent too.
- Coconut Beach: the cracked section of the wall is twice as wide (28°), so the way in is wider once it's broken.

## World 2: the coral caves (started)
Plan, one chamber at a time: **5 Sinkhole Reef** (holes through the planet), **6 Moon Pool** (a launch pad to a little moon),
**7 Low Tide** (the water rises and falls), **8 Ink's Deep** (Old Ink returns, with timed hazards: steam jets, crumbling ground).
Each world has its own look (`THEME` in `LairScreen.js`: World 2 has a deep teal sky, pale coral sand, sea-grass, coral walls,
kelp and coral bushes about the sand).

**5. Sinkhole Reef** (built): the beach is the far side of the planet from the pearl, so a hole straight down comes up by the pearl.
A coconut that goes into a hole comes out of the far end still flying the same way (Portal's momentum), and so does a crab: jump
in from up high and you fly out high. Blowholes are grates (coconuts only). The big sinkhole is under a crystal lid; from a painted
spot a coconut thrown into a blowhole flies up inside the reef wall into the lid's bullseye; another blowhole comes up in a walled
pit on its plate (the gold fence round the pearl). A sinkhole inside leads back out, and coconuts that end up inside while the lid
is shut wash back to the spot. Pieces: `holes: [{ p, r, nutOnly?, lid?, to? }]` (the far end is `-p` unless `to`), drains with
`unless` (only while a gate is shut). Proven in `qa/lair-world1.mjs`.

**6. Moon Pool** (built): a chamber can have a **moon** (`moon: { ...a second level }`), reached by **launch pads**
(`launch: [{ p, r, to: 'moon' | 'home', land }]`). Stepping on one flies the crab (and what's in its claws) to the other world in
`TRAVEL_S`; a coconut that lands on one flies over on its own. **Gates are shared between the worlds** (a plate on the moon holds a
fence on the planet), each world keeps its own coconuts lying about (`n.w`), and a world can have its own **gravity** (the moon's is
half: jumps go twice as high, so its crater's 2.2 rim is an easy hop). The screen is rebuilt for whichever world the crab is in
(the state carries over), and each world shows the other in its sky; the moon has a dark starry sky and craters. The answer: fly
up with the coconuts, hop into the crater, a coconut on its plate, fly home, the pearl. Golden shells: the moon's pillar (a moon
bounce), floating over the crater's far rim (a moon jump), the coral post on the planet.

### After the eleventh play-test (couldn't open the last gate in the coral caves)
- Sinkhole Reef: the pit's plate could only be reached through a blowhole back on the beach, and nothing said so. The pit's wall is
  now low (1.6: too high to jump, easy to lob over), so from inside the reef wall a coconut lobbed over it lands on the plate. The
  blowhole still works too. The aim turns green when a throw will come to rest on a plate (any chamber).
- Moon Pool: the gold fence's switch is on the moon. A gate can say so (`remote: 'moon'`): dots run from it to the launch pad, and
  coming up to it says "this fence's switch is on the moon".

**The flight to the moon** is animated now: the crab rises off the launch pad and flies across the sky to the other world (which
hangs above the pad), then comes down out of the sky onto the landing place (`s.arriving`; it can't move until it lands).

**7. Low Tide** (built): a chamber can have a **tide** (`tide: { r0, r1, high, out, rise, in, fall }`): the lagoon is sand while the
tide is out, then the water comes in to `high` and goes out again on that clock (`tideAt`, `tidePhase`; the HUD shows which way it is
going and how long until it turns). Caught on the sand below the water, the crab is swept back to its flag; coconuts there float up
with it and settle where they are when it goes out. **Rafts** (`rafts: [{ p, r }]`) sit on the sand and float up with the tide. The
answer: at low tide walk out to the raft by the mesa with the coconuts; at high tide lob one onto the lighthouse rock's plate (2.8 up:
no throw from the sand reaches it) and jump from the raft onto the mesa (4 up: nothing reaches it from the sand). Golden shells: far out
on the sand (only at low tide), on the tall rock (a jump from a raft at high tide), on the coral post (the jelly).

**8. Ink's Deep** (built, World 2's boss): Old Ink's second lair, with a darker look (`theme: 'deep'`). Two timed hazards on the way:
a bottomless **chasm** crossed on **crumbling tiles** (`chasm: { r0, r1 }`, `crumbles: [{ p, r }]`: a tile cracks when stepped on,
falls `CRUMBLE_S` later and is back `TILE_BACK_S` after that; off the tiles in the chasm, back to the flag; coconuts there are
lost), and a corridor of **steam jets** (`jets: [{ p, r, period, on, phase, boss? }]`: each bubbles for `JET_WARN` s, then fires and
scalds a crab back to its flag; `boss` jets only work while he's awake). Then the arena: a boss can be tuned per chamber
(`boss: { hits: 4, speed: 0.8, arena: 5.5 }`): four hits, faster slams, and steam jets round the arena while he's up.

## World 3: the volcano (started)
Plan: **9 Obsidian Slide** (sliding), **10 Heavy Stone** (carry a heavy rock; it presses heavy plates and cools into a stepping stone
in lava), **11 Cannon Ridge** (load and aim cannons to hit far targets), **12 The Hermit King** (a new villain, Old Ink's ally: a giant
hermit crab in a volcanic shell, with the lava rising during the fight). World 3's look (`theme: 'volcano'`): a dark red sky, black
sand, glowing lava, obsidian, embers drifting up.

**9. Obsidian Slide** (rebuilt after play-testing): v1 was a flat lake of pillars, and you could simply **jump** and walk off the
rules. v2 is a crater: you start high on the volcano's rim and work **down** a lake of obsidian in three steps to the bridge and the
pearl. Its rules live in their own pure module, **`LakeGrid.js`** (a grid: no time, no 3D), and the game just moves the crab along
what the grid says, so the search that proves a layout and the game can never disagree.
- **No jumping on the obsidian** ("your claws can't grip it": the button says so). Jumping onto the lake from the rim lands you
  sliding, under the same rules. Every move takes a fresh push of the stick (holding it after a push would slide you after the block).
- **Steps** (`levels` per row, `hs` heights): sliding down a step you drop and keep going; up a step is a wall, but for a **ramp** cell.
- **Blocks**: slide into one and you stop; push the stick at it and it slides on (down the steps too) until something stops it. It can
  go into the lava (lost: "go back to the rim to set the lake back").
- **Cracked glass**: stop on it once and it cracks; stop on it again and it breaks (lava). Sliding over it does nothing.
- **Coconuts slide too**: on the lake a throw goes two cells straight (hold THROW and push the stick to turn without sliding; the aim
  turns green when it will end on the plate), then slides on. One resting on the **yellow plate** opens the **gate** on the bridge.
  Stop on a coconut and you pick it up (off the plate, the gate shuts).
- Off the near edge onto the rim, or into the lava (back to the flag): the lake **sets back** as it was (blocks home, cracks healed).
- The layout: a search kept random layouts whose shortest way needs the push, the ramp, a stop on cracked glass and a throw, and
  where taking away the ramp, or making the block a pillar, leaves no way at all. Its 15 moves: in at column 5 and bump the block;
  push it, and it rides down the steps to stop by the bridge; round and down to the cracked cell under the plate (by the ramp); a
  coconut onto the plate; round to the block, and up the bridge. `qa/lair-world1.mjs` plays it with the stick and the throw button.

**Obsidian Slide, play-test 2** ("I can't finish it, and it isn't obvious I'm meant to place a coconut; no pop-ups to tell people
what to do"). Played through the real joystick, it worked when you knew the answer, so the problems were in reading it:
- The start faced a pillar at the lake's edge, so walking straight on bounced you back. The start is now in line with the open
  column, and coming on beside a pillar puts you in the free cell next to it.
- **Slide previews**: stopped on the glass, a dotted trail shows where each of the four ways would take you, with a mark at the
  end (white ring: you'd stop; red: lava; gold: up the bridge; blue: back on the rim), and the block's trail and where it would
  end up if it's a push. On the rim by the edge, the trail shows where coming on here goes.
- **The coconut**: one now lies on the glass at a cell you stop on (you pick it up), so none needs carrying from the palm. Holding
  one, a green arc shows any throw from where you are that would end on the plate, and the plate flashes green.
- **A way back up**: a second ramp, on the middle step, slides you back onto the rim (the lake sets back). No more being stuck
  low down with only the lava to reset it.
- **Picture signs** (`signs: [{ p, kind, look, rock? }]`, drawings in `Signs.js`): a signpost by each new thing. The board
  is a little looping picture of a ghost crab acting the rule out (slide and no jumping, push, cracked glass, the plate and gate,
  the ramp, the lava setting the lake back). It plays while you're near, and a sparkle hangs over each one you haven't visited.
  No words, nothing pops up. More kinds are drawn for World 1 (pick up, throw, bounce, vent, current, gull, bullseye, climb).
- The stick needs less of a push on the glass (a third of the way out), and cracked glass is drawn brighter.

