// ============================================================
// TINY PLANET — the screen. The rules are PlanetLogic.js; this draws them in
// 3D (three.js, its own renderer) over the whole screen, and keeps what lasts
// between runs: stardust, the workshop's upgrades, crab colours and planets,
// a run that was saved to come back to, and which tips have been shown
// (Store key 'planet').
//
//   DRAG anywhere to walk (a floating thumb stick; arrows / WASD on a desk).
//   Bottom left: what to build where the crab stands.
//   Bottom right: JUMP (space), and the ACTION button (E), which does
//   whatever is to hand: shake, mend, grow a home, pick up or throw a rock.
//   Top right: pause, where a run can be saved and left.
//
// Behind the title card the autopilot plays an island of its own, so the game
// is already moving when you arrive.
// ============================================================
import * as L from './PlanetLogic.js';
import * as Solo from './SoloStats.js';
import * as Store from './Store.js';
import * as Audio from '../claw-core/engine/AudioManager.js';
import * as LL from './LairLogic.js';
import { createLair } from './LairScreen.js';
import { makeToon } from './Toon.js';

export const meta = { id: 'planet', icon: '🪐', title: 'Tiny Planet', blurb: 'A crab, a very small planet, and shooting stars. Gather shells, plant palms and build homes to grow a city of crabs, and catch the stars before they flatten it. How big can your city get?' };

// ── What lasts between runs ─────────────────────────────────────────────────
export const SKINS = [
    { id: 'coral', name: 'Coral', color: 0xff5a4d, cost: 0 },
    { id: 'sky', name: 'Sky', color: 0x4d9bff, cost: 15 },
    { id: 'mint', name: 'Mint', color: 0x35d6a0, cost: 15 },
    { id: 'grape', name: 'Grape', color: 0xa56bff, cost: 25 },
    { id: 'gold', name: 'Gold', color: 0xffc531, cost: 40 },
];
// Planets open with your biggest city; they cost nothing.
export const THEMES = [
    { id: 'sand', name: 'Sandbar', pop: 0, a: 0xf3d98f, b: 0x86cf6a, sky: 0x7fd3ff, night: 0x141a45, rim: 0xbdefff, leaf: 0x3fae5a },
    { id: 'meadow', name: 'Meadow', pop: 5, a: 0x8fd46e, b: 0x5fb85a, sky: 0x9be0ff, night: 0x10224a, rim: 0xd6ffd9, leaf: 0x2f9a4e },
    { id: 'candy', name: 'Candy', pop: 10, a: 0xffc1dc, b: 0xbfa8ff, sky: 0xffd9ec, night: 0x2a1548, rim: 0xffe9f6, leaf: 0x58d6c2 },
    { id: 'moon', name: 'Moon', pop: 20, a: 0xc9ced8, b: 0x9aa3b5, sky: 0x4b5d8c, night: 0x070a1c, rim: 0xe8eeff, leaf: 0x6fd0a8 },
    { id: 'lava', name: 'Ember', pop: 35, a: 0x6b4a4a, b: 0xe2703a, sky: 0xffb07a, night: 0x24090f, rim: 0xffc29a, leaf: 0x9ad65a },
];
const KEY = 'planet';
let _sv = null;
const sv = () => (_sv ||= { dust: 0, up: {}, skins: ['coral'], skin: 'coral', theme: 'sand', runs: 0, run: null, seen: {}, trick: {}, lair: {}, ...Store.load(KEY, {}) });
const persist = () => Store.save(KEY, sv());
const bestCity = () => Solo.best('planetCity') || 0;
const themeOpen = t => bestCity() >= t.pop;
const skin = () => SKINS.find(k => k.id === sv().skin) || SKINS[0];
const theme = () => { const t = THEMES.find(k => k.id === sv().theme); return t && themeOpen(t) ? t : THEMES[0]; };
const townOf = n => { let k = 0; while (L.TOWNS[k + 1] && n >= L.TOWNS[k + 1].pop) k++; return L.TOWNS[k]; };

export function bestText() { const b = Solo.best('planetCity'); return b == null ? '' : `biggest city ${b} 🦀 · ${townOf(b).name.toLowerCase()}`; }
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
let _el = null, _offs = [], _raf = 0, _last = 0, _hidden = false, _paused = false;
let _s = null, _mode = 'menu';             // 'menu' (the autopilot's island behind the card) | 'play' | 'over' | 'trick' (the Coconut Trials)
let _trial = null, _trialOwed = 0;          // the trial on screen (null: its cards), and shells won there for the city
let _stick = { x: 0, y: 0 }, _keys = {}, _ptr = null, _look = null, _pitch = 0, _auto = false, _speed = 1;      // _ptr: the left thumb (walk); _look: the right thumb (turn the camera)
let T = null, Y = null;                     // window.THREE, taken at mount; Y: the ink-outlined toon style (Toon.js)
let _gl = null;                             // { renderer, scene, camera, ... } or null without WebGL
let _visR = L.R0, _shake = 0, _nightK = 0, _t = 0, _banner = 0, _overAt = 0, _lastHud = '', _lift = 0, _cheer = 0;
let _tips = [], _tipT = 0, _hintT = 0, _hintMsg = '';
const _vis = { builds: new Map(), items: new Map(), stars: new Map() };
let _courseVis = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _buzz = p => { try { Audio.haptic(p); } catch (e) {} };
const $ = id => _el && _el.querySelector('#' + id);

// The ground isn't quite round: low dunes, the same for the mesh and for
// whatever stands on it.
const _h = p => 1 + 0.028 * (Math.sin(3.1 * p[0] + 1) * Math.sin(2.7 * p[1] + 2) + Math.sin(4.3 * p[2] + 0.5) * Math.sin(3.7 * p[0]));
const PLANK_H = 0.55;                        // how high the boardwalk stands

export function mount(el) {
    _el = el; T = window.THREE; Y = T ? makeToon(T) : null;
    el.innerHTML = `<div class="tp-wrap full" id="tp-wrap">
        <canvas class="tp-cv" id="tp-cv"></canvas>
        <div class="tp-top" id="tp-top">
            <div class="tp-city"><b class="bfont" id="tp-pop">🦀 1</b><span id="tp-town">CAMP</span>
                <div class="tp-clock"><i id="tp-clock"></i></div><small id="tp-day">☀️ DAY 1</small></div>
            <div class="tp-right"><div class="tp-res"><span>🐚 <b id="tp-shells">0</b></span><span>🥥 <b id="tp-nuts">0</b></span></div>
                <button class="tp-pause tp-hintbtn" id="btn-tp-hint" aria-label="Hint" hidden>💡</button><button class="tp-pause" id="btn-tp-pause" aria-label="Pause">⏸</button></div>
        </div>
        <div class="tp-trial" id="tp-trial" hidden><b class="bfont" id="tp-trial-n"></b><span id="tp-trial-s"></span></div>
        <div class="tp-goal" id="tp-goal"></div>
        <div class="tp-banner bfont" id="tp-banner"></div>
        <div class="tp-pops" id="tp-pops"></div>
        <div class="tp-stick" id="tp-stick" hidden><i></i></div>
        <div class="tp-zones" id="tp-zones" hidden><span>☝️ LEFT THUMB<br>TO WALK</span><span>👀 RIGHT THUMB<br>TO LOOK AROUND</span></div>
        <div class="tp-tip" id="tp-tip" hidden></div>
        <div class="tp-hint" id="tp-hint"></div>
        <div class="tp-acts" id="tp-acts">
            <div class="tp-bar" id="tp-bar">
                <button class="tp-b" data-build="palm"><span>🌴</span><em>PALM</em><small></small></button>
                <button class="tp-b" data-build="hut"><span>🛖</span><em>HOME</em><small></small></button>
                <button class="tp-b" data-build="tower"><span>🔮</span><em>TOWER</em><small></small></button>
                <button class="tp-b" data-build="market"><span>🏪</span><em>MARKET</em><small></small></button>
            </div>
            <button class="tp-r tp-act off" id="btn-tp-act"><span>✋</span><small></small></button>
            <button class="tp-r tp-jump" id="btn-tp-jump"><span>⬆️</span><small>JUMP</small></button>
        </div>
        <div class="tp-over" id="tp-over"></div>
    </div>`;
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    const wrap = $('tp-wrap'), cv = $('tp-cv');
    // Two thumbs: the LEFT half of the screen is a floating stick (it starts wherever the finger lands) and walks; the RIGHT half
    // turns the camera (drag sideways to go round, up and down to tilt it). The buttons keep their own taps.
    on(cv, 'pointerdown', e => {
        if ((_mode !== 'play' && !(_mode === 'trick' && _trial)) || _paused) return;
        e.preventDefault();
        const r = wrap.getBoundingClientRect(), left = e.clientX - r.left < r.width / 2;
        if (left) {
            if (_ptr) return;
            _ptr = { id: e.pointerId, x: e.clientX, y: e.clientY }; _ctl.stick = true;
            const st = $('tp-stick'); st.hidden = false; st.style.left = `${e.clientX - r.left}px`; st.style.top = `${e.clientY - r.top}px`; st.firstElementChild.style.transform = '';
        } else if (!_look) { _look = { id: e.pointerId, x: e.clientX, y: e.clientY }; _ctl.look = true; }
    }, { passive: false });
    on(window, 'pointermove', e => {
        if (_ptr && e.pointerId === _ptr.id) {
            const R = 46; let dx = e.clientX - _ptr.x, dy = e.clientY - _ptr.y; const len = Math.hypot(dx, dy);
            if (len > R) { dx *= R / len; dy *= R / len; }
            _stick = { x: dx / R, y: -dy / R };
            const k = $('tp-stick'); if (k) k.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (_look && e.pointerId === _look.id) {
            const dx = e.clientX - _look.x, dy = e.clientY - _look.y; _look.x = e.clientX; _look.y = e.clientY;
            turnView(dx * 0.012, dy * 0.006);
        }
    });
    const up = e => {
        if (_ptr && e.pointerId === _ptr.id) { _ptr = null; _stick = { x: 0, y: 0 }; const k = $('tp-stick'); if (k) k.hidden = true; }
        if (_look && e.pointerId === _look.id) _look = null;
    };
    on(window, 'pointerup', up); on(window, 'pointercancel', up);
    const key = (e, d) => {
        const k = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd', q: 'tl', r: 'tr' }[e.key];
        if (k) { _keys[k] = d; if (_mode === 'play' || _mode === 'trick') e.preventDefault(); return; }
        if (_mode === 'trick') {
            if (!_trial || e.repeat) return;
            if (e.key === ' ' && d) { e.preventDefault(); pressJump(); }
            else if (e.key === 'e' || e.key === 'Enter') holdThrow(d);
            else if (d && (e.key === 'Escape' || e.key === 'p')) (_paused ? resume() : pause());
            return;
        }
        if (!d || _mode !== 'play') return;
        if (e.key === ' ') { e.preventDefault(); pressJump(); }
        else if (e.key === 'e' || e.key === 'Enter') pressAct();
        else if (e.key === 'Escape' || e.key === 'p') (_paused ? resume() : pause());
        else { const kind = { 1: 'palm', 2: 'hut', 3: 'tower', 4: 'market' }[e.key]; if (kind) press(kind); }
    };
    on(window, 'keydown', e => key(e, true)); on(window, 'keyup', e => key(e, false));
    on($('tp-bar'), 'click', e => { const b = e.target.closest('button'); if (b) press(b.dataset.build); });
    // (pointerdown, so a jump is never a beat late)
    on($('btn-tp-jump'), 'pointerdown', e => { e.preventDefault(); pressJump(); });
    on($('btn-tp-act'), 'pointerdown', e => { e.preventDefault(); if (_mode === 'trick') { _actPtr = e.pointerId; holdThrow(true); } else pressAct(); });
    const actUp = e => { if (_actPtr !== null && e.pointerId === _actPtr) { _actPtr = null; holdThrow(false); } };
    on(window, 'pointerup', actUp); on(window, 'pointercancel', actUp);
    on($('btn-tp-pause'), 'click', () => pause());
    on($('btn-tp-hint'), 'click', () => lairHint());
    on($('tp-over'), 'click', e => { const b = e.target.closest('[data-do]'); if (b) _do(b.dataset.do, b.dataset.arg); });
    on(window, 'resize', _size);
    on(document, 'visibilitychange', () => { _hidden = document.hidden; _last = performance.now(); if (_hidden) _autosave(); });
    on(window, 'pagehide', _autosave);

    _gl = _buildScene(cv);
    _size();
    _menu();
    _last = performance.now();
    const tick = now => {
        if (!_el) return;
        const dt = Math.min(0.05, (now - _last) / 1000); _last = now;
        if (!_hidden) _frame(dt);
        _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

export function unmount() {
    _autosave();
    cancelAnimationFrame(_raf); _raf = 0;
    _offs.splice(0).forEach(off => off());
    if (_gl) {
        _gl.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { x.map?.dispose(); x.dispose(); }); });
        _gl.renderer.dispose(); try { _gl.renderer.forceContextLoss(); } catch (e) {}
        _gl = null;
    }
    if (_trial) { _trial.dispose(); _trial = null; }
    Object.values(_vis).forEach(m => m.clear()); _courseVis = null;
    _el = null; _s = null; _ptr = null; _look = null; _pitch = 0; _keys = {}; _stick = { x: 0, y: 0 }; _auto = false; _speed = 1; _paused = false; _tips = [];
}

