# CLAW Games

Every HundredBlockDash minigame in one arcade app: pick from a grid, spin the wheel, or run a best-of party with a podium. Play friends on one device, on their own phones in the same room, or against Easy, Medium or Hard bots.

Design and roadmap: [`docs/DESIGN.md`](docs/DESIGN.md).

## Run it

The minigames live in **claw-core**, which HundredBlockDash and this app share. Until claw-core has its own repo (it'll then be a git submodule at `src/claw-core/`), sync it from a HundredBlockDash checkout on the `claude/claw-core-extract` branch:

```bash
npm run sync          # = bash scripts/sync-core.sh ../HundredBlockDash
npm run serve         # http://127.0.0.1:8140
npm run smoke         # plays 5 games end to end in headless Chromium
node qa/party.js      # a 3-game party with each picker (wheel, shuffle, draft, host picks)
node qa/party-points.mjs   # party scoring rules, no browser
node qa/together.js   # two phones in one room over the loopback transport
```

There's no build step: the app is ES modules served as static files, with vendored three.js and cannon.js.

## How it fits together

- `src/claw-core/`: shared games, stage engine and game registry (synced; don't edit here).
- `src/AppHost.js`: the 12 names the core imports from its host. This is CLAWGames' side of the contract.
- `src/host/`: the arcade's `state`, bot tiers and a generated biome-data snapshot.
- `src/arcade/`: the shell screens (seats, grid, wheel, party, play together, stats) and the game catalog.
- `src/net/Room.js`: the Play Together session protocol, running on claw-core's `NetTransport`.
