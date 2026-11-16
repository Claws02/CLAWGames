// ============================================================
// TINY PLANET — the screen. The rules are PlanetLogic.js; this draws them in
// 3D (three.js, its own small renderer inside the solo screen) and keeps what
// lasts between runs: stardust, the workshop's upgrades, crab colours and
// planets (Store key 'planet').
//
//   DRAG anywhere to walk (a floating thumb stick; arrows / WASD on a desk).
//   The buttons along the bottom build where the crab stands.
//   At night, stand in a ring and the crab catches the star.
//
// Behind the title card the autopilot plays an island of its own, so the game
// is already moving when you arrive.
// ============================================================
import * as L from './PlanetLogic.js';
import * as Solo from './SoloStats.js';
import * as Store from './Store.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'planet', icon: '🪐', title: 'Tiny Planet', blurb: 'A crab, a very small planet, and shooting stars. Gather shells, plant palms, build a village, and catch the stars before they flatten it. How many days can your island last?' };

// ── What lasts between runs ─────────────────────────────────────────────────
export const SKINS = [
    { id: 'coral', name: 'Coral', color: 0xff5a4d, cost: 0 },
    { id: 'sky', name: 'Sky', color: 0x4d9bff, cost: 15 },
    { id: 'mint', name: 'Mint', color: 0x35d6a0, cost: 15 },
    { id: 'grape', name: 'Grape', color: 0xa56bff, cost: 25 },
    { id: 'gold', name: 'Gold', color: 0xffc531, cost: 40 },
];
// Planets open with your best day; they cost nothing.
export const THEMES = [
    { id: 'sand', name: 'Sandbar', day: 0, a: 0xf3d98f, b: 0x86cf6a, sky: 0x7fd3ff, night: 0x141a45, rim: 0xbdefff, leaf: 0x3fae5a },
    { id: 'meadow', name: 'Meadow', day: 5, a: 0x8fd46e, b: 0x5fb85a, sky: 0x9be0ff, night: 0x10224a, rim: 0xd6ffd9, leaf: 0x2f9a4e },
    { id: 'candy', name: 'Candy', day: 8, a: 0xffc1dc, b: 0xbfa8ff, sky: 0xffd9ec, night: 0x2a1548, rim: 0xffe9f6, leaf: 0x58d6c2 },
    { id: 'moon', name: 'Moon', day: 12, a: 0xc9ced8, b: 0x9aa3b5, sky: 0x4b5d8c, night: 0x070a1c, rim: 0xe8eeff, leaf: 0x6fd0a8 },
    { id: 'lava', name: 'Ember', day: 16, a: 0x6b4a4a, b: 0xe2703a, sky: 0xffb07a, night: 0x24090f, rim: 0xffc29a, leaf: 0x9ad65a },
];
const KEY = 'planet';
let _sv = null;
const sv = () => (_sv ||= { dust: 0, up: {}, skins: ['coral'], skin: 'coral', theme: 'sand', runs: 0, ...Store.load(KEY, {}) });
const persist = () => Store.save(KEY, sv());
const bestDay = () => Solo.best('planet') || 0;
const themeOpen = t => bestDay() >= t.day;
const skin = () => SKINS.find(k => k.id === sv().skin) || SKINS[0];
const theme = () => { const t = THEMES.find(k => k.id === sv().theme); return t && themeOpen(t) ? t : THEMES[0]; };

export function bestText() { const b = Solo.best('planet'); return b == null ? '' : `best day ${b} · ✨ ${sv().dust}`; }
/** Buy the next level of an upgrade. True when bought. */
export function buyUpgrade(id) {
    const u = L.UPGRADES.find(x => x.id === id), s = sv(), lvl = s.up[id] || 0;
    const cost = u && lvl < u.max ? L.upgradeCost(lvl) : null;
    if (cost == null || s.dust < cost) return false;
    s.dust -= cost; s.up[id] = lvl + 1; persist(); return true;
}
/** Wear a crab colour, buying it first if need be. True when it's on. */
export function pickSkin(id) {
    const k = SKINS.find(x => x.id === id), s = sv();
    if (!k) return false;
    if (!s.skins.includes(id)) { if (s.dust < k.cost) return false; s.dust -= k.cost; s.skins.push(id); }
    s.skin = id; persist(); return true;
}
export function pickTheme(id) { const t = THEMES.find(x => x.id === id); if (!t || !themeOpen(t)) return false; sv().theme = id; persist(); return true; }

// ── Module state ────────────────────────────────────────────────────────────
let _el = null, _offs = [], _raf = 0, _last = 0, _paused = false;
let _s = null, _mode = 'menu';             // 'menu' (the autopilot's island behind the card) | 'play' | 'over'
let _stick = { x: 0, y: 0 }, _keys = {}, _ptr = null, _auto = false, _speed = 1, _moved = false;
let T = null;                               // window.THREE, taken at mount
let _gl = null;                             // { renderer, scene, camera, ... } or null without WebGL
let _visR = L.R0, _shake = 0, _nightK = 0, _t = 0, _banner = 0, _overAt = 0, _lastHud = '';
const _vis = { builds: new Map(), items: new Map(), stars: new Map() };
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _buzz = p => { try { Audio.haptic(p); } catch (e) {} };
const $ = id => _el && _el.querySelector('#' + id);

// The ground isn't quite round: low dunes, the same for the mesh and for
// whatever stands on it.
const _h = p => 1 + 0.028 * (Math.sin(3.1 * p[0] + 1) * Math.sin(2.7 * p[1] + 2) + Math.sin(4.3 * p[2] + 0.5) * Math.sin(3.7 * p[0]));

