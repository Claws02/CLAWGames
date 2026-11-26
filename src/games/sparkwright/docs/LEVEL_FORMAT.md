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

Every part also needs `mass` (kg) and `cost` ($), plus a `label` for the tray.
The hero **carries every part not fitted** (tray mass), so mass changes spring height and lift load.

| kind | fields | unit / meaning |
|---|---|---|
| `spring` | `k` | N/m. Springs on one bench act in **parallel**: k adds |
| `motor` | `torque`, `rpm` | N·m at the shaft, speed |
| `gear` | `ratio`, `eff`, `maxTorque` | n:1 reduction, efficiency, output torque rating (over it → strips) |
| `resistor` | `ohms`, `watts` | Ω (0 = jumper), power rating (P = I²R over it → burns) |
| `fuse` | `amps` | blows above this current |
| `battery` | `volts` | V |

Ids are unique across parts AND devices. Never use real product names or specs.

## Devices

| type | fields | behaviour |
|---|---|---|
| `socket` (a **workbench**) | `x, y, slots: [{ id, accepts, label }]`, optional `preset: { slot: partId }`, `fixed` | stand at it + TOOL opens the bench. Benches must be ≥ 2 tiles apart |
| `spring` | `x, y, w?, socket, compress` (m) | solid pad; landing with springs fitted launches `h = Σk·x²/(2·(80 + tray)·9.81)` m. Put it in a floor recess |
| `lift` | `x, w, yTop, yBottom, socket` (motor + gear slots), `drumR` m, `massKg` | rises while ridden if `τ·n·η ≥ (massKg + 80 + tray)·g·r` AND the gear's `maxTorque` ≥ that load (else it **strips**: parts eject). Speed `(rpm·2π/60)/n·r`. Shaft rows yTop−1…yBottom−1 must be `.`; row yBottom solid |
| `circuit` | `socket` (resistor slot(s) in series + a fuse slot, + a battery slot unless `volts`), `loadR, iMin, iMax`, `drives[]` | `I = V/(loadR+ΣR)`. Fails in this order: no fuse (no power) → I > fuse (blows) → I > iMax (load burns) → any `I²R > watts` (resistor burns) → I < iMin (too weak). Any failure ejects the bench's parts and resets in 1.5 s |
| `door` | `x, y, h` | solid until powered. Needs solid above and below |
| `bridge` | `x, y, w` | hard-light floor, solid only while powered |

## Work order (required on campaign levels)

```js
solution: { s1: { a: 'k30', b: 'k45' } },          // bench → slot → intended part
workOrder: { title: 'Reach the loading ledge',
             checks: [{ type: 'budget', max: 10 }, { type: 'noRestarts' }] },   // exactly two: ★2 and ★3
```

★1 is clearing the shift. Check types: `budget {max}`, `par`, `noRestarts`, `liftTime {device, max}`,
`fuseProtects {device}` (fuse ≤ the load's iMax), `margin {device, min}` (lift torque margin). See `core/Review.js`.
The brief states the job and its numbers, never the answer.

## What the checker enforces (summary — `core/Lint.js` is the truth)

1. **data**: fields, types, ranges (incl. mass/cost/ratings), unique ids, bench slots, devices find their slots, `solution` complete, two work-order checks.
2. **layout**: rows equal width, known chars, closed border, S/G on floor with headroom, device tiles `.` and unshared, lift shafts open, benches apart, doors capped.
3. **puzzle**: every way to fill the benches is evaluated with the device maths and grouped by effect (launch height, lift speed, power on/off); one solver run per group. The intended build works; empty benches fail; some **complete** wrong build fails; some build earns ★★★; each ★ check is missed by at least one working build (the budget must bite); warn if > 70 % of complete builds work.
4. **reach**: the solver fits the intended parts and finishes; in every build group, no reachable spot that can reach neither the exit nor a bench (softlock).
5. **ghost**: solver tape replayed twice: wins, identical frames and final state.
6. **progress**: concepts known; each device's concept taught or required; campaign teaches before it requires; par within 0.6–3 × the solver route.
