// ============================================================
// PIECES — the players' own characters as board-game pieces (Tide Lines,
// Kelp Maze, Claw Race). Each seat's character (the profile's pick, or the
// seat's default) is rendered once in the seat's colour by the arcade's
// portrait renderer and cached; where there's no WebGL the emoji stands in.
//
//   prepare(n)        render the portraits for seats 0..n-1 (call at start)
//   faceUrl(p)        seat p's portrait as a data URL, or null
//   pieceHTML(p, cls) an <img> of it, or the emoji, with class cls
// ============================================================
import { state } from '../../AppHost.js';
// Namespace, not named: a phone with an older cached Characters.js still boots.
import * as Characters from '../../arcade/Characters.js';

const DEFAULT = ['slime', 'boxy', 'bunny', 'ghost'];
const _urls = new Map();

const _seat = p => {
    const pl = state.players?.[p] || {};
    return { type: pl.charType || DEFAULT[p % 4], color: typeof pl.color === 'number' ? pl.color : [0xff4d6d, 0x3b9dff, 0x2fd67b, 0xffc928][p % 4] };
};

export function prepare(n = 2) {
    _urls.clear();
    for (let p = 0; p < n; p++) {
        const { type, color } = _seat(p);
        let url = null;
        try { url = Characters.portraits?.([type], color, 128)?.[type] || null; } catch (e) { url = null; }
        _urls.set(p, url);
    }
}

export const faceUrl = p => _urls.get(p) || null;

export function pieceHTML(p, cls = 'pc-face') {
    const url = faceUrl(p);
    if (url) return `<img class="${cls}" src="${url}" alt="" draggable="false">`;
    const c = Characters.charOf?.(_seat(p).type);
    return `<span class="${cls} emoji">${c?.icon || '🦀'}</span>`;
}
