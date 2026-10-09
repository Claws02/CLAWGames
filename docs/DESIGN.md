# CLAWGames — design v0.1

**Status:** draft, rounds 1–2 of scoping answered (2026-10-09). Phase 0 in progress.
**One line:** every HundredBlockDash minigame, in one arcade app, played against friends or bots.

## Decisions taken

| Fork | Decision |
|---|---|
| Code source | **Shared core.** Minigames, engine and net live in one place. Both HundredBlockDash and CLAWGames use them. |
| Game selection | **All four:** Arcade grid, Spin the wheel, Party playlist, Vote/draft |
| Ways to play | **All four:** Same device, phones in the same room, online friends, bot difficulty tiers |
| Platform | **Web + Capacitor** (same setup as HundredBlockDash: web first, then iOS/Android) |
| Core home | **New repo `claws02/claw-core`**, mounted as a git submodule at `<app>/src/claw-core/` in both apps |
| Look & feel | **Bright party / cartoon** (Mario Party / WarioWare energy) |
| Progression | **Light stats + trophies.** Everything is unlocked, there's no economy, and stats are kept per game and per friend. |

---

## 1. What we inherit from HundredBlockDash

What's in the HundredBlockDash repo now:

| Asset | State |
|---|---|
| Minigames | 46 files in `src/minigames/`, 43 profiled in `MG_PROFILE` (`src/config/MinigameRegistry.js:507`) |
| Metadata | `MG_INFO` (icon, title, rules text) and `MG_PROFILE` (genre, control, wire, seats, live) |
| Genres | reflex · race · nerve · scramble · aim · push · brain |
| 3–4 player games | **Only 9** are `live` at 2–4 seats: sortrush, snapstrike, steadyhand, lootcatch, sumospheres, lightcycles, gridrecall, oddoneout, brainrot. The other 34 are 1v1. |
| Bots | Each game has `start(isBot, onWin, botSkill)`. `botSkill` is a 0–1 number. |
| Net | Trystero WebRTC P2P, `src/net/*`, 2–4 phones. Each game has a `wire` tag: 22 snapshot, 7 exact, 6 events, 3 stamp, 5 none. |
| Build | No bundler: ES modules served static, vendored three.js + cannon.js, Capacitor 8 |
| QA | About 100 Playwright test scripts in `qa/` |

**Risk to watch first:** the 4-player library is thin. With 3–4 people at the table, only 9 games are playable today. Every mode below filters by seat count, so in a 4-player party the wheel and the playlist keep drawing from those 9. **Converting more games to `live` is product work, not polish.**

**How tied the games are to the board game:** loosely. The games import `GameState` (`state.mgActive` ×97, `state.players` ×48, plus a few `mgType` and `mgBag` reads), `MinigameManager`, `AudioManager` and the `Stage*` engine files. They don't touch board logic. That makes them extractable.

## 2. Architecture

```
claw-core/                     ← shared (see open question Q1 for where it lives)
  minigames/   *.js + registry (MG_INFO, MG_PROFILE)
  engine/      Stage, StageKit, StageSets, StageDirector, AudioManager, Fx, Physics, CharacterRig
  net/         NetSession, NetTransport, NetMinigame, NetSync, ReadyGate, protocol
  host/        MinigameHost.js  ← NEW: the only thing a game talks to
  vendor/      three, cannon

HundredBlockDash/   board game  → provides a BoardHost
CLAWGames/          arcade app  → provides an ArcadeHost
```

**The MinigameHost contract** (new). Today a game reads global `state`. Instead, the host gives each game what it needs:

```js
host = {
  seats: [{ id, name, color, kind: 'human'|'bot'|'remote', botSkill }],
  device: 'shared' | 'own',      // one screen vs one phone per player
  layer: HTMLElement,            // where the game mounts
  audio, haptics, stage,
  isActive(): boolean,           // replaces state.mgActive
  finish(result),                // { placements: [seatId...], scores?: {} }
}
```

**Migration path.** We don't rewrite 46 games in one go:
1. **Shim first.** `claw-core/host/GameStateShim.js` exposes the same `state.*` fields the games already read, filled in by whichever host is running. That means **zero edits to games** on day one, and CLAWGames can play all 43 almost straight away.
2. **Convert gradually.** Each game moves to `host.*` when someone next works on it. The shim gets smaller and is deleted at 0 uses.
3. **Results become placements.** `onWin(winner)` is a 1v1 result. Party scoring needs 1st–4th place. The shim maps 1v1 results to placements until each game reports a full ranking.

## 3. App flow

```
Splash → Home
  ├─ Quick Play      → pick players/bots → Arcade grid → game → result → again / back
  ├─ Party           → set up seats → choose a selection mode → N games → podium
  ├─ Spin the wheel  → (shortcut into Party: wheel picks each game)
  ├─ Play together   → Same device | Host room (code) | Join room | Friends (online)
  └─ Profile / Settings / Stats
```

