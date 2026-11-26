# Archive

Things that were playable and have been retired, kept for the pieces worth reusing.

## The first Coconut Trials (`TrickLogic.js`, `TrickScreen.js`, `qa/archive/trick.mjs`)

Ten puzzle planets entered through Tiny Planet's Trick Hut: six coconut puzzles (stepping
stone, raft, weight, bullseye, bank shot, mid-air trick shot) and four skill courses
(sweeper arms, rafts, sinking stones, gates on a beat, springs, checkpoint flags). Retired
in favour of Old Ink's Lair (`LairLogic.js`), where each chamber is one real puzzle.

Worth lifting from here: the wall / moat / pad / sweeper / beat-gate rules, the bank-shot
reflection, `autoplay()` (a player that looks a second ahead and proves a course can be
finished), and the scene pieces in `TrickScreen.js`.

`node qa/archive/trick.mjs` still passes. Nothing in the app imports these files.

## The lair's talking locals (`LairLocals.js`)

Grandpa Turtle (World 1), Pip the seahorse (World 2) and Hermie the hermit crab
(World 3): one to three a chamber, each by a new thing, talking you through it in a
comic speech bubble that opened as you walked up. Retired ("archive the turtle
directions"); the chambers now teach by their layout, the picture signs that are
left, and the 💡 hints. The file keeps each chamber's lines (`LOCALS`, by chamber id)
and the screen code that drew the three characters and their bubbles (`BUILD`,
`UPDATE`), with a note on where it went. Nothing in the app imports it.

The arrival card (the chamber number, name and piece icons sliding in on the right) was
removed at the same time, not archived: it was built from the chamber data, so it can be
rebuilt from `git log -S lairPieces` if it is ever wanted again.
