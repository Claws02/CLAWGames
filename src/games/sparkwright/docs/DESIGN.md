# Sparkwright — design

## Pitch

You're a field engineer in a facility where every room has something broken. You carry a tray of
parts and fit them into sockets to build your way through: a spring to launch you, a gearbox so a lift
can carry you, a resistor so a door motor runs without blowing its fuse. Choose wrong and the world
shows you why: you fall short, the lift stalls, the fuse pops and your parts land back in the tray.

## Pillars (v2: the Workbench)

0. **Work orders, not answers.** Each shift is a job with numbers ("120 kg up 6 m in ≤ 6 s, $30"). The player assembles the system on a **Workbench** from parts with spec sheets (mass, cost, ratings) and then *tests it in the world*. That is the engineering loop (requirements → design → test → diagnose → iterate), never named.
0. **Coupled physics.** Parts weigh something and the hero carries the tray, so building order and mass matter. Gearboxes and resistors have ratings; over them they strip or burn. Two springs in parallel add. The cheap answer and the strong answer are different answers.
0. **Sneaky maths.** The bench shows spec sheets and what the job needs, never what a build will do. The worked maths appears only after you've tried a build, in an incident report when something fails, and in HOW IT WORKED on the review card, then lands in the Field Manual.
0. **Design review stars.** ★ cleared · ★ on budget · ★ the spec (speed, fuse protection, margin…). Over-building passes but costs a star.


1. **The concept is the mechanic.** Every engineering idea has to change how you move or survive. No quizzes, no gates that only check an answer. If a concept can't change movement, it doesn't ship.
2. **Honest devices, stylised hero.** Device maths is real SI (`core/Devices.js`), so `h = k·x²/2mg` gives the actual launch height in metres (1 tile = 1 m). The hero's jump and gravity are tuned for feel, not realism, and the game says so.
3. **Every level is proven.** Claude writes levels; `tools/check.mjs` proves them (6 layers) before they ship. Caleb plays for fun and taste, not to audit.
4. **Wrong answers teach.** Every device level has at least one part that fails *visibly*, with the maths on screen explaining why.

## Structure

**Home Base** is a walkable hub (`levels/base.js`): the Mechanical wing on the ground floor, the
Electrical wing up the ladder, a locked Drone Bay, and the Field Manual door. Each shift has a door that
shows its state (locked, open, cleared ✓, under par ★). Clear a shift and you come back to base at that
door with the next one open. You never leave the game between shifts.

## Core loop

Read the brief (it states the requirement, never the answer) → reach the socket → TOOL → pick a part →
the readout shows the maths (`I = V/R = 12/20 = 0.6 A ✓`) → run the route → exit. Time against par.
Death sends you back to the start with your parts still fitted, so a wrong guess costs seconds, never progress.

## Devices (M0)

