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
    if (!surfacesOf(type).sharedMany) return blockedReason(type, 'many') || '1v1 only';
    // Same rule as HundredBlockDash's arcade: three always fits a phone; four
    // needs the screen to have room for four split zones.
    const w = Math.max(window.innerWidth || 0, 320), h = Math.max(window.innerHeight || 0, 480);
    if (n >= 4 && !MinigameLayout.frameFor(MinigameLayout.SHAPES.SPLIT, 4, w, h).ok) return 'Needs a tablet at 4 — try 3';
    return '';
}
export const eligible = n => allTypes().filter(t => !whyNot(t, n));
