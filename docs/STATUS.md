# CLAWGames: where things stand

Last updated 2026-11-16. Live at **https://claws02.github.io/CLAWGames/** (GitHub
Pages from `main`). For the design and its history read [`DESIGN.md`](DESIGN.md); to
audit and harden the online version read [`ONLINE_AUDIT.md`](ONLINE_AUDIT.md).

## What shipped in the TV / party / online push

| PR | What |
|---|---|
| CLAWGames #35 | **TV host mode**: a laptop tab cast to the TV hosts a room without a seat; room code + QR join link (`?join=CODE`); the first phone in is the **captain** and drives the wheel. **Pass the phone**: up to 4 players on one phone. **Drinking mode** (tap the 🦀 five times) |
| claw-core #38 | Balloon Pump, Pancake Stack, Shell Game playable across phones; Shell Game faster and a knockout |
| CLAWGames #36 | The full-screen **DRINK card** after every round in every mode; the host's **🍺 DRINKING MODE** switch in rooms and on the TV; **rooms of up to 12** |
| claw-core #39 | Kart GP, Speed Boat, Rift Dive as **time trials with live ghosts** on bigger courses |
| CLAWGames #39 | Room `GHOST` messages; the TV's live running order |
| CLAWGames #37 | **Stop the Clock**, **Higher or Lower** (online-only games) |
| CLAWGames #38 | **Trivia**: 167 questions, Massachusetts-flavoured general knowledge |
| CLAWGames #40 | **HOST PLAYS TOO** switch: a phone host can run the room without playing |
| CLAWGames #41 | **iPhone Add to Home Screen**: manifest, icons, the Share → Add to Home Screen tip |
| CLAWGames #60 | **Old Ink's Lair**: the first real puzzle chamber (The Drowned Stair); the old Coconut Trials archived |
| CLAWGames #59 | **Tiny Planet**: boardwalks with timing obstacles, checkpoints and three tiers; four skill courses in the Coconut Trials; a readable bank shot; towers beside buildings |
| CLAWGames #58 | **Tiny Planet**: the city of crabs (town steps, jump, the action button, boardwalk courses, full screen, pause and save), and **Old Ink's Lair** through the Trick Hut |
| CLAWGames #57 | **Tiny Planet**: a 3D solo game with a workshop of upgrades kept between runs. **Reef Drop**: 8 more pieces and 36 more reefs (114 in all) |
| CLAWGames #55 | **Quick board games** on a shared base (`src/games/board/`): Shut the Box, Pig, Dots and Boxes, Mancala, Liar's Dice |
| CLAWGames #76 | Five more quick board games: Tide Lines, Big Grid, Hot Dice, Claw Race, Kelp Maze |
| CLAWGames #79 | **Code Breaker** and **Chomp Champs** (tap to chomp your colour); Claw Race on a 48-square reef with safe islands, instant surprises and swaps you pick; Tide Lines' no-straight-back rule |
| CLAWGames #54 | **Reef Drop**: levels as recipes (`docs/REEF_LEVELS.md`), 8 new pieces and 24 new reefs (78 in all) |
| claw-core #42, CLAWGames #54 | **Shell Game race**: first right answer takes the round, wrong picks locked out, first to 3, on one screen and across phones (Room `PICK`/`CALL`, protocol 3) |

## How to play it

- **One device**: Party, Quick Play, Wheel, Mini Golf. 1–4 players, friends or bots.
- **Phones in a room** (Together): one phone hosts (**HOST PLAYS TOO** on or off), the
  rest join with the 4-letter code. Up to 12 players; a phone can carry several
  (+ ANOTHER PLAYER ON THIS PHONE) and is passed round each round.
- **On a TV**: open the site in Chrome on a laptop, Cast tab to the TV, Together →
  📺 HOST ON A TV. Phones scan the QR. The captain's phone (first in) spins.
- **Drinking mode**: 🦀 ×5 on the home screen (per device), or the host's 🍺 switch in a
  room. After every round: who drinks how many sips (one sip per player, split by
  place), the winner's handout, and a house rule for last place.

## Quick board games (two players, one phone)

