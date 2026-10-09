// ============================================================
// PARTY — a best-of playlist with a scoreboard across games.
//
//   setup → [ pick a game (wheel | shuffle | draft | host picks) → play →
//             standings ] × N → podium
//
// SCORING. Points by place, ties sharing the places they occupy (the same
// rule claw-core's coin ladder uses). Seven 3–4 seat games report every
// seat's score (`standings`); for the rest only the winner is known, so the
// winner takes first and everyone else shares the remaining places, and a
// draw shares them all.
// ============================================================
import * as Catalog from './Catalog.js';
import * as Store from './Store.js';
import { seats } from './Seats.js';
import { SEAT_STYLE } from '../host/ArcadeState.js';

export const LENGTHS = [3, 5, 7];
export const PICKERS = {
    wheel:   { icon: '🎡', label: 'Wheel',      sub: 'Spin for every game' },
    shuffle: { icon: '🔀', label: 'Shuffle',    sub: 'Surprise each round' },
    draft:   { icon: '🗳️', label: 'Draft',      sub: 'Everyone bans one' },
    pick:    { icon: '👆', label: 'Host picks', sub: 'Choose from the grid' },
};
export const POINTS = { 2: [3, 0], 3: [4, 2, 0], 4: [4, 2, 1, 0] };

const prefs = Store.load('party', { length: 5, picker: 'wheel' });
export const party = {
    length: prefs.length, picker: prefs.picker,
    round: 0, points: [], wins: [], played: [], last: null, active: false,
};
export const savePrefs = () => Store.save('party', { length: party.length, picker: party.picker });

export function start() {
    const n = seats.count;
    Object.assign(party, { round: 0, points: new Array(n).fill(0), wins: new Array(n).fill(0),
                           played: [], last: null, active: true });
}

export const finished = () => party.round >= party.length;

// Games still available this party: eligible for the table, not yet played.
// If the table has exhausted the pool (a 7-game party at 4 seats can), repeats
// are allowed again rather than leaving nothing to play.
export function pool() {
    const all = Catalog.eligible(seats.count);
    const fresh = all.filter(t => !party.played.includes(t));
    return fresh.length ? fresh : all;
}

export function shuffleNext() {
    const p = pool();
    return p[Math.floor(Math.random() * p.length)];
}

/** Points for one game, by place. */
export function pointsFor(winnerId, standings, n) {
    const ladder = POINTS[n] || POINTS[4];
    let scores;
    if (Array.isArray(standings) && standings.length >= n && standings.some(v => v !== standings[0])) {
        scores = standings.slice(0, n).map(v => Number(v) || 0);
    } else if (winnerId >= 0) {
        scores = Array.from({ length: n }, (_, i) => (i === winnerId ? 1 : 0));
    } else {
        scores = new Array(n).fill(0);            // a true draw: everybody shares
    }
    const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const pay = new Array(n).fill(0);
    for (let place = 0; place < n;) {
        let end = place;
        while (end + 1 < n && scores[order[end + 1]] === scores[order[place]]) end++;
        let pot = 0;
        for (let k = place; k <= end; k++) pot += ladder[k] || 0;
        const each = Math.round(pot / (end - place + 1));
        for (let k = place; k <= end; k++) pay[order[k]] = each;
        place = end + 1;
    }
    return pay;
}

export function record(type, winnerId, standings) {
    const n = seats.count;
    const pay = pointsFor(winnerId, standings, n);
    pay.forEach((p, i) => { party.points[i] += p; });
    if (winnerId >= 0) party.wins[winnerId]++;
    party.played.push(type);
    party.round++;
    party.last = { type, winnerId, pay };
    if (finished()) party.active = false;
}

/** Seats ranked by points, then game wins. Equal on both = same place. */
export function ranking() {
    const n = seats.count;
    const order = Array.from({ length: n }, (_, i) => i)
        .sort((a, b) => party.points[b] - party.points[a] || party.wins[b] - party.wins[a]);
    let place = 0;
    return order.map((seat, k) => {
        if (k > 0) {
            const prev = order[k - 1];
            if (party.points[prev] !== party.points[seat] || party.wins[prev] !== party.wins[seat]) place = k;
        }
        return { seat, place, points: party.points[seat], wins: party.wins[seat],
                 bot: seats.bots[seat], style: SEAT_STYLE[seat] };
    });
}

export const seatName = i => (seats.bots[i] ? `Bot ${SEAT_STYLE[i].name}` : `Player ${i + 1}`);
