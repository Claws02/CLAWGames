# Online audit: breaking apart Play Together, then making it solid

The goal: a room of up to 12 phones (plus a TV) on ordinary home WiFi gets from QR
scan to a finished game night with **no stuck screens, no lost rounds, and nothing
that needs explaining**. This file is the method. [`STATUS.md`](STATUS.md) says what
exists; the prompt at the bottom runs the code half of the audit in a Claude Code
session.

The audit has two halves, and the order matters:

1. **A real-device game night** with the test sheet below. Loopback tests can't
   show WiFi, sleeping phones, iOS Safari or casting. Do this first, and write
   down what happened.
2. **A code audit** (the prompt), which takes the game-night notes as evidence
   and turns everything into a ranked fix list.

---

## 1. The system in one picture

```
 phone ──┐                         (signaling only: Nostr relays, then torrent trackers)
 phone ──┼── Trystero WebRTC mesh ── every peer connects to every peer
 TV tab ─┘    claw-core NetTransport: connect / send(msg, target?) / onMessage / onPeerJoin / onPeerLeave

 src/net/Room.js (host-authoritative, protocol V = 1)
   client → host  HELLO {names}          host → all  ROSTER {seats, totals, tv, hostSeated, mode, rules}
   host → all     ROUND {type, seed, n}  any → host  READY {}         host → all  GO {n}
   any → host     SCORE {scores[]}       host → all  RESULT {scores, pay, totals, winner, names, drinks, rules}
   captain → TV   CMD {}                 any → all   GHOST {n, seat, s}   (~9/s during time trials)

 Every round: same seed on every phone → each plays alone (SoloArena) → reports one score.
```

Numbers that matter: `MAX_SEATS` 12 · `ROUND_CAP_MS` 90 s (more via `MG_SOLO_MS`:
Kart GP 180 s, Shell Game 180 s, Mini Golf 240 s, Trivia and Higher or Lower 150 s) ·
`GRACE_MS` 8 s · `PASS_MS` 15 s per extra player on a shared phone · ghost send every
110 ms, stale after 2.5 s · room codes are 4 characters from 31 (≈ 923k codes) in the
`claw-games` namespace · no TURN servers configured (`RELEASE.turnServers` is empty).

## 2. What to audit, area by area

Each area lists the questions to answer and the suspicions to prove or disprove. A
suspicion is **not** a finding until it has a file:line and a reproduction.

### A. Connecting and joining
- How long from scanning the QR to "seated", for the 1st and the 12th phone? Which
  signaling strategy won (`NetTransport.strategy()`)?
- What does a phone show when nobody answers, the room is full, or a round is running
  (`HELLO` is refused mid-round)? Is every one of those a clear message, not a hang?
- Room-code collisions: two hosts drawing the same code on public relays would both act
  as host to one set of phones. Is there any detection? Should codes be longer?
- 12 phones and a TV is a 13-peer full mesh (78 WebRTC connections). Does joining
  degrade as the room fills? Do all peers actually connect to all peers?

### B. Delivery and ordering
- `send()` is fire-and-forget. What happens if a phone misses **ROUND**, **GO** or
  **RESULT**? (Suspected: it sits on a card until the round cap, then is scored 0;
  a missed RESULT leaves it on "waiting" for good.)
- Is there an ack/resend, a sequence number, or a "state snapshot on reconnect"?
  What's the smallest change that makes each step recoverable?
- `READY` is per phone and the round waits for all of them: what if one phone never
  readies? (No ready timeout exists.)

### C. Phones that sleep, switch apps or drop
- iOS Safari and Android Chrome suspend pages and WebRTC when the screen locks or the
  app is switched. What happens to that player mid-round, and to the room?
- Is the Screen Wake Lock API used during a room? (Suspected: no.)
- A refresh or dropped phone gets a new peer id: it can't take back its seat or its
  totals, and can't join mid-round. Design a stable player id (localStorage) and a
  rejoin path.
