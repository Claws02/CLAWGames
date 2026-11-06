// ============================================================
// PRIZES — the plush critters, the capsules they come in, and the claw
// machine's rules. No DOM (PrizeShelf.js is the screen), so qa/daily.mjs can
// check the odds and the grab.
//
// 60 plushies in six sets (four common sets, Rare Wonders, Legends), each with
// a name and a line about them. The machine is full of sealed capsules: blue,
// silver and gold. The colour sets the odds of what's inside, but not which
// plush: that's a surprise until it pops open. Steer the claw over a capsule
// and drop it: the nearer the middle, the better the grip; gold capsules are
// slippery. A slip or a miss costs nothing (the token is only spent when a
// capsule reaches the chute).
//
// Fair to collectors: a repeat is re-rolled once half the time, and after
// DRY_MAX capsules in a row with nothing new the next one is always new.
// Repeats give sparkles for the shop; finishing a set gives a reward.
// ============================================================
const C = 'common', R = 'rare', L = 'legendary';

export const SETS = [
    { id: 'farm', icon: '🏡', name: 'Farm & Pets', reward: { tokens: 2 } },
    { id: 'wood', icon: '🌲', name: 'Woodland', reward: { tokens: 2 } },
    { id: 'garden', icon: '🌼', name: 'Garden & Pond', reward: { tokens: 2 } },
    { id: 'ocean', icon: '🌊', name: 'Ocean', reward: { tokens: 2 } },
    { id: 'rare', icon: '✨', name: 'Rare Wonders', reward: { tokens: 3, gold: 1 } },
    { id: 'legend', icon: '👑', name: 'Legends', reward: { tokens: 5, gold: 2 } },
];

