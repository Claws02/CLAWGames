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
