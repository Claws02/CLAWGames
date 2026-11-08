// ============================================================
// TABLETOP — the shared frame for quick two-player board games on one phone
// (Shut the Box first; Pig, Farkle, Mancala, Dots and Boxes, Liar's Dice to
// come). It does the parts every such game repeats, by claw-core's minigame
// contract (HundredBlockDash docs/MINIGAME_STANDARD.md R1–R7):
//
//   - its own id-less overlay in #minigame-layer, sized by one unit --c
//     (R4: from whichever axis binds, given the game's columns and rows)
//   - the phone lies flat between the players and the frame turns round to
//     face whoever's up (face(p)); against a bot it stays with the human
//   - one tap handler: any element with data-act="…" calls onAct(act, el)
//     unless the table is locked (mid-turn-round, or the bot's go)
//   - tracked timers (after) and cleanup, registered for a force-end (R3)
//   - the end card, readable from both ends, and one guarded onWin (R6)
//   - the shared look: a turn chip, a hint line, big buttons, scoreboard chips
//
// A game: const t = tabletop({ isBot, onWin, cls, css, html, cols, rows, onAct });
// then t.q(sel), t.face(p), t.lock(ms), t.botTurn(p), t.after(fn, ms),
// t.head(p, title, hint), t.wow(text), t.name(p), t.hex(p), t.end({ winner, standings, head, html }).
// Head markup: <div class="bt-head"><div class="bt-turn"></div><div class="bt-hint"></div></div>
// ============================================================
import { state } from '../../AppHost.js';
import { sfx, haptic } from '../../claw-core/engine/AudioManager.js';
import { registerMinigameCleanup } from '../../claw-core/minigames/MinigameManager.js';

export const TURN_MS = 450;   // the frame turning round to the next player

const BASE_CSS = `
.bt{background:#f4997b;position:absolute;inset:0;overflow:hidden;touch-action:none;font-family:Nunito,system-ui,sans-serif;user-select:none;-webkit-user-select:none;transition:background .45s}
.bt.p2{background:#7fb3e6}
.bt-frame{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--c)*.3);padding:12px;box-sizing:border-box;transition:transform ${TURN_MS}ms cubic-bezier(.5,0,.3,1)}
.bt-frame.flip{transform:rotate(180deg)}
.bt-head{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:calc(var(--c)*1.1)}
.bt-turn{font:calc(var(--c)*.42) 'Bebas Neue',Impact,sans-serif;letter-spacing:2px;color:#fff;padding:4px 16px;border-radius:999px;border:3px solid #3f4652}
.bt-hint{font-weight:800;font-size:calc(var(--c)*.24);color:#3f4652;min-height:1.3em;text-align:center}
.bt-btn{height:calc(var(--c)*1.1);min-width:calc(var(--c)*3.4);padding:0 calc(var(--c)*.4);border:0;border-radius:calc(var(--c)*.2);font:calc(var(--c)*.6) 'Bebas Neue',Impact,sans-serif;letter-spacing:2px;color:#fff;background:#d2584a;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18)}
.bt-btn.off{opacity:.4}
.bt-chips{display:flex;gap:calc(var(--c)*.3);align-items:center}
.bt-chip{display:flex;align-items:baseline;gap:6px;background:#fff;border:3px solid var(--pc);border-radius:999px;padding:2px 14px;font:800 calc(var(--c)*.2) Nunito,system-ui,sans-serif;color:#3f4652}
.bt-chip b{font:calc(var(--c)*.46) 'Bebas Neue',Impact,sans-serif}
.bt-chip.up{box-shadow:0 0 0 3px #3f4652}
.bt-row{display:flex;gap:calc(var(--c)*.25);align-items:center;justify-content:center}
.bt-btn.alt{background:#3f4652}
.bt-btn.go{background:#2fae67}
.bt-wow{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:calc(var(--c)*1.0) 'Bebas Neue',Impact,sans-serif;color:#ffd200;-webkit-text-stroke:3px #3f4652;letter-spacing:3px;text-align:center;animation:btwow 1.8s ease-out forwards}
@keyframes btwow{0%{transform:scale(.3) rotate(-10deg);opacity:0}20%{transform:scale(1.1) rotate(-4deg);opacity:1}80%{opacity:1}100%{transform:scale(1) rotate(-4deg);opacity:0}}
.bt-end{position:absolute;inset:0;display:flex;flex-direction:column;background:rgba(40,30,40,.55)}
.bt-endhalf{flex:1;display:flex;align-items:center;justify-content:center}
.bt-endhalf.top{transform:rotate(180deg)}
.bt-endbox{background:#fdecd2;border:4px solid #3f4652;border-radius:18px;padding:10px 18px;text-align:center;color:#3f4652;font-weight:800;max-width:86%}
.bt-endbox h2{margin:0 0 6px;font:normal 34px 'Bebas Neue',Impact,sans-serif;letter-spacing:2px}
.bt-endbox table{border-collapse:collapse;margin:0 auto 6px;font-size:14px}
.bt-endbox td,.bt-endbox th{padding:2px 10px}
.bt-endbox tr.t td{border-top:2px solid #3f4652;font:22px 'Bebas Neue',Impact,sans-serif}
.bt-endbox p{margin:0;font-size:12px;opacity:.7}
`;

