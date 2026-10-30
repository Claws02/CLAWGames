// ============================================================
// PHONE GAME — the frame for the arcade's online-only games (Stop the Clock,
// Higher or Lower, Trivia). Each is played alone on a phone through
// claw-core's SoloArena, every phone from the same seed, and reports one
// score: so a room of twelve is no harder than a room of two.
//
//   mount(bg)          a full-screen panel inside #minigame-layer
//   button(...)        a big tap target
//   neutral(text)      the manager's status pill
//   finishSolo(...)    report the score after a beat
//   notSolo(onWin)     started on a shared screen: stand down as a draw
// ============================================================
import * as Solo from '../claw-core/minigames/SoloArena.js';

export const neutral = text => { const n = document.getElementById('mg-neutral'); if (n) n.textContent = text; };

/** A panel over the whole minigame layer, laid out top to bottom. */
export function mount(bg) {
    const mg = document.getElementById('minigame-layer');
    const root = document.createElement('div');
    root.className = 'phone-game';
    root.style.cssText = 'position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:16px;padding:calc(env(safe-area-inset-top) + 64px) 20px calc(env(safe-area-inset-bottom) + 72px);box-sizing:border-box;' +
        `background:${bg};color:#fff8ee;text-align:center;font-family:Nunito,system-ui,sans-serif;font-weight:800;` +
        'user-select:none;-webkit-user-select:none;touch-action:manipulation;overflow:hidden;';
    mg.appendChild(root);
    const el = (css, parent = root, tag = 'div') => { const e = document.createElement(tag); e.style.cssText = css; parent.appendChild(e); return e; };
    return { root, el };
}

/** A chunky button; `onTap` fires on pointerdown so a fast tap is never lost. */
export function button(parent, label, color, onTap) {
    const b = document.createElement('button');
    b.className = 'bfont';
    b.innerHTML = label;
    b.style.cssText = `min-width:130px;min-height:72px;padding:10px 18px;border:4px solid #2b1240;border-radius:20px;background:${color};` +
        'color:#2b1240;font-size:30px;letter-spacing:1px;box-shadow:0 6px 0 #2b1240;touch-action:manipulation;cursor:pointer;';
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (!b.disabled) onTap(); });
    parent.appendChild(b);
    return b;
}

/** Show the final line, then hand SoloArena the score. */
export function finishSolo(score, line, destroy) {
    neutral(line);
    setTimeout(() => { destroy(); Solo.soloFinish(score); }, 1400);
}

/** These games have no shared-screen mode; if one is ever started there, it ends drawn. */
export function notSolo(onWin) {
    if (Solo.isSolo()) return false;
    setTimeout(() => onWin?.(-1, null, null), 0);
    return true;
}
