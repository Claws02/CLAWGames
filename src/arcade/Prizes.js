// ============================================================
// PRIZES — the plush critters in the claw machine, and how one is drawn.
// No DOM, so qa/daily.mjs can check the odds.
//
// 60 to collect: 40 common, 15 rare, 5 legendary. A drop always wins one.
// Drop the claw right over the glowing lucky spot and the rarer ones come up
// about twice as often. A repeat is re-rolled once (half the time), so the
// shelf fills a little faster than pure luck would.
// ============================================================
const C = 'common', R = 'rare', L = 'legendary';
export const PRIZES = [
    ['mouse', '🐭', C], ['hamster', '🐹', C], ['bunny', '🐰', C], ['puppy', '🐶', C], ['kitten', '🐱', C],
    ['fox', '🦊', C], ['bear', '🐻', C], ['panda', '🐼', C], ['koala', '🐨', C], ['tiger', '🐯', C],
    ['lion', '🦁', C], ['cow', '🐮', C], ['piglet', '🐷', C], ['frog', '🐸', C], ['monkey', '🐵', C],
    ['chicken', '🐔', C], ['penguin', '🐧', C], ['bluebird', '🐦', C], ['chick', '🐤', C], ['duck', '🦆', C],
    ['owl', '🦉', C], ['wolf', '🐺', C], ['boar', '🐗', C], ['pony', '🐴', C], ['bee', '🐝', C],
    ['caterpillar', '🐛', C], ['butterfly', '🦋', C], ['snail', '🐌', C], ['ladybird', '🐞', C], ['turtle', '🐢', C],
    ['snake', '🐍', C], ['octopus', '🐙', C], ['squid', '🦑', C], ['shrimp', '🦐', C], ['crab', '🦀', C],
    ['pufferfish', '🐡', C], ['tropical fish', '🐠', C], ['fish', '🐟', C], ['dolphin', '🐬', C], ['whale', '🐳', C],
    ['unicorn', '🦄', R], ['zebra', '🦓', R], ['giraffe', '🦒', R], ['hedgehog', '🦔', R], ['sloth', '🦥', R],
    ['otter', '🦦', R], ['llama', '🦙', R], ['kangaroo', '🦘', R], ['badger', '🦡', R], ['flamingo', '🦩', R],
    ['peacock', '🦚', R], ['parrot', '🦜', R], ['swan', '🦢', R], ['crocodile', '🐊', R], ['shark', '🦈', R],
    ['dragon', '🐉', L], ['brontosaurus', '🦕', L], ['t-rex', '🦖', L], ['lobster king', '🦞', L], ['golden shell', '🐚', L],
].map(([id, icon, rarity]) => ({ id, icon, rarity }));

export const ODDS = { normal: { rare: 0.21, legendary: 0.04 }, lucky: { rare: 0.34, legendary: 0.09 } };
export const byId = id => PRIZES.find(p => p.id === id);

/** One prize from a drop. lucky: the claw was over the lucky spot. owned: the shelf so far. */
export function draw(rnd = Math.random, lucky = false, owned = {}) {
    const pick = () => {
        const o = lucky ? ODDS.lucky : ODDS.normal, x = rnd();
        const rarity = x < o.legendary ? L : x < o.legendary + o.rare ? R : C;
        const pool = PRIZES.filter(p => p.rarity === rarity);
        return pool[Math.floor(rnd() * pool.length)];
    };
    let p = pick();
    if (owned[p.id] && rnd() < 0.5) p = pick();
    return p;
}
