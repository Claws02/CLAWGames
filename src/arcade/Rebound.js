// ============================================================
// REBOUND — the screen. Physics and levels: ReboundLogic.js.
//
// Pull back anywhere on the tank and let go: the pearl flies the other way,
// harder the further you pulled, bouncing off walls, bumpers and blocks.
// Every clam it touches pops; the next flick starts where it stopped. Clear
// the tank in par for ★★★ (par+2 for ★★). Levels open one after another.
// ============================================================
import { LEVELS, W, H, R, CLAM_R, DT, begin, flick, step, moving, cleared, stars } from './ReboundLogic.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'rebound', icon: '🦪', title: 'Rebound', blurb: 'Pull back and flick the pearl. Bounce it round the tank to pop every clam in par.' };

let _el = null, _cv = null, _g = null, _px = 0, _raf = 0, _lv = null, _li = 0, _s = null, _drag = null, _offs = [], _acc = 0, _last = 0;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _best = i => Solo.best(`rebound:${i}`) || 0;   // stars on level i
const _total = () => LEVELS.reduce((a, _, i) => a + _best(i), 0);
const _open = i => i === 0 || _best(i - 1) > 0;

export function bestText() { const t = _total(); return t ? `★ ${t} / ${LEVELS.length * 3}` : ''; }

export function mount(el) { _el = el; _pick(); }
export function unmount() { _stopLoop(); _offs.splice(0).forEach(off => off()); _el = null; _s = null; }

function _stopLoop() { cancelAnimationFrame(_raf); _raf = 0; }

function _pick() {
    _stopLoop(); _offs.splice(0).forEach(off => off());
    _el.innerHTML = `<p class="lead sg-lead">Pull back anywhere, let go to flick. Pop every clam in as few flicks as you can.</p>
        <div class="rb-levels">${LEVELS.map((lv, i) => `<button class="rb-lv${_open(i) ? '' : ' locked'}" data-i="${i}" ${_open(i) ? '' : 'disabled'}>` +
            `<span class="bfont">${i + 1}</span><small>${lv.name}</small><em>${_open(i) ? '★'.repeat(_best(i)) + '☆'.repeat(3 - _best(i)) : '🔒'}</em></button>`).join('')}</div>
        <p class="hint">★ ${_total()} of ${LEVELS.length * 3}</p>`;
    _el.querySelectorAll('.rb-lv:not(.locked)').forEach(b => b.addEventListener('click', () => play(+b.dataset.i)));
}

