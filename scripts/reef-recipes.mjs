// ============================================================
// REEF RECIPES — Reef Drop worlds made by the generator (scripts/reef-levels.mjs),
// after the hand-made reefs in scripts/reef-base.json. One world = 6 reefs is
// usual: teach the world's twist first, finish on a hard one. See
// docs/REEF_LEVELS.md for every field.
//
// A recipe: { name, band: 'easy' | 'medium' | 'hard',
//   layout: 'grid' | 'rings' | 'waves' | 'diamond' | 'bands' | 'spiral' | 'any',
//   oysters, golden, puffers, eels, rocks, chests, starfish,
//   urchins, sponges, mines, anemones, coins, bumpers  (how many of each),
//   movers: 'none' | 'wheel' | 'slider' | 'both',
//   extras: { jellies, whirls, lifts, anglers, currents, clams, ghosts,
//             locks (barnacles, each locking 1–2 oysters), kelp, magnets, flips,
//             bubbles (shields on oysters), seesaws, sharks, rails, gates (each with its switch) },
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
    { world: '🫧 Bubble Bay', reefs: [
        { name: 'First Bubbles', band: 'easy', layout: 'grid', oysters: 4, extras: { bubbles: 2 }, hint: '🫧 A bubble shield takes the first hit. Pop it, then free the oyster!' },
        { name: 'Sand Dollar Beach', band: 'easy', layout: 'waves', oysters: 4, coins: 4, hint: '🪙 Sand dollars score 75, and every third one gives a pearl back.' },
        { name: 'Froth', band: 'medium', layout: 'bands', oysters: 5, coins: 3, eels: 1, extras: { bubbles: 3 } },
        { name: 'Bubble Wheel', band: 'medium', layout: 'rings', oysters: 5, coins: 2, movers: 'wheel', extras: { bubbles: 2, jellies: 1 } },
        { name: 'Treasure Foam', band: 'medium', layout: 'grid', oysters: 5, golden: 1, coins: 3, chests: 1, extras: { bubbles: 3 } },
        { name: 'Bubble Storm', band: 'hard', layout: 'any', oysters: 6, coins: 3, urchins: 2, puffers: 1, movers: 'both', extras: { bubbles: 4 } },
    ] },
    { world: '🎰 Pinball Reef', reefs: [
        { name: 'Bumper Cars', band: 'easy', layout: 'grid', oysters: 4, bumpers: 3, hint: '🔴 Bumpers kick your pearl away, and score 25 a hit.' },
        { name: 'Tip Top', band: 'easy', layout: 'diamond', oysters: 4, extras: { seesaws: 1 }, hint: '🪵 Land on a seesaw\'s high end and it flings your pearl up!' },
        { name: 'Flipper Alley', band: 'medium', layout: 'bands', oysters: 5, bumpers: 3, coins: 2, extras: { seesaws: 1 } },
        { name: 'Ricochet', band: 'medium', layout: 'waves', oysters: 5, bumpers: 4, starfish: 1, urchins: 1 },
        { name: 'Double Seesaw', band: 'medium', layout: 'rings', oysters: 5, bumpers: 2, extras: { seesaws: 2 } },
        { name: 'Jackpot', band: 'hard', layout: 'any', oysters: 6, golden: 1, bumpers: 3, mines: 1, movers: 'wheel', extras: { seesaws: 2 } },
    ] },
    { world: '🦈 Shark Shallows', reefs: [
        { name: 'Fin Spotted', band: 'easy', layout: 'grid', oysters: 4, extras: { sharks: 1 }, hint: '🦈 Sharks swim to and fro and eat any pearl they touch. Time your drop!' },
        { name: 'Conveyor Cove', band: 'easy', layout: 'bands', oysters: 4, extras: { rails: 2 }, hint: '➡️ Conveyor rails carry your pearl along and drop it off the end.' },
        { name: 'Feeding Time', band: 'medium', layout: 'waves', oysters: 5, coins: 2, extras: { sharks: 1, rails: 1 } },
        { name: 'Assembly Line', band: 'medium', layout: 'grid', oysters: 5, bumpers: 1, extras: { rails: 3 } },
        { name: 'Two Fins', band: 'medium', layout: 'rings', oysters: 5, eels: 1, extras: { sharks: 2 } },
        { name: 'Jaws', band: 'hard', layout: 'any', oysters: 6, urchins: 1, puffers: 1, movers: 'slider', extras: { sharks: 2, rails: 2 } },
    ] },
    { world: '🔑 Switch Grotto', reefs: [
        { name: 'Open Sesame', band: 'easy', layout: 'grid', oysters: 4, extras: { gates: 1 }, hint: '🔑 Hit the switch to open the gate of its colour. Hit it again to shut it.' },
        { name: 'Two Doors', band: 'easy', layout: 'diamond', oysters: 4, extras: { gates: 2 } },
        { name: 'Locks and Keys', band: 'medium', layout: 'bands', oysters: 5, extras: { gates: 2, locks: 1 } },
        { name: 'Switchback', band: 'medium', layout: 'waves', oysters: 5, bumpers: 2, extras: { gates: 2, bubbles: 1 } },
        { name: 'Vault', band: 'medium', layout: 'rings', oysters: 5, golden: 1, coins: 2, extras: { gates: 3 } },
        { name: 'Master Key', band: 'hard', layout: 'any', oysters: 6, urchins: 2, mines: 1, movers: 'wheel', extras: { gates: 3, sharks: 1 } },
    ] },
    { world: '🌋 Volcano Vents', reefs: [
        { name: 'Warm Water', band: 'easy', layout: 'spiral', oysters: 4, bumpers: 2, coins: 2, extras: { lifts: 1 } },
        { name: 'Ash Fall', band: 'medium', layout: 'grid', oysters: 5, mines: 2, extras: { seesaws: 1, bubbles: 2 } },
        { name: 'Lava Tubes', band: 'medium', layout: 'bands', oysters: 5, anemones: 1, extras: { rails: 2, whirls: 2 } },
        { name: 'Hot Spring', band: 'medium', layout: 'waves', oysters: 5, puffers: 2, extras: { flips: 1, sharks: 1 } },
        { name: 'Magma Chamber', band: 'medium', layout: 'rings', oysters: 5, golden: 1, bumpers: 2, extras: { gates: 1, kelp: 1 } },
        { name: 'Eruption', band: 'hard', layout: 'any', oysters: 7, mines: 2, bumpers: 2, urchins: 2, movers: 'both', extras: { seesaws: 1, bubbles: 2 } },
    ] },
    { world: '👑 Neptune\'s Court', reefs: [
        { name: 'Throne Room', band: 'easy', layout: 'diamond', oysters: 4, coins: 3, bumpers: 2 },
        { name: 'Royal Guard', band: 'medium', layout: 'grid', oysters: 5, extras: { sharks: 1, gates: 1, bubbles: 2 } },
        { name: 'Court Jester', band: 'medium', layout: 'waves', oysters: 5, anemones: 2, bumpers: 2, extras: { seesaws: 1 } },
        { name: 'Crown Jewels', band: 'medium', layout: 'rings', oysters: 5, golden: 2, coins: 2, extras: { locks: 1, rails: 1 } },
        { name: 'Trident', band: 'medium', layout: 'bands', oysters: 6, eels: 1, mines: 1, extras: { magnets: 2, gates: 1 } },
        { name: 'Neptune', band: 'hard', layout: 'any', oysters: 7, golden: 1, urchins: 2, bumpers: 2, coins: 2, movers: 'both', extras: { sharks: 1, gates: 2, seesaws: 1, bubbles: 2 } },
    ] },
]
