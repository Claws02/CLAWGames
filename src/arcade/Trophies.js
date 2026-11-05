// ============================================================
// TROPHIES — milestones read off Stats. Each has a rule that returns
// [progress, goal]; it is earned when progress reaches the goal. Earned
// trophies are remembered (with the date) so they stay earned.
// ============================================================
import * as Store from './Store.js';
import * as Stats from './Stats.js';
import { allTypes, MG_GENRES } from './Catalog.js';
import * as Toast from './Toast.js';
import * as Golf from './Golf.js';
import * as Solo from './SoloStats.js';

const n = o => Object.keys(o).length;
const tot = o => Object.values(o).reduce((a, b) => a + b, 0);

export const TROPHIES = [
    { id: 'first_win',  icon: '🥇', name: 'First Win',       how: 'Win any game.',                                rule: s => [tot(s.humanWins), 1] },
    { id: 'warm_up',    icon: '🎮', name: 'Warmed Up',       how: 'Play 10 games.',                               rule: s => [tot(s.plays), 10] },
    { id: 'regular',    icon: '🕹️', name: 'Arcade Regular',  how: 'Play 50 games.',                               rule: s => [tot(s.plays), 50] },
    { id: 'explorer',   icon: '🧭', name: 'Explorer',        how: 'Play 10 different games.',                     rule: s => [n(s.plays), 10] },
    { id: 'seen_all',   icon: '🗺️', name: 'Seen It All',     how: 'Play every game in the arcade.',               rule: s => [allTypes().filter(t => s.plays[t]).length, allTypes().length] },
    { id: 'bot_easy',   icon: '🤖', name: 'Bot Basher',      how: 'Beat an Easy bot.',                            rule: s => [s.vsBot.easy, 1] },
    { id: 'bot_medium', icon: '🦾', name: 'Bot Breaker',     how: 'Beat a Medium bot.',                           rule: s => [s.vsBot.medium, 1] },
    { id: 'bot_hard',   icon: '👑', name: 'Bot Boss',        how: 'Beat a Hard bot.',                             rule: s => [s.vsBot.hard, 1] },
    { id: 'hard_ten',   icon: '💪', name: 'Hard Mode Hero',  how: 'Beat Hard bots in 10 different games.',        rule: s => [n(s.hardBeaten), 10] },
    { id: 'all_genres', icon: '🎨', name: 'All-Rounder',     how: 'Win a game in every genre.',                   rule: s => [Object.keys(MG_GENRES).filter(g => s.genresWon[g]).length, n(MG_GENRES)] },
    { id: 'on_fire',    icon: '🔥', name: 'On Fire',         how: 'Beat bots 3 games in a row.',                  rule: s => [s.bestStreak, 3] },
    { id: 'spin',       icon: '🎡', name: 'Spin Doctor',     how: 'Play 10 games the wheel picked.',              rule: s => [s.wheel, 10] },
    { id: 'party',      icon: '🎉', name: 'Party Animal',    how: 'Finish a party.',                              rule: s => [s.parties, 1] },
    { id: 'party_win',  icon: '🏆', name: 'Party Champion',  how: 'Win a party (a human in first place).',        rule: s => [s.partyWins, 1] },
    { id: 'together',   icon: '📱', name: 'Better Together', how: 'Play a round of Play Together.',               rule: s => [s.together, 1] },
    { id: 'golf_ace',   icon: '⛳', name: 'Hole in One',     how: 'Sink a hole in one in Mini Golf.',             rule: () => [Golf.stats().aces, 1] },
    { id: 'golf_round', icon: '🏌️', name: 'Full Round',      how: 'Play all nine holes of a Mini Golf course.',   rule: () => [Golf.stats().fullRounds, 1] },
    { id: 'golf_under', icon: '🐦', name: 'Under Par',       how: 'Finish a Mini Golf course under par.',         rule: () => [Golf.stats().underPar, 1] },
    { id: 'golf_tour',  icon: '🌍', name: 'World Tour',      how: 'Set a best round on every Mini Golf course.',  rule: () => [['backyard', 'pirate', 'candy', 'space'].filter(c => Golf.best(c, 9)).length, 4] },
    { id: 'golf_trick', icon: '🎯', name: 'Trick Shot',      how: 'Sink a Mini Golf trick shot.',                   rule: () => [Golf.stats().tricksDone, 1] },
    { id: 'golf_trickall', icon: '🌟', name: 'Trick Shot Master', how: 'Three stars on every Mini Golf trick shot.', rule: () => [Golf.stats().trickStars, Math.max(1, Golf.stats().tricks * 3)] },
    // Solo games
    { id: 'critter_hard', icon: '🐘', name: 'Critter Keeper',  how: 'Solve a Hard Critter Square with no hints.',     rule: () => [Solo.count('critterHard'), 1] },
    { id: 'treasure_3',   icon: '💰', name: 'Treasure Hunter', how: 'Find all three chests in 10 digs or fewer.',      rule: () => [Solo.count('treasure3'), 1] },
    { id: 'light_hard',   icon: '🗼', name: 'Keeper of the Light', how: 'Solve a Hard Lighthouse Beams with no hints.', rule: () => [Solo.count('lighthouseHard'), 1] },
    { id: 'pearl_50',     icon: '🫧', name: 'Deep Diver',      how: 'Score 50 in one Pearl Diver dive.',               rule: () => [Solo.best('pearl') || 0, 50] },
    { id: 'rebound_all',  icon: '🦪', name: 'Clam Champion',   how: 'Three stars on every Rebound level.',             rule: () => [Solo.best('rebound') || 0, 24] },
    { id: 'daily_7',      icon: '📅', name: 'Daily Habit',     how: 'Solve a daily puzzle 7 days in a row.',           rule: () => [Solo.streak(), 7] },
    { id: 'daily_30',     icon: '🗓️', name: 'Tide Keeper',     how: 'Keep a daily streak going for 30 days.',          rule: () => [Solo.streak(), 30] },
    { id: 'ice_hard',     icon: '🐧', name: 'Slick Penguin',   how: 'Reach the fish in par on a Hard Ice Floe.',       rule: () => [Solo.count('icefloeHard3'), 1] },
    { id: 'paths_hard',   icon: '🦑', name: 'Pathfinder',      how: 'Solve a Hard Rock Pool Paths.',                   rule: () => [Solo.count('pathsHard'), 1] },
    { id: 'coral_turtle', icon: '🐢', name: 'Reef Builder',    how: 'Grow a turtle in Coral Merge.',                   rule: () => [Solo.count('coralTurtle'), 1] },
    { id: 'kite_combo',   icon: '🪁', name: 'High Flyer',      how: 'Fly through 10 rings in a row in Kite Wind.',      rule: () => [Solo.count('kiteCombo10'), 1] },
    { id: 'shelf_20',     icon: '🧸', name: 'Collector',       how: 'Put 20 plush critters on your Prize Shelf.',      rule: () => [Object.keys(Solo.shelf()).length, 20] },
    { id: 'shelf_all',    icon: '🏅', name: 'Full Shelf',      how: 'Collect all 60 plush critters.',                  rule: () => [Object.keys(Solo.shelf()).length, 60] },
    { id: 'legendary',    icon: '🐉', name: 'Legend',          how: 'Win a legendary plush from the claw machine.',    rule: () => [Solo.count('legendary'), 1] },
    { id: 'abyss_3',      icon: '🌌', name: 'Abyss Diver',     how: 'Three stars on a Rebound level in the Abyss.',     rule: () => [Solo.count('reboundAbyss3'), 1] },
    { id: 'rebound_96',   icon: '🦪', name: 'Rebound Royalty', how: 'Every star in Rebound (all 32 tanks).',            rule: () => [Solo.best('rebound') || 0, 96] },
    { id: 'orbit_all',    icon: '🪐', name: 'Astronaut',       how: 'Clear every Orbit Putt level.',                    rule: () => [Array.from({ length: 12 }, (_, i) => Solo.best(`orbit:${i}`) ? 1 : 0).reduce((a, b) => a + b, 0), 12] },
    { id: 'reef_3',       icon: '🪸', name: 'Oyster Whisperer', how: 'Three stars on 6 Reef Drop reefs.',              rule: () => [Array.from({ length: 18 }, (_, i) => (Solo.best(`reefdrop:${i}`) === 3 ? 1 : 0)).reduce((a, b) => a + b, 0), 6] },
    { id: 'mirror_30',    icon: '🏮', name: 'Lamplighter',     how: 'Light all 30 Mirror Lagoon levels.',               rule: () => [Array.from({ length: 30 }, (_, i) => Solo.best(`mirror:${i}`) ? 1 : 0).reduce((a, b) => a + b, 0), 30] },
];

let earned = Store.load('trophies', {});   // id → ISO date earned

/** Every trophy with its progress, earned first. */
export function all() {
    const s = Stats.snapshot();
    return TROPHIES.map(t => {
        const [have, goal] = t.rule(s);
        return { ...t, have: Math.min(have, goal), goal, earned: earned[t.id] || null };
    });
}

export const count = () => ({ earned: TROPHIES.filter(t => earned[t.id]).length, total: TROPHIES.length });

/**
 * Award whatever the stats now qualify for. Returns the trophies that were
 * earned by this call, for the caller to announce.
 */
export function check() {
    const fresh = all().filter(t => !t.earned && t.have >= t.goal);
    if (!fresh.length) return [];
    const today = new Date().toISOString().slice(0, 10);
    fresh.forEach(t => { earned[t.id] = today; });
    Store.save('trophies', earned);
    return fresh;
}

/** check(), and a toast for each new trophy, after the result's own toast. */
export function announce(delay = 900) {
    check().forEach((t, i) => setTimeout(() => Toast.show(`${t.icon} Trophy: ${t.name}!`, '#ffd23f'), delay * (i + 1)));
}
