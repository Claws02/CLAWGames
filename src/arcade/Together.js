// ============================================================
// TOGETHER — the Play Together screens: host/join, the room, the round card,
// the solo game itself and the results.
//
// Every phone plays the SAME seeded challenge at the same moment, alone, and
// the scores are compared: claw-core's "parallel" games (MG_PARALLEL). Real-time
// shared arenas across phones aren't built yet in either app.
// ============================================================
import * as Room from '../net/Room.js';
import * as SoloArena from '../claw-core/minigames/SoloArena.js';
import { MG_INFO, MG_NET_INFO, MG_PARALLEL } from '../claw-core/config/MinigameRegistry.js';
import { pointsFor } from './Party.js';
import { SEAT_STYLE } from '../host/ArcadeState.js';
import * as Store from './Store.js';
import * as Toast from './Toast.js';

const $ = id => document.getElementById(id);
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
let _show = null, _home = null;
let _pending = null;       // the announced round: { type, seed, n }
let _playing = false;

// HundredBlockDash's copy opens two of these with board-economy text ("every
// coin is REAL money"). There's no money in the arcade.
const descOf = type => (MG_NET_INFO[type] || MG_INFO[type].desc).replace(/^\S+ PAYDAY — [^.]*\.\s*/, '');

export function init(show, goHome) {
    _show = show; _home = goHome;
    Room.setScorer(pointsFor);
    $('net-name').value = Store.load('netName', '');

    $('btn-net-host').addEventListener('click', async () => {
        _hint('Opening a room…');
        try { await Room.host(_name()); _show('room'); _paintRoom(); _hint(''); }
        catch (e) { _hint("Couldn't open a room. Check your connection and try again."); }
    });
    $('btn-net-join').addEventListener('click', async () => {
        const code = $('net-code').value.trim().toUpperCase();
        if (!Room.codeOk(code)) return _hint('Room codes are 4 letters.');
        _hint('Joining…');
        try {
            await Room.join(code, _name());
            _show('room'); _paintRoom();
            // Nobody answering is the common failure: wrong code, or the host's
            // network can't be reached peer-to-peer.
            setTimeout(() => { if (Room.role() === 'client' && Room.mySeat() < 0) $('room-hint').textContent = "Still looking for that room. Check the code, or the room may be full."; }, 12000);
        } catch (e) { _hint("Couldn't join. Check the code and your connection."); }
    });

    Room.on('roster', () => _paintRoom());
    Room.on('round', r => { _pending = r; _showCard(); });
    Room.on('readyCount', (k, n) => { $('nc-wait').textContent = `${k} of ${n} ready…`; });
    Room.on('go', () => _play());
    Room.on('result', r => _showResult(r));
    Room.on('closed', msg => { Toast.show(msg); _abortGame(); _home(); });

    $('btn-nc-ready').addEventListener('click', () => {
        $('btn-nc-ready').disabled = true;
        $('nc-wait').textContent = 'Waiting for everyone…';
        Room.ready();
    });
    $('btn-nr-next').addEventListener('click', () => { _show('room'); _paintRoom(); });
}

function _name() {
    const n = $('net-name').value.trim().slice(0, 16) || 'Player';
    Store.save('netName', n);
    return n;
}
const _hint = t => { $('net-hint').textContent = t; };

/** Leaving any Play Together screen leaves the room. */
export async function leave() { _abortGame(); await Room.leave(); }

// ---- room --------------------------------------------------------------------------
function _rows(host, names, extra) {
    host.innerHTML = names.map((name, i) =>
        `<div class="st-row"><span class="st-place">${extra ? extra.place[i] : ''}</span>` +
        `<span class="st-dot" style="background:${SEAT_STYLE[i].hex}">${i === Room.mySeat() ? '⭐' : '📱'}</span>` +
        `<span class="st-name">${name}${i === 0 ? ' (host)' : ''}</span>` +
        `<span class="st-bar"><i style="width:${extra ? extra.bar[i] : 0}%;background:${SEAT_STYLE[i].hex}"></i></span>` +
        `<span class="st-pts bfont">${extra ? extra.pts[i] : (Room.totals()[i] || 0)}</span></div>`).join('');
}

function _paintRoom() {
    if (!$('scr-room') || $('scr-room').hidden) return;
    $('room-code').textContent = Room.code() || '····';
    const seats = Room.seats();
    _rows($('room-seats'), seats.map(s => s.name));
    const host = Room.isHost();
    $('room-host-panel').hidden = !host;
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
    $('room-hint').textContent = seats.length < 2
        ? (host ? `Share the code. Friends tap Play Together, then JOIN with ${Room.code()}.` : 'Connecting to the host…')
        : (host ? `${seats.length} phones in. Pick a game!` : 'Waiting for the host to pick a game…');
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
    $('nc-wait').textContent = 'Everyone plays the same challenge at once. Top score wins.';
}

function _play() {
    const r = _pending;
    if (!r || _playing) return;
    _playing = true;
    $('arcade').hidden = true;
    SoloArena.play(r.type, r.seed, score => {
        _playing = false;
        SoloArena.reset();
        $('arcade').hidden = false;
        _show('netresult', false);
        $('nr-title').textContent = `You scored ${Math.round(score)}`;
        $('nr-game').textContent = 'Waiting for the other phones…';
        $('nr-rows').innerHTML = '';
        $('btn-nr-next').hidden = true;
        $('nr-wait').textContent = '';
        Room.reportScore(score);
    }, Room.ROUND_CAP_MS);
}

function _abortGame() {
    if (_playing) { try { SoloArena.forceEnd(); } catch (e) {} SoloArena.reset(); }
    _playing = false;
    $('arcade').hidden = false;
}

function _showResult(r) {
    // Decided while this phone was still playing (it started late, or the
    // host's grace period ran out): take the game down first.
    _abortGame();
    _show('netresult', false);
    const me = Room.mySeat();
    $('nr-title').textContent = r.winner < 0 ? 'A TIE!' : r.winner === me ? 'YOU WIN!' : `${r.names[r.winner]} WINS!`;
    $('nr-game').innerHTML = `${MG_INFO[r.type].icon} <b>${MG_INFO[r.type].title}</b> · round ${r.n}`;
    const order = r.scores.map((_, i) => i).sort((a, b) => r.scores[b] - r.scores[a]);
    const place = [];
    order.forEach((seat, k) => { place[seat] = k && r.scores[seat] === r.scores[order[k - 1]] ? place[order[k - 1]] : k; });
    const top = Math.max(1, ...r.totals);
    _rows($('nr-rows'), r.names, {
        place: place.map(p => MEDALS[p] || p + 1),
        bar: r.totals.map(t => (t / top) * 100),
        pts: r.totals.map((t, i) => `${t}<small>${r.scores[i]} pts · +${r.pay[i]}</small>`),
    });
    $('btn-nr-next').hidden = !Room.isHost();
    $('nr-wait').textContent = Room.isHost() ? '' : 'Waiting for the host to pick the next game…';
}
