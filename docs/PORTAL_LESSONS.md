# What Portal teaches about laying out puzzle rooms

Notes on how Valve built Portal and Portal 2's test chambers (from the games, their developer commentary and the
designers' talks), and what each idea means for Old Ink's Lair. Each idea ends with **For us:** a concrete change.

## 1. Every room is one idea, taught in four beats

Portal introduces a new element in a room where it can't hurt you, then makes you use it, then twists it, then mixes
it with what you already know. Each chamber is short and has one "aha".

1. **Teach**: the element alone, safe. (The first energy ball room: the ball bounces into its catcher on its own.)
2. **Test**: you have to use it once to get out.
3. **Twist**: the same element used in a way you didn't expect (fling yourself with momentum, not just walk through).
4. **Combine**: with an older element.

**For us:** each world is four chambers that follow those beats for its new element. World 1: Coconut Beach teaches
throwing and climbing, Bubble Stream the vents and water, Gull Yard the gull, the Drowned Stair combines them. Inside a
chamber, the first time a piece appears it should be harmless (the first cracked wall is at the start, with nothing
around it).

## 2. A sign at the door says what's inside

Every Portal chamber opens with a lit sign: the chamber number, and icons for what's in the room (cube, button,
energy ball, acid, turret, "fling"). You know the ingredients before you start, so you look for them.

**For us:** a **chamber card** when you arrive: the name, and icons for the pieces in it (🥥 throw, 🧱 cracked wall,
🌿 vines, 📦 block, 🪵 logs, 💧 deep water, 🫧 vent, 🐦 gull, ⏱ timed gate, ✨🐚 ×3). It costs nothing and turns
"what am I meant to do?" into "where is the block?".

## 3. Lines show what connects to what

In Portal 2 a dotted line on the floor and walls runs from each button to the door, bridge or light it works. It
turns from blue to orange when the button is pressed. You never wonder which button opens which door.

**For us:** **signal lines** on the ground from each plate and bullseye to its gate, in the gate's colour, lighting up
when it's held. A timed one counts down along the line.

## 4. One consistent surface language

Portal's white panels take portals; black metal and dark tiles never do. Grates let things through and stop you; the
emancipation grill (a fizzler) lets you through but takes away what you carry. Once learned, you read a room at a
glance.

**For us:**
- **Cracked** walls are always grey stone with orange cracks and rubble at their foot.
- **Climbable** means vines, always the same green.
- **Pushable** blocks are always the same sand block with a darker band.
- **Deep water** is darker blue than the shallow stream.
- A **waterfall curtain** is our fizzler: you can walk through it, but it washes the coconuts out of your claws.
  (It's the same rule as "the vines need empty claws", made visible.)
- And one rule never to break: a thing that looks usable must be usable (our ramp that wasn't real).

## 5. Show the goal first

Most Portal chambers let you see the exit door from the entrance, or from the first ledge. You spend the room working
out *how* to get there, never *where*. Valve also places the key element in your first view (lighting, a window, the
first thing the camera faces).

**For us:** the first view of every chamber should frame the pearl and the first thing to do. The start faces the
pearl, and the camera's first sweep (it already flies in from far out) can pass over the key piece (the cracked wall,
the vent, the gull's nest).

## 6. Many different ways to fail, each with its own warning

Portal's hazards are all readable before they hurt you: acid/goo (glowing green: don't touch), turrets (red laser
sight, a voice), energy balls (a glowing ball, a hum), crushers (a tell before they slam), bottomless pits (you see
them), lasers and thermal beams (Portal 2), and the fizzler that takes your cube. Each one is a different problem:
something to avoid, something to dodge on timing, something to block, something to use.

**For us:** a menu of hazards so each chamber can feel different, each with its tell:

| Hazard | Tell | Problem it makes |
|---|---|---|
| Urchins (built) | spikes, angry eyes, bristle when near | avoid; a current carries you onto them |
| Deep water (built) | dark blue | don't fall in; logs to cross |
| The gull (built) | shadow and red ring | dodge, then use its back |
| Old Ink's slam (built) | red ring that fills | dodge on timing |
| Crumbling sand | cracks appear, then it drops 1 s after you step on it | keep moving |
| Steam jets | bubbles a beat before they fire | timing; also a launcher when timed right |
| Rolling coconut boulders | rumble, a path of dents | dodge, or use one to press a plate |
| Crab-pinching clams | an open mouth | don't stand in it; a coconut jams it shut |
| Tide | the water line creeps up | do it before the tide comes |
| Splash curtain (fizzler) | a waterfall | lose what you carry |

## 7. Buttons in many places, not always where you'd expect

Portal varies where its buttons are and what presses them. The same "weighted button" becomes a different puzzle:

- **Out of reach**: across a pit or up on a ledge, so you have to get the cube there (fling it, carry it up).
- **Behind glass**: you can see it, you can't walk to it; the cube has to go through a portal.
- **Needs to stay pressed**: so you can't stand on it yourself (you have to be elsewhere).
- **Timed pedestal buttons**: press and run.
- **Two buttons at once**: two cubes, or you on one and a cube on the other.
- **On a moving platform**: the button travels.
- **The button is the obstacle**: pressing it opens one door and shuts another.
- **Cube dispensers** respawn a lost cube, so there are no dead ends.

**For us**, places for plates and bullseyes:
- a plate **on a ledge** you must climb to (or lob a coconut up to)
- a plate **across deep water** (throw one onto it, or carry it over on a log)
- a plate **on a log** that drifts past a gate; it's only open while the log is in the right place
- a plate **behind a fence you can see through** (a lattice): throw over it
- **two plates at once** (a coconut on each, or you on one)
- a bullseye **seen only from a wall top**
- a bullseye **behind you**, so you have to turn round
- a plate that opens one gate and **shuts another** (our switch gates)
- a timed bullseye **far from its gate**, so you must plan the run first
- the palm is our cube dispenser (coconuts always come back); later worlds could have a coconut chute.

## 8. Rooms look different because of their shape and their props

Portal's chambers share one style (clean white panels) but differ by shape: tall shafts, wide pits, rooms with a
high observation window, rooms split by a glass wall, rooms that move. Portal 2 broke them apart (overgrown, the old
1950s Aperture, moving panels), and each era has its own look.

**For us:** one look per world, a different shape per chamber (`PUZZLE_RULES.md` §3b: fort, river, sea stacks,
rings, crater, two halves, hole through, moon). Props near the start make the first look different: a shipwreck, a
waterfall, a lighthouse, a coral cave.

## 9. Fail fast, come back fast

In Portal, death is instant and the reload is a few seconds, from just before the hard part. You lose nothing but a
little time, so you try things.

**For us:** flags before every hard part (we have them), and a fall costs only the star for "no falls". Keep it that
way.

## 10. Playtest and remove

Valve playtested every chamber over and over, and cut whatever confused people. They added hints in the room itself
(a line, a light, a sound) rather than in words, and removed red herrings: everything in a room is there for a reason.

**For us:** after each play-test, write down every place you got stuck or confused, and fix it in the room (a line, a
sign, a colour) before writing a hint. Nothing in a chamber should be decoration that looks usable.

## What to build next, in order

1. **Signal lines** from plates/bullseyes to gates (§3). Small, and it makes every chamber clearer.
2. **Chamber card** with the piece icons (§2).
3. **New plate and bullseye placements** in the next chambers (§7).
4. **Two new hazards** for Bubble Stream and Gull Yard: crumbling sand and steam jets (§6), plus the splash curtain (§4).
5. **First-view framing**: the intro camera passes over the key piece (§5).
