// ============================================================
// HOME SCREEN — the iPhone "Share → Add to Home Screen" tip and the web-app
// metadata. Chromium with an iPhone user agent (no real Safari here): the tip
// shows on home and on a ?join= invite, a dismissal sticks, and it stays away
// when launched from the Home Screen or on a desktop. The manifest and icons
// must resolve relative to the page, as under Pages' /CLAWGames/.
//
// usage: node qa/homescreen.js        (static server on :8140; QA_BASE to point elsewhere)
// ============================================================
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8140/index.html';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

(async () => {
    const browser = await chromium.launch();
    const fail = [], errs = [];
    const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
    const open = async (ctx, url) => {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(url); await p.waitForFunction(() => !!window.__claw);
        return p;
    };
    const shown = p => p.evaluate(() => [...document.querySelectorAll('.a2hs')].map(t => !t.hidden && !!t.offsetParent));
    const phone = { userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

    // iPhone Safari: the tip on home and on an invite.
    let ctx = await browser.newContext(phone);
    let p = await open(ctx, BASE);
    check((await shown(p))[0], 'iPhone Safari: tip on the home screen');
    const head = await p.evaluate(() => ({
        manifest: document.querySelector('link[rel=manifest]').href,
        icon: document.querySelector('link[rel=apple-touch-icon]').href,
        capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
        title: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content,
    }));
    check(head.capable === 'yes' && head.title === 'CLAW Games', 'iOS web-app meta tags');
    const man = await p.evaluate(async u => (await fetch(u)).json(), head.manifest);
    check(man.display === 'standalone' && man.start_url === './' && man.name === 'CLAW Games', `manifest: ${man.display}, start_url ${man.start_url}`);
    for (const u of [head.icon, ...man.icons.map(i => new URL(i.src, head.manifest).href)]) {
        const st = await p.evaluate(async x => { const r = await fetch(x); return `${r.status} ${r.headers.get('content-type')}`; }, u);
        check(/^200 image\/png/.test(st), `icon ${u.replace(/^.*\/\/[^/]+/, '')}: ${st}`);
    }
    await p.close();
    p = await open(ctx, BASE + '?join=XYBS');
    check(await p.evaluate(() => document.querySelector('.screen:not([hidden])').dataset.screen) === 'together'
        && await p.inputValue('#net-code') === 'XYBS', 'invite ?join=XYBS still lands on Play Together with the code');
    check((await shown(p))[1], 'tip on the invite landing screen');
    await p.click('#scr-together .a2hs-x');
    check(!(await shown(p)).some(Boolean), 'dismiss hides it');
    await p.reload(); await p.waitForFunction(() => !!window.__claw);
    check(!(await shown(p)).some(Boolean), 'and it stays dismissed');
    await ctx.close();

    // Launched from the Home Screen.
    ctx = await browser.newContext(phone);
    await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }));
    p = await open(ctx, BASE);
    check(!(await shown(p)).some(Boolean), 'Home Screen app: no tip');
    await ctx.close();

    // Desktop.
    ctx = await browser.newContext();
    p = await open(ctx, BASE);
    check(!(await shown(p)).some(Boolean), 'desktop: no tip');
    await ctx.close();

    check(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    if (fail.length) { console.log(`HOMESCREEN FAIL — ${fail.length} checks`); process.exit(1); }
    console.log('HOMESCREEN PASS');
})();
