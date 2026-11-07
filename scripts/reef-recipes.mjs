// ============================================================
// REEF RECIPES — Reef Drop worlds made by the generator (scripts/reef-levels.mjs),
// after the hand-made reefs in scripts/reef-base.json. One world = 6 reefs is
// usual: teach the world's twist first, finish on a hard one. See
// docs/REEF_LEVELS.md for every field.
//
// A recipe: { name, band: 'easy' | 'medium' | 'hard',
//   layout: 'grid' | 'rings' | 'waves' | 'diamond' | 'bands' | 'spiral' | 'any',
//   oysters, golden, puffers, eels, rocks, chests, starfish,
//   urchins, sponges, mines, anemones  (how many of each),
//   movers: 'none' | 'wheel' | 'slider' | 'both',
//   extras: { jellies, whirls, lifts, anglers, currents, clams, ghosts,
//             locks (barnacles, each locking 1–2 oysters), kelp, magnets, flips },
//   crab?: { period, a }, hint?: 'one line, shown on that reef' }
// ============================================================
export const RECIPES = [
    { world: '🦔 Urchin Alley', reefs: [
        { name: 'Prickly Welcome', band: 'easy', layout: 'grid', oysters: 4, urchins: 2, hint: '🦔 Sea urchins take your pearl on the spot. Aim around them!' },
        { name: 'Sponge Garden', band: 'easy', layout: 'waves', oysters: 4, sponges: 4, urchins: 1, hint: '🧽 Sponges soak up the bounce: the pearl drops off them gently.' },
        { name: 'Spine Line', band: 'medium', layout: 'bands', oysters: 5, urchins: 3, eels: 1, starfish: 1 },
        { name: 'Soft Landing', band: 'medium', layout: 'rings', oysters: 4, golden: 1, sponges: 4, urchins: 2, movers: 'slider' },
        { name: 'Urchin Wheel', band: 'medium', layout: 'grid', oysters: 5, urchins: 2, puffers: 1, movers: 'wheel' },
        { name: 'Needle Reef', band: 'hard', layout: 'any', oysters: 6, urchins: 4, sponges: 2, puffers: 1, movers: 'both' },
    ] },
    { world: '💣 Minefield Bay', reefs: [
        { name: 'First Blast', band: 'easy', layout: 'grid', oysters: 5, mines: 2, hint: '💣 Sea mines blow up everything near them, oysters and all!' },
        { name: 'Double Trouble', band: 'easy', layout: 'diamond', oysters: 4, anemones: 3, hint: '🌸 Anemones split your pearl in two!' },
        { name: 'Chain Mines', band: 'medium', layout: 'bands', oysters: 6, mines: 3, urchins: 1 },
        { name: 'Bloom Field', band: 'medium', layout: 'waves', oysters: 5, golden: 1, anemones: 3, mines: 1, extras: { jellies: 1 } },
        { name: 'Split Second', band: 'medium', layout: 'rings', oysters: 5, anemones: 2, mines: 2, movers: 'wheel', extras: { ghosts: 3 } },
        { name: 'Powder Keg', band: 'hard', layout: 'any', oysters: 7, mines: 2, anemones: 2, urchins: 3, movers: 'slider', extras: { clams: 1 } },
    ] },
    { world: '🌿 Kelp Forest', reefs: [
        { name: 'Swaying Kelp', band: 'easy', layout: 'grid', oysters: 4, extras: { kelp: 2 }, hint: '🌿 Kelp slows your pearl right down.' },
        { name: 'Barnacle Gate', band: 'easy', layout: 'bands', oysters: 4, extras: { locks: 2 }, hint: '🐚 Locked oysters can\'t be hurt: pop their barnacle first!' },
        { name: 'Tangle', band: 'medium', layout: 'waves', oysters: 5, eels: 1, urchins: 1, extras: { kelp: 3, locks: 1 } },
        { name: 'Slow Current', band: 'medium', layout: 'rings', oysters: 5, puffers: 1, extras: { kelp: 2, currents: 1 } },
        { name: 'Locked Garden', band: 'medium', layout: 'grid', oysters: 6, mines: 1, movers: 'slider', extras: { locks: 2 } },
        { name: 'Forest Floor', band: 'hard', layout: 'any', oysters: 6, golden: 1, urchins: 2, anemones: 1, movers: 'wheel', extras: { kelp: 3, locks: 2 } },
    ] },
    { world: '🧲 Magnet Trench', reefs: [
        { name: 'Pull Over', band: 'easy', layout: 'grid', oysters: 4, extras: { magnets: 2 }, hint: '🧲 Magnet shells tug your pearl sideways when it passes level with them.' },
        { name: 'Upside Down', band: 'easy', layout: 'diamond', oysters: 4, extras: { flips: 1 }, hint: '🔄 Flip portals send your pearl floating back up!' },
        { name: 'Polar Drift', band: 'medium', layout: 'waves', oysters: 5, urchins: 2, extras: { magnets: 2, kelp: 1 } },
        { name: 'Loop the Loop', band: 'medium', layout: 'bands', oysters: 5, anemones: 2, extras: { flips: 2 } },
        { name: 'Trench Run', band: 'medium', layout: 'rings', oysters: 5, mines: 1, sponges: 2, movers: 'slider', extras: { magnets: 1, flips: 1, locks: 1 } },
        { name: 'Grand Abyss', band: 'hard', layout: 'any', oysters: 7, golden: 1, urchins: 2, mines: 1, anemones: 1, movers: 'both', extras: { magnets: 2, flips: 1, kelp: 1, locks: 1 } },
    ] },
];