/** Play level i. */
export function play(i) {
    _li = i; _lv = LEVELS[i]; _s = begin(_lv);
    _offs.splice(0).forEach(off => off());
    _el.innerHTML = `<div class="cs-top"><span class="bfont">${i + 1}. ${_lv.name}</span><span class="bfont" id="rb-flicks"></span><button class="ghost-btn bfont" id="btn-rb-reset">↺ RESET</button></div>
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
    _el.querySelector('#btn-rb-reset').addEventListener('click', () => play(_li));
    _el.querySelector('#btn-rb-again').addEventListener('click', () => play(_li));
    _el.querySelector('#btn-rb-levels').addEventListener('click', _pick);
    _el.querySelector('#btn-rb-next').addEventListener('click', () => (_li + 1 < LEVELS.length ? play(_li + 1) : _pick()));
    _hud(); _draw();
}

function _size() {
    const w = Math.min(_el.clientWidth || 340, 440, ((window.innerHeight || 700) * 0.66) / H * W);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    _px = w / W;
    _cv.width = Math.round(w * dpr); _cv.height = Math.round(w * H / W * dpr);
    _cv.style.width = `${w}px`; _cv.style.height = `${Math.round(w * H / W)}px`;
    _g.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        _acc += Math.min(0.1, (now - _last) / 1000); _last = now;
        while (_acc >= DT && moving(_s)) {
            _acc -= DT;
            if (step(_lv, _s).length) { _sfx('coin_gain'); try { Audio.haptic(15); } catch (e) {} }
        }
        _draw();
        if (moving(_s) && !cleared(_s)) _raf = requestAnimationFrame(tick);
        else { _s.vx = _s.vy = 0; _settled(); }
    };
    _raf = requestAnimationFrame(tick);
}

function _settled() {
    _hud(); _draw();
    if (!cleared(_s)) return;
    const st = stars(_s.flicks, _lv.par);
    const before = _best(_li), isBest = Solo.record(`rebound:${_li}`, st, 'high');
    Solo.record('rebound', _total(), 'high');
    if (st === 3) Solo.bump('reboundPerfect');
    _sfx('win');
    Solo.won();
    _el.querySelector('#rb-done').hidden = false;
    _el.querySelector('#rb-done-h').textContent = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} CLEARED!`;
    _el.querySelector('#rb-done-t').textContent = `${_s.flicks} flick${_s.flicks === 1 ? '' : 's'} · par ${_lv.par}`;
    _el.querySelector('#rb-done-best').textContent = isBest && before ? '🏅 More stars than before!' : st < 3 ? `★★★ in ${_lv.par} flick${_lv.par === 1 ? '' : 's'}` : _li + 1 < LEVELS.length ? 'Perfect!' : 'Perfect! That was the last tank.';
    _el.querySelector('#btn-rb-next').textContent = _li + 1 < LEVELS.length ? 'NEXT LEVEL' : 'ALL LEVELS';
    _el.querySelector('#rb-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function _hud() {
    const left = _s.popped.filter(p => !p).length;
    _el.querySelector('#rb-flicks').textContent = `🦪 ${left} · flicks ${_s.flicks} / par ${_lv.par}`;
}

function _draw() {
    const g = _g, P = v => v * _px;
    if (!g || !_s) return;
    const w = P(W), h = P(H);
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#7dd3fc'); bg.addColorStop(1, '#2563eb');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b1240'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    for (const [x, y, bw, bh] of _lv.blocks) { g.fillStyle = '#a16207'; g.fillRect(P(x), P(y), P(bw), P(bh)); g.strokeStyle = '#2b1240'; g.lineWidth = 2; g.strokeRect(P(x), P(y), P(bw), P(bh)); }
    for (const [x, y, r] of _lv.bumpers) { g.fillStyle = '#f472b6'; g.beginPath(); g.arc(P(x), P(y), P(r), 0, 7); g.fill(); g.strokeStyle = '#2b1240'; g.lineWidth = 3; g.stroke(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(P(x - r * 0.3), P(y - r * 0.3), P(r * 0.3), 0, 7); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${Math.round(P(CLAM_R) * 1.7)}px sans-serif`;
    g.fillStyle = '#000';   // an emoji takes the fill's alpha: keep it opaque
    _lv.clams.forEach(([x, y], i) => { if (!_s.popped[i]) g.fillText('🦪', P(x), P(y) + 1); });
    // the aim: an arrow the way it'll go, as long as the pull is strong (no path drawn: that's the puzzle)
    const a = _aim();
    if (a) {
        const len = P(0.12 + 0.3 * a.power), x0 = P(_s.x), y0 = P(_s.y), x1 = x0 + Math.cos(a.angle) * len, y1 = y0 + Math.sin(a.angle) * len;
        g.strokeStyle = '#ffd23f'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x1, y1, 6, 0, 7); g.fill();
    }
    g.fillStyle = '#fff7ed'; g.beginPath(); g.arc(P(_s.x), P(_s.y), P(R), 0, 7); g.fill();
    g.strokeStyle = '#2b1240'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(P(_s.x - R * 0.35), P(_s.y - R * 0.35), P(R * 0.3), 0, 7); g.fill();
    g.textBaseline = 'alphabetic';
}

/** Probes: the tank. */
export const _debug = () => (_s ? { level: _li, x: _s.x, y: _s.y, flicks: _s.flicks, popped: _s.popped.slice(), moving: moving(_s), cleared: cleared(_s) } : null);
