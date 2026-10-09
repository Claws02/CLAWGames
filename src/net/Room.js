// ============================================================
// ROOM — Play Together's session: one phone per player, one room code.
//
// Host-authoritative. The host owns the roster and the round; everybody else
// only says hello, votes ready and reports a score. Messages ride claw-core's
// NetTransport (Trystero WebRTC; ?net=local for two tabs of one browser).
//
//   client → host   HELLO  {name}           on every peer join, until seated
//   host   → all    ROSTER {seats}          whenever it changes
//   host   → all    ROUND  {type, seed, n}  a game is announced
//   any    → host   READY  {}               my card is read
//   host   → all    GO     {}               the last vote landed: play
//   any    → host   SCORE  {score}          my game ended
//   host   → all    RESULT {type, scores, pay, totals, n}
//
// A phone that leaves mid-round is scored 0; a host that leaves ends the room.
// ============================================================
import * as T from '../claw-core/net/NetTransport.js';

export const MAX_SEATS = 4;
const V = 1;
const MSG = { HELLO: 'hello', ROSTER: 'roster', ROUND: 'round', READY: 'ready', GO: 'go', SCORE: 'score', RESULT: 'result' };
const SELF = 'self';

let _role = null;           // 'host' | 'client' | null
let _name = 'Player';
let _hostPeer = null;       // client: who the host is
let _seats = [];            // host: [{ peer, name }]; client: mirror from ROSTER
let _round = null;          // host: { type, seed, n, ready:Set, scores:Map, timer }
let _totals = [];
let _n = 0;
const _subs = {};
const _offs = [];

export const on = (kind, fn) => { (_subs[kind] ||= []).push(fn); };
const _emit = (kind, ...a) => (_subs[kind] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error('[room]', kind, e); } });

export const role = () => _role;
export const isHost = () => _role === 'host';
export const code = () => T.roomCode();
export const seats = () => _seats.map(s => ({ name: s.name, me: s.peer === SELF || s.peer === T.selfId() }));
export const mySeat = () => seats().findIndex(s => s.me);
export const totals = () => _totals.slice();
export const codeOk = raw => T.isValidCode(raw);

function _send(t, body, target) { return T.send({ t, v: V, ...body }, target); }

function _wire() {
    _offs.push(T.onMessage((m, peer) => { if (m && m.v === V) _onMsg(m, peer); }));
    _offs.push(T.onPeerJoin(peer => {
        if (_role === 'client' && mySeat() < 0) _send(MSG.HELLO, { name: _name }, peer);
        if (_role === 'host') _broadcastRoster();
    }));
    _offs.push(T.onPeerLeave(peer => {
        if (_role === 'client' && peer === _hostPeer) { _emit('closed', 'The host left the room.'); leave(); return; }
        if (_role !== 'host') return;
        const i = _seats.findIndex(s => s.peer === peer);
        if (i < 0) return;
        _seats.splice(i, 1);
        _totals.splice(i, 1);
        if (_round) { _round.gone = (_round.gone || 0) + 1; _checkRound(); }
        _broadcastRoster();
    }));
}

export async function host(name) {
    await leave();
    _role = 'host'; _name = name || 'Host';
    _seats = [{ peer: SELF, name: _name }];
    _totals = [0]; _n = 0;
    _wire();
    await T.connect(T.makeRoomCode());
    _emit('roster', seats());
    return code();
}

export async function join(roomCode, name) {
    await leave();
    _role = 'client'; _name = name || 'Player';
    _wire();
    await T.connect(T.normaliseCode(roomCode));
    _send(MSG.HELLO, { name: _name });   // the host may already be here
}

export async function leave() {
    if (_round && _round.timer) clearTimeout(_round.timer);
    _round = null; _role = null; _hostPeer = null; _seats = []; _totals = [];
    _offs.splice(0).forEach(off => { try { off(); } catch (e) {} });
    if (T.isOpen()) await T.disconnect();
}

