// ============================================================
// SOLO — Quick Play for one: no bots, just you against the high-score table.
//
// The games are claw-core's 'parallel' ones (MG_PARALLEL): each already plays
// alone on the whole screen and reports one number, higher always better —
// it's how Play Together runs them on every phone. Here it's one phone, a fresh
// challenge each go, and the number goes on a table kept on this device for
// everyone who plays on it (local now; online scores are a later job).
//
//   GAMES                 the solo games, in the order the grid shows them
//   fmt(type, score)      a score as that game counts it ("12.4s", "7 pts")
//   best(type)            the top entry, or null
//   table(type)           the top ten: { score, name, date }
//   play(type, name, onDone)  play it, record it, onDone(result)
//   paintResult(result, again, other)  the result screen
// ============================================================
import * as SoloArena from '../claw-core/minigames/SoloArena.js';
import { MG_INFO, MG_PARALLEL } from '../claw-core/config/MinigameRegistry.js';
import * as Store from './Store.js';

const KEEP = 10;
export const GAMES = MG_PARALLEL.slice();
const UNIT = { lootcatch: 'coins', oddoneout: 'found', snapstrike: 'pts', treeclimb: 'branches', minigolf: 'pts', balloonpump: 'pts', shellgame: 'pts' };

let _s = Store.load('solo', null) || {};
_s = { tables: {}, ..._s };
const _save = () => Store.save('solo', _s);
const $ = id => document.getElementById(id);
const _esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const isSoloGame = type => GAMES.includes(type);
export function fmt(type, score) {
    if (score == null) return '—';
    // Steady Hand counts tenths of a second held.
    if (type === 'steadyhand') return `${(score / 10).toFixed(1)}s`;
    // Pancake Stack reports its stack in millimetres.
    if (type === 'pancakes') return `${(score / 10).toFixed(1)} cm`;
    return `${Math.round(score)} ${UNIT[type] || ''}`.trim();
}
export const table = type => (_s.tables[type] || []).slice();
export const best = type => table(type)[0] || null;

/** Put a score on the table. Returns { rank (0-based, -1 if off it), isBest, entry }. */
export function record(type, score, name) {
    const t = table(type);
    const entry = { score: Math.round(score), name: name || 'Player', date: new Date().toISOString().slice(0, 10) };
    // Ties go below the score already there: you have to beat it, not equal it.
    let i = t.findIndex(e => entry.score > e.score);
    if (i < 0) i = t.length;
    t.splice(i, 0, entry);
    _s.tables[type] = t.slice(0, KEEP);
    _save();
    const rank = i < KEEP ? i : -1;
    return { rank, isBest: rank === 0 && entry.score > 0, entry };
}

/** Play `type` alone; a fresh challenge every go. */
export function play(type, name, onDone) {
    const before = best(type);
    $('arcade').hidden = true;
    SoloArena.play(type, (Math.random() * 2 ** 31) >>> 0, score => {
        SoloArena.reset();
        $('arcade').hidden = false;
        const r = record(type, score, name);
        onDone?.({ type, score, name, before, ...r });
    });
}

/** The result screen: your score, NEW HIGH SCORE, and the table with yours lit. */
export function paintResult(res, onAgain, onOther) {
    const { type, score, rank, isBest, before } = res;
    $('so-game').textContent = `${MG_INFO[type].icon} ${MG_INFO[type].title}`;
    $('so-score').textContent = fmt(type, score);
    $('so-note').textContent = isBest ? (before ? `NEW HIGH SCORE! (was ${fmt(type, before.score)} by ${before.name})` : 'NEW HIGH SCORE!')
        : rank >= 0 ? `#${rank + 1} on the board` : `Best: ${fmt(type, best(type)?.score)} by ${best(type)?.name}`;
    $('so-note').className = 'so-note bfont' + (isBest ? ' hot' : '');
    const t = table(type);
    $('so-table').innerHTML = t.length
        ? t.map((e, i) => `<div class="so-row${i === rank ? ' me' : ''}"><span>${i === 0 ? '👑' : i + 1}</span><b>${_esc(e.name)}</b><span>${_esc(fmt(type, e.score))}</span><small>${e.date}</small></div>`).join('')
        : '';
    $('btn-so-again').onclick = onAgain;
    $('btn-so-other').onclick = onOther;
}