function _size() {
    if (!_el || !_gl) return;
    const wrap = $('tp-wrap'), w = wrap.clientWidth || 360, h = wrap.clientHeight || 640;
    _gl.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    _gl.renderer.setSize(w, h, false);
    _gl.camera.aspect = w / h; _gl.camera.fov = w / h < 0.75 ? 58 : 48; _gl.camera.updateProjectionMatrix();
}

// ── Starting, pausing, saving and ending a run ──────────────────────────────
function _begin(s) {
    _clearVis();
    _s = s; _mode = 'play'; _auto = false; _paused = false; _visR = s.R; _overAt = 0; _lastHud = ''; _tips = []; _tipT = 0;
    $('tp-over').hidden = true;
    _hud_show(true);
    if (_trial) { _trial.dispose(); _trial = null; }
    _applyLook();
}
/** A new city of your own. rnd: probes pass a seeded one. */
export function start(rnd = Math.random) {
    sv().run = null; persist();
    _begin(L.create({ rnd, up: { ...sv().up } }));
    _say('☀️ DAY 1 · GROW YOUR CITY', '#fde047');
    _sfx('go');
}
/** Pick up the run that was saved. */
export function resumeSaved() {
    const o = sv().run;
    if (!o) return start();
    try { _begin(L.load(o)); } catch (e) { return start(); }
    _say(`WELCOME BACK · ${L.pop(_s)} CRABS`, '#fde047');
    _sfx('go');
}
function _autosave() {
    if (_mode !== 'play' || !_s || _s.over || _auto) return;
    sv().run = L.save(_s); persist();
}
export function pause() {
    if (_mode === 'trick') {
        if (!_trial || _paused) return;
        _paused = true; _ptr = null; _stick = { x: 0, y: 0 }; const st = $('tp-stick'); if (st) st.hidden = true;
        return _card(`<div class="tp-title bfont">⏸ PAUSED</div><div class="tp-stat">🐙 ${(_trial.base || _trial.level).name}</div>
            <button class="go-btn bfont" data-do="resume" id="btn-tp-resume">RESUME</button>
            <button class="go-btn bfont tp-alt" data-do="trial-again">↻ START AGAIN</button>
            <button class="go-btn bfont tp-alt" data-do="trials">THE LAIR</button>
            <button class="go-btn bfont tp-alt tp-quiet" data-do="city">‹ BACK TO THE CITY</button>`);
    }
    if (_mode !== 'play' || _paused || !_s || _s.over) return;
    _paused = true; _ptr = null; _stick = { x: 0, y: 0 }; const k = $('tp-stick'); if (k) k.hidden = true;
    _autosave();
    const n = L.pop(_s);
    _card(`<div class="tp-title bfont">⏸ PAUSED</div>
        <div class="tp-stat">${L.TOWNS[_s.town].icon} ${L.TOWNS[_s.town].name} · ${n} crab${n === 1 ? '' : 's'} · day ${_s.day}</div>
        <button class="go-btn bfont" data-do="resume" id="btn-tp-resume">RESUME</button>
        <button class="go-btn bfont tp-alt" data-do="leave" id="btn-tp-leave">💾 SAVE &amp; LEAVE</button>
        <button class="go-btn bfont tp-alt tp-quiet" data-do="giveup">END THIS CITY</button>
        <div class="tp-sub">Your city is saved whenever you pause or leave.</div>`);
}
export function resume() { if (!_paused) return; _paused = false; $('tp-over').hidden = true; _last = performance.now(); }
function _leave() { _autosave(); document.querySelector('#scr-sologame [data-back]')?.click(); }

function _hud_show(on) { $('tp-trial').hidden = true; $('tp-top').classList.remove('trial'); $('tp-goal').classList.remove('wide'); $('btn-tp-act').style.removeProperty('--k'); $('btn-tp-act').hidden = false; ['tp-top', 'tp-bar', 'tp-acts', 'tp-goal'].forEach(id => { $(id).hidden = !on; }); if (!on) { $('tp-hint').textContent = ''; $('tp-tip').hidden = true; } }

function _menu() {
    // The autopilot's island, behind the card.
    _clearVis();
    _s = L.create({ up: { speed: 2, reach: 3 } }); _s.shells = 30; _s.nuts = 6;
    _mode = 'menu'; _auto = true; _paused = false; _visR = _s.R;
    _hud_show(false);
    _applyLook();
    const b = bestCity(), run = sv().run;
    const saved = run ? `${run.builds.reduce((n, x) => n + (x.kind === 'hut' ? x.lvl : 0), 0)} crabs · day ${run.day}` : '';
    _card(`<div class="tp-title bfont">🪐 TINY PLANET</div>
        <div class="tp-sub">Grow a <b>city of crabs</b>: every home is another crab.<br>At night, <b>stand in the rings</b> to catch the falling stars.</div>
        <div class="tp-stat">${b ? `🏆 Biggest city: ${b} 🦀 (${townOf(b).name})` : 'Your first city!'} · ✨ ${sv().dust}</div>
        ${run ? `<button class="go-btn bfont" data-do="continue" id="btn-tp-continue">CONTINUE · ${saved}</button>` : ''}
        <button class="go-btn bfont${run ? ' tp-alt' : ''}" data-do="play" id="btn-tp-play">${run ? 'NEW CITY' : 'PLAY'}</button>
        <button class="go-btn bfont tp-alt" data-do="shop" id="btn-tp-shop">🔧 WORKSHOP</button>
        <button class="go-btn bfont tp-alt tp-quiet" data-do="exit" id="btn-tp-exit">‹ BACK TO GAMES</button>`);
}

function _end() {
    const s = _s, dust = L.stardust(s), save = sv(), was = bestCity(), peak = s.stats.peak;
    save.dust += dust; save.runs++; save.run = null; persist();
    const isBest = Solo.record('planetCity', peak);
    Solo.record('planet', s.day);
    Solo.bump('planetStars', s.stats.caught); Solo.bump('planetBuilt', s.stats.built);
    Solo.won();
    const opened = THEMES.filter(t => t.pop > was && t.pop <= peak);
    _mode = 'over'; _paused = false;
    _hud_show(false);
    _card(`<div class="tp-title bfont">🌠 THE CITY IS LOST</div>
        <div class="tp-big bfont">${peak} 🦀</div>
        <div class="tp-stat">${L.TOWNS[s.town].icon} A ${L.TOWNS[s.town].name} · ${isBest ? '🏆 your biggest yet!' : `biggest: ${bestCity()}`}</div>
        <div class="tp-sub">☀️ ${s.day} days · 🌠 ${s.stats.caught} caught (${s.stats.perfect} perfect) · 🪵 ${s.stats.courses} course${s.stats.courses === 1 ? '' : 's'}</div>
        <div class="tp-dust bfont">+${dust} ✨ STARDUST</div>
        ${opened.map(t => `<div class="tp-new">🪐 New planet: <b>${t.name}</b> (in the workshop)</div>`).join('')}
        <button class="go-btn bfont" data-do="play" id="btn-tp-again">PLAY AGAIN</button>
        <button class="go-btn bfont tp-alt" data-do="shop">🔧 WORKSHOP · ✨ ${save.dust}</button>
        <button class="go-btn bfont tp-alt tp-quiet" data-do="exit">‹ BACK TO GAMES</button>`);
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
        return `<button class="tp-chip${theme().id === t.id ? ' on' : ''}" data-do="theme" data-arg="${t.id}" ${open ? '' : 'disabled'}><i style="background:${hex}"></i>${t.name}${open ? '' : ` · ${t.pop} 🦀`}</button>`; }).join('');
    _card(`<div class="tp-title bfont">🔧 WORKSHOP</div><div class="tp-stat">✨ <b id="tp-dust">${s.dust}</b> stardust · earned every run</div>
        <div class="tp-ups">${ups}</div>
        <div class="tp-h">🦀 Crab colour</div><div class="tp-chips">${skins}</div>
        <div class="tp-h">🪐 Planet · grow a city that big to open it</div><div class="tp-chips">${themes}</div>
        <button class="go-btn bfont tp-alt" data-do="menu">BACK</button>`, true);
}

function _card(html, wide = false) { const o = $('tp-over'); o.hidden = false; o.classList.toggle('low', _mode === 'menu' && !wide); o.innerHTML = `<div class="tp-card${wide ? ' wide' : ''}">${html}</div>`; }
function _do(what, arg) {
    if (what === 'play') return start();
    if (what === 'continue') return resumeSaved();
    if (what === 'resume') return resume();
    if (what === 'leave' || what === 'exit') return _leave();
    if (what === 'giveup') { _paused = false; _s.over = true; _overAt = 0; return _end(); }
    if (what === 'menu') return _menu();
    if (what === 'trial') return playTrial(+arg);
    if (what === 'trial-again') { _paused = false; $('tp-over').hidden = true; if (_trial && _trial.base && _trial.base.moon) playTrial(LL.CHAMBERS.indexOf(_trial.base)); else _trial?.restart(); _lastHud = ''; return; }
    if (what === 'trials') return _lairCard();
    if (what === 'city') return _backToCity();
    if (what === 'shop') { if (_mode !== 'menu') _menu(); return _shop(); }
    const ok = what === 'up' ? buyUpgrade(arg) : what === 'skin' ? pickSkin(arg) : what === 'theme' ? pickTheme(arg) : false;
    if (ok) { _sfx('coin_gain'); _buzz(12); _applyLook(); }
    _shop();
}

