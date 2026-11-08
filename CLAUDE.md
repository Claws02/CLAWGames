# CLAW Games — context for Claude

Arcade app: every claw-core minigame plus arcade-only games (Yatzy, Pinball),
via grid, wheel, or best-of party with a podium. One device, phones in a room,
or vs bots. Plain ES modules, no build, three.js r128 + cannon.js globals,
Capacitor 8.

## Run / verify

```
npm run setup                 # submodule init — src/claw-core
npm run serve                 # :8140
npm run smoke                 # 5 games end to end, headless
node qa/<area>.js             # party, together, trophies, yatzy, pinball, golf, players …
node qa/party-points.mjs      # rules only, no browser
```

## Map

| Path | What |
|---|---|
| `src/AppHost.js` | CLAWGames' side of the claw-core contract (small stand-ins) |
| `src/claw-core/` | **submodule, shared with HundredBlockDash.** Change it there, bump both |
| `src/host/` | arcade `state`, bot tiers, generated biome snapshot |
| `src/games/` | arcade-only games; they register into claw-core tables at startup (HBD never sees them). `Pinball.js` is 1.1k lines |
| `src/arcade/` | shell screens: seats, grid, wheel, party, together, trophies, stats, catalog |
| `src/net/Room.js` | Play Together protocol on claw-core `NetTransport` |
| `scripts/sync-assets.sh` | copies vendor/fonts from `../HundredBlockDash` |
| `docs/DESIGN.md`, `docs/ADDING_A_GAME.md` | read for roadmap work / adding a game |

## Rules

- A change to a shared game is a claw-core commit first, then pointer bumps here **and** in HBD after both apps' probes pass.
- Arcade-only games stay in `src/games/`, never in claw-core.
- `NET_APP_ID` in AppHost never changes after release.
- Trophy/stat saves have old versions in the wild: `qa/trophies.js` covers migrations. Keep it green.

## Token rules

- Don't read `vendor/`, `www/`, `qa/shots/`. For claw-core internals, read `src/claw-core/CLAUDE.md`.
- `sync-assets.sh` exists because vendor files are duplicated from HBD. claw-kit's vendor/tools are the planned replacement (see Claws02/claw-kit README).
