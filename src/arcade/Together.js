// ============================================================
// TOGETHER — the Play Together screens: host/join, the room, the round card,
// the solo game itself and the results.
//
// Every phone plays the SAME seeded challenge at the same moment, alone, and
// the scores are compared: claw-core's "parallel" games (MG_PARALLEL). Real-time
// shared arenas across phones aren't built yet in either app.
//
// A phone can carry several players: it plays each round once per player,
// with a "pass the phone" card between them. In a TV room (TvHost.js) the
// phones are controllers only; the TV tab runs the room, so these screens
// stand down there.
// ============================================================
import * as Room from '../net/Room.js';
import * as SoloArena from '../claw-core/minigames/SoloArena.js';
import { MG_INFO, MG_NET_INFO, MG_PARALLEL } from '../claw-core/config/MinigameRegistry.js';
import { pointsFor } from './Party.js';
import { SEAT_STYLE } from '../host/ArcadeState.js';
import * as DrinkCard from './DrinkCard.js';
import * as Store from './Store.js';
import * as Profiles from './Profiles.js';
import * as Toast from './Toast.js';
import * as Stats from './Stats.js';
import * as Trophies from './Trophies.js';

const $ = id => document.getElementById(id);
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
let _show = null, _home = null;
let _pending = null;       // the announced round: { type, seed, n }
let _playing = false;
const MAX_LOCAL = 4;
// A colour per seat for rooms of up to twelve: the table's four, then eight more.
export const NET_COLORS = [...SEAT_STYLE.map(s => s.hex), '#8b5cf6', '#ff9f1c', '#2ec4b6', '#ff5fa2', '#a3e635', '#38bdf8', '#b45309', '#e2e8f0'];
const color = i => NET_COLORS[i % NET_COLORS.length];
let _handoff = null;       // pass the phone: the next player's game, on the card's button
// The TV tab hosts the room; its screens are TvHost's, not these.
const _tvHere = () => Room.isHost() && Room.isTv();

// HundredBlockDash's copy opens two of these with board-economy text ("every
// coin is REAL money"). There's no money in the arcade.
const descOf = type => (MG_NET_INFO[type] || MG_INFO[type].desc).replace(/^\S+ PAYDAY — [^.]*\.\s*/, '');

// The name used last time; failing that, the first player made on this phone.
export function prefill() {
    const el = $('net-name');
    if (!el.value) el.value = Store.load('netName', '') || Profiles.list()[0]?.name || '';
}

export function init(show, goHome) {
    _show = show; _home = goHome;
    Room.setScorer(pointsFor);
    prefill();
    // A join link (?join=ABCD, shown on the TV) fills the code in.
    const j = new URLSearchParams(location.search).get('join');
    if (j && Room.codeOk(j.toUpperCase())) $('net-code').value = j.toUpperCase();
    $('btn-net-add').addEventListener('click', () => _addName());

    $('btn-net-host').addEventListener('click', async () => {
        _hint('Opening a room…');
        try { await Room.host(_names()); _show('room'); _paintRoom(); _hint(''); }
        catch (e) { _hint("Couldn't open a room. Check your connection and try again."); }
    });
    $('btn-net-join').addEventListener('click', async () => {
        const code = $('net-code').value.trim().toUpperCase();
        if (!Room.codeOk(code)) return _hint('Room codes are 4 letters.');
        _hint('Joining…');
        try {
            await Room.join(code, _names());
            _show('room'); _paintRoom();
            // Nobody answering is the common failure: wrong code, or the host's
            // network can't be reached peer-to-peer.
            setTimeout(() => { if (Room.role() === 'client' && Room.mySeat() < 0) $('room-hint').textContent = "Still looking for that room. Check the code, or the room may be full."; }, 12000);
        } catch (e) { _hint("Couldn't join. Check the code and your connection."); }
    });

    Room.on('roster', () => { if (!_tvHere()) _paintRoom(); });
    Room.on('round', r => { if (!_tvHere()) { _pending = r; _showCard(); } });
    Room.on('readyCount', (k, n) => { if (!_tvHere()) $('nc-wait').textContent = `${k} of ${n} phones ready…`; });
    Room.on('go', () => { if (!_tvHere()) _play(); });
    Room.on('result', r => { if (!_tvHere()) _showResult(r); });
    Room.on('closed', msg => { Toast.show(msg); _abortGame(); _home(); });

    $('btn-nc-ready').addEventListener('click', () => {
        if (_handoff) { const go = _handoff; _handoff = null; return go(); }
        $('btn-nc-ready').disabled = true;
        $('nc-wait').textContent = 'Waiting for everyone…';
        Room.ready();
    });
    $('btn-nr-next').addEventListener('click', () => {
        if (Room.isCaptain()) Room.command();   // the TV spins the next one
        _show('room'); _paintRoom();
    });
    $('btn-room-spin').addEventListener('click', () => Room.command());
    $('btn-room-drink').addEventListener('click', () => Room.setDrinking(Room.mode() !== 'drinking'));
}

