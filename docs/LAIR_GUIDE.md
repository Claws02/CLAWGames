# Building a new Lair chamber: the guide

Everything we learned getting chamber 1 (The Drowned Stair) right, as steps
and a checklist. The rules and the ideas are in
[`PUZZLE_RULES.md`](PUZZLE_RULES.md).

The files:

| File | What goes there |
|---|---|
| `src/arcade/LairLogic.js` | the rules (no DOM, no three.js) and the chamber recipe (`STAIR` and the next ones), and `CHAMBERS` |
| `src/arcade/LairScreen.js` | the 3D in the ink-outlined style (`Toon.js`), events → sounds, pops, hints |
| `src/arcade/Planet.js` | the HUD, the hint button, the win card (stars, shells, stardust) |
| `qa/lair-solve.mjs` | helpers that play like a thumb (`go`, `hop`, `face`, `chargeFor`, `findThrow`) and the player that solves each chamber |
| `qa/lair.mjs` | the proof: the answer, the shut shortcuts, the thumb tests |
| `qa/planet.js` | the browser probe: enter, play the answer on screen, win card |

## Step 1. On paper first

Write these five lines before any code:

1. **The new thing** (one piece, or one new use).
2. **The answer**, as numbered steps.
3. **The shortcuts** a player will try: every one you can think of (throw at
   it directly, wade across, jump from the bank, bounce, trick shot, go round
   the back, walk along a ledge, carry more coconuts up).
4. **What shuts each shortcut** (it must be something you can see).
5. **The coconut count** at each step (in hand, working, lying).

Then check the plan against `PORTAL_LESSONS.md`: one idea taught in four beats; the goal visible from the start; each
piece in its usual colour; a hazard with a tell; plates and bullseyes somewhere that makes them a puzzle; nothing that
looks usable but isn't.

## Step 2. The recipe

A chamber is data in `LairLogic.js`. Place things with `at(d, lon)` (`d` ground
units from the pearl, `lon` degrees round). Keep R = 6.5 unless there is a
reason.

```js
export const SINK = {
    id: 'sink', name: 'THE SINKHOLE', start: at(18.4, 0), goal: TOP, palm: at(17.7, -42),
    story: '…', hints: ['…', '…', '…', '…'],     // 4–6, from gentle to the answer
    checks: [at(18.4, 0), …], rings: [...], rocks: [...], vents: [...], plates: [...], targets: [...],
};
export const CHAMBERS = [STAIR, SINK];
```

## Step 3. A new piece (only if the chamber needs one)

- Add its data field and its rule in `step()` (or `_nut()` for coconuts).
  One rule. Push an **event** for everything that happens (`{ type: 'plug' }`).
- Never change an old piece's rule. If chamber 1's tests change, stop.
- If the piece only acts on coconuts, say so in its code and test it with a
  crab in it (the eddy once trapped the crab).
- If it has a height, the crab stands **on** it (`floorAt`), and falls off.

## Step 4. The 3D

- Use `Y.prop` (merged shapes, one outline) and `Y.instanced` (walls) from
  `Toon.js`. Outlines come from `LINE`; don't set thickness per piece unless it
  looks wrong.
- Draw every wall the rules have. **An invisible wall is a bug**, even if it
  is needed: draw it as something that makes sense (a dam, a cove wall).
- Keep pieces apart: walls inset off the water, nothing overlapping. Check
  each piece from the crab's camera in screenshots.
- Every event gets feedback: a burst, a sound, a pop, and the first time a
  hint in words.

## Step 5. The proof (`qa/lair.mjs`)

Write these, in this order. They are what found every bug in chamber 1:

1. **The answer played through** by the solver in `lair-solve.mjs`, with a
   note at each step. Run it twice: it must go the same way (nothing random).
2. **Each shortcut shut**, by search, not by one try:
   - every throw from along the bank (positions × aims × charges);
   - every wade/jump strategy;
   - a bounce and a trick shot off a coconut handed over at the perfect moment.
3. **Thumb tests: a held stick and the jump button, never a teleport.**
   Landing on a rock, walking off its edge, a lift with the stick held, a lift
   with the stick let go. (Teleporting a crab onto a vent hid the "vent doesn't
   lift me" bug.)
4. **Never stuck**: from every area there is a way back; nothing rests out of
   reach; the coconut count is always 3 in total.
5. **The economy**: at the hard step, how many coconuts can you have? (Over
   the tall step you are always inside with one, never two.)
6. Re-run the shortcut searches **after every tuning change** (making vent A
   easier, moving a rock, removing a wall): removing the dam once opened 16
   free routes.

## Step 6. The screen

1. `npm run serve`, then `node qa/planet.js` (the browser probe plays the
   answer on screen and checks the win card).
2. Screenshots from the crab's view of each piece (`scratchpad` scripts like
   `lair-chars.js`, `boss-shots.js`): is everything visible, is anything
   overlapping, can you see every coconut?
3. Check five screen sizes (320×568 up to 844×390 landscape): no button off the
   screen.

## Step 7. Ship

`npm run smoke`, every `qa/` probe, docs (`STATUS.md`, `LAIR_PLAN.md`), merge
`origin/main`, push, one PR with a "Play it" line and a plain list of what
wasn't checked (a real phone; how it feels to a person).

## The pitfalls we hit (check each one)

| What happened | The rule now |
|---|---|
| The crab "fell through" the floating rocks | things with a height have a floor (`ROCK_H`, `floorAt`) |
| "The vent doesn't lift me" | test the lift with a held stick; say when a vent is calm and which one blows |
| "A broken wall I can't do anything with" | never an invisible wall; draw it as something real (the dam) |
| "The ramp isn't real" | a thing that looks usable must do something (the slide's ladder, earned at the shelf) |
| Walking off a rock glided across a gap | gaps bigger than a fall can glide; rocks in a line across a current, not downstream |
| The eddy trapped the crab | say which pieces act on coconuts only, and test a crab in them |
| A coconut stuck where nobody could reach | wash coconuts out of unreachable places (inside the fence → the arena ring) |
| Coconuts hard to find | a gold arrow over every loose coconut, drawn on top |
| Vent A too hard to plug | tune by counting: how many of all bank throws plug it (now ~69%) |
| The vent shot the crab far too high | measure the peak against the wall height (9.2 against 8.5) |
| The boss's fence ignored the plate | a boss never overrides a puzzle piece; gate the *goal* instead (the pearl can't be taken while he is up) |
| The arms were too hard to hit, then the head too easy | one clear opening: right after his slam, 1.5 s |
| Night 22 was impossible | check difficulty curves at the far end (stars grew with day²) |
| Outlines too heavy | one global `LINE` in `Toon.js` |
| A test bot that aims perfectly says nothing about feel | say so in the PR; tune after a person plays |
| The cracked wall was hard to find | each piece has one look, readable before you touch it (grey stone, orange cracks, rubble, a ring on the ground, a hint when near) |
