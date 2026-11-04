# CLAWGames: where things stand

Last updated 2026-11-01. Live at **https://claws02.github.io/CLAWGames/** (GitHub
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

## Solo games (one player)

One home-screen card, **SOLO GAMES** (`src/arcade/SoloHub.js`), opens five games, each with its
best on its card, and **TODAY**: a daily Critter Square, Treasure Dig and Lighthouse Beams from
the date (the same puzzle on every phone that day) with a streak. What a device remembers is in
`SoloStats.js`; six trophies read it.

| Game | What | Files |
|---|---|---|
| Critter Square | every row and column holds each critter once; fences open towards the bigger one. Easy 4×4 / Medium 5×5 / Hard 6×6, one solution each, hints, best times | `CritterSquare.js`, `CritterLogic.js` |
| Treasure Dig | three chests on a 7×7 beach; every hole reads the steps to the nearest one still buried; stars by digs | `TreasureDig.js` |
| Lighthouse Beams | light every boat exactly once; lighthouses never shine on each other; 5×5 / 6×6 / 7×7, one answer each | `Lighthouse.js`, `LighthouseLogic.js` |
| Pearl Diver | hold to dive, let go to float; pearls, jellyfish and an air meter; speeds up; high score | `PearlDiver.js` |
| Rebound | pull back and flick a pearl to pop every clam; 8 hand-made levels, each par proven by a search | `Rebound.js`, `ReboundLogic.js` |

## Online games (15)

Every one is played **alone on each phone from the round's seed** and scored, so they
all work at 12 players (see claw-core's README, "Playing across phones").

| Kind | Games |
|---|---|
| Score attack | Snap Strike, Odd One Out, Steady Hand, Loot Catch, Tree Climb, Mini Golf, Balloon Pump, Pancake Stack |
| Knockout / streak | Shell Game, Higher or Lower |
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
headless Chromium: `qa/together.js`, `qa/hostwatch.js`, `qa/tv.js`, `qa/drinking.js`
(12 phones), `qa/ghosts.js`, `qa/phonegames.js`. **None of the online play has been
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