function _name() {
    const n = $('net-name').value.trim().slice(0, 16) || 'Player';
    Store.save('netName', n);
    return n;
}
// Everyone playing on this phone: you, then anyone added below.
function _names() {
    const more = [...document.querySelectorAll('#net-more input')].map(el => el.value.trim().slice(0, 16)).filter(Boolean);
    return [_name(), ...more].slice(0, MAX_LOCAL);
}
function _addName() {
    const host = $('net-more');
    if (host.children.length >= MAX_LOCAL - 1) return;
    const row = document.createElement('div');
    row.className = 'join-row';
    row.innerHTML = `<input class="field" maxlength="16" autocomplete="off" placeholder="Player ${host.children.length + 2}"><button class="veto-btn bfont" aria-label="Remove">✕</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    host.appendChild(row);
    row.querySelector('input').focus();
}
const _hint = t => { $('net-hint').textContent = t; };

/** Leaving any Play Together screen leaves the room. */
export async function leave() { _abortGame(); await Room.leave(); }

// ---- room --------------------------------------------------------------------------
function _rows(host, names, extra) {
    host.innerHTML = names.map((name, i) =>
        `<div class="st-row"><span class="st-place">${extra ? extra.place[i] : ''}</span>` +
        `<span class="st-dot" style="background:${color(i)}">${Room.mySeats().includes(i) ? '⭐' : '📱'}</span>` +
        `<span class="st-name">${_esc(name)}${i === 0 ? (Room.isTv() ? ' (captain)' : ' (host)') : ''}</span>` +
        `<span class="st-bar"><i style="width:${extra ? extra.bar[i] : 0}%;background:${color(i)}"></i></span>` +
        `<span class="st-pts bfont">${extra ? extra.pts[i] : (Room.totals()[i] || 0)}</span></div>`).join('');
}

const _esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The house rules in play, for a drinking room. */
export function rulesHTML(list) {
    return list.length ? `<div class="panel-h bfont">🍺 House rules</div>` +
        list.map(x => `<div class="rule-row"><b>${_esc(x.name)}</b> ${_esc(x.rule)}</div>`).join('') : '';
}

function _paintRoom() {
    if (!$('scr-room') || $('scr-room').hidden) return;
    $('room-code').textContent = Room.code() || '····';
    const seats = Room.seats();
    _rows($('room-seats'), seats.map(s => s.name));
    const host = Room.isHost();
    $('room-host-panel').hidden = !host;
    $('room-captain').hidden = !Room.isCaptain();
    paintDrinkToggle($('btn-room-drink'));
    const rules = $('room-rules');
    rules.innerHTML = Room.mode() === 'drinking' ? rulesHTML(Room.rules()) : '';
    rules.hidden = !rules.innerHTML;
    if (host) {
        const g = $('room-games');
        g.innerHTML = '';
        const mk = (type, icon, title) => {
            const el = document.createElement('div');
            el.className = 'card' + (seats.length < 2 ? ' blocked' : '');
            el.dataset.type = type;
            el.innerHTML = `<span class="ci">${icon}</span><span class="cn">${title}</span>`;
            el.addEventListener('click', () => {
                if (Room.seats().length < 2) return;
                const t = type === 'random' ? MG_PARALLEL[Math.floor(Math.random() * MG_PARALLEL.length)] : type;
                Room.startRound(t);
            });
            g.appendChild(el);
        };
        mk('random', '🎲', 'SURPRISE ME');
        MG_PARALLEL.forEach(t => mk(t, MG_INFO[t].icon, MG_INFO[t].title));
    }
    $('room-hint').textContent = Room.isTv()
        ? (seats.length < 2 ? 'Waiting for more players to join on the TV…'
            : Room.isCaptain() ? "You're the captain: spin the wheel from here, or on the TV." : 'Watch the TV: the wheel picks the game.')
        : seats.length < 2
        ? (host ? `Share the code. Friends tap Play Together, then JOIN with ${Room.code()}.` : 'Connecting to the host…')
        : (host ? `${seats.length} players in. Pick a game!` : 'Waiting for the host to pick a game…');
}

// ---- round -------------------------------------------------------------------------
function _showCard() {
    const r = _pending;
    _show('netcard', false);
    $('nc-round').textContent = `ROUND ${r.n}`;
    $('nc-icon').textContent = MG_INFO[r.type].icon;
    $('nc-title').textContent = MG_INFO[r.type].title;
    $('nc-desc').textContent = descOf(r.type);
    $('btn-nc-ready').disabled = false;
    _handoff = null; $('btn-nc-ready').textContent = "I'M READY";
    $('nc-wait').textContent = Room.mySeats().length > 1
        ? 'Everyone plays the same challenge. This phone gets passed round its players. Top score wins.'
        : 'Everyone plays the same challenge at once. Top score wins.';
}

// Each player on this phone plays the same seed in turn; one report at the end.
function _play() {
    const r = _pending;
    if (!r || _playing) return;
    _playing = true;
    const mine = Room.mySeats().map(i => Room.seats()[i].name);
    const scores = [];
    const next = () => {
        if (!_playing) return;
        if (scores.length >= mine.length) {
            _playing = false;
            _show('netresult', false);
            $('nr-title').textContent = mine.length > 1 ? 'All played!' : `You scored ${Math.round(scores[0] || 0)}`;
            $('nr-game').textContent = mine.length > 1 ? mine.map((n, i) => `${n} ${Math.round(scores[i])}`).join(' · ') : 'Waiting for the other phones…';
            $('nr-rows').innerHTML = '';
            $('btn-nr-next').hidden = true;
            $('nr-wait').textContent = mine.length > 1 ? 'Waiting for the other phones…' : '';
            Room.reportScore(scores);
            return;
        }
        const go = () => {
            $('arcade').hidden = true;
            SoloArena.play(r.type, r.seed, score => {
                SoloArena.reset();
                $('arcade').hidden = false;
                scores.push(score);
                next();
            }, Room.ROUND_CAP_MS);
        };
        if (mine.length < 2) return go();
        _passTo(mine[scores.length], go);
    };
    next();
}

// "Pass the phone to Bob": the netcard again, with its button as the handoff.
function _passTo(name, go) {
    _show('netcard', false);
    $('nc-round').textContent = `ROUND ${_pending.n}`;
    $('nc-title').textContent = `📱 ${name}'s turn`;
    $('nc-desc').textContent = `Pass the phone to ${name}.`;
    const b = $('btn-nc-ready');
    b.disabled = false; b.textContent = `I'M ${name.toUpperCase()}, GO!`;
    $('nc-wait').textContent = '';
    _handoff = go;
}

