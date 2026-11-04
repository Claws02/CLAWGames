// The solo games' daily systems, no browser: which dailies, how hard, claw
// tokens, tide passes saving a streak, and the prize shelf.
// usage: node qa/daily.mjs
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const S = await import('../src/arcade/SoloStats.js');
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const day = (y, m, d) => new Date(y, m - 1, d, 12);
const iso = d => S.today(d);

// Which three, by the date
const t = S.todaysDailies('2026-11-04');
ok(t.length === 3 && new Set(t).size === 3 && t.every(g => S.DAILY_POOL.includes(g)), `three different dailies a day: ${t.join(', ')}`);
ok(JSON.stringify(S.todaysDailies('2026-11-04')) === JSON.stringify(t), 'the same three for the same date (every phone)');
const sets = new Set(Array.from({ length: 30 }, (_, i) => S.todaysDailies(iso(day(2026, 11, 1 + i))).join()));
ok(sets.size >= 5, `and they change from day to day (${sets.size} different sets in 30 days)`);
const seen = new Set(); for (let i = 0; i < 30; i++) S.todaysDailies(iso(day(2026, 11, 1 + i))).forEach(g => seen.add(g));
ok(seen.size === S.DAILY_POOL.length, 'every daily game comes round within a month');

// How hard: 2 Nov 2026 is a Monday
const week = [2, 3, 4, 5, 6, 7, 8].map(d => S.dailyLevel(iso(day(2026, 11, d))));
ok(JSON.stringify(week) === JSON.stringify(['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']), `the week: ${week.join(' ')}`);

// Tokens and tide passes
S._reset();
const d0 = iso(day(2026, 11, 4)), three = S.todaysDailies(d0);
const r1 = S.solveDaily(three[0], d0);
ok(r1 && r1.token && !r1.pass && S.tokens() === 1, 'a daily solved: a claw token, no pass yet');
ok(S.solveDaily(three[0], d0) === false && S.tokens() === 1, 'solving it again: nothing more');
S.solveDaily(three[1], d0);
const r3 = S.solveDaily(three[2], d0);
ok(r3.pass && r3.allDone && S.passes() === 1 && S.tokens() === 3, 'all three: a tide pass (and three tokens)');
ok(/tide pass earned/.test(S.dailyLine(r3, 'Test')) && /already/.test(S.dailyLine(false, 'Test')), `the line says so: "${S.dailyLine(r3, 'Test')}"`);
// passes cap at 2
for (const dd of [5, 6, 7]) { const dk = iso(day(2026, 11, dd)); S.todaysDailies(dk).forEach(g => S.solveDaily(g, dk)); }
ok(S.passes() === 2, `passes stop at two (${S.passes()})`);
ok(S.streak(day(2026, 11, 7)) === 4, `a four-day streak on the 7th (${S.streak(day(2026, 11, 7))})`);
// miss the 8th, open on the 9th: one pass spent, streak kept
ok(S.usePasses(day(2026, 11, 9)) === 1 && S.passes() === 1, 'missed the 8th: opening on the 9th spends one pass');
ok(S.streak(day(2026, 11, 9)) === 5, `and the streak lives: ${S.streak(day(2026, 11, 9))} (the 8th counts)`);
S.solveDaily(S.todaysDailies(iso(day(2026, 11, 9)))[0], iso(day(2026, 11, 9)));
ok(S.streak(day(2026, 11, 9)) === 6, 'solving the 9th takes it to 6');
// miss two days with one pass: no rescue
ok(S.usePasses(day(2026, 11, 12)) === 0 && S.passes() === 1, 'two days missed, one pass: nothing is spent');
ok(S.streak(day(2026, 11, 12)) === 0, 'and the streak is over');
// nothing to save: no spending
S._reset(); S.giveTokens(0);
ok(S.usePasses(day(2026, 11, 20)) === 0, 'no passes: nothing happens');

// The shelf
S._reset();
ok(S.spendToken() === false, 'no tokens: no go on the claw');
S.giveTokens(1);
ok(S.spendToken() && S.tokens() === 0, 'a token buys one go');
ok(S.addPrize('octopus').fresh && S.shelf().octopus === 1, 'a new prize goes on the shelf');
let bonus = false;
for (let i = 0; i < 5; i++) bonus = S.addPrize('octopus').bonus || bonus;
ok(bonus && S.tokens() === 1 && S.sparkles() === 0 && S.shelf().octopus === 6, 'five repeats are five sparkles: a free token');

if (fails) { console.log(`DAILY FAIL — ${fails}`); process.exit(1); }
console.log('DAILY PASS');