export function mount(el) {
    _el = el; T = window.THREE;
    el.innerHTML = `<div class="tp-wrap" id="tp-wrap">
        <canvas class="tp-cv" id="tp-cv"></canvas>
        <div class="tp-top" id="tp-top">
            <div class="tp-day"><b class="bfont" id="tp-day">DAY 1</b><div class="tp-clock"><i id="tp-clock"></i></div></div>
            <div class="tp-res"><span>🐚 <b id="tp-shells">0</b></span><span>🥥 <b id="tp-nuts">0</b></span><span>🛖 <b id="tp-pop">1</b></span></div>
        </div>
        <div class="tp-banner bfont" id="tp-banner"></div>
        <div class="tp-hint" id="tp-hint"></div>
        <div class="tp-pops" id="tp-pops"></div>
        <div class="tp-stick" id="tp-stick" hidden><i></i></div>
        <div class="tp-bar" id="tp-bar">
            <button class="tp-b" data-build="palm"><span>🌴</span><small></small></button>
            <button class="tp-b" data-build="hut"><span>🛖</span><small></small></button>
            <button class="tp-b" data-build="tower"><span>🔮</span><small></small></button>
            <button class="tp-b tp-fix" data-repair hidden><span>🔧</span><small>${L.REPAIR}🐚</small></button>
        </div>
        <div class="tp-over" id="tp-over"></div>
    </div>`;
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    const wrap = $('tp-wrap'), cv = $('tp-cv');
    // The thumb stick floats: it starts wherever the finger lands.
    on(cv, 'pointerdown', e => {
        if (_mode !== 'play' || _ptr) return;
        e.preventDefault();
        const r = wrap.getBoundingClientRect();
        _ptr = { id: e.pointerId, x: e.clientX, y: e.clientY };
        const st = $('tp-stick'); st.hidden = false; st.style.left = `${e.clientX - r.left}px`; st.style.top = `${e.clientY - r.top}px`; st.firstElementChild.style.transform = '';
    }, { passive: false });
    on(window, 'pointermove', e => {
        if (!_ptr || e.pointerId !== _ptr.id) return;
        const R = 46; let dx = e.clientX - _ptr.x, dy = e.clientY - _ptr.y; const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        _stick = { x: dx / R, y: -dy / R }; if (len > 8) _moved = true;
        const k = $('tp-stick'); if (k) k.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const up = e => { if (!_ptr || e.pointerId !== _ptr.id) return; _ptr = null; _stick = { x: 0, y: 0 }; const k = $('tp-stick'); if (k) k.hidden = true; };
    on(window, 'pointerup', up); on(window, 'pointercancel', up);
    const key = (e, d) => {
        const k = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' }[e.key];
        if (k) { _keys[k] = d; if (d) _moved = true; if (_mode === 'play') e.preventDefault(); }
        else if (d && _mode === 'play') { if (e.key === '1') press('palm'); else if (e.key === '2') press('hut'); else if (e.key === '3') press('tower'); else if (e.key === '4') pressRepair(); }
    };
    on(window, 'keydown', e => key(e, true)); on(window, 'keyup', e => key(e, false));
    on($('tp-bar'), 'click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.build) press(b.dataset.build); else pressRepair(); });
    on($('tp-over'), 'click', e => { const b = e.target.closest('[data-do]'); if (b) _do(b.dataset.do, b.dataset.arg); });
    on(window, 'resize', _size);
    on(document, 'visibilitychange', () => { _paused = document.hidden; _last = performance.now(); });

    _gl = _buildScene(cv);
    _size();
    _menu();
    _last = performance.now();
    const tick = now => {
        if (!_el) return;
        const dt = Math.min(0.05, (now - _last) / 1000); _last = now;
        if (!_paused) _frame(dt);
        _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

export function unmount() {
    cancelAnimationFrame(_raf); _raf = 0;
    _offs.splice(0).forEach(off => off());
    if (_gl) {
        _gl.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { x.map?.dispose(); x.dispose(); }); });
        _gl.renderer.dispose(); try { _gl.renderer.forceContextLoss(); } catch (e) {}
        _gl = null;
    }
    Object.values(_vis).forEach(m => m.clear());
    _el = null; _s = null; _ptr = null; _keys = {}; _stick = { x: 0, y: 0 }; _auto = false; _speed = 1;
}

function _size() {
    if (!_el) return;
    const wrap = $('tp-wrap'), top = wrap.getBoundingClientRect().top;
    const h = Math.max(380, Math.min(820, (window.innerHeight || 700) - top - 14));
    wrap.style.height = `${h}px`;
    if (!_gl) return;
    const w = wrap.clientWidth || 360;
    _gl.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    _gl.renderer.setSize(w, h, false);
    _gl.camera.aspect = w / h; _gl.camera.fov = w / h < 0.75 ? 58 : 48; _gl.camera.updateProjectionMatrix();
}

// ── Starting and ending a run ───────────────────────────────────────────────
/** A new island of your own. rnd: probes pass a seeded one. */
export function start(rnd = Math.random) {
    _clearVis();
    _s = L.create({ rnd, up: { ...sv().up } });
    _mode = 'play'; _auto = false; _moved = false; _visR = _s.R; _overAt = 0; _lastHud = '';
    $('tp-over').hidden = true; $('tp-top').hidden = false; $('tp-bar').hidden = false;
    _applyLook();
    _say('☀️ DAY 1', '#fde047');
    _sfx('go');
}

function _menu() {
    // The autopilot's island, behind the card.
    _clearVis();
    _s = L.create({ up: { speed: 2, reach: 3 } }); _s.shells = 30; _s.nuts = 6;
    _mode = 'menu'; _auto = true; _visR = _s.R;
    $('tp-top').hidden = true; $('tp-bar').hidden = true; $('tp-hint').textContent = '';
    _applyLook();
    const b = bestDay();
    _card(`<div class="tp-title bfont">🪐 TINY PLANET</div>
        <div class="tp-sub">Gather shells. Plant palms. Build a village.<br>At night, <b>stand in the rings</b> to catch the falling stars.</div>
        <div class="tp-stat">${b ? `🏆 Best: day ${b}` : 'Your first island!'} · ✨ ${sv().dust} stardust</div>
        <button class="go-btn bfont" data-do="play" id="btn-tp-play">PLAY</button>
        <button class="go-btn bfont tp-alt" data-do="shop" id="btn-tp-shop">🔧 WORKSHOP</button>`);
}

function _end() {
    const s = _s, dust = L.stardust(s), save = sv(), was = bestDay();
    save.dust += dust; save.runs++; persist();
    const isBest = Solo.record('planet', s.day);
    Solo.bump('planetStars', s.stats.caught); Solo.bump('planetBuilt', s.stats.built);
    Solo.won();
    const opened = THEMES.filter(t => t.day > was && t.day <= s.day);
    _mode = 'over';
    $('tp-bar').hidden = true;
    _card(`<div class="tp-title bfont">🌠 THE ISLAND IS LOST</div>
        <div class="tp-big bfont">DAY ${s.day}</div>
        <div class="tp-stat">${isBest ? '🏆 A new best!' : `Best: day ${bestDay()}`}</div>
        <div class="tp-sub">🌠 ${s.stats.caught} stars caught · 🛖 a village of ${s.stats.peak} · 🔨 ${s.stats.built} built</div>
        <div class="tp-dust bfont">+${dust} ✨ STARDUST</div>
        ${opened.map(t => `<div class="tp-new">🪐 New planet: <b>${t.name}</b> (in the workshop)</div>`).join('')}
        <button class="go-btn bfont" data-do="play" id="btn-tp-again">PLAY AGAIN</button>
        <button class="go-btn bfont tp-alt" data-do="shop">🔧 WORKSHOP · ✨ ${save.dust}</button>`);
    _sfx(isBest ? 'win' : 'land_bad');
}

function _shop() {
    const s = sv();
    const ups = L.UPGRADES.map(u => { const l = s.up[u.id] || 0, c = l < u.max ? L.upgradeCost(l) : null;
        return `<div class="tp-up"><span class="tp-ico">${u.icon}</span><div class="tp-upt"><b>${u.name}</b> <i>${'●'.repeat(l)}${'○'.repeat(u.max - l)}</i><small>${u.how}</small></div>` +
            `<button class="tp-buy bfont" data-do="up" data-arg="${u.id}" ${c == null || s.dust < c ? 'disabled' : ''}>${c == null ? 'MAX' : `✨ ${c}`}</button></div>`; }).join('');
    const skins = SKINS.map(k => { const own = s.skins.includes(k.id), hex = '#' + k.color.toString(16).padStart(6, '0');
        return `<button class="tp-chip${s.skin === k.id ? ' on' : ''}" data-do="skin" data-arg="${k.id}" ${!own && s.dust < k.cost ? 'disabled' : ''}><i style="background:${hex}"></i>${k.name}${own ? '' : ` ✨${k.cost}`}</button>`; }).join('');
    const themes = THEMES.map(t => { const open = themeOpen(t), hex = '#' + t.a.toString(16).padStart(6, '0');
        return `<button class="tp-chip${theme().id === t.id ? ' on' : ''}" data-do="theme" data-arg="${t.id}" ${open ? '' : 'disabled'}><i style="background:${hex}"></i>${t.name}${open ? '' : ` · day ${t.day}`}</button>`; }).join('');
    _card(`<div class="tp-title bfont">🔧 WORKSHOP</div><div class="tp-stat">✨ <b id="tp-dust">${s.dust}</b> stardust · earned every run</div>
        <div class="tp-ups">${ups}</div>
        <div class="tp-h">🦀 Crab colour</div><div class="tp-chips">${skins}</div>
        <div class="tp-h">🪐 Planet · reach the day to open it</div><div class="tp-chips">${themes}</div>
        <button class="go-btn bfont" data-do="play">PLAY</button>
        <button class="go-btn bfont tp-alt" data-do="menu">BACK</button>`, true);
}

function _card(html, wide = false) { const o = $('tp-over'); o.hidden = false; o.classList.toggle('low', _mode === 'menu' && !wide); o.innerHTML = `<div class="tp-card${wide ? ' wide' : ''}">${html}</div>`; }
function _do(what, arg) {
    if (what === 'play') return start();
    if (what === 'menu') return _menu();
    if (what === 'shop') { if (_mode !== 'menu') { _menu(); } return _shop(); }
    const ok = what === 'up' ? buyUpgrade(arg) : what === 'skin' ? pickSkin(arg) : what === 'theme' ? pickTheme(arg) : false;
    if (ok) { _sfx('coin_gain'); _buzz(12); _applyLook(); }
    _shop();
}

// ── The buttons ─────────────────────────────────────────────────────────────
/** Build `kind` where the crab stands (what the button does). */
export function press(kind) {
    if (_mode !== 'play' || !_s || _s.over) return null;
    const c = L.canBuild(_s, kind);
    if (!c.ok) { _hintNow(c.why === 'space' ? 'TOO CLOSE TO SOMETHING: STEP AWAY' : 'NOT ENOUGH YET', 1.4); _sfx('tick'); return null; }
    const b = L.build(_s, kind);
    _sfx('land_good'); _buzz(14);
    _burst(b.p, 0xfff2a8, 14, 3);
    return b;
}
export function pressRepair() {
    if (_mode !== 'play' || !_s) return null;
    const b = L.repair(_s);
    if (b) { _sfx('shield'); _buzz(12); _burst(b.p, 0x9be7ff, 12, 3); _pop(b.p, '🔧 MENDED'); }
    return b;
}
let _hintT = 0, _hintMsg = '';
function _hintNow(msg, secs) { _hintMsg = msg; _hintT = secs; }

// ── The frame ───────────────────────────────────────────────────────────────
function _frame(dt) {
    _t += dt;
    const s = _s;
    if (s && !s.over) {
        for (let n = 0; n < _speed; n++) {
            let stick = _stick;
            if (_keys.l || _keys.r || _keys.u || _keys.d) stick = { x: (_keys.r ? 1 : 0) - (_keys.l ? 1 : 0), y: (_keys.u ? 1 : 0) - (_keys.d ? 1 : 0) };
            if (_auto) { const a = L.autopilot(s); stick = a; if (a.build) (_mode === 'play' ? press(a.build) : L.build(s, a.build)); if (a.repair) (_mode === 'play' ? pressRepair() : L.repair(s)); }
            _events(L.step(s, dt, stick));
            if (s.over) break;
        }
    }
    if (_mode === 'menu' && s && (s.over || s.day > 12)) _menu();          // the demo island starts over
    if (_mode === 'play' && s.over && !_overAt) _overAt = _t + 1.7;
    if (_overAt && _t >= _overAt && _mode === 'play') { _overAt = 0; _end(); }
    _visR += (s.R - _visR) * Math.min(1, dt * 1.6);
    _nightK += ((s.phase === 'night' ? 1 : 0) - _nightK) * Math.min(1, dt * 1.4);
    _shake = Math.max(0, _shake - dt * 2.4);
    if (_banner && _t > _banner) { _banner = 0; $('tp-banner').classList.remove('on'); }
    _hintT = Math.max(0, _hintT - dt);
    if (_mode === 'play') _hud();
    if (_gl) _draw(dt);
}

function _events(evs) {
    const play = _mode === 'play';
    for (const e of evs) {
        if (e.type === 'pick') {
            const g = e.item.kind === 'gold';
            _burst(e.item.p, g ? 0xffd84a : e.item.kind === 'nut' ? 0xb07a4a : 0xffc9de, g ? 16 : 7, g ? 4 : 2.4);
            if (play) { _pop(e.item.p, e.item.kind === 'nut' ? '+1 🥥' : g ? `+${L.GOLD} 🐚` : '+1 🐚'); _sfx(g ? 'coin_gain' : 'tick'); _buzz(6); }
        } else if (e.type === 'gift') { if (play) _pop(e.b.p, '+1 🐚', 1.3); }
        else if (e.type === 'grown') { _burst(e.b.p, 0x7be38a, 12, 3); if (play) { _pop(e.b.p, '🌴 GROWN!', 1.6); _sfx('land_good'); } }
        else if (e.type === 'night') { if (play) { _say(e.big ? `🌙 NIGHT ${_s.day} · ☄️ A BIG ONE IS COMING!` : `🌙 NIGHT ${_s.day} · ${e.stars} STARS`, '#c7d2fe'); _sfx('boost'); } }
        else if (e.type === 'catch') {
            _burst(e.p, 0xfff08a, 26, 5); _crabJump = 0.45;
            if (play) { _pop(e.p, `🌠 CAUGHT! +${e.pay} 🐚`, 1.2); _sfx('coin_gain'); _buzz([12, 20, 30]); }
        } else if (e.type === 'shield') { _burst(e.p, 0x8fe8ff, 20, 4.5); const v = _vis.builds.get(e.tower.id); if (v) v.flash = 1; if (play) { _sfx('shield'); _buzz(10); } }
        else if (e.type === 'impact') {
            _burst(e.p, e.big ? 0xff6a4a : 0xffb347, e.big ? 46 : 24, e.big ? 7 : 5); _shake = Math.max(_shake, e.big ? 1 : 0.5);
            for (const h of e.hit) { _burst(h.b.p, 0x8a6a4a, h.gone ? 22 : 8, 4); if (play) _pop(h.b.p, h.gone ? '💥' : '🔧 CRACKED', 1.4); }
            if (play) { if (e.ouch) _pop(_s.crab.p, `OUCH! −${e.ouch} 🐚`, 1.2); _sfx('land_bad'); _buzz(e.hit.length || e.ouch ? [40, 30, 40] : 10); }
        } else if (e.type === 'dawn') {
            if (play) { _say(e.grew ? `☀️ DAY ${e.day} · THE PLANET GREW!` : `☀️ DAY ${e.day}`, '#fde047'); _sfx(e.grew ? 'win' : 'land_good'); if (e.gift) _pop(_s.crab.p, `THE VILLAGE BROUGHT ${e.gift} 🐚`, 1.5); }
            if (e.grew) { _shake = Math.max(_shake, 0.35); _burst(_s.crab.p, 0xffffff, 30, 6); }
        } else if (e.type === 'over') { _shake = 1; if (play) { _say('THE LAST HUT IS GONE…', '#fca5a5'); _buzz([60, 40, 120]); } }
    }
}

function _say(text, color) { const b = $('tp-banner'); if (!b) return; b.textContent = text; b.style.color = color; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); _banner = _t + 2.6; }

function _hud() {
    const s = _s, n = L.pop(s);
    const clock = s.phase === 'day' ? s.pt / L.DAY_S : Math.min(1, s.pt / L.NIGHT_S);
    const fix = L.repairable(s);
    const btn = ['palm', 'hut', 'tower'].map(k => { const c = L.costOf(s, k), ok = L.canBuild(s, k); return `${c.shells}🐚${c.nuts ? ` ${c.nuts}🥥` : ''}|${ok.ok ? 1 : ok.why === 'space' ? 2 : 0}`; });
    // The hint under the banner: what to do next, for the first days.
    const stars = s.stars.length, big = s.stars.some(x => x.big);
    const hint = _hintT > 0 ? _hintMsg : s.over ? '' : !_moved ? 'DRAG ANYWHERE TO WALK' :
        big ? 'RED RING: GET CLEAR! ONLY A 🔮 TOWER STOPS IT' : stars && s.day <= 3 ? 'STAND IN A RING TO CATCH THE STAR' :
        s.day > 2 ? '' : !s.builds.some(b => b.kind === 'palm') ? (s.shells >= L.costOf(s, 'palm').shells ? 'TAP 🌴 TO PLANT A PALM' : 'WALK OVER SHELLS 🐚 TO PICK THEM UP') :
        n < 2 ? 'SHELLS + COCONUTS 🥥 BUILD A HUT 🛖' : '';
    const sig = [s.day, s.phase, Math.round(clock * 100), s.shells, s.nuts, n, fix ? (s.shells >= L.REPAIR ? 2 : 1) : 0, btn.join(), hint].join('~');
    if (sig === _lastHud) return;
    _lastHud = sig;
    $('tp-day').textContent = `${s.phase === 'day' ? '☀️ DAY' : '🌙 NIGHT'} ${s.day}`;
    $('tp-clock').style.width = `${clock * 100}%`; $('tp-clock').parentElement.classList.toggle('night', s.phase === 'night');
    $('tp-shells').textContent = s.shells; $('tp-nuts').textContent = s.nuts; $('tp-pop').textContent = n;
    _el.querySelectorAll('#tp-bar [data-build]').forEach((b, i) => { const [cost, st] = btn[i].split('|'); b.querySelector('small').textContent = cost; b.classList.toggle('off', st !== '1'); b.classList.toggle('crowd', st === '2'); });
    const fb = _el.querySelector('#tp-bar [data-repair]'); fb.hidden = !fix; fb.classList.toggle('off', !!fix && s.shells < L.REPAIR);
    $('tp-hint').textContent = hint;
}

// ── Floating words (DOM, over the canvas) ───────────────────────────────────
function _pop(p, text, lift = 0.9) {
    const host = $('tp-pops'); if (!host || !_gl) return;
    const v = _at(p, lift).project(_gl.camera);
    if (v.z > 1) return;
    const d = document.createElement('div'); d.className = 'tp-pop'; d.textContent = text;
    d.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; d.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    host.appendChild(d); setTimeout(() => d.remove(), 1100);
    while (host.children.length > 14) host.firstElementChild.remove();
}

// ── 3D ──────────────────────────────────────────────────────────────────────
const V = a => new T.Vector3(a[0], a[1], a[2]);
/** The world point `lift` above the ground at place p. */
const _at = (p, lift = 0) => V(p).multiplyScalar(_visR * _h(p) + lift);
const _m4 = () => (_m4.m ||= new T.Matrix4());
/** Stand obj on the ground at p, its +Z along fwd. */
function _put(obj, p, fwd, lift = 0) {
    const up = V(p), f = V(L.tangent(p, fwd || [0.3, 0.2, 1])), x = new T.Vector3().crossVectors(up, f);
    obj.quaternion.setFromRotationMatrix(_m4().makeBasis(x, up, f));
    obj.position.copy(up.multiplyScalar(_visR * _h(p) + lift));
}
const _lam = (color, o = {}) => new T.MeshLambertMaterial({ color, flatShading: true, ...o });
const _mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); return m; };

