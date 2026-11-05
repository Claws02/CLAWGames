// ============================================================
// REBOUND — the screen. Physics and levels: ReboundLogic.js.
//
// Pull back anywhere on the tank and let go: the pearl flies the other way,
// harder the further you pulled, bouncing off walls, bumpers and blocks.
// Every clam it touches pops; the next flick starts where it stopped. Clear
// the tank in par for ★★★ (par+2 for ★★). Levels open one after another,
// in four worlds: the Lagoon, the Reef (moving reefs, whirlpools), the Wreck
// (coral, urchins, switches and gates) and the Abyss (all of it). The daily
// tank is one of a list made and solved ahead of time (ReboundDaily.js).
// ============================================================
import { LEVELS, WORLDS, W, H, R, CLAM_R, DT, PORTAL_R, URCHIN_R, SWITCH_R, begin, flick, step, moving, cleared, stars, moverAt } from './ReboundLogic.js';
import { TANKS } from './ReboundDaily.js';
import * as Solo from './SoloStats.js';
import * as Share from './Share.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'rebound', icon: '🦪', title: 'Rebound', blurb: 'Pull back and flick the pearl. Bounce it round the tank to pop every clam in par. 32 tanks in four worlds.', daily: true };

// The first level with each new thing says what it does.
const HINTS = {
    'Drifting Reef': '🌀 Moving reefs never stop. Watch them, and time your flick.',
    'Whirlpool': '🌊 Roll into a whirlpool and come out of its twin, going the same way.',
    'Brittle': '🪸 Coral cracks on the first hit and breaks on the second.',
    'Prickly': '🦔 Touch an urchin and your pearl goes back to where that flick started.',
    'The Switch': '🔘 Hit the switch to open every gate in the tank.',
};

let _el = null, _cv = null, _g = null, _px = 0, _raf = 0, _lv = null, _li = 0, _s = null, _drag = null, _offs = [], _acc = 0, _last = 0;
let _daily = false, _trail = [], _fx = [], _setTitle = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _best = i => Solo.best(`rebound:${i}`) || 0;   // stars on level i
const _total = () => LEVELS.reduce((a, _, i) => a + _best(i), 0);
const _open = i => i === 0 || _best(i - 1) > 0;

export function bestText() { const t = _total(); return t ? `★ ${t} / ${LEVELS.length * 3}` : ''; }

/** Today's tank: the same on every phone (one of TANKS, by the day). */
export function dailyTank(day = Solo.today()) {
    const [y, m, d] = day.split('-').map(Number);
    const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
    return TANKS[((n % TANKS.length) + TANKS.length) % TANKS.length];
}

export function mount(el, opts = {}) {
    _el = el; _setTitle = opts.title || (() => {});
    if (opts.daily) return play(-1, dailyTank());
    _pick();
}
export function unmount() { _stopLoop(); _offs.splice(0).forEach(off => off()); _el = null; _s = null; }

function _stopLoop() { cancelAnimationFrame(_raf); _raf = 0; }

function _pick() {
    _stopLoop(); _offs.splice(0).forEach(off => off());
    _setTitle('Rebound');
    _el.innerHTML = `<p class="lead sg-lead">Pull back anywhere, let go to flick. Pop every clam in as few flicks as you can.</p>
        ${WORLDS.map((name, w) => {
            const ids = LEVELS.map((lv, i) => (lv.world === w ? i : -1)).filter(i => i >= 0);
            const got = ids.reduce((a, i) => a + _best(i), 0);
            return `<div class="rb-world"><div class="panel-h bfont">${['🏝️', '🐠', '⚓', '🌌'][w]} ${name} <small>★ ${got} / ${ids.length * 3}</small></div><div class="rb-levels">${ids.map(i =>
                `<button class="rb-lv${_open(i) ? '' : ' locked'}" data-i="${i}" ${_open(i) ? '' : 'disabled'}><span class="bfont">${i + 1}</span><small>${LEVELS[i].name}</small>` +
                `<em>${_open(i) ? '★'.repeat(_best(i)) + '☆'.repeat(3 - _best(i)) : '🔒'}</em></button>`).join('')}</div></div>`;
        }).join('')}
        <p class="hint">★ ${_total()} of ${LEVELS.length * 3}</p>`;
    _el.querySelectorAll('.rb-lv:not(.locked)').forEach(b => b.addEventListener('click', () => play(+b.dataset.i)));
}