// ── Old Ink's Lair (through the Trick Hut) ───────────────────────────────────
const _starsOf = id => sv().lair[id] || [false, false, false];
const _starText = st => st.map(x => (x ? '⭐' : '☆')).join('');
const FAST_S = 120, FIRST_CLEAR = 40, PER_STAR = 8;
let _hintN = 0;
/** Walk into the Trick Hut: the city waits, saved, while the lair is on. */
export function enterTrials() {
    if (_mode !== 'play' || !_s || _s.over) return;
    _autosave();
    _mode = 'trick'; _paused = false; _ptr = null; _stick = { x: 0, y: 0 }; $('tp-stick').hidden = true;
    _hud_show(false);
    _sfx('go');
    _lairCard();
}
export const enterLair = enterTrials;
function _lairCard() {
    if (_trial) { _trial.dispose(); _trial = null; }
    _paused = false; _hud_show(false);
    const total = LL.CHAMBERS.reduce((n, c) => n + _starsOf(c.id).filter(Boolean).length, 0);
    _card(`<div class="tp-title bfont">🐙 OLD INK'S LAIR</div>
        <div class="tp-sub">Old Ink the octopus has stolen the <b>Tide Pearl</b> that kept the planet's tides gentle. His lair lies under this hut, and his gulls keep watch.</div>
        <div class="tp-sub">You carry up to <b>3 coconuts</b>. <b>Hold 🥥 and let go to throw</b> one, <b>walk into it</b> to pick it up, <b>jump on it</b> to bounce. They float, they plug, they weigh things down.</div>
        <div class="tp-stat">${total}/${LL.CHAMBERS.length * 3} ⭐ · a first clear pays 🐚, each new star ${PER_STAR} ✨</div>
        <div class="tp-sub">${LL.ALL_OPEN ? '🔓 all open while testing' : ''}</div>
        <div class="tp-lvls">${LL.CHAMBERS.map((c, i) => (i === 0 || LL.CHAMBERS[i - 1].world !== c.world ? `<div class="tp-sub" style="margin:4px 0 0"><b>WORLD ${c.world}</b> · ${c.world === 3 ? 'the volcano' : c.world === 2 ? 'the coral caves' : 'the island'}<br><small>${c.world === 3 ? 'Beaten twice, Old Ink gave the pearl to the Hermit King.' : c.world === 2 ? 'Beaten, Old Ink fled down a sinkhole with it.' : 'Old Ink stole the Tide Pearl from your island\'s shrine.'}</small></div>` : '') + (() => { const open = LL.ALL_OPEN || i === 0 || _starsOf(LL.CHAMBERS[i - 1].id)[0]; return `<button class="tp-lvl" data-do="trial" data-arg="${i}"${open ? '' : ' disabled'}><b class="bfont">${open ? i + 1 : '🔒'}</b><span>${c.name}${c.boss ? ' 🐙' : ''}</span><i>${_starText(_starsOf(c.id))}</i></button>`; })()).join('')}
            <div class="tp-sub" style="opacity:.7">More of World 3 soon…</div></div>
        <button class="go-btn bfont tp-alt" data-do="city" id="btn-tp-city">‹ BACK TO THE CITY</button>`, true);
}
/** Start chamber i (0-based). */
export function playTrial(i) {
    const lv = LL.CHAMBERS[i];
    if (!lv || !_gl || _mode !== 'trick') return null;
    if (!LL.ALL_OPEN && i > 0 && !_starsOf(LL.CHAMBERS[i - 1].id)[0]) return null;      // (locked until the chamber before it is cleared)
    if (_trial) _trial.dispose();
    _paused = false; _hintN = 0; $('tp-over').hidden = true;
    const kit = { T, renderer: _gl.renderer, toon: Y, crab: color => _crab(color, 0.62, null, true), pose: _crabPose, skin: skin().color };
    const hooks = { say: _say, hint: _hintNow, sfx: _sfx, buzz: _buzz, pop: (v, text) => _popAt(v, text, _trial?.camera), won: s => _lairWon(lv, s),
        // a chamber with a moon: when the crab lands in the other world, that world's screen takes over, with the same state
        travel: st => { const nx = createLair(kit, st.w ? lv.moon : lv, hooks, st); nx.base = lv; if (_trial) _trial.dispose(); _trial = nx; _lastHud = ''; } };
    _trial = createLair(kit, lv, hooks); _trial.base = lv;
    $('tp-trial').hidden = false; $('tp-acts').hidden = false; $('tp-goal').hidden = false; $('tp-top').hidden = false; $('tp-top').classList.add('trial'); $('btn-tp-hint').hidden = false;
    _lastHud = '';
    _say(`🐙 ${lv.name}`, '#fde047');
    _hintNow(lv.story, 5);
    return _trial;
}
export const playLair = playTrial;
/** The throw button in the lair: down winds up, up throws. */
export function holdThrow(on) { if (_mode === 'trick' && _trial && !_paused) return _trial.hold(on); return null; }
/** The 💡 button: the next hint for this chamber. */
export function lairHint() { if (_mode !== 'trick' || !_trial) return; _hintN = Math.min((_trial.base || _trial.level).hints.length, _hintN + 1); _lastHud = ''; _sfx('tick'); }
function _lairHud() {
    const s = _trial.state(), lv = _trial.base || _trial.level, i = LL.CHAMBERS.indexOf(lv), k = _trial.charging(), n = LL.count(s);
    const hint = _hintT > 0 ? _hintMsg : '';
    const tp = LL.tidePhase(s.lv0 || lv, s.t), bs = s.boss, inkHp = bs && bs.state !== 'sleep' ? bs.hp : -1, inkSt = bs ? bs.state : '';
    const sig = [lv.id, n.held, n.loose, n.working, n.gull, s.falls, hint, _hintN, inkHp, inkSt, s.gold.length, tp ? tp.name + Math.ceil(tp.left) : '', inkSt === 'down' ? 1 : 0, k >= 0 ? Math.round(k * 20) : -1, s.crab.air].join('~');
    if (sig === _lastHud) return;
    _lastHud = sig;
    $('tp-trial-n').textContent = `🐙 ${i + 1}/${LL.CHAMBERS.length} ${lv.name}`;
    $('tp-trial-s').textContent = `${'🥥'.repeat(n.held)}${'▫️'.repeat(LL.CARRY - n.held)} ${n.held}/${LL.CARRY}${n.gull ? ' · 🐦 HAS ONE' : ''}${lv.gold ? ` · ✨🐚 ${s.gold.length}/${lv.gold.length}` : ''}${tp ? ` · 🌊 ${tp.name.toUpperCase()} ${Math.ceil(tp.left)}s` : ''}${inkHp >= 0 ? ` · 🐙 ${'❤️'.repeat(inkHp)}${'🖤'.repeat(Math.max(0, ((typeof lv.boss === 'object' && lv.boss.hits) || LL.BOSS.hits) - inkHp))}` : ''}${n.working ? ` · ${n.working} AT WORK` : ''}${s.falls ? ` · FALLS ${s.falls}` : ''}`;
    const goal = $('tp-goal'); goal.textContent = _hintN ? `💡 ${_hintN}/${lv.hints.length}: ${lv.hints[_hintN - 1]}` : inkSt === 'recover' ? '🎯 NOW! HIS HEAD IS OPEN: THROW!' : inkSt === 'hurt' ? '🥥 HIT! HE IS SHAKEN: DODGE': inkSt === 'down' ? '🎯 HE IS DOWN: TAKE THE PEARL (A COCONUT ON THE PLATE HOLDS THE FENCE OPEN)' : inkHp >= 0 ? '🔴 DODGE THE SLAM · THEN 🥥 AT HIS HEAD WHILE HIS ARM IS STUCK' : '🎯 REACH THE TIDE PEARL · 💡 FOR A HINT'; goal.classList.remove('tut'); goal.classList.add('wide');
    const ab = $('btn-tp-act'); ab.classList.remove('off', 'idle'); ab.hidden = false; ab.querySelector('span').textContent = '🥥'; ab.querySelector('small').textContent = n.held < 1 ? 'NONE' : k >= 0 ? 'LET GO!' : 'HOLD: THROW';
    ab.classList.toggle('off', n.held < 1 && k < 0);
    ab.style.setProperty('--k', k >= 0 ? k : 0);
    $('btn-tp-jump').classList.toggle('off', s.crab.air);
    $('tp-hint').textContent = hint;
}
function _lairWon(lv, s) {
    const save = sv(), had = _starsOf(lv.id), fast = lv.fast || FAST_S, st = [true, s.falls === 0, s.t <= fast], now = had.map((x, i) => x || st[i]);
    const fresh = now.filter(Boolean).length - had.filter(Boolean).length, first = !had[0], dust = fresh * PER_STAR, shells = first ? (lv.pay || FIRST_CLEAR) : 0;
    save.lair[lv.id] = now; save.dust += dust;
    save.gold = save.gold || {}; const gotGold = [...new Set([...(save.gold[lv.id] || []), ...s.gold])]; save.gold[lv.id] = gotGold; persist();
    _trialOwed += shells;
    Solo.bump('planetTrials', fresh);
    const next = LL.CHAMBERS[LL.CHAMBERS.indexOf(lv) + 1];
    _paused = true;
    _card(`<div class="tp-title bfont">${lv.boss ? '🔮 THE TIDE PEARL!' : '✨ CHAMBER CLEAR!'}</div>
        <div class="tp-sub">${lv.boss ? 'Old Ink sinks back into the dark, and the tides settle. For now…' : `${lv.name} is behind you. Deeper into the lair…`}</div>
        <div class="tp-big bfont">${_starText(st)}</div>
        <div class="tp-sub">${st[1] ? 'No falls' : `${s.falls} fall${s.falls === 1 ? '' : 's'} (none for a star)`} · ${st[2] ? 'quick' : `${Math.round(s.t)} s (under ${fast} for a star)`}</div>
        ${lv.gold ? `<div class="tp-sub">✨🐚 Golden shells: ${s.gold.length}/${lv.gold.length} this time · ${gotGold.length}/${lv.gold.length} found</div>` : ''}
        ${dust || shells ? `<div class="tp-dust bfont">${dust ? `+${dust} ✨` : ''}${shells ? ` +${shells} 🐚` : ''}</div>` : ''}
        ${next ? `<button class="go-btn bfont" data-do="trial" data-arg="${LL.CHAMBERS.indexOf(lv) + 1}" id="btn-tp-next">NEXT CHAMBER</button>` : '<div class="tp-stat">That was World 1. More worlds are coming!</div>'}
        <button class="go-btn bfont tp-alt" data-do="trial" data-arg="${LL.CHAMBERS.indexOf(lv)}">↻ AGAIN</button>
        <button class="go-btn bfont tp-alt tp-quiet" data-do="city" id="btn-tp-city">‹ BACK TO THE CITY</button>`);
}
function _backToCity() {
    if (_trial) { _trial.dispose(); _trial = null; }
    _mode = 'play'; _paused = false; _lastHud = ''; _last = performance.now();
    $('tp-over').hidden = true; $('tp-top').classList.remove('trial'); $('tp-goal').classList.remove('wide'); $('btn-tp-hint').hidden = true;
    $('btn-tp-act').style.removeProperty('--k'); $('btn-tp-act').hidden = false;
    _hud_show(true);
    if (_gl) { _gl.camP = null; _size(); }
    if (_trialOwed) { _s.shells += _trialOwed; _say(`🐙 THE LAIR PAID ${_trialOwed} 🐚`, '#fde047'); _trialOwed = 0; }
    _autosave();
}