let _crabJump = 0;
function _buildScene(canvas) {
    if (!T) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (e) { return null; }
    const scene = new T.Scene(); scene.background = new T.Color(0x7fd3ff);
    const camera = new T.PerspectiveCamera(55, 1, 0.1, 400);
    const hemi = new T.HemisphereLight(0xffffff, 0x8a7a66, 0.95); scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff4d6, 0.85); scene.add(sun); scene.add(sun.target);

    // The planet: an icosphere pushed out into low dunes, coloured by face.
    const geo = new T.IcosahedronGeometry(1, 14), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const p = [pos.getX(i), pos.getY(i), pos.getZ(i)], h = _h(p); pos.setXYZ(i, p[0] * h, p[1] * h, p[2] * h); }
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(pos.count * 3), 3));
    geo.computeVertexNormals();
    const planet = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    scene.add(planet);
    const rim = new T.Mesh(new T.SphereGeometry(1, 32, 20), new T.MeshBasicMaterial({ color: 0xbdefff, transparent: true, opacity: 0.22, side: T.BackSide, depthWrite: false }));
    scene.add(rim);

    // The sky: stars that come out at night, and a ringed neighbour far off.
    const sg = new T.BufferGeometry(), sp = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i++) { const z = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - z * z), d = 120 + Math.random() * 40; sp.set([r * Math.cos(a) * d, z * d, r * Math.sin(a) * d], i * 3); }
    sg.setAttribute('position', new T.BufferAttribute(sp, 3));
    const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(stars);
    const far = new T.Group();
    far.add(_mesh(new T.SphereGeometry(9, 20, 14), _lam(0xffb38a)));
    const ring = _mesh(new T.RingGeometry(12, 17, 40), new T.MeshBasicMaterial({ color: 0xffe2c4, side: T.DoubleSide, transparent: true, opacity: 0.7 })); ring.rotation.x = 1.25; far.add(ring);
    far.position.set(70, 40, -90); scene.add(far);

    // The crab, and its shadow.
    const crab = _crab(0xff5a4d, 0.62); scene.add(crab.g);
    const shadow = new T.Mesh(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.geometry.rotateX(-Math.PI / 2); scene.add(shadow);

    // Pebbles and tufts, so the ground has something to walk past.
    const deco = [];
    const pebble = new T.DodecahedronGeometry(0.16, 0), tuft = new T.ConeGeometry(0.09, 0.34, 4);
    const pm = _lam(0xb8a48a), tm = _lam(0x3fae5a);
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
        const z = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - z * z), p = [r * Math.cos(a), z, r * Math.sin(a)];
        const isTuft = i % 2 === 0, m = new T.Mesh(isTuft ? tuft : pebble, isTuft ? tm : pm);
        m.scale.setScalar(0.7 + rnd() * 0.9); scene.add(m); deco.push({ m, p, lift: isTuft ? 0.12 : 0.02, f: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5] });
    }

    // Sparks: one pool of points for every burst.
    const N = 320, pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3).fill(9999), 3));
    pg.setAttribute('color', new T.BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = new T.Points(pg, new T.PointsMaterial({ size: 0.26, vertexColors: true, transparent: true, depthWrite: false }));
    sparks.frustumCulled = false; scene.add(sparks);

    // Shared shapes for everything that's built, found or falls.
    const G = {
        trunk: new T.CylinderGeometry(0.09, 0.14, 0.5, 6), leaf: new T.ConeGeometry(0.22, 1.0, 4), nut: new T.SphereGeometry(0.13, 8, 6),
        wall: new T.CylinderGeometry(0.5, 0.56, 0.6, 10), roof: new T.ConeGeometry(0.78, 0.7, 10), door: new T.BoxGeometry(0.22, 0.34, 0.06),
        post: new T.CylinderGeometry(0.1, 0.2, 1.3, 8), orb: new T.SphereGeometry(0.26, 12, 10), dome: new T.SphereGeometry(L.TOWER_R, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        shell: new T.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), ring: new T.RingGeometry(0.9, 1, 36), disc: new T.CircleGeometry(1, 28),
        star: new T.IcosahedronGeometry(0.34, 0), tail: new T.ConeGeometry(0.2, 2.6, 8), fix: new T.SphereGeometry(0.14, 6, 5),
    };
    G.ring.rotateX(-Math.PI / 2); G.disc.rotateX(-Math.PI / 2); G.tail.rotateX(-Math.PI / 2); G.tail.translate(0, 0, -1.4);
    const M = {
        trunk: _lam(0x9a6b3f), leaf: _lam(0x3fae5a), nut: _lam(0x7a4a26), wall: _lam(0xf0dcae), roof: _lam(0xc9853f), hurt: _lam(0x8a6a55), door: _lam(0x6b4423),
        post: _lam(0xdfe8f5), orb: new T.MeshBasicMaterial({ color: 0x8fe8ff }), orbOff: _lam(0x6b7a90),
        shell: _lam(0xffc9de), gold: new T.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x8a6200, flatShading: true }), fix: new T.MeshBasicMaterial({ color: 0xff5a5a }),
        star: new T.MeshBasicMaterial({ color: 0xfff3a0 }), big: new T.MeshBasicMaterial({ color: 0xff7a4a }),
    };
    return { renderer, scene, camera, hemi, sun, planet, rim, stars, far, crab, shadow, deco, sparks, pool: Array.from({ length: N }, () => ({ life: 0, v: [0, 0, 0] })), next: 0, G, M, tm, camP: null };
}