/** Play level i (or, with i = -1, the given tank: the daily). */
export function play(i, tank = null) {
    _daily = i < 0;
    _li = i; _lv = _daily ? tank : LEVELS[i]; _s = begin(_lv); _trail = []; _fx = [];
    _offs.splice(0).forEach(off => off());
    _setTitle(_daily ? 'Rebound · Daily' : 'Rebound');
    const hint = !_daily && HINTS[_lv.name];
    _el.innerHTML = `<div class="cs-top"><span class="bfont">${_daily ? '📅 DAILY TANK' : `${i + 1}. ${_lv.name}`}</span><span class="bfont" id="rb-flicks"></span><button class="ghost-btn bfont" id="btn-rb-reset">↺</button></div>
        ${hint ? `<p class="rb-hint">${hint}</p>` : ''}
        <canvas class="rb-cv" id="rb-cv"></canvas>
        <div class="cs-done" id="rb-done" hidden>
            <div class="cs-done-h bfont" id="rb-done-h"></div>
            <div class="cs-done-t bfont" id="rb-done-t"></div>
            <div class="cs-done-best" id="rb-done-best"></div>
            <button class="go-btn bfont" id="btn-rb-next">NEXT LEVEL</button>
            <button class="ghost-btn bfont" id="btn-rb-again">TRY AGAIN</button>
            <button class="ghost-btn bfont" id="btn-rb-levels">ALL LEVELS</button>
        </div>`;
    _cv = _el.querySelector('#rb-cv'); _g = _cv.getContext('2d');
    _size();
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(_cv, 'pointerdown', e => { if (moving(_s) || cleared(_s)) return; e.preventDefault(); _drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; _cv.setPointerCapture?.(e.pointerId); _draw(); }, { passive: false });
    on(_cv, 'pointermove', e => { if (_drag) { _drag.x = e.clientX; _drag.y = e.clientY; _draw(); } });
    on(_cv, 'pointerup', () => _release());
    on(_cv, 'pointercancel', () => { _drag = null; _draw(); });
    on(window, 'resize', () => { _size(); _draw(); });
    const again = () => play(_li, tank);
    _el.querySelector('#btn-rb-reset').addEventListener('click', again);
    _el.querySelector('#btn-rb-again').addEventListener('click', again);
    _el.querySelector('#btn-rb-levels').addEventListener('click', _pick);
    _el.querySelector('#btn-rb-next').addEventListener('click', () => (_daily ? _pick() : _li + 1 < LEVELS.length ? play(_li + 1) : _pick()));
    _hud(); _idle();
}

function _size() {
    const w = Math.min(_el.clientWidth || 340, 440, ((window.innerHeight || 700) * 0.64) / H * W);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    _px = w / W;
    _cv.width = Math.round(w * dpr); _cv.height = Math.round(w * H / W * dpr);
    _cv.style.width = `${w}px`; _cv.style.height = `${Math.round(w * H / W)}px`;
    _g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Between flicks the tank still breathes (portals spin, effects fade), and the
// moving reefs keep moving: you see what you're shooting into and time it.
// The flick starts from wherever they are (the clock is the state's own).
function _idle() {
    _stopLoop();
    let last = performance.now();
    const tick = now => {
        if (!_s || moving(_s)) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (_lv.movers?.length && !cleared(_s)) _s.t += dt;
        _animate(dt);
        _draw();
        _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

// The pull: opposite to the drag, power by its length (a third of the tank's height is full power).
function _aim() {
    if (!_drag) return null;
    const dx = _drag.x0 - _drag.x, dy = _drag.y0 - _drag.y, len = Math.hypot(dx, dy);
    if (len < 8) return null;
    return { angle: Math.atan2(dy, dx), power: Math.min(1, len / (_px * H / 3)) };
}

function _release() {
    const a = _aim();
    _drag = null;
    if (!a) return _draw();
    shoot(a.angle, a.power);
}

/** Flick the pearl (exported for probes). */
export function shoot(angle, power) {
    if (!_s || moving(_s) || cleared(_s)) return;
    flick(_s, angle, power);
    _sfx('swap');
    _hud();
    _acc = 0; _last = performance.now();
    _stopLoop();
    const tick = now => {
        if (!_s) return;
        const dt = Math.min(0.1, (now - _last) / 1000); _last = now;
        _acc += dt;
        while (_acc >= DT && moving(_s)) { _acc -= DT; _react(step(_lv, _s)); }
        _trail.unshift([_s.x, _s.y]); if (_trail.length > 18) _trail.pop();
        _animate(dt);
        _draw();
        if (moving(_s) && !cleared(_s)) _raf = requestAnimationFrame(tick);
        else { _s.vx = _s.vy = 0; _settled(); }
    };
    _raf = requestAnimationFrame(tick);
}

// What a step did, as sound, a buzz and a little burst.
function _react(ev) {
    const burst = (x, y, color, n = 10) => { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, v = 0.2 + Math.random() * 0.5; _fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5, color }); } };
    ev.popped.forEach(i => { const [x, y] = _lv.clams[i]; burst(x, y, '#fde68a', 12); _sfx('coin_gain'); try { Audio.haptic(15); } catch (e) {} });
    ev.cracked.forEach(i => { const [x, y, w, h] = _lv.coral[i]; burst(x + w / 2, y + h / 2, '#fb7185', _s.coral[i] ? 6 : 16); _sfx(_s.coral[i] ? 'land_bad' : 'gate_open'); });
    if (ev.warped) { burst(_s.x, _s.y, '#a5f3fc', 14); _sfx('boost'); }
    if (ev.stung) { _sfx('mg_lose'); try { Audio.haptic([30, 30, 30]); } catch (e) {} _trail = []; }
    if (ev.opened) { burst(_lv.switch[0], _lv.switch[1], '#86efac', 16); _sfx('gate_open'); try { Audio.haptic([20, 20, 60]); } catch (e) {} }
}
function _animate(dt) { for (const f of _fx) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; } _fx = _fx.filter(f => f.t < f.life); }