/** Turn the camera round the crab (a radians) and tilt it (pitch: higher or lower). */
export function turnView(a, dpitch = 0) {
    _pitch = Math.max(-0.9, Math.min(0.9, _pitch + dpitch));
    if (_mode === 'play' && _s) L.turnView(_s, a);
    else if (_mode === 'trick' && _trial) _trial.look(a, dpitch);
}

// ── The buttons ─────────────────────────────────────────────────────────────
const NAMES = { palm: 'PALM', hut: 'HOME', tower: 'TOWER', market: 'MARKET' };
const _live = () => _mode === 'play' && _s && !_s.over && !_paused;
/** Build `kind` where the crab stands (what the button does). */
export function press(kind) {
    if (!_live() || !L.COST[kind]) return null;
    const c = L.canBuild(_s, kind);
    if (!c.ok) {
        const need = kind === 'tower' ? L.TOWNS[1] : L.TOWNS[3];
        _hintNow(c.why === 'locked' ? `🔒 ${NAMES[kind]}S OPEN WHEN YOU'RE A ${need.name} (${need.pop} CRABS)` : c.why === 'space' ? 'TOO CLOSE TO SOMETHING: STEP AWAY' : 'NOT ENOUGH YET', 1.8); _sfx('tick'); return null;
    }
    const ev = [], b = L.build(_s, kind, ev);
    _sfx('land_good'); _buzz(14);
    _burst(b.p, 0xfff2a8, 14, 3);
    if (kind === 'hut') _pop(b.p, '+1 🦀', 1.6);
    _events(ev);
    return b;
}
export function pressJump() {
    if (_mode === 'trick') return !!(_trial && !_paused && _trial.jump());
    if (!_live() || !L.jump(_s)) return false;
    _sfx('swap'); _buzz(8);
    return true;
}
/** The action button: whatever is to hand. */
export function pressAct() {
    if (!_live()) return null;
    const x = L.context(_s);
    if (!x) { _hintNow('NOTHING TO DO HERE: TRY NEXT TO A PALM, A HOME OR A ROCK', 1.8); return null; }
    if (!x.ok) { _hintNow('NOT ENOUGH YET', 1.4); _sfx('tick'); return null; }
    const ev = [], e = L.act(_s, ev);
    _events(ev);
    return e;
}
function _hintNow(msg, secs) { _hintMsg = msg; _hintT = secs; }
// The two-thumb cue: faint labels on each half until each thumb has been used once (remembered).
const _ctl = { stick: false, look: false };
function _zones() {
    const z = $('tp-zones'); if (!z) return;
    const shown = (_mode === 'play' || (_mode === 'trick' && _trial)) && !_paused && !_auto && !sv().seen.ctl;
    if (shown && _ctl.stick && _ctl.look) { sv().seen.ctl = 1; persist(); }
    z.hidden = !shown || !!sv().seen.ctl;
    if (!z.hidden) { z.children[0].style.opacity = _ctl.stick ? 0.15 : 1; z.children[1].style.opacity = _ctl.look ? 0.15 : 1; }
}
/** A tip, shown the first time only (and remembered). */
function _tip(key, text) {
    if (_mode !== 'play' || sv().seen[key]) return;
    sv().seen[key] = 1; persist();
    _tips.push(text);
}

// ── The frame ───────────────────────────────────────────────────────────────
function _frame(dt) {
    _t += dt;
    if (_mode === 'trick') {
        if (_keys.tl || _keys.tr) turnView(((_keys.tl ? 1 : 0) - (_keys.tr ? 1 : 0)) * 1.8 * dt);
        _zones();
        _shake = 0;
        if (_banner && _t > _banner) { _banner = 0; $('tp-banner').classList.remove('on'); }
        _hintT = Math.max(0, _hintT - dt);
        if (_trial) {
            let stick = _stick;
            if (_keys.l || _keys.r || _keys.u || _keys.d) stick = { x: (_keys.r ? 1 : 0) - (_keys.l ? 1 : 0), y: (_keys.u ? 1 : 0) - (_keys.d ? 1 : 0) };
            _trial.frame(_paused ? 0 : dt, stick);
            _lairHud();
        } else if (_gl) _draw(0);
        return;
    }
    const s = _s;
    if (s && !s.over && !_paused) {
        for (let n = 0; n < _speed; n++) {
            let stick = _stick;
            if (_keys.l || _keys.r || _keys.u || _keys.d) stick = { x: (_keys.r ? 1 : 0) - (_keys.l ? 1 : 0), y: (_keys.u ? 1 : 0) - (_keys.d ? 1 : 0) };
            if (_auto) {
                const a = L.autopilot(s); stick = a;
                if (_mode === 'play') { if (a.build) press(a.build); if (a.act) pressAct(); if (a.jump) pressJump(); }
                else { const ev = []; if (a.build) L.build(s, a.build, ev); if (a.act) L.act(s, ev); if (a.jump) L.jump(s); _events(ev); }
            }
            _events(L.step(s, dt, stick));
            if (s.over) break;
        }
    }
    if (_mode === 'menu' && s && (s.over || s.day > 12)) _menu();          // the demo island starts over
    if (_mode === 'play' && s.over && !_overAt) _overAt = _t + 1.7;
    if (_overAt && _t >= _overAt && _mode === 'play') { _overAt = 0; _end(); }
    _visR += (s.R - _visR) * Math.min(1, dt * 1.6);
    _nightK += ((s.phase === 'night' ? 1 : 0) - _nightK) * Math.min(1, dt * 1.4);
    _shake = Math.max(0, _shake - dt * 2.4); _cheer = Math.max(0, _cheer - dt);
    if (_banner && _t > _banner) { _banner = 0; $('tp-banner').classList.remove('on'); }
    _hintT = Math.max(0, _hintT - dt);
    if (_mode === 'play') { _watch(); _hud(dt); }
    if (_keys.tl || _keys.tr) turnView(((_keys.tl ? 1 : 0) - (_keys.tr ? 1 : 0)) * 1.8 * dt);
    _zones();
    if (_gl) _draw(_paused ? 0 : dt);
}

// Things worth a word the first time they're near.
function _watch() {
    const s = _s, c = s.crab;
    if (s.items.some(i => i.kind === 'rock' && L.dist(s, i.p, c.p) < 3.5)) _tip('rock', '🪨 A ROCK. ✋ picks it up; ✋ again throws it at a falling star, even a big red one.');
    if (s.course && !s.course.done && L.dist(s, s.course.pts[0], c.p) < 4.5) _tip('course', '🪵 A BOARDWALK. Up the ramp and along the planks: ⬆️ JUMP the gaps and the low red bars, wait for the tall purple ones to swing past. The chillies on the sign say how hard it is; harder ones pay ✨ too.');
    if (s.stars.some(x => x.big)) _tip('big', '☄️ A RED RING can\'t be caught. Get clear, let a 🔮 tower take it, or throw a 🪨 at it.');
    const hutT = s.builds.find(b => b.kind === 'trick');
    if (hutT && L.dist(s, hutT.p, c.p) < 4) _tip('trick', '🐙 THE TRICK HUT is the way into Old Ink\'s lair: a puzzle planet where you throw coconuts and bounce on them. It pays shells and stardust.');
    const x = L.context(s);
    if (x && x.kind === 'bigger' && x.ok) _tip('bigger', '🏠 ✋ here makes this home bigger: one more crab, for less than a new home.');
    if (x && x.kind === 'shake') _tip('shake', '🌴 ✋ here shakes the palm: a coconut drops at once.');
    if (s.items.some(i => i.kind === 'gold' && L.dist(s, i.p, c.p) < 4)) _tip('gold', `✨ A GOLDEN SHELL is worth ${L.GOLD}.`);
}

