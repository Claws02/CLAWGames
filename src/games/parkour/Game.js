// ============================================================
// GAME — one course (or the Toy Box hub) in a DOM box: canvas, two-thumb
// controls, HUD, the course-clear card. Campaign.js swaps these in and out.
//
//   const g = createGame(root, opts)   g.destroy()  g.restart()  g.toLastFlag()  g.pause(on)  g.flash(text)  g.world
//   opts: level, title, hero (Image|null), heroSheet (HeroSprites sheet|null), heroEmoji, sfx(type), onExit()
//     course: onWin(result) → card; cardExtra(result) → [lines]; onNext(), nextLabel
//     hub:    hub = { state(pt), info(pt) → {head, lines, bad?}, portalInfo(pt) → {icon,label,stars}, onEnter(pt) },
//             spawnAt {x, y}, intro {head, lines}
//     tape:   a solver tape → the game plays itself (QA autoplay)
// The sim runs on a fixed DT accumulator; rendering is cosmetic only.
// ============================================================
import { DT } from './core/Rules.js';
import { compile, step, portalHere, spawnAt, coinCount, NO_INPUT } from './core/World.js';
import { toInput } from './core/Solver.js';
import * as World from './core/World.js';      // namespace: a phone with an older World.js cached still loads (↺ restarts then)
import { createView, draw, fx } from './Render.js';