- The host leaving closes the room for everyone. Is a grace period or host hand-off
  worth it? For TV mode, what if the laptop tab is throttled while casting?

### D. Timing and fairness
- GO reaches phones at different moments; each phone's clock starts on its own GO. How
  big is the spread on real WiFi, and does it matter for each game (it matters most for
  the time trials, where ghosts show the offset)?
- Does every parallel game draw **everything a score depends on** from `Solo.draw`, so
  the challenge really is identical? Verified so far only for Shell Game, Stop the
  Clock, Higher or Lower, Trivia (by probe). Check the rest, game by game.
- Do slow phones (low frame rate) score worse for reasons other than skill? Games are
  meant to be dt-based with dt capped at 0.1 s.
- Round caps vs real play: is 90 s enough everywhere? Shared phones multiply it.

### E. Trust and abuse (between friends, but still)
- Scores are self-reported: the host clamps negatives but not maximums. What's the
  worst a modified phone could do (scores, names, GHOST payloads, CMD spam)? Which
  checks are cheap (a per-game max, rate limits, payload size limits)?
- Names render in HTML in several places (`Together.js`, `TvHost.js`, `DrinkCard.js`).
  Is every one escaped? Is the ghost name tag safe?

### F. Versions and caching
- Every message carries `v: 1`, but fields were added since (hostSeated, drinks,
  GHOST). What does a phone on a cached older build do in a newer room, and vice
  versa? Recommend a version handshake in HELLO/ROSTER that tells a stale phone to
  refresh.
- `sw.js` is network-first on github.io. Confirm a merge reaches a phone within one
  reload, and that no named import across files can strand an old cached module.

### G. Load
- GHOST at 12 phones is about 100 messages a second into every phone. CPU, battery,
  and dropped frames on a mid-range Android? Should ghosts relay through the host,
  thin out with room size, or send less often when far away?
- Memory and frame time on the TV tab across a 2-hour night (leaks in screens,
  the wheel, ghosts, the drink card, QR).

### H. The experience
- Every waiting state says who we're waiting for and roughly how long.
- The host can kick a player, and late joiners queue for the next round.
- The TV is readable from the couch: font sizes, contrast, the running order, the
  DRINK card with 12 names.
- Drinking mode: per-device 🦀 vs the room switch is easy to misread. Is it clear who
  decides? Is there a sensible cap on sips?
- Privacy: public signaling relays see room codes and IP addresses. A privacy note
  is needed before any store build (`DESIGN.md` §11).

## 3. The game-night test sheet

Do it with real phones (iPhone and Android mixed), the TV over a laptop cast, and
home WiFi. Note the time, phone model and what you saw for each line.

