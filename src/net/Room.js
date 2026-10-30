// ============================================================
// ROOM — Play Together's session: one phone per player, one room code.
//
// Host-authoritative. The host owns the roster and the round; everybody else
// only says hello, votes ready and reports scores. Messages ride claw-core's
// NetTransport (Trystero WebRTC; ?net=local for two tabs of one browser).
//
// A TV host (a laptop tab cast to the TV) takes no seat: it shows the wheel
// and the scores, and the first phone in is its captain. A phone may carry
// several players (pass the phone): it plays the round once for each of them.
//
//   client → host   HELLO  {names}          on every peer join, until seated
//   host   → all    ROSTER {seats, totals, tv, mode, rules}   whenever it changes
//   host   → all    ROUND  {type, seed, n}  a game is announced
//   any    → host   READY  {}               my card is read (one per phone)
//   host   → all    GO     {}               the last vote landed: play
//   any    → host   SCORE  {scores}         my players' games ended, in seat order
//   host   → all    RESULT {type, scores, pay, totals, n, drinks?, rules}
//   captain → TV    CMD    {}               "spin / play it / next" from the couch
//   any     → all   GHOST  {n, seat, s}     a racer's whereabouts, ~9 a second, during
//                                           a time trial (SoloArena ghosts); straight to
//                                           every phone, not through the host
//
// Up to MAX_SEATS players: every game here is played alone on each phone and
// the scores compared, so a room scales past the four a shared screen seats.
// The host can switch drinking mode on and off at any time (setDrinking).
//
// A phone that leaves mid-round is scored 0; a host that leaves ends the room.
// ============================================================
import * as T from '../claw-core/net/NetTransport.js';
import { soloRoundMs } from '../claw-core/config/MinigameRegistry.js';
import * as Drinks from '../arcade/Drinks.js';

export const MAX_SEATS = 12;
const V = 1;
const MSG = { HELLO: 'hello', ROSTER: 'roster', ROUND: 'round', READY: 'ready', GO: 'go', SCORE: 'score', RESULT: 'result', CMD: 'cmd', GHOST: 'ghost' };
const SELF = 'self';

let _role = null;           // 'host' | 'client' | null
let _name = 'Player';
let _hostPeer = null;       // client: who the host is
let _seats = [];            // host: [{ peer, name }], a peer per player; client: mirror from ROSTER
let _round = null;          // host: { type, seed, n, ready:Set, scores:Map(seat), timer }
let _tv = false;            // the host is a TV: no seat of its own
let _mode = 'party';        // 'party' | 'drinking'
let _rules = [];            // drinking: [{ name, rule }] for the rest of the room
let _totals = [];
let _n = 0;
const _subs = {};
const _offs = [];

export const on = (kind, fn) => { (_subs[kind] ||= []).push(fn); };
const _emit = (kind, ...a) => (_subs[kind] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error('[room]', kind, e); } });

export const role = () => _role;
export const isHost = () => _role === 'host';
export const code = () => T.roomCode();
export const isTv = () => _tv;
export const mode = () => _mode;
/** Host: drinking mode on or off for the room, from the next result on. */
export function setDrinking(on) {
    if (!isHost()) return;
    _mode = on ? 'drinking' : 'party';
    _broadcastRoster();
}
export const rules = () => _rules.slice();
export const seats = () => _seats.map(s => ({ name: s.name, me: s.peer === SELF || s.peer === T.selfId() }));
export const mySeat = () => seats().findIndex(s => s.me);
export const mySeats = () => seats().map((s, i) => (s.me ? i : -1)).filter(i => i >= 0);
const _peers = () => [...new Set(_seats.map(s => s.peer))];
// The phone that drives a TV room: whoever sat down first.
export const isCaptain = () => _tv && mySeat() === 0;
export const totals = () => _totals.slice();
export const codeOk = raw => T.isValidCode(raw);

function _send(t, body, target) { return T.send({ t, v: V, ...body }, target); }

function _wire() {
    _offs.push(T.onMessage((m, peer) => { if (m && m.v === V) _onMsg(m, peer); }));
    _offs.push(T.onPeerJoin(peer => {
        if (_role === 'client' && mySeat() < 0) _send(MSG.HELLO, { names: _name }, peer);
        if (_role === 'host') _broadcastRoster();
    }));
    _offs.push(T.onPeerLeave(peer => {
        if (_role === 'client' && peer === _hostPeer) { _emit('closed', 'The host left the room.'); leave(); return; }
        if (_role !== 'host') return;
        if (!_seats.some(s => s.peer === peer)) return;
        for (let i = _seats.length - 1; i >= 0; i--) if (_seats[i].peer === peer) { _seats.splice(i, 1); _totals.splice(i, 1); }
        if (_round) { _round.ready.delete(peer); _round.started ? _checkRound() : _hostReady(null); }
        _broadcastRoster();
    }));
}