function _events(evs) {
    const play = _mode === 'play';
    for (const e of evs) {
        if (e.type === 'pick') {
            const g = e.item.kind === 'gold';
            _burst(e.item.p, g ? 0xffd84a : e.item.kind === 'nut' ? 0xb07a4a : 0xffc9de, g ? 16 : 7, g ? 4 : 2.4);
            if (play) { _pop(e.item.p, e.item.kind === 'nut' ? '+1 🥥' : g ? `+${L.GOLD} 🐚` : '+1 🐚'); _sfx(g ? 'coin_gain' : 'tick'); _buzz(6); }
        } else if (e.type === 'gift') { if (play) _pop(e.b.p, `+${e.pay || 1} 🐚`, 1.3); }
        else if (e.type === 'grown') { _burst(e.b.p, 0x7be38a, 12, 3); if (play) { _pop(e.b.p, '🌴 GROWN!', 1.6); _sfx('land_good'); } }
        else if (e.type === 'night') { if (play) { _say(e.big ? `🌙 NIGHT ${_s.day} · ☄️ A BIG ONE IS COMING!` : `🌙 NIGHT ${_s.day} · ${e.stars} STAR${e.stars === 1 ? '' : 'S'}`, '#c7d2fe'); _sfx('boost'); } }
        else if (e.type === 'catch') {
            _burst(e.p, e.perfect ? 0xffffff : 0xfff08a, e.perfect ? 40 : 26, e.perfect ? 6.5 : 5); _cheer = 0.45;
            if (play) { _pop(e.p, e.perfect ? `✨ PERFECT! +${e.pay} 🐚` : `🌠 CAUGHT! +${e.pay} 🐚`, 1.2); _sfx(e.perfect ? 'win' : 'coin_gain'); _buzz([12, 20, 30]); if (!e.perfect) _tip('perfect', '⬆️ JUMP just as a star lands for a PERFECT catch: double the shells.'); }
        } else if (e.type === 'shield') { _burst(e.p, 0x8fe8ff, 20, 4.5); const v = _vis.builds.get(e.tower.id); if (v) v.flash = 1; if (play) { _sfx('shield'); _buzz(10); } }
        else if (e.type === 'impact') {
            _burst(e.p, e.big ? 0xff6a4a : 0xffb347, e.big ? 46 : 24, e.big ? 7 : 5); _shake = Math.max(_shake, e.big ? 1 : 0.5);
            for (const h of e.hit) { _burst(h.b.p, 0x8a6a4a, h.gone ? 22 : 8, 4); if (play) _pop(h.b.p, h.gone ? (h.b.kind === 'hut' ? `💥 −${h.b.lvl} 🦀` : '💥') : '🔧 CRACKED', 1.4); }
            if (play) { if (e.ouch) _pop(_s.crab.p, `OUCH! −${e.ouch} 🐚`, 1.2); _sfx('land_bad'); _buzz(e.hit.length || e.ouch ? [40, 30, 40] : 10); if (e.hit.some(h => !h.gone)) _tip('mend', '🔧 A crack! Stand by it and press ✋ to mend it.'); }
        } else if (e.type === 'dawn') {
            if (play) { _say(`☀️ DAY ${e.day}`, '#fde047'); _sfx('land_good'); if (e.gift) _pop(_s.crab.p, `THE CITY BROUGHT ${e.gift} 🐚`, 1.5); _autosave(); }
        } else if (e.type === 'town') {
            _shake = Math.max(_shake, 0.4); _burst(_s.crab.p, 0xffffff, 40, 7); _burst(_s.crab.p, 0xffd84a, 30, 5); _cheer = 0.8;
            if (play) { _say(`${e.icon} YOU'RE A ${e.name}! THE PLANET GREW`, '#fde047'); _sfx('win'); _buzz([30, 30, 30, 30, 120]); if (e.opens) _tips.push(`${e.icon} ${e.name}! New: ${e.opens}.`); }
        } else if (e.type === 'towerup') { _burst(e.b.p, 0x8fe8ff, 28, 5); const v = _vis.builds.get(e.b.id); if (v) v.flash = 1; if (play) { _pop(e.b.p, `🔮 LEVEL ${e.lvl}: +${L.TOWER_GROW_C} 🔮, WIDER`, 1.8); _sfx('land_good'); _buzz(14); } }
        else if (e.type === 'bigger') { _burst(e.b.p, 0xfff2a8, 20, 4); const v = _vis.builds.get(e.b.id); if (v) v.born = 0.5; if (play) { _pop(e.b.p, '+1 🦀', 1.8); _sfx('land_good'); _buzz(14); } }
        else if (e.type === 'mend') { _burst(e.b.p, 0x9be7ff, 12, 3); if (play) { _pop(e.b.p, '🔧 MENDED', 1.4); _sfx('shield'); _buzz(12); } }
        else if (e.type === 'shake') { const v = _vis.builds.get(e.b.id); if (v) v.shook = 0.5; _burst(e.b.p, 0x7be38a, 8, 3); if (play) { _sfx('dice_land'); _buzz(10); } }
        else if (e.type === 'carry') { if (play) { _sfx('tick'); _buzz(8); _hintNow('🪨 GOT IT. ✋ THROWS IT AT A FALLING STAR', 2.2); } }
        else if (e.type === 'smash') {
            const v = _vis.stars.get(e.star.id), at = v ? v.rock.position.clone() : _at(e.p, 6);
            _burstAt(at, e.big ? 0xff6a4a : 0xfff08a, e.big ? 50 : 30, 6); _shake = Math.max(_shake, 0.3); _thrown = { from: _at(_s.crab.p, 1), to: at, t: 0 };
            if (play) { _pop(e.p, `🪨 SMASHED! +${e.pay} 🐚`, 2.4); _sfx('land_good'); _buzz([20, 20, 40]); }
        } else if (e.type === 'on') { if (play && !e.at) { const co = e.course, tr = L.TIERS[co.tier]; _sfx('swap'); _hintNow(`${tr.icon} ${tr.name} BOARDWALK · CHEST ${co.prize} 🐚${co.dust ? ` + ${co.dust} ✨` : ''}`, 2.6); } }
        else if (e.type === 'crack') { if (play) _sfx('tick'); }
        else if (e.type === 'spring') { _burst(e.p, 0xff7a9a, 14, 4); if (play) { _sfx('boost'); _buzz(12); _pop(e.p, 'BOING!', 1.6); } }
        else if (e.type === 'check') { _burst(e.p, 0x4ade80, 18, 4); if (play) { _sfx('land_good'); _buzz(10); _pop(e.p, '🚩 CHECKPOINT', 1.8); } }
        else if (e.type === 'coin') { _burst(e.p, 0xffd84a, 8, 3); if (play) { _pop(e.p, '+1 🐚', 1.4); _sfx('coin_gain'); _buzz(6); } }
        else if (e.type === 'fell') { if (play) { const back = e.at ? 'BACK AT THE FLAG' : 'BACK AT THE START'; _sfx('land_bad'); _buzz([20, 20, 20]); if (e.why !== 'side') _shake = Math.max(_shake, 0.3);
            _hintNow(e.why === 'gap' ? `INTO THE GAP! ⬆️ JUMP IT · ${back}` : e.why === 'sweep' ? `BONK! WATCH THE ARM COME ROUND · ${back}` : e.why === 'crumble' ? `IT CRUMBLED! KEEP MOVING · ${back}` : 'OFF THE PLANKS: STEP BACK ON AT THE RAMP OR THE LAST FLAG', 2.4); } }
        else if (e.type === 'chest') { _burst(e.p, 0xffd84a, 46, 6); _cheer = 0.7; if (play) { _say(`🎁 COURSE DONE! +${e.prize} 🐚${e.dust ? ` +${e.dust} ✨` : ''}`, '#fde047'); _sfx('win'); _buzz([30, 30, 80]); } }
        else if (e.type === 'trick') { if (play && !_auto) enterTrials(); }
        else if (e.type === 'over') { _shake = 1; if (play) { _say('THE LAST HOME IS GONE…', '#fca5a5'); _buzz([60, 40, 120]); } }
    }
}
let _thrown = null, _actPtr = null;

function _say(text, color) { const b = $('tp-banner'); if (!b) return; b.textContent = text; b.style.color = color; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); _banner = _t + 2.6; }

function _hud(dt) {
    const s = _s, n = L.pop(s), g = L.goal(s), x = L.context(s);
    // Tips, one at a time.
    if (_tipT > 0) { _tipT -= dt; if (_tipT <= 0) $('tp-tip').hidden = true; }
    else if (_tips.length && !_paused) { const t = $('tp-tip'); t.textContent = _tips.shift(); t.hidden = false; _tipT = 5.5; }
    const clock = s.phase === 'day' ? s.pt / L.DAY_S : Math.min(1, s.pt / L.nightLen(s.day));
    const btn = ['palm', 'hut', 'tower', 'market'].map(k => { const c = L.costOf(s, k), ok = L.canBuild(s, k); return `${c.shells}🐚${c.nuts ? ` ${c.nuts}🥥` : ''}|${ok.ok ? 1 : ok.why === 'locked' ? 3 : ok.why === 'space' ? 2 : 0}`; });
    const hint = _hintT > 0 ? _hintMsg : '';
    const sig = [s.day, s.phase, Math.round(clock * 100), s.shells, s.nuts, n, s.town, btn.join(), hint, g.text, x ? x.kind + x.label + x.ok : '', s.crab.air > 0 ? 1 : 0].join('~');
    if (sig === _lastHud) return;
    _lastHud = sig;
    $('tp-pop').textContent = `🦀 ${n}`; $('tp-town').textContent = `${L.TOWNS[s.town].icon} ${L.TOWNS[s.town].name}`;
    $('tp-day').textContent = `${s.phase === 'day' ? '☀️ DAY' : '🌙 NIGHT'} ${s.day}`;
    $('tp-clock').style.width = `${clock * 100}%`; $('tp-clock').parentElement.classList.toggle('night', s.phase === 'night');
    $('tp-shells').textContent = s.shells; $('tp-nuts').textContent = s.nuts;
    const goal = $('tp-goal'); goal.textContent = `🎯 ${g.text}`; goal.classList.toggle('tut', g.tut);
    _el.querySelectorAll('#tp-bar [data-build]').forEach((b, i) => {
        const [cost, st] = btn[i].split('|');
        b.hidden = st === '3' && i === 3 && s.town < 2;            // the market shows up once it's nearly in reach
        b.querySelector('small').textContent = st === '3' ? `🔒 ${i === 2 ? L.TOWNS[1].name : L.TOWNS[3].name}` : cost;
        b.classList.toggle('off', st !== '1'); b.classList.toggle('crowd', st === '2'); b.classList.toggle('locked', st === '3');
    });
    const ab = $('btn-tp-act');
    ab.classList.toggle('off', !x || !x.ok); ab.classList.toggle('idle', !x);
    ab.querySelector('span').textContent = x ? x.icon : '✋'; ab.querySelector('small').textContent = x ? x.label : '';
    $('btn-tp-jump').classList.toggle('off', s.crab.air > 0);
    $('tp-hint').textContent = hint;
}

