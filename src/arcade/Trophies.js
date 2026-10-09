// ============================================================
// TROPHIES — milestones read off Stats. Each has a rule that returns
// [progress, goal]; it is earned when progress reaches the goal. Earned
// trophies are remembered (with the date) so they stay earned.
// ============================================================
import * as Store from './Store.js';
import * as Stats from './Stats.js';
import { allTypes, MG_GENRES } from './Catalog.js';
import * as Toast from './Toast.js';

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
