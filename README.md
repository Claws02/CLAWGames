# CLAW Games

Every HundredBlockDash minigame in one arcade app: pick from a grid, spin the wheel, or run a best-of party with a podium. Play friends on one device, on their own phones in the same room, or against Easy, Medium or Hard bots.

Design and roadmap: [`docs/DESIGN.md`](docs/DESIGN.md). Adding a game: [`docs/ADDING_A_GAME.md`](docs/ADDING_A_GAME.md).

## Run it

The minigames live in **[claw-core](https://github.com/Claws02/claw-core)**, which HundredBlockDash and this app share. It's a git submodule at `src/claw-core/`. The runtime assets the core needs (three.js, cannon.js, Trystero, the fonts and the minigame stylesheet) are committed under `vendor/`, `assets/fonts/` and `css/`; `npm run sync` refreshes them from a HundredBlockDash checkout next to this one.

```bash
npm run setup         # = git submodule update --init
npm run serve         # http://127.0.0.1:8140
npm run smoke         # plays 5 games end to end in headless Chromium
node qa/party.js      # a 3-game party with each picker (wheel, shuffle, draft, host picks)
node qa/party-points.mjs   # party scoring rules, no browser
node qa/together.js   # two phones in one room over the loopback transport
node qa/tv.js         # a TV host, a passed phone with two players and a second phone, drinking mode on
node qa/drinks.mjs    # drinking-mode rules (sips by place, house rules, the crab tap), no browser
node qa/trophies.js   # trophy rules, persistence, old saves, the screen, a real game
node qa/yatzy.js      # Yatzy scoring rules, a game vs a bot, a two-player tabletop game
node qa/pinball.js    # four fingers, nudge/tilt, saver, claw lock, multiball, missions, attacks, a full game vs the bot
node qa/pinball-lab.mjs [n]   # pinball balance: idle vs each bot tier, n simulated games each
```

There's no build step: the app is ES modules served as static files, with vendored three.js and cannon.js.

## How it fits together

- `src/claw-core/`: shared games, stage engine and game registry (the claw-core submodule). A change there is a commit in claw-core, then a pointer bump here and in HundredBlockDash; take the latest with `git submodule update --remote src/claw-core`.
- `src/AppHost.js`: the 14 names the core imports from its host (listed in claw-core's README). This is CLAWGames' side of the contract.
- `src/host/`: the arcade's `state`, bot tiers and a generated biome-data snapshot.
- `src/games/`: games only the arcade has (Yatzy, Pinball). They register themselves into claw-core's tables at startup, so HundredBlockDash never gets them.
- `src/arcade/`: the shell screens (seats, grid, wheel, party, play together, trophies), stats, trophy rules and the game catalog.
- `src/net/Room.js`: the Play Together session protocol, running on claw-core's `NetTransport`.
- `src/arcade/TvHost.js`: the arcade on a TV. The TV tab hosts the room without a seat, while phones join by code (or `?join=CODE`) and play.
- `src/arcade/Drinks.js`: drinking mode (tap the 🦀 five times): sips by place each round, and a house rule for last place.

## On the TV (e.g. a Vizio with Chromecast built in)

1. On a laptop, open the site in Chrome, then use ⋮ → Cast… → your TV → **Cast tab**.
2. On the laptop tab, go to **Together → 📺 HOST ON A TV**. The TV shows the room code.
3. Each phone scans the QR code on the TV (or opens the site and goes to **Together**), adds everyone sharing that phone (**+ ANOTHER PLAYER ON THIS PHONE**) and JOINs (4 players max).
4. The first phone in is the captain. Its **SPIN** button spins the wheel, plays what it lands on, and spins again after each round. The laptop mouse can do the same.

The site has to be served over HTTPS (or localhost) for the phones' peer-to-peer connection, e.g. GitHub Pages.
