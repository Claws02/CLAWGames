// ============================================================
// STATS — light progression: what you played and who won. No economy.
// Trophies are derived from these numbers rather than stored separately.
// ============================================================
import * as Store from './Store.js';

const data = Store.load('stats', null) || { plays: {}, humanWins: {}, botWins: {}, draws: 0, recent: [] };

export function record(type, winnerId, bots) {
    data.plays[type] = (data.plays[type] || 0) + 1;
    if (winnerId < 0) data.draws++;
    else if (bots[winnerId]) data.botWins[type] = (data.botWins[type] || 0) + 1;
    else data.humanWins[type] = (data.humanWins[type] || 0) + 1;
    data.recent = [type, ...data.recent.filter(t => t !== type)].slice(0, 6);
    Store.save('stats', data);
}

const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
export const totals = () => ({ plays: sum(data.plays), humanWins: sum(data.humanWins), botWins: sum(data.botWins) });
export const plays = type => data.plays[type] || 0;
export const recent = () => data.recent.slice();

let favs = new Set(Store.load('favs', []));
export const isFav = type => favs.has(type);
export function toggleFav(type) {
    favs.has(type) ? favs.delete(type) : favs.add(type);
    Store.save('favs', [...favs]);
    return favs.has(type);
}
export const favorites = () => [...favs];
