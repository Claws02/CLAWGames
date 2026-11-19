# Old Ink's Lair: the master plan for puzzles

How a chamber works, which pieces there are (built and planned), and the ideas
for the next chambers. The step-by-step for building one is
[`LAIR_GUIDE.md`](LAIR_GUIDE.md); the story and the record of chamber 1 are in
[`LAIR_PLAN.md`](LAIR_PLAN.md).

## 1. What a chamber is

A chamber is **one small puzzle planet** (or, later, a few linked ones). The
crab starts on a beach, the Tide Pearl is at the top, and Old Ink's things are
in between. It is a puzzle, not an obstacle course:

- **A real answer.** One or two ways through, found by thinking, not by trying
  every jump. Everything else is shut by something you can see.
- **Small.** A planet you can walk round in about 20 seconds. Everything that
  matters can be seen from somewhere.
- **The same rules everywhere.** A coconut does in chamber 6 what it did in
  chamber 1. New pieces add rules; they never change old ones.

## 1b. Worlds

Chambers come in **worlds of four**: three short chambers that each teach one
thing, then a big chamber that puts them together and ends with a boss.

| World 1 | Teaches | Data |
|---|---|---|
| 1. Coconut Beach | walk, pick up, jump, throw (bullseye), bounce on a coconut, the plate | `BEACH` |
| 2. Bubble Stream | vents (only one blows; plug one by dropping a coconut in; ride a lift), a stream that carries you and floats coconuts onto urchins | `STREAM` |
| 3. Gull Yard | the gull (it dives and steals; stomp or hit it; its back bounces) | `YARD` |
| 4. The Drowned Stair 🐙 | everything above, the eddy and cove, then Old Ink | `STAIR` |

A chamber opens when the one before it is cleared (`ALL_OPEN = true` in
`LairLogic.js` opens them all while testing: turn it off for release).

## 2. The rules of the claws (fixed for every chamber)

| Rule | Value | Why |
|---|---|---|
| Carry up to 3 coconuts | `CARRY` | a "don't waste it" decision is always possible |
| Pick up by walking into one | `PICK_R`, after `PICK_AGE` | no pick-up button |
| Hold to charge, let go to throw; the arc and landing ring show | `THROW` | aim is skill, the outcome is never a surprise |
| Jump on a coconut: bounce (2.6 high, twice a jump) | `BOUNCE_V` | coconuts are tools as well as weights |
| Coconuts float and drift with a current | | water moves things |
| A coconut is never lost for good: it washes up under the palm | `RESPAWN_S` | no soft-locks |
| Hurt (spikes, a slam, a peck): back to the last flag, a fall counted | | falls cost a star, not the level |
| Three stars: the pearl, no falls, under the time | | a reason to replay |

## 3. The pieces

Each piece has **one rule**, shows that rule on screen, and says so in words
the first time it matters (`calm` vent, `🪜` ladder).

### Built (chamber 1)

| Piece | Rule | Data |
|---|---|---|
| **Wall / cliff** | can't be walked or thrown through below its height | `rings: [{ r, h, gap|only }]`, `bars: [{ a, b, h }]` |
| **Slide + ladder** | one way down; a ladder makes it both ways once a flag is yours | `way: 'out', earn: <flag>` |
| **Gate** | a wall that sinks while its switch holds | `gate: 'id'` |
| **Plate** | held while the crab or a resting coconut is on it | `plates: [{ p, r, gate }]` |
| **Bullseye** | a coconut through it opens its gate for good, and stays stuck | `targets: [{ p, gate }]` |
| **Current** | carries the crab (wading is slow) and floating coconuts one way | `currents: [{ r0, r1, only, speed }]` |
| **Eddy** | pulls floating coconuts into a cove (never a crab) | `eddies: [{ p, r, to, speed }]` |
| **Vent** | only the first unplugged vent blows; a lift vent carries a crab up | `vents: [{ id, p, r, lift?, float? }]` |
| **Stepping rock** | stand on top (`ROCK_H`); fall off its sides | `rocks: [{ p, r }]` |
| **Urchin** | touch it: back to the flag; a coconut is lost (washes up) | `urchins: [{ p, r }]` |
| **Gull** | steals a coconut, or pecks you to the flag; jump on it or hit it: stunned, drops its loot; its back is a bounce | `gull: { ring, from }` |
| **Old Ink (boss)** | slams where you stand (red ring); for 1.5 s after a slam his head is open to a coconut; three hits; touching him hurts; piles keep coming | `boss: true`, `BOSS` |

