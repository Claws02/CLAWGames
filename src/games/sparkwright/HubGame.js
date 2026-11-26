// ============================================================
// SPARKWRIGHT in the SOLO hub — the full campaign (Home Base + every shift)
// as one solo game card (src/arcade/SoloHub.js contract):
//   meta · mount(el) · unmount() · bestText()
// Full screen like Tiny Planet; ✕ at Home Base goes back to the hub list.
// Progress is saved with the arcade's Store under 'sparkwright'.
// ============================================================
import * as Store from '../../arcade/Store.js';
import * as Audio from '../../claw-core/engine/AudioManager.js';
import { createCampaign } from './Campaign.js';
import { createProgress } from './Progress.js';
import { LEVELS } from './levels/index.js';

const KEY = 'sparkwright';
export const meta = {
    id: 'sparkwright', icon: '🔧', title: 'Sparkwright',
    blurb: 'A field-engineer platformer. From Home Base, take on shifts: fit springs, gearboxes, resistors and batteries into sockets, and let the real maths get you through. Pick wrong and you see why: the fuse blows, the lift stalls. Every shift you clear adds a formula to your Field Manual.',
};

const store = { load: () => Store.load(KEY, null), save: v => Store.save(KEY, v) };

// Engine events → the arcade's own sounds (claw-core AudioManager names).
const SFX = { jump: 'clack', spring: 'boost', install: 'buy', fuse: 'boom', stall: 'land_bad', death: 'mg_lose', win: 'mg_win', door: 'gate_open', locked: 'land_bad', power_on: 'shield' };
const sfx = type => { const n = SFX[type]; if (n) { try { Audio.sfx(n); } catch (e) {} } };

let _wrap = null, _camp = null;

export function bestText() {
    const s = createProgress(store, { levels: LEVELS }).summary();
    return s.done ? `${s.done}/${s.total} shifts · ${s.stars}/${s.maxStars}★` : '';
}

export function mount(el) {
    unmount();
    _wrap = document.createElement('div');
    _wrap.className = 'swr-full';
    _wrap.style.cssText = 'position:fixed;inset:0;z-index:800;background:#0b1622;';
    el.appendChild(_wrap);
    _camp = createCampaign(_wrap, {
        store, sfx,
        onExit: () => document.querySelector('#scr-sologame [data-back]')?.click(),
    });
    window.__swrCampaign = _camp;   // qa/sparkwright.js reads it
}

export function unmount() {
    if (_camp) { try { _camp.destroy(); } catch (e) {} _camp = null; }
    if (_wrap) { _wrap.remove(); _wrap = null; }
    if (window.__swrCampaign) window.__swrCampaign = null;
}
