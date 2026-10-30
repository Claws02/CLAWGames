// Drinking-mode rules: sips by place, the winner's handout, house rules, the crab tap.
// usage: node qa/drinks.mjs
import { sips, drawRule, tap, isOn, RULES } from '../src/arcade/Drinks.js';
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? 'ok  ' : 'FAIL', m, JSON.stringify(a), ok ? '' : 'want ' + JSON.stringify(b)); if (!ok) process.exitCode = 1; };
eq(sips([10, 5]), { sips: [0, 2], give: 0 }, '2P: loser drinks the pool');
eq(sips([9, 7, 5, 1]), { sips: [0, 1, 1, 2], give: 0 }, '4P: last drinks most, winner none');
eq(sips([1, 4, 9]), { sips: [2, 1, 0], give: 2 }, '3P in any seat order');
eq(sips([3, 3, 3]), { sips: [1, 1, 1], give: -1 }, 'all tied: everyone drinks, no handout');
eq(sips([9, 9, 1]), { sips: [1, 1, 2], give: -1 }, 'tied winners drink the same');
eq(sips([7]).sips, [0], 'one player: nothing');
eq(drawRule([5, 1, 3], [], () => 0).seat, 1, 'rule goes to last place');
eq(drawRule([2, 2]), null, 'no rule when nobody lost');
eq(drawRule([5, 1], RULES.slice(1), () => 0).rule, RULES[0], 'rules in play are not dealt again');
eq(!!drawRule([5, 1], RULES.slice(), () => 0).rule, true, 'a full deck reshuffles');
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; } };
const t0 = 1e6;
eq([0, 1, 2, 3].map(i => tap(t0 + i * 100)), [false, false, false, false], 'four taps: still party');
eq([tap(t0 + 400), isOn()], [true, true], 'fifth tap flips to drinking');
eq([0, 1, 2, 3, 4].map(i => tap(t0 + 10000 + i * 1000)).includes(true), false, 'slow taps never flip');
import { scoresFrom, localRound, localRules, resetLocal } from '../src/arcade/Drinks.js';
eq(scoresFrom(2, null, 4), [0, 0, 1, 0], 'one-device result, winner only');
eq(scoresFrom(-1, null, 3), [0, 0, 0], 'a draw shares it all');
eq(scoresFrom(0, [5, 9, 1], 3), [5, 9, 1], 'standings rank the table');
resetLocal();
const lr = localRound(['Ann', 'Bot Blue', 'Cat'], [9, 1, 5], [false, true, false]);
eq([lr.sips, lr.give, lr.rule?.name], [[0, 2, 1], 0, 'Cat'], 'a bot never takes the rule: the lowest human does');
eq(localRound(['Bot Red', 'Ann'], [9, 1], [true, false]).give, -1, 'a bot winner hands nothing out');
eq(localRules().length, 2, 'house rules pile up for the session');
resetLocal(); eq(localRules().length, 0, 'going home clears them');
