// ============================================================
// PARTY SCREENS — setup, draft, standings, podium. Party.js owns the rules;
// this file only paints them and reports what was tapped.
// ============================================================
import * as Party from './Party.js';
import * as Catalog from './Catalog.js';
import * as Rotation from './Rotation.js';
import * as Vetoes from './Vetoes.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';
import { seats, humans, seatChar } from './Seats.js';
import { faceHTML } from './Characters.js';
import { SEAT_STYLE } from '../host/ArcadeState.js';

const $ = id => document.getElementById(id);
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

// ---- setup ------------------------------------------------------------------
export function paintSetup() {
    const len = $('party-len');
    len.innerHTML = '';
    Party.LENGTHS.forEach(n => {
        const b = document.createElement('button');
        b.textContent = `${n} games`;
        b.className = n === Party.party.length ? 'sel' : '';
        b.addEventListener('click', () => { Party.party.length = n; Party.savePrefs(); paintSetup(); });
        len.appendChild(b);
    });
    const pk = $('party-pickers');
    pk.innerHTML = '';
    Object.entries(Party.PICKERS).forEach(([id, p]) => {
        const b = document.createElement('button');
        b.className = 'picker' + (id === Party.party.picker ? ' sel' : '');
        b.dataset.picker = id;
        b.innerHTML = `<span class="pi">${p.icon}</span><span class="pl bfont">${p.label}</span><span class="ps">${p.sub}</span>`;
        b.addEventListener('click', () => { Party.party.picker = id; Party.savePrefs(); paintSetup(); });
        pk.appendChild(b);
    });
    const pool = Catalog.eligible(seats.count).length, left = Rotation.fresh(seats.count).length;
    $('party-hint').textContent = pool < Party.party.length
        ? `Only ${pool} games seat ${seats.count}, so some will repeat.`
        : `🔄 ${left} of ${pool} games still to come round at ${seats.count} players · 🚫 ${Vetoes.PER_SESSION} vetoes for the table · ⚡ final game counts double`;
}

// ---- draft --------------------------------------------------------------------
// Deal up to five. Seats ban one each, in seat order: humans tap, bots ban at
// random after a beat. The app then picks at random from whatever survives.
let _draft = null;
export function startDraft(onPicked) {
    const pool = Party.pool().slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const hand = pool.slice(0, 5);
    _draft = { hand, banned: new Set(), turn: 0, onPicked, done: false };
    _paintDraft();
    _nextBan();
}

function _alive() { return _draft.hand.filter(t => !_draft.banned.has(t)); }

function _nextBan() {
    const d = _draft;
    if (d.done) return;
    // Stop when every seat has banned or one game is left.
    if (d.turn >= seats.count || _alive().length <= 1) return _finishDraft();
    if (seats.bots[d.turn]) {
        _paintDraft();
        setTimeout(() => {
            if (d !== _draft || d.done) return;
            const alive = _alive();
            _ban(alive[Math.floor(Math.random() * alive.length)]);
        }, 700);
    } else _paintDraft();
}

function _ban(type) {
    const d = _draft;
    if (d.done || d.banned.has(type)) return;
    d.banned.add(type);
    d.turn++;
    _paintDraft();
    setTimeout(_nextBan, 250);
}

// The app picks from what survived; the table can still veto it (a shared
// veto from the party's two), which picks again.
function _finishDraft() {
    const d = _draft;
    d.done = true;
    _repick();
}
function _repick() {
    const d = _draft;
    let alive = _alive();
    if (!alive.length) {                        // all vetoed: deal one from the pool
        alive = Party.pool().filter(t => !d.hand.includes(t));
        if (!alive.length) alive = Party.pool();
        d.hand.push(alive[0]);
    }
    d.picked = alive[Math.floor(Math.random() * alive.length)];
    try { sfx('mg_win'); } catch (e) {}
    _paintDraft();
}
function _draftVeto() {
    const d = _draft;
    if (!d.done || !Vetoes.use()) return;
    try { sfx('land_bad'); haptic([80]); } catch (e) {}
    Party.veto(d.picked);
    d.banned.add(d.picked);
    _repick();
}
export function initDraft() {
    $('btn-draft-play').addEventListener('click', () => { if (_draft?.done && _draft.picked) { try { sfx('go'); } catch (e) {} _draft.onPicked(_draft.picked); } });
    $('btn-draft-veto').addEventListener('click', _draftVeto);
}

