// ============================================================
// CAMPAIGN — the whole game in one box: the Toy Box ↔ courses, never out.
//
//   const c = createCampaign(root, { store, onExit, unlockAll, sfx, hero, heroSheet, heroEmoji })
//   c.destroy()   c.progress   c.scene → 'hub' | courseId   c.game (live Game)   c.play(id)   c.toHub(id)
//
// The Toy Box is a walkable hub (levels/base.js). Walk to a door, ▲: the
// course starts. Finish it → COURSE CLEAR → BACK TO THE TOY BOX puts you at
// the same door, with the next door open. ✕ in a course goes back to the Toy
// Box too; only ✕ in the Toy Box leaves (onExit).
// ============================================================
import { COURSES, HUB } from './levels/index.js';
import { createGame } from './Game.js';
import { createProgress } from './Progress.js';
import { TAPES } from './levels/tapes.js';

const num = id => String(COURSES.findIndex(c => c.id === id) + 1);

export function createCampaign(root, { store, onExit, unlockAll = false, sfx = null, hero = null, heroSheet = null, heroEmoji = '🦀' } = {}) {
    const progress = createProgress(store, { courses: COURSES, unlockAll });
    let game = null, scene = null, dead = false;
    const doorOf = to => HUB.devices.find(d => d.type === 'portal' && d.to === to);
    const floorOf = id => { const y = doorOf(id)?.y ?? 99; return y < 8 ? 3 : y < 16 ? 2 : 1; };   // the Toy Box's floor, middle shelf, top shelf
    const upstairs = id => floorOf(id) > 1;

    function stateOf(pt) {
        if (pt.to === 'soon') return 'soon';
        if (!progress.isUnlocked(pt.to)) return 'locked';
        if (progress.stars(pt.to) === 3) return 'star';
        return progress.isDone(pt.to) ? 'done' : 'open';
    }
    function portalInfo(pt) {
        if (pt.to === 'soon') return { icon: '🎁', label: 'MORE SOON', stars: null };
        const c = COURSES.find(x => x.id === pt.to);
        return { icon: c.icon, label: `${num(c.id)} · ${c.name.toUpperCase()}`, stars: progress.isDone(c.id) ? progress.stars(c.id) : null };
    }
    function infoOf(pt) {
        if (pt.to === 'soon') return { head: 'MORE COURSES SOON', lines: ['New toys to play on are on the way.'], bad: true };
        const c = COURSES.find(x => x.id === pt.to);
        const head = `${num(c.id)} · ${c.name.toUpperCase()}`;
        if (!progress.isUnlocked(c.id)) {
            const prev = COURSES[COURSES.indexOf(c) - 1];
            return { head: `${head} · LOCKED`, bad: true, lines: [`Finish ${num(prev.id)} · ${prev.name} to open this door.`] };
        }
        const b = progress.best(c.id);
        return { head, lines: [
            c.brief,
            b == null ? `Par ${c.par.seconds} s · 3 coins to find` : `${'★'.repeat(progress.stars(c.id))}${'☆'.repeat(3 - progress.stars(c.id))} · best ${b.toFixed(1)} s (par ${c.par.seconds} s) · coins ${countBits(progress.coins(c.id))}/3`,
            'Press ▲ to play!',
        ] };
    }
    const countBits = b => { let n = 0; for (; b; b >>= 1) n += b & 1; return n; };

    function hudText() {
        const s = progress.summary();
        return `★ ${s.stars}/${s.max}`;
    }

    function swap(make) {
        if (game) { try { game.destroy(); } catch (e) {} game = null; }
        if (dead) return;
        game = make();
    }

    function toHub(fromId = null, intro = null) {
        scene = 'hub';
        const at = doorOf(fromId || progress.lastDoor) || null;
        swap(() => createGame(root, {
            level: HUB, title: 'THE TOY BOX', hudText: hudText(), hero, heroSheet, heroEmoji, sfx,
            spawnAt: at ? { x: at.x, y: at.y } : null,
            intro,
            onExit: () => onExit?.(),
            hub: {
                state: stateOf, info: infoOf, portalInfo,
                onEnter(pt) {
                    if (pt.to === 'soon') { game.flash('More courses are on the way!', 'COMING SOON', 2, true); sfx?.('locked'); return; }
                    if (!progress.isUnlocked(pt.to)) { game.flash('Finish the course before it first.', 'LOCKED', 2, true); sfx?.('locked'); return; }
                    sfx?.('door');
                    play(pt.to);
                },
            },
        }));
    }

    function play(id) {
        const course = COURSES.find(c => c.id === id);
        if (!course) return toHub();
        scene = id;
        progress.setLastDoor(id);
        let rec = null;
        swap(() => createGame(root, {
            level: course, title: `${num(id)} · ${course.name.toUpperCase()}`, hero, heroSheet, heroEmoji, sfx,
            // QA only (qa/parkour.js): the course plays the checker's ★★★ route.
            tape: window.__ppkAutoplay ? TAPES[id]?.all || TAPES[id]?.goal || null : null,
            onExit: () => toHub(id),
            onWin: r => { rec = progress.record(course, r); },
            cardExtra: () => {
                const out = [];
                if (rec?.newBest && !rec.firstClear) out.push('New best time!');
                if (rec?.newStars > 0 && !rec.firstClear) out.push(`+${rec.newStars} ★ for this course`);
                if (rec?.unlocked) out.push(`Door ${num(rec.unlocked.id)} is open: ${rec.unlocked.name}!`);
                if (rec?.allDone && rec.firstClear) out.push('Every course cleared! Can you get every ★?');
                return out;
            },
            onNext: () => {
                const u = rec?.unlocked;
                const up = u && floorOf(u.id) > floorOf(id) ? (floorOf(u.id) === 3 ? ' It\'s on the top shelf: two jack-in-the-boxes take you up.' : ' It\'s upstairs: the jack-in-the-box takes you up.') : '';
                toHub(id, u ? { head: 'NEW DOOR OPEN!', lines: [`${num(u.id)} · ${u.name} is ready.${up}`] }
                    : rec?.allDone && rec.firstClear ? { head: 'ALL COURSES CLEARED!', lines: ['Go back for the ★ you missed.'] } : null);
            },
        }));
    }

    const s0 = progress.summary();
    // Back after new courses arrived upstairs (and you've unlocked them): say where they are.
    const newUp = s0.done && COURSES.some(c => upstairs(c.id) && progress.isUnlocked(c.id) && !progress.isDone(c.id));
    toHub(null, !s0.done ? { head: 'WELCOME TO THE TOY BOX!', lines: ['Walk to door 1 and press ▲ to play. Finish a course and you come back here.'] }
        : newUp ? { head: 'NEW COURSES UPSTAIRS!', lines: ['The jack-in-the-boxes take you up: by the right wall to doors 5–8, then by the left wall up there to 9–12.'] } : null);

    return {
        get progress() { return progress; },
        get scene() { return scene; },
        get game() { return game; },
        get heroSheet() { return heroSheet; },
        play, toHub,
        destroy() { dead = true; if (game) { try { game.destroy(); } catch (e) {} game = null; } },
    };
}
