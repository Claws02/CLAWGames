// ============================================================
// WAKE LOCK — keep the screen on while this phone is in a room.
//
// A phone that auto-locks drops its WebRTC links within seconds (Trystero
// gives up on a peer after 5 s), and a locked host takes the room with it.
// The Screen Wake Lock API stops the auto-lock (not a deliberate lock or an
// app switch). The browser drops the lock whenever the page is hidden, so it
// is asked for again each time the page comes back.
//
//   want(true)   on entering a room screen; want(false) on leaving
//   held()       for probes
// ============================================================
let _want = false, _lock = null, _asking = false;

async function _get() {
    if (!_want || _lock || _asking || document.hidden || !navigator.wakeLock) return;
    _asking = true;
    try {
        const lock = await navigator.wakeLock.request('screen');
        _lock = lock;
        lock.addEventListener?.('release', () => { if (_lock === lock) _lock = null; });
        if (!_want) _drop();
    } catch (e) { /* not allowed here (low battery, no user gesture yet): carry on without */ }
    _asking = false;
}

function _drop() {
    const l = _lock;
    _lock = null;
    if (l) l.release().catch(() => {});
}

export function want(on) {
    _want = !!on;
    if (_want) _get(); else _drop();
}

export const held = () => !!_lock;

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) _get(); });
    // Some browsers only grant it after a tap.
    document.addEventListener('pointerdown', () => { if (_want && !_lock) _get(); }, { passive: true });
}