const CSS = `
.ppk{position:absolute;inset:0;overflow:hidden;background:#ffe9c7;touch-action:none;user-select:none;-webkit-user-select:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#2b2f3a}
.ppk canvas{position:absolute;inset:0;width:100%;height:100%}
.ppk-hud{position:absolute;left:0;right:0;top:0;height:50px;display:flex;align-items:center;gap:8px;padding:0 10px;padding-top:env(safe-area-inset-top);pointer-events:none}
.ppk-hud .tt{font-weight:900;font-size:13px;letter-spacing:.06em;background:#ffffffe0;border-radius:12px;padding:6px 10px;box-shadow:0 2px 0 #0002;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw}
.ppk-hud .chip{font-weight:900;font-size:14px;background:#ffffffe0;border-radius:12px;padding:6px 9px;box-shadow:0 2px 0 #0002;font-variant-numeric:tabular-nums;white-space:nowrap}
.ppk-hud .sp{margin-left:auto}
.ppk-hud button{pointer-events:auto;background:#ffffff;border:0;border-radius:12px;font:inherit;font-weight:900;font-size:16px;width:38px;height:34px;box-shadow:0 3px 0 #0003;color:#2b2f3a}
.ppk-note{position:absolute;left:50%;top:58px;transform:translateX(-50%);max-width:min(92vw,460px);background:#ffffffee;border-radius:16px;padding:9px 14px;box-shadow:0 4px 0 #0002;text-align:center;pointer-events:none;transition:opacity .25s;font-size:13px;line-height:1.4}
.ppk-note b{display:block;font-size:15px;font-weight:900;letter-spacing:.04em;color:#ff5a5f;margin-bottom:2px}
.ppk-note.bad b{color:#8f95a3}
.ppk-pad{position:absolute;left:0;right:0;bottom:0;height:var(--ppk-pad);display:flex;justify-content:space-between;align-items:flex-end;padding:0 14px calc(16px + env(safe-area-inset-bottom));pointer-events:none}
.ppk-pad .grp{display:flex;gap:12px;align-items:flex-end;pointer-events:auto}
.ppk-btn{width:76px;height:76px;border-radius:24px;border:0;background:#ffffffd9;color:#2b2f3a;font:inherit;font-size:28px;font-weight:900;box-shadow:0 5px 0 #0003;touch-action:none;display:flex;align-items:center;justify-content:center}
.ppk-btn.on{transform:translateY(3px);box-shadow:0 2px 0 #0003;background:#fff}
.ppk-btn.jump{width:92px;height:92px;border-radius:50%;background:#ff5a5f;color:#fff;font-size:15px;letter-spacing:.08em}
.ppk-btn.jump.on{background:#ff7a7f}
.ppk-btn.enter{width:64px;height:58px;border-radius:18px;font-size:13px;letter-spacing:.06em;background:#3b9dff;color:#fff;display:none}
.ppk-btn.enter.show{display:flex}
.ppk-card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#2b2f3a99}
.ppk-card.show{display:flex}
.ppk-card .in{background:#fff;border-radius:24px;padding:20px 22px;min-width:250px;max-width:330px;text-align:center;box-shadow:0 8px 0 #0003}
.ppk-card h2{margin:0 0 4px;color:#ff5a5f;font-weight:900;letter-spacing:.06em;font-size:22px}
.ppk-card .stars{font-size:34px;letter-spacing:.12em;color:#ffc928;margin:4px 0 8px;text-shadow:0 2px 0 #c99a00}
.ppk-card .rows{text-align:left;font-size:14px;line-height:1.9;margin:6px 0}
.ppk-card .rows .n{color:#a0a6b4}
.ppk-card p{margin:6px 0;font-size:13px}
.ppk-card .extra{color:#ff8c42;font-weight:800}
.ppk-card button{margin:10px 5px 0;border:0;border-radius:14px;font:inherit;font-weight:900;padding:12px 16px;font-size:14px;box-shadow:0 4px 0 #0003;background:#eef0f5;color:#2b2f3a}
.ppk-card button.go{background:#2fd67b;color:#fff}
`;
function injectCss() {
    if (document.getElementById('ppk-css')) return;
    const st = document.createElement('style');
    st.id = 'ppk-css'; st.textContent = CSS;
    document.head.appendChild(st);
}
const CHEER_MS = 1100;   // the hero cheers this long before COURSE CLEAR shows
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function createGame(root, opts) {
    injectCss();
    const level = opts.level, hub = opts.hub || null;
    let w = compile(level);
    const place = () => { if (opts.spawnAt) spawnAt(w, opts.spawnAt.x, opts.spawnAt.y); };
    place();
    const view = createView(opts.hero || null);
    view.heroEmoji = opts.heroEmoji;
    view.sheet = opts.heroSheet || null;
    if (hub) { view.portalState = hub.state; view.portalInfo = hub.portalInfo; }

    const box = el('div', 'ppk');
    const canvas = el('canvas');
    const ctx = canvas.getContext('2d');
    box.appendChild(canvas);

    const hud = el('div', 'ppk-hud');
    const coins = level.kind === 'hub' ? 0 : w.L.dev.coin.length;
    hud.innerHTML = `<span class="tt">${esc(opts.title || level.name.toUpperCase())}</span>` +
        (hub ? `<span class="chip sp hub-sum">${esc(opts.hudText || '')}</span>`
            : `<span class="chip coins">🪙 0/${coins}</span><span class="chip sp time">0.0</span><span class="chip par">⏱ ${level.par?.seconds ?? '—'}s</span>`);
    const restartBtn = el('button', null, '↺'); restartBtn.title = 'Back to the last flag';
    if (!hub) hud.appendChild(restartBtn);
    if (opts.onExit) { const x = el('button', null, '✕'); x.title = hub ? 'Leave' : 'Back to the Toy Box'; x.onclick = () => opts.onExit(); hud.appendChild(x); }
    box.appendChild(hud);
    const tEl = hud.querySelector('.time'), cEl = hud.querySelector('.coins');

    const note = el('div', 'ppk-note');
    note.style.opacity = '0';
    box.appendChild(note);

    const pad = el('div', 'ppk-pad');
    const left = el('div', 'grp'), right = el('div', 'grp');
    const bL = el('button', 'ppk-btn', '◀'), bR = el('button', 'ppk-btn', '▶');
    const bEnter = el('button', 'ppk-btn enter', '▲ GO'), bJump = el('button', 'ppk-btn jump', 'JUMP');
    left.append(bL, bR); right.append(bEnter, bJump);
    pad.append(left, right);
    box.appendChild(pad);
    const card = el('div', 'ppk-card');
    box.appendChild(card);
    root.appendChild(box);

    const held = { l: false, r: false, u: false, d: false, j: false };
    let cardTimer = null;
    let done = false, paused = false, af = null, last = 0, acc = 0, noteUntil = 0, tapeI = 0, tapeN = 0, door = null, padH = 160;
    const tape = opts.tape || null;
    const cleanups = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
    const hold = (btn, key) => {
        const ids = new Set();
        const set = () => { held[key] = ids.size > 0; btn.classList.toggle('on', held[key]); };
        on(btn, 'pointerdown', e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (_) {} ids.add(e.pointerId); set(); });
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) on(btn, ev, e => { ids.delete(e.pointerId); set(); });
    };
    hold(bL, 'l'); hold(bR, 'r'); hold(bJump, 'j');
    on(bEnter, 'pointerdown', e => { e.preventDefault(); enterDoor(); });
    on(restartBtn, 'click', () => toLastFlag());
    const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowDown: 'd', KeyS: 'd', Space: 'j', KeyK: 'j', KeyZ: 'j' };
    on(window, 'keydown', e => {
        if (card.classList.contains('show')) { if (e.code === 'Enter' || e.code === 'Space') card.querySelector('button.go')?.click(); return; }
        if (hub && (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); enterDoor(); return; }
        if (!hub && (e.code === 'ArrowUp' || e.code === 'KeyW')) { held.j = true; e.preventDefault(); }
        if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); }
        if (e.code === 'KeyR' && !hub) restart();
    });
    on(window, 'keyup', e => { if (KEYS[e.code]) held[KEYS[e.code]] = false; if (!hub && (e.code === 'ArrowUp' || e.code === 'KeyW')) held.j = false; });
    on(window, 'resize', () => resize());

    function enterDoor() {
        if (!hub || paused || done) return false;
        const pt = portalHere(w);
        if (!pt) { flash('Walk up to a door, then press ▲'); return false; }
        hub.onEnter(pt);
        return true;
    }

    function flash(text, head = null, secs = 2.4, bad = false) {
        note.className = 'ppk-note' + (bad ? ' bad' : '');
        note.innerHTML = (head ? `<b>${esc(head)}</b>` : '') + esc(text);
        note.style.opacity = '1';
        noteUntil = performance.now() + secs * 1000;
    }
    function showDoor(pt) {
        if (!pt) { if (door) { note.style.opacity = '0'; door = null; } bEnter.classList.remove('show'); return; }
        bEnter.classList.add('show');
        if (door === pt.id) return;
        door = pt.id;
        const i = hub.info(pt);
        note.className = 'ppk-note' + (i.bad ? ' bad' : '');
        note.innerHTML = `<b>${esc(i.head)}</b>${i.lines.filter(Boolean).map(esc).join('<br>')}`;
        note.style.opacity = '1';
        noteUntil = Infinity;
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = box.clientWidth, H = box.clientHeight;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        padH = Math.round(Math.min(190, Math.max(130, H * 0.22)));
        box.style.setProperty('--ppk-pad', padH + 'px');
    }

    function restart() {
        clearTimeout(cardTimer);
        w = compile(level);
        place();
        view.camX = null; view.particles = []; tapeI = 0; tapeN = 0;
        done = false; card.classList.remove('show');
    }

    // ↺: back to the last flag (stuck, or just want another go at a jump). Before the
    // first flag, or after the finish, it starts the course again. R always restarts.
    function toLastFlag() {
        if (done || paused) { if (done) restart(); return; }
        const evs = World.toFlag ? World.toFlag(w) : null;
        if (!evs) { restart(); flash('From the start!', '↺', 1.2); return; }
        onEvents(evs);
        flash('Back to the last flag.', '↺', 1.2);
    }

    function nextInput() {
        if (tape) {
            while (tapeI < tape.length && tapeN >= tape[tapeI][1]) { tapeI++; tapeN = 0; }
            if (tapeI >= tape.length) return NO_INPUT;
            tapeN++;
            return toInput(tape[tapeI][0]);
        }
        return { ...held };
    }

    function onEvents(evs) {
        fx(view, evs, w);
        for (const e of evs) {
            try { opts.sfx?.(e.type); } catch (_) {}
            if (e.type === 'death') flash('Back to the last flag.', e.why === 'spikes' ? 'OUCH!' : e.why === 'fish' ? 'SNAP!' : 'OOPS!', 1.4, true);
            if (e.type === 'cannon_in') flash('Press JUMP to fire!', 'IN THE CANNON', 1.6);
            if (e.type === 'flag' && !hub) flash('You\'ll come back here if you fall.', 'CHECKPOINT', 1.6);
            if (e.type === 'win' && !hub) win();
        }
    }

    function win() {
        done = true;
        const secs = +(w.s.t * DT).toFixed(2);
        const got = coinCount(w.s);
        const result = { id: level.id, frames: w.s.t, seconds: secs, deaths: w.s.deaths, coins: w.s.coins, coinCount: got, coinTotal: coins, par: level.par.seconds, underPar: secs <= level.par.seconds };
        result.stars = 1 + (result.underPar ? 1 : 0) + (got === coins ? 1 : 0);
        opts.onWin?.(result);
        const extra = (opts.cardExtra?.(result) || []).map(l => `<p class="extra">${esc(l)}</p>`).join('');
        const row = (ok, text) => `<div class="${ok ? '' : 'n'}">${ok ? '★' : '☆'} ${esc(text)}</div>`;
        card.innerHTML = `<div class="in"><h2>COURSE CLEAR!</h2><div class="stars">${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</div>` +
            `<div class="rows">${row(true, 'Finished')}${row(result.underPar, `Under ${result.par} s · you took ${secs.toFixed(1)} s`)}${row(got === coins, `All ${coins} coins · you got ${got}`)}</div>${extra}` +
            `<button class="again">↺ AGAIN</button><button class="go">${esc(opts.nextLabel || 'BACK TO THE TOY BOX ▶')}</button></div>`;
        card.querySelector('.again').onclick = () => restart();
        card.querySelector('.go').onclick = () => opts.onNext?.();
        // A moment to see your character cheer at the toy chest, then the card.
        const run = w;
        cardTimer = setTimeout(() => { if (w === run && done) card.classList.add('show'); }, CHEER_MS);
    }

    function frame(now) {
        af = requestAnimationFrame(frame);
        if (!box.isConnected) return;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : DT;
        last = now;
        if (!paused && !done) {
            acc += dt;
            let n = 0;
            while (acc >= DT && n < 5) {
                const inp = nextInput();
                view.input = inp;
                const evs = step(w, inp);
                if (evs.length) onEvents(evs);
                acc -= DT; n++;
                if (done) break;
            }
            if (n === 5) acc = 0;
        }
        if (hub) showDoor(portalHere(w));
        else {
            if (tEl) tEl.textContent = (w.s.t * DT).toFixed(1);
            if (cEl) cEl.textContent = `🪙 ${coinCount(w.s)}/${coins}`;
        }
        if (noteUntil !== Infinity && performance.now() > noteUntil) note.style.opacity = '0';
        const W = box.clientWidth, H = box.clientHeight;
        // Landscape: a slimmer strip for the corner buttons; portrait keeps the world above them.
        draw(ctx, w, view, W, H, 50, W > H ? Math.round(H * 0.2) : padH, dt);
    }

    resize();
    if (opts.intro) flash(opts.intro.lines.join(' '), opts.intro.head, 3.5);
    else if (!hub && level.brief) flash(level.brief, (opts.title || level.name).toUpperCase(), 3.2);
    af = requestAnimationFrame(frame);

    return {
        get world() { return w; },
        get frames() { return w.s.t; },
        get done() { return done; },
        restart, toLastFlag, flash, enterDoor,
        /** The hero's pose last drawn ('idle', 'run', 'cheer'…): probes read it. */
        pose: () => view.hv.pose || null,
        pause(v) { paused = !!v; },
        destroy() {
            cancelAnimationFrame(af);
            clearTimeout(cardTimer);
            cleanups.forEach(f => f());
            box.remove();
        },
    };
}