const _list = names => (Array.isArray(names) ? names : [names]).map(n => String(n || '').trim().slice(0, 16)).filter(Boolean);

/** names: this phone's players (none for a TV). opts.tv: host on a TV. */
export async function host(names, opts = {}) {
    await leave();
    _role = 'host'; _tv = !!opts.tv;
    _mode = Drinks.isOn() ? 'drinking' : 'party'; _rules = [];
    _seats = _tv ? [] : (_list(names).length ? _list(names) : ['Host']).slice(0, MAX_SEATS).map(name => ({ peer: SELF, name }));
    _totals = _seats.map(() => 0); _n = 0;
    _wire();
    await T.connect(T.makeRoomCode());
    _emit('roster', seats());
    return code();
}

export async function join(roomCode, names) {
    await leave();
    _role = 'client'; _name = _list(names).length ? _list(names) : ['Player'];
    _wire();
    await T.connect(T.normaliseCode(roomCode));
    _send(MSG.HELLO, { names: _name });   // the host may already be here
}

/** Captain → TV: "do the next thing" (spin, play it, next round). */
export function command() { if (_role === 'client' && _hostPeer) _send(MSG.CMD, {}, _hostPeer); }

export async function leave() {
    if (_round && _round.timer) clearTimeout(_round.timer);
    _round = null; _role = null; _hostPeer = null; _seats = []; _totals = []; _tv = false; _rules = [];
    _ghosts.clear(); _ghostN = 0;
    _offs.splice(0).forEach(off => { try { off(); } catch (e) {} });
    if (T.isOpen()) await T.disconnect();
}

function _broadcastRoster() {
    const list = _seats.map(s => ({ name: s.name, peer: s.peer === SELF ? T.selfId() : s.peer }));
    _send(MSG.ROSTER, { seats: list, totals: _totals, tv: _tv, mode: _mode, rules: _rules });
    _emit('roster', seats());
}

// ---- host: rounds ----------------------------------------------------------------
// How long a round may run before the host scores whoever answered.
export const ROUND_CAP_MS = 90000;
const GRACE_MS = 8000;

export function startRound(type) {
    if (!isHost() || _seats.length < 2 || _round) return false;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    _n++;
    _round = { type, seed, n: _n, ready: new Set(), scores: new Map(), started: false };
    _send(MSG.ROUND, { type, seed, n: _n });
    _ghosts.clear(); _ghostN = _n;
    _emit('round', { type, seed, n: _n });
    return true;
}

export function ready() {
    if (isHost()) _hostReady(SELF);
    else _send(MSG.READY, {}, _hostPeer);
}

/** scores: one per player on this phone, in seat order (a number for one). */
export function reportScore(scores) {
    const list = (Array.isArray(scores) ? scores : [scores]).map(x => Math.round(Number(x) || 0));
    if (isHost()) _hostScore(SELF, list);
    else _send(MSG.SCORE, { scores: list }, _hostPeer);
}

// Passing the phone round takes a little longer than handing it over.
const PASS_MS = 15000;

function _hostReady(peer) {
    const r = _round;
    if (!r || r.started) return;
    if (peer) r.ready.add(peer);
    const peers = _peers();
    _emit('readyCount', peers.filter(p => r.ready.has(p)).length, peers.length);
    if (peers.length && peers.every(p => r.ready.has(p))) {
        r.started = true;
        _send(MSG.GO, { n: r.n });
        _emit('go', { type: r.type, seed: r.seed });
        const most = Math.max(1, ...peers.map(p => _seats.filter(s => s.peer === p).length));
        // golf brings a longer round; a passed phone plays it once per player
        r.timer = setTimeout(() => _finishRound(), most * (soloRoundMs(r.type, ROUND_CAP_MS) + GRACE_MS) + (most - 1) * PASS_MS);
    }
}

