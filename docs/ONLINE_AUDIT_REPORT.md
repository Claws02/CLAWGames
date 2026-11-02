# Online audit report: Play Together and TV mode

Audit of CLAWGames `main` at `ab80280` (claw-core pinned at `c962da4`), 2026-11-02.
Finding IDs (F1…) are stable labels; the severity sections give the rank. Method and severity scale: [`ONLINE_AUDIT.md`](ONLINE_AUDIT.md).

**Inputs and scope.**
- **No real-device game night yet**, so this is the code half only. Every finding that
  depends on WiFi, iOS Safari's sleep behaviour or casting is marked SUSPECTED until the
  test sheet confirms it.
- **The night this report ranks for:** a **phone host**, **mostly iPhones**, drinking mode on.
  Reliability comes first; fairness and abuse rank after it. TV mode was traced but tested
  less hard.

**Evidence.**
- Reproductions ran in headless Chromium on the `?net=local` loopback, with throwaway
  scripts kept outside the repo (§6 has the fault-injection trick, for reuse in `qa/`).
- The loopback cannot show Trystero's timing. Where a finding depends on it, the trigger
  is taken from the vendored bundle. In particular, `vendor/trystero-nostr.min.js` closes
  a peer that stays `disconnected` for `yo=5e3`, i.e. **5 s**.
- Trystero opens its data channel with default options (`createDataChannel("data")`),
  which makes it **reliable and ordered**. So a message is not lost on a healthy link.
  Messages are lost when a link is down, is being rebuilt, or the peer is dropped. That is
  exactly what a locked iPhone causes.

**Headline.** The protocol has no recovery path. Every message is sent once, every state
waits for a specific message, and a peer that blips is deleted (seat, points and all) on
both sides. On a phone-host iPhone night, the most likely failures are:
1. **A phone sleeps for more than 5 s.** It is sent home and its points are erased.
2. **The host's phone sleeps.** The room ends for everyone.
3. **One phone misses the round card.** The whole room waits forever.

All three are VERIFIED on the loopback, and all have small fixes inside the current
architecture.

---

## 0. Fix status

Roadmap PRs 1–4 are on this branch (stacked on this PR, by request). **PRs 5–8 are on hold
until Caleb has tested 1–4 on real phones** (shared-phone fairness, host tools, TURN,
hygiene); the game-night notes may reorder them.

| Fix | Findings | How | Proven by |
|---|---|---|---|
| Stay awake | F24 (+ F1/F2 trigger) | `src/arcade/WakeLock.js`: Screen Wake Lock on every room/TV screen, re-asked when the page comes back; the phone host is told "Keep this phone on" | `qa/latejoin.js` §1 |
| Clear doors | F4, F8, F9, F10, F11 | `proto` in HELLO; `REFUSE {update / full}`, `WAIT {round}`; mid-round joiners queued and seated at RESULT; unseated phones ignore rounds; clients keep saying HELLO until seated; ROSTER pinned to the first host (a second one is a collision warning); unknown game types ignored | `qa/latejoin.js` §2–4, `qa/netfaults.js` §5 |
| Rounds that recover | F3, F5, F6, F14 (names), F15, F16 (partly), F17 | the host re-sends ROUND to un-ready phones and ROUND+GO to phones that haven't scored, every 3 s; a phone that scored sends `SYNC {n, scores}` until it has the RESULT; `n` on READY/SCORE; the host's card names who it's waiting for; START / FINISH WITHOUT THEM after 20 s without progress (phone and TV); +7 s grace for the long games | `qa/netfaults.js` §1–4 |
| Seats survive a drop | F1, F2, F7, F19 | a per-tab player id (sessionStorage); a dropped phone's seats go **away** (kept, with points, shown 💤) instead of being deleted; a HELLO with a known id takes them back; a round waits 20 s for an away seat; a phone that loses its host shows "Reconnecting…" for 60 s, re-signs in to the room after 10 s, and only then gives up; a deliberate leave (BYE) removes the seat between rounds; the host's tab keeps a snapshot, so a reloaded host gets **REOPEN ROOM** with the same code, players and points | `qa/rejoin.js` §1–6 |

Notes on what changed from the plan:
- **The player id is per tab (sessionStorage), not per browser.** It survives a reload and a
  locked screen. It does not survive closing the tab. A per-browser id would make two tabs
  on one device the same player, which breaks every loopback probe.
- **The grace for the long games is +7 s, not `soloGraceMs`.** That one is 0.6 × the round
  (108 s for Kart GP), which is too long to hold a room for; FINISH WITHOUT covers the rest.
- **The banked score of a phone cut off by the RESULT still isn't sent (F16).** The timer
  is longer instead.
- **What the loopback can't prove:** that Trystero re-handshakes when a phone re-signs in
  (`_rejoin`). The probes model a dead link that only comes back through a fresh
  hello/here, which is how it behaves, but the real check is the test sheet's lines 4–6
  and 11.
- **Protocol version.** A phone on the old build in a new room (or the reverse) can't
  understand the other. A new host tells an old phone nothing it can read, so the old
  phone shows its old hint. Everyone reloads once after the merge.

## 1. The system, mapped

### 1.1 Messages

Every message is `{t, v: 1, ...}` on one Trystero action (`hbd`). `Room.js:85` drops any
message whose `v !== 1`, silently.

