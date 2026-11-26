// ============================================================
// BOARD GAMES — the quick two-player board games on src/games/board/:
// Pig, Dots and Boxes, Mancala, Liar's Dice, Tide Lines, Big Grid, Hot Dice,
// Claw Race, Kelp Maze (Shut the Box has qa/shutbox.js).
//   1. each game's rules, without a game running
//   2. each game for real through claw-core, vs a bot and with two people on
//      one phone: the "human" taps the real buttons (each game's _probeTap
//      says which); it ends, returns to the arcade, reaches Stats; against a
//      bot the table never turns away from the human, with two people it
//      faces each of them in turn
// Fails on any page error.
//
// usage: (static server on :8140)   node qa/boardgames.js [pig,dotsboxes,…]
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const GAMES = { pig: 'Pig', dotsboxes: 'DotsBoxes', mancala: 'Mancala', liarsdice: 'LiarsDice',
    tidelines: 'TideLines', biggrid: 'BigGrid', hotdice: 'HotDice', clawrace: 'ClawRace', kelpmaze: 'KelpMaze', codebreaker: 'CodeBreaker' };
const ONLY = (process.argv[2] || Object.keys(GAMES).join(',')).split(',');

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

(async () => {
    const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__claw, null, { timeout: 20000 });

    // ── 1. Rules ────────────────────────────────────────────────────────────
    const R = await page.evaluate(async () => {
        const [P, D, M, L] = await Promise.all(['Pig', 'DotsBoxes', 'Mancala', 'LiarsDice'].map(f => import(`/src/games/${f}.js`)));
        const out = {};
        // Pig
        out.pigRoll = [P.rollInto(10, 5), P.rollInto(10, 1)];
        out.pigHold = [P.holdAt(0, 0), P.holdAt(0, 60), P.holdAt(90, 10), P.holdAt(50, 85)];
        // Dots and Boxes: a box closed by its fourth line goes to the player; a safe line hands nothing over
        const b = D.newBoard(); const s = D.sides(0, 0);
        out.dbCount = D.LINES(); out.dbBoxesOf = [D.boxesOf(D.H(0, 0)).length, D.boxesOf(D.H(1, 0)).length, D.boxesOf(D.V(0, 0)).length, D.boxesOf(D.V(0, 1)).length];
        out.dbThree = [D.draw(b, s[0], 0), D.draw(b, s[1], 1), D.draw(b, s[2], 0)];
        out.dbTakers = D.takers(b); out.dbClose = D.draw(b, s[3], 1); out.dbOwner = b.boxes[0];
        // Even at full skill the bot skips a free box 1% of the time on purpose, so pin the dice.
        out.dbBot = (() => { const r = Math.random; Math.random = () => 0.5; try { return D.botLine((() => { const c = D.newBoard(); D.draw(c, s[0], 0); D.draw(c, s[1], 0); D.draw(c, s[2], 0); return c; })(), 1) === s[3]; } finally { Math.random = r; } })();
        out.dbSafe = (() => { const c = D.newBoard(); D.draw(c, s[0], 0); D.draw(c, s[1], 0); return !D.safe(c).includes(s[2]) && !D.safe(c).includes(s[3]); })();
        // Mancala
        const m0 = M.newBoard();
        out.mStart = [m0.reduce((a, v) => a + v, 0), m0[6], m0[13]];
        out.mAgain = M.sow(m0, 2, 0);                    // 4 seeds from pit 2: 3,4,5, store → again
        const cap = Array(14).fill(0); cap[0] = 1; cap[1] = 0; cap[11] = 5; cap[9] = 3; cap[4] = 1;   // pit 0 → pit 1 (empty, mine), opposite 11 has 5
        out.mCap = M.sow(cap, 0, 0);
        const skip = Array(14).fill(0); skip[5] = 10; skip[8] = 1;   // P1 sows 10 from pit 5: past P2's store
        out.mSkip = M.sow(skip, 5, 0);
        const end = Array(14).fill(0); end[5] = 1; end[8] = 4; end[6] = 10; end[13] = 9;
        out.mEnd = M.sow(end, 5, 0);
        out.mBot = M.botPit(M.newBoard(), 0, 1);
        // Liar's Dice
        out.ldRaise = [L.raises({ n: 2, f: 3 }, null), L.raises({ n: 2, f: 4 }, { n: 2, f: 3 }), L.raises({ n: 3, f: 1 }, { n: 2, f: 6 }), L.raises({ n: 2, f: 2 }, { n: 2, f: 3 }), L.raises({ n: 2, f: 3 }, { n: 2, f: 3 })];
        out.ldHolds = [L.holds({ n: 3, f: 5 }, [5, 5, 1, 2, 5, 3]), L.holds({ n: 4, f: 5 }, [5, 5, 1, 2, 5, 3])];
        out.ldOdds = [L.atLeast(0, 5), L.atLeast(6, 5), L.atLeast(1, 1)];
        out.ldBotLiar = L.botMove({ n: 9, f: 6 }, [1, 2, 3, 4, 5], 5, 1);       // 9 sixes with none in hand: liar
        out.ldBotRaise = L.botMove({ n: 1, f: 2 }, [4, 4, 4, 1, 2], 5, 1);      // one 2 is nearly certain: raise
        return out;
    });
    ok(R.pigRoll[0].pot === 15 && !R.pigRoll[0].bust && R.pigRoll[1].pot === 0 && R.pigRoll[1].bust, 'Pig: a roll adds to the pot; a 1 loses it and ends the go');
    ok(R.pigHold[0] === 20 && R.pigHold[1] > 20 && R.pigHold[2] === 10 && R.pigHold[3] >= 30, `Pig bot: holds at 20, pushes when behind, banks the win, pushes when they're nearly home (${R.pigHold})`);
    ok(R.dbCount === 40 && R.dbBoxesOf.join() === '1,2,1,2', 'Dots and Boxes: 40 lines on 4×4; edge lines border one box, inner lines two');
    ok(R.dbThree.join() === '0,0,0' && R.dbTakers.length === 1 && R.dbClose === 1 && R.dbOwner === 1, 'Dots and Boxes: the fourth side closes the box for whoever draws it');
    ok(R.dbBot && R.dbSafe, 'Dots and Boxes bot: takes a box it can close; never calls a box-giving line safe');
    ok(R.mStart.join() === '48,0,0', 'Mancala: 4 seeds in each of 12 pits, stores empty');
    ok(R.mAgain.again && R.mAgain.board[6] === 1 && R.mAgain.path.join() === '3,4,5,6', 'Mancala: last seed in your store goes again');
    ok(R.mCap.captured === 6 && R.mCap.board[6] === 6 && R.mCap.board[11] === 0 && R.mCap.board[1] === 0, `Mancala: last seed in your empty pit captures it and the pit opposite (${R.mCap.captured})`);
    ok(!R.mSkip.path.includes(13) && R.mSkip.board[13] === 0, 'Mancala: sowing skips the other player\'s store');
    ok(R.mEnd.over && R.mEnd.board[6] === 11 && R.mEnd.board[13] === 13 && R.mEnd.board[8] === 0, 'Mancala: a side runs out, the rest go to their owner');
    ok(R.mBot >= 0 && R.mBot <= 5, `Mancala bot: plays one of its own pits (${R.mBot})`);
    ok(R.ldRaise.join() === 'true,true,true,false,false', 'Liar\'s Dice: a raise is more dice, or the same number of a higher face');
    ok(R.ldHolds.join() === 'true,false', 'Liar\'s Dice: a bid stands if at least that many are on the table');
    ok(R.ldOdds[0] === 1 && R.ldOdds[1] === 0 && Math.abs(R.ldOdds[2] - 1 / 6) < 1e-9, 'Liar\'s Dice: the odds of unseen dice');
    ok(R.ldBotLiar.liar && R.ldBotRaise.bid, 'Liar\'s Dice bot: calls an impossible bid, raises on a safe one');

    // The five added together (Tide Lines, Big Grid, Hot Dice, Claw Race, Kelp Maze).
    const R2 = await page.evaluate(async () => {
        const [TL, BG, HD, CR, KM, CB] = await Promise.all(['TideLines', 'BigGrid', 'HotDice', 'ClawRace', 'KelpMaze', 'CodeBreaker'].map(f => import(`/src/games/${f}.js`)));
        const out = {};
        // Tide Lines: centre joins all 8, a corner 3; three placed in a row wins; then shells slide; the bot takes a win and blocks one
        out.tlAdj = [TL.ADJ[4].length, TL.ADJ[0].length, TL.ADJ[1].length];
        const t = TL.newGame(); TL.play(t, { from: -1, to: 0 }); TL.play(t, { from: -1, to: 3 }); TL.play(t, { from: -1, to: 1 }); TL.play(t, { from: -1, to: 4 });
        out.tlPlaceWin = TL.play(t, { from: -1, to: 2 });
        const s = TL.newGame(); s.cells = [0, 0, -1, 1, 1, -1, 0, 1, -1]; s.placed = [3, 3]; s.turn = 0;
        out.tlSlides = TL.moves(s).every(m => m.from >= 0);
        const w = TL.newGame(); w.cells = [0, 0, -1, 1, 1, -1, -1, -1, -1]; w.placed = [2, 2]; w.turn = 0;
        out.tlBotWin = TL.botMove(w, 1).to === 2;
        w.turn = 1; w.cells = [0, 0, -1, 1, -1, -1, -1, -1, 1]; out.tlBotBlock = TL.botMove(w, 1).to === 2;
        // Big Grid: a square sends you to its board; a won board frees the next player; three boards in a row win
        const b = BG.newGame(); BG.play(b, 0 * 9 + 2);
        out.bgSent = BG.moves(b).every(k => Math.floor(k / 9) === 2);
        const c = BG.newGame(); [0, 1].forEach(sq => { c.cells[4 * 9 + sq] = 0; }); c.turn = 0; c.next = 4;
        BG.play(c, 4 * 9 + 2); out.bgBoard = c.won[4];
        const d = BG.newGame(); d.won = [0, 0, -1, -1, -1, -1, -1, -1, -1]; d.cells[2 * 9 + 0] = 0; d.cells[2 * 9 + 1] = 0; d.turn = 0; d.next = 2;
        out.bgWin = BG.play(d, 2 * 9 + 2);
        const f = BG.newGame(); f.won[3] = 1; f.next = 3; out.bgFree = BG.boards(f).length === 8;
        out.bgBotTake = (() => { const g = BG.newGame(); g.won = [1, 1, -1, -1, -1, -1, -1, -1, -1]; g.cells[2 * 9 + 0] = 1; g.cells[2 * 9 + 1] = 1; g.turn = 1; g.next = 2; return BG.botMove(g, 1) === 2 * 9 + 2; })();
        // Hot Dice scoring, busts and the bot
        out.hd = [[1], [5], [2, 2, 2], [1, 1, 1], [2, 2, 2, 2], [1, 2, 3, 4, 5, 6], [2, 2, 3, 3, 4, 4], [2], [1, 2]].map(HD.score);
        out.hdBust = [HD.bust([2, 3, 4, 6, 6, 2]), HD.bust([2, 3, 4, 6, 6, 5])];
        const pl = HD.plan([1, 1, 1, 2, 3, 4], 0, 0, 0, 0); out.hdPlan = pl && pl.score >= 1000 && pl.idx.length >= 3;
        out.hdBankWin = HD.plan([5, 2, 3], 300, 3, 2700, 0).bank;
        // Claw Race: the reef (a closed 48-square loop), seats, the reef's squares, snaps (not on
        // a safe island, not through a shield), surprises on landing, picking a swap, home
        out.crLoop = CR.TRACK.length === 48 && new Set(CR.TRACK.map(t => t.join())).size === 48
            && CR.TRACK.every((a, i) => { const b = CR.TRACK[(i + 1) % 48]; return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; });
        out.crSafe = CR.KIND.filter(k => k === 'safe').length;
        out.crSeats = [CR.newGame(2).per, CR.newGame(3).per, CR.newGame(4).per, CR.newGame(4).quarter.join()];
        const cr = (setup, m, steps, opts = {}) => { const g = CR.newGame(2); g.turn = 0; setup(g); return { r: CR.play(g, m, steps, { roll: steps, ...opts }), g }; };
        out.crOut = cr(() => {}, { c: 0, from: -1 }, 2).g.crabs[0][0];                                     // a 2 brings it to square 1
        out.crCurrent = cr(g => { g.crabs[0][0] = 1; }, { c: 0, from: 1 }, 2).g.crabs[0][0];              // lands on 3: on to 6
        out.crWhirl = cr(g => { g.crabs[0][0] = 2; }, { c: 0, from: 2 }, 3).g.crabs[0][0];                // lands on 5: back to 2
        out.crTunnel = cr(g => { g.crabs[0][0] = 7; }, { c: 0, from: 7 }, 1).g.crabs[0][0];               // lands on 8: on to 13
        const snap = cr(g => { g.crabs[1][0] = 1; g.crabs[0][0] = 22; }, { c: 0, from: 22 }, 3);          // P2's racer on plain square 25
        out.crSnap = [snap.r.caught.length, snap.g.crabs[1][0]];
        out.crIsland = cr(g => { g.crabs[1][0] = 6; g.crabs[0][0] = 27; }, { c: 0, from: 27 }, 3).r.caught.length;   // square 30 is an island
        const shd = cr(g => { g.crabs[1][0] = 1; g.shield[1][0] = true; g.crabs[0][0] = 22; }, { c: 0, from: 22 }, 3);
        out.crShield = [shd.r.caught.length, shd.g.crabs[1][0], shd.g.shield[1][0]];
        const gift = k => cr(g => { g.crabs[0][0] = 0; }, { c: 0, from: 0 }, 2, { rng: () => k });
        const ga = gift(0), gt = gift(0.3), gs = gift(0.99);
        out.crGifts = [ga.r.gift, ga.r.again, ga.g.turn, gt.r.gift, gt.g.crabs[0][0], gs.r.gift, gs.g.shield[0][0]];
        const sw = cr(g => { g.crabs[1][0] = 16; g.crabs[0][0] = 31; }, { c: 0, from: 31 }, 2, { rng: () => 0.6 });   // lands on the gift at 33; P2's racer on square 40
        out.crSwap = [sw.r.gift, sw.r.swapping, sw.g.turn, JSON.stringify(CR.swapTargets(sw.g, 0))];
        const pick = CR.botSwap(sw.g, 0, 0); CR.swapWith(sw.g, 0, 0, pick.p, pick.c, false);
        out.crSwapped = [sw.g.crabs[0][0], sw.g.crabs[1][0], sw.g.turn];
        out.crHome = cr(g => { g.crabs[0][0] = 45; }, { c: 0, from: 45 }, 5).r.home;
        out.crSix = cr(() => {}, { c: 0, from: -1 }, 6).r.again;
        out.crWin = cr(g => { g.crabs[0] = [48, 48, 44]; }, { c: 2, from: 44 }, 4).r.won;
        out.crBotSnap = (() => { const g = CR.newGame(2); g.turn = 0; g.crabs[1][0] = 1; g.crabs[0] = [22, 2, -1]; return CR.botMove(g, 3, 1).c === 0; })();
        // Tide Lines: no sliding straight back
        const tb = TL.newGame(); tb.cells = [0, 0, -1, 1, 1, -1, 0, 1, -1]; tb.placed = [3, 3]; tb.turn = 0;
        TL.play(tb, { from: 6, to: 8 }); tb.turn = 0;
        out.tlBack = !TL.moves(tb).some(m => m.from === 8 && m.to === 6) && TL.moves(tb).length > 0;
        // Code Breaker: marks, the bot's guesses fit, the verdict waits for equal turns
        out.cbMarks = [[[0, 1, 2, 3], [0, 1, 2, 3]], [[0, 0, 1, 1], [1, 1, 0, 0]], [[0, 0, 0, 0], [0, 1, 2, 3]], [[0, 1, 1, 2], [1, 0, 2, 1]]].map(([g, c]) => { const m = CB.mark(g, c); return `${m.exact}${m.near}`; });
        out.cbBot = (() => { let worst = 0; for (let k = 0; k < 40; k++) { const code = CB.randomCode(), rows = []; let n = 0; while (n < 10) { const g = CB.botGuess(rows, 1); n++; const m = CB.mark(g, code); rows.push({ guess: g, ...m }); if (m.exact === 4) break; } worst = Math.max(worst, rows[rows.length - 1].exact === 4 ? n : 99); } return worst; })();
        out.cbVerdict = [CB.verdict([3, 0], [3, 2]).done, CB.verdict([3, 0], [3, 3]).winner, CB.verdict([3, 3], [3, 3]).winner, CB.verdict([0, 0], [10, 10]).winner];
        // Hot Dice: the sets on the table, named
        out.hdSets = [[1, 4, 4, 4, 5, 2], [1, 2, 3, 4, 5, 6], [2, 3, 4, 6, 6, 2]].map(v => HD.combos(v).map(c => `${c.label}:${c.score}`).join('|'));
        // Kelp Maze: a wall blocks a step, crossing and overlap are refused, a wall that shuts someone in is refused, the hop
        const k = KM.newGame(); out.kmDist = [KM.dist(k, 0), KM.dist(k, 1)];
        k.walls.push({ o: 'h', r: 5, c: 2 });
        out.kmBlock = !KM.steps(k).some(([r, c]) => r === 5 && c === 3);
        out.kmCross = !KM.canWall(k, { o: 'v', r: 5, c: 2 }) && !KM.canWall(k, { o: 'h', r: 5, c: 3 });
        const sh = KM.newGame(); sh.walls.push({ o: 'h', r: 0, c: 0 }, { o: 'h', r: 0, c: 2 }, { o: 'h', r: 0, c: 4 });
        out.kmSeal = !KM.canWall(sh, { o: 'h', r: 0, c: 5 });
        const hp = KM.newGame(); hp.pawn = [[3, 3], [2, 3]]; hp.turn = 0; out.kmHop = KM.steps(hp).some(([r, c]) => r === 1 && c === 3);
        out.kmWin = (() => { const g = KM.newGame(); g.pawn[0] = [1, 3]; g.turn = 0; return KM.play(g, { step: [0, 3] }); })();
        out.kmBotWall = (() => { const g = KM.newGame(); g.pawn = [[6, 3], [5, 3]]; g.turn = 0; g.walls = []; return !!KM.botMove(g, 1).wall; })();
        return out;
    });
    ok(R2.tlAdj.join() === '8,3,5', 'Tide Lines: the centre joins all 8 points, a corner 3, an edge 5');
    ok(R2.tlPlaceWin === 'win', 'Tide Lines: three in a row while placing wins');
    ok(R2.tlSlides, 'Tide Lines: with all three down, a go is a slide');
    ok(R2.tlBotWin && R2.tlBotBlock, 'Tide Lines bot: takes its win, blocks yours');
    ok(R2.bgSent, 'Big Grid: the square you pick sends the other player to that board');
    ok(R2.bgBoard === 0, 'Big Grid: three in a row wins the small board');
    ok(R2.bgWin === 'win', 'Big Grid: three boards in a row wins the game');
    ok(R2.bgFree, 'Big Grid: sent to a finished board, the player can go anywhere open');
    ok(R2.bgBotTake, 'Big Grid bot: takes the winning square');
    ok(R2.hd.join() === '100,50,200,1000,400,1500,750,0,0', `Hot Dice: scoring (${R2.hd})`);
    ok(R2.hdBust.join() === 'true,false', 'Hot Dice: a roll with nothing scoring is a bust');
    ok(R2.hdPlan && R2.hdBankWin, 'Hot Dice bot: keeps three 1s; banks when it reaches 3,000');
    ok(R2.crLoop && R2.crSafe === 8, `Claw Race: one closed loop of 48 squares, 8 safe islands (${R2.crSafe})`);
    ok(R2.crSeats.join() === '3,2,2,0,1,2,3', `Claw Race: 3 racers each at two players, 2 at three or four, a quarter each (${R2.crSeats})`);
    ok(R2.crOut === 1, 'Claw Race: any roll brings a racer out');
    ok(R2.crCurrent === 6 && R2.crWhirl === 2 && R2.crTunnel === 13, `Claw Race: currents +3, whirlpools -3, kelp tunnels +5 (${R2.crCurrent}, ${R2.crWhirl}, ${R2.crTunnel})`);
    ok(R2.crSnap.join() === '1,-1' && R2.crIsland === 0, 'Claw Race: landing on a rival splashes it home, except on a safe island');
    ok(R2.crShield.join() === '0,1,false', 'Claw Race: a shield saves its racer once, then it\'s gone');
    ok(R2.crGifts.join() === 'again,true,0,turbo,5,shield,true', `Claw Race: surprises happen on landing: roll again now, turbo 3 more, shield (${R2.crGifts})`);
    ok(R2.crSwap[0] === 'swap' && R2.crSwap[1] && R2.crSwap[2] === 0 && R2.crSwap[3] === '[{"p":1,"c":0}]', `Claw Race: a swap waits for the player to pick a rival (${R2.crSwap})`);
    ok(R2.crSwapped.join() === '40,9,1', `Claw Race: the swap trades squares, then the turn passes (${R2.crSwapped})`);
    ok(R2.crHome && R2.crSix && R2.crWin, 'Claw Race: a lap takes a racer home; a 6 rolls again; all home wins');
    ok(R2.crBotSnap, 'Claw Race bot: takes a snap');
    ok(R2.tlBack, 'Tide Lines: a shell can\'t slide straight back to where it just came from');
    ok(R2.cbMarks.join() === '40,04,10,04', `Code Breaker: the marks (${R2.cbMarks})`);
    ok(R2.cbBot <= 9, `Code Breaker bot: cracks a code within 9 guesses (worst ${R2.cbBot})`);
    ok(R2.cbVerdict.join() === 'false,0,-1,-1', `Code Breaker: the verdict waits for equal turns; fewer guesses win; same is a draw (${R2.cbVerdict})`);
    ok(R2.hdSets.join(' / ') === 'A 1:100|THREE 4s:400|A 5:50 / STRAIGHT 1–6:1500 / ', `Hot Dice: the scoring sets are named (${R2.hdSets.join(' / ')})`);
    ok(R2.kmDist.join() === '6,6', 'Kelp Maze: both crabs 6 steps from home');
    ok(R2.kmBlock && R2.kmCross, 'Kelp Maze: a wall blocks a step; walls can\'t cross or overlap');
    ok(R2.kmSeal, 'Kelp Maze: a wall that closes off the last way through is refused');
    ok(R2.kmHop && R2.kmWin === 'win', 'Kelp Maze: hop over a crab in the way; reaching the far row wins');
    ok(R2.kmBotWall, 'Kelp Maze bot: walls a rival who is ahead');

    // ── 2. Real games ───────────────────────────────────────────────────────
    async function game(type, file, bots, label, seats = 2, maxSecs = 420) {
        const before = errs.length;
        await page.evaluate(([type, bots, seats]) => { const c = window.__claw; c.seats.count = seats; c.seats.bots = bots; c.show('grid'); c.play(type); }, [type, bots, seats]);
        const t0 = Date.now(), faces = new Set();
        let flipWithBot = false, endText = '', back = false, shot = false;
        while ((Date.now() - t0) / 1000 < maxSecs) {
            const st = await page.evaluate(async file => {
                const fire = el => el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                for (const id of ['btn-mg-intro-next', 'btn-mg-launch', 'mg-ready-1', 'mg-ready-2']) { const b = document.getElementById(id); if (b && b.offsetParent) fire(b); }
                document.querySelectorAll('.mg-ready-extra').forEach(b => b.offsetParent && fire(b));
                const bt = document.querySelector('.bt'), out = { arcade: !document.getElementById('arcade').hidden, bt: !!bt };
                if (!bt) return out;
                out.flip = bt.querySelector('.bt-frame').classList.contains('flip');
                const end = bt.querySelector('.bt-end');
                if (end) { out.end = end.textContent; return out; }
                const G = await import(`/src/games/${file}.js`), sel = G._probeTap();
                if (sel) { out.tapped = sel; fire(bt.querySelector(sel)); }
                return out;
            }, file);
            if (st.bt && !st.end) { faces.add(!!st.flip); if (st.flip && bots[1]) flipWithBot = true; }
            if (st.bt && !shot && (Date.now() - t0) > 9000) { await page.screenshot({ path: `qa/shot-${type}-${label}.png` }); shot = true; }
            if (st.end && !endText) {
                endText = st.end.replace(/\s+/g, ' ');
                await page.evaluate(() => document.querySelector('.bt-end').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
            }
            if (endText && st.arcade && !st.bt) { back = true; break; }
            await page.waitForTimeout(110);
        }
        const secs = Math.round((Date.now() - t0) / 1000);
        const plays = await page.evaluate(async t => (await import('/src/arcade/Stats.js')).plays(t), type);
        ok(back && /(WINS|DRAW)/.test(endText), `${type} ${label}: played to the end in ${secs}s: "${endText.slice(0, 60)}"`);
        ok(plays >= 1, `${type} ${label}: Stats recorded it (plays=${plays})`);
        if (seats > 2) ok(faces.size === 1 && !faces.has(true), `${type} ${label}: with ${seats} round the phone, the table stays put`);
        else if (bots[1]) ok(!flipWithBot, `${type} ${label}: the table never turned away from the human`);
        else ok(faces.size === 2, `${type} ${label}: the table faced each player in turn`);
        const newErrs = errs.slice(before);
        ok(!newErrs.length, `${type} ${label}: no page errors`);
        newErrs.slice(0, 4).forEach(e => console.log('     ' + e.slice(0, 200)));
    }
    for (const type of ONLY) {
        ok(await page.evaluate(async t => (await import('/src/arcade/Catalog.js')).eligible(2).includes(t), type), `${type}: the arcade lists it at 2 seats`);
        await game(type, GAMES[type], [false, true, false, false], 'bot');
        await game(type, GAMES[type], [false, false, false, false], 'twohuman');
        // Claw Race seats up to four: one person and three bots round the phone.
        if (type === 'clawrace') {
            ok(await page.evaluate(async t => (await import('/src/arcade/Catalog.js')).eligible(4).includes(t), type), `${type}: the arcade lists it at 4 seats`);
            await game(type, GAMES[type], [false, true, true, true], 'fourbots', 4, 900);
        }
    }
    await browser.close();
    console.log(failed ? `\nBOARD GAMES: ${failed} FAILED` : '\nBOARD GAMES PASS');
    process.exit(failed ? 1 : 0);
})();
