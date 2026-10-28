// ============================================================
// HOME SCREEN TIP — "Share → Add to Home Screen" for iPhone Safari, which has
// no install prompt of its own. Shown on the home and Play Together screens
// (where a TV's QR invite lands); never once running from the Home Screen,
// in the Capacitor app, inside a frame, or after it's been dismissed.
// ============================================================
import * as Store from './Store.js';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS asks for the desktop site
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export function init() {
    const tips = document.querySelectorAll('.a2hs');
    const want = isIOS() && !standalone() && !window.Capacitor?.isNativePlatform?.()
        && window.top === window && !Store.load('a2hsDismissed', false);
    tips.forEach(t => {
        t.hidden = !want;
        t.querySelector('.a2hs-x').addEventListener('click', () => {
            Store.save('a2hsDismissed', true);
            tips.forEach(x => { x.hidden = true; });
        });
    });
}
