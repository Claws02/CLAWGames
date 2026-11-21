// ============================================================
// TV LIVE — the TV runs the game itself (docs/DESIGN.md §13, phase 2).
//
// A shared-screen game plays on the TV exactly as it plays on one phone, one
// seat per player, and every phone is a touchpad for its seat. The game never
// knows: each phone's touches arrive as Room PAD messages and are replayed
// here as pointer events inside that seat's zone on the TV, the same events a
// thumb on a shared phone would make.
//
// Where a touch lands: the phone's pad is fitted (same shape, as big as fits)
// into the seat's zone, so a drag on the phone is a drag of the same shape on
// the TV. The TV is watched upright by everyone, so nothing is rotated: what a
// player sees on the TV is what their thumb moves.
//
// The beats around the game are run here too: the rules card stays up long
// enough to read from the sofa, the hold diagram is skipped, and each seat's
// READY is its phone's READY.
// ============================================================
import * as Room from '../net/Room.js';
import * as MinigameManager from '../claw-core/minigames/MinigameManager.js';
import { MG_PROFILE, orientationOf } from '../claw-core/config/MinigameRegistry.js';
import { zonesFor } from '../claw-core/config/MinigameLayout.js';
import { state, setPlayerCount } from '../host/ArcadeState.js';

const $ = id => document.getElementById(id);

/** The games the TV can run, phase 2: the first one end to end. */
export const GAMES = ['sumospheres'];
const RULES_MS = 4500;           // the rules card, read on the TV
const PID0 = 7100;               // synthetic pointer ids: one per seat

let _on = null;                  // { type, n, done, targets: Map(seat → element), down: Map(seat → {x, y}) }

/** Can the TV run `type` for this room now? */
export function fits(type, n = Room.seats().length) {
    const seats = MG_PROFILE[type]?.seats || [2, 2];
    return GAMES.includes(type) && n >= seats[0] && n <= Math.min(4, seats[1]) && !!Room.liveReady?.();
}
/** The live games this room could be dealt. */
export const pool = () => GAMES.filter(t => fits(t));
export const playing = () => !!_on;

/**
 * Run `type` on the TV for every seat. onDone(result) after Room has sent the
 * RESULT (or with null if it could not start).
 */
export function play(type, onDone) {
    if (_on || !Room.startLive?.(type)) { onDone?.(null); return false; }
    const seats = Room.seats(), n = seats.length;
    setPlayerCount(n);
    seats.forEach((s, i) => { const p = state.players[i]; p.name = s.name; p.isBot = false; if (s.char) p.charType = s.char; });
    _on = { type, n, done: false, targets: new Map(), down: new Map(), onDone, launched: false, early: new Set() };
    $('arcade').hidden = true;
    MinigameManager.triggerStandalone(type, false, n, {
        bots: seats.map(() => false),
        onComplete: (winnerId, standings) => _end(winnerId, standings),
    });
    _autoIntro();
    return true;
}

// The rules card: up long enough to read, then on. The hold page: straight past.
function _autoIntro() {
    const press = id => { const b = $(id); if (b && b.offsetParent !== null) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); };
    setTimeout(() => {
        if (!_on) return;
        press('btn-mg-intro-next');
        setTimeout(() => {
            if (!_on) return;
            press('btn-mg-launch');
            // The ready board is up now: READYs tapped during the rules count.
            setTimeout(() => {
                if (!_on) return;
                _on.launched = true;
                _on.early.forEach(seat => { try { MinigameManager.setReady(seat); } catch (e) {} });
            }, 400);
        }, 300);
    }, RULES_MS);
}

function _end(winnerId, standings) {
    const on = _on;
    if (!on || on.done) return;
    on.done = true;
    // Let go of anything still held, so no stale pointer outlives the game.
    on.targets.forEach((el, seat) => _fire(el, 'pointerup', seat, on.down.get(seat) || { x: 0, y: 0 }));
    _on = null;
    $('arcade').hidden = false;
    const r = Room.endLive?.(winnerId, standings) || null;
    on.onDone?.(r);
}

/** Abandon the game (the room closed): no result. */
export function abort() {
    if (!_on) return;
    _on.done = true;
    _on = null;
    try { MinigameManager.forceEndMinigame(); } catch (e) {}
    $('arcade').hidden = false;
}

// ---- the touch relay ---------------------------------------------------------------
// The seat's area on the TV: its zone, or for a two-player game held on its
// side, its half (slot 0 on the right), as StageKit.touch reads it.
function _area(seat) {
    const L = $('minigame-layer').getBoundingClientRect();
    if (_on.n === 2 && orientationOf(_on.type) === 'sideon') {
        const w = L.width / 2;
        return { x: L.left + (seat === 0 ? w : 0), y: L.top, w, h: L.height };
    }
    const z = zonesFor(_on.n, L.width, L.height)[seat];
    return z ? { x: L.left + z.rect.x, y: L.top + z.rect.y, w: z.rect.w, h: z.rect.h } : { x: L.left, y: L.top, w: L.width, h: L.height };
}

/** Where a pad point (x, y in 0–1, pad aspect a = w/h) lands on the TV for `seat`. */
export function map(seat, x, y, a) {
    const r = _area(seat);
    // The biggest box of the pad's shape that fits in the area, centred.
    let w = r.w, h = r.w / a;
    if (h > r.h) { h = r.h; w = r.h * a; }
    const ox = r.x + (r.w - w) / 2, oy = r.y + (r.h - h) / 2;
    return { x: ox + x * w, y: oy + y * h };
}

function _fire(el, type, seat, p) {
    try {
        el.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, composed: true, pointerId: PID0 + seat, pointerType: 'touch',
            isPrimary: true, clientX: p.x, clientY: p.y, buttons: type === 'pointerup' ? 0 : 1,
        }));
    } catch (e) { /* the game came down under us */ }
}

/** A PAD message from a seat's phone (Room 'pad'). */
export function pad(seat, k, x, y, a) {
    const on = _on;
    if (!on || on.done || seat >= on.n) return;
    if (k === 'ready') {
        if (!on.launched) on.early.add(seat);
        else try { MinigameManager.setReady(seat); } catch (e) {}
        return;
    }
    const p = map(seat, x, y, a);
    if (k === 'down') {
        // A down while one is held (a lost up): finish the old touch first.
        if (on.targets.has(seat)) _fire(on.targets.get(seat), 'pointerup', seat, on.down.get(seat));
        const el = document.elementFromPoint(p.x, p.y);
        if (!el) return;
        on.targets.set(seat, el);
        on.down.set(seat, p);
        _fire(el, 'pointerdown', seat, p);
    } else {
        const el = on.targets.get(seat);
        if (!el) return;
        on.down.set(seat, p);
        _fire(el, k === 'up' ? 'pointerup' : 'pointermove', seat, p);
        if (k === 'up') on.targets.delete(seat);
    }
}

export function init() {
    Room.on('pad', (seat, k, x, y, a) => pad(seat, k, x, y, a));
    Room.on('closed', () => abort());
}
