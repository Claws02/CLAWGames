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
// draw shares them all. The FINAL game pays double.
//
// Games are dealt from the party's MIX (Mix.js: a preset like Quick Fire or
// Board Game Night, or custom genres × lengths), then from the table's
// Rotation, so nothing repeats until every game in the mix has been played;
// after a long game a shorter one comes next when the mix has one (balanced
// mixing). The table shares two vetoes for the whole party.
// ============================================================
import * as Catalog from './Catalog.js';
import * as Store from './Store.js';
import * as Rotation from './Rotation.js';
import * as Vetoes from './Vetoes.js';
import * as Mix from './Mix.js';
import { seats, seatName as _seatName } from './Seats.js';
import { SEAT_STYLE } from '../host/ArcadeState.js';

export const LENGTHS = [3, 5, 7];
export const PICKERS = {
    wheel:   { icon: '🎡', label: 'Wheel',      sub: 'Spin for every game' },
    shuffle: { icon: '🔀', label: 'Shuffle',    sub: 'Surprise each round' },
    draft:   { icon: '🗳️', label: 'Draft',      sub: 'Everyone bans one' },
    pick:    { icon: '👆', label: 'Host picks', sub: 'Choose from the grid' },
};
export const POINTS = { 2: [3, 0], 3: [4, 2, 0], 4: [4, 2, 1, 0] };
// Online rooms seat up to twelve: the top five score, the rest nothing.
const BIG_LADDER = [6, 4, 3, 2, 1];

const prefs = Store.load('party', { length: 5, picker: 'wheel' });
export const party = {
    length: prefs.length, picker: prefs.picker,
    round: 0, points: [], wins: [], played: [], vetoed: [], last: null, active: false, hype: [],
};
export const savePrefs = () => Store.save('party', { length: party.length, picker: party.picker });

export function start() {
    const n = seats.count;
    Object.assign(party, { round: 0, points: new Array(n).fill(0), wins: new Array(n).fill(0),
                           played: [], vetoed: [], last: null, active: true, hype: [] });
    Vetoes.reset();
}

export const finished = () => party.round >= party.length;

/** Is the game about to be played the last one, worth double? */
export const finalNext = () => party.active && party.round === party.length - 1;

// What kind of games this party deals (saved between parties).
export const mix = Mix.create('party');
/** Every game that fits the table and the mix, played or not. */
export const mixGames = () => mix.filter(Catalog.eligible(seats.count));

// Games that may be dealt now: the mix's games still to come round in the
// table's rotation (all of them once those run out), minus any this party has
// already played or vetoed, shorter ones first after a long game.
export function pool() {
    const all = mixGames();
    if (!all.length) return [];
    const fresh = Rotation.fresh(seats.count).filter(t => all.includes(t));
    const deck = fresh.length ? fresh : all;
    const notYet = deck.filter(t => !party.played.includes(t) && !party.vetoed.includes(t));
    const left = notYet.length ? notYet : all.filter(t => !party.vetoed.includes(t));
    return Mix.balance(left.length ? left : all, party.last?.type);
}

/** Why a game can't be picked right now (host picks greys it with this). */
export function whyOut(type) {
    if (!mix.allows(type)) return 'Not in this mix';
    if (party.vetoed.includes(type)) return 'Vetoed';
    if (party.played.includes(type)) return 'Played this party';
    return pool().includes(type) ? '' : 'Comes round later';
}

/** A vetoed game is out for the rest of the party. */
export function veto(type) { if (!party.vetoed.includes(type)) party.vetoed.push(type); }

export function shuffleNext() {
    const p = pool();
    return p[Math.floor(Math.random() * p.length)];
}

/** Points for one game, by place. */
export function pointsFor(winnerId, standings, n) {
    const ladder = POINTS[n] || (n > 4 ? BIG_LADDER : POINTS[4]);
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
    const double = finalNext();
    const pay = pointsFor(winnerId, standings, n).map(p => p * (double ? 2 : 1));
    const before = ranking();
    pay.forEach((p, i) => { party.points[i] += p; });
    if (winnerId >= 0) party.wins[winnerId]++;
    party.played.push(type);
    party.round++;
    party.last = { type, winnerId, pay, double };
    party.hype = hypeLines(before, ranking(), pay);
    if (finished()) party.active = false;
}

/** The callouts after a game: lead changes, the gap, a climber, the finale. */
export function hypeLines(before, after, pay) {
    const out = [];
    const lead = after.filter(r => r.place === 0), wasLead = before.filter(r => r.place === 0).map(r => r.seat);
    if (lead.length > 1) out.push(`⚔️ DEAD HEAT AT THE TOP!`);
    else if (!wasLead.includes(lead[0].seat) || wasLead.length > 1) out.push(`🔥 ${seatName(lead[0].seat).toUpperCase()} TAKES THE LEAD!`);
    else {
        const gap = lead[0].points - (after[1]?.points ?? 0);
        out.push(`👑 ${seatName(lead[0].seat).toUpperCase()} LEADS BY ${gap}`);
    }
    // A climber: up two or more places, or up from last.
    const placeOf = (rows, seat) => rows.find(r => r.seat === seat).place;
    const n = after.length;
    const climb = after.map(r => ({ seat: r.seat, up: placeOf(before, r.seat) - r.place, was: placeOf(before, r.seat) }))
        .filter(c => c.up >= 2 || (c.up >= 1 && c.was === n - 1 && n > 2))
        .sort((a, b) => b.up - a.up || pay[b.seat] - pay[a.seat])[0];
    if (climb && !(lead.length === 1 && climb.seat === lead[0].seat)) out.push(`📈 ${seatName(climb.seat).toUpperCase()} IS CLIMBING!`);
    if (party.active && party.round === party.length - 1) out.push('⚡ FINAL GAME · DOUBLE POINTS!');
    return out;
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

// A profile's name when one sits there; "Player N" or "Bot Colour" otherwise.
export const seatName = _seatName;
