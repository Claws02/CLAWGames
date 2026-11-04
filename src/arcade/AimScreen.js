// ============================================================
// AIM SCREEN — the shared screen for the aim-and-shoot games (Orbit Putt,
// Crab Cannon, Sea Snooker, Glow Reef). A game supplies its logic module;
// this gives it a level picker (by world), pull-back aiming with a power
// arrow, the fixed-step loop, particles and shake, stars against par, bests
// and unlocking. aimGame(logic) returns a module SoloHub can mount.
//
// logic: meta, LEVELS [{ name, world?, par, hint? }], WORLDS?, W, H, DT,
//   begin(lv), shot(lv, s, angle, power), step(lv, s) → events, moving(s), cleared(s),
//   failed?(lv, s) (out of shots), origin(lv, s) → [x, y], shots(s),
//   draw(g, P, lv, s, now), react?(ev, fx) (fx.burst(x, y, color, n), fx.shake(n), fx.sfx(name), fx.buzz(p)),
//   hud(lv, s) → text, intro (the picker's line), starsFor?(lv, s) (else par-based)
// ============================================================
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';
import { stars as parStars } from './AimSearch.js';

export function aimGame(logic) {
    const { meta, LEVELS, WORLDS, W, H, DT } = logic;
    let _el = null, _cv = null, _g = null, _px = 0, _raf = 0, _lv = null, _li = 0, _s = null, _drag = null, _offs = [], _parts = [], _shake = 0, _setTitle = null;
    const sfx = n => { try { Audio.sfx(n); } catch (e) {} };
    const buzz = p => { try { Audio.haptic(p); } catch (e) {} };
    const best = i => Solo.best(`${meta.id}:${i}`) || 0;
    const total = () => LEVELS.reduce((a, _, i) => a + best(i), 0);
    const open = i => i === 0 || best(i - 1) > 0;
    const fx = {
        burst(x, y, color, n = 10, speed = 0.5) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, v = speed * (0.4 + Math.random()); _parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.6, color }); } },
        shake(n) { _shake = Math.max(_shake, n); }, sfx, buzz,
    };

    function bestText() { const t = total(); return t ? `★ ${t} / ${LEVELS.length * 3}` : ''; }
    function mount(el, opts = {}) { _el = el; _setTitle = opts.title || (() => {}); pick(); }
    function unmount() { cancelAnimationFrame(_raf); _raf = 0; _offs.splice(0).forEach(off => off()); _el = null; _s = null; }

    function pick() {
        cancelAnimationFrame(_raf); _offs.splice(0).forEach(off => off());
        _setTitle(meta.title);
        const groups = WORLDS ? WORLDS.map((name, w) => [name, LEVELS.map((lv, i) => (lv.world === w ? i : -1)).filter(i => i >= 0)]) : [[null, LEVELS.map((_, i) => i)]];
        _el.innerHTML = `<p class="lead sg-lead">${logic.intro}</p>` + groups.map(([name, ids]) => `<div class="rb-world">${name ? `<div class="panel-h bfont">${name} <small>★ ${ids.reduce((a, i) => a + best(i), 0)} / ${ids.length * 3}</small></div>` : ''}<div class="rb-levels">${ids.map(i =>
            `<button class="rb-lv${open(i) ? '' : ' locked'}" data-i="${i}" ${open(i) ? '' : 'disabled'}><span class="bfont">${i + 1}</span><small>${LEVELS[i].name}</small><em>${open(i) ? '★'.repeat(best(i)) + '☆'.repeat(3 - best(i)) : '🔒'}</em></button>`).join('')}</div></div>`).join('') +
            `<p class="hint">★ ${total()} of ${LEVELS.length * 3}</p>`;
        _el.querySelectorAll('.rb-lv:not(.locked)').forEach(b => b.addEventListener('click', () => play(+b.dataset.i)));
    }

    function play(i) {
        _li = i; _lv = LEVELS[i]; _s = logic.begin(_lv); _parts = []; _shake = 0;
        _offs.splice(0).forEach(off => off());
        _el.innerHTML = `<div class="cs-top"><span class="bfont">${i + 1}. ${_lv.name}</span><span class="bfont" id="ag-hud"></span><button class="ghost-btn bfont if-small" id="btn-ag-reset">↺</button></div>
            ${_lv.hint ? `<p class="rb-hint">${_lv.hint}</p>` : ''}
            <canvas class="rb-cv ag-cv" id="ag-cv"></canvas>
            <div class="cs-done" id="ag-done" hidden>
                <div class="cs-done-h bfont" id="ag-done-h"></div><div class="cs-done-t bfont" id="ag-done-t"></div><div class="cs-done-best" id="ag-done-best"></div>
                <button class="go-btn bfont" id="btn-ag-next">NEXT LEVEL</button>
                <button class="ghost-btn bfont" id="btn-ag-again">TRY AGAIN</button>
                <button class="ghost-btn bfont" id="btn-ag-levels">ALL LEVELS</button>
            </div>`;
        _cv = _el.querySelector('#ag-cv'); _g = _cv.getContext('2d');
        size();
        const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _offs.push(() => t.removeEventListener(ev, fn, o)); };
        on(_cv, 'pointerdown', e => { if (busy()) return; e.preventDefault(); _drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; _cv.setPointerCapture?.(e.pointerId); }, { passive: false });
        on(_cv, 'pointermove', e => { if (_drag) { _drag.x = e.clientX; _drag.y = e.clientY; } });
        on(_cv, 'pointerup', () => { const a = aim(); _drag = null; if (a) shoot(a.angle, a.power); });
        on(_cv, 'pointercancel', () => { _drag = null; });
        on(window, 'resize', size);
        _el.querySelector('#btn-ag-reset').addEventListener('click', () => play(_li));
        _el.querySelector('#btn-ag-again').addEventListener('click', () => play(_li));
        _el.querySelector('#btn-ag-levels').addEventListener('click', pick);
        _el.querySelector('#btn-ag-next').addEventListener('click', () => (_li + 1 < LEVELS.length ? play(_li + 1) : pick()));
        hud(); loop();
    }

    const busy = () => !_s || logic.moving(_s) || logic.cleared(_s) || (logic.failed && logic.failed(_lv, _s));

    function size() {
        if (!_cv) return;
        const w = Math.min(_el.clientWidth || 340, 440, ((window.innerHeight || 700) * 0.64) / H * W), dpr = Math.min(window.devicePixelRatio || 1, 2);
        _px = w / W;
        _cv.width = Math.round(w * dpr); _cv.height = Math.round(w * H / W * dpr);
        _cv.style.width = `${w}px`; _cv.style.height = `${Math.round(w * H / W)}px`;
        _g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Pull back: the shot goes the other way, harder the further (a third of the height is full power).
    function aim() {
        if (!_drag) return null;
        const dx = _drag.x0 - _drag.x, dy = _drag.y0 - _drag.y, len = Math.hypot(dx, dy);
        if (len < 8) return null;
        return { angle: Math.atan2(dy, dx), power: Math.min(1, len / (_px * H / 3)) };
    }

    /** Take a shot (exported for probes). */
    function shoot(angle, power) {
        if (busy()) return false;
        logic.shot(_lv, _s, angle, power);
        sfx('swap'); buzz(10); hud();
        return true;
    }

    function loop() {
        cancelAnimationFrame(_raf);
        let last = performance.now(), acc = 0, wasMoving = false;
        const tick = now => {
            if (!_s) return;
            const dt = Math.min(0.1, (now - last) / 1000); last = now;
            if (logic.moving(_s)) {
                wasMoving = true; acc += dt;
                while (acc >= DT && logic.moving(_s)) { acc -= DT; const ev = logic.step(_lv, _s); if (logic.react) logic.react(ev, fx); }
            } else { acc = 0; if (wasMoving) { wasMoving = false; settled(); } }
            for (const p of _parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
            _parts = _parts.filter(p => p.t < p.life);
            _shake = Math.max(0, _shake - dt * 30);
            draw();
            _raf = requestAnimationFrame(tick);
        };
        _raf = requestAnimationFrame(tick);
    }

    function settled() {
        hud();
        const won = logic.cleared(_s), lost = !won && logic.failed && logic.failed(_lv, _s);
        if (!won && !lost) return;
        const st = won ? (logic.starsFor ? logic.starsFor(_lv, _s) : parStars(logic.shots(_s), _lv.par)) : 0;
        const done = _el.querySelector('#ag-done');
        done.hidden = false;
        if (won) {
            const before = best(_li), isBest = Solo.record(`${meta.id}:${_li}`, st, 'high');
            Solo.record(meta.id, total(), 'high');
            if (st === 3) Solo.bump(`${meta.id}3`);
            Solo.won(); sfx('win'); buzz([40, 30, 80]);
            fx.burst(_s.x ?? W / 2, _s.y ?? H / 2, '#fde047', 30, 0.8);
            _el.querySelector('#ag-done-h').textContent = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} CLEARED!`;
            _el.querySelector('#ag-done-t').textContent = logic.doneText ? logic.doneText(_lv, _s) : `${logic.shots(_s)} shot${logic.shots(_s) === 1 ? '' : 's'} · par ${_lv.par}`;
            _el.querySelector('#ag-done-best').textContent = isBest && before ? '🏅 More stars than before!' : st < 3 ? (logic.threeStars ? logic.threeStars(_lv) : `★★★ in ${_lv.par}`) : _li + 1 < LEVELS.length ? 'Perfect!' : 'Perfect! That was the last one.';
            _el.querySelector('#btn-ag-next').hidden = false;
            _el.querySelector('#btn-ag-next').textContent = _li + 1 < LEVELS.length ? 'NEXT LEVEL' : 'ALL LEVELS';
        } else {
            sfx('mg_lose');
            _el.querySelector('#ag-done-h').textContent = '🌊 OUT OF SHOTS';
            _el.querySelector('#ag-done-t').textContent = logic.hud(_lv, _s);
            _el.querySelector('#ag-done-best').textContent = 'Have another go!';
            _el.querySelector('#btn-ag-next').hidden = true;
        }
        done.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }

    function hud() { const h = _el && _el.querySelector('#ag-hud'); if (h) h.textContent = logic.hud(_lv, _s); }

    function draw() {
        const g = _g, P = v => v * _px;
        if (!g || !_s) return;
        g.save();
        if (_shake) g.translate((Math.random() - 0.5) * _shake, (Math.random() - 0.5) * _shake);
        logic.draw(g, P, _lv, _s, performance.now() / 1000);
        for (const p of _parts) { g.globalAlpha = Math.max(0, 1 - p.t / p.life); g.fillStyle = p.color; g.beginPath(); g.arc(P(p.x), P(p.y), 3, 0, 7); g.fill(); }
        g.globalAlpha = 1;
        const a = aim();
        if (a && !busy()) {
            const [ox, oy] = logic.origin(_lv, _s), len = P(0.12 + 0.3 * a.power), x0 = P(ox), y0 = P(oy), x1 = x0 + Math.cos(a.angle) * len, y1 = y0 + Math.sin(a.angle) * len;
            g.strokeStyle = '#ffd23f'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
            g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x1, y1, 6, 0, 7); g.fill();
            g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '900 12px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText(`${Math.round(a.power * 100)}%`, x1, y1 - 12);
        }
        g.restore();
    }

    const _debug = () => (_s ? { level: _li, state: _s, moving: logic.moving(_s), cleared: logic.cleared(_s), failed: !!(logic.failed && logic.failed(_lv, _s)), par: _lv.par, shots: logic.shots(_s) } : null);
    return { meta, bestText, mount, unmount, play, shoot, _debug };
}