// [id, icon, rarity, set, name, bio]
export const PRIZES = [
    ['mouse', '🐭', C, 'farm', 'Pip', 'Small, quick, and always first to the cheese.'],
    ['hamster', '🐹', C, 'farm', 'Biscuit', 'Keeps three snacks in each cheek, just in case.'],
    ['bunny', '🐰', C, 'farm', 'Clover', 'Hops twice before every big decision.'],
    ['puppy', '🐶', C, 'farm', 'Scout', 'Has never met a stranger, only friends.'],
    ['kitten', '🐱', C, 'farm', 'Mittens', 'Naps in sunbeams. Moves when the sunbeam moves.'],
    ['cow', '🐮', C, 'farm', 'Daisy', 'Hums while she grazes. Mostly in tune.'],
    ['piglet', '🐷', C, 'farm', 'Truffle', 'Finds the muddiest puddle on purpose.'],
    ['chicken', '🐔', C, 'farm', 'Henrietta', 'Runs the farmyard with a firm cluck.'],
    ['chick', '🐤', C, 'farm', 'Peep', 'Brand new and very curious about everything.'],
    ['pony', '🐴', C, 'farm', 'Toffee', 'Gallops in circles when happy. Always happy.'],
    ['fox', '🦊', C, 'wood', 'Rusty', 'Clever, quiet, and a little bit sneaky.'],
    ['bear', '🐻', C, 'wood', 'Bramble', 'Gives the best hugs in the forest.'],
    ['panda', '🐼', C, 'wood', 'Bao', 'Eats bamboo, rolls downhill, repeats.'],
    ['koala', '🐨', C, 'wood', 'Gumnut', 'Sleeps 20 hours a day and regrets nothing.'],
    ['tiger', '🐯', C, 'wood', 'Stripes', 'Practises a scary roar. It comes out as a purr.'],
    ['lion', '🦁', C, 'wood', 'Leo', 'Wears his mane with great pride.'],
    ['monkey', '🐵', C, 'wood', 'Coco', 'Swings first, thinks later.'],
    ['wolf', '🐺', C, 'wood', 'Luna', 'Howls at the moon, softly, so no one wakes up.'],
    ['boar', '🐗', C, 'wood', 'Tusker', 'Gruff on the outside, a softie on the inside.'],
    ['owl', '🦉', C, 'wood', 'Hoot', 'Knows a lot and only says some of it.'],
    ['bee', '🐝', C, 'garden', 'Buzz', 'Visits a hundred flowers before lunch.'],
    ['caterpillar', '🐛', C, 'garden', 'Inchy', 'Saving up for wings.'],
    ['butterfly', '🦋', C, 'garden', 'Flutter', 'Used to be Inchy. Now look at her.'],
    ['snail', '🐌', C, 'garden', 'Shelly', 'Slow and steady. Mostly slow.'],
    ['ladybird', '🐞', C, 'garden', 'Dotty', 'Counts her spots for luck every morning.'],
    ['frog', '🐸', C, 'garden', 'Ribbit', 'Lily pad champion three summers running.'],
    ['turtle', '🐢', C, 'garden', 'Sheldon', 'Carries his house everywhere he goes.'],
    ['snake', '🐍', C, 'garden', 'Noodle', 'Very long. Very friendly. Very wiggly.'],
    ['duck', '🦆', C, 'garden', 'Puddles', 'Quacks at the rain to say thank you.'],
    ['bluebird', '🐦', C, 'garden', 'Skye', 'Sings the first song of every morning.'],
    ['octopus', '🐙', C, 'ocean', 'Inky', 'Eight arms, eight hugs at once.'],
    ['squid', '🦑', C, 'ocean', 'Squish', 'A bit shy. Hides in his own ink cloud.'],
    ['shrimp', '🦐', C, 'ocean', 'Prawnie', 'Tiny but fearless.'],
    ['crab', '🦀', C, 'ocean', 'Pinch', 'Walks sideways to see the world differently.'],
    ['pufferfish', '🐡', C, 'ocean', 'Puffy', 'Gets very round when surprised.'],
    ['tropical fish', '🐠', C, 'ocean', 'Coral', 'Wears every colour of the reef.'],
    ['fish', '🐟', C, 'ocean', 'Finn', 'Just keeps swimming.'],
    ['dolphin', '🐬', C, 'ocean', 'Splash', 'Leaps out of the waves to say hello.'],
    ['whale', '🐳', C, 'ocean', 'Big Blue', 'Sings songs you can hear across the sea.'],
    ['penguin', '🐧', C, 'ocean', 'Waddles', 'Dresses smartly for every occasion.'],
    ['unicorn', '🦄', R, 'rare', 'Stardust', 'Leaves a trail of glitter wherever she goes.'],
    ['zebra', '🦓', R, 'rare', 'Zigzag', 'Black with white stripes, or white with black?'],
    ['giraffe', '🦒', R, 'rare', 'Lofty', 'Always the first to see the sunrise.'],
    ['hedgehog', '🦔', R, 'rare', 'Prickles', 'Curls into a ball for a nap anywhere.'],
    ['sloth', '🦥', R, 'rare', 'Mellow', 'Took three days to say hello. Worth it.'],
    ['otter', '🦦', R, 'rare', 'Pebble', 'Holds hands with friends so no one drifts away.'],
    ['llama', '🦙', R, 'rare', 'Dolly', 'Fluffy, fabulous, and a little dramatic.'],
    ['kangaroo', '🦘', R, 'rare', 'Bounce', 'Keeps her favourite things in her pocket.'],
    ['badger', '🦡', R, 'rare', 'Bodger', 'Digs the cosiest burrows in the woods.'],
    ['flamingo', '🦩', R, 'rare', 'Rosie', 'Stands on one leg to show off.'],
    ['peacock', '🦚', R, 'rare', 'Regal', 'Fans out his tail for every photo.'],
    ['parrot', '🦜', R, 'rare', 'Polly', 'Repeats everything. Everything.'],
    ['swan', '🦢', R, 'rare', 'Grace', 'Glides so smoothly it looks like magic.'],
    ['crocodile', '🐊', R, 'rare', 'Snappy', 'Big grin, gentle heart.'],
    ['shark', '🦈', R, 'rare', 'Chomp', 'Only wants to be friends. Honest.'],
    ['dragon', '🐉', L, 'legend', 'Ember', 'Guards a hoard of shiny buttons.'],
    ['brontosaurus', '🦕', L, 'legend', 'Bronty', 'Eats the treetops, sleeps under the stars.'],
    ['t-rex', '🦖', L, 'legend', 'Rex', 'Tiny arms, enormous heart.'],
    ['lobster king', '🦞', L, 'legend', 'King Clawdius', 'Rules the deep with a fair and mighty claw.'],
    ['golden shell', '🐚', L, 'legend', 'The Golden Shell', 'Hold it to your ear: it hums the song of the sea.'],
].map(([id, icon, rarity, set, name, bio]) => ({ id, icon, rarity, set, name, bio }));

export const byId = id => PRIZES.find(p => p.id === id);
export const inSet = setId => PRIZES.filter(p => p.set === setId);
export const setOf = id => SETS.find(s => s.id === byId(id)?.set);

