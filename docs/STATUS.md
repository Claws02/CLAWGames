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

1. **Run the online audit** ([`ONLINE_AUDIT.md`](ONLINE_AUDIT.md)): a real-device game
   night with the test sheet, then the code audit with the prompt there.
2. **Reliability (P0)**, the likely headline findings: acknowledged delivery of
   ROUND/GO/RESULT, rejoining with a stable player id, surviving a phone locking or
   switching apps, a protocol version handshake, a TURN relay
   (`RELEASE.turnServers` in `src/AppHost.js` is already wired, just empty), and
   longer or collision-checked room codes.
3. **Room UX (P1)**: kick a player, late joiners queue for the next round, a live score
   rail, a ready timeout, reconnecting states that say what's happening.
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
