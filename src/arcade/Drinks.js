// ============================================================
// DRINKS — drinking mode, the 🦀 Easter egg (tap the crab five times).
//
// SIPS. Each round pours a pool of one sip per player, split by place:
// place k weighs k (the winner weighs 0, last place the most), tied places
// share the weights they occupy, and each share rounds to whole sips (tied
// players always drink the same). A clear winner also hands out one sip.
//
// RULES. Last place draws a house rule that lasts the rest of the room
// (a tie for last draws lots). Rules aren't dealt twice until the deck runs out.
// ============================================================
import * as Store from './Store.js';

export const RULES = [
    'Drink with your left hand only',
    'No saying "drink" — say "splash" instead',
    'Say "cheers, crab" before every sip',
    'No pointing — use your elbow',
    'Talk like a pirate between rounds',
    'Everyone else may call you "Captain"; answer only to that',
    'No first names — call everyone by their seat colour',
    'Stand up for every sip',
    'Compliment the winner after every round',
    'Do a crab claw 🦀 before you drink',
    'No swearing — every slip is a sip',
    'Thumb master: put your thumb on the table any time, last one to copy drinks',
    'You must narrate your own phone game out loud',
    'Rhyme everything you say until your next win',
];

const TAPS = 5, TAP_MS = 2500;
let _taps = [];

export const mode = () => (Store.load('drinkMode', false) ? 'drinking' : 'party');
export const isOn = () => mode() === 'drinking';
export const setOn = on => Store.save('drinkMode', !!on);

/** One tap on the crab. True when this tap flips the mode. */
export function tap(now = Date.now()) {
    _taps = _taps.filter(t => now - t < TAP_MS);
    _taps.push(now);
    if (_taps.length < TAPS) return false;
    _taps = [];
    setOn(!isOn());
    return true;
}

/** Sips for each player from their scores: { sips:[...], give: winner seat or -1 }. */
export function sips(scores) {
    const n = scores.length;
    if (n < 2) return { sips: scores.map(() => 0), give: -1 };
    const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const weight = [];
    for (let k = 0; k < n;) {
        let j = k;
        while (j + 1 < n && scores[order[j + 1]] === scores[order[k]]) j++;
        const w = (k + j) / 2;             // the mean of places k..j
        for (let m = k; m <= j; m++) weight[order[m]] = w;
        k = j + 1;
    }
    const sum = weight.reduce((a, b) => a + b, 0);
    const out = weight.map(w => Math.round((w / sum) * n));
    const top = scores[order[0]];
    const give = scores.filter(s => s === top).length === 1 ? order[0] : -1;
    return { sips: out, give };
}

/** Who gets a rule this round, and which: { seat, rule } or null. `taken` are rules in play. */
export function drawRule(scores, taken = [], rnd = Math.random) {
    if (scores.length < 2) return null;
    const low = Math.min(...scores);
    if (scores.every(s => s === low)) return null;     // everybody tied: nobody lost
    const losers = scores.map((s, i) => (s === low ? i : -1)).filter(i => i >= 0);
    const seat = losers[Math.floor(rnd() * losers.length)];
    const fresh = RULES.filter(r => !taken.includes(r));
    const deck = fresh.length ? fresh : RULES;
    return { seat, rule: deck[Math.floor(rnd() * deck.length)] };
}

/**
 * Scores to split drinks by, from a one-device game's result: its standings
 * when they rank the table (higher is better, as party scoring reads them),
 * otherwise the winner over everyone else, and a draw shares it all.
 */
export function scoresFrom(winnerId, standings, n) {
    if (Array.isArray(standings) && standings.length >= n && standings.slice(0, n).some(v => v !== standings[0]))
        return standings.slice(0, n).map(v => Number(v) || 0);
    return Array.from({ length: n }, (_, i) => (i === winnerId ? 1 : 0));
}

// One-device play keeps its house rules here, until the table goes home.
let _local = [];
export const localRules = () => _local.slice();
export function resetLocal() { _local = []; }

/** A one-device round: sips, the handout and a new rule for `names` (bots never drink). */
export function localRound(names, scores, bots = []) {
    const d = sips(scores);
    const humans = names.map((_, i) => i).filter(i => !bots[i]);
    // Last place takes the rule. A bot can't, so it passes to the lowest human,
    // unless that human topped the table.
    const r = drawRule(scores, _local.map(x => x.rule));
    let seat = r ? r.seat : -1;
    if (seat >= 0 && bots[seat]) {
        const low = humans.reduce((a, i) => (a < 0 || scores[i] < scores[a] ? i : a), -1);
        seat = low >= 0 && scores[low] < Math.max(...scores) ? low : -1;
    }
    d.rule = seat >= 0 ? { name: names[seat], rule: r.rule } : null;
    if (d.rule) _local.push(d.rule);
    if (d.give >= 0 && bots[d.give]) d.give = -1;
    return d;
}
