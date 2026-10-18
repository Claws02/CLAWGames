// ============================================================
// TABLETOP — Mini Golf with the phone flat between two players.
//
// The setup screen offers it (four modes, fitting a phone's width), the hold
// card says TABLETOP, nobody is asked to pass the phone, the picture turns 180°
// to face P2 on their turn, and P2's real pull-back, drawn at THEIR end of the
// screen, putts the ball toward the cup.
//
// usage: node qa/tabletop.js [outdir]   (static server on :8140 serving the repo root)
// ============================================================
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const out = process.argv[2] || __dirname;
let fails = 0;
(async () => {
  const b = await chromium.launch({ ...(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : {}), args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE); await page.waitForFunction(() => !!window.__claw);
  const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); };
  // 1. The setup screen, Tabletop picked.
  await page.click('[data-go="golf"]'); await page.waitForTimeout(600); await page.click('#scr-seats button[data-n="2"]'); await page.click('#btn-seats-go'); await page.waitForTimeout(800);
  await page.click('#golf-mode button[data-v="table"]'); await page.waitForTimeout(400);
  const seg = await page.evaluate(() => { const e = document.getElementById('golf-mode'); const r = e.getBoundingClientRect(); return { w: r.width, right: r.right, vw: innerWidth, btns: [...e.children].map(x => x.textContent), sel: e.querySelector('.sel')?.dataset.v, hint: document.getElementById('golf-mode-hint').textContent.slice(0, 40), scroll: document.documentElement.scrollWidth }; });
  ok('four mode buttons, Tabletop selected', seg.btns.length === 4 && seg.sel === 'table', JSON.stringify(seg.btns));
  ok('fits the phone width (no sideways scroll)', seg.right <= seg.vw && seg.scroll <= seg.vw, `seg right ${Math.round(seg.right)} of ${seg.vw}, page ${seg.scroll}`);
  await page.screenshot({ path: `${out}/shot-tabletop-setup.png` });
  // 2. A two-person round on one hole: the orientation card says tabletop.
  await page.evaluate(async () => { const M = await import('/src/claw-core/minigames/MiniGolf.js'); M._debugForceHoles(['windmill']); window.__M = M; const c = window.__claw; c.seats.count = 2; c.seats.bots = [false, false]; });
  await page.evaluate(async () => { const G = await import('/src/arcade/Golf.js'); G.configureNext(); window.__claw.play('minigolf'); });
  let card = null;
  for (let i = 0; i < 40 && !card; i++) {
    card = await page.evaluate(() => { const h = document.getElementById('mg-page-hold'); if (h && h.offsetParent) return document.getElementById('orient-name')?.textContent; const n = document.getElementById('btn-mg-intro-next'); if (n && n.offsetParent) n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return null; });
    if (!card) await page.waitForTimeout(250);
  }
  await page.screenshot({ path: `${out}/shot-tabletop-card.png` });
  ok('the how-to-hold card is TABLETOP', card === 'TABLETOP', card);
  await page.waitForFunction(() => { for (const id of ['btn-mg-intro-next','btn-mg-launch','mg-ready-1','mg-ready-2']) { const e = document.getElementById(id); if (e && e.offsetParent) e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } const s = window.__M._debugState(); if (s && s.sub !== 'play') window.__M._debugSkip(); return s && s.sub === 'play' && s.turn === 'aim' && s.active >= 0; }, null, { timeout: 240000, polling: 300 });
  let s = await page.evaluate(() => window.__M._debugState());
  ok('no PASS card on the table', s.pass === -1, `pass ${s.pass}`);
  const fl = () => page.evaluate(() => { const f = document.querySelector('#minigame-layer [style*="rotate"]'); return f ? f.style.transform : null; });
  ok('P1 (seat 0) up first, facing the near end', s.active === 0 && !/180deg/.test(await fl()), await fl());
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/shot-tabletop-p1.png` });
  // P1 putts a soft one; then it's P2's turn and the picture turns round.
  await page.evaluate(() => { const s = window.__M._debugState(); const c = s.cup, b = s.balls[0]; window.__M._debugShoot(0, c[0] - b.x, c[1] - b.z, 0.25); });
  await page.waitForFunction(() => { const s = window.__M._debugState(); return s.active === 1 && s.turn === 'aim'; }, null, { timeout: 120000, polling: 300 });
  await page.waitForTimeout(800);
  s = await page.evaluate(() => window.__M._debugState());
  ok('P2 up: the frame has turned 180°', /180deg/.test(await fl()), await fl());
  ok('still no PASS card', s.pass === -1);
  await page.screenshot({ path: `${out}/shot-tabletop-p2.png` });
  // P2, sitting at the top, presses the ball and pulls back toward themselves (up the physical screen).
  const before = await page.evaluate(() => { const s = window.__M._debugState(); const b = s.balls[1]; return { d: Math.hypot(b.x - s.cup[0], b.z - s.cup[1]), on: s.onScreen[1] }; });
  const fr = await page.evaluate(() => { const f = document.querySelector('#minigame-layer [style*="rotate"]'); const r = f.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const [lx, ly] = before.on; const sx = fr.l + fr.w - lx, sy = fr.t + fr.h - ly;   // local → screen under a half turn
  await page.mouse.move(sx, sy); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(sx, sy - k * 14); await page.waitForTimeout(16); } await page.mouse.up();
  await page.waitForFunction(() => { const s = window.__M._debugState(); return s.active !== 1 || s.turn !== 'aim' || s.balls[1].v < 0.01 && window.__shot; }, null, { timeout: 4000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => { const s = window.__M._debugState(); const b = s.balls[1]; return { d: Math.hypot(b.x - s.cup[0], b.z - s.cup[1]), strokes: s.strokes[1] }; });
  ok('P2\'s pull-back (drawn at their end) putts the ball toward the cup', after.strokes[0] >= 1 && after.d < before.d, `stroke ${after.strokes} · ${before.d.toFixed(1)} → ${after.d.toFixed(1)} from the cup`);
  ok('no page errors', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(fails ? `TABLETOP FAIL — ${fails}` : 'TABLETOP PASS');
  process.exit(fails ? 1 : 0);
})();
