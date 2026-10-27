// ============================================================
// GOLF — the Mini Golf mode: pick a course, 3, 9 or 18 holes, turns, tabletop or chaos.
//
// The game itself is claw-core's MiniGolf; this is the clubhouse round it:
// the course cards with each one's best round, the setting for how a round is
// played (which parties use too), and the records kept after each round.
//
//   init()                    apply the saved solo/turns/tabletop/chaos setting to the game
//   paint(onStart, onChange)  the setup screen; onStart() once START is pressed,
//                             onChange() after every repaint (the seats strip follows Solo)
//   configureNext()           hand the chosen course and holes to the game
//   record(round, names, bots) after any round of mini golf (party or mode):
//                             aces and rounds counted, bests kept for full
//                             courses played by a human. Returns what's new.
//   stats()                   { rounds, aces, fullRounds, underPar } for trophies
// ============================================================
import * as Store from './Store.js';
import * as MiniGolf from '../claw-core/minigames/MiniGolf.js';

const HOLES = [3, 9, 18];
const ICON = { backyard: '🏡', pirate: '🏴‍☠️', candy: '🍭', space: '🚀' };

let _s = Store.load('golf', null) || {};
_s = { course: 'backyard', holes: 9, mode: 'turns', best: {}, rounds: 0, aces: 0, fullRounds: 0, underPar: 0, last: null, tricks: {}, ..._s };
_s.tricks = _s.tricks || {};
const _save = () => Store.save('golf', _s);

const $ = id => document.getElementById(id);
const _fmt = d => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

export function init() { MiniGolf.configure({ mode: _gameMode(_s.mode), table: _s.mode === 'table' }); }
export const settings = () => ({ course: _s.course, holes: _s.holes, mode: _s.mode });
export const stats = () => ({ rounds: _s.rounds, aces: _s.aces, fullRounds: _s.fullRounds, underPar: _s.underPar,
    trickStars: Object.values(_s.tricks).reduce((a, n) => a + n, 0), tricksDone: Object.values(_s.tricks).filter(n => n > 0).length, tricks: (MiniGolf.CHALLENGES || []).length });
/** A trick shot to play next: the game's own challenge, handed over for one go. */
export function configureChallenge(ch) { MiniGolf.configure({ challenge: ch, mode: 'turns', table: false, round: true }); }
export const best = (course, holes) => _s.best[`${course}:${holes}`] || null;

// Solo is this screen's own: the game plays it as turns with one seat (see main.js play()).
// Tabletop is turns too, with the phone flat between two ends: the game turns the
// picture round to whoever's up instead of asking for the phone to be passed.
const _gameMode = m => (m === 'chaos' ? 'chaos' : 'turns');
export function setMode(m) { _s.mode = ['solo', 'chaos', 'table'].includes(m) ? m : 'turns'; _save(); MiniGolf.configure({ mode: _gameMode(_s.mode), table: _s.mode === 'table' }); }

/** The chosen course and length go to the game for its next round only. */
export function configureNext() {
    MiniGolf.configure({ course: _s.course, holes: _s.holes === 3 ? 'sampler' : _s.holes, mode: _gameMode(_s.mode), table: _s.mode === 'table', round: true });
}

/**
 * After any round of mini golf. `names` and `bots` are the table, by seat.
 * Returns { newBest, aces } so the screen can say so.
 */
export function record(round, names, bots) {
    if (!round) return null;
    if (round.challenge) {
        // A trick shot: keep the best stars; it isn't a round of golf.
        const had = _s.tricks[round.challenge] || 0;
        if ((round.stars || 0) > had) _s.tricks[round.challenge] = round.stars;
        _save();
        return { trick: round.challenge, stars: round.stars || 0, newBest: null, better: (round.stars || 0) > had };
    }
    _s.rounds++;
    const humanAces = round.aces.reduce((a, n, i) => a + (bots[i] ? 0 : n), 0);
    _s.aces += humanAces;
    let newBest = null;
    if (round.full) {
        _s.fullRounds++;
        const holes = round.holes.length;
        const key = `${round.course}:${holes}`;
        round.totals.forEach((t, i) => {
            if (bots[i]) return;
            if (round.toPar[i] < 0) _s.underPar++;
            const cur = _s.best[key];
            if (!cur || t < cur.strokes) {
                _s.best[key] = { strokes: t, toPar: round.toPar[i], name: names[i], date: new Date().toISOString().slice(0, 10) };
                newBest = { ..._s.best[key], course: round.course, holes };
            }
        });
    }
    _s.last = {
        course: round.course, courseName: round.courseName, holes: round.holes.length, winner: round.winner,
        rows: round.totals.map((t, i) => ({ name: names[i], bot: !!bots[i], strokes: t, toPar: round.toPar[i], aces: round.aces[i] }))
            .sort((a, b) => a.strokes - b.strokes),
        newBest: !!newBest,
    };
    _save();
    return { newBest, aces: humanAces };
}