| Message | Sender → receiver | Sent at | Acted on at | Notes |
|---|---|---|---|---|
| HELLO `{names}` | client → host (targeted) | `join()` broadcast `Room.js:120`; on **each** new peer, to **that** peer, while unseated `:87` | host `:252-257` | Ignored if full or mid-round `:254`, with no reply |
| ROSTER `{seats, totals, tv, hostSeated, mode, rules}` | host → all | any roster change, any peer join, drinking toggle `:88, :96, :134-138, :257, :70` | client `:265-270` | **Accepted from any peer**: the sender becomes `_hostPeer` `:266` |
| ROUND `{type, seed, n}` | host → all | `startRound` `:150` | client `:273` (from `_hostPeer` only) | Sent once. Unseated phones act on it too |
| READY `{}` | client → host | tap I'M READY `:158` | host `_hostReady` `:171-185` | No round number |
| GO `{n}` | host → all | last ready vote `:179` | client `:274` | Sent once. The client ignores `n` |
| SCORE `{scores[]}` | client → host | game(s) over `:165` | host `_hostScore` `:187-194` | No round number. A repeat overwrites |
| RESULT `{type, n, scores, pay, totals, winner, names, drinks, rules, mode}` | host → all | all scored, or the timer `:226` | client `:275` | Sent once |
| CMD `{}` | captain → TV | captain's button `:124` | TV host `:260` (seat 0's peer only) | |
| GHOST `{n, seat, s}` | any → all | every 110 ms in a time trial (`SoloArena.js:303`) | everyone `_onGhost` `:243-247` | Checks n, and that the seat belongs to the sender |

Transport events: `onPeerJoin` → client HELLO / host ROSTER (`:86-89`). `onPeerLeave` →
the client closes the room if the peer was the host (`:91`); the host **splices** that
peer's seats and totals (`:94`).

### 1.2 Timers