function _hostScore(peer, list) {
    const r = _round;
    if (!r || !r.started) return;
    let k = 0;
    _seats.forEach(s => { if (s.peer === peer) r.scores.set(s, Math.max(0, Number(list[k++]) || 0)); });
    _emit('scoreCount', r.scores.size, _seats.length);
    _checkRound();
}

function _checkRound() {
    const r = _round;
    if (!r || !r.started) return;
    if (!_seats.length) { if (r.timer) clearTimeout(r.timer); _round = null; return; }
    if (_seats.every(s => r.scores.has(s))) _finishRound();
}

// Set by the arcade: (winnerId, scores, n) => points per seat.
let _scorer = null;
export function setScorer(fn) { _scorer = fn; }

function _finishRound() {
    const r = _round;
    if (!r) return;
    if (r.timer) clearTimeout(r.timer);
    _round = null;
    const scores = _seats.map(s => r.scores.get(s) || 0);
    const best = Math.max(...scores);
    const winners = scores.filter(x => x === best).length;
    const winner = winners === 1 ? scores.indexOf(best) : -1;
    const pay = _scorer ? _scorer(winner, scores, scores.length) : scores.map(() => 0);
    pay.forEach((p, i) => { _totals[i] = (_totals[i] || 0) + p; });
    const names = _seats.map(s => s.name);
    let drinks = null;
    if (_mode === 'drinking' && scores.length >= 2) {
        drinks = Drinks.sips(scores);
        const rule = Drinks.drawRule(scores, _rules.map(x => x.rule));
        if (rule) { drinks.rule = { name: names[rule.seat], rule: rule.rule }; _rules.push(drinks.rule); }
    }
    const result = { type: r.type, n: r.n, scores, pay, totals: _totals.slice(), winner, names, drinks, rules: _rules.slice(), mode: _mode };
    _send(MSG.RESULT, result);
    _emit('result', result);
}

// ---- messages --------------------------------------------------------------------
// ---- ghosts: where everyone is in a time trial -----------------------------------
const _ghosts = new Map();   // seat index → { s, at }, this round only
let _ghostN = 0;

/** This phone's racer (seat = which of its players is racing). */
export function sendGhost(seat, s) {
    if (!_role || !_ghostN) return;
    _send(MSG.GHOST, { n: _ghostN, seat, s });
}
/** Everyone heard from this round: [{ seat, s, at }]. */
export const ghosts = () => [..._ghosts].map(([seat, g]) => ({ seat, s: g.s, at: g.at }));

function _onGhost(m, peer) {
    // Only for the round in play, and only for a seat that phone really holds.
    if (m.n !== _ghostN || !_seats[m.seat] || _seats[m.seat].peer !== peer || !m.s || typeof m.s !== 'object') return;
    _ghosts.set(m.seat, { s: m.s, at: performance.now() });
}

function _onMsg(m, peer) {
    if (m.t === MSG.GHOST) return _onGhost(m, peer);
    if (_role === 'host') {
        if (m.t === MSG.HELLO) {
            if (_seats.some(s => s.peer === peer)) return _broadcastRoster();
            if (_seats.length >= MAX_SEATS || _round) return;   // full, or mid-round
            const want = _list(m.names || m.name);
            (want.length ? want : ['Player']).slice(0, MAX_SEATS - _seats.length).forEach(name => { _seats.push({ peer, name }); _totals.push(0); });
            _broadcastRoster();
        } else if (m.t === MSG.READY) _hostReady(peer);
        else if (m.t === MSG.SCORE) _hostScore(peer, m.scores || [m.score]);
        else if (m.t === MSG.CMD && _tv && _seats[0] && _seats[0].peer === peer) _emit('cmd');
        return;
    }
    if (_role !== 'client') return;
    // Only the host sends these; the first ROSTER names who that is.
    if (m.t === MSG.ROSTER) {
        _hostPeer = peer;
        _seats = (m.seats || []).map(s => ({ peer: s.peer, name: s.name }));
        _totals = m.totals || [];
        _tv = !!m.tv; _mode = m.mode || 'party'; _rules = m.rules || [];
        _emit('roster', seats());
    } else if (peer !== _hostPeer) {
        return;
    } else if (m.t === MSG.ROUND) { _ghosts.clear(); _ghostN = m.n; _emit('round', { type: m.type, seed: m.seed, n: m.n }); }
    else if (m.t === MSG.GO) _emit('go', {});
    else if (m.t === MSG.RESULT) { _totals = m.totals || _totals; _rules = m.rules || _rules; _emit('result', m); }
}