// ── Floating words (DOM, over the canvas) ───────────────────────────────────
const _pop = (p, text, lift = 0.9) => { if (_gl) _popAt(_at(p, lift), text, _gl.camera); };
function _popAt(world, text, cam) {
    const host = $('tp-pops'); if (!host || !cam) return;
    const v = world.clone().project(cam);
    if (v.z > 1) return;
    const d = document.createElement('div'); d.className = 'tp-pop'; d.textContent = text;
    d.style.left = `${Math.max(12, Math.min(88, (v.x * 0.5 + 0.5) * 100))}%`; d.style.top = `${Math.max(14, Math.min(80, (-v.y * 0.5 + 0.5) * 100))}%`;
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
// The city in the game's cartoon style (Toon.js): each plain material gets a toon twin (made once, so a swap or a recolour of the
// plain one can be passed on to it), and each mesh an ink outline (one outline shape per geometry, shared).
const _twins = new Map(), _hulls = new Map();
const _tw = m => { if (!Y || !m || !m.isMeshLambertMaterial) return m; let w = _twins.get(m); if (!w) { const em = m.emissive && m.emissive.getHex(); w = Y.toon(m.color.getHex(), em ? { emissive: m.emissive.clone() } : {}); _twins.set(m, w); } return w; };
function _inkify(root, thick = 0.045) {
    if (!Y) return root; const list = []; root.traverse(o => { if (o.isMesh && o.material && o.material.isMeshLambertMaterial && !o.userData.noInk && !o.userData.inked) list.push(o); });
    for (const o of list) { o.material = _tw(o.material); o.userData.inked = true;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const sc = Math.max(o.scale.x, o.scale.y, o.scale.z); if (o.geometry.boundingSphere.radius * sc < 0.22) continue;      // (small bits: toon, but no outline: phones draw every outline)
        const key = o.geometry.uuid + ':' + thick; let h = _hulls.get(key); if (!h) { h = Y.hull(o.geometry, thick); _hulls.set(key, h); } const line = new T.Mesh(h, Y.ink); line.renderOrder = -1; o.add(line); }
    return root;
}
const _mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); return m; };

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

    // The crab, its shadow, and the rock it may be holding.
    const crab = _crab(0xff5a4d, 0.62, null, true); scene.add(crab.g);
    const shadow = new T.Mesh(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.geometry.rotateX(-Math.PI / 2); scene.add(shadow);

    // Tufts of grass, so the ground has something to walk past.
    const deco = [];
    const tuft = new T.ConeGeometry(0.09, 0.34, 4), tm = _lam(0x3fae5a);
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) {
        const z = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - z * z), p = [r * Math.cos(a), z, r * Math.sin(a)];
        const m = new T.Mesh(tuft, tm);
        m.scale.setScalar(0.7 + rnd() * 0.9); scene.add(m); deco.push({ m, p, lift: 0.12, f: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5] });
    }

    // Sparks: one pool of points for every burst.
    const N = 360, pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3).fill(9999), 3));
    pg.setAttribute('color', new T.BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = new T.Points(pg, new T.PointsMaterial({ size: 0.26, vertexColors: true, transparent: true, depthWrite: false }));
    sparks.frustumCulled = false; scene.add(sparks);

    // Shared shapes for everything that's built, found or falls.
    const G = {
        trunk: new T.CylinderGeometry(0.09, 0.14, 0.5, 6), leaf: new T.ConeGeometry(0.22, 1.0, 4), nut: new T.SphereGeometry(0.17, 9, 7), nutCap: new T.SphereGeometry(0.1, 7, 5),
        wall: new T.CylinderGeometry(0.5, 0.56, 0.6, 10), roof: new T.ConeGeometry(0.78, 0.7, 10), door: new T.BoxGeometry(0.22, 0.34, 0.06), win: new T.BoxGeometry(0.16, 0.16, 0.05),
        pole: new T.CylinderGeometry(0.025, 0.025, 0.7, 5), flag: new T.BoxGeometry(0.3, 0.18, 0.02), hat: new T.ConeGeometry(0.22, 0.42, 7),
        base: new T.CylinderGeometry(0.42, 0.5, 0.22, 8), post: new T.CylinderGeometry(0.1, 0.2, 1.3, 8), gem: new T.OctahedronGeometry(0.3, 0), dome: new T.SphereGeometry(L.TOWER_R, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        stall: new T.BoxGeometry(1.1, 0.5, 0.7), awn: new T.BoxGeometry(0.26, 0.08, 0.95), leg: new T.BoxGeometry(0.07, 0.6, 0.07), coin: new T.CylinderGeometry(0.19, 0.19, 0.06, 14),
        shell: new T.ConeGeometry(0.2, 0.34, 9), shellTip: new T.SphereGeometry(0.1, 7, 5), rock: new T.DodecahedronGeometry(0.3, 0),
        ring: new T.RingGeometry(0.9, 1, 36), disc: new T.CircleGeometry(1, 28), star: new T.IcosahedronGeometry(0.34, 0), tail: new T.ConeGeometry(0.2, 2.6, 8), fix: new T.SphereGeometry(0.14, 6, 5),
        bar: new T.BoxGeometry(1.7, 0.16, 0.16), paddle: new T.BoxGeometry(1.7, 1.7, 0.14),
        plank: new T.BoxGeometry(0.95, 0.1, 0.95), bridge: new T.BoxGeometry(0.7, 0.08, 1), stilt: new T.CylinderGeometry(0.06, 0.06, 1, 5), chest: new T.BoxGeometry(0.6, 0.4, 0.42), lid: new T.BoxGeometry(0.64, 0.14, 0.46),
    };
    G.ring.rotateX(-Math.PI / 2); G.disc.rotateX(-Math.PI / 2); G.tail.rotateX(-Math.PI / 2); G.tail.translate(0, 0, -1.4); G.coin.rotateX(Math.PI / 2);
    const M = {
        trunk: _lam(0x9a6b3f), leaf: _lam(0x3fae5a), nut: _lam(0x7a4a26), nutCap: _lam(0x3f2a16), wall: _lam(0xf0dcae), wall2: _lam(0xffe9c4), roof: _lam(0xc9853f), roof2: _lam(0xe0563f), roof3: _lam(0x5a8de0), hurt: _lam(0x8a6a55), door: _lam(0x6b4423),
        win: new T.MeshBasicMaterial({ color: 0xfff3a0 }), flag: _lam(0xff4d6d), post: _lam(0xdfe8f5), stone: _lam(0x9aa3b5), gem: new T.MeshBasicMaterial({ color: 0x8fe8ff }), gemOff: _lam(0x6b7a90),
        stall: _lam(0xd9a066), awnA: _lam(0xff5a5a), awnB: _lam(0xfff8ee), coin: new T.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x8a6200, flatShading: true }),
        shell: _lam(0xff9ec4), shellTip: _lam(0xfff1f6), gold: new T.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x8a6200, flatShading: true }), rock: _lam(0x7d8597), fix: new T.MeshBasicMaterial({ color: 0xff5a5a }),
        star: new T.MeshBasicMaterial({ color: 0xfff3a0 }), big: new T.MeshBasicMaterial({ color: 0xff7a4a }), trick: _lam(0x9b5de5), chilli: _lam(0xe11d48), spring: _lam(0xff4d6d), crumble: _lam(0xe7c9a0), lowBar: _lam(0xff5a4d), tallBar: _lam(0x7c3aed), flagOff: _lam(0xf5f5f5), flagOn: _lam(0x4ade80), wood: _lam(0xb9824d), wood2: _lam(0x8f6238), chest: _lam(0x8a5a2b), band: _lam(0xffd84a),
    };
    const held = _mesh(G.rock, M.rock); held.visible = false; scene.add(held);
    const reach = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.4, depthWrite: false, side: T.DoubleSide })); reach.scale.setScalar(L.TOWER_R); reach.visible = false; scene.add(reach);
    const flying = _mesh(G.rock, M.rock); flying.visible = false; scene.add(flying);
    return { renderer, scene, camera, hemi, sun, planet, rim, stars, far, crab, shadow, deco, sparks, pool: Array.from({ length: N }, () => ({ life: 0, v: [0, 0, 0] })), next: 0, G, M, tm, held, flying, reach, camP: null };
}

// A crab from balls and sticks: body, eyes on stalks, two claws, six legs.
// hat: a party hat in that colour (the city's crabs wear them).
function _crab(color, scale, hat = null, ink = false) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const shell = _lam(color), dark = _lam(new T.Color(color).multiplyScalar(0.72).getHex());
    const b = _mesh(new T.SphereGeometry(0.5, 12, 9), shell, 0, 0.42, 0); b.scale.set(1.15, 0.62, 0.9); body.add(b);
    const eyes = [-1, 1].map(k => { const e = new T.Group(); e.add(_mesh(new T.CylinderGeometry(0.04, 0.04, 0.28, 5), dark, 0, 0.14, 0)); e.add(_mesh(new T.SphereGeometry(0.11, 8, 6), new T.MeshLambertMaterial({ color: 0xffffff }), 0, 0.32, 0)); e.add(_mesh(new T.SphereGeometry(0.055, 6, 5), new T.MeshBasicMaterial({ color: 0x1a1024 }), 0, 0.33, 0.085)); e.position.set(k * 0.2, 0.62, 0.26); body.add(e); return e; });
    const claws = [-1, 1].map(k => { const a = new T.Group(); a.add(_mesh(new T.CylinderGeometry(0.05, 0.05, 0.32, 5), dark, 0, 0.16, 0)); const c = _mesh(new T.SphereGeometry(0.19, 9, 7), shell, 0, 0.4, 0); c.scale.set(0.8, 1.15, 0.8); a.add(c); a.position.set(k * 0.56, 0.42, 0.24); a.rotation.z = -k * 0.7; body.add(a); return a; });
    const legs = [];
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) { const l = _mesh(new T.BoxGeometry(0.36, 0.06, 0.06), dark, k * 0.56, 0.2, 0.18 - i * 0.2); l.rotation.z = -k * 0.5; body.add(l); legs.push({ l, k, i }); }
    const mats = [shell, dark];
    if (hat != null) { const hm = _lam(hat); mats.push(hm); const hc = _mesh(new T.ConeGeometry(0.24, 0.5, 7), hm, 0, 0.98, -0.02); body.add(hc); }
    g.scale.setScalar(scale);
    if (ink && Y) {
        // the player's own crab is drawn in the game's ink-outlined style (villagers stay plain: there can be fifty of them)
        Y.inkify(g, 0.1);
        const kinds = new Map(); g.traverse(o => { if (o.isMesh && o.material && o.material.isMeshToonMaterial) kinds.set(o.material.color.getHex(), o.material); });
        return { g, body, claws, legs, eyes, shell: kinds.get(shell.color.getHex()) || shell, dark: kinds.get(dark.color.getHex()) || dark, mats, phase: 0 };
    }
    return { g, body, claws, legs, eyes, shell, dark, mats, phase: 0 };
}
function _crabPose(c, dt, moving, cheer, lift = 0) {
    if (moving) c.phase += dt * 16;
    c.legs.forEach(({ l, k, i }) => { l.rotation.y = moving ? Math.sin(c.phase + i * 2.1 + (k > 0 ? 0 : 3.14)) * 0.5 : 0; });
    c.body.position.y = (moving ? Math.abs(Math.sin(c.phase * 0.5)) * 0.05 : Math.sin(_t * 2.2) * 0.02) + cheer * 0.9 + lift;
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
    _gl.rim.material.color.setHex(th.rim); _gl.M.leaf.color.setHex(th.leaf); _tw(_gl.M.leaf).color.setHex(th.leaf); _gl.tm.color.setHex(th.leaf);
    const k = skin().color; _gl.crab.shell.color.setHex(k); _gl.crab.dark.color.copy(new T.Color(k).multiplyScalar(0.72));
}

function _dropBuild(v) { const g = _gl; g.scene.remove(v.g); (v.vils || []).forEach(c => { g.scene.remove(c.g); c.mats.forEach(m => m.dispose()); }); if (v.dome) v.dome.material.dispose(); }
function _dropCourse() { if (_courseVis && _gl) _courseVis.parts.forEach(q => _gl.scene.remove(q.m)); _courseVis = null; }
function _clearVis() {
    if (_gl) {
        _vis.builds.forEach(_dropBuild);
        _vis.items.forEach(v => _gl.scene.remove(v.g));
        _vis.stars.forEach(v => { _gl.scene.remove(v.g); _gl.scene.remove(v.rock); });
        _dropCourse(); _gl.held.visible = false; _gl.flying.visible = false;
    }
    Object.values(_vis).forEach(m => m.clear()); _thrown = null;
    const host = $('tp-pops'); if (host) host.innerHTML = '';
}