/** The setup screen. onTrick(challenge) plays a trick shot. */
export function paint(onStart, onChange, onTrick) {
    const list = MiniGolf.COURSE_LIST;
    const cards = $('golf-courses');
    cards.innerHTML = '';
    list.forEach(c => {
        const b = document.createElement('button');
        b.className = `golf-course gc-${c.key}` + (c.key === _s.course ? ' sel' : '');
        b.dataset.course = c.key;
        const bst = best(c.key, 9), b18 = best(c.key, 18);
        b.innerHTML = `<span class="gc-ico">${ICON[c.key] || '⛳'}</span>
            <span class="gc-body"><b class="bfont"></b><small></small>
            <em>${c.holes} HOLES · PAR ${c.par}${bst ? ` · BEST ${bst.strokes} (${_fmt(bst.toPar)}) ${bst.name.toUpperCase()}` : ''}${b18 ? ` · 18: ${b18.strokes}` : ''}</em></span>`;
        b.querySelector('b').textContent = c.name;
        b.querySelector('small').textContent = c.blurb;
        b.addEventListener('click', () => { _s.course = c.key; _save(); paint(onStart, onChange, onTrick); });
        cards.appendChild(b);
    });
    const seg = (id, opts, cur, set) => {
        const el = $(id); el.innerHTML = '';
        opts.forEach(([v, label]) => {
            const b = document.createElement('button');
            b.textContent = label; b.className = v === cur ? 'sel' : ''; b.dataset.v = v;
            b.addEventListener('click', () => { set(v); paint(onStart, onChange, onTrick); });
            el.appendChild(b);
        });
    };
    seg('golf-holes', HOLES.map(n => [n, `${n} holes`]), _s.holes, v => { _s.holes = v; _save(); });
    seg('golf-mode', [['solo', '⛳ Solo'], ['turns', '🏌️ Take turns'], ['table', '🍽️ Tabletop'], ['chaos', '💥 Chaos']], _s.mode, v => setMode(v));
    $('golf-mode-hint').textContent = _s.mode === 'solo'
        ? 'Just you and the course, phone upright. Beat par, and your best round goes on the board.'
        : _s.mode === 'turns'
        ? 'Proper golf, phone upright: pass it to whoever\'s up. One ball at a time, the camera behind it; furthest from the cup goes next.'
        : _s.mode === 'table'
        ? 'Two of you, the phone flat on the table between you: P1 at the bottom end, P2 at the top. One ball at a time, and the screen turns round to face whoever\'s up.'
        : 'Phone upright, everyone at once: the screen splits across the middle, P1 drags in the bottom half (a band each for 3–4). Putt again as soon as your ball stops.';
    const cur = list.find(c => c.key === _s.course);
    const next = list[(list.indexOf(cur) + 1) % list.length];
    $('golf-holes-hint').textContent = _s.holes === 18 ? `${cur.name} then ${next.name}.` : _s.holes === 3 ? `Three holes from ${cur.name}. Bests count on full courses.` : `All nine holes of ${cur.name}.`;
    // The round just played.
    const L = _s.last, el = $('golf-last');
    el.hidden = !L;
    if (L) {
        el.innerHTML = `<div class="gl-h bfont">LAST ROUND · ${L.courseName} · ${L.holes} HOLES${L.newBest ? ' · <span class="gl-best">NEW BEST!</span>' : ''}</div>` +
            L.rows.map((r, i) => `<div class="gl-row"><span>${i === 0 ? '👑' : i + 1}</span><b></b><span>${r.strokes}</span><span class="${r.toPar < 0 ? 'under' : r.toPar > 0 ? 'over' : ''}">${_fmt(r.toPar)}</span><span>${r.aces ? '⛳×' + r.aces : ''}</span></div>`).join('');
        el.querySelectorAll('.gl-row b').forEach((b, i) => { b.textContent = (L.rows[i].bot ? '🤖 ' : '') + L.rows[i].name; });
    }
    $('btn-golf-start').onclick = () => { configureNext(); onStart(); };
    // Trick shots: a card each, with the stars it's earned.
    const tricks = $('golf-tricks');
    if (tricks) {
        tricks.innerHTML = '';
        // The selected course's trick shots (every course has a handful).
        (MiniGolf.CHALLENGES || []).filter(ch => ch.course === _s.course).forEach(ch => {
            const st = _s.tricks[ch.id] || 0;
            const b = document.createElement('button');
            b.className = 'golf-trick' + (st ? ' done' : ''); b.dataset.trick = ch.id;
            b.innerHTML = `<span class="gt-ico">${ICON[ch.course] || '⛳'}</span><b class="bfont"></b><span class="gt-stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
            b.querySelector('b').textContent = ch.name;
            b.addEventListener('click', () => { configureChallenge(ch); onTrick?.(ch); });
            tricks.appendChild(b);
        });
    }
    onChange?.();
}
