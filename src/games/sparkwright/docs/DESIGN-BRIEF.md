# Level design brief (for a Claude level-designer agent)

You are designing ONE level of Sparkwright, a field-engineer platformer where the hero fits real
parts into sockets and the device maths decides the route. Levels are data; a 6-layer checker proves
them. Your level ships only if it passes with **0 errors, 0 warnings**.

## You may edit
- ONLY your level file `levels/<id>-<slug>.js` (create it with `node tools/new-level.mjs <id> "<Name>" <world>`), and its import line in `levels/index.js`.
- Do NOT edit `core/`, `Render.js`, `Game.js`, other levels, or `levels/tapes.js`. If you need an engine feature, list it in your report.
- Do NOT commit or push. The lead integrates.

## Read first
`docs/LEVEL_FORMAT.md` (all of it), `core/Rules.js` (CONCEPTS order, player limits), and the one
existing level closest to yours.

## The bar
1. **One idea, taught by failure.** The level introduces or combines concepts, and at least one plausible wrong part fails *visibly* (falls short, stalls, fuse blows, spikes). The brief states the requirement, never the answer.
2. **The device is necessary.** Installing nothing must fail (the checker enforces it). Gaps a device must cross are 6+ tiles; ledges it must reach are 3+ tiles.
3. **Readable in one screen.** The socket, the device it feeds, and the obstacle should be close enough that the wires make the cause and effect obvious.
4. **Fair.** No softlocks, no blind drops, no hazard you can't see before you commit. Death returns you to S with parts fitted.
5. **Short.** 3–10 s solver route. Par ≈ 1.5 × route.
6. **Honest numbers.** Generic parts with plausible values. Work out every device result by hand in the file's header comment (see existing levels), then let the checker confirm it.

## Must pass before you report
```
node tools/check.mjs <id> --verbose      # 0 errors, 0 warnings; read which part choices work
node tools/check.mjs                     # whole campaign still clean (progression order)
```
Then serve the repo (`npm run serve`) and open `/src/games/sparkwright/preview.html?all` to look at it.

## Report (final message, concise)
id, name, concept(s), the intended parts and why each wrong part fails (one line each), solver route
seconds, par, states explored, and any engine feature you wished existed.