| Device | Socket | Model | Wrong answers |
|---|---|---|---|
| Spring pad | spring (k) | ½kx² = mgh → launch height | too soft: falls short · too stiff: ceiling spikes |
| Geared lift | gearbox (n, η) | τ_out = τ·n·η ≥ m·g·r; v = ω/n·r | too little reduction: stalls · too much: works but slow (par) |
| Series circuit | resistor(s), battery | I = V / (R_load + ΣR); window iMin–iMax | open · too low (load won't run) · too high (fuse blows) |
| Door / light bridge | driven by a circuit | powered → open / solid | — |

Adding a device means: pure function in `Devices.js` → behaviour in `World.js` (`step` order:
act → circuits → lifts → player → hazards → goal) → hash it if it has state → lint layer 1/2 fields and
`DEVICE_CONCEPT` → draw it in `Render.js` → a tray `specNote` in `Game.js` → a test in `tests/`.

## Campaign

| World | Levels (M0 = ✅) | Concepts |
|---|---|---|
| 1 Mechanical | ✅ First Shift · ✅ Spring Loaded · ✅ Heavy Lifting · *M1:* lever & counterweight, pulley advantage, belt/speed ratio, carrying a crate (mass changes spring height and lift torque) | move, ladder, spring, torque, moments, mechanical advantage |
| 2 Electrical | ✅ Ohm Sweet Ohm · ✅ Series Run · ✅ Shift Change · *M2:* parallel loads (current splits, fuse sees the sum), switches & logic gates (AND/OR doors), power rating (a resistor that overheats), relays | ohm, fuse, series, voltage, parallel, logic, power P = I²R |
| 3 Drones *(M3)* | build-a-drone levels: the hero deploys a drone they spec from parts to carry crates, scout, or ferry the hero across gaps | thrust-to-weight, battery energy, prop size vs efficiency, payload, wind |

### World 3 sketch: drones

The drone is a device with several sockets (frame, motors, props, battery, payload). It flies a fixed
path or follows the hero. What it does depends on honest models:

- **Lift:** total static thrust (motor+prop part) ÷ all-up weight. Below 1: it can't take off. Between 1 and ~2: it lifts but can't climb fast or fight wind. **[rule of thumb: ≥ 2:1 for controllable flight]**
- **Endurance:** usable Wh ÷ average power gives seconds aloft, so the flight window is a timed platform the hero must use.
- **Props:** bigger props mean more thrust per watt but a slower response (wind gusts push the drone further).
- **Payload:** the hero (or a crate) adds mass. The same build that hovers empty may sink when loaded.

All numbers stay generic and plausible ("Motor A: 1.1 kgf static thrust @ 180 W"). No real product specs.

## Embedded world + real hardware (roadmap)

**In game first (M2.5).** A microcontroller part ("MCU dev board", ESP32-class but generic) on a
Home Base bench: wire it to LEDs, buttons, a buzzer, a servo to make the hub your own. The same
physics teaches as you decorate: an LED with no series resistor burns; a GPIO pin can only source a
few mA so a strip needs a driver; a button needs a pull-up; PWM dims; the supply has a current budget.
Logic as simple blocks ("when door 03 is ★★★ → strip green").

**Real hardware later (M4).** A physical ESP32 that mirrors the in-game board. Constraints that shape it:
- iPhone Safari has no Web Bluetooth and no Web Serial, so a phone on GitHub Pages can't talk to the board directly over BLE or USB.
- An HTTPS page can't open a plain `ws://` socket to a board on the LAN (mixed content); it needs `wss://` with a trusted certificate, or a cloud relay (an MQTT broker over `wss`).
- Desktop Chrome/Edge do have Web Serial, so a laptop over USB is the easiest first link.
- Recommended order: laptop + Web Serial → cloud relay (MQTT over wss) so the phone works → optional BLE through the Capacitor app.

## Milestones

- **M0 (this package):** engine, solver, 6-layer checker, 6 levels, preview, arcade sprint entry, docs.
- **M0.5 (done):** Home Base hub + campaign in the app's SOLO hub, saves via `Store`, Field Manual.
- **M0.7 (done):** the Workbench: multi-slot benches, spec sheets, mass/cost/ratings, strip/burn failures, work orders with ★★★ design reviews, maths revealed only after testing. The six shifts reworked.
- **M1:** mechanical world complete (8–10 levels): levers & counterweights, pulleys, friction/efficiency, a thermal limit on motors.
- **M2:** electrical world complete; parallel circuits + logic. Circuit solver generalises from series to a small nodal solve.
- **M3:** drone world.
- **Polish:** audio (claw-core `sfx` names), haptics, art pass, a "workbench" screen that replays your run with the maths overlaid.

## Known limits (M0)

- The solver is sound but not complete: it finds routes made of walks, standing/run-up jumps, climbs and waits. A level whose only route needs a frame-perfect trick fails the checker. That's intended: the design bar is a route ordinary play can find.
- Softlock detection uses the same macros, so a missed escape route shows up as a (conservative) false softlock. Make escapes obvious.
- The bot in the arcade replays the solver route and is handicapped by skill on its reported time, not by playing worse.