### Built for the new Coconut Beach (World 1)

| Piece | Rule | Data |
|---|---|---|
| **Wall top** | a wall you can stand on and walk along once you get up there | ring `top: true` |
| **Ledge** | a raised terrace (a ring sector) you stand on; walking off its edge drops you | `ledges: [{ r0, r1, only, h }]` |
| **Vines** | climb a wall where its vines are, **with empty claws** (it says so if they're full) | ring `vine: [lon, half]` |
| **Sand block** | push it by walking into it; it stops at walls, other blocks and water; stand on it (1 high) | `blocks: [{ p }]` |
| **Cracked wall** | breaks after `hp` coconut hits | ring or bar `hp, id` |
| **Timed gate** | a bullseye with `secs` opens its gate for that long, then drops the coconut | target `secs` |
| **Switch gates** | a plate or bullseye can work several gates (`gate: ['a','b']`); an `inv` gate is up only while its switch holds | `gate: [...]`, ring `inv` |
| **Floating logs** | drift round a ring; ride one (it carries you) | `logs: [{ orbit, lon0, speed }]` |
| **Deep water** | step in: back to the flag; a coconut in it sinks and washes up under the palm | current `deep: true` |
| **Golden shells** | hidden collectibles at a height; touch to take; saved per chamber | `gold: [{ p, h }]` |
| **Never lost** | a coconut lying inside a gate that shuts (with the crab outside) rolls out to the gate's foot | (always) |

### Built for the new Bubble Stream (levels and trick shots)

| Piece | Rule | Data |
|---|---|---|
| **Terrace / ramp / shelf** | raised ground; a ramp's height runs from `h` to `h1` | `ledges: [{ r0, r1, only, h, h1? }]` |
| **Stone post / pillar** | a column: coconuts bank off it, you can't walk through; stand on top if you get up there | `posts: [{ p, r, h }]` |
| **Jelly pad** | throws a landing coconut up and onward; bounces a crab | `pads: [{ p, r }]` |
| **Bullseye holds its gate** | the gate is open only while a coconut is stuck in it; walk into it to take it back | (always) |
| **Moving bullseye** | rides a log | target `log: i` |
| **Hanging coconut** | knock it with a thrown one and it drops (onto a plate below) | `hangs: [{ p, h }]` |
| **Drain** | a coconut coming to rest in a place no crab can reach rolls out to `to` | `drains: [{ p, r, to }]` |
| **Coconut-safe urchins** | hurt the crab, not coconuts (for lanes a coconut must travel) | urchin `nutSafe` |

### Built for World 2

| Piece | Rule | Data |
|---|---|---|
| **Sinkhole** | step (or fall) in: out of the far side of the planet (`-p`), popped up; the faster you fell in, the higher you come out | `holes: [{ p, r }]` |
| **Blowhole** | a grate: coconuts go through (still flying the same way), a crab walks over | hole `nutOnly` |
| **Lid** | a hole is shut until its gate opens | hole `lid: 'gate'` |
| **Aimed jelly pad** | whatever lands on it is thrown onto `to` | pad `to` |
| **Conditional drain** | only while a gate is shut | drain `unless` |

### Built for World 3 (the obsidian lake, `lake: {...}`, rules in `LakeGrid.js`)
| Piece | What it does | In the recipe |
|---|---|---|
| **Obsidian lake** | a grid you slide across, no walking, no jumping; one push of the stick = one move | `lake: { rows, cols, r0, dd, lon0, dl, levels, hs, exit, lava }` |
| **Steps** | rows at different heights: slide down and keep going; up is a wall | `levels: [...]` per row, `hs: [...]` heights |
| **Ramp** | the one way up a step (slide at it) | `ramps: [[r, c]]` |
| **Pillar** | stops a slide in the cell before it | `pillars: [[r, c]]` |
| **Block** | stops you; push it and it slides until stopped (down steps, into lava) | `blocks: [[r, c]]` |
| **Cracked glass** | one stop cracks it, a second breaks it: lava | `cracks: [[r, c]]` |
| **Plate + gate** | a coconut resting on the plate opens the gate on the bridge (exit) | `plates: [[r, c]]` |
| **Sliding coconut** | thrown on the lake: two cells out, then slides; stop on one to pick it up | (always) |

| **Coconut on the glass** | lies on a cell from the start; stop there to pick it up | `nuts: [[r, c]]` |

Prove a lake with `LakeGrid.solve(z, nuts)` (breadth-first over the grid rules, blocks, cracks and coconuts included), and check
each piece matters: `solve` with the ramp taken away, or the block made a pillar, must find nothing.

### Built for Low Tide
| Piece | What it does | In the recipe |
|---|---|---|
| **Floating island** | a ledge that rises and falls with the tide; what's on it rides along | `ledges: [{ ..., ride: true }]` |

### Teaching without pop-ups
| Piece | What it does | In the recipe |
|---|---|---|
| **Picture sign** | a signpost whose board loops a little picture of a ghost crab doing the rule; plays when you're near; a sparkle until visited | `signs: [{ p, kind, look, rock? }]`, kinds in `Signs.js` |
| **Previews** | show what a move would do before you make it (the lake's four trails, the green throw arc) | built in where a move is on a grid |

### Planned (each is one new rule)

| Piece | Rule | Puzzle it makes |
|---|---|---|
| **Sand hole (through the planet)** | jump in, come out of its twin hole on the far side of the planet (the antipode, `-p`) with the same speed; a thrown coconut goes through too | throw a coconut into a hole to reach a plate on the far side; drop through to skip a wall, but you arrive where you can't come back |
| **Moon / second planet** | a launch pad (a big vent, or a cannon shell) flies the crab to a small moon; coconuts carried go with it; each planet keeps its own state | fetch something from the moon (a key pearl, a heavy coconut) and bring it home; a plate on the moon opens a gate on the planet |
| **Tide** | the water rises and falls on a clock; low tide shows a path, high tide floats coconuts off the sand | wait for the tide, or use it to carry a coconut somewhere you can't throw |
| **Clam** | snaps shut on a coconut and holds it; opens when hit by a second | a coconut "safe" that keeps a plate pressed |
| **Jelly** | a soft pad: a crab bounces higher than off a coconut; a coconut bounces off it | bank shots, and reaching a high ledge without spending coconuts |
| **Seaweed** | slows the crab to a crawl; coconuts stick in it | a coconut wall that stops one sliding into the water |
| **Heavy coconut (stone)** | can't be thrown far, sinks in water, holds a plate even underwater | the "weight" puzzles where a floating coconut would drift away |
| **Crab helper** | a little crab that walks to wherever a coconut lands and sits on it | holds a plate for you while you are elsewhere |
| **Wind gust** | pushes coconuts in flight one way on a clock | aim upwind; timing |

## 3b. Making each world (and each chamber) its own place

Each world has **one look** (World 1: a sunny tropical island: sand, palms, sandcastles, blue water). What makes the
four chambers of a world feel different is their **shape** (topology), not their paint:

| Shape | What it is | Feels like | Good for |
|---|---|---|---|
| **Rings** (the Drowned Stair) | walls in circles round the pearl | climbing a tower, layer by layer | a clear order of steps |
| **Fort** (Coconut Beach) | rings plus things to climb: wall tops, vines, a block, a moat with logs | breaking into a castle | several pieces, one route |
| **River** | a river winding from pole to pole cuts the planet in two halves, with islands | a journey along a stream | crossing, carrying, the current as a tool |
| **Sea stacks** | tall pillars (ledges) with gaps between them | hopping between rooftops | jumping, the gull's back, wall tops |
| **Crater** | the pearl sits low in a bowl; you go *down* to it | descending into a cave | ledges in steps, things rolling downhill |
| **Two halves** | a wall from pole to pole; each half has half the answer | a puzzle with two rooms | switches on one side, gates on the other |
| **Hole through** | sand holes join the two sides of the planet | a secret passage | the Sinkhole idea |
| **Moon** | a second little planet you fly to | a trip | multi-planet chambers |

Suggested for World 1: Coconut Beach = **fort**; Bubble Stream = **river** (the stream winds round the planet and you ride
logs and vents along it); Gull Yard = **sea stacks** (pillars, the gull nests on the top one); Drowned Stair = **rings**.
Planet size, sky colour and the props near the start (a shipwreck, a waterfall, a lighthouse, a coral cave) make the
first look of each chamber different too.

## 4. Rules for designing a chamber

1. **One new thing to discover.** Every chamber teaches one piece (or one
   new use of an old piece). It is the "aha".
2. **A hazard used as a tool.** The current that drowns you carries your
   coconut; the gull that steals is a stepping stone.
3. **One skill section.** A jump across the stepping rocks, a dodge of a slam.
   Short, fair, with a flag before it.
4. **One "don't waste it" decision.** Three jobs and two coconuts; the answer is
   a coconut you didn't think of (the gull's back).
5. **Every shortcut shut by something natural.** A cliff, a dam, a cove wall,
   a spike reef: never an invisible wall. If a wall is needed, it is drawn and
   it makes sense (the dam of spring rocks).
6. **Nothing is a dead end.** From every place the crab can stand there is a
   way back (the slide, a coconut to bounce on, the ladder once earned).
7. **No soft-lock.** Coconuts wash back; coconuts never rest where no one can
   reach (wash them out to a reachable ring); the palm always has three in the
   chamber in total.
8. **Everything visible.** The gold arrow over every loose coconut; a column
   of bubbles on a lift; a red ring before a slam; a fill on a charge.
9. **Words for silent state.** If a thing does nothing because of something
   elsewhere (a vent that is calm because the other one blows), it says so the
   first time.
10. **The boss is a test, not a lottery.** One clear tell (the ring), one clear
    opening (the head after a slam), and the rounds get faster.

## 5. Chamber ideas (pick one to build next)

| # | Name | New thing | The answer in one line |
|---|---|---|---|
| 2 | **The Sinkhole** | sand holes through the planet | the plate is on the far side behind a wall: throw a coconut into the hole so it comes out and rolls onto the plate |
| 3 | **Moon Tag** | a moon, and a launch vent | the bullseye is on the moon; fly there with one coconut, hit it, fly back while its gate is open |
| 4 | **Low Tide** | the tide clock | at low tide carry a coconut across the flats and leave it by the plate; at high tide it floats onto the plate |
| 5 | **Clam Bank** | clams | a clam holds a coconut on a plate for you, so you can go round with the other two |
| 6 | **Two Gulls** | two gulls, one nest | lure one gull into the other's dive so both are stunned at once, and bounce up their backs |
| 7 | **The Far Side** | moon + hole together | drop through the planet to a pad that only launches from below; land on the moon behind Old Ink's wall |
| 8 | **Ink Rising** (boss 2) | Old Ink in the water, the tide | he rises with the tide; slam windows only at low tide |

## 6. Multi-planet chambers (how they work)

- A chamber can list **several planets**: `planets: [{ id, R, ...pieces }]`,
  and **links**: `links: [{ from: { planet, p }, to: { planet, p }, kind: 'launch' | 'hole' }]`.
- Each planet keeps its own state (coconuts lying, plates, gates). The crab
  and what it carries move between them.
- A switch on one planet may open a gate on another (`gate` ids are shared
  across the chamber).
- The camera flies with the crab between planets (the same as Tiny Planet's
  launch to a puzzle planet), so you always see where you went.
- Coconuts thrown at a link go through it too (into a hole, onto a launch pad).

## 7. Sand holes (how they work)

- A hole is a place `p` with a radius. Its twin is **`-p`**, the far side of
  the same planet (or a named spot on another planet).
- A crab that walks into a hole (on the ground) drops in and pops out of the
  twin with a small jump, facing the same way it was going.
- A coconut that lands in a hole comes out the twin and rolls a little.
- A hole is drawn as a dark ring of sand with a glow on the far side's twin,
  so you can see where it leads before you jump.