| # | Do this | Expect |
|---|---|---|
| 1 | TV: HOST ON A TV. Each phone scans the QR | All seated in < 20 s each; names right |
| 2 | Fill the room to 12 (shared phones count) | 13th player is refused with a message |
| 3 | Captain spins and plays 5 rounds of different games | Every phone gets the card, GO and result |
| 4 | Lock one phone mid-round for 20 s | Room carries on; that phone scored 0 or resumes; no one stuck |
| 5 | Switch one phone to another app and back during the ready card | Same |
| 6 | Refresh one phone between rounds and rejoin | Note what happens to its seat and points |
| 7 | One phone joins mid-round | Clear "wait for the next round" message |
| 8 | Run all three time trials | Ghosts move smoothly; the TV running order is right |
| 9 | Drinking mode on from the TV switch | DRINK card on every phone and the TV every round |
| 10 | Phone host with HOST PLAYS TOO off, 4 guests | Host never gets a game; picks and sees results |
| 11 | Close the host / TV tab | Every phone is told and sent home |
| 12 | One phone on mobile data, the rest on WiFi | Joins? (Without TURN, some networks can't.) |
| 13 | 2-hour session | TV and phones still responsive; battery noted |

## 4. How to rank and report findings

- **P0** a stuck screen, a lost round or a room that dies; **P1** wrong scores or
  confusing states; **P2** polish and performance; **P3** ideas.
- Each finding: title, area (A–H), severity, evidence (file:line, reproduction or
  game-night note), **verified or suspected**, the smallest fix, effort (S/M/L), and
  how a probe in `qa/` will prove the fix.
- The output is `docs/ONLINE_AUDIT_REPORT.md` plus a short fix roadmap grouped into
  PRs that each ship on their own (CLAUDE.md shipping rules).

---

## 5. The audit prompt

Paste this into a new Claude Code session on CLAWGames (with claw-core as the
submodule). Attach or paste the game-night notes where it says so.

```text
You are auditing the ONLINE version of CLAW Games (Play Together and TV mode) so we
can make it rock-solid for a 12-phone game night. Repo: Claws02/CLAWGames (claw-core
is the submodule at src/claw-core). Live: https://claws02.github.io/CLAWGames/.

READ FIRST, in this order: CLAUDE.md, docs/STATUS.md, docs/ONLINE_AUDIT.md (the
method, areas A–H and the severity scale you must use), src/net/Room.js,
src/claw-core/net/NetTransport.js, src/arcade/Together.js, src/arcade/TvHost.js,
src/claw-core/minigames/SoloArena.js, src/claw-core/engine/Ghosts.js, then each
parallel game that MG_PARALLEL lists (claw-core minigames/ and src/games/).

GAME-NIGHT NOTES (real devices): <paste the filled-in test sheet here, or "none yet">

HOW TO WORK
1. Before anything else, ask me up to 3 clarifying questions if something would
   change the audit (devices, priorities, what "done" means). Then proceed.
2. Map the system: every message type, who sends it, who acts on it, every timer,
   every state a phone can be in, and every way out of each state. Draw the round
   lifecycle as a state machine (host side and phone side) in the report.
3. Go through areas A–H of docs/ONLINE_AUDIT.md. For each suspicion listed there,
   prove or disprove it from the code with file:line references. Add anything else
   you find.
4. Reproduce what you can: write throwaway Playwright scripts on the ?net=local
   loopback (see qa/together.js, qa/drinking.js, qa/ghosts.js for the harness) to
   simulate a dropped message, a phone that leaves or reloads mid-round, a late
   joiner, a slow phone, a stale protocol version, 12 phones of GHOST traffic. Run
   the server with `npm run serve` (port 8140). Record exact results.
5. Check fairness game by game: for every parallel game, confirm that everything a
   score depends on comes from Solo.draw (or is otherwise identical on every phone),
   with a two-page same-seed check where you can.
6. Do not change product code during the audit. Throwaway scripts go in a scratch
   folder, not qa/.

WHAT TO DELIVER
- docs/ONLINE_AUDIT_REPORT.md: the state-machine maps, then every finding with:
  title, area, severity (P0–P3), VERIFIED or SUSPECTED, evidence (file:line and the
  reproduction or note), the smallest fix, effort (S/M/L), and the qa/ probe that
  will prove the fix.
- A fix roadmap: findings grouped into small PRs in priority order, each one
  shippable alone under CLAUDE.md's rules (claw-core PR first where needed), with a
  one-line "Play it" test for each.
- A short top-5: the changes that would most improve a real game night.

RULES
- Never present a suspicion as a fact. Anything not reproduced or traced to a line
  is SUSPECTED.
- Prefer the smallest fix that removes the failure; say what each fix costs.
- Keep the architecture (P2P, host-authoritative, every phone plays alone) unless
  you show it can't meet the goal, and then propose the cheapest alternative.
- When the report is written, open it as a PR (docs only) and stop for my review
  before fixing anything.
```

After review, run the fixes PR by PR from the roadmap, each with its probe, and
repeat the game-night sheet to confirm.