function _abortGame() {
    const was = _playing;
    _playing = false; _handoff = null;
    if (was && $('arcade').hidden) { try { SoloArena.forceEnd(); } catch (e) {} SoloArena.reset(); }
    $('arcade').hidden = false;
}

// A result can be re-sent (a late phone, a repaint); count each round once.
let _countedRound = null, _drankRound = null;

function _showResult(r) {
    // Decided while this phone was still playing (it started late, or the
    // host's grace period ran out): take the game down first.
    _abortGame();
    if (r.n !== _countedRound) { _countedRound = r.n; Stats.recordTogether(); Trophies.announce(600); }
    _show('netresult', false);
    const me = Room.mySeat();
    $('nr-title').textContent = r.winner < 0 ? 'A TIE!' : r.winner === me ? 'YOU WIN!' : `${r.names[r.winner]} WINS!`;
    $('nr-game').innerHTML = `${MG_INFO[r.type].icon} <b>${MG_INFO[r.type].title}</b> · round ${r.n}`;
    const order = r.scores.map((_, i) => i).sort((a, b) => r.scores[b] - r.scores[a]);
    const place = [];
    order.forEach((seat, k) => { place[seat] = k && r.scores[seat] === r.scores[order[k - 1]] ? place[order[k - 1]] : k; });
    const top = Math.max(1, ...r.totals);
    const d = r.drinks;
    _rows($('nr-rows'), r.names, {
        place: place.map(p => MEDALS[p] || p + 1),
        bar: r.totals.map(t => (t / top) * 100),
        pts: r.totals.map((t, i) => `${t}<small>${r.scores[i]} pts · +${r.pay[i]}${d ? ` · 🍺 ${d.sips[i]}` : ''}</small>`),
    });
    if (d) {
        $('nr-game').innerHTML += '<br>' + drinkLine(r);
        // Once per round, on every phone: who drinks, and how much.
        if (r.n !== _drankRound) { _drankRound = r.n; showDrinks(r, Room.mySeats()); }
    }
    $('btn-nr-next').hidden = !(Room.isHost() || Room.isCaptain());
    $('btn-nr-next').textContent = Room.isCaptain() ? '🎡 SPIN THE NEXT ONE →' : 'NEXT GAME →';
    $('nr-wait').textContent = Room.isHost() || Room.isCaptain() ? '' : Room.isTv() ? 'Watch the TV for the next game…' : 'Waiting for the host to pick the next game…';
}

/** One line on the round's drinks: who hands out a sip, and the new rule. */
export function drinkLine(r) {
    const d = r.drinks;
    if (!d) return '';
    const bits = [];
    if (d.give >= 0) bits.push(`🎁 <b>${_esc(r.names[d.give])}</b> hands out 1 sip`);
    if (d.rule) bits.push(`📜 <b>${_esc(d.rule.name)}</b> new rule: ${_esc(d.rule.rule)}`);
    return bits.join('<br>');
}

/** The room's DRINK card for a result (phones pass their own seats as `me`). */
export function showDrinks(r, me = []) {
    const d = r.drinks;
    if (!d) return;
    DrinkCard.show({ names: r.names, sips: d.sips, give: d.give, rule: d.rule, rules: r.rules || [], me, colors: r.names.map((_, i) => color(i)) });
}

/** The host's drinking switch: shows the room's mode, only the host may flip it. */
export function paintDrinkToggle(btn) {
    if (!btn) return;
    const on = Room.mode() === 'drinking';
    btn.hidden = !Room.isHost();
    btn.textContent = on ? '🍺 DRINKING MODE: ON' : '🍺 DRINKING MODE: OFF';
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
}
