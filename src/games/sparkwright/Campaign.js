// ============================================================
// CAMPAIGN — the whole game in one box: Home Base ↔ shifts, never out.
//
//   const c = createCampaign(root, { store, onExit, unlockAll, sfx })
//   c.destroy()   c.progress   c.scene → 'hub' | levelId   c.game (live Game)
//
// Home Base is a walkable hub (levels/base.js). Walk to a door, ▲ or ENTER:
// the shift starts. Finish it → SHIFT COMPLETE → BACK TO BASE puts you at the
// same door, with the next door unlocked. ✕ in a shift goes back to base too;
// only ✕ at Home Base leaves (onExit). The Field Manual door lists every
// formula you've earned.
// ============================================================
import { LEVELS, HUB } from './levels/index.js';
import { CONCEPTS } from './core/Rules.js';
import { createGame } from './Game.js';
import { createProgress } from './Progress.js';
import { TAPES } from './levels/tapes.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = id => String(LEVELS.findIndex(l => l.id === id) + 1).padStart(2, '0');
const conceptTitle = id => CONCEPTS.find(c => c.id === id)?.title || id;

const CSS = `
.swr-manual{position:absolute;inset:0;z-index:20;background:#0b1622f2;overflow:auto;padding:calc(18px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom));font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d8ecff}
.swr-manual h2{margin:0 0 4px;color:#ffcf3d;letter-spacing:.14em;font-size:18px}
.swr-manual .sub{color:#6f8fae;font-size:12px;margin-bottom:14px}
.swr-manual .c{border:1px solid #2c4a66;border-left:3px solid #5cb8e6;border-radius:6px;padding:10px 12px;margin-bottom:10px;max-width:560px}
.swr-manual .c.no{border-left-color:#2c4a66;opacity:.55}
.swr-manual .t{font-weight:700}.swr-manual .f{color:#47e6ff;margin:4px 0;font-size:14px}.swr-manual .n{font-size:12px;line-height:1.5;color:#9fbad3}
.swr-manual button{position:sticky;top:0;float:right;background:#5cb8e6;color:#0b1622;border:0;border-radius:8px;font:inherit;font-weight:700;padding:10px 14px}
`;