export function tabletop({ isBot, onWin, cls = '', css = '', html, cols = 7.5, rows = 15, onAct }) {
    const timers = [], cleanups = [];
    let facing = 0, lockUntil = 0, ended = null;
    const t = {
        done: false, isBot, botSeat: isBot ? 1 : -1,
        name: p => (state.players?.[p]?.name || (p ? 'P2' : 'P1')).toUpperCase(),
        hex: p => state.players?.[p]?.hex || (p ? '#3b9dff' : '#ff4d6d'),
        after(fn, ms) { const id = setTimeout(() => { timers.splice(timers.indexOf(id), 1); if (!t.done) fn(); }, ms); timers.push(id); return id; },
        q: s => t.el.querySelector(s), qa: s => [...t.el.querySelectorAll(s)],
        /** Is it the bot's go (seat p)? */
        botTurn: p => isBot && p === 1,
        /** Turn the frame round to face player p (the human's end, against a bot). */
        face(p, first = false) {
            const f = isBot ? 0 : p;
            if (f === facing && !first) return;
            facing = f; t.frame.classList.toggle('flip', f === 1);
            if (!first) t.lock(TURN_MS);
        },
        /** The head: whose go it is (the chip and the table turn their colour) and the hint line. */
        head(p, title, hint = '') {
            const tu = t.q('.bt-turn'), hi = t.q('.bt-hint');
            if (tu) { tu.textContent = title; tu.style.background = t.hex(p); }
            if (hi) hi.textContent = hint;
            t.el.classList.toggle('p2', p === 1);
        },
        /** A big word that pops up over the table and fades. */
        wow(text) { const d = document.createElement('div'); d.className = 'bt-wow'; d.textContent = text; t.frame.appendChild(d); t.after(() => d.remove(), 1900); },
        lock(ms) { lockUntil = Math.max(lockUntil, performance.now() + ms); },
        locked: () => performance.now() < lockUntil,
        /** The end card (from both ends; against a bot, the human's only), then onWin. */
        end({ winner, standings, head, html: body = '' }) {
            if (ended) return;
            ended = { winner, standings };
            lockUntil = Infinity;
            sfx(winner < 0 ? 'land_bad' : 'mg_win'); haptic('heavy');
            const box = `<div class="bt-endbox"><h2>${head}</h2>${body}<p>TAP TO FINISH</p></div>`;
            const e = document.createElement('div');
            e.className = 'bt-end'; e.dataset.act = '__end';
            e.innerHTML = (isBot ? '' : `<div class="bt-endhalf top">${box}</div>`) + `<div class="bt-endhalf">${box}</div>`;
            t.el.appendChild(e);
            t.after(finish, 9000);
        },
        destroy,
    };

    function finish() {
        if (t.done || !ended) return;
        const { winner, standings } = ended;
        state.mgActive = false;
        destroy();
        onWin(winner, undefined, standings);
    }
    function destroy() {
        t.done = true;
        timers.forEach(clearTimeout); timers.length = 0;
        cleanups.forEach(f => { try { f(); } catch (e) {} }); cleanups.length = 0;
        if (t.el) { t.el.remove(); t.el = null; }
    }
    function resize() {
        if (!t.el) return;
        const w = t.el.clientWidth || window.innerWidth, h = t.el.clientHeight || window.innerHeight;
        t.el.style.setProperty('--c', Math.floor(Math.max(28, Math.min((w - 24) / cols, (h - 24) / rows, 92))) + 'px');
    }

    registerMinigameCleanup(destroy);
    const mg = document.getElementById('minigame-layer');
    t.el = document.createElement('div');
    t.el.className = `bt ${cls}`;
    t.el.innerHTML = `<style>${BASE_CSS}${css}</style><div class="bt-frame">${html}</div>`;
    t.frame = t.el.querySelector('.bt-frame');
    const down = e => {
        if (t.done) return;
        const el = e.target.closest('[data-act]');
        if (!el) return;
        e.preventDefault();
        if (el.dataset.act === '__end') return finish();
        if (t.locked()) return;
        onAct(el.dataset.act, el);
    };
    t.el.addEventListener('pointerdown', down);
    cleanups.push(() => t.el && t.el.removeEventListener('pointerdown', down));
    window.addEventListener('resize', resize);
    cleanups.push(() => window.removeEventListener('resize', resize));
    mg.appendChild(t.el);
    resize();
    return t;
}