function _paintDraft() {
    const d = _draft, t = $('draft-turn');
    const btns = $('draft-btns');
    btns.hidden = !d.done;
    if (d.done) {
        t.innerHTML = `🎲 IT'S <b>${Catalog.MG_INFO[d.picked].title}</b>!`;
        t.style.background = '#2fd67b';
        const v = $('btn-draft-veto');
        v.textContent = Vetoes.label();
        v.disabled = Vetoes.left() <= 0;
    } else {
        const s = SEAT_STYLE[d.turn];
        t.style.background = s.hex;
        t.textContent = seats.bots[d.turn] ? `🤖 ${Party.seatName(d.turn)} is banning…`
                                           : `${Party.seatName(d.turn)}: tap a game to BAN it`;
    }
    const g = $('draft-grid');
    g.innerHTML = '';
    d.hand.forEach(type => {
        const info = Catalog.MG_INFO[type], gen = Catalog.genreOf(type);
        const el = document.createElement('div');
        el.className = 'card' + (d.banned.has(type) ? ' banned' : '') + (d.picked === type ? ' picked' : '');
        el.dataset.type = type;
        el.innerHTML = `<span class="ci">${info.icon}</span><span class="cn">${info.title}</span>` +
                       `<span class="cg g-${gen}">${Catalog.MG_GENRES[gen]?.name || gen}</span>`;
        el.addEventListener('click', () => { if (!d.done && !seats.bots[d.turn]) _ban(type); });
        g.appendChild(el);
    });
}

// ---- standings ------------------------------------------------------------------
function _rows(host) {
    const r = Party.ranking(), top = Math.max(1, ...r.map(x => x.points));
    const last = Party.party.last;
    host.innerHTML = r.map(x => {
        const gained = last ? last.pay[x.seat] : 0;
        return `<div class="st-row" data-seat="${x.seat}">` +
            `<span class="st-place">${MEDALS[x.place] || x.place + 1}</span>` +
            `<span class="st-dot" style="background:${x.style.hex}">${faceHTML(seatChar(x.seat), x.style.color)}</span>` +
            `<span class="st-name">${Party.seatName(x.seat)}</span>` +
            `<span class="st-bar"><i style="width:${(x.points / top) * 100}%;background:${x.style.hex}"></i></span>` +
            `<span class="st-pts bfont">${x.points}${gained ? `<small${last.double ? ' class="x2"' : ''}>+${gained}${last.double ? ' x2' : ''}</small>` : ''}</span></div>`;
    }).join('');
}

export function paintStandings(nextType) {
    const p = Party.party;
    $('st-title').textContent = p.round ? `After game ${p.round} of ${p.length}` : `Game 1 of ${p.length}`;
    const last = p.last;
    $('st-last').innerHTML = last
        ? `${Catalog.MG_INFO[last.type].icon} <b>${Catalog.MG_INFO[last.type].title}</b>: ` +
          (last.winnerId >= 0 ? `${Party.seatName(last.winnerId)} wins!` : 'a draw!')
        : `${Party.PICKERS[p.picker].icon} ${Party.PICKERS[p.picker].label} party · ${seats.count} players`;
    _rows($('st-rows'));
    const final = Party.finalNext();
    const hype = (p.round ? p.hype : []).slice();
    if (!p.round && final) hype.push('⚡ FINAL GAME · DOUBLE POINTS!');
    $('st-hype').innerHTML = hype.map(h => `<div class="bfont${/DOUBLE/.test(h) ? ' final' : ''}">${h}</div>`).join('');
    const nx = $('st-next');
    if (nextType) {
        const info = Catalog.MG_INFO[nextType];
        nx.innerHTML = `<span class="un-k">${final ? 'FINAL · x2' : 'UP NEXT'}</span><span class="un-i">${info.icon}</span><span class="un-t bfont">${info.title}</span>`;
        nx.hidden = false;
    } else nx.hidden = true;
    // Shuffle's pick can be vetoed right here.
    const v = $('btn-st-veto');
    v.hidden = !nextType;
    v.textContent = Vetoes.label();
    v.disabled = Vetoes.left() <= 0;
    $('btn-st-go').textContent = nextType ? "LET'S PLAY →"
        : ({ wheel: 'SPIN FOR NEXT →', draft: 'START THE DRAFT →', pick: 'PICK NEXT GAME →' }[p.picker] || 'NEXT GAME →');
}

// ---- podium ------------------------------------------------------------------------
export function paintPodium() {
    const r = Party.ranking();
    const champs = r.filter(x => x.place === 0);
    $('podium-h').textContent = champs.length > 1 ? 'SHARED CROWN!' : `${Party.seatName(champs[0].seat).toUpperCase()} WINS!`;
    // Classic podium order: 2nd, 1st, 3rd.
    const steps = [1, 0, 2].map(k => r[k]).filter(Boolean);
    $('podium').innerHTML = steps.map(x =>
        `<div class="step p${Math.min(x.place, 2) + 1}">` +
        `<div class="pd-dot" style="background:${x.style.hex}">${faceHTML(seatChar(x.seat), x.style.color)}${x.bot ? '<i class="bot-tag">🤖</i>' : ''}</div>` +
        `<div class="pd-name">${Party.seatName(x.seat)}</div>` +
        `<div class="pd-block bfont">${MEDALS[x.place]}<br>${x.points}</div></div>`).join('');
    _rows($('podium-rows'));
}

export const anyHuman = () => humans() > 0;