Lay the phone flat between you; it turns to whoever's up, and player 2 can be a bot.
These are party games (the grid, wheel and parties) built on `src/games/board/` (`Tabletop.js`,
`Dice.js`; how to add one: `docs/ADDING_A_GAME.md`).

| Game | What | Files |
|---|---|---|
| Yatzy | the full 13-box card, three rolls a turn | `Yatzy.js` (before the shared base) |
| Shut the Box | tiles 1–12 each. Roll two dice, shut one tile: either die or the total; stuck when all three are shut. Each plays their whole box in turn; most tiles shut wins, the same is a draw. The bot knows its odds exactly | `ShutTheBox.js` |
| Pig | roll one die as often as you dare; a 1 loses this turn's pot; HOLD banks it; first to 100. The bot's hold target moves with the score | `Pig.js` |
| Dots and Boxes | 4×4 boxes; close a box to claim it and go again; most boxes wins. The bot takes boxes, plays safe lines, then gives away the shortest chain | `DotsBoxes.js` |
| Mancala | Kalah: 6 pits each, 4 seeds; last seed in your store goes again; last in your empty pit captures the pit opposite. The bot looks ahead (minimax, deeper with skill) | `Mancala.js` |
| Liar's Dice | 5 dice each under a cup (hold to peek); bid how many of a face are on the table or call LIAR; the loser loses a die; 1s not wild. The bot knows the odds of every bid | `LiarsDice.js` |
| Tide Lines | 3 shells each on 9 points joined across, down and diagonally: place them, then slide one along a line, never straight back to where it just came from; three in a row wins (40 slides: a draw; can't move: you lose). A tide-pool board; each shell carries its player's character. The bot searches ahead | `TideLines.js` |
| Big Grid | nine tic-tac-toes in one: the square you pick sends the other player to that board (won or full: anywhere); three boards in a row wins, a full grid goes to most boards. The bot searches 2–3 moves over a board/line score | `BigGrid.js` |
| Hot Dice | six dice: keep scorers, roll on or BANK; nothing scoring loses the turn; all six scoring rolls all six again; first to 3,000. The dice that can score glow, each scoring set is a tappable chip drawn in tiny dice, and a picture card shows every score (the straight drawn as 1-2-3-4-5-6). The bot's bank target moves with the dice left and the score | `HotDice.js` |
| Claw Race | **2–4 players** (bots fill seats; 3 racers each at two, 2 at three or four) round a winding 48-square reef on an 11×11 board: any roll comes out, a 6 rolls again, land on a rival to splash it home (not on a green 🏝 SAFE island, two a quarter). Currents +3, whirlpools −3, kelp tunnels +5; a 🎁 happens on landing: roll again, turbo +3, shield that racer (once), or swap with a rival racer you pick. A legend under the board. The bot rates every move on a copy of the game and picks its swaps | `ClawRace.js` |
| Kelp Maze | 7×7 coral reef: race your character to the far side; each go step or grow a coral wall with kelp fronds (6 each, in the planter's colour) that may never close off a way through; hop over the other crab. The bot races when ahead and walls when behind | `KelpMaze.js` |
| Code Breaker | each sets a secret 4-peg code from 6 colours (with symbols); take turns guessing the other's: ● right colour right spot, ○ right colour wrong spot; fewer guesses wins, and the second player always gets the same number of turns. Hold 👁 to peek at your own code. The bot guesses only codes that fit every mark (about 5 guesses) | `CodeBreaker.js` |

All eleven are tested by `qa/shutbox.js` and `qa/boardgames.js` (rules, then each vs a bot and two-player
through the real buttons). Ideas for more: a checkers-lite, a flip game, a connection game on hexes.

## Party action games of the arcade's own

| Game | What | Files |
|---|---|---|
| Chomp Champs | two players on one phone, each player's character a gobbler at their end of a round arena; balls pour in and roll about; tap your half to lunge and chomp what's in reach: your colour +1, the other −1, 🌟 gold +3, 💣 a bomb stuns you 2 s; 45 s, most points wins. Bot chomps when its jaws would catch something worth it | `ChompChamps.js`, `qa/chomp.js` |

## Solo games (one player)

One home-screen card, **SOLO GAMES** (`src/arcade/SoloHub.js`), opens the Prize Shelf, the solo
games, and the 15 arcade high-score games from Quick Play (the parallel games, on the
same high-score tables as Quick Play's "1"), each with its best on its card.

**Game cards (`GameCards.js`).** Every card in the solo hub and in the party "Pick a game" grid
leads with a clip of real play: a still, then a short silent loop while the card is on screen
(loaded lazily, a few playing at once, none with Save-Data or reduced motion). A tap opens a
preview sheet (the clip big, how to play, your best, PLAY). The clips are made by
`scripts/capture-clips.js` (bots on both seats for party games, a scripted player for solo
games; ffmpeg crops them square into `assets/clips/<id>.mp4` + `.jpg`, about 10–40 KB each)
and listed in `Clips.js`. Rerun it after changing how a game looks.

**Every day (`SoloStats.js`):**
- **TODAY**: three daily puzzles, picked from five by the date (Critter Square, Treasure Dig,
  Lighthouse Beams, Ice Floe, Rock Pool Paths). The same puzzles on every phone that day, gentle
  on Monday and Tuesday, medium Wednesday to Friday, hard at the weekend.
- A **streak**, and **tide passes**: solving all three earns one (two at most), and a missed day
  spends one so the streak survives.
- Each daily solved is a **claw token** for the **Prize Shelf** (`PrizeShelf.js`, `Prizes.js`), and
  there's one free drop a day. It's a capsule claw machine: steer the claw (its shadow shows where
  it lands) over sealed blue, silver or gold capsules; the colour sets the odds, never which plush.
  The nearer the middle, the firmer the grip; gold is slipperiest. A slip or a miss costs nothing:
  the token goes only when a capsule reaches the chute, then it wobbles, cracks and pops open.
  60 plushies with names and stories in six sets (Farm & Pets, Woodland, Garden & Pond, Ocean,
  Rare Wonders, Legends) in a lit display cabinet; a finished set pays tokens (and gold capsules).
  Repeats are sparkles (1/3/6 by rarity) for the shop: a token, a gold capsule, or the plush you
  pick. After five capsules in a row with nothing new, the next one is always new.
- **SHARE** after a daily hands a short result to the phone's share sheet (`Share.js`).
- 15 trophies for the solo games.

| Game | What | Files |
|---|---|---|
| Critter Square | every row and column holds each critter once; fences open towards the bigger one. Easy 4×4 / Medium 5×5 / Hard 6×6, one solution each | `CritterSquare.js`, `CritterLogic.js` |
| Ice Floe | slide the penguin; it only stops at rocks, edges and snow; stop on the fish. Par is the shortest route. The penguin leans into slides, bonks on rocks and gobbles the fish | `IceFloe.js`, `IceFloeLogic.js` |
| Rock Pool Paths | join each pair of critters; paths can't cross and every square is used | `Paths.js`, `PathsLogic.js` |
| Treasure Dig | three chests on a 7×7 beach; every hole reads the steps to the nearest one still buried. Polly the parrot calls each dig; 🚩 marks rule squares out for free | `TreasureDig.js` |
| Lighthouse Beams | light every boat exactly once; lighthouses never shine on each other; one answer each | `Lighthouse.js`, `LighthouseLogic.js` |
| Coral Merge | drop sea creatures into a tank (real 2D physics); two alike that touch merge into the next kind up; combos, a bubble power-up that lifts the pile | `Coral.js`, `CoralPhysics.js` |
| Kite Wind | tap to tug the kite up; rings build a combo; gulls and gusts. Every ring is placed within reach of the last, whatever the wind | `Kite.js`, `KiteLogic.js` |
| Tiny Planet | **3D** (three.js, its own renderer, over the whole screen). A crab on a very small planet building a **city of crabs**: homes hold 1–3 crabs, and 5/10/20/35/50 crabs make a village, town, city, metropolis and the Crab Capital; each step grows the planet and opens something (towers, big homes, markets, stronger bubbles). **Two thumbs: the left half of the screen is a floating stick, a drag on the right half turns and tilts the camera** (Q/R on a desk); build buttons bottom left; **JUMP** and a context **action button** bottom right (shake a palm, mend, grow a home, pick up a rock and throw it at a falling star). A **boardwalk course** each day, in three tiers (one to three chillies; harder ones pay stardust): gaps, low bars to jump, tall logs to time, bridges that crumble, a spring, checkpoint flags; an obstacle puts you back at the last flag, stepping off the side just leaves the course. Towers fit right beside buildings, and a ring shows a tower's reach before you build. At night stand in a ring to catch a star (in the air: a perfect catch, double); the big red ones every fifth night can't be caught. Lost when the last home goes; the score is the biggest city. A goal tracker is the opening tutorial; tips show once. **Pause** saves; SAVE & LEAVE and CONTINUE. Each run pays **stardust** for the **workshop**: six upgrades, crab colours, planets that open with your biggest city (Store key `planet`). Next idea: more worlds with different puzzles | `Planet.js`, `PlanetLogic.js` (rules, no DOM; `autopilot()` is the bot the probes and the clip use) |
| Old Ink's Lair | **The puzzle game inside Tiny Planet**, entered by walking into the purple **Trick Hut** (the city waits, saved). Story: Old Ink the octopus has stolen the Tide Pearl; each chamber is a small puzzle planet and his gulls keep watch. The crab carries **up to 3 coconuts**: hold 🥥 and let go to throw (a dotted arc shows the flight), **walk into one to pick it up**, **jump on one to bounce** (twice a jump), they **float** and a **current carries them**, they **plug** a vent or **weigh down** a plate, they **hit** a bullseye. A gull circles, then dives where you stand and steals a coconut (nothing to steal: it pecks you back to the flag); jump on it or hit it with a coconut and it is stunned and drops it, and its back is a bounce. Water isn't a floor: it is a current that carries you onto Old Ink's urchins, back to the last flag. **World 1** is four chambers: Coconut Beach (pick up, jump, throw, bounce, plate), Bubble Stream (vents, a stream, urchins), The Gull's Roost (the gull: hit it, bounce on it, bait it onto the heavy plate) and then **The Drowned Stair** (`STAIR` in `LairLogic.js`), the world's boss chamber; one opens when the one before is cleared (all open while testing, `ALL_OPEN`); `qa/lair-world1.mjs` plays the first three. The Drowned Stair: vents share pressure, so only the first unplugged one blows; vent A is in a walled cove you can't throw into, but a coconut dropped in the water above it is carried in and plugs it; so vent B blows, over the stepping rocks, and lifts you over the cliff; up there three jobs (the tall step, a plate, a bullseye) and two coconuts, so the step is climbed off the gull. `qa/lair.mjs` proves the answer and searches that the other ways are shut. **Old Ink is a boss fight**: he slams where you stand (a red ring shows where; step out or jump), touching him is a hit too, and three coconuts on his head end him, but only in the 1.5 s after a slam lands (any other time an arm swats it away; he is shaken after each hit, and the next round is faster); coconut piles keep turning up; the plate's coconut holds the pearl's fence open, and the pearl can only be taken once he is down. The crab stands ON TOP of the stepping rocks (they have a height) and falls off their sides; the two rocks sit in a straight line across the current so only a jump crosses (a crab swept off one is carried past the next), and a dam of spring rocks at the west end stops a free ride along the cliff foot onto vent B's rock. The slide at the back of the shelf gets a rope ladder once the shelf's flag is reached, so it works both ways. A calm vent says so ("only one vent blows"); a bubble column shows where the lift is. Three stars (the pearl; no falls; under 120 s); a first clear pays 40 shells, each new star 8 stardust. Rule for the next chambers: one new thing to discover, a hazard used as a tool, one skill section, one 'don't waste it' decision, every shortcut shut by something natural (`docs/LAIR_PLAN.md`) **World 3** (the volcano) has begun with **Obsidian Slide**: down into the crater on a stepped lake of obsidian where you slide and can't jump; push blocks, use the ramp, stop on cracked glass only once, slide a coconut onto the plate to open the bridge (rules in `LakeGrid.js`). | `LairLogic.js` (rules, no DOM), `LairScreen.js` (the 3D, on Tiny Planet's renderer), `qa/lair-solve.mjs` (the player that solves it) |
| Art style (`Toon.js`) | **The game's own 3D look**: bright flat candy colours with a stepped (toon) shade, chunky rounded shapes, and a thick dark-ink outline in the same ink colour as the buttons and cards, so the 3D reads like part of the UI. The outline is an inverted hull; `prop()` merges many shapes into one mesh with vertex colours (two draw calls however many parts), `instanced()` does walls of boulders and fences of crystals the same way, `inkify()` outlines an existing group. Used so far by the lair (cliffs, gates, brick step, dam, urchins, gull, Old Ink, rocks, vents) and the player's crab (in the city too). The city's buildings, palms and shells are not yet in the style: next. Motion is subtle: things breathe, bob and blink, and react as the crab comes near | `Toon.js`, `LairScreen.js` |
| (archived) Coconut Trials | The first ten trials (six coconut puzzles, four skill courses), retired in favour of the lair; kept in `src/arcade/archive/` for their pieces: wall, pad, sweeper, beat-gate and bank-shot rules, and `autoplay()` | `archive/TrickLogic.js`, `archive/TrickScreen.js` |
| Pearl Diver | hold to dive, let go to float; pearls, jellyfish and an air meter; a sunset sea with a parallax reef, pearls in glowing clams | `PearlDiver.js` |
| Rebound | flick a pearl to pop every clam; 32 tanks in four worlds (moving bumpers, portals, breakable coral, urchins and switches), a daily tank, each par proven by a search | `Rebound.js`, `ReboundLogic.js`, `ReboundDaily.js` |
| Orbit Putt | putt a ball past planets and black holes into a wormhole that only catches slow balls; 12 levels | `Orbit.js`, `OrbitLogic.js` |
| Reef Drop | drop pearls through a moving reef: coral, oysters (two hits each), eels that zap, puffers that swell and burst (chain reactions), treasure chests (the shot scores double), springy jellyfish, whirlpool pairs, bubble lifts, ghost pieces that fade in and out, anglerfish whose lures pull the pearl in, bumper starfish, golden oysters (three hits, a pearl back), currents that push sideways, giant clams that open and shut, turning wheels, sliding rows. Shelly the hermit crab scuttles along the floor: a pearl in her shell comes back (×3); every piece stays clear above her (`CLEAR_Y`). Worlds 10–13 add sea urchins (a touch loses the pearl), sponges, sea mines, anemones that split the pearl in two, barnacles that lock oysters, kelp, magnet shells and flip portals; worlds 14–19 add bubble shields, sand dollars (every third gives a pearl back), pinball bumpers, seesaws, sharks, conveyor rails, and colour gates with their switches. A pearl that rests for a second sinks through, so none is ever stuck. 114 reefs in 19 worlds; new ones are recipes (`docs/REEF_LEVELS.md`) | `ReefDrop.js`, `ReefDropLogic.js`, `ReefDropLevels.js` (generated), `ReefBuild.js` |
| Mirror Lagoon | turn mirrors (four ways) so red and blue lighthouse beams light every lantern of their colour (purple needs both); bolted mirrors, coloured glass, rocks. 30 levels made by `scripts/mirror-levels.mjs`, each par from an exact search | `Mirror.js`, `MirrorLogic.js`, `MirrorLevels.js` |

The aim games (Orbit Putt, Reef Drop) share `AimScreen.js` (picker, pull-back aim, loop, done panel) and `AimSearch.js` (the beam search that proves each par).

## Online games (15)

Every one is played **alone on each phone from the round's seed** and scored, so they
all work at 12 players (see claw-core's README, "Playing across phones").

| Kind | Games |
|---|---|
| Score attack | Snap Strike, Odd One Out, Steady Hand, Loot Catch, Tree Climb, Mini Golf, Balloon Pump, Pancake Stack |
| Race | Shell Game: the first right answer on any phone takes the round, a wrong pick is locked out, first to 3 (a room with a shared phone plays the old streak) |
| Streak | Higher or Lower |
| Precision / quiz | Stop the Clock, Trivia |
| Time trials with ghosts | Kart GP, Speed Boat, Rift Dive |

Stop the Clock, Higher or Lower and Trivia are **online only** (`onlineOnly` in
`src/games/index.js`): not on the shared-screen grid, wheel or parties; Quick Play
for one has them.

## Where the online code lives

| File | Job |
|---|---|
| `src/net/Room.js` | The session: host-authoritative roster, rounds, scores, drinks, ghosts |
| `src/claw-core/net/NetTransport.js` | Bytes between phones: Trystero WebRTC (Nostr signaling, then torrent), `?net=local` loopback |
| `src/arcade/Together.js` | Phone screens: host/join, room, round card, pass the phone, results, drink card |
| `src/arcade/TvHost.js` | TV screens: lobby + QR, wheel, round status, running order, results, final scores |
| `src/arcade/Drinks.js`, `DrinkCard.js` | Drinking rules and the after-round card |
| `src/games/PhoneGame.js` + `StopClock.js`, `HigherLower.js`, `Trivia.js` | The arcade's own online games |
| `src/claw-core/minigames/SoloArena.js`, `engine/Ghosts.js` | Running a game alone for a score; ghosts |

## Tests

`README.md` lists every probe. The online ones, all on the `?net=local` loopback in
headless Chromium: `qa/together.js`, `qa/hostwatch.js`, `qa/tv.js`, `qa/tvreact.js`, `qa/tvlive.js`, `qa/tvlive-12.js`, `qa/drinking.js`
(12 phones), `qa/ghosts.js`, `qa/phonegames.js`, `qa/shellrace.js`. **None of the online play has been
tried on real phones over real WiFi yet**: that's the first job of the audit.

## How to continue

1. **Run the online audit** ([`ONLINE_AUDIT.md`](ONLINE_AUDIT.md)); the code half is done ([`ONLINE_AUDIT_REPORT.md`](ONLINE_AUDIT_REPORT.md), its roadmap is the fix order). Still to do: a real-device game
   night with the test sheet, to confirm the fixes below on iPhones and real WiFi.
2. **Reliability (P0): done in code, not yet on real phones** (audit roadmap PRs 1–4,
   `ONLINE_AUDIT_REPORT.md` §0). Rooms keep the screen awake, every round step is re-sent
   until it lands, a dropped phone keeps its seat and points and comes back by itself, a
   reloaded host reopens its room, late joiners queue for the next round, and an old build
   is told to refresh. Still open: a TURN relay (`RELEASE.turnServers` in `src/AppHost.js`
   is wired: paste credentials into `TURN_SERVERS`, see `TURN.md`). Shared-phone fairness,
   removing a player, score/ghost caps and the privacy note followed (roadmap PRs 5–8); the
   ghost leak fix is claw-core #41.
3. **Room UX (P1)**: a live score rail.
   **TV mode** is next: the TV runs the games and shows everyone playing, 18 games at up to 12 (`DESIGN.md` §13). Emoji reactions and faces on the TV are in, and the TV runs its first game itself (Sumo Spheres, phones as touchpads).
4. **More online games (P2)**: easy conversions are High Noon, Grid Recall, Rhythm
   Forge, Pinball; medium are Bowling, Block Party, Sack Race, Red Light Green Light,
   Rooftop Run, Yatzy. New modes: **Crab Royale** (bottom third out each round), and
   live TV games (Tug of War, Most Likely To…) once Room has a live-round message.
5. **Platform (P3)**: accounts and friends across networks (needs a backend), store
   packaging (`DESIGN.md` §4, §11).

## Shipping (from `CLAUDE.md`)

Branch from `origin/main`, one PR per deliverable with a "Play it" line, claw-core PRs
first and the submodule pinned to claw-core `main`, `npm run smoke` and the feature's
probe before pushing, and check the "pages build and deployment" run after a merge.