function _burstAt(o, color, n, speed, up = null) {
    if (!_gl) return;
    const g = _gl, pos = g.sparks.geometry.attributes.position, col = g.sparks.geometry.attributes.color, c = new T.Color(color);
    for (let i = 0; i < n; i++) {
        const k = g.next = (g.next + 1) % g.pool.length, q = g.pool[k];
        const d = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        if (up) d.addScaledVector(up, 0.9).normalize();
        d.multiplyScalar(speed * (0.4 + Math.random() * 0.8));
        q.life = 0.5 + Math.random() * 0.5; q.v = [d.x, d.y, d.z];
        pos.setXYZ(k, o.x, o.y, o.z); col.setXYZ(k, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}
const _burst = (p, color, n, speed) => { if (_gl) _burstAt(_at(p, 0.3), color, n, speed, V(p)); };

const HATS = [0xffa24d, 0xff7ab8, 0x7ac8ff, 0xb6e36a, 0xc59bff, 0xffe15a];
function _buildVis(b) {
    const { G, M } = _gl, g = new T.Group(), v = { g, kind: b.kind, born: 0, flash: 0, shook: 0 };
    if (b.kind === 'palm') {
        const top = new T.Group();
        for (let i = 0; i < 4; i++) { const t = _mesh(G.trunk, M.trunk, i * 0.05, 0.25 + i * 0.44, 0); t.rotation.z = -0.1; t.scale.setScalar(1 - i * 0.1); g.add(t); }
        for (let i = 0; i < 6; i++) { const lf = new T.Group(), m = _mesh(G.leaf, M.leaf, 0, 0, 0.5); m.rotation.x = Math.PI / 2 + 0.55; m.scale.set(1, 1, 0.35); lf.add(m); lf.rotation.y = (i / 6) * Math.PI * 2; top.add(lf); }
        v.nuts = [0, 1].map(i => { const n = _mesh(G.nut, M.nut, i ? 0.16 : -0.14, -0.14, i ? 0.08 : -0.06); n.scale.setScalar(0.8); top.add(n); return n; });
        top.position.set(0.2, 1.86, 0); g.add(top); v.top = top;
    } else if (b.kind === 'hut') {
        // One home, three sizes: a hut; a hut with a lean-to; two storeys and a flag.
        v.wall = _mesh(G.wall, M.wall, 0, 0.3, 0); g.add(v.wall);
        v.roof = _mesh(G.roof, M.roof, 0, 0.95, 0); g.add(v.roof);
        g.add(_mesh(G.door, M.door, 0, 0.2, 0.54));
        const w1 = _mesh(G.win, M.win, 0.3, 0.36, 0.44); w1.rotation.y = 0.6; g.add(w1);
        const two = new T.Group(); const a = _mesh(G.wall, M.wall2, 0.62, 0.22, -0.1); a.scale.set(0.62, 0.72, 0.62); two.add(a); const ar = _mesh(G.roof, M.roof2, 0.62, 0.62, -0.1); ar.scale.set(0.62, 0.6, 0.62); two.add(ar); g.add(two);
        const three = new T.Group(); const u = _mesh(G.wall, M.wall2, 0, 0.86, 0); u.scale.set(0.78, 0.8, 0.78); three.add(u); const ur = _mesh(G.roof, M.roof3, 0, 1.42, 0); ur.scale.set(0.84, 0.9, 0.84); three.add(ur);
        three.add(_mesh(G.win, M.win, 0, 0.9, 0.42)); three.add(_mesh(G.pole, M.post, 0, 2.05, 0)); three.add(_mesh(G.flag, M.flag, 0.16, 2.28, 0)); g.add(three);
        Object.assign(v, { two, three, vils: [] });
    } else if (b.kind === 'trick') {
        // The Trick Hut: a fat purple-roofed hut with a doorway and a coconut turning over it.
        const w = _mesh(G.wall, M.wall2, 0, 0.42, 0); w.scale.set(1.35, 1.4, 1.35); g.add(w);
        const r = _mesh(G.roof, M.trick, 0, 1.3, 0); r.scale.set(1.4, 1.25, 1.4); g.add(r);
        const d = _mesh(G.door, M.door, 0, 0.36, 0.74); d.scale.set(1.9, 1.9, 1); g.add(d);
        v.sign = new T.Group(); v.sign.add(new T.Mesh(G.nut, M.nut)); v.sign.add(_mesh(G.nutCap, M.nutCap, 0, 0.11, 0)); v.sign.scale.setScalar(1.7); v.sign.position.y = 2.5; g.add(v.sign);
        v.ring = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide })); v.ring.scale.setScalar(1.1); v.ring.position.y = 0.06; g.add(v.ring);
    } else if (b.kind === 'tower') {
        g.add(_mesh(G.base, M.stone, 0, 0.11, 0)); g.add(_mesh(G.post, M.post, 0, 0.8, 0));
        v.orb = _mesh(G.gem, M.gem, 0, 1.75, 0); g.add(v.orb);
        v.dome = new T.Mesh(G.dome, new T.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide })); g.add(v.dome);
    } else {
        g.add(_mesh(G.stall, M.stall, 0, 0.25, 0));
        for (const [x, z] of [[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.3], [0.5, -0.3]]) g.add(_mesh(G.leg, M.wood2, x, 0.72, z));
        for (let i = 0; i < 5; i++) { const a = _mesh(G.awn, i % 2 ? M.awnB : M.awnA, -0.52 + i * 0.26, 1.06, 0.06); a.rotation.x = 0.22; g.add(a); }
        v.sign = _mesh(G.coin, M.coin, 0, 1.5, 0); v.sign.scale.setScalar(1.5); g.add(v.sign);
    }
    if (b.kind !== 'palm' && b.kind !== 'trick') { v.fix = _mesh(G.fix, M.fix, 0, 2.5, 0); v.fix.visible = false; g.add(v.fix); }
    _inkify(g); _gl.scene.add(g);
    return v;
}

// The boardwalk: a ramp, planks on stilts, a bridge over each stretch that has
// one, and each stretch's obstacle: a sweeper's arm on a post beside it, a
// spring pad, a checkpoint flag; a coin over each plank still to come and a
// chest at the end.
function _buildCourse(co) {
    const { G, M } = _gl, parts = [], add = (m, p, f, lift, more = {}) => { _inkify(m, 0.04); _gl.scene.add(m); const q = { m, p, f, lift, ...more }; parts.push(q); return q; };
    const n = co.pts.length, mid = (a, b) => L.norm(L.mix(a, b, 0.5, 0.5)), hole = k => k === 'gap' || k === 'void';
    co.pts.forEach((p, i) => {
        const f = i < n - 1 ? L.toward(p, co.pts[i + 1]) : L.toward(co.pts[i - 1], p), before = co.segs[i - 1], after = co.segs[i];
        if (i === 0) {
            const r = new T.Mesh(G.bridge, M.wood2); r.scale.set(1.2, 1, 1.25); add(r, L.walk(p, f, -0.55 / _s.R), f, PLANK_H * 0.48, { tilt: -Math.atan2(PLANK_H, 1.15) });
            // how hard it is, on a sign by the ramp
            const sign = new T.Group(); sign.add(_mesh(G.pole, M.post, 0, 0.35, 0));
            for (let k = 0; k < co.tier; k++) { const ch = _mesh(G.hat, M.chilli, (k - (co.tier - 1) / 2) * 0.3, 0.86, 0); ch.rotation.z = Math.PI; ch.scale.setScalar(0.62); sign.add(ch); }
            add(sign, L.walk(p, L.cross(p, f), 0.8 / _s.R), f, 0);
        }
        if (before === 'void' && after === 'void') return;                    // nothing to stand on mid-hop
        const plank = new T.Mesh(G.plank, i % 2 ? M.wood : M.wood2); if (before === 'void') plank.scale.set(1.35, 1, 1.35);
        add(plank, p, f, PLANK_H);
        const st = new T.Mesh(G.stilt, M.wood2); st.scale.y = PLANK_H; add(st, p, f, PLANK_H / 2);
        if (before === 'spring') add(new T.Mesh(G.coin, M.spring), p, f, PLANK_H + 0.1, { spring: true });
        if (co.checks.includes(i)) { const fl = new T.Group(); fl.add(_mesh(G.pole, M.post, 0, 0.5, 0)); const cloth = _mesh(G.flag, M.flagOff, 0.17, 0.82, 0); fl.add(cloth); add(fl, L.walk(p, L.cross(p, f), 0.42 / _s.R), f, PLANK_H, { check: i, cloth }); }
        if (i > 0 && i < n - 1) add(new T.Mesh(G.coin, M.coin), p, f, PLANK_H + 0.75, { coin: i });
        if (i === n - 1) { const ch = new T.Group(); ch.add(_mesh(G.chest, M.chest, 0, 0.2, 0)); ch.add(_mesh(G.lid, M.band, 0, 0.46, 0)); add(ch, p, f, PLANK_H + 0.05); }
    });
    co.segs.forEach((kind, i) => {
        const a = co.pts[i], b = co.pts[i + 1], c = mid(a, b), f = L.toward(c, b), len = (L.COURSE_STEP - 0.9) + 0.06;
        if (!hole(kind)) { const br = new T.Mesh(G.bridge, kind === 'crumble' ? M.crumble : M.wood); br.scale.z = len; add(br, c, f, PLANK_H - 0.02, { crumble: kind === 'crumble' ? i : null }); }
        if (kind === 'low' || kind === 'tall') {
            // The post stands to the right of the stretch; its arm comes round over the planks once a turn.
            const post = new T.Group(), arm = new T.Group(), tall = kind === 'tall';
            post.add(_mesh(G.stilt, M.post, 0, (tall ? 2.5 : 1.1) / 2, 0)); post.children[0].scale.y = tall ? 2.5 : 1.1;
            const bar = tall ? _mesh(G.paddle, M.tallBar, 0.85, PLANK_H + 0.95, 0) : _mesh(G.bar, M.lowBar, 0.85, PLANK_H + 0.3, 0);
            arm.add(bar); post.add(arm);
            add(post, L.walk(c, L.cross(f, c), 0.85 / _s.R), f, 0, { sweep: i, arm });
        }
    });
    return { id: co.id, parts };
}

