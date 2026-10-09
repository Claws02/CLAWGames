// ============================================================
// PROFILES — the people who play on this phone: a name and a character,
// and what they have done. Seat colours stay with the seat (games read them
// per slot), so a profile carries no colour of its own.
//
// Stats per profile: plays, wins, per-game plays/wins, wins over bots, and
// head-to-head against every other profile they have shared a table with.
// Head-to-head counts only games where both were seated and one of them won:
// a bot taking the game is not a win for either.
// ============================================================
import * as Store from './Store.js';
import { CHARS } from './Characters.js';

const MAX_NAME = 14;
let data = Store.load('profiles', null) || { list: [], stats: {}, lastId: 0 };
const _save = () => Store.save('profiles', data);

const _blankStats = () => ({ plays: 0, wins: 0, botWins: 0, games: {}, h2h: {} });

export const list = () => data.list.slice();
export const get = id => data.list.find(p => p.id === id) || null;
export const stats = id => data.stats[id] || _blankStats();

// Markup characters are dropped, so a name is safe anywhere text goes.
export function cleanName(raw) {
    return String(raw || '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
}

/** A free character for a new profile: the first nobody here has picked. */
export function freeChar() {
    const used = new Set(data.list.map(p => p.char));
    return (CHARS.find(c => !used.has(c.id)) || CHARS[data.list.length % CHARS.length]).id;
}

export function nameTaken(name, exceptId = null) {
    const n = cleanName(name).toLowerCase();
    return data.list.some(p => p.id !== exceptId && p.name.toLowerCase() === n);
}

export function create(name, char) {
    const id = 'p' + (++data.lastId);
    data.list.push({ id, name: cleanName(name) || `Player ${data.list.length + 1}`, char: char || freeChar() });
    data.stats[id] = _blankStats();
    _save();
    return id;
}

export function update(id, { name, char }) {
    const p = get(id);
    if (!p) return;
    if (name !== undefined && cleanName(name)) p.name = cleanName(name);
    if (char !== undefined) p.char = char;
    _save();
}

export function remove(id) {
    data.list = data.list.filter(p => p.id !== id);
    delete data.stats[id];
    // Their rivals keep a record against a player who no longer exists; drop it.
    Object.values(data.stats).forEach(s => { delete s.h2h[id]; });
    _save();
}

/**
 * One finished game. `who` is the profile id per seat (null for a guest or a
 * bot), `bots` the per-seat bot flags, `winnerId` the winning seat or -1.
 */
export function record(type, winnerId, who, bots) {
    const seated = who.map((id, seat) => ({ id, seat })).filter(x => x.id && get(x.id));
    if (!seated.length) return;
    const winner = winnerId >= 0 ? who[winnerId] : null;
    const tableHasBot = bots.some(Boolean);
    for (const { id, seat } of seated) {
        const s = data.stats[id] || (data.stats[id] = _blankStats());
        const g = s.games[type] || (s.games[type] = { p: 0, w: 0 });
        s.plays++; g.p++;
        if (seat === winnerId) {
            s.wins++; g.w++;
            if (tableHasBot) s.botWins++;
        }
        // Head-to-head, against every other profile at the table.
        if (winner) {
            for (const other of seated) {
                if (other.id === id) continue;
                const r = s.h2h[other.id] || (s.h2h[other.id] = { w: 0, l: 0 });
                if (winner === id) r.w++;
                else if (winner === other.id) r.l++;
            }
        }
    }
    _save();
}

/** The game this profile has won most (ties: most played). */
export function bestGame(id) {
    const g = stats(id).games;
    return Object.keys(g).sort((a, b) => g[b].w - g[a].w || g[b].p - g[a].p)[0] || null;
}

/** Rivals, most games against first: [{ id, name, w, l }]. */
export function rivals(id) {
    const h = stats(id).h2h;
    return Object.entries(h)
        .filter(([rid]) => get(rid))
        .map(([rid, r]) => ({ id: rid, name: get(rid).name, w: r.w, l: r.l }))
        .sort((a, b) => (b.w + b.l) - (a.w + a.l));
}
