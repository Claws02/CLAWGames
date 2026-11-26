// ============================================================
// GAME — one playable level in a DOM box: canvas, two-thumb controls,
// part picker, engineering readouts, win card. Used by the standalone
// preview and by the arcade adapter (Sparkwright.js).
//
//   const g = createGame(root, { level, onWin, onExit, tape, title })
//   g.destroy()   g.restart()   g.world (live World)   g.frames
//
// tape: a solver tape → the game plays itself (arcade bot, qa ghost probe).
// The sim runs on a fixed DT accumulator; rendering is cosmetic only.
// ============================================================
import { DT, CONCEPTS } from './core/Rules.js';
import { compile, step, socketHere, readouts, NO_INPUT } from './core/World.js';
import { toInput } from './core/Solver.js';
import { createView, draw, fx, shortLabel, KIND_COLOR } from './Render.js';

const CSS = `
.swr{position:absolute;inset:0;overflow:hidden;background:#0b1622;touch-action:none;user-select:none;-webkit-user-select:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d8ecff}
.swr canvas{position:absolute;inset:0;width:100%;height:100%}
.swr-hud{position:absolute;left:0;right:0;top:0;height:46px;display:flex;align-items:center;gap:10px;padding:0 12px;padding-top:env(safe-area-inset-top);background:linear-gradient(#0b1622ee,#0b162200);pointer-events:none}
.swr-hud b{font-weight:700;color:#5cb8e6;letter-spacing:.08em;font-size:12px}
.swr-hud .t{margin-left:auto;font-size:16px;font-variant-numeric:tabular-nums}
.swr-hud .par{font-size:11px;color:#6f8fae}
.swr-hud button{pointer-events:auto;background:#132638;border:1px solid #2c4a66;color:#d8ecff;border-radius:8px;font:inherit;font-size:14px;width:34px;height:30px}
.swr-read{position:absolute;left:10px;right:10px;top:52px;max-width:460px;background:#0d1d2ccc;border:1px solid #2c4a66;border-left:3px solid #5cb8e6;border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.45;white-space:pre-wrap;pointer-events:none;transition:opacity .25s}
.swr-read .h{color:#5cb8e6;font-weight:700;letter-spacing:.06em;font-size:11px;margin-bottom:2px}
.swr-read .ok{color:#3dffa2}.swr-read .bad{color:#ff6b5b}
.swr-pad{position:absolute;bottom:0;left:0;right:0;height:var(--swr-pad);padding-bottom:env(safe-area-inset-bottom);display:flex;justify-content:space-between;align-items:flex-end;padding:0 14px 18px;pointer-events:none}
.swr-pad .grp{display:grid;gap:10px;pointer-events:auto}
.swr-btn{width:72px;height:72px;border-radius:50%;border:2px solid #2c4a66;background:#132638cc;color:#d8ecff;font:inherit;font-size:22px;display:flex;align-items:center;justify-content:center;touch-action:none}
.swr-btn.small{width:52px;height:46px;border-radius:12px;font-size:16px}
.swr-btn.on{background:#5cb8e6;color:#0b1622;border-color:#5cb8e6}
.swr-btn.tool.ready{border-color:#ffb547;color:#ffb547;box-shadow:0 0 14px #ffb54766}
.swr-btn.jump{width:84px;height:84px;font-size:13px;letter-spacing:.1em}
.swr-tray{position:absolute;left:0;right:0;bottom:0;background:#0d1d2cf5;border-top:2px solid #5cb8e6;padding:12px 12px calc(16px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .18s}
.swr-tray.open{transform:none}
.swr-tray h3{margin:0 0 8px;font-size:12px;letter-spacing:.1em;color:#5cb8e6}
.swr-tray .row{display:flex;flex-wrap:wrap;gap:8px}
.swr-tray button{flex:1 1 140px;min-height:52px;background:#132638;border:1px solid #2c4a66;border-left:4px solid var(--k);color:#d8ecff;border-radius:8px;font:inherit;font-size:13px;text-align:left;padding:8px 10px}
.swr-tray button.cur{outline:2px solid var(--k)}
.swr-tray .note{font-size:11px;color:#6f8fae;margin-top:8px;white-space:pre-wrap}
.swr-card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0b1622cc}
.swr-card.show{display:flex}
.swr-card .in{background:#0d1d2c;border:1px solid #3dffa2;border-radius:10px;padding:18px 20px;min-width:240px;max-width:340px;text-align:center}
.swr-card h2{margin:0 0 6px;color:#3dffa2;letter-spacing:.12em;font-size:18px}
.swr-card p{margin:6px 0;font-size:13px;color:#d8ecff}
.swr-card button{margin:10px 6px 0;background:#5cb8e6;color:#0b1622;border:0;border-radius:8px;font:inherit;font-weight:700;padding:10px 16px}
`;