### 3.1 Seat setup (every mode starts here)
- 1–4 seats. Each seat is **Human**, **Bot (Easy / Medium / Hard)** or **Remote** (a friend's phone).
- The player count decides which games you can pick: a game shows up only if `seats[0] ≤ n ≤ seats[1]`, and `live` is required when n ≥ 3. A 1-human game fills the second seat with a bot.

### 3.2 Game selection modes
| Mode | Behavior |
|---|---|
| **Arcade grid** | Cards grouped by genre tab. Filters: player count, control type (tap / thumb). Rows for favorites ★ and recently played. Games that don't fit the current seat count are greyed out, with a reason ("1v1 only"). |
| **Spin the wheel** | A wheel (or slot reel) of the eligible games. Each player gets **one veto per party**, and a veto re-spins. The animation ends on the game card, then a 3-second countdown. |
| **Party playlist** | Best of 3 / 5 / 7 or "first to N points". The playlist is chosen by hand, shuffled, or one game per genre. Each game pays out by placement (4 / 2 / 1 / 0 with 4 players, 3 / 0 with 2) and the standings rail updates between games. Podium screen at the end. |
| **Vote / draft** | Deal 5 eligible games. Players take turns banning one each (hidden ballots on own-phone, pass-the-phone on shared), and the app picks at random from what's left. |

The wheel and the draft can both feed the playlist: the playlist is the container, and those two are ways to fill each slot.

### 3.3 Ways to play
| Mode | Transport | v1? | Notes |
|---|---|---|---|
| Same device | none | ✅ | Split-screen, one-thumb zones (the "control law" in HundredBlockDash's `MINIGAME_CATEGORIES.md`). |
| Phones in same room | Trystero WebRTC P2P, room code / QR | ✅ | Reuses HundredBlockDash's net code. Games with `wire: none` can't sync across phones yet, so they're hidden in this mode until they get net support. **Verify** how far Phase C got (minigames across phones). The plan doc calls it a placeholder, but `NetMinigame.js` and `qa/netmg.js` exist. |
| Online friends | **needs a backend** | Phase 3 | Accounts, a friends list, presence and invites. Gameplay stays on P2P WebRTC, but across different networks it needs a **TURN relay** (about 10–20% of connections fail without one [inference, a common industry figure]). |
| Bot tiers | local | ✅ | Easy/Med/Hard map to `botSkill` ≈ 0.3 / 0.55 / 0.8 **[assumption, needs tuning per game]**. Audit that every game actually reads `botSkill`. A solo "Bot Ladder" climbs through tiers. |

## 4. Online friends: what it costs (candid)

This is the one feature that changes what the product is: it goes from a static app to a service.
- **Backend:** Supabase or Firebase (auth, `friends`, `invites`, presence) **[rec: Supabase, Postgres plus realtime presence]**, plus a hosted TURN service.
- **Store rules:** App Store guideline 5.1.1(v) requires in-app account deletion if you offer accounts **[fact]**. Sign in with Apple is required if you offer other third-party logins **[fact, 4.8, check current wording]**.
- **Kids:** a party-game audience skews young. If under-13s are a target, COPPA applies to accounts and friends lists **[fact]**. **[rec]** No free-text chat in v1. Use emoji reactions and preset quick-chat only.
- **Cheating:** P2P is host-authoritative, so a modded host can cheat. That's fine between friends, but **not** fine for ranked/global leaderboards. Keep v1 unranked.
- **Running cost:** no longer zero. TURN bandwidth is the main variable cost.

**Viability:** same device + same room + bots = **realistic** for v1. Online friends = **stretch**, so phase it after the arcade ships.

## 5. Phases

| Phase | Scope | Exit test |
|---|---|---|
| **0 · Extract** | claw-core split, GameStateShim, HundredBlockDash switched to core with no behavior change | HundredBlockDash `npm run smoke` + full `qa/` suite still pass |
| **1 · Arcade shell** | Home, seat setup, Arcade grid, Quick Play, bot tiers, same device | Every eligible game launches and finishes from the grid at 2 and 4 seats (Playwright) |
| **2 · Party** | Playlist, Wheel, Draft, standings, podium, phones-in-room | A 4-phone, best-of-5 party finishes in two browser contexts per seat |
| **3 · Online** | Accounts, friends, invites, TURN | Two networks, invite → game → result |
| **4 · Ship** | Store art, privacy, Capacitor builds | TestFlight / internal track |
| **ongoing** | Convert 1v1 games to `live` 3–4 seat | 4-player pool ≥ 20 |

## 6. Phase 0: how the core is mounted (as built)

- Core files live under `src/claw-core/{minigames,engine,config}/` and may import **each other and `../../AppHost.js` only**.
- Each app supplies `src/AppHost.js`. In HundredBlockDash it re-exports the real board modules (live bindings), so behavior is unchanged.
- At extraction, HundredBlockDash's AppHost exports **13 names**: `state, playerCount, setPlayerCount, Bot, DualRead, loadUIManager, PROP_KIT, createCharacterMesh, setBoardPaused, DISTRICT_BIOMES, HBD_BIOMES, MINIGAME_REWARD, MINIGAME_PLACE_COINS`. CLAWGames' ArcadeHost has to provide the same 13. Shrinking that list is the ongoing migration work. `createCharacterMesh` and `PROP_KIT` sit inside the 5.7k-line board `Renderer.js`, and should be the first names to move into core.
- `src/net/` stays in HundredBlockDash for now. It reaches into GameController, Commands and the UI, so pulling out `NetMinigame` is Phase 2 work.
- **Bonus content:** `minigames/archived/` holds **64 more retired games**. They don't run today (their imports are stale), but they're candidates for the arcade.

## 7. Open questions
- Name and mascot for the app. Should the HundredBlockDash characters appear as the playable roster?