| Timer | Where | Value | Wall clock or game clock |
|---|---|---|---|
| Host round cap | `Room.js:183` | `most × (soloRoundMs + 8 s) + (most−1) × 15 s`, started at GO | wall |
| Phone watchdog | `SoloArena.js:207` | `soloRoundMs` (90 s; Kart/Shell 180, Golf 240, Trivia/H-or-L 150), started when that phone's game loads | wall |
| Game clocks | each game, `dt` capped at 0.1 s (`Stage.js:315`, 2D games' `_tick`) | per game | **game** (slows below 10 fps) |
| "Still looking" hint | `Together.js:82` | once, 12 s after JOIN | wall |
| Trystero peer drop | vendor `yo=5e3` | 5 s `disconnected` → peer closed | wall |
| Ghost send / stale | `SoloArena.js:303`, `Ghosts.js:344`, TV `TvHost.js:194` | 110 ms / 2.5 s / 4 s | wall |
| **Ready timeout** | none | none | none |
| **Pass-the-phone handoff** | none on the phone; budgeted 15 s in the host cap | none | none |

### 1.3 Host state machine (`Room.js`, phone host or TV)

```
                 host()                                   startRound(type)  [seats ≥ 2]
   (none) ─────────────────► LOBBY ───────────────────────────────────────────► CARD
                              ▲  │ HELLO: seat (if < 12)                          │ READY(peer)
                              │  │ peer leave: splice seat+totals                 │ every seated peer ready
                              │  │                                                ▼
                              │  └─ setDrinking → ROSTER                         PLAYING ──(GO sent once; timer armed)
                              │                                                   │ SCORE(peer) → store per seat
                              │      RESULT sent once                             │ all seats scored ─┐
                              └──────────────────────────────────────────────────┤ timer fires ──────┤
                                                                                  │ peer leave ───────┘ (re-check)
   Ways out of CARD:     every seated peer READY, or the un-ready peers leave.  NO timeout, NO skip.   ◄── F3
   Ways out of PLAYING:  all scores, timer, or the missing peers leave.
   Host leaves (back / tab closed / link dead): room ends for everyone (clients :91).                  ◄── F2
   HELLO in CARD/PLAYING: ignored, with no reply and no queue.                                         ◄── F4, F11
```

### 1.4 Phone state machine (`Together.js` + `Room.js`, client)

```
  JOIN ─► SEEKING ──ROSTER with me──► ROOM ──ROUND──► CARD ──tap READY──► WAITING_GO ──GO──► GAME(×players) ──► SENT_SCORE ──RESULT──► RESULT ─┐
           │ (hint at 12 s:              ▲                │                    │                 │ RESULT arrives: abort,                │
           │  "may be full")             │                │ RESULT             │ RESULT          │ banked score NOT sent                 │
           │ ROSTER without me:          └────────────────┴────────────────────┴─────────────────┴─────────────── ROUND (next) ◄─────────┘
           │   stays SEEKING; re-HELLO only to newly joined peers
           │ ROUND while unseated: CARD, READY, "You scored 0" (F8)
  Any state ── host peer leaves ──► toast "The host left the room." ──► HOME (room left, seat gone on host)
  Any state ── back button ──► HOME (leaves the room)
```

How each state can get stuck:

| Phone state | Waits for | If that never comes | Ways out today |
|---|---|---|---|
| SEEKING | a ROSTER that includes me | stays forever (F4, F9, F11) | back |
| CARD | the user's tap | the room waits on this phone (F3) | tap, back |
| WAITING_GO | GO | sits until the host timer, then RESULT, scored 0 (F5) | RESULT, back |
| GAME | its game ending / watchdog | n/a (local) | RESULT aborts it |
| SENT_SCORE | RESULT | sits until the next ROUND; totals stale; no DRINK card (F6) | next ROUND, back |
| RESULT | host action | n/a | next ROUND, back |

---

## 2. Findings

Ranked within each severity. "Probe" names the `qa/` script that should prove the fix;
new probes reuse the fault-injection trick in §6.

### P0: stuck screens, lost rounds, a room that dies

#### F1. A phone whose link drops for 5 s is sent home, and its seat and points are erased
- **Area:** C · **Severity:** P0 · **Status:** VERIFIED in code and on the loopback. SUSPECTED for how often iOS triggers it.
- **Evidence:**
  - The client treats a host leave as the room closing (`Room.js:91`), and the host splices the seat and totals (`Room.js:94`).
  - Trystero drops a peer after 5 s `disconnected` (vendor `yo=5e3`). A locked iPhone, or Safari sent to the background (to read a text), suspends the page and its WebRTC.
  - Loopback, cutting the link both ways: Bob, on 4 pts → Bob `home`, host totals `[0,4,2]` → `[0,2]`. He rejoins as a **new last seat with 0** (`["Ann","Cat","Bob"]`, `[0,2,0]`). The same happens mid-round: the phone goes `home` and the round finishes without it.
- **Smallest fix:**
  1. A stable player id (`claw.pid` in localStorage) in HELLO.
  2. The host marks a dropped peer's seats **away** (keeping the seat, points and order) instead of splicing them. A HELLO with a known pid rebinds the seat to the new peer id.
  3. The client does not leave when the host drops. It shows "Reconnecting…" for up to 60 s. Its Trystero room stays joined, so the link re-forms through signaling.
  4. Away seats are skipped for READY. In a round they score 0 when the round finishes.
- **Cost:** M. The protocol gains `pid`, and away seats show on the row. **Probe:** `qa/rejoin.js`: cut a guest's link between rounds and mid-round, then restore it. The seat and totals are unchanged and the phone never reaches `home`.

#### F2. The host's phone dropping for 5 s ends the room for everyone
- **Area:** C · **Severity:** P0 for a phone-host night · **Status:** VERIFIED on the loopback. SUSPECTED for iOS frequency.
- **Evidence:**
  - `Room.js:91` on every client.
  - Loopback: cut the host's links → Bob `home`, Cat `home`, while the host still shows `["Ann"]`.
  - The host phone is also the one most likely to be put down, or switched away to share the code.
- **Smallest fix:**
  - Covered by F1's client side: clients wait "Reconnecting to the host…" for 60 s instead of leaving.
  - The host's state lives in page memory, which survives a lock. If the page is reloaded, add a `sessionStorage` snapshot of `{code, seats by pid, totals, n, mode, rules}` and offer "Reopen room ABCD".
  - Host hand-off is **not** worth it (L effort; the host's state would need replicating).
- **Cost:** S on top of F1, M with the reload snapshot. **Probe:** `qa/rejoin.js`, host case: cut every host link for 10 s, restore them, play the next round, totals intact.

#### F3. One phone that misses ROUND blocks the room forever
- **Area:** B · **Severity:** P0 · **Status:** VERIFIED.
- **Evidence:**
  - ROUND is sent once (`Room.js:150`). GO waits for **every** seated peer (`:177`), and there is no timeout or skip.
  - Loopback, Cat drops ROUND: Ann and Bob READY, and 20 s later the host shows "2 of 3 phones ready…" with screens `netcard,netcard,room`. The only exit was Cat backing out of the room.
  - The same happens with no network fault at all if one guest walks away from their phone on the card.
- **Smallest fix:**
  - (a) While in CARD, the host re-sends ROUND, targeted, to seated peers that haven't readied, every 3 s.
  - (b) A ready board that names who is missing (F14), plus a host button "START WITHOUT THEM" after 20 s. Missing phones are treated as away for that round.
- **Cost:** S. **Probe:** `qa/netfaults.js`: drop ROUND at one guest; it gets the card within 4 s. Also leave one guest un-ready; START WITHOUT appears and the round plays.

#### F4. A late joiner is never seated, and is told the wrong thing
- **Area:** A/H · **Severity:** P0 (a stuck screen) · **Status:** VERIFIED.
- **Evidence:**
  - Mid-round HELLO is dropped (`Room.js:254`). The client only re-sends HELLO **to a newly joined peer** (`:87`), never to the host again.
  - Loopback: Cat reloads mid-round and joins. Its hint reads "Waiting for the host to pick a game…", and 13 s later "Still looking for that room… may be full".
  - After the round, 8 s later, and after a **fourth** phone joins, Cat is still unseated (`mySeat() = -1`; host seats `["Ann","Bob","Dan"]`).
- **Smallest fix:**
  - The host queues mid-round HELLOs and seats them at the round's RESULT.
  - It answers at once with `WAIT {reason:'round'}`, and the phone shows "A round is on. You're in from the next one."
  - The client also re-sends HELLO to the host on every ROSTER while unseated.
- **Cost:** S. **Probe:** `qa/latejoin.js`: join during a round; the message shows; the phone is seated the moment RESULT lands and plays the next round.

### P1: wrong scores, confusing states

#### F5. A phone that misses GO holds the whole room for the round cap, then scores 0
- **Area:** B · **Status:** VERIFIED.
- **Evidence:** loopback, Cat drops GO. Cat sits on "Waiting for everyone…". Ann and Bob finished at once, and RESULT came **97 s** later (Snap Strike: 90 + 8 grace). Cat scored 0.
- **Smallest fix:** a client SYNC. While WAITING_GO or SENT_SCORE, the client sends `SYNC {n}` every 3 s. The host replies with what that phone lacks: ROUND+GO if started, or the last RESULT. Combined with F3's resend, this covers every lost host message with one mechanism, and needs no acks.
- **Cost:** S–M. **Probe:** `qa/netfaults.js`: drop GO at one guest; it starts within 4 s; the round ends when the scores are in, not at the cap.

#### F6. A phone that misses RESULT waits until the next round, misses the DRINK card, and keeps stale totals
- **Area:** B/H · **Status:** VERIFIED.
- **Evidence:**
  - Loopback, Cat drops RESULT: Cat stays on "You scored 12 / Waiting for the other phones…", unchanged 10 s later.
  - The next ROUND does recover the screen, but Cat's totals are `[5,5,0]` against the host's `[5,7,4]`. ROUND carries no totals, and ROSTER isn't re-sent.
  - In drinking mode that phone never sees who drinks (`Together.js:303`).
- **Smallest fix:** F5's SYNC (the host answers with the last RESULT). Add `totals` to ROUND as a belt-and-braces measure.
- **Cost:** S (with F5). **Probe:** `qa/netfaults.js`: drop RESULT at one guest; it shows the result and the DRINK card within 4 s.

#### F7. Reloading loses the seat and the points; a rejoin is a new player
- **Area:** C · **Status:** VERIFIED. Same root as F1.
- **Evidence:**
  - A reload is a new Trystero `selfId` and a new loopback `selfId` (`LoopbackStrategy.js:31`).
  - Loopback: Cat (4 pts) reloads mid-round → host seats `["Ann","Bob"]`, totals `[0,2]`.
- **Smallest fix:** F1's `pid` rebinding. A reload rejoins its old seat (between rounds at once; mid-round, queued as in F4).
- **Cost:** S on top of F1. **Probe:** `qa/rejoin.js`, reload case.

#### F8. An unseated phone is shown the round card, can "play", and is told "You scored 0"
- **Area:** H · **Status:** VERIFIED.
- **Evidence:**
  - The client acts on ROUND regardless of seat (`Room.js:273`).
  - Loopback: unseated Cat gets SNAP STRIKE's card. Tapping READY does nothing on the host ("0 of 2 phones ready…"). After GO, Cat shows "You scored 0 / Waiting for the other phones…" and then a results screen it isn't on.
- **Smallest fix:** while unseated, ignore ROUND, GO and RESULT, and show F4's queue message.
- **Cost:** S. **Probe:** `qa/latejoin.js`.

#### F9. A phone on a cached older build hangs with "the room may be full"
- **Area:** F · **Status:** VERIFIED.
- **Evidence:**
  - `Room.js:85` drops `v !== 1` silently, both ways.
  - Loopback, with `main`'s Room.js served to one phone with `V = 0`: that phone receives the host's ROSTER and drops it (`{"roster":1}` seen), the host ignores its HELLO, and after 14 s it reads "Still looking for that room… may be full". It never appears on the host.
  - *Correction:* the first run of this reproduction put the stale phone in a separate browser context, which the loopback (a BroadcastChannel) doesn't cross, so that phone heard nothing for a different reason. It was re-run in one context, with the same result. No other reproduction used a second context.
  - Fields have been added under `v: 1` since (`hostSeated`, `drinks`, GHOST). An old phone in a new room mostly works, but no future change can be made safely.
- **Smallest fix:**
  - HELLO carries `proto` and `build`. The host checks it, and answers a mismatch with `REFUSE {reason:'update'}`, sent in an envelope every build reads: keep `v: 1` on HELLO/REFUSE forever, and move the real version into `proto`.
  - The phone shows "This phone has an older CLAW Games. Tap to refresh." and calls `location.reload()`. `sw.js` is network-first, so one reload is enough.
  - Old builds already in the wild can't read REFUSE. They keep today's hint, so word the hint "…or refresh this page".
- **Cost:** S. **Probe:** `qa/version.js`: route `Room.js` with an older `proto` and expect the refresh card.

#### F10. Any peer can take over every phone by sending ROSTER, and two rooms on one code fight
- **Area:** A/E · **Status:** VERIFIED for the takeover. SUSPECTED for real code collisions.
- **Evidence:**
  - `Room.js:265-266` takes `_hostPeer` from **any** ROSTER.
  - Loopback: guest Bob sends a ROSTER, and Cat and Dan then show `["PWNED"]`, mode `drinking`. Bob's follow-up ROUND with an unknown type then puts Dan on a broken card: `MG_INFO[type]` is undefined, the throw is swallowed by `_emit`'s catch, and the card stays up.
  - Two hosts on one code would both send ROSTERs, and phones would flip between them. The password is derived from the code (`NetTransport.js:144`, `hbd-${roomId}`), so the comment at `:141-143` ("still cannot read each other's traffic") is wrong: the same code means the same key.
- **Smallest fix:**
  - The client pins `_hostPeer` to the first ROSTER's sender and ignores ROSTER, ROUND, GO and RESULT from anyone else.
  - A second ROSTER from another peer shows "Two rooms are using this code. Ask your host to open a new room."
  - The host re-rolls its code if it hears a ROSTER from another peer within its first 3 s.
  - Reject unknown `type`s.
  - Fix the comment.
- **Cost:** S. **Probe:** `qa/netfaults.js`, takeover case: a guest-forged ROSTER is ignored.

#### F11. Full-room and mid-round refusals are silent
- **Area:** A/H · **Status:** VERIFIED.
- **Evidence:** `Room.js:254` returns with no reply. The only message is the one-time hint at `Together.js:82` ("Check the code, or the room may be full."), which is the same text for full, mid-round, stale and wrong-code.
- **Smallest fix:** `REFUSE {reason:'full'|'update'}` and `WAIT {reason:'round'}`, with a distinct message for each. A wrong code keeps today's hint.
- **Cost:** S (it ships with F4 and F9). **Probe:** `qa/drinking.js` extended: a 13th phone sees "This room is full (12)".

#### F12. Pass the phone: later players replay a challenge they just watched
- **Area:** D · **Status:** VERIFIED in code.
- **Evidence:**
  - Every player on a shared phone plays the same `r.seed` in turn (`Together.js:234`).
  - For memory-type games the second player has seen the answers: Trivia's questions and answer order, Higher or Lower's deck, Shell Game's shuffles, Stop the Clock's targets, and Balloon Pump's hidden limits.
  - Score attack games (Snap Strike, Loot Catch…) only gain a little from it.
- **Smallest fix:**
  - Tag the memorable games (a `memorable: true` row in the registry, claw-core for its own games and `src/games/index.js` for the arcade's).
  - When any phone carries more than one player, take those games out of SURPRISE ME and the TV wheel, and mark them on the host's picker as "⚠ shared phones see the answers".
  - Per-player seeds would break "everyone plays the same challenge" across phones, so don't.
- **Cost:** S (a claw-core PR first for its rows). **Probe:** `qa/together.js` extended: with a two-player phone in the room, the random pick never returns a memorable game in 50 draws.

#### F13. No TURN relay: phones behind AP/client isolation, or on mobile data, may never connect
- **Area:** A · **Status:** SUSPECTED (needs test-sheet line 12).
- **Evidence:** `AppHost.js:50` has `turnServers: []`. Many home routers isolate clients on guest SSIDs, and carrier NAT on mobile data is often symmetric. Either one blocks a direct link.
- **Smallest fix:** fill `RELEASE.turnServers` (the code path already exists, `NetTransport.js:126-131`).
- **Cost:** S for the code. The decision costs more:
  - The credentials are public in a static site.
  - A free tier (e.g. Cloudflare's or metered.ca's) is enough for one night of tiny messages, since GHOST is about 9 KB/s per phone. The risk is quota abuse, not cost.
- **Probe:** none possible on the loopback. Use the test sheet's line 12.

#### F14. Waiting states show counts, never names; the host can't remove anyone
- **Area:** H · **Severity:** P1, because it makes F3 undiagnosable in the room · **Status:** VERIFIED.
- **Evidence:** "k of n phones ready…" (`Room.js:176`, `Together.js:88`) and "k of n scores in" (`:94`). There is no kick anywhere in `src`.
- **Smallest fix:** the host's card lists the not-ready / not-scored names. Tapping a name on the host's room list removes that seat (and its pid, for the rest of the night).
- **Cost:** S. **Probe:** `qa/hostwatch.js` extended.

#### F24. No Screen Wake Lock
- **Area:** C · **Severity:** P1 · **Status:** VERIFIED (no `wakeLock` anywhere in `src`).
- **Evidence:** nothing keeps a phone awake in a room, so auto-lock is the likeliest trigger of F1 and F2. Wake Lock is the cheapest way to make them rare: it stops the auto-lock, though not a deliberate lock or an app switch.
- **Smallest fix:**
  - `navigator.wakeLock.request('screen')` on entering any room screen, re-acquired on `visibilitychange`, and released on leaving.
  - Supported in iOS Safari 16.4+, with a home-screen-app bug fixed in 18.4 (SUSPECTED: confirm on the night).
- **Cost:** S. Ship it first (top-5 #2). **Probe:** `qa/together.js`: a stubbed `navigator.wakeLock` records a request on joining and a release on leaving.

### P2: polish and performance

#### F15. READY and SCORE carry no round number
- **Area:** B · **Status:** VERIFIED by trace; not reproduced (it needs a double fault).
- **Evidence:** `Room.js:158, :165` send no `n`. `_hostScore` (`:187-194`) accepts any SCORE while a round is started, and a repeat overwrites. A phone that missed RESULT N while still in its game could report into round N+1.
- **Smallest fix:** add `n` to both and drop mismatches.
- **Cost:** S (with F5). **Probe:** `qa/netfaults.js`: a SCORE with an old `n` is ignored.

#### F16. A phone whose GO lands more than 8 s late loses its score
- **Area:** D · **Status:** VERIFIED by trace; SUSPECTED for frequency.
- **Evidence:**
  - The host cap is `cap + 8 s` from its own GO (`Room.js:183`). The phone's watchdog starts when its game **loads** (`SoloArena.js:207`).
  - For a game that runs to its cap (Kart's 150 s bell, Trivia), a phone that starts more than 8 s late (a slow first load of a 3D game, or a brief freeze) is cut off by RESULT.
  - `_showResult → _abortGame → forceEnd` banks a partial score (`Together.js:274`) that is **never sent**, because `_playing` is already false (`:219`).
- **Smallest fix:**
  - Raise GRACE for the 3D time trials (use `soloGraceMs`, which already exists at `MinigameRegistry.js:319`).
  - When the host timer fires, have it ask still-playing phones for a final SCORE and wait 2 s before RESULT.
- **Cost:** S. **Probe:** `qa/netfaults.js`: delay GO 10 s at one guest in Kart GP; that guest's score is non-zero.

#### F17. A frozen phone with a live link holds the room until the cap
- **Area:** C · **Status:** VERIFIED.
- **Evidence:** loopback with CDP `Page.setWebLifecycleState frozen` for 20 s mid-round: the host is still waiting, and on resume Bob is back in his game. Room-wide this is bounded by the cap (up to 98 s; 248 s for Mini Golf on the phone picker).
- **Smallest fix:** this is F3's "START WITHOUT THEM" for the playing phase too, once all but the frozen phones have scored for 20 s.
- **Cost:** S. **Probe:** `qa/netfaults.js`, freeze case.

#### F18. Below 10 fps a phone's game runs in slow motion and the watchdog cuts it off
- **Area:** D · **Status:** VERIFIED.
- **Evidence:**
  - `dt` is capped at 0.1 s (`Stage.js:315`; Snap Strike `:206`, Loot Catch `:202`, …) and game clocks sum `dt`.
  - Loot Catch, idle, CPU throttled: ×20 (17.6 fps) took 36.6 s against 35.4 s normal, which is fine. ×80 (2.6 fps) took **90.4 s**: still in slow motion when the 90 s watchdog took the banked score.
  - Above 10 fps there is no effect, so on real phones this only bites a struggling 3D game (Kart GP on an old phone).
  - Slow motion is not an advantage for the time trials (a time is game time), but a cut-off is a loss.
- **Smallest fix:** none needed now. Watch for it on the game night (test-sheet line 8). If it shows up, lower the Kart/Boat/Rift draw distance in solo mode.
- **Cost:** none now. **Probe:** reuse the throttling in `qa/ghosts.js`.

#### F19. A player leaving mid-time-trial shifts seat indices and breaks later seats' ghosts
- **Area:** G/D · **Status:** VERIFIED by trace.
- **Evidence:**
  - The leave splices `_seats` (`Room.js:94`).
  - Each phone's ghost link captured its seat index at start (`Together.js:233, :264`).
  - `_onGhost` then rejects them, because `_seats[m.seat].peer !== peer` (`:245`).
  - Every racer after the leaver vanishes from the ghosts and from the TV's running order for the rest of the race.
- **Smallest fix:** F1's away seats (no splice) remove this. Otherwise key ghosts by pid.
- **Cost:** none with F1. **Probe:** `qa/ghosts.js` extended: drop seat 1 mid-race; seat 2's ghost stays.

#### F20. Pass the phone: the handoff card has no countdown
- **Area:** H · **Status:** VERIFIED by trace.
- **Evidence:** the handoff card has no timeout (`Together.js:249-258`). If the next player never taps, the host's cap ends the round, with that player scored 0. This is acceptable, but the card should say how long is left.
- **Smallest fix:** a countdown on the handoff card.
- **Cost:** S. **Probe:** none needed.

#### F21. 12-phone GHOST traffic: fine on the loopback
- **Area:** G · **Status:** VERIFIED on the loopback; real phones SUSPECTED.
- **Evidence:**
  - 12 phones in one room. 11 send a kart-sized ghost every 110 ms, and P0 receives **99 GHOST/s**, **92 bytes** each.
  - P0's frame rate was 59.7 fps without ghosts and 60.3 fps with them.
  - On a real mesh each phone sends 99 and receives 99 data-channel messages a second (1,188/s room-wide), about 9 KB/s each way per phone.
  - Join times on the loopback were 77–385 ms per phone. That is meaningless for real WiFi.
- **Smallest fix:** none now. If a mid-range Android stutters on the night, halve the send rate above 6 racers (`SEND_MS` in `SoloArena.js:303`), a claw-core change.
- **Cost:** S if needed. **Probe:** `qa/ghosts.js` at 12.

#### F22. The TV tab when casting
- **Area:** C/G · **Status:** SUSPECTED.
- **Evidence:** Chrome throttles timers in hidden tabs (and heavily after 5 min). A cast tab is normally visible, but a laptop lid closed or the tab switched would delay the TV host's timers and its replies. Not tested here: TV mode isn't this night's format.
- **Smallest fix:** a Wake Lock on the TV host too (F24), and "keep this tab in front" on the TV lobby.
- **Cost:** S. **Probe:** test sheet line 13.

### P3: ideas and low-risk hygiene

#### F23. Scores and payloads are trusted
- **Area:** E · **Status:** VERIFIED by trace.
- **Evidence:**
  - The host clamps only below zero (`Room.js:191`). A modified phone can send `1e9` and win every round.
  - GHOST `s` is any object, with no size check (`:245`). There are no rate limits.
  - **Names are escaped at every HTML sink I found:** `Together.js:142, :152, :315-316`; `TvHost.js:106, :198, :219`; `DrinkCard.js:30-39`; ghost tags draw to a canvas (`Ghosts.js:357-366`).
  - Numbers from RESULT go into innerHTML unescaped (`Together.js:298`, `TvHost.js:212`), but only the host writes those. After F10 a guest can't forge them.
- **Smallest fix:** a per-game `scoreMax` row (claw-core) that the host clamps to. Drop GHOSTs over 256 bytes.
- **Cost:** S. **Probe:** `qa/netfaults.js`, forged-score case.

#### F25. Room codes: 4 characters from 31, with no collision check
- **Area:** A · **Status:** SUSPECTED (low probability).
- **Evidence:** 923,521 codes (`NetTransport.js:51-52`). For one night the odds of a clash are tiny, and F10's detection covers the consequence. Longer codes cost typing; the QR/`?join=` link already avoids typing on TV nights.
- **Smallest fix:** F10's detection. Leave the length.
- **Cost:** none. **Probe:** none.

#### F26. Ghosts leak GPU resources when dropped
- **Area:** G · **Status:** VERIFIED by trace.
- **Evidence:** `_drop` removes the objects from the scene but never disposes the cloned materials or the CanvasTexture (`Ghosts.js:350-356, :363, :380-385`). A ghost that goes stale for 2.5 s and comes back is rebuilt. This is small per night.
- **Smallest fix:** dispose the materials, textures and geometry in `_drop`.
- **Cost:** S (claw-core). **Probe:** `qa/ghosts.js`: `renderer.info.memory` is flat across two races.

#### F27. Drinking mode: who decides
- **Area:** H · **Status:** VERIFIED.
- **Evidence:**
  - The room starts in the host phone's own 🦀 setting (`Room.js:106`), and after that only the host's switch counts. A guest's 🦀 is ignored online.
  - Sips are bounded: at most **2 per player per round** (the last of n has weight `(n−1)`, with total weight `n(n−1)/2` and n sips, `Drinks.js:49-66`), plus house rules.
- **Smallest fix:** on a guest's room screen, a line "🍺 Drinking mode is the host's call: ON/OFF". No cap change needed.
- **Cost:** S. **Probe:** `qa/drinking.js`.

#### F28. GO spread and timing fairness
- **Area:** D · **Status:** VERIFIED by trace (fair). SUSPECTED for the spread on real WiFi.
- **Evidence:**
  - Each phone's game clock starts on its own GO and load (`Together.js:234`). Scores never compare wall-clock moments across phones.
  - The two-page run showed up to ~1 s of start skew from load time alone (Speed Boat A still `ready` while B was racing). It only offsets the ghosts.
- **Smallest fix:** none.
- **Cost:** none. **Probe:** none.

#### F29. Privacy note
- **Area:** H · **Status:** VERIFIED (design).
- **Evidence:** the public Nostr relays and torrent trackers see room codes and IP addresses (`NetTransport.js:30-37`).
- **Smallest fix:** a one-line note on the Play Together screen, before any store build (`DESIGN.md` §11).
- **Cost:** S. **Probe:** none.

---

## 3. Fairness, game by game

Two checks:
- **Static:** every `Math.random` in each of the 15 parallel games, classified.
- **Dynamic:** two pages, **same seed (4242), deliberately different `Math.random` streams**,
  idle 12 s, comparing the banked score and `_debugState()`. A third page with another seed is
  the control.

Result: **no score path depends on `Math.random` in solo play.** Where the dynamic run
showed a DIFF, the differing fields were clocks and phases, from page start skew; the
challenge fields matched.

| Game | Challenge from | `Math.random` used for (solo) | Dynamic check |
|---|---|---|---|
| Snap Strike | `draw(_round*4+k)` `SnapStrike.js:137` | bots only `:56, :148-152` | equal |
| Odd One Out | `draw(_puzzles*8 + k%8)` `OddOneOut.js:59`, `_k` reset `:81, :189` | bots `:212, :254` | equal |
| Steady Hand | `draw(pid)` start angle `SteadyHand.js:86` | bot finger jitter `:221-222` | equal |
| Speed Boat | gates `draw(i)` `SpeedBoat.js:127` | rock size/rotation/±0.25 z (visual; collision is `_blocked` on the gate `:130`), wake `:403`, bots `:371` | gates equal (`gap 0.48`, 23 rows); clock skew only |
| Loot Catch | `draw(_waves*16+k)` `LootCatch.js:234` | bots `:351` | equal |
| Tree Climb | `draw(branches.length)` `TreeClimb.js:59` | scenery `:189-191`, bots | equal but for clock |
| Rift Dive | sequential `draw(i++)` at build `RiftDive.js:120` | debris rotation `:150`, bots | build equal; clock skew |
| Balloon Pump | `draw(_round)` limits `BalloonPump.js:190` | bots `:198-200` | equal |
| Kart GP | track `draw(1)` `KartGrandPrix.js:210`; scenery fixed-seed `:450`; solo items always 🍄 `:867` | flames/sparks/HUD wobble `:723-755`, bots `:636` | equal (score 496 = 496) |
| Mini Golf | holes `draw(100+i)` `MiniGolf.js:185`, per-hole seed `:450`; plinko by hash `golf/Physics.js:876` | effects `:834, :844`, shake `:1260`, `golf/Build.js` scenery | holes, par and cup equal |
| Pancake Stack | swing phase `draw(slot)` `PancakeStack.js:182` | bots `:260` | equal but for clock |
| Shell Game | `draw(_round*100+k)` `ShellGame.js:97` | bots `:276-277` | answer, swaps and speed equal |
| Stop the Clock | `draw(_round*10…)` `StopClock.js:56-57` | none | equal |
| Trivia | question shuffle `draw(j)` `Trivia.js:34`, answer order `:78` | none | equal |
| Higher or Lower | deck `draw(k*1000+j)` `HigherLower.js:63` | none | equal |

Two remaining fairness caveats:
- **Pass the phone** (F12).
- **Integration-dependent challenges.** Steady Hand's target, Speed Boat's moving gate and
  the physics games integrate over `dt`, so different frame rates give marginally different
  trajectories. That is invisible above 30 fps. Not a finding.

---

## 4. Fix roadmap

Each PR ships alone under `CLAUDE.md`:
- branch from `origin/main`;
- one PR per deliverable;
- a claw-core PR first where noted, with the submodule pinned to claw-core `main`;
- `npm run smoke` plus its probe.

The protocol PRs (2–4) build on each other but each one is playable alone.

| # | PR | Fixes | Effort | Play it |
|---|---|---|---|---|
| 1 | **Stay awake** | F24, F22 (Wake Lock on room/TV screens; a "keep CLAW Games open" line on the host's room screen) | S | Pages → Play Together → host on an iPhone and leave it on the table 2 minutes: the screen stays on. |
| 2 | **Clear doors**: `proto` in HELLO; REFUSE `full`/`update` and WAIT `round`; late joiners queued and seated at RESULT; unseated phones ignore rounds; ROSTER pinned to the first host; unknown types rejected; collision warning; fix the password comment | F4, F8, F9, F10, F11, F25 | S–M | Join a 4th phone while a round is on: it says "you're in from the next one" and plays the next round. |
| 3 | **Rounds that recover**: host re-sends ROUND to un-ready phones; client SYNC every 3 s while waiting (host answers ROUND/GO/last RESULT); `n` on READY/SCORE; totals on ROUND; a ready board with names; START WITHOUT THEM after 20 s (CARD and PLAYING); GRACE from `soloGraceMs` | F3, F5, F6, F14 (names part), F15, F16, F17 | M | Start a round and leave one phone on the card: the host sees its name and START WITHOUT THEM after 20 s; the round plays. |
| 4 | **Seats survive a drop**: `claw.pid`; away seats instead of splice; rejoin rebinds; clients "Reconnecting…" for 60 s instead of going home; host snapshot in sessionStorage plus "Reopen room" | F1, F2, F7, F19 | M | Mid-game night, lock a guest phone for 30 s and unlock it: same seat, same points, playing the next round. Then lock the host for 30 s: nobody is sent home. |
| 5 | **Shared-phone fairness**: claw-core PR first (a `memorable` row for Shell Game, Balloon Pump); then the arcade rows (Trivia, Higher or Lower, Stop the Clock) and the filter in SURPRISE ME, the wheel and the picker | F12 | S | Add a second player on one phone, tap SURPRISE ME ten times: never Trivia, Shell Game or the rest. |
| 6 | **Host tools**: tap-to-remove a seat; drinking "host's call" line on guests | F14 (kick), F27 | S | Host taps a name → REMOVE: that phone goes home with "The host removed you". |
| 7 | **TURN** (decision first: provider, public credentials) | F13 | S | One phone on mobile data joins the WiFi room. |
| 8 | **Hygiene** (claw-core first): Ghosts dispose; per-game `scoreMax` clamp; GHOST size cap; privacy note | F23, F26, F29 | S | Two Kart GP races in a row with 4 phones; ghosts still smooth. |

New probes the PRs add:
- `qa/netfaults.js`: drop, delay, freeze and forge, using §6's hook.
- `qa/latejoin.js`
- `qa/rejoin.js`: cutting a link, as in §6.
- `qa/version.js`

Then extend `qa/together.js`, `qa/drinking.js` (13th phone) and `qa/ghosts.js` (seat drop).

## 5. Top 5 for a real game night

1. **Seats survive a drop (PR 4).** On an iPhone night a locked screen is the commonest
   event there is. Today it costs that player their points and sends them home, and on the
   host's phone it ends the night.
2. **Stay awake (PR 1).** It's tiny, and it turns most locks in item 1 into non-events.
   Ship it first.
3. **Rounds that recover, plus a named ready board with START WITHOUT THEM (PR 3).** One
   stuck phone currently stops twelve people with no way out but making that phone leave.
4. **Clear doors for late joiners and old builds (PR 2).** A friend who arrives mid-round,
   or whose Safari cached yesterday's build, is stuck today on a screen that says the wrong
   thing.
5. **Shared-phone fairness (PR 5).** With drinking on, a couple sharing a phone and getting
   the same Trivia questions twice will be noticed.

## 6. How the reproductions were done (for the new probes)

- **Dropping a message at one phone:**
  - An init script wraps `BroadcastChannel.prototype.onmessage`'s setter.
  - It skips loopback `{k:'data', d:{t}}` frames whose `t` is in `window.__drop`, and counts
    every `t` in `window.__seen`.
  - The wrapper must be installed before `LoopbackStrategy.js` assigns `chan.onmessage`
    (`addInitScript` does that).
- **A dead WebRTC link (Trystero's 5 s drop):**
  - From either page, open a second `BroadcastChannel('hbd-loopback:claw-games-CODE')`.
  - Post `{k:'bye', from:A, to:B}` and `{k:'bye', from:B, to:A}`. Each end then sees only
    the other leave.
  - The loopback honours `to` before the switch (`LoopbackStrategy.js:49`).
- **A suspended page:** CDP `Page.setWebLifecycleState {state:'frozen'}`, then back to `'active'`.
- **A slow phone:** CDP `Emulation.setCPUThrottlingRate`.
- **A stale build:** `context.route('**/src/net/Room.js')` rewriting `const V = 1;`.
- **Fairness:** an init script replaces `Math.random` with a seeded generator, with a different
  seed per page. Then `SoloArena.play(type, 4242, …)` runs on both pages, and `liveScore()` and
  `_debugState()` are compared.

What the loopback can't show (it needs the test sheet):
- real join times and which signaling strategy wins;
- iOS lock and app-switch timing;
- the GO spread on WiFi;
- TURN-less networks;
- casting;
- battery and heat over two hours.