function _draw(dt) {
    const g = _gl, s = _s, c = s.crab, { G, M } = g;
    // Planet, air and the things that only sit there.
    g.planet.scale.setScalar(_visR); g.rim.scale.setScalar(_visR * 1.16);
    for (const d of g.deco) _put(d.m, d.p, d.f, d.lift);

    // The boardwalk.
    const co = s.course && !s.course.done ? s.course : null;
    if (_courseVis && (!co || _courseVis.id !== co.id)) _dropCourse();
    if (co && !_courseVis) _courseVis = _buildCourse(co);
    if (_courseVis) for (const q of _courseVis.parts) {
        let lift = q.lift + (q.coin ? Math.sin(_t * 3 + q.coin) * 0.08 : 0) + (q.spring ? Math.abs(Math.sin(_t * 5)) * 0.06 : 0);
        if (q.crumble != null) {
            // cracking: it shakes; gone: it has dropped away (and comes back)
            const tm = co.cr[q.crumble];
            q.m.visible = !(tm > L.CRUMBLE_S + 0.25);
            if (tm != null) lift += tm > L.CRUMBLE_S ? -(tm - L.CRUMBLE_S) * 6 : Math.sin(_t * 60) * 0.03;
        }
        _put(q.m, q.p, q.f, lift);
        if (q.tilt) q.m.rotateX(q.tilt);
        if (q.coin) { q.m.visible = q.coin > co.got; q.m.rotateY(_t * 3); }
        if (q.sweep != null) { const kind = co.segs[q.sweep], ph = (co.t / L.SWEEP.period + co.off[q.sweep]) % 1; q.arm.rotation.y = -Math.PI * 2 * (ph - L.SWEEP[kind] / 2); }
        if (q.check != null) q.cloth.material = _tw(co.cp >= q.check ? _gl.M.flagOn : _gl.M.flagOff);
    }
    // A tower's reach, on the ground round the crab, while one can be afforded.
    const tc = L.unlocked(s, 'tower') && _mode === 'play' ? L.costOf(s, 'tower') : null, reach = !!tc && s.shells >= tc.shells && s.nuts >= tc.nuts;
    g.reach.visible = reach;
    if (reach) { _put(g.reach, c.p, c.face, 0.08); g.reach.material.opacity = 0.22 + 0.1 * Math.sin(_t * 4); }

    // The crab: up on the planks, up in the air, a rock held high.
    const jumpH = c.air > 0 ? Math.sin(Math.PI * (1 - c.air / L.JUMP_S)) * 1.35 : 0;
    _lift += ((L.onCourse(s) ? PLANK_H + 0.05 : 0) - _lift) * Math.min(1, dt * 12);
    _put(g.crab.g, c.p, c.face, _lift + jumpH); _put(g.shadow, c.p, c.face, _lift + 0.04);
    g.shadow.scale.setScalar(1 - jumpH * 0.3);
    const under = s.stars.some(st => !st.big && L.dist(s, st.p, c.p) < st.r * L.reachOf(s));
    _crabPose(g.crab, dt, c.moving && c.air <= 0, Math.max(_cheer, under || c.carry ? 0.12 : 0));
    g.held.visible = !!c.carry;
    if (c.carry) { _put(g.held, c.p, c.face, _lift + jumpH + 1.05); g.held.rotateY(_t * 2); }
    if (_thrown) {
        _thrown.t += dt * 3.2;
        g.flying.visible = _thrown.t < 1;
        if (_thrown.t < 1) g.flying.position.lerpVectors(_thrown.from, _thrown.to, _thrown.t); else _thrown = null;
    } else g.flying.visible = false;

    // Buildings.
    const seen = new Set();
    for (const b of s.builds) {
        seen.add(b.id);
        let v = _vis.builds.get(b.id);
        if (!v) { v = _buildVis(b); _vis.builds.set(b.id, v); }
        v.born = Math.min(1, v.born + dt * 2.6); v.flash = Math.max(0, v.flash - dt * 2); v.shook = Math.max(0, v.shook - dt);
        const spring = 1 + Math.sin(v.born * Math.PI) * 0.25 * (1 - v.born);
        _put(v.g, b.p, [0.2, 0.1, 1]);
        if (b.kind === 'palm') {
            const k = Math.min(1, b.age / (L.PALM_GROW_S / (1 + 0.1 * ((s.up && s.up.green) || 0))));
            v.g.scale.setScalar((0.3 + 0.7 * k) * v.born * spring);
            const wob = v.shook > 0 ? Math.sin(_t * 40) * 0.25 * (v.shook / 0.5) : 0;
            v.top.rotation.z = Math.sin(_t * 1.3 + b.id) * 0.06 + wob; v.top.rotation.x = Math.cos(_t * 1.1 + b.id) * 0.05;
            v.nuts.forEach(n => { n.visible = k >= 1 && b.shake <= 0; });
        } else if (b.kind === 'trick') {
            v.g.scale.setScalar(v.born * spring);
            v.sign.rotation.y = _t * 1.6; v.sign.position.y = 2.5 + Math.sin(_t * 2) * 0.12;
            v.ring.material.opacity = s.trickArmed ? 0.45 + 0.4 * Math.abs(Math.sin(_t * 2.5)) : 0.15;
        } else {
            v.g.scale.setScalar(v.born * spring);
            const hurt = b.hp < L.maxHp(s, b.kind);
            v.fix.visible = hurt; if (hurt) v.fix.position.y = (b.kind === 'hut' && b.lvl === 3 ? 2.9 : 2.2) + Math.sin(_t * 5) * 0.08;
            if (b.kind === 'hut') {
                v.two.visible = b.lvl >= 2; v.three.visible = b.lvl >= 3;
                v.roof.visible = b.lvl < 3; v.roof.rotation.z = hurt ? 0.22 : 0; v.wall.material = _tw(hurt ? M.hurt : M.wall);
                // Its crabs potter round it, one for each it holds.
                while (v.vils.length < b.lvl) { const cr = _crab(HATS[(b.id + v.vils.length * 2) % 6], 0.3, HATS[(b.id * 3 + v.vils.length + 1) % 6]); g.scene.add(cr.g); v.vils.push(cr); }
                const e1 = L.tangent(b.p, [0, 0, 1]), e2 = L.cross(b.p, e1);
                v.vils.forEach((cr, i) => {
                    const a = _t * (0.4 + i * 0.07) * (i % 2 ? -1 : 1) + b.id * 1.7 + i * 2.1, dir = L.mix(e1, e2, Math.cos(a), Math.sin(a)), sgn = i % 2 ? -1 : 1;
                    _put(cr.g, L.walk(b.p, dir, (1.05 + i * 0.28) / _visR), L.mix(e1, e2, -Math.sin(a) * sgn, Math.cos(a) * sgn)); _crabPose(cr, dt, true, 0);
                });
            } else if (b.kind === 'tower') {
                v.orb.material = _tw(b.charges > 0 ? M.gem : M.gemOff); v.orb.rotation.y = _t * 2; v.orb.position.y = 1.75 + Math.sin(_t * 2.4 + b.id) * 0.08;
                v.orb.scale.setScalar((0.7 + 0.3 * Math.min(1, b.charges / L.towerCharges(_s, b))) * (1 + 0.18 * ((b.lvl || 1) - 1)));
                v.dome.scale.setScalar(L.towerR(b) / L.TOWER_R);
                v.dome.material.opacity = (b.charges > 0 ? 0.05 + 0.05 * _nightK + Math.min(3, b.charges) * 0.02 : 0) + v.flash * 0.35;
            } else v.sign.rotation.y = _t * 2;
        }
    }
    for (const [id, v] of _vis.builds) if (!seen.has(id)) { _dropBuild(v); _vis.builds.delete(id); }

    // Things lying about.
    seen.clear();
    for (const it of s.items) {
        seen.add(it.id);
        let v = _vis.items.get(it.id);
        if (!v) {
            const grp = new T.Group(), m = new T.Group(); grp.add(m);
            if (it.kind === 'nut') { m.add(new T.Mesh(G.nut, M.nut)); m.add(_mesh(G.nutCap, M.nutCap, 0, 0.11, 0)); }
            else if (it.kind === 'rock') m.add(new T.Mesh(G.rock, M.rock));
            else { const gold = it.kind === 'gold', cone = new T.Mesh(G.shell, gold ? M.gold : M.shell); cone.rotation.z = 1.1; m.add(cone); m.add(_mesh(G.shellTip, gold ? M.gold : M.shellTip, -0.17, 0.08, 0)); if (gold) m.scale.setScalar(1.35); }
            _inkify(grp, 0.03); g.scene.add(grp); v = { g: grp, m, born: 0 }; _vis.items.set(it.id, v);
        }
        v.born = Math.min(1, v.born + dt * 4);
        const rock = it.kind === 'rock';
        _put(v.g, it.p, [1, 0.3, 0.2], rock ? 0.2 : 0.14 + Math.abs(Math.sin(_t * 2.4 + it.id)) * 0.12);
        if (!rock) v.m.rotation.y = _t * 1.5 + it.id; v.g.scale.setScalar(v.born);
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

    // The camera rides behind and above the crab.
    // (In the menu it stands well back, so the whole planet hangs over the card.)
    const up = V(c.p), f = V(c.f), R = _visR, menu = _mode !== 'play';
    const back = menu ? R * 2.5 : (6.4 + R * 0.32) * (1 - 0.35 * _pitch), high = menu ? R * 1.9 : (6.8 + R * 0.42) * (1 + 0.4 * _pitch);
    const want = up.clone().multiplyScalar(R + high).addScaledVector(f, -back);
    if (!g.camP) g.camP = want.clone();
    g.camP.lerp(want, dt ? Math.min(1, dt * 7) : 0);
    g.camera.position.copy(g.camP);
    if (_shake > 0 && dt) g.camera.position.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(_shake * 0.5));
    g.camera.up.copy(V(c.p));
    g.camera.lookAt(menu ? V(c.p).multiplyScalar(-R * 0.55).addScaledVector(f, -R * 0.9) : V(c.p).multiplyScalar(R).addScaledVector(f, 1.2 + R * 0.12));
    g.sun.position.copy(g.camera.position).addScaledVector(V(L.cross(c.f, c.p)), 9).addScaledVector(V(c.p), 6); g.sun.target.position.set(0, 0, 0);
    g.renderer.render(g.scene, g.camera);
}

// ── Probes ──────────────────────────────────────────────────────────────────
export function _debug() {
    const s = _s;
    return { mode: _mode, gl: !!_gl, paused: _paused, day: s?.day, phase: s?.phase, over: !!s?.over, shells: s?.shells, nuts: s?.nuts, pop: s ? L.pop(s) : 0, town: s?.town, R: s?.R, visR: +_visR.toFixed(2),
        builds: s ? s.builds.map(b => b.kind) : [], items: s?.items.length, stars: s?.stars.length, caught: s?.stats.caught, crab: s ? s.crab.p.map(v => +v.toFixed(3)) : null,
        air: s?.crab.air || 0, carry: s?.crab.carry || null, course: s?.course ? { k: s.course.k, got: s.course.got, done: s.course.done, n: s.course.pts.length, tier: s.course.tier, cp: s.course.cp } : null, reach: !!_gl?.reach.visible,
        drawn: { builds: _vis.builds.size, items: _vis.items.size, stars: _vis.stars.size, course: _courseVis ? _courseVis.parts.length : 0 }, dust: sv().dust, up: { ...sv().up }, skin: sv().skin, theme: theme().id,
        saved: sv().run ? { day: sv().run.day, shells: sv().run.shells } : null, seen: Object.keys(sv().seen), tip: _el && !$('tp-tip').hidden ? $('tp-tip').textContent : '',
        trial: _trial ? { id: (_trial.base || _trial.level).id, w: _trial.state().w || 0, won: _trial.state().won, throws: _trial.state().throws, held: _trial.state().crab.nuts, count: LL.count(_trial.state()), falls: _trial.state().falls, cp: _trial.state().cp, plug: { ..._trial.state().plug }, open: { ..._trial.state().open }, gull: _trial.state().gull ? _trial.state().gull.state : null, h: +_trial.state().crab.h.toFixed(2), charging: _trial.charging() } : null, lair: { ...sv().lair },
        calls: _gl ? _gl.renderer.info.render.calls : 0 };
}
export const _game = () => _s;
export const _trialNow = () => _trial;
/** Probes and the card's clip: let the autopilot play, and run time faster. */
export function _pilot(on = true, speed = 1) { _auto = !!on; _speed = Math.max(1, speed | 0); }
export function _reset() { _sv = null; Store.save(KEY, {}); }
