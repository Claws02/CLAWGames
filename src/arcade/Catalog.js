// ============================================================
// CATALOG — which games exist and which can be played by the current table.
// All of it is read from claw-core's registry; nothing is duplicated here.
// ============================================================
import { MG_TYPES, MG_INFO, MG_GENRES, profileOf, surfacesOf, blockedReason }
    from '../claw-core/config/MinigameRegistry.js';
import * as MinigameLayout from '../claw-core/config/MinigameLayout.js';

export { MG_INFO, MG_GENRES };
export const allTypes = () => MG_TYPES.filter(t => MG_INFO[t]);
export const genreOf = type => profileOf(type).genre;
// The rules as the arcade tells them: coin games carry board payout copy
// ("REAL money, everybody keeps it") that is not true here, and a plain
// version beside it.
export const descOf = type => (MG_INFO[type] && (MG_INFO[type].descPlain || MG_INFO[type].desc)) || '';

// Why `type` can't seat `n` players on this screen, or '' if it can.
export function whyNot(type, n) {
    if (n <= 2) return '';
    const s = surfacesOf(type);
    if (!s.sharedMany) return blockedReason(type, 'many') || '1v1 only';
    // Same rule as HundredBlockDash's arcade: a game that shares one scene and
    // only splits the controls plays 3-4 on any screen; a game that gives each
    // player a playfield of their own (manyDevice 'tablet') needs room for one
    // each, which a phone has at neither three nor four.
    if (s.manyDevice !== 'tablet') return '';
    const w = Math.max(window.innerWidth || 0, 320), h = Math.max(window.innerHeight || 0, 480);
    return MinigameLayout.frameFor(MinigameLayout.SHAPES.SPLIT, n, w, h).ok ? '' : `Needs a tablet at ${n}`;
}
export const eligible = n => allTypes().filter(t => !whyNot(t, n));