// A crab from balls and sticks: body, eyes on stalks, two claws, six legs.
function _crab(color, scale) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const shell = _lam(color), dark = _lam(new T.Color(color).multiplyScalar(0.72).getHex());
    const b = _mesh(new T.SphereGeometry(0.5, 12, 9), shell, 0, 0.42, 0); b.scale.set(1.15, 0.62, 0.9); body.add(b);
    const eyes = [-1, 1].map(k => { const e = new T.Group(); e.add(_mesh(new T.CylinderGeometry(0.04, 0.04, 0.28, 5), dark, 0, 0.14, 0)); e.add(_mesh(new T.SphereGeometry(0.11, 8, 6), new T.MeshLambertMaterial({ color: 0xffffff }), 0, 0.32, 0)); e.add(_mesh(new T.SphereGeometry(0.055, 6, 5), new T.MeshBasicMaterial({ color: 0x1a1024 }), 0, 0.33, 0.085)); e.position.set(k * 0.2, 0.62, 0.26); body.add(e); return e; });
    const claws = [-1, 1].map(k => { const a = new T.Group(); a.add(_mesh(new T.CylinderGeometry(0.05, 0.05, 0.32, 5), dark, 0, 0.16, 0)); const c = _mesh(new T.SphereGeometry(0.19, 9, 7), shell, 0, 0.4, 0); c.scale.set(0.8, 1.15, 0.8); a.add(c); a.position.set(k * 0.56, 0.42, 0.24); a.rotation.z = -k * 0.7; body.add(a); return a; });
    const legs = [];
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) { const l = _mesh(new T.BoxGeometry(0.36, 0.06, 0.06), dark, k * 0.56, 0.2, 0.18 - i * 0.2); l.rotation.z = -k * 0.5; body.add(l); legs.push({ l, k, i }); }
    g.scale.setScalar(scale);
    return { g, body, claws, legs, eyes, shell, dark, phase: 0 };
}
function _crabPose(c, dt, moving, cheer) {
    if (moving) c.phase += dt * 16;
    c.legs.forEach(({ l, k, i }) => { l.rotation.y = moving ? Math.sin(c.phase + i * 2.1 + (k > 0 ? 0 : 3.14)) * 0.5 : 0; });
    c.body.position.y = (moving ? Math.abs(Math.sin(c.phase * 0.5)) * 0.05 : Math.sin(_t * 2.2) * 0.02) + cheer * 0.9;
    c.claws.forEach((a, n) => { const k = n ? 1 : -1, want = cheer > 0 ? -k * 0.15 : -k * (0.7 + Math.sin(_t * 3 + n) * 0.08); a.rotation.z += (want - a.rotation.z) * Math.min(1, dt * 14); });
}