function _broadcastRoster() {
    const list = _seats.map(s => ({ name: s.name, peer: s.peer === SELF ? T.selfId() : s.peer }));
    _send(MSG.ROSTER, { seats: list, totals: _totals });
    _emit('roster', seats());
}

// ---- host: rounds ----------------------------------------------------------------
// How long a round may run before the host scores whoever answered.
export const ROUND_CAP_MS = 90000;
const GRACE_MS = 8000;

export function startRound(type) {
    if (!isHost() || _seats.length < 2) return false;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    _n++;
    _round = { type, seed, n: _n, ready: new Set(), scores: new Map(), gone: 0, started: false };
    _send(MSG.ROUND, { type, seed, n: _n });
    _emit('round', { type, seed, n: _n });
    return true;
}

export function ready() {
    if (isHost()) _hostReady(SELF);
    else _send(MSG.READY, {}, _hostPeer);
}

export function reportScore(score) {
    if (isHost()) _hostScore(SELF, score);
    else _send(MSG.SCORE, { score: Math.round(Number(score) || 0) }, _hostPeer);
}

function _hostReady(peer) {
    const r = _round;
    if (!r || r.started) return;
    r.ready.add(peer);
    _emit('readyCount', r.ready.size, _seats.length);
    if (_seats.every(s => r.ready.has(s.peer))) {
        r.started = true;
        _send(MSG.GO, { n: r.n });
        _emit('go', { type: r.type, seed: r.seed });
        r.timer = setTimeout(() => _finishRound(), ROUND_CAP_MS + GRACE_MS);
    }
}

function _hostScore(peer, score) {
    const r = _round;
    if (!r || !r.started) return;
    r.scores.set(peer, Math.max(0, Number(score) || 0));
    _checkRound();
}

function _checkRound() {
    const r = _round;
    if (r && r.started && _seats.every(s => r.scores.has(s.peer))) _finishRound();
}

// Set by the arcade: (winnerId, scores, n) => points per seat.
let _scorer = null;
export function setScorer(fn) { _scorer = fn; }

function _finishRound() {
    const r = _round;
    if (!r) return;
    if (r.timer) clearTimeout(r.timer);
    _round = null;
    const scores = _seats.map(s => r.scores.get(s.peer) || 0);
    const best = Math.max(...scores);
    const winners = scores.filter(x => x === best).length;
    const winner = winners === 1 ? scores.indexOf(best) : -1;
    const pay = _scorer ? _scorer(winner, scores, scores.length) : scores.map(() => 0);
    pay.forEach((p, i) => { _totals[i] = (_totals[i] || 0) + p; });
    const result = { type: r.type, n: r.n, scores, pay, totals: _totals.slice(), winner, names: _seats.map(s => s.name) };
    _send(MSG.RESULT, result);
    _emit('result', result);
}

// ---- messages --------------------------------------------------------------------
function _onMsg(m, peer) {
    if (_role === 'host') {
        if (m.t === MSG.HELLO) {
            if (_seats.some(s => s.peer === peer)) return _broadcastRoster();
            if (_seats.length >= MAX_SEATS || _round) return;   // full, or mid-round
            _seats.push({ peer, name: String(m.name || 'Player').slice(0, 16) });
            _totals.push(0);
            _broadcastRoster();
        } else if (m.t === MSG.READY) _hostReady(peer);
        else if (m.t === MSG.SCORE) _hostScore(peer, m.score);
        return;
    }
    if (_role !== 'client') return;
    // Only the host sends these; the first ROSTER names who that is.
    if (m.t === MSG.ROSTER) {
        _hostPeer = peer;
        _seats = (m.seats || []).map(s => ({ peer: s.peer, name: s.name }));
        _totals = m.totals || [];
        _emit('roster', seats());
    } else if (peer !== _hostPeer) {
        return;
    } else if (m.t === MSG.ROUND) _emit('round', { type: m.type, seed: m.seed, n: m.n });
    else if (m.t === MSG.GO) _emit('go', {});
    else if (m.t === MSG.RESULT) { _totals = m.totals || _totals; _emit('result', m); }
}