function _settled() {
    _hud(); _draw(); _idle();
    if (!cleared(_s)) return;
    const st = stars(_s.flicks, _lv.par);
    _sfx('win');
    _el.querySelector('#rb-done').hidden = false;
    _el.querySelector('#rb-done-h').textContent = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} CLEARED!`;
    _el.querySelector('#rb-done-t').textContent = `${_s.flicks} flick${_s.flicks === 1 ? '' : 's'} · par ${_lv.par}`;
    if (_daily) {
        Solo.bump('reboundDaily');
        const res = Solo.solveDaily('rebound');
        Solo.won();
        _el.querySelector('#rb-done-best').textContent = Solo.dailyLine(res, "Today's tank");
        _el.querySelector('#rb-done').insertBefore(Share.button(Share.dailyText('🦪 Rebound', `${_s.flicks} flick${_s.flicks === 1 ? '' : 's'} (par ${_lv.par}) ${'★'.repeat(st)}${'☆'.repeat(3 - st)}`)), _el.querySelector('#btn-rb-next'));
        _el.querySelector('#btn-rb-next').textContent = 'THE LEVELS';
        _el.querySelector('#btn-rb-levels').hidden = true;
    } else {
        const before = _best(_li), isBest = Solo.record(`rebound:${_li}`, st, 'high');
        Solo.record('rebound', _total(), 'high');
        if (st === 3) Solo.bump('reboundPerfect');
        if (_lv.world === 3 && st === 3) Solo.bump('reboundAbyss3');
        Solo.won();
        const last = _li + 1 >= LEVELS.length, worldEnd = !last && LEVELS[_li + 1].world !== _lv.world;
        _el.querySelector('#rb-done-best').textContent = isBest && before ? '🏅 More stars than before!' : st < 3 ? `★★★ in ${_lv.par} flick${_lv.par === 1 ? '' : 's'}`
            : last ? 'Perfect! That was the deepest tank.' : worldEnd ? `Perfect! On to the ${WORLDS[LEVELS[_li + 1].world]}…` : 'Perfect!';
        _el.querySelector('#btn-rb-next').textContent = last ? 'ALL LEVELS' : 'NEXT LEVEL';
    }
    _el.querySelector('#rb-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function _hud() {
    const left = _s.popped.filter(p => !p).length;
    _el.querySelector('#rb-flicks').textContent = `🦪 ${left} · ${_s.flicks} / par ${_lv.par}`;
}

const _box = (g, P, [x, y, w, h], fill, dash) => {
    g.fillStyle = fill; g.fillRect(P(x), P(y), P(w), P(h));
    g.strokeStyle = '#2b1240'; g.lineWidth = 2; if (dash) g.setLineDash([4, 3]); g.strokeRect(P(x), P(y), P(w), P(h)); g.setLineDash([]);
};
const _ball = (g, P, x, y, r, fill) => {
    g.fillStyle = fill; g.beginPath(); g.arc(P(x), P(y), P(r), 0, 7); g.fill(); g.strokeStyle = '#2b1240'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(P(x - r * 0.3), P(y - r * 0.3), P(r * 0.3), 0, 7); g.fill();
};

function _draw() {
    const g = _g, P = v => v * _px, lv = _lv, s = _s;
    if (!g || !s) return;
    const w = P(W), h = P(H), now = performance.now() / 1000;
    const deep = [['#7dd3fc', '#2563eb'], ['#5eead4', '#0f766e'], ['#a8a29e', '#44403c'], ['#6366f1', '#0f0a2e'], ['#7dd3fc', '#1e3a8a']][lv.world] || ['#7dd3fc', '#2563eb'];
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, deep[0]); bg.addColorStop(1, deep[1]);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b1240'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    // portals: two spinning whirlpools of one colour
    (lv.portals || []).forEach(([ax, ay, bx, by], i) => {
        const col = ['#22d3ee', '#e879f9'][i % 2];
        for (const [x, y] of [[ax, ay], [bx, by]]) {
            for (let k = 0; k < 3; k++) { g.strokeStyle = col; g.globalAlpha = 0.9 - k * 0.25; g.lineWidth = 3; g.beginPath(); g.arc(P(x), P(y), P(PORTAL_R) * (1 - k * 0.28), now * 3 + k, now * 3 + k + 4.2); g.stroke(); }
            g.globalAlpha = 1;
        }
    });
    for (const b of lv.blocks) _box(g, P, b, '#a16207');
    (lv.coral || []).forEach((c, i) => { if (s.coral[i] > 0) _box(g, P, c, s.coral[i] === 2 ? '#fb7185' : '#fecdd3', s.coral[i] === 1); });
    (lv.gates || []).forEach(gt => { if (!s.open) _box(g, P, gt, '#94a3b8'); else { g.globalAlpha = 0.18; _box(g, P, gt, '#94a3b8'); g.globalAlpha = 1; } });
    for (const [x, y, r] of lv.bumpers) _ball(g, P, x, y, r, '#f472b6');
    for (const m of lv.movers || []) { const p = moverAt(m, s.t); if (p.bumper) _ball(g, P, ...p.bumper, '#c084fc'); else _box(g, P, p.block, '#8b5cf6'); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000';   // emoji take the fill's alpha: keep it opaque
    g.font = `${Math.round(P(URCHIN_R) * 2.2)}px sans-serif`;
    for (const [x, y] of lv.urchins || []) g.fillText('🦔', P(x), P(y) + 1);
    if (lv.switch) { g.fillStyle = s.open ? '#4ade80' : '#facc15'; g.beginPath(); g.arc(P(lv.switch[0]), P(lv.switch[1]), P(SWITCH_R), 0, 7); g.fill(); g.strokeStyle = '#2b1240'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#000'; g.font = `${Math.round(P(SWITCH_R) * 1.3)}px sans-serif`; g.fillText(s.open ? '🔓' : '🔒', P(lv.switch[0]), P(lv.switch[1]) + 1); }
    g.font = `${Math.round(P(CLAM_R) * 1.7)}px sans-serif`;
    lv.clams.forEach(([x, y], i) => { if (!s.popped[i]) g.fillText('🦪', P(x), P(y) + 1 + Math.sin(now * 2 + i) * 1.5); });
    // effects and the trail
    for (const f of _fx) { g.globalAlpha = Math.max(0, 1 - f.t / f.life); g.fillStyle = f.color; g.beginPath(); g.arc(P(f.x), P(f.y), 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    _trail.forEach(([x, y], k) => { g.globalAlpha = 0.35 * (1 - k / _trail.length); g.fillStyle = '#fff7ed'; g.beginPath(); g.arc(P(x), P(y), P(R) * (1 - k / _trail.length * 0.6), 0, 7); g.fill(); });
    g.globalAlpha = 1;
    // the aim: an arrow the way it'll go, as long as the pull is strong (no path drawn: that's the puzzle)
    const a = _aim();
    if (a) {
        const len = P(0.12 + 0.3 * a.power), x0 = P(s.x), y0 = P(s.y), x1 = x0 + Math.cos(a.angle) * len, y1 = y0 + Math.sin(a.angle) * len;
        g.strokeStyle = '#ffd23f'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x1, y1, 6, 0, 7); g.fill();
    }
    g.fillStyle = '#fff7ed'; g.beginPath(); g.arc(P(s.x), P(s.y), P(R), 0, 7); g.fill();
    g.strokeStyle = '#2b1240'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(P(s.x - R * 0.35), P(s.y - R * 0.35), P(R * 0.3), 0, 7); g.fill();
    g.textBaseline = 'alphabetic';
}

/** Probes: the tank. */
export const _debug = () => (_s ? { level: _li, daily: _daily, t: _s.t, x: _s.x, y: _s.y, flicks: _s.flicks, popped: _s.popped.slice(), moving: moving(_s), cleared: cleared(_s), open: _s.open, coral: _s.coral.slice(), par: _lv.par, name: _lv.name } : null);
