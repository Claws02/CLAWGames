// ============================================================
// PLAYROOM PARKOUR in the SOLO hub — the whole game (the Toy Box + every
// course) as one solo game card (src/arcade/SoloHub.js contract):
//   meta · mount(el) · unmount() · bestText()
// Full screen like Tiny Planet; ✕ in the Toy Box goes back to the hub list.
// The hero is your own character (seat 1's pick), drawn by the arcade's
// portrait renderer. Progress is saved with the arcade's Store under 'parkour'.
// ============================================================
// Namespaces, not named imports: a phone with an older cached module still boots.
import * as Store from '../../arcade/Store.js';
import * as Seats from '../../arcade/Seats.js';
import * as Characters from '../../arcade/Characters.js';
import * as Arcade from '../../host/ArcadeState.js';
import * as Audio from '../../claw-core/engine/AudioManager.js';
import { createCampaign } from './Campaign.js';
import { createProgress } from './Progress.js';
import { COURSES } from './levels/index.js';

const KEY = 'parkour';
export const meta = {
    id: 'parkour', icon: '🧸', title: 'Playroom Parkour',
    blurb: 'Your character, tiny, in a giant toy room. Bounce on sponges, ride toy cars, swing on yo-yos, slide on ice and walk on the ceiling. Every course starts and ends in the Toy Box: finish one and the next door opens. Find the 3 coins and beat par for ★★★.',
};

const store = { load: () => Store.load(KEY, null), save: v => Store.save(KEY, v) };

// Engine events → the arcade's own sounds (claw-core AudioManager names).
const SFX = { jump: 'clack', bounce: 'boost', spring: 'boost', cannon_in: 'gate_roll', cannon_fire: 'boom', coin: 'coin_gain', flag: 'bell', death: 'land_bad', win: 'mg_win', door: 'gate_open', locked: 'land_bad', splash: 'splash', leap: 'splash', flip: 'swap', grab: 'kick', wobble: 'clack' };
const sfx = type => { const n = SFX[type]; if (n) { try { Audio.sfx(n); } catch (e) {} } };

let _wrap = null, _camp = null;

export function bestText() {
    const s = createProgress(store, { courses: COURSES }).summary();
    return s.done ? `${s.done}/${s.total} courses · ${s.stars}★` : '';
}

/** Your character as an <img>, or null where there's no WebGL (the emoji stands in). */
function heroImage() {
    let type = 'slime', color = 0xff4d6d;
    try { type = Seats.seatChar?.(0) || type; color = Arcade.SEAT_STYLE?.[0]?.color ?? color; } catch (e) {}
    let url = null;
    try { url = Characters.portraits?.([type], color, 160)?.[type] || null; } catch (e) { url = null; }
    let emoji = '🦀';
    try { emoji = Characters.charOf?.(type)?.icon || emoji; } catch (e) {}
    if (!url) return { img: null, emoji };
    const img = new Image();
    img.src = url;
    return { img, emoji };
}

export function mount(el) {
    unmount();
    _wrap = document.createElement('div');
    _wrap.className = 'ppk-full';
    _wrap.style.cssText = 'position:fixed;inset:0;z-index:800;background:#f1c78c;';
    el.appendChild(_wrap);
    const { img, emoji } = heroImage();
    _camp = createCampaign(_wrap, {
        store, sfx, hero: img, heroEmoji: emoji,
        onExit: () => document.querySelector('#scr-sologame [data-back]')?.click(),
    });
    window.__ppkCampaign = _camp;   // qa/parkour.js reads it
}

export function unmount() {
    if (_camp) { try { _camp.destroy(); } catch (e) {} _camp = null; }
    if (_wrap) { _wrap.remove(); _wrap = null; }
    if (window.__ppkCampaign) window.__ppkCampaign = null;
}