// ---- capsules and odds ------------------------------------------------------------------
export const CAPSULES = {
    blue:   { color: '#38bdf8', dark: '#0369a1', odds: { rare: 0.14, legendary: 0.02 }, slip: 0.06 },
    silver: { color: '#cbd5e1', dark: '#64748b', odds: { rare: 0.32, legendary: 0.06 }, slip: 0.16 },
    gold:   { color: '#fde047', dark: '#b45309', odds: { rare: 0.5, legendary: 0.18 }, slip: 0.3 },
};
export const DRY_MAX = 6;                                   // this many with nothing new: the next is new
export const SPARKLE = { common: 1, rare: 3, legendary: 6 }; // a repeat's sparkles
export const SHOP = { token: 6, gold: 12, pick: { common: 10, rare: 24, legendary: 50 } };

/**
 * What's in a capsule of this tier. owned: id → count. dry: capsules since the
 * last new one. Returns a prize.
 */
export function draw(rnd = Math.random, tier = 'blue', owned = {}, dry = 0) {
    const o = CAPSULES[tier].odds;
    const pick = () => {
        const x = rnd(), rarity = x < o.legendary ? L : x < o.legendary + o.rare ? R : C;
        const pool = PRIZES.filter(p => p.rarity === rarity);
        return pool[Math.floor(rnd() * pool.length)];
    };
    let p = pick();
    if (owned[p.id] && rnd() < 0.5) p = pick();
    if (owned[p.id] && dry >= DRY_MAX - 1) {   // pity: something new (of that rarity if any are left, else any)
        const miss = PRIZES.filter(q => !owned[q.id]);
        const same = miss.filter(q => q.rarity === p.rarity);
        if (miss.length) p = (same.length ? same : miss)[Math.floor(rnd() * (same.length || miss.length))];
    }
    return p;
}

// ---- the machine ------------------------------------------------------------------------
// The floor: x 0..1 left to right, z 0..1 front to back. The chute is front left.
export const CHUTE = { x: 0.12, z: 0.08 }, GRAB_R = 0.085, PILE_N = 18;

/** A pile of capsules: mostly blue, some silver, a couple of gold ones at the back. */
export function pile(rnd = Math.random) {
    const tiers = [...Array(12).fill('blue'), ...Array(4).fill('silver'), 'gold', 'gold'];
    const out = [];
    for (const tier of tiers) {
        for (let tries = 0; tries < 60; tries++) {
            const x = 0.28 + rnd() * 0.64, z = tier === 'gold' ? 0.62 + rnd() * 0.32 : 0.12 + rnd() * 0.82;
            if (out.every(c => Math.hypot(c.x - x, (c.z - z) * 0.8) > 0.1)) { out.push({ x, z, tier, id: out.length }); break; }
        }
    }
    return out;
}
/** One capsule to top the pile back up. */
export function refill(cs, rnd = Math.random) {
    const tier = rnd() < 0.08 ? 'gold' : rnd() < 0.25 ? 'silver' : 'blue';
    for (let tries = 0; tries < 80; tries++) {
        const x = 0.28 + rnd() * 0.64, z = 0.12 + rnd() * 0.82;
        if (cs.every(c => Math.hypot(c.x - x, (c.z - z) * 0.8) > 0.1)) return { x, z, tier, id: Math.max(-1, ...cs.map(c => c.id)) + 1 };
    }
    return null;
}

/**
 * Drop the claw at (x, z). Returns { capsule, grip, slip } where capsule is the
 * one caught (or null: missed), grip 0..1 (how near the middle), and slip
 * whether it falls out on the way to the chute.
 */
export function grab(cs, x, z, rnd = Math.random) {
    let best = null, bd = Infinity;
    for (const c of cs) { const d = Math.hypot(c.x - x, (c.z - z) * 0.8); if (d < bd) { bd = d; best = c; } }
    if (!best || bd > GRAB_R) return { capsule: null, grip: 0, slip: false };
    const grip = 1 - bd / GRAB_R;
    const slipChance = Math.min(0.9, CAPSULES[best.tier].slip + (1 - grip) * 0.5);
    return { capsule: best, grip, slip: rnd() < slipChance, slipChance };
}

/** A set's progress: { have, of, done }. */
export function progress(setId, owned) {
    const all = inSet(setId), have = all.filter(p => owned[p.id]).length;
    return { have, of: all.length, done: have === all.length };
}
