// ============================================================
// SHARE — a daily result, as a short text for a group chat.
//
// The phone's own share sheet when it has one (iPhone, Android), the
// clipboard otherwise. Nothing is sent anywhere by the game itself.
//
//   dailyText('Ice Floe', '7 slides · ★★★')  → the text
//   share(text)                               → 'shared' | 'copied' | 'cancelled' | 'failed'
//   button(text)                              → a SHARE button that does it
// ============================================================
import * as Solo from './SoloStats.js';
import * as Toast from './Toast.js';

export const URL = 'https://claws02.github.io/CLAWGames/';

export function dailyText(game, result, day = Solo.today()) {
    const streak = Solo.streak();
    return `🦀 CLAW Games daily · ${day}\n${game}: ${result}\n${streak ? `🔥 ${streak}-day streak\n` : ''}${URL}`;
}

export async function share(text) {
    try {
        if (navigator.share) { await navigator.share({ text }); return 'shared'; }
    } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
    }
    try {
        await navigator.clipboard.writeText(text);
        Toast.show('📋 Copied: paste it in your group chat');
        return 'copied';
    } catch (e) {
        Toast.show("Couldn't share from here");
        return 'failed';
    }
}

/** A ready-made SHARE button for a result. */
export function button(text) {
    const b = document.createElement('button');
    b.className = 'ghost-btn bfont share-btn';
    b.textContent = '📤 SHARE';
    b.addEventListener('click', () => share(text));
    return b;
}
