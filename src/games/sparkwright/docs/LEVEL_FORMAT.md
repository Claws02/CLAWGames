# Level format

One level = one ES module in `levels/` exporting a plain, JSON-shaped object. Register it in
`levels/index.js`. Coordinates are **tiles**, `x` right, `y` **down** (row 0 is the top of `map`).

```js
export default {
    id: 'm04', world: 'elec', order: 4, name: 'Ohm Sweet Ohm',
    teaches: ['ohm', 'fuse'],        // concept ids (core/Rules.js CONCEPTS) this level introduces
    requires: ['move'],              // concepts an earlier level (lower order) must have taught
    brief: 'One or two sentences. State the requirement (e.g. "needs 0.4–1.0 A"), never the answer.',
    map: [ '##################', '#.......#........#', ... ],
    parts: [ { id: 'r10', kind: 'resistor', ohms: 10, label: 'Resistor 10 Ω' }, ... ],
    devices: [ { type: 'socket', id: 's1', x: 4, y: 6, accepts: 'resistor' }, ... ],
    solution: { s1: 'r10' },         // the intended part for every non-fixed socket
    par: { seconds: 4 },             // ≈ 1.5 × the solver route (checker prints it)
    check: { maxStates: 80000 },     // optional: raise the solver cap for a big level
};
```

## Tiles

| Char | Tile | Notes |
|---|---|---|
| `.` | empty | device tiles must be `.` in the map |
| `#` | solid | border must be closed (`#` sides/top; `#` or `^` bottom) |
| `=` | one-way platform | land from above, pass through from below |
| `^` | floor spikes | hitbox = lower half; death → respawn at S, parts stay fitted |
| `v` | ceiling spikes | hitbox = upper half (punishes an over-stiff spring) |
| `H` | ladder | ▲/▼ to climb; the top rung is a one-way floor |
| `S` | start | exactly one; solid floor under it |
| `G` | exit | one or more; solid floor under it |

Hero: 0.7 × 0.9 tiles. Jump rise ≈ 2.7 tiles → a 2-tile step is climbable, 3 is not. Running jump
clears a 4-tile gap; make gaps 6+ if only a device should cross them.

## Parts (`kind` → required fields)

| kind | fields | unit |
|---|---|---|
| `spring` | `k` | N/m (1 000 – 1 000 000) |
| `gear` | `ratio`, `eff` | n:1 reduction, efficiency 0.3–1 |
| `resistor` | `ohms` | Ω (0 = jumper wire) |
| `battery` | `volts` | V |

Every part needs a `label` shown in the tray. Ids are unique across parts AND devices.

## Devices

| type | fields | behaviour |
|---|---|---|
| `socket` | `x, y, accepts` (spring/gear/resistor/battery), optional `preset` (part id), `fixed` | stand in it + TOOL to fit/swap/remove. Sockets must be ≥ 2 tiles apart |
| `spring` | `x, y, w?, socket, compress` (m) | solid pad; landing on it with a spring fitted launches `h = k·x²/(2·80·9.81)` tiles. Put it in a floor recess so its top is flush |
| `lift` | `x, w, yTop, yBottom, socket, motor{torque N·m, rpm}, drumR m, massKg` | `yTop/yBottom` are the platform's **surface** rows. Rises only while you ride it AND `τ·n·η ≥ (massKg+80)·g·r`; speed `(rpm·2π/60)/n·r`. Returns down empty. Shaft tiles (rows yTop−1 … yBottom−1) must be `.`; row yBottom solid |
| `circuit` | `loadR, iMin, iMax, sockets[] (resistors, series), volts` **or** `battery` (socket id), `drives[]` | `I = V/(loadR+ΣR)`. Empty socket = open. `I > iMax` blows the fuse: parts pop back to the tray, 1.5 s reset. `I ≥ iMin` powers `drives` |
| `door` | `x, y, h` | solid until powered. Needs solid above and below or it can be jumped |
| `bridge` | `x, y, w` | hard-light floor, solid only while powered |

Doors and bridges never switch solid while the hero overlaps them.

## What the checker enforces (summary — `core/Lint.js` is the truth)

1. **data** — fields, types, ranges, unique ids, socket kinds match, `solution` valid and complete.
2. **layout** — rows equal width, known chars, closed border, S/G on floor with headroom, device tiles `.` and unshared, lift shafts open, sockets apart, doors capped.
3. **puzzle** — every assignment of parts to sockets simulated: intended works; empty fails; ≥ 1 wrong answer fails; warn if > 50 % of choices work or only one part fits.
4. **reach** — solver (with installs) finishes; no reachable state from which the exit is unreachable (softlock).
5. **ghost** — solver tape replayed twice: wins, identical frames and final state.
6. **progress** — concepts known; each device's concept taught or required; campaign teaches before it requires; par within 0.6–3 × the solver route.