function _applyLook() {
    if (!_gl) return;
    const th = theme();
    const col = _gl.planet.geometry.attributes.color, pos = _gl.planet.geometry.attributes.position, a = new T.Color(th.a), b = new T.Color(th.b), c = new T.Color();
    for (let i = 0; i < pos.count; i += 3) {
        const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        const n = Math.sin(x * 2.3 + 0.7) * Math.sin(y * 2.9 + 1.9) + Math.sin(z * 2.1 + x * 1.3) * 0.6;
        const tint = 0.93 + (((Math.sin(x * 91.7 + y * 47.3 + z * 13.1) * 43758.5) % 1 + 1) % 1) * 0.12;
        c.copy(n > 0.28 ? b : a).multiplyScalar(tint);
        for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    _gl.rim.material.color.setHex(th.rim); _gl.M.leaf.color.setHex(th.leaf); _gl.tm.color.setHex(th.leaf);
    const k = skin().color; _gl.crab.shell.color.setHex(k); _gl.crab.dark.color.copy(new T.Color(k).multiplyScalar(0.72));
}

function _clearVis() {
    if (_gl) Object.values(_vis).forEach(m => m.forEach(v => _gl.scene.remove(v.g)));
    Object.values(_vis).forEach(m => m.clear());
    const host = $('tp-pops'); if (host) host.innerHTML = '';
}

function _burst(p, color, n, speed) {
    if (!_gl) return;
    const g = _gl, pos = g.sparks.geometry.attributes.position, col = g.sparks.geometry.attributes.color, c = new T.Color(color), o = _at(p, 0.3), up = V(p);
    for (let i = 0; i < n; i++) {
        const k = g.next = (g.next + 1) % g.pool.length, q = g.pool[k];
        const d = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().addScaledVector(up, 0.9).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
        q.life = 0.5 + Math.random() * 0.5; q.v = [d.x, d.y, d.z];
        pos.setXYZ(k, o.x, o.y, o.z); col.setXYZ(k, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}

function _buildVis(b) {
    const { G, M } = _gl, g = new T.Group(), v = { g, kind: b.kind, born: 0, flash: 0 };
    if (b.kind === 'palm') {
        const top = new T.Group();
        for (let i = 0; i < 4; i++) { const t = _mesh(G.trunk, M.trunk, i * 0.05, 0.25 + i * 0.44, 0); t.rotation.z = -0.1; t.scale.setScalar(1 - i * 0.1); g.add(t); }
        for (let i = 0; i < 6; i++) { const lf = new T.Group(), m = _mesh(G.leaf, M.leaf, 0, 0, 0.5); m.rotation.x = Math.PI / 2 + 0.55; m.scale.set(1, 1, 0.35); lf.add(m); lf.rotation.y = (i / 6) * Math.PI * 2; top.add(lf); }
        v.nuts = [0, 1].map(i => { const n = _mesh(G.nut, M.nut, i ? 0.14 : -0.12, -0.12, i ? 0.08 : -0.06); top.add(n); return n; });
        top.position.set(0.2, 1.86, 0); g.add(top); v.top = top;
    } else if (b.kind === 'hut') {
        v.wall = _mesh(G.wall, M.wall, 0, 0.3, 0); g.add(v.wall);
        v.roof = _mesh(G.roof, M.roof, 0, 0.95, 0); g.add(v.roof);
        g.add(_mesh(G.door, M.door, 0, 0.2, 0.54));
        v.vil = _crab([0xffa24d, 0xff7ab8, 0x7ac8ff, 0xb6e36a][b.id % 4], 0.3); _gl.scene.add(v.vil.g);
    } else {
        g.add(_mesh(G.post, M.post, 0, 0.65, 0));
        v.orb = _mesh(G.orb, M.orb, 0, 1.5, 0); g.add(v.orb);
        v.dome = new T.Mesh(G.dome, new T.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide })); g.add(v.dome);
    }
    if (b.kind !== 'palm') { v.fix = _mesh(G.fix, M.fix, 0, b.kind === 'hut' ? 1.75 : 2.1, 0); v.fix.visible = false; g.add(v.fix); }
    _gl.scene.add(g);
    return v;
}

function _draw(dt) {
    const g = _gl, s = _s, c = s.crab, { G, M } = g;
    // Planet, air and the things that only sit there.
    g.planet.scale.setScalar(_visR); g.rim.scale.setScalar(_visR * 1.16);
    for (const d of g.deco) _put(d.m, d.p, d.f, d.lift);

    // The crab.
    _crabJump = Math.max(0, _crabJump - dt);
    _put(g.crab.g, c.p, c.face); _put(g.shadow, c.p, c.face, 0.04);
    const under = s.stars.some(st => !st.big && L.dist(s, st.p, c.p) < st.r * L.reachOf(s));
    _crabPose(g.crab, dt, c.moving, Math.max(_crabJump, under ? 0.12 : 0));

    // Buildings.
    const seen = new Set();
    for (const b of s.builds) {
        seen.add(b.id);
        let v = _vis.builds.get(b.id);
        if (!v) { v = _buildVis(b); _vis.builds.set(b.id, v); }
        v.born = Math.min(1, v.born + dt * 2.6); v.flash = Math.max(0, v.flash - dt * 2);
        const spring = 1 + Math.sin(v.born * Math.PI) * 0.25 * (1 - v.born) * 4 * 0.25;
        _put(v.g, b.p, [0.2, 0.1, 1]);
        if (b.kind === 'palm') {
            const k = Math.min(1, b.age / (L.PALM_GROW_S / (1 + 0.1 * ((s.up && s.up.green) || 0))));
            v.g.scale.setScalar((0.3 + 0.7 * k) * v.born * spring);
            v.top.rotation.z = Math.sin(_t * 1.3 + b.id) * 0.06; v.top.rotation.x = Math.cos(_t * 1.1 + b.id) * 0.05;
            v.nuts.forEach(n => { n.visible = k >= 1; });
        } else {
            v.g.scale.setScalar(v.born * spring);
            const hurt = b.hp < L.maxHp(s, b.kind);
            v.fix.visible = hurt; if (hurt) v.fix.position.y = (b.kind === 'hut' ? 1.75 : 2.1) + Math.sin(_t * 5) * 0.08;
            if (b.kind === 'hut') {
                v.roof.rotation.z = hurt ? 0.22 : 0; v.wall.material = hurt ? M.hurt : M.wall;
                // Its villager potters round it.
                const e1 = L.tangent(b.p, [0, 0, 1]), e2 = L.cross(b.p, e1), a = _t * 0.45 + b.id * 1.7, dir = L.mix(e1, e2, Math.cos(a), Math.sin(a));
                const vp = L.walk(b.p, dir, 1.05 / _visR);
                _put(v.vil.g, vp, L.mix(e1, e2, -Math.sin(a), Math.cos(a))); _crabPose(v.vil, dt, true, 0);
            } else {
                v.orb.material = b.charges > 0 ? M.orb : M.orbOff; v.orb.scale.setScalar(0.7 + 0.3 * (b.charges / L.TOWER_CHARGES) + Math.sin(_t * 4) * 0.04);
                v.dome.material.opacity = (b.charges > 0 ? 0.05 + 0.05 * _nightK + b.charges * 0.02 : 0) + v.flash * 0.35;
            }
        }
    }
    for (const [id, v] of _vis.builds) if (!seen.has(id)) { g.scene.remove(v.g); if (v.vil) g.scene.remove(v.vil.g); if (v.dome) v.dome.material.dispose(); if (v.vil) { v.vil.shell.dispose(); v.vil.dark.dispose(); } _vis.builds.delete(id); }

    // Things lying about.
    seen.clear();
    for (const it of s.items) {
        seen.add(it.id);
        let v = _vis.items.get(it.id);
        if (!v) { const m = it.kind === 'nut' ? new T.Mesh(G.nut, M.nut) : new T.Mesh(G.shell, it.kind === 'gold' ? M.gold : M.shell); if (it.kind === 'gold') m.scale.setScalar(1.35); const grp = new T.Group(); grp.add(m); g.scene.add(grp); v = { g: grp, m, born: 0 }; _vis.items.set(it.id, v); }
        v.born = Math.min(1, v.born + dt * 4);
        _put(v.g, it.p, [1, 0.3, 0.2], 0.1 + Math.abs(Math.sin(_t * 2.4 + it.id)) * 0.12);
        v.m.rotation.y = _t * 1.5 + it.id; v.g.scale.setScalar(v.born);
    }
    for (const [id, v] of _vis.items) if (!seen.has(id)) { g.scene.remove(v.g); _vis.items.delete(id); }

    // Stars on their way down, and where each will land.
    seen.clear();
    for (const st of s.stars) {
        seen.add(st.id);
        let v = _vis.stars.get(st.id);
        if (!v) {
            const mat = new T.MeshBasicMaterial({ color: st.big ? 0xff5a4a : 0xffe45a, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide });
            const grp = new T.Group(), ring = new T.Mesh(G.ring, mat), fill = new T.Mesh(G.disc, new T.MeshBasicMaterial({ color: st.big ? 0xff5a4a : 0xffe45a, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide }));
            ring.scale.setScalar(st.r); grp.add(ring); grp.add(fill);
            const rock = new T.Group(); rock.add(new T.Mesh(G.star, st.big ? M.big : M.star)); rock.add(new T.Mesh(G.tail, new T.MeshBasicMaterial({ color: st.big ? 0xff9a6a : 0xfff7c8, transparent: true, opacity: 0.38, depthWrite: false })));
            if (st.big) rock.scale.setScalar(1.9);
            g.scene.add(grp); g.scene.add(rock);
            v = { g: grp, rock, fill, ring, side: L.tangent(st.p, [Math.sin(st.id), 0.4, Math.cos(st.id)]) }; _vis.stars.set(st.id, v);
        }
        const k = Math.min(1, st.t / st.T);
        _put(v.g, st.p, [0, 0, 1], 0.06);
        v.fill.scale.setScalar(Math.max(0.01, st.r * k)); v.ring.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(_t * (4 + k * 8)));
        const ground = _at(st.p, 0.3), from = _at(st.p, 0.3 + 17).addScaledVector(V(v.side), 7);
        v.rock.position.lerpVectors(from, ground, k); v.rock.lookAt(ground); v.rock.children[0].rotation.x = _t * 6;
    }
    for (const [id, v] of _vis.stars) if (!seen.has(id)) { g.scene.remove(v.g); g.scene.remove(v.rock); v.g.children.forEach(m => m.material.dispose()); v.rock.children[1].material.dispose(); _vis.stars.delete(id); }

    // Sparks fall back toward the ground.
    const pos = g.sparks.geometry.attributes.position;
    g.pool.forEach((q, i) => {
        if (q.life <= 0) return;
        q.life -= dt;
        if (q.life <= 0) { pos.setXYZ(i, 9999, 9999, 9999); return; }
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), l = Math.hypot(x, y, z) || 1;
        q.v[0] -= (x / l) * 7 * dt; q.v[1] -= (y / l) * 7 * dt; q.v[2] -= (z / l) * 7 * dt;
        pos.setXYZ(i, x + q.v[0] * dt, y + q.v[1] * dt, z + q.v[2] * dt);
    });
    pos.needsUpdate = true;

    // Day and night.
    const th = theme(), n = _nightK;
    g.scene.background.setHex(th.sky).lerp(new T.Color(th.night), n);
    g.hemi.intensity = 0.95 - 0.4 * n; g.sun.intensity = 0.85 - 0.45 * n; g.sun.color.setHex(0xfff4d6).lerp(new T.Color(0x9fb4ff), n);
    g.stars.material.opacity = n; g.rim.material.opacity = 0.22 - 0.1 * n;

    // The camera rides behind and above the crab; in the menu it drifts round.
    const up = V(c.p), f = V(c.f), R = _visR;
    // (In the menu it stands well back, so the whole planet hangs over the card.)
    const menu = _mode !== 'play';
    const back = menu ? R * 2.5 : 6.4 + R * 0.32, high = menu ? R * 1.9 : 6.8 + R * 0.42;
    const want = up.clone().multiplyScalar(R + high).addScaledVector(f, -back);
    if (!g.camP) g.camP = want.clone();
    g.camP.lerp(want, Math.min(1, dt * 7));
    g.camera.position.copy(g.camP);
    if (_shake > 0) g.camera.position.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(_shake * 0.5));
    g.camera.up.copy(V(c.p));
    g.camera.lookAt(menu ? V(c.p).multiplyScalar(-R * 0.55).addScaledVector(f, -R * 0.9) : V(c.p).multiplyScalar(R).addScaledVector(f, 1.2 + R * 0.12));
    g.sun.position.copy(g.camera.position).addScaledVector(V(L.cross(c.f, c.p)), 9).addScaledVector(V(c.p), 6); g.sun.target.position.set(0, 0, 0);
    g.renderer.render(g.scene, g.camera);
}

// ── Probes ──────────────────────────────────────────────────────────────────
export function _debug() {
    const s = _s;
    return { mode: _mode, gl: !!_gl, day: s?.day, phase: s?.phase, over: !!s?.over, shells: s?.shells, nuts: s?.nuts, pop: s ? L.pop(s) : 0, R: s?.R, visR: +_visR.toFixed(2),
        builds: s ? s.builds.map(b => b.kind) : [], items: s?.items.length, stars: s?.stars.length, caught: s?.stats.caught, crab: s ? s.crab.p.map(v => +v.toFixed(3)) : null,
        drawn: { builds: _vis.builds.size, items: _vis.items.size, stars: _vis.stars.size }, dust: sv().dust, up: { ...sv().up }, skin: sv().skin, theme: theme().id,
        calls: _gl ? _gl.renderer.info.render.calls : 0 };
}
export const _game = () => _s;
/** Probes and the card's clip: let the autopilot play, and run time faster. */
export function _pilot(on = true, speed = 1) { _auto = !!on; _speed = Math.max(1, speed | 0); if (on) _moved = true; }
export function _reset() { _sv = null; Store.save(KEY, {}); }
