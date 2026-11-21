// ============================================================
// PAD — the phone as a touchpad for a game the TV runs (docs/DESIGN.md §13).
//
// One pad per player on this phone (a shared phone splits its screen), each
// in its seat colour. First a big READY (the game's ready board on the TV is
// waiting for it), then the whole pad is the player's zone on the TV: put a
// thumb down and drag exactly as on a shared phone. Touches go to the TV as
// Room PAD messages: down and up at once, moves at most every 33 ms (the
// latest one wins). The RESULT takes the pads down.
//
// Built here in JS, not in index.html, so a phone with a cached page has it.
// ============================================================
import * as Room from '../net/Room.js';
import { MG_INFO } from '../claw-core/config/MinigameRegistry.js';

const MOVE_MS = 33;
let _wrap = null, _n = 0;

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isOpen = () => !!_wrap;

/**
 * Put up the pads. live: { n, type, seats } from Room 'live'; names[i] and
 * colors[i] by room seat.
 */
export function open(live, names, colors) {
    close();
    _n = live.n;
    const info = MG_INFO[live.type] || { icon: '🎮', title: 'GAME' };
    _wrap = document.createElement('div');
    _wrap.className = 'pad-wrap';
    _wrap.id = 'pad-wrap';
    _wrap.innerHTML = `<div class="pad-top bfont">${info.icon} ${esc(info.title)} <small>· look at the TV</small></div>` +
        live.seats.map(seat => `<div class="pad" data-seat="${seat}" style="--c:${colors[seat] || '#fff'}">` +
            `<div class="pad-name bfont">${esc(names[seat] || 'Player')}</div>` +
            `<div class="pad-dot"></div>` +
            `<button class="pad-ready bfont">I'M READY</button>` +
            `<div class="pad-hint">Your area on the TV. Touch and drag like it's the game.</div></div>`).join('');
    document.body.appendChild(_wrap);
    _wrap.querySelectorAll('.pad').forEach(_wire);
}

export function close() {
    if (!_wrap) return;
    _wrap.querySelectorAll('.pad').forEach(p => p._flush?.());
    _wrap.remove();
    _wrap = null;
}

function _wire(el) {
    const seat = +el.dataset.seat;
    const dot = el.querySelector('.pad-dot'), btn = el.querySelector('.pad-ready');
    let held = null, last = 0, pending = null, timer = null;
    const at = e => {
        const r = el.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, a: r.width / r.height, px: e.clientX - r.left, py: e.clientY - r.top };
    };
    const send = (k, p) => Room.sendPad?.(seat, k, p.x, p.y, p.a);
    const show = p => { dot.style.transform = `translate(${p.px}px, ${p.py}px)`; };
    const flush = () => { clearTimeout(timer); timer = null; if (pending) { send('move', pending); pending = null; last = performance.now(); } };
    el._flush = () => { if (held !== null) { flush(); send('up', el._last || { x: .5, y: .5, a: 1 }); held = null; } };

    btn.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        send('ready', { x: 0, y: 0, a: 1 });
        el.classList.add('ready');
        try { navigator.vibrate?.(20); } catch (err) {}
    });
    el.addEventListener('pointerdown', e => {
        if (held !== null || !el.classList.contains('ready')) return;
        e.preventDefault();
        held = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        const p = at(e); el._last = p;
        el.classList.add('down'); show(p);
        send('down', p);
        last = performance.now();
        try { navigator.vibrate?.(8); } catch (err) {}
    });
    el.addEventListener('pointermove', e => {
        if (e.pointerId !== held) return;
        e.preventDefault();
        const p = at(e); el._last = p; show(p);
        pending = p;
        const wait = MOVE_MS - (performance.now() - last);
        if (wait <= 0) flush();
        else if (!timer) timer = setTimeout(flush, wait);
    });
    const up = e => {
        if (e.pointerId !== held) return;
        const p = at(e); el._last = p;
        flush();
        send('up', p);
        held = null;
        el.classList.remove('down');
        try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
}

/** The live round this pad is for (probes). */
export const round = () => _n;