export function createCampaign(root, { store, onExit, unlockAll = false, sfx = null } = {}) {
    if (!document.getElementById('swr-campaign-css')) {
        const st = document.createElement('style'); st.id = 'swr-campaign-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const progress = createProgress(store, { levels: LEVELS, unlockAll });
    let game = null, scene = null, manual = null, dead = false;

    const doorOf = to => HUB.devices.find(d => d.type === 'portal' && d.to === to);

    function stateOf(pt) {
        if (pt.to === 'manual') return 'manual';
        if (pt.to === 'soon') return 'soon';
        if (!progress.isUnlocked(pt.to)) return 'locked';
        if (progress.stars(pt.to) === 3) return 'star';
        return progress.isDone(pt.to) ? 'done' : 'open';
    }

    function infoOf(pt) {
        if (pt.to === 'manual') {
            const n = progress.learned().size;
            return { head: 'FIELD MANUAL', lines: [`Every formula you've earned: ${n} of ${CONCEPTS.length}.`, '▲ or ENTER to read it.'] };
        }
        if (pt.to === 'soon') return { head: 'DRONE BAY · LOCKED', lines: ['Opens in a future update: build a drone from parts.', 'Thrust-to-weight, battery energy, props, payloads.'] };
        const l = LEVELS.find(x => x.id === pt.to);
        const head = `${num(l.id)} · ${l.name.toUpperCase()}`;
        const learns = l.teaches.map(conceptTitle).join(' · ');
        if (!progress.isUnlocked(l.id)) {
            const prev = LEVELS[LEVELS.indexOf(l) - 1];
            return { head: `${head} · LOCKED`, bad: true, lines: [`Finish ${num(prev.id)} ${prev.name} to unlock.`, learns && `Teaches: ${learns}`] };
        }
        const b = progress.best(l.id), st = progress.stars(l.id);
        return { head, lines: [
            l.workOrder ? `Work order: ${l.workOrder.title}` : '',
            b == null ? 'Not cleared yet' : `Best ${b.toFixed(2)} s · ${'★'.repeat(st)}${'☆'.repeat(3 - st)}`,
            '▲ or ENTER to start the shift.',
        ] };
    }

    function hudText() {
        const s = progress.summary();
        return `${s.done}/${s.total} shifts · ${s.stars}/${s.maxStars}★`;
    }

    function swap(make) {
        closeManual();
        if (game) { try { game.destroy(); } catch (e) {} game = null; }
        if (dead) return;
        game = make();
    }

    function toHub(fromId = null, intro = null) {
        scene = 'hub';
        const at = doorOf(fromId || progress.lastDoor) || null;
        swap(() => createGame(root, {
            level: HUB, title: 'HOME BASE', hudText: hudText(),
            spawnAt: at ? { x: at.x, y: at.y } : null,
            intro,
            sfx,
            onExit: () => onExit?.(),
            hub: {
                state: stateOf,
                stars: pt => (LEVELS.some(l => l.id === pt.to) && progress.isDone(pt.to) ? progress.stars(pt.to) : null),
                info: infoOf,
                onEnter(pt) {
                    if (pt.to === 'manual') { openManual(); return; }
                    if (pt.to === 'soon') { game.flash('The Drone Bay opens in a future update.'); sfx?.('locked'); return; }
                    if (!progress.isUnlocked(pt.to)) { game.flash('Locked: finish the shift before it first.'); sfx?.('locked'); return; }
                    sfx?.('door');
                    play(pt.to);
                },
            },
        }));
    }

    function play(id) {
        const level = LEVELS.find(l => l.id === id);
        if (!level) return toHub();
        scene = id;
        progress.setLastDoor(id);
        let rec = null;
        swap(() => createGame(root, {
            level, title: `${num(id)} · ${level.name.toUpperCase()}`, sfx,
            // QA only (qa/sparkwright.js): the shift plays its solver tape.
            tape: window.__swrAutoplay ? TAPES[id] || null : null,
            onExit: () => toHub(id),
            onWin: r => { rec = progress.record(level, r); },
            cardExtra: () => {
                const out = [];
                if (rec?.moreStars && !rec.firstClear) out.push('More stars than last time!');
                else if (rec?.newBest && !rec.firstClear) out.push('New best time!');
                if (rec?.unlocked) out.push(`Unlocked: ${num(rec.unlocked.id)} ${rec.unlocked.name}`);
                if (rec?.allDone && rec.firstClear) out.push('Every shift cleared. The Drone Bay is next.');
                return out;
            },
            nextLabel: 'BACK TO BASE ▶',
            onNext: () => {
                const u = rec?.unlocked, d = u && doorOf(u.id);
                toHub(id, u ? { head: 'NEW SHIFT UNLOCKED', lines: [`${num(u.id)} · ${u.name} — its door is open.`], at: d ? { x: d.x, y: d.y - 1 } : null }
                    : rec?.allDone && rec.firstClear ? { head: 'ALL SHIFTS CLEARED', lines: ['Go back for ★★★ on every work order, or read the Field Manual.'] } : null);
            },
        }));
    }

    function openManual() {
        if (manual) return;
        game?.pause(true);
        const learned = progress.learned();
        manual = document.createElement('div');
        manual.className = 'swr-manual';
        manual.innerHTML = `<button type="button">CLOSE ✕</button><h2>FIELD MANUAL</h2><div class="sub">${learned.size} of ${CONCEPTS.length} learned · clear shifts to fill it in</div>` +
            CONCEPTS.map(c => learned.has(c.id)
                ? `<div class="c"><div class="t">${esc(c.title)}</div>${c.formula ? `<div class="f">${esc(c.formula)}</div>` : ''}<div class="n">${esc(c.note)}</div></div>`
                : `<div class="c no"><div class="t">???</div><div class="n">Taught in ${esc(teacherOf(c.id))}.</div></div>`).join('');
        manual.querySelector('button').addEventListener('click', closeManual);
        root.appendChild(manual);
    }
    function closeManual() {
        if (!manual) return;
        manual.remove(); manual = null;
        game?.pause(false);
    }
    function teacherOf(cid) {
        const l = LEVELS.find(x => x.teaches.includes(cid));
        return l ? `${num(l.id)} ${l.name}` : 'a future shift';
    }

    toHub(null, progress.summary().done ? null : { head: 'WELCOME TO HOME BASE', lines: ['Walk right to door 01 and press ▲ to start your first shift.', 'Finish a shift and you come back here.'] });

    return {
        get progress() { return progress; },
        get scene() { return scene; },
        get game() { return game; },
        play, toHub,
        destroy() { dead = true; closeManual(); if (game) { try { game.destroy(); } catch (e) {} game = null; } },
    };
}
