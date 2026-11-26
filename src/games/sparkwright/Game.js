// ============================================================
// GAME — one playable level in a DOM box: canvas, two-thumb controls,
// part picker, engineering readouts, win card. Used by the standalone
// preview and by the arcade adapter (Sparkwright.js).
//
//   const g = createGame(root, { level, onWin, onExit, tape, title })
//   g.destroy()   g.restart()   g.pause(on)   g.world (live World)   g.frames
//
// Hub mode (Home Base): opts.hub = { state(portal) → 'locked'|'open'|'done'|'star'|'manual'|'soon',
//   info(portal) → { head, lines }, onEnter(portal) }. No timer, no win; ▲ or TOOL at a door enters.
// Also: spawnAt {x, y} (stand at a door), intro { head, lines, at } (a note + sparks),
// cardExtra(result) → extra lines on the win card, sfx(eventType) for sounds.
//
// tape: a solver tape → the game plays itself (arcade bot, qa ghost probe).
// The sim runs on a fixed DT accumulator; rendering is cosmetic only.
// ============================================================
import { DT, CONCEPTS } from './core/Rules.js';
import { compile, step, socketHere, portalHere, spawnAt, readouts, deviceFor, slotsOf, fitted, trayMass, fittedCost, NO_INPUT } from './core/World.js';
import { review, stars } from './core/Review.js';
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
.swr-tray{max-height:72%;overflow:auto}
.swr-tray .wo{font-size:12px;color:#ffcf3d;margin-bottom:8px;line-height:1.45}
.swr-tray .slots{display:grid;gap:6px;margin-bottom:10px}
.swr-tray .slot{display:flex;align-items:center;gap:8px;min-height:46px}
.swr-tray .slot b{display:block;color:var(--k);font-size:10px;letter-spacing:.08em;margin-bottom:2px}
.swr-tray .slot .rm{flex:0 0 auto;min-height:36px;padding:4px 10px;border-left-width:1px}
.swr-tray .slot.sel{outline:2px solid var(--k);border-radius:8px}
.swr-tray .spec{display:block;color:#9fbad3;font-size:11px;margin-top:2px}
.swr-tray .foot{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#9fbad3;margin-top:10px;flex-wrap:wrap}
.swr-tray .foot .over{color:#ff6b5b}
.swr-card .rv{text-align:left;font-size:12px;margin:8px 0;line-height:1.6}
.swr-card .rv .y{color:#3dffa2}.swr-card .rv .n{color:#ff6b5b}
.swr-card .math{text-align:left;font-size:11px;color:#47e6ff;background:#0b1622;border-radius:6px;padding:8px;margin-top:8px;white-space:pre-wrap;max-height:30vh;overflow:auto}
.swr-card .stars{font-size:26px;letter-spacing:.2em;color:#ffcf3d;margin:4px 0}
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

const KIND_UNIT = {
    spring: p => `${(p.k / 1000).toLocaleString('en-US')} kN/m`,
    motor: p => `${p.torque} N·m · ${p.rpm.toLocaleString('en-US')} rpm`,
    gear: p => `${p.ratio}:1 · η ${p.eff} · rated ${p.maxTorque} N·m`,
    resistor: p => `${p.ohms} Ω · rated ${p.watts} W`,
    fuse: p => `blows above ${p.amps} A`,
    battery: p => `${p.volts} V`,
};
/** One line of spec-sheet numbers for a part: what it is, its mass, its price. */
export const specLine = p => `${KIND_UNIT[p.kind]?.(p) ?? ''} · ${p.mass} kg · $${p.cost}`;
const benchKey = (w, sid) => fitted(w, sid).map(p => p?.id || '-').join(',');

export function createGame(root, opts) {
    injectCss();
    const level = opts.level;
    const hub = opts.hub || null;
    const place = () => { if (opts.spawnAt) spawnAt(w, opts.spawnAt.x, opts.spawnAt.y); };
    let w = compile(level);
    place();
    const view = createView();
    view.portalState = hub ? hub.state : null;
    view.portalStars = hub?.stars || null;
    const box = el('div', 'swr');
    const canvas = el('canvas');
    const ctx = canvas.getContext('2d');
    box.appendChild(canvas);

    // HUD
    const hud = el('div', 'swr-hud');
    hud.innerHTML = hub
        ? `<b>${esc(opts.title || level.name.toUpperCase())}</b><span class="t" style="font-size:13px">${esc(opts.hudText || '')}</span>`
        : `<b>${esc(opts.title || level.name.toUpperCase())}</b><span class="par">PAR ${level.par?.seconds ?? '—'}s</span><span class="t">0.00</span>`;
    const tEl = hud.querySelector('.t');
    const restartBtn = el('button', null, '↺'); restartBtn.title = 'Restart level';
    if (!hub) hud.appendChild(restartBtn);
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
    const bTool = el('button', 'swr-btn small tool', hub ? 'ENTER' : 'TOOL'), bJump = el('button', 'swr-btn jump', 'JUMP');
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
    let pendingAct = null, trayOpen = false, done = false, af = null, last = 0, acc = 0, paused = false, prevU = false;
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
    // ▲ at a Home Base door opens it (checked before the hold, so a quick tap counts).
    if (hub) on(bUp, 'pointerdown', e => { if (portalHere(w)) { e.stopImmediatePropagation(); e.preventDefault(); enterDoor(); } });
    hold(bL, 'l'); hold(bR, 'r'); hold(bUp, 'u'); hold(bDown, 'd'); hold(bJump, 'j');
    on(bTool, 'pointerdown', e => { e.preventDefault(); hub ? enterDoor() : openTray(); });
    on(restartBtn, 'click', () => restart());

    const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', Space: 'j', KeyK: 'j' };
    on(window, 'keydown', e => {
        if (done && !card.classList.contains('show')) return;
        if (hub && (e.code === 'ArrowUp' || e.code === 'KeyW') && !e.repeat && portalHere(w)) { e.preventDefault(); enterDoor(); return; }
        if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); }
        if (e.code === 'KeyE' || e.code === 'KeyJ') hub ? enterDoor() : openTray();
        if (e.code === 'KeyR' && !hub) restart();
        if (e.code === 'Escape' && trayOpen) closeTray();
        if (trayOpen && /^Digit[1-9]$/.test(e.code)) tray.querySelectorAll('button')[+e.code.slice(5) - 1]?.click();
    });
    on(window, 'keyup', e => { if (KEYS[e.code]) held[KEYS[e.code]] = false; });
    on(window, 'resize', () => resize());

    function enterDoor() {
        if (paused || done) return false;
        const pt = portalHere(w);
        if (!pt) { flash('Walk up to a door, then press ▲'); return false; }
        hub.onEnter(pt);
        return true;
    }

    // ── The Workbench ───────────────────────────────────────────────────────
    // Spec sheets, not answers: it shows what each part IS (numbers, mass, cost)
    // and what the job needs, never what a build will do. You find out by testing.
    let benchSel = null;
    function openTray() {
        if (done || tape) return;
        const so = socketHere(w);
        if (!so) { flash('Stand at a bench to use the TOOL'); return; }
        if (so.fixed) { flash('That bench is locked'); return; }
        const slots = slotsOf(so);
        if (!benchSel || !slots.some(x => x.id === benchSel)) benchSel = (slots.find(x => !w.s.sockets[so.id][x.id]) || slots[0]).id;
        renderBench(so);
        tray.classList.add('open'); trayOpen = true;
        Object.keys(held).forEach(k => (held[k] = false));
    }
    function renderBench(so) {
        const slots = slotsOf(so), bench = w.s.sockets[so.id], dev = deviceFor(w.L, so.id);
        const wo = level.workOrder, budget = wo?.checks?.find(c => c.type === 'budget')?.max;
        tray.innerHTML = `<h3>WORKBENCH${dev ? ' · ' + esc(DEV_NAME[dev.type] || dev.type) : ''}</h3>` +
            (wo ? `<div class="wo">${esc(level.brief)}</div>` : '');
        const list = el('div', 'slots');
        for (const sl of slots) {
            const part = bench[sl.id] ? w.L.parts[bench[sl.id]] : null;
            const row = el('div', 'slot' + (sl.id === benchSel ? ' sel' : ''));
            row.style.setProperty('--k', KIND_COLOR[sl.accepts]);
            const b = el('button', null, `<b>${esc((sl.label || sl.accepts).toUpperCase())}</b>${part ? esc(part.label) + `<span class="spec">${esc(specLine(part))}</span>` : '<span class="spec">empty: tap to choose</span>'}`);
            b.style.setProperty('--k', KIND_COLOR[sl.accepts]);
            b.onclick = () => { benchSel = sl.id; renderBench(so); };
            row.appendChild(b);
            if (part) { const rm = el('button', 'rm', '✕'); rm.title = 'Remove'; rm.style.setProperty('--k', '#6f8fae'); rm.onclick = () => benchAct({ remove: sl.id }); row.appendChild(rm); }
            list.appendChild(row);
        }
        tray.appendChild(list);
        const sel = slots.find(x => x.id === benchSel);
        const options = w.s.inv.map(id => w.L.parts[id]).filter(p => p.kind === sel.accepts).sort((a, b) => a.cost - b.cost || a.label.localeCompare(b.label));
        const head = el('h3', null, `TRAY · ${esc((sel.label || sel.accepts).toUpperCase())}`);
        tray.appendChild(head);
        const row = el('div', 'row');
        options.forEach((p, i) => {
            const b = el('button', null, `${i + 1}. ${esc(p.label)}<span class="spec">${esc(specLine(p))}</span>`);
            b.style.setProperty('--k', KIND_COLOR[p.kind]);
            b.onclick = () => benchAct({ install: p.id, slot: sel.id });
            row.appendChild(b);
        });
        if (!options.length) row.appendChild(el('div', 'note', 'Nothing of this kind left in your tray.'));
        tray.appendChild(row);
        if (dev) tray.appendChild(el('div', 'note', esc(specNote(dev))));
        const cost = fittedCost(w);
        const foot = el('div', 'foot', `<span class="${budget != null && cost > budget ? 'over' : ''}">Fitted: $${cost}${budget != null ? ` of $${budget}` : ''}</span><span>Tray you carry: ${trayMass(w).toFixed(1)} kg</span>`);
        tray.appendChild(foot);
        const done = el('button', null, 'DONE · go test it');
        done.style.setProperty('--k', '#3dffa2'); done.style.marginTop = '10px'; done.style.width = '100%';
        done.onclick = closeTray;
        tray.appendChild(done);
    }
    function benchAct(act) {
        // Fitting a part takes one real frame of the sim (the hero is standing at the bench).
        const evs = step(w, { ...NO_INPUT, act });
        if (evs.length) onEvents(evs);
        const so = socketHere(w);
        if (so && trayOpen) renderBench(so); else closeTray();
    }
    function closeTray() { tray.classList.remove('open'); trayOpen = false; }

    const DEV_NAME = { spring: 'spring launcher', lift: 'lift drive', circuit: 'circuit' };
    function specNote(dev) {
        if (dev.type === 'spring') return `The pad squashes ${dev.compress} m. Springs on this bench push side by side. It throws you plus everything in your tray (${(80 + trayMass(w)).toFixed(1)} kg right now).`;
        if (dev.type === 'lift') return `Drum radius ${dev.drumR} m. It hauls the ${dev.massKg} kg car plus you and your tray, ${dev.yBottom - dev.yTop} m up.`;
        if (dev.type === 'circuit') return `${dev.volts != null ? `${dev.volts} V line` : 'Supply: the battery you fit'} · load ${dev.loadR} Ω · runs on ${dev.iMin}–${dev.iMax} A and is damaged above ${dev.iMax} A. No fuse, no power.`;
        return '';
    }

    // Maths appears only for builds you've actually tried (or after a failure / the clear).
    const observed = new Set();
    const observe = dev => { if (dev) observed.add(`${dev.id}:${benchKey(w, dev.socket)}`); };
    const seen = dev => observed.has(`${dev.id}:${benchKey(w, dev.socket)}`);

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
        place();
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
        if (hub) {
            // ▲ at a door opens it instead of climbing.
            const upEdge = held.u && !prevU;
            prevU = held.u;
            if (upEdge && portalHere(w)) { enterDoor(); return { ...held, u: false, act: null }; }
        }
        const inp = { ...held, act: pendingAct };
        pendingAct = null;
        return inp;
    }

    function onEvents(evs) {
        fx(view, evs, w);
        for (const e of evs) {
            try { opts.sfx?.(e.type); } catch (_) {}
            const dev = e.id && w.L.byId[e.id];
            if (e.type === 'fuse') { note = { head: 'INCIDENT · FUSE BLOWN', bad: true, lines: [...e.lines, 'The bench parts popped back into your tray.'] }; noteUntil = w.s.t * DT + 6; }
            if (e.type === 'burn') { note = { head: e.state === 'burn-load' ? 'INCIDENT · LOAD BURNED OUT' : 'INCIDENT · RESISTOR BURNED', bad: true, lines: [...e.lines, 'The bench parts popped back into your tray.'] }; noteUntil = w.s.t * DT + 6; }
            if (e.type === 'strip') { note = { head: 'INCIDENT · GEARBOX STRIPPED', bad: true, lines: [...e.lines, 'The drive parts popped back into your tray.'] }; noteUntil = w.s.t * DT + 6; }
            if (e.type === 'stall') { note = { head: 'LIFT STALLED', bad: true, lines: e.lines }; noteUntil = w.s.t * DT + 4; observe(dev); }
            if (e.type === 'lift_go' || e.type === 'spring') observe(dev);
            if (e.type === 'install' || e.type === 'remove') { const d = deviceFor(w.L, e.id); if (d?.type === 'circuit') observe(d); }
            if (e.type === 'death') { note = { head: e.why === 'spikes' ? 'OUCH' : 'FELL', bad: true, lines: ['Back to the start — your parts stay fitted.'] }; noteUntil = w.s.t * DT + 2; }
            if (e.type === 'win' && !hub) win();
        }
    }

    function win() {
        done = true;
        const secs = w.s.t * DT;
        const result = { id: level.id, frames: w.s.t, seconds: +secs.toFixed(2), deaths: w.s.deaths, par: level.par?.seconds ?? null, underPar: level.par ? secs <= level.par.seconds : false };
        const rows = review(level, w, result);
        result.stars = stars(rows);
        result.review = rows.map(r => ({ label: r.label, ok: !!r.ok, detail: r.detail }));
        opts.onWin?.(result);
        const taught = (level.teaches || []).map(id => CONCEPTS.find(c => c.id === id)?.title).filter(Boolean);
        const extra = (opts.cardExtra?.(result) || []).map(l => `<p style="color:#ffcf3d">${esc(l)}</p>`).join('');
        const rv = rows.map(r => `<div class="${r.ok ? 'y' : 'n'}">${r.ok ? '★' : '☆'} ${esc(r.label)}${r.detail ? ` <span style="color:#6f8fae">· ${esc(r.detail)}</span>` : ''}</div>`).join('');
        const maths = readouts(w).filter(x => x.r && x.r.lines).map(x => `${(DEV_NAME[x.kind === 'lift' ? 'lift' : x.kind] || x.kind).toUpperCase()}\n${x.r.lines.join('\n')}`).join('\n\n');
        card.innerHTML = `<div class="in"><h2>SHIFT COMPLETE</h2><div class="stars">${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</div><div style="font-size:11px;color:#6f8fae;letter-spacing:.1em">DESIGN REVIEW</div><div class="rv">${rv}</div>${extra}${maths ? `<div class="math">HOW IT WORKED\n${esc(maths)}</div>` : ''}${taught.length ? `<p style="color:#6f8fae;font-size:12px">Learned: ${esc(taught.join(' · '))} → Field Manual</p>` : ''}</div>`;
        const inner = card.firstChild;
        if (opts.onNext) { const b = el('button', null, opts.nextLabel || 'NEXT ▶'); b.onclick = () => opts.onNext(result); inner.appendChild(b); }
        if (opts.showRetry !== false && !tape) { const b = el('button', null, 'RETRY'); b.onclick = () => restart(); inner.appendChild(b); }
        if (opts.cardOnWin !== false) card.classList.add('show');
    }

    function paintReadout() {
        const now = w.s.t * DT;
        let block = null;
        if (hub && note && now < noteUntil) block = note;
        const pt = !block && hub && portalHere(w);
        if (pt) {
            block = hub.info(pt);
            bTool.classList.add('ready');
        }
        if (!block && note && now < noteUntil && note.bad) block = note;   // an incident report beats the bench summary
        const so = !block && socketHere(w);
        if (so) {
            const dev = deviceFor(w.L, so.id);
            const r = dev && readouts(w).find(x => x.id === dev.id);
            const parts = fitted(w, so.id).filter(Boolean);
            const lines = [parts.length ? parts.map(p => p.label).join(' + ') : 'Nothing fitted yet.'];
            if (dev && r?.r && seen(dev)) lines.push(...r.r.lines);
            else if (parts.length) lines.push('Untested build: go try it.');
            block = { head: `WORKBENCH · TOOL to open`, lines };
            bTool.classList.add('ready');
        } else if (!pt) bTool.classList.toggle('ready', !!(hub && portalHere(w)));
        if (!block && note && now < noteUntil) block = note;
        if (!block && now < briefUntil) block = { head: level.name.toUpperCase(), lines: [level.brief] };
        if (!block) { read.style.opacity = 0; return; }
        read.style.opacity = 1;
        const cls = l => (/✓/.test(l) ? 'ok' : /✗|BLOW|burn/.test(l) ? 'bad' : '');
        const html = `<div class="h">${esc(block.head)}</div>` + block.lines.filter(Boolean).map(l => `<div class="${cls(l)}">${esc(l)}</div>`).join('');
        if (read._html !== html) { read.innerHTML = html; read._html = html; read.style.borderLeftColor = block.bad ? '#ff6b5b' : '#5cb8e6'; }
    }

    function frame(now) {
        if (!af) return;
        af = requestAnimationFrame(frame);
        const dt = last ? Math.min((now - last) / 1000, 0.1) : DT;
        last = now;
        if (!done && !trayOpen && !paused) {
            acc += dt;
            while (acc >= DT) {
                acc -= DT;
                const evs = step(w, nextInput());
                if (evs.length) onEvents(evs);
                if (done) break;
            }
        }
        if (!hub) tEl.textContent = (w.s.t * DT).toFixed(2);
        const W = box.clientWidth, H = box.clientHeight;
        draw(ctx, w, view, W, H, 46, Math.round(Math.min(220, H * 0.26)), dt);
        paintReadout();
    }

    resize();
    if (opts.intro) {
        note = { head: opts.intro.head, lines: opts.intro.lines };
        noteUntil = 5; briefUntil = 0;
        if (opts.intro.at) fx(view, [{ type: 'win' }], { s: { p: { x: opts.intro.at.x + 0.15, y: opts.intro.at.y + 0.1 } }, L: w.L });
    }
    af = requestAnimationFrame(frame);
    if (tape) { pad.style.opacity = 0.35; pad.style.pointerEvents = 'none'; }

    return {
        get world() { return w; },
        get frames() { return w.s.t; },
        get done() { return done; },
        restart,
        pause(on) { paused = !!on; if (paused) Object.keys(held).forEach(k => (held[k] = false)); last = 0; },
        flash,
        destroy() {
            cancelAnimationFrame(af); af = null;
            cleanups.forEach(f => { try { f(); } catch (e) {} });
            box.remove();
        },
    };
}
