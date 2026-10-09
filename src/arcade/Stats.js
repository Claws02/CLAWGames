// ============================================================
// STATS — light progression: what you played and who won. No economy.
// Trophies (Trophies.js) are derived from these numbers rather than stored
// separately; only the fact that one has been earned is kept, so a trophy
// once won is never taken away by a later change to its rule.
// ============================================================
import * as Store from './Store.js';
import { genreOf } from './Catalog.js';

const FRESH = () => ({
    plays: {}, humanWins: {}, botWins: {}, draws: 0, recent: [],
    // Wins by a human seat at a table with at least one bot, by bot tier.
    vsBot: { easy: 0, medium: 0, hard: 0 },
    hardBeaten: {},          // type → wins over a Hard bot
    genresWon: {},           // genre → human wins
    streak: 0, bestStreak: 0, // human wins over bots in a row
    wheel: 0,                // games the wheel picked
    parties: 0, partyWins: 0,
    together: 0,             // Play Together rounds finished
});
// Older saves predate the trophy counters; fill in whatever is missing.
const data = Object.assign(FRESH(), Store.load('stats', null) || {});
data.vsBot = Object.assign({ easy: 0, medium: 0, hard: 0 }, data.vsBot);

/**
 * One finished game. `bots` is the table's per-seat bot flags; `ctx` says how
 * it was played: { tier: 'easy'|'medium'|'hard', via: 'quick'|'wheel'|'party' }.
 */
export function record(type, winnerId, bots, ctx = {}) {
    data.plays[type] = (data.plays[type] || 0) + 1;
    const withBots = bots.some(Boolean);
    if (winnerId < 0) data.draws++;
    else if (bots[winnerId]) {
        data.botWins[type] = (data.botWins[type] || 0) + 1;
        data.streak = 0;
    } else {
        data.humanWins[type] = (data.humanWins[type] || 0) + 1;
        const g = genreOf(type);
        if (g) data.genresWon[g] = (data.genresWon[g] || 0) + 1;
        if (withBots) {
            const tier = ctx.tier in data.vsBot ? ctx.tier : 'medium';
            data.vsBot[tier]++;
            if (tier === 'hard') data.hardBeaten[type] = (data.hardBeaten[type] || 0) + 1;
            data.streak++;
            data.bestStreak = Math.max(data.bestStreak, data.streak);
        }
    }
    if (ctx.via === 'wheel') data.wheel++;
    data.recent = [type, ...data.recent.filter(t => t !== type)].slice(0, 6);
    Store.save('stats', data);
}

/** A party reached its podium. `humanWon`: a human seat took first place. */
export function recordParty(humanWon) {
    data.parties++;
    if (humanWon) data.partyWins++;
    Store.save('stats', data);
}

/** A Play Together round finished on this phone. */
export function recordTogether() {
    data.together++;
    Store.save('stats', data);
}

const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
export const totals = () => ({ plays: sum(data.plays), humanWins: sum(data.humanWins), botWins: sum(data.botWins) });
export const plays = type => data.plays[type] || 0;
export const recent = () => data.recent.slice();
/** Read-only view for the trophy rules. */
export const snapshot = () => JSON.parse(JSON.stringify(data));

let favs = new Set(Store.load('favs', []));
export const isFav = type => favs.has(type);
export function toggleFav(type) {
    favs.has(type) ? favs.delete(type) : favs.add(type);
    Store.save('favs', [...favs]);
    return favs.has(type);
}
export const favorites = () => [...favs];