function injectCss() {
    if (document.getElementById('swr-css')) return;
    const st = document.createElement('style');
    st.id = 'swr-css'; st.textContent = CSS;
    document.head.appendChild(st);
}

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Which device does this socket feed? */
function deviceForSocket(L, sid) {
    for (const d of [...L.dev.spring, ...L.dev.lift]) if (d.socket === sid) return d;
    for (const c of L.dev.circuit) if (c.battery === sid || (c.sockets || []).includes(sid)) return c;
    return null;
}

export function createGame(root, opts) {
    injectCss();
    const level = opts.level;
    let w = compile(level);
    const view = createView();
    const box = el('div', 'swr');
    const canvas = el('canvas');
    const ctx = canvas.getContext('2d');
    box.appendChild(canvas);

    // HUD
    const hud = el('div', 'swr-hud');
    hud.innerHTML = `<b>${esc(opts.title || level.name.toUpperCase())}</b><span class="par">PAR ${level.par?.seconds ?? '—'}s</span><span class="t">0.00</span>`;
    const tEl = hud.querySelector('.t');
    const restartBtn = el('button', null, '↺'); restartBtn.title = 'Restart level';
    hud.appendChild(restartBtn);
    if (opts.onExit) { const x = el('button', null, '✕'); x.title = 'Exit'; x.onclick = () => opts.onExit(); hud.appendChild(x); }
    box.appendChild(hud);

    const read = el('div', 'swr-read');
    box.appendChild(read);

    // Controls
    const pad = el('div', 'swr-pad');
    const left = el('div', 'grp'); left.style.gridTemplateColumns = 'repeat(2, auto)';
    const bUp = el('button', 'swr-btn small', '▲'), bDown = el('button', 'swr-btn small', '▼');
    const bL = el('button', 'swr-btn', '◀'), bR = el('button', 'swr-btn', '▶');
    left.append(bUp, bDown, bL, bR);
    const right = el('div', 'grp'); right.style.justifyItems = 'end';
    const bTool = el('button', 'swr-btn small tool', 'TOOL'), bJump = el('button', 'swr-btn jump', 'JUMP');
    right.append(bTool, bJump);
    pad.append(left, right);
    box.appendChild(pad);

    // Picker tray
    const tray = el('div', 'swr-tray');
    box.appendChild(tray);
    const card = el('div', 'swr-card');
    box.appendChild(card);

    root.appendChild(box);

    const held = { l: false, r: false, u: false, d: false, j: false };
    let pendingAct = null, trayOpen = false, done = false, af = null, last = 0, acc = 0;
    let note = null, noteUntil = 0, briefUntil = 4;
    let tapeI = 0, tapeN = 0;
    const tape = opts.tape || null;
    const cleanups = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };

    // Pointer: each button tracks its own pointers, so two thumbs work at once.
    const hold = (btn, key) => {
        const ids = new Set();
        const set = () => { held[key] = ids.size > 0; btn.classList.toggle('on', held[key]); };
        on(btn, 'pointerdown', e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (_) {} ids.add(e.pointerId); set(); });
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) on(btn, ev, e => { ids.delete(e.pointerId); set(); });
    };
    hold(bL, 'l'); hold(bR, 'r'); hold(bUp, 'u'); hold(bDown, 'd'); hold(bJump, 'j');
    on(bTool, 'pointerdown', e => { e.preventDefault(); openTray(); });
    on(restartBtn, 'click', () => restart());

    const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', Space: 'j', KeyK: 'j' };
    on(window, 'keydown', e => {
        if (done && !card.classList.contains('show')) return;
        if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); }
        if (e.code === 'KeyE' || e.code === 'KeyJ') openTray();
        if (e.code === 'KeyR') restart();
        if (e.code === 'Escape' && trayOpen) closeTray();
        if (trayOpen && /^Digit[1-9]$/.test(e.code)) tray.querySelectorAll('button')[+e.code.slice(5) - 1]?.click();
    });
    on(window, 'keyup', e => { if (KEYS[e.code]) held[KEYS[e.code]] = false; });
    on(window, 'resize', () => resize());

    function openTray() {
        if (done || tape) return;
        const so = socketHere(w);
        if (!so) { flash('Stand in a socket to use the TOOL'); return; }
        if (so.fixed) { flash('That socket is locked'); return; }
        const cur = w.s.sockets[so.id];
        const parts = w.s.inv.map(id => w.L.parts[id]).filter(p => p.kind === so.accepts);
        const dev = deviceForSocket(w.L, so.id);
        tray.innerHTML = `<h3>${so.accepts.toUpperCase()} SOCKET${cur ? ' · fitted: ' + esc(w.L.parts[cur].label) : ''}</h3>`;
        const row = el('div', 'row');
        parts.forEach((p, i) => {
            const b = el('button', null, `${i + 1}. ${esc(p.label)}`);
            b.style.setProperty('--k', KIND_COLOR[p.kind]);
            b.onclick = () => { pendingAct = { install: p.id }; closeTray(); };
            row.appendChild(b);
        });
        if (cur) { const b = el('button', null, 'Remove part'); b.style.setProperty('--k', '#6f8fae'); b.onclick = () => { pendingAct = { remove: true }; closeTray(); }; row.appendChild(b); }
        const c = el('button', null, 'Cancel'); c.style.setProperty('--k', '#2c4a66'); c.onclick = closeTray; row.appendChild(c);
        tray.appendChild(row);
        if (dev) tray.appendChild(el('div', 'note', esc(specNote(dev))));
        if (!parts.length && !cur) tray.appendChild(el('div', 'note', 'No parts of this kind left in your tray.'));
        tray.classList.add('open'); trayOpen = true;
        Object.keys(held).forEach(k => (held[k] = false));
    }
    function closeTray() { tray.classList.remove('open'); trayOpen = false; }

    function specNote(dev) {
        if (dev.type === 'spring') return `Pad compresses x = ${dev.compress} m. You weigh 80 kg.\nLaunch height h = k·x² / (2·m·g).`;
        if (dev.type === 'lift') return `Motor ${dev.motor.torque} N·m @ ${dev.motor.rpm.toLocaleString('en-US')} rpm, drum r = ${dev.drumR} m.\nCar ${dev.massKg} kg + you 80 kg. Needs τ ≥ m·g·r.`;
        if (dev.type === 'circuit') return `${dev.volts != null ? dev.volts + ' V supply' : 'Supply from the battery socket'} · load ${dev.loadR} Ω.\nRuns at ${dev.iMin}–${dev.iMax} A; the fuse blows above ${dev.iMax} A.\nI = V / R_total.`;
        return '';
    }

    function flash(text) { note = { head: 'NOTE', lines: [text] }; noteUntil = w.s.t * DT + 2.5; }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = box.clientWidth, H = box.clientHeight;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        box.style.setProperty('--swr-pad', Math.round(Math.min(220, H * 0.26)) + 'px');
    }

    function restart() {
        w = compile(level);
        view.camX = null; view.particles = []; tapeI = 0; tapeN = 0;
        done = false; card.classList.remove('show'); closeTray(); briefUntil = 4;
    }

    function nextInput() {
        if (tape) {
            while (tapeI < tape.length && tapeN >= tape[tapeI][1]) { tapeI++; tapeN = 0; }
            if (tapeI >= tape.length) return NO_INPUT;
            const seg = tape[tapeI];
            const inp = toInput(seg[0], tapeN === 0 ? seg[2] || null : null);
            tapeN++;
            return inp;
        }
        const inp = { ...held, act: pendingAct };
        pendingAct = null;
        return inp;
    }

    function onEvents(evs) {
        fx(view, evs, w);
        for (const e of evs) {
            if (e.type === 'fuse') { note = { head: 'FUSE BLOWN', bad: true, lines: [`I = ${e.I === Infinity ? '∞' : e.I.toFixed(2)} A — over the fuse rating.`, 'The parts popped back into your tray.'] }; noteUntil = w.s.t * DT + 4; }
            if (e.type === 'stall') { note = { head: 'LIFT STALLED', bad: true, lines: ['Not enough torque to lift the car with you on it.', 'More reduction = more torque (and less speed).'] }; noteUntil = w.s.t * DT + 3; }
            if (e.type === 'death') { note = { head: e.why === 'spikes' ? 'OUCH' : 'FELL', bad: true, lines: ['Back to the start — your parts stay fitted.'] }; noteUntil = w.s.t * DT + 2; }
            if (e.type === 'win') win();
        }
    }

    function win() {
        done = true;
        const secs = w.s.t * DT;
        const result = { id: level.id, frames: w.s.t, seconds: +secs.toFixed(2), deaths: w.s.deaths, par: level.par?.seconds ?? null, underPar: level.par ? secs <= level.par.seconds : false };
        const taught = (level.teaches || []).map(id => CONCEPTS.find(c => c.id === id)?.title).filter(Boolean);
        card.innerHTML = `<div class="in"><h2>SHIFT COMPLETE</h2><p>${secs.toFixed(2)} s ${result.par ? (result.underPar ? '· under par ✓' : `· par ${result.par} s`) : ''}</p><p>${w.s.deaths ? w.s.deaths + ' restarts' : 'No restarts'}</p>${taught.length ? `<p style="color:#6f8fae;font-size:12px">Learned: ${esc(taught.join(' · '))}</p>` : ''}</div>`;
        const inner = card.firstChild;
        if (opts.onNext) { const b = el('button', null, opts.nextLabel || 'NEXT ▶'); b.onclick = () => opts.onNext(result); inner.appendChild(b); }
        if (opts.showRetry !== false && !tape) { const b = el('button', null, 'RETRY'); b.onclick = () => restart(); inner.appendChild(b); }
        if (opts.cardOnWin !== false) card.classList.add('show');
        opts.onWin?.(result);
    }

    function paintReadout() {
        const now = w.s.t * DT;
        let block = null;
        const so = socketHere(w);
        if (so) {
            const dev = deviceForSocket(w.L, so.id);
            const r = dev && readouts(w).find(x => x.id === dev.id);
            const part = w.s.sockets[so.id] ? w.L.parts[w.s.sockets[so.id]] : null;
            block = { head: `${so.accepts.toUpperCase()} SOCKET · ${part ? part.label : 'empty'} — TOOL to swap`, lines: r?.r ? r.r.lines : [part ? '' : 'Fit a part to see the maths.'] };
            bTool.classList.add('ready');
        } else bTool.classList.remove('ready');
        if (!block && note && now < noteUntil) block = note;
        if (!block && now < briefUntil) block = { head: level.name.toUpperCase(), lines: [level.brief] };
        if (!block) { read.style.opacity = 0; return; }
        read.style.opacity = 1;
        const cls = l => (/✓/.test(l) ? 'ok' : /✗|BLOW/.test(l) ? 'bad' : '');
        const html = `<div class="h">${esc(block.head)}</div>` + block.lines.filter(Boolean).map(l => `<div class="${cls(l)}">${esc(l)}</div>`).join('');
        if (read._html !== html) { read.innerHTML = html; read._html = html; read.style.borderLeftColor = block.bad ? '#ff6b5b' : '#5cb8e6'; }
    }

    function frame(now) {
        if (!af) return;
        af = requestAnimationFrame(frame);
        const dt = last ? Math.min((now - last) / 1000, 0.1) : DT;
        last = now;
        if (!done && !trayOpen) {
            acc += dt;
            while (acc >= DT) {
                acc -= DT;
                const evs = step(w, nextInput());
                if (evs.length) onEvents(evs);
                if (done) break;
            }
        }
        tEl.textContent = (w.s.t * DT).toFixed(2);
        const W = box.clientWidth, H = box.clientHeight;
        draw(ctx, w, view, W, H, 46, Math.round(Math.min(220, H * 0.26)), dt);
        paintReadout();
    }

    resize();
    af = requestAnimationFrame(frame);
    if (tape) { pad.style.opacity = 0.35; pad.style.pointerEvents = 'none'; }

    return {
        get world() { return w; },
        get frames() { return w.s.t; },
        get done() { return done; },
        restart,
        destroy() {
            cancelAnimationFrame(af); af = null;
            cleanups.forEach(f => { try { f(); } catch (e) {} });
            box.remove();
        },
    };
}
