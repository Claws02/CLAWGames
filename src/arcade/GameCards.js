// ============================================================
// GAME CARDS — what a game looks like, before you pick it.
//
// Every game card leads with a still from the game and, while the card is on
// screen, a short silent loop of real play (assets/clips, made by
// scripts/capture-clips.js; Clips.js lists them). Videos load only as cards
// scroll into view and play only while they're visible, a few at a time, and
// not at all with Save-Data or reduced motion. Tapping a card opens a preview
// sheet: the clip big, how to play, your best and a PLAY button.
//
//   media(id, icon)     the top of a card (html)
//   watch(root)         start playing/pausing the clips inside root as they scroll
//   preview({ id, icon, title, tag, tagClass, desc, best, blocked, playLabel, onPlay })
//   closePreview()
// ============================================================
import * as Clips from './Clips.js';

const MAX_PLAYING = 4;
const _calm = () => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) {}
    return !!(navigator.connection && navigator.connection.saveData);
};
const _esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The top of a card: the clip (poster, then video) with the game's icon as a badge, or a big icon if there's no clip. */
export function media(id, icon) {
    const c = Clips.clip(id);
    if (!c) return `<span class="cm cm-none"><span class="cm-ico">${icon}</span></span>`;
    return `<span class="cm"><img class="cm-img" src="${c.poster}" alt="" loading="lazy" decoding="async">` +
        `<video class="cm-vid" muted playsinline loop preload="none" disablepictureinpicture data-src="${c.video}" aria-hidden="true"></video>` +
        `<span class="cm-badge">${icon}</span></span>`;
}

let _io = null;
const _playing = new Set();
function _play(v) {
    if (_calm()) return;
    if (!v.src) { v.src = v.dataset.src; }
    if (_playing.size >= MAX_PLAYING) { const old = _playing.values().next().value; old.pause(); _playing.delete(old); }
    _playing.add(v);
    const p = v.play(); if (p && p.catch) p.catch(() => {});
    v.closest('.cm')?.classList.add('live');
}
function _stop(v) { v.pause(); _playing.delete(v); }

/** Play the clips inside root while they're on screen (call after building the cards). */
export function watch(root) {
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (!_io) _io = new IntersectionObserver(entries => {
        for (const e of entries) (e.isIntersecting && e.intersectionRatio >= 0.6 ? _play : _stop)(e.target);
    }, { threshold: [0, 0.6] });
    root.querySelectorAll('video.cm-vid').forEach(v => {
        v.addEventListener('playing', () => v.closest('.cm')?.classList.add('live'), { once: true });
        _io.observe(v);
    });
}
/** Stop everything (leaving a screen). */
export function stopAll() { for (const v of _playing) v.pause(); _playing.clear(); }

// ---- the preview sheet ------------------------------------------------------------------
let _sheet = null, _onKey = null;
export function preview(o) {
    closePreview();
    stopAll();
    const c = Clips.clip(o.id);
    const el = document.createElement('div');
    el.className = 'pv-back'; el.id = 'pv';
    el.innerHTML = `<div class="pv-sheet" role="dialog" aria-modal="true" aria-label="${_esc(o.title)}">
        <button class="pv-x" id="pv-x" aria-label="Close">✕</button>
        <div class="pv-media">${c && !_calm() ? `<video class="pv-vid" muted playsinline loop autoplay poster="${c.poster}" src="${c.video}"></video>` : c ? `<img class="pv-vid" src="${c.poster}" alt="">` : `<span class="pv-ico">${o.icon}</span>`}</div>
        <div class="pv-head"><span class="pv-icon">${o.icon}</span><b class="bfont pv-title">${_esc(o.title)}</b>${o.tag ? `<span class="cg ${o.tagClass || ''} pv-tag">${_esc(o.tag)}</span>` : ''}</div>
        ${o.desc ? `<p class="pv-desc">${o.desc}</p>` : ''}
        ${o.best ? `<p class="pv-best">${_esc(o.best)}</p>` : ''}
        ${o.blocked ? `<p class="pv-why">🚫 ${_esc(o.blocked)}</p>` : ''}
        <button class="go-btn bfont pv-play" id="pv-play" ${o.blocked ? 'disabled' : ''}>${_esc(o.playLabel || 'PLAY')} →</button>
    </div>`;
    document.body.appendChild(el);
    _sheet = el;
    requestAnimationFrame(() => el.classList.add('open'));
    const v = el.querySelector('video'); if (v) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    el.addEventListener('click', e => { if (e.target === el) closePreview(); });
    el.querySelector('#pv-x').addEventListener('click', closePreview);
    el.querySelector('#pv-play').addEventListener('click', () => { if (o.blocked) return; closePreview(); o.onPlay && o.onPlay(); });
    // swipe the sheet down to close
    const sh = el.querySelector('.pv-sheet'); let y0 = null;
    sh.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener('touchmove', e => { if (y0 == null) return; const dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sh.addEventListener('touchend', e => { const dy = y0 == null ? 0 : e.changedTouches[0].clientY - y0; y0 = null; sh.style.transform = ''; if (dy > 90) closePreview(); });
    _onKey = e => { if (e.key === 'Escape') closePreview(); };
    window.addEventListener('keydown', _onKey);
}
export function closePreview() {
    if (!_sheet) return;
    const el = _sheet; _sheet = null;
    el.querySelector('video')?.pause();
    // it slides away for a moment: give up its ids now, so a new sheet's are the only ones
    el.removeAttribute('id'); el.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    window.removeEventListener('keydown', _onKey);
    el.classList.remove('open');
    setTimeout(() => el.remove(), 220);
}
export const isOpen = () => !!_sheet;
