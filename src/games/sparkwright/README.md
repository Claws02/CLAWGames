# Sparkwright

A field-engineer platformer for CLAWGames. Fit real parts (springs, gearboxes, resistors, batteries)
into sockets; the physics and circuit maths decide whether you get through. Every level is written as
data and proven by a 6-layer checker (data, layout, puzzle, reachability/softlock, ghost replay,
progression) before anyone plays it.

- Play: `npm run serve` → `http://127.0.0.1:8140/src/games/sparkwright/preview.html?all`
- Prove levels: `node src/games/sparkwright/tools/check.mjs`
- New level: `node src/games/sparkwright/tools/new-level.mjs m07 "Name" elec`
- Arcade: **SPARKWRIGHT SPRINT** in the grid (pass-and-play race on one verified level; solo score)

Start with `CLAUDE.md`. Roadmap in `docs/DESIGN.md`; handoff in `docs/INTEGRATION.md`.
