// ============================================================
// ROOM — Play Together's session: one phone per player, one room code.
//
// Host-authoritative. The host owns the roster and the round; everybody else
// only says hello, votes ready and reports scores. Messages ride claw-core's
// NetTransport (Trystero WebRTC; ?net=local for two tabs of one browser).
//
// A TV host (a laptop tab cast to the TV) takes no seat: it shows the wheel
// and the scores, and the first phone in is its captain. A phone host can sit
// out the same way (opts.watch): it runs the room and only the guests play. A phone may carry
// several players (pass the phone): it plays the round once for each of them.
//
//   client → host   HELLO  {names, pid, proto}   on joining, to every new peer, and every few s until seated
//   host   → one    REFUSE {reason}              'update' (another build), 'full', or 'removed' (by the host)
//   host   → one    WAIT   {reason}              'round': you're in from the next one
//   host   → all    ROSTER {seats, totals, tv, hostSeated, mode, rules, rid, proto, round, last}
//   host   → all    ROUND  {type, seed, n}       a game is announced (and again to phones that lag)
//   any    → host   READY  {n}                   my card is read (one per phone)
//   host   → all    GO     {n}                   the last vote landed (or the host started anyway)
//   any    → host   SCORE  {n, scores}           my players' games ended, in seat order
//   any    → host   SYNC   {n, scores}           "I sent my scores: where's the result?"
//   host   → all    RESULT {type, scores, pay, totals, n, drinks?, rules}
//   any    → all    BYE    {}                    leaving on purpose (a host's BYE closes the room)
//   captain → TV    CMD    {}                    "spin / play it / next" from the couch
//   any    → host   PICK   {n, round, seat, right, ms}  a race's answer (Shell Game): right or
//                                                not, ms after that phone's cups stopped (-1: none)
//   host   → all    CALL   {n, round, winner, name, wins, done}  who answered first (fastest right
//                                                pick); repeated each tick until the next round
//   any     → all   GHOST  {n, seat, s}          a racer's whereabouts, ~9 a second, during
//                                                a time trial (SoloArena ghosts); straight to
//                                                every phone, not through the host
//
// NOTHING IS SENT ONCE AND HOPED FOR. A phone drops off for a few seconds (a
// locked iPhone, a WiFi blip) and loses whatever was sent meanwhile, so every
// state can be recovered: the host repeats ROUND/GO to phones that haven't
// answered, a phone that scored asks for the RESULT until it has it, and a
// phone that comes back says HELLO with its player id (pid, kept for this
// browser tab) and gets its own seats back, points and all. A seat whose phone
// drops is AWAY, never deleted: it keeps its place and points, a round waits
// for it only briefly, and it's back the moment the phone is. Seats only ever
// go (a BYE) between rounds, so seat numbers never move while one is played.
//
// `v` is the envelope every build has read since the first and never changes;
// `proto` is the protocol inside it. A phone on another protocol is told to
// refresh instead of being ignored.
//
// Up to MAX_SEATS players: every game here is played alone on each phone and
// the scores compared, so a room scales past the four a shared screen seats.
// The host can switch drinking mode on and off at any time (setDrinking).
// ============================================================
import * as T from '../claw-core/net/NetTransport.js';
import { soloRoundMs, MG_PARALLEL, MG_SOLO_MS } from '../claw-core/config/MinigameRegistry.js';
import * as Drinks from '../arcade/Drinks.js';

export const MAX_SEATS = 12;
const V = 1;                  // the envelope: never change it
export const PROTO = 3;       // the protocol: bump on any change an older build would get wrong (3: races)
const MSG = {
    HELLO: 'hello', REFUSE: 'refuse', WAIT: 'wait', ROSTER: 'roster', ROUND: 'round', READY: 'ready', GO: 'go',
    SCORE: 'score', SYNC: 'sync', RESULT: 'result', BYE: 'bye', CMD: 'cmd', GHOST: 'ghost', PICK: 'pick', CALL: 'call',
};
const SELF = 'self';
const TICK_MS = 3000;         // how often lagging phones are caught up
const AWAY_GRACE_MS = 20000;  // how long a round waits for a phone that dropped off mid-game
const STALL_MS = 20000;       // no progress this long: the host may start / finish without the rest
const RECONNECT_MS = 60000;   // how long a phone waits for a host that dropped off
const SNAP_KEY = 'claw.room', PID_KEY = 'claw.pid', SNAP_MAX_AGE = 6 * 3600e3;

let _role = null;           // 'host' | 'client' | null
let _name = ['Player'];
let _hostPeer = null;       // client: who the host is
let _rid = null;            // this room's id: a host that reloads keeps it, another room on the same code doesn't
let _seats = [];            // host: [{ peer, pid, name, away, awayAt, bye }]; client: [{ peer, name, away }] from ROSTER
let _round = null;          // host: { type, seed, n, ready:Set, scores:Map(seat), started, timer, progressAt, stalled }
let _last = null;           // host: the last RESULT, for phones that missed it
let _waiting = new Map();   // host: peer → { pid, names }, asked to join mid-round
let _banned = new Set();    // host: player ids the host removed (they can't come back to this room)
let _tv = false;            // the host is a TV: no seat of its own
let _hostSeated = true;     // the host's own players are seats 0.. (false for a TV or a watching phone)
let _mode = 'party';        // 'party' | 'drinking'
let _rules = [];            // drinking: [{ name, rule }] for the rest of the room
let _totals = [];
let _n = 0;
let _tick = null;
let _collided = false;
// client
let _status = null;         // 'seeking' | 'waiting' | 'seated' | 'refused'
let _refusal = null;
let _cur = null;            // the round this phone was dealt: { type, seed, n }
let _readyN = 0, _goN = 0, _scoredN = 0, _resN = 0, _sent = [];
let _reconnect = null, _reconnectAt = 0, _kicked = 0;
const _subs = {};
const _offs = [];

export const on = (kind, fn) => { (_subs[kind] ||= []).push(fn); };
const _emit = (kind, ...a) => (_subs[kind] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error('[room]', kind, e); } });

export const role = () => _role;
export const isHost = () => _role === 'host';
export const code = () => T.roomCode();
export const isTv = () => _tv;
/** Is seat 0 the host's own phone? (Not for a TV, or a phone host sitting out.) */
export const hostSeated = () => _hostSeated;
/** This phone hosts and sits out: it runs the room, the guests play. */
export const isWatching = () => _role === 'host' && !_tv && !_hostSeated;
export const mode = () => _mode;
/** A client's standing: 'seeking' | 'waiting' (for the next round) | 'seated' | 'refused'. */
export const status = () => (_role === 'host' ? 'seated' : _status);
/** A client lost its host and is trying to get it back. */
export const reconnecting = () => !!_reconnect;
/** Host: drinking mode on or off for the room, from the next result on. */
export function setDrinking(on) {
    if (!isHost()) return;
    _mode = on ? 'drinking' : 'party';
    _broadcastRoster();
}
export const rules = () => _rules.slice();
const _isMe = s => s.peer === SELF || (!!s.peer && s.peer === T.selfId());
export const seats = () => _seats.map(s => ({ name: s.name, me: _isMe(s), away: !!s.away }));
export const mySeat = () => seats().findIndex(s => s.me);
export const mySeats = () => seats().map((s, i) => (s.me ? i : -1)).filter(i => i >= 0);
const _live = () => _seats.filter(s => !s.away);
/** The seats on the same phone as seat i (itself included). */
export const phoneOf = i => (_seats[i] ? _seats.map((s, k) => (s.peer === _seats[i].peer ? k : -1)).filter(k => k >= 0) : []);
/** Does some phone carry more than one player (pass the phone)? */
export const sharedPhone = () => { const n = {}; return _seats.some(s => (n[s.peer] = (n[s.peer] || 0) + 1) > 1); };
const _livePeers = () => [...new Set(_live().map(s => s.peer))];
// The phone that drives a TV room: whoever sat down first.
export const isCaptain = () => _tv && mySeat() === 0;
export const totals = () => _totals.slice();
export const codeOk = raw => T.isValidCode(raw);

function _send(t, body, target) { return T.send({ t, v: V, ...body }, target); }
const _now = () => performance.now();
const _rand = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// This browser tab's player id. sessionStorage: it survives a reload and the
// phone being locked, and two tabs (or the QA's pages) are two players.
let _memPid = null;
function _pid() {
    try {
        let p = sessionStorage.getItem(PID_KEY);
        if (!p) { p = 'p-' + _rand(); sessionStorage.setItem(PID_KEY, p); }
        return p;
    } catch (e) { return (_memPid ||= 'p-' + _rand()); }
}

function _wire() {
    _offs.push(T.onMessage((m, peer) => { if (m && m.v === V) _onMsg(m, peer); }));
    _offs.push(T.onPeerJoin(peer => {
        // Only a host answers a HELLO, so saying it to every newcomer is how a
        // phone finds its host again after either of them dropped off.
        if (_role === 'client') _hello(peer);
        if (_role === 'host') _broadcastRoster();
    }));
    _offs.push(T.onPeerLeave(peer => {
        if (_role === 'client') { if (peer === _hostPeer) _lostHost(); return; }
        if (_role !== 'host') return;
        _waiting.delete(peer);
        const mine = _seats.filter(s => s.peer === peer && !s.away);
        if (!mine.length) return;
        // Away, not gone: a locked phone is back in a few seconds.
        mine.forEach(s => { s.away = true; s.awayAt = _now(); });
        _seatsChanged();
    }));
}

const _list = names => (Array.isArray(names) ? names : [names]).map(n => String(n || '').trim().slice(0, 16)).filter(Boolean);

// ---- host / join / leave -------------------------------------------------------

/** names: this phone's players (none for a TV). opts.tv: host on a TV; opts.watch: a phone host that sits out;
 *  opts.resume: a snapshot from resumable(), to reopen this tab's room after a reload. */
export async function host(names, opts = {}) {
    const snap = opts.resume || null;
    await _teardown(!snap);
    _role = 'host'; _tv = snap ? !!snap.tv : !!opts.tv; _hostSeated = snap ? !!snap.hostSeated : !_tv && !opts.watch;
    _last = null; _waiting = new Map();
    if (snap) {
        _rid = snap.rid; _mode = snap.mode || 'party'; _rules = snap.rules || []; _n = snap.n || 0;
        // Everyone else is away until their phone says hello again.
        _seats = snap.seats.map(s => (s.pid === SELF ? { peer: SELF, pid: SELF, name: s.name, away: false }
            : { peer: null, pid: s.pid, name: s.name, away: true, awayAt: -1e9 }));
        _totals = _seats.map((_, i) => Number(snap.totals[i]) || 0);
    } else {
        _rid = 'r-' + _rand(); _mode = Drinks.isOn() ? 'drinking' : 'party'; _rules = []; _n = 0; _banned = new Set();
        _seats = !_hostSeated ? [] : (_list(names).length ? _list(names) : ['Host']).slice(0, MAX_SEATS).map(name => ({ peer: SELF, pid: SELF, name, away: false }));
        _totals = _seats.map(() => 0);
    }
    _wire();
    await T.connect(snap ? snap.code : T.makeRoomCode());
    _tick = setInterval(_hostTick, TICK_MS);
    _save();
    _emit('roster', seats());
    if (snap) _emit('resumed');
    return code();
}

export async function join(roomCode, names) {
    await _teardown(true);
    _role = 'client'; _name = _list(names).length ? _list(names) : ['Player'];
    _status = 'seeking';
    _wire();
    await T.connect(T.normaliseCode(roomCode));
    _hello();   // the host may already be here
    _tick = setInterval(_clientTick, TICK_MS);
}

function _hello(target) { _send(MSG.HELLO, { names: _name, pid: _pid(), proto: PROTO }, target); }

/** Captain → TV: "do the next thing" (spin, play it, next round). */
export function command() { if (_role === 'client' && _hostPeer) _send(MSG.CMD, {}, _hostPeer); }

/** Leave on purpose: the room is told (a host's leaving closes it for everyone). */
export async function leave() {
    if (_role && T.isOpen()) {
        // Stop listening first: the room's answer to our BYE must not draw a HELLO back out of us.
        _offs.splice(0).forEach(off => { try { off(); } catch (e) {} });
        if (_tick) { clearInterval(_tick); _tick = null; }
        _send(MSG.BYE, {});
        await new Promise(r => setTimeout(r, 120));   // let it go out before the links close
    }
    await _teardown(true);
}

async function _teardown(forget) {
    if (_round && _round.timer) clearTimeout(_round.timer);
    if (_tick) clearInterval(_tick);
    if (_reconnect) clearTimeout(_reconnect);
    if (forget && _role === 'host') forgetResumable();
    _tick = null; _reconnect = null; _kicked = 0;
    _round = null; _last = null; _role = null; _hostPeer = null; _rid = null; _seats = []; _totals = []; _tv = false; _rules = [];
    _waiting = new Map(); _status = null; _refusal = null; _cur = null; _readyN = _goN = _scoredN = _resN = 0; _sent = []; _collided = false;
    _ghosts.clear(); _ghostN = 0; _raceReset(0);
    _offs.splice(0).forEach(off => { try { off(); } catch (e) {} });
    if (T.isOpen()) await T.disconnect();
}

function _broadcastRoster() {
    if (_role !== 'host') return;
    const list = _seats.map(s => ({ name: s.name, away: !!s.away, peer: s.peer === SELF ? T.selfId() : s.peer }));
    _send(MSG.ROSTER, {
        seats: list, totals: _totals, tv: _tv, hostSeated: _hostSeated, mode: _mode, rules: _rules,
        rid: _rid, proto: PROTO, round: _round ? _round.n : 0, last: _last ? _last.n : 0,
    });
    _save();
    _emit('roster', seats());
}

// ---- host: the snapshot a reloaded tab reopens the room from ---------------------
function _save() {
    if (_role !== 'host') return;
    try {
        sessionStorage.setItem(SNAP_KEY, JSON.stringify({
            code: T.roomCode(), rid: _rid, tv: _tv, hostSeated: _hostSeated, mode: _mode, rules: _rules, n: _n, at: Date.now(),
            seats: _seats.map(s => ({ pid: s.pid, name: s.name })), totals: _totals,
        }));
    } catch (e) { /* not kept: a reload starts afresh */ }
}

/** The room this tab was hosting before it was reloaded, if it's recent, or null. */
export function resumable() {
    if (_role) return null;
    try {
        const s = JSON.parse(sessionStorage.getItem(SNAP_KEY) || 'null');
        return s && s.code && T.isValidCode(s.code) && Date.now() - s.at < SNAP_MAX_AGE && Array.isArray(s.seats) ? s : null;
    } catch (e) { return null; }
}
export function forgetResumable() { try { sessionStorage.removeItem(SNAP_KEY); } catch (e) {} }

// ---- host: seats ------------------------------------------------------------------
function _onHello(m, peer) {
    if (m.proto !== PROTO) return _send(MSG.REFUSE, { reason: 'update', proto: PROTO }, peer);
    let pid = String(m.pid || '').slice(0, 40);
    if (!pid || pid === SELF) pid = 'peer-' + peer;
    if (_banned.has(pid)) return _send(MSG.REFUSE, { reason: 'removed' }, peer);
    const mine = _seats.filter(s => s.pid === pid);
    if (mine.length) {
        // Back again (a reload, a locked screen): the same seats and points.
        const moved = mine.some(s => s.peer !== peer || s.away);
        mine.forEach(s => { s.peer = peer; s.away = false; s.bye = false; });
        _waiting.delete(peer);
        if (moved) { _seatsChanged(); _catchUp(peer); } else _broadcastRoster();
        return;
    }
    const want = _list(m.names || m.name);
    if (_round) {
        _waiting.set(peer, { pid, names: want });
        return _send(MSG.WAIT, { reason: 'round' }, peer);
    }
    if (_seats.length >= MAX_SEATS) return _send(MSG.REFUSE, { reason: 'full', max: MAX_SEATS }, peer);
    _seatNew(peer, pid, want);
    _broadcastRoster();
}

function _seatNew(peer, pid, want) {
    const room = MAX_SEATS - _seats.length;
    (want.length ? want : ['Player']).slice(0, room).forEach(name => { _seats.push({ peer, pid, name, away: false }); _totals.push(0); });
}

/** Host: take seat i out of the room, with everyone on the same phone. That
 *  phone is told, and can't rejoin this room. Mid-round the seats sit out the
 *  rest of it and go at the result (seat numbers never move during a round). */
export function remove(i) {
    const seat = _seats[i];
    if (!isHost() || !seat || seat.peer === SELF) return false;
    const mine = _seats.filter(s => s.peer === seat.peer);
    _banned.add(seat.pid);
    if (seat.peer && !seat.away) _send(MSG.REFUSE, { reason: 'removed' }, seat.peer);
    if (seat.peer) _waiting.delete(seat.peer);
    mine.forEach(s => { s.bye = true; s.away = true; s.awayAt = -1e9; s.peer = s.peer || null; });
    _seatsChanged();
    return true;
}

// Between rounds only (seat numbers stay put while one is played): drop the
// seats whose phones left on purpose, then let in whoever asked meanwhile.
function _settle() {
    if (_round) return;
    for (let i = _seats.length - 1; i >= 0; i--) if (_seats[i].bye && _seats[i].away) { _seats.splice(i, 1); _totals.splice(i, 1); }
    const peers = new Set(T.peerIds());
    for (const [peer, w] of _waiting) {
        if (!peers.has(peer)) continue;
        const mine = _seats.filter(s => s.pid === w.pid);
        if (mine.length) mine.forEach(s => { s.peer = peer; s.away = false; s.bye = false; });
        else if (_seats.length < MAX_SEATS) _seatNew(peer, w.pid, w.names);
        else _send(MSG.REFUSE, { reason: 'full', max: MAX_SEATS }, peer);
    }
    _waiting.clear();
}

function _seatsChanged() {
    const r = _round;
    if (r) {
        if (r.started) { _checkRound(); setTimeout(_checkRound, AWAY_GRACE_MS + 100); }
        else _hostReady(null);
    } else _settle();
    _broadcastRoster();
}

// A phone that just came back: whatever round is on.
function _catchUp(peer) {
    const r = _round;
    if (!r) return;
    _send(MSG.ROUND, _roundMsg(r), peer);
    if (r.started) _send(MSG.GO, { n: r.n }, peer);
}

// Every few seconds: a phone that hasn't answered the round gets it again.
function _hostTick() {
    const r = _round;
    if (!r) return;
    for (const p of _livePeers()) {
        if (p === SELF) continue;
        if (!r.started) { if (!r.ready.has(p)) _send(MSG.ROUND, _roundMsg(r), p); }
        else if (_seats.some(s => s.peer === p && !s.away && !r.scores.has(s))) _catchUp(p);
    }
    if (r.started && r.race) _repeatCalls();
    if (r.started) _checkRound();   // an away seat's grace may be up
    if (!_round) return;
    // Stuck on somebody: let the host go on without them.
    const missing = _missing(r);
    if (!r.stalled && missing.length && _now() - r.progressAt >= STALL_MS && (!r.started || r.scores.size > 0)) {
        r.stalled = true;
        _emit('stall', r.started ? 'score' : 'ready', missing);
    }
}

// Who the round is waiting for (one name per phone; 💤 for a phone that dropped off).
function _missing(r) {
    const out = [], seen = new Set();
    _seats.forEach(s => {
        if (seen.has(s.peer)) return;
        const waiting = r.started ? !r.scores.has(s) : !s.away && !r.ready.has(s.peer);
        if (waiting) { seen.add(s.peer); out.push(s.name + (s.away ? ' 💤' : '')); }
    });
    return out;
}

// ---- host: rounds ----------------------------------------------------------------
// How long a round may run before the host scores whoever answered.
export const ROUND_CAP_MS = 90000;
const GRACE_MS = 8000;

export function startRound(type) {
    if (!isHost() || _seats.length < 2 || _round) return false;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    _n++;
    const race = RACES.includes(type) && raceable();
    _round = { type, seed, n: _n, race, ready: new Set(), scores: new Map(), started: false, progressAt: _now(), stalled: false };
    _send(MSG.ROUND, _roundMsg(_round));
    _ghosts.clear(); _ghostN = _n;
    _raceReset(_n);
    _emit('round', { type, seed, n: _n, race });
    _hostReady(null);
    return true;
}

/** Host: start the round now, without the phones that haven't tapped ready (they're sent it anyway). */
export function startNow() { const r = _round; if (isHost() && r && !r.started) _go(r); }
/** Host: end the round now; whoever hasn't reported scores 0. */
export function finishNow() { const r = _round; if (isHost() && r && r.started) _finishRound(); }

export function ready() {
    if (isHost()) return _hostReady(SELF);
    if (!_cur) return;
    _readyN = _cur.n;
    _send(MSG.READY, { n: _cur.n }, _hostPeer);
}

/** scores: one per player on this phone, in seat order (a number for one). */
export function reportScore(scores) {
    const list = (Array.isArray(scores) ? scores : [scores]).map(x => Math.round(Number(x) || 0));
    if (isHost()) return _hostScore(SELF, list);
    if (!_cur) return;
    _scoredN = _cur.n; _sent = list;
    _send(MSG.SCORE, { n: _cur.n, scores: list }, _hostPeer);
}

// The most a game can honestly score, about twice over (a phone reporting more
// has been tampered with). Games whose top score can't be worked out from the
// code only get the sanity ceiling, so a real score is never cut.
const SCORE_MAX = {
    lootcatch: 60, treeclimb: 60,                          // capped at 30 in the game
    speedboat: 3000, riftdive: 3000, kartgp: 5000,         // 1000 + seconds left × 10
    stopclock: 10000, trivia: 4000,                        // 5 × 1000, 10 × 200
    higherlower: 1100, shellgame: 520, steadyhand: 2000,   // 51 calls, 25 shuffles, seconds × 10
};
const SCORE_CEILING = 100000;
const _clamp = (type, v) => Math.min(Math.max(0, Number(v) || 0), SCORE_MAX[type] || SCORE_CEILING);

// Passing the phone round takes a little longer than handing it over.
const PASS_MS = 15000;

function _hostReady(peer) {
    const r = _round;
    if (!r || r.started) return;
    if (peer) {
        if (!_live().some(s => s.peer === peer)) return;   // not one of ours (yet)
        if (!r.ready.has(peer)) r.progressAt = _now();
        r.ready.add(peer);
    }
    const peers = _livePeers();
    _emit('readyCount', peers.filter(p => r.ready.has(p)).length, peers.length, _missing(r));
    if (peers.length && peers.every(p => r.ready.has(p))) _go(r);
}

function _go(r) {
    r.started = true; r.progressAt = _now(); r.stalled = false;
    _send(MSG.GO, { n: r.n });
    _emit('go', { type: r.type, seed: r.seed });
    const peers = [...new Set(_seats.map(s => s.peer))];
    const most = Math.max(1, ...peers.map(p => _seats.filter(s => s.peer === p).length));
    // golf brings a longer round; a passed phone plays it once per player; a 3D
    // time trial can take a slow phone a few seconds more just to load
    const grace = GRACE_MS + (MG_SOLO_MS[r.type] ? 7000 : 0);
    r.timer = setTimeout(() => _finishRound(), most * (soloRoundMs(r.type, ROUND_CAP_MS) + grace) + (most - 1) * PASS_MS);
}

function _hostScore(peer, list) {
    const r = _round;
    if (!r || !r.started) return;
    let k = 0, fresh = false;
    _seats.forEach(s => {
        if (s.peer !== peer) return;
        const v = _clamp(r.type, list[k++]);
        if (!r.scores.has(s)) fresh = true;
        r.scores.set(s, v);
    });
    if (!fresh) return;   // a repeat (SYNC): nothing new
    r.progressAt = _now(); r.stalled = false;
    _emit('scoreCount', _seats.filter(s => r.scores.has(s)).length, _seats.length, _missing(r));
    _checkRound();
}

function _checkRound() {
    const r = _round;
    if (!r || !r.started) return;
    if (!_seats.length) { if (r.timer) clearTimeout(r.timer); _round = null; return; }
    // A seat whose phone dropped off gets a grace period to come back and report.
    const now = _now();
    if (_seats.every(s => r.scores.has(s) || (s.away && now - s.awayAt >= AWAY_GRACE_MS))) _finishRound();
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
    _last = result;
    _send(MSG.RESULT, result);
    _emit('result', result);
    _settle();
    _broadcastRoster();
}

// ---- client: keeping up ---------------------------------------------------------
// Where this phone is in the round it was dealt.
function _phase() {
    const n = _cur ? _cur.n : 0;
    if (!_cur || _resN >= n) return 'idle';
    if (_scoredN === n) return 'scored';
    if (_goN === n) return 'playing';
    if (_readyN === n) return 'ready';
    return 'card';
}

function _clientTick() {
    if (_reconnect) {
        _hello();   // the host may be back under a new id (it reloaded)
        // Past ten seconds, sign in to the room afresh: the signaling may have dropped us too.
        if (_now() - _reconnectAt > 10000 && _now() - _kicked > 20000) { _kicked = _now(); _rejoin(); }
        return;
    }
    // Not seated yet (looking, queued for the next round, or the room was full): keep asking.
    if (_status !== 'seated') {
        if (!(_status === 'refused' && _refusal !== 'full')) _hello(_hostPeer || undefined);
        return;
    }
    // Scored, and no result yet: ask (sending the scores again, in case they were lost).
    if (_hostPeer && _phase() === 'scored') _send(MSG.SYNC, { n: _cur.n, scores: _sent }, _hostPeer);
}

async function _rejoin() {
    const c = T.roomCode();
    const was = _role, rid = _rid;
    if (!c || !was) return;
    // The room may be left while this is in flight: never reopen a link nobody wants.
    const gone = () => _role !== was || _rid !== rid;
    try {
        await T.disconnect();
        if (gone()) return;
        await T.connect(c);
        if (gone()) { await T.disconnect(); return; }
        if (_role === 'client') _hello();
    } catch (e) { /* again on the next tick */ }
}

// Coming back to the page (screen unlocked, app switched back): if the links
// went while it was away, sign in to the room afresh rather than waiting.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (document.hidden || !_role) return;
    setTimeout(() => {
        if (_role === 'client' && _reconnect) { _kicked = _now(); _rejoin(); }
        else if (_role === 'host' && !T.peerIds().length && _seats.some(s => s.away && !s.bye && s.peer !== SELF)) _rejoin();
    }, 1500);
});

function _lostHost() {
    if (_reconnect) return;
    _reconnectAt = _now(); _kicked = 0;   // first fresh sign-in at 10 s, then every 20 s
    _reconnect = setTimeout(() => { _emit('closed', 'Lost the host. The room has closed.'); _teardown(true); }, RECONNECT_MS);
    _emit('reconnecting');
}

function _onRoster(m, peer) {
    if (_hostPeer && peer !== _hostPeer) {
        // The host reloaded and reopened the room: same room id, new peer.
        if (_reconnect && m.rid && m.rid === _rid) _hostPeer = peer;
        else { if (!_collided) { _collided = true; _emit('collision'); } return; }
    }
    if (!_hostPeer) { _hostPeer = peer; _rid = m.rid || null; }
    _seats = (m.seats || []).map(s => ({ peer: s.peer, name: s.name, away: !!s.away }));
    _totals = m.totals || [];
    _tv = !!m.tv; _hostSeated = m.hostSeated ?? !_tv; _mode = m.mode || 'party'; _rules = m.rules || [];
    if (_reconnect) { clearTimeout(_reconnect); _reconnect = null; _emit('reconnected'); }
    const seated = mySeat() >= 0;
    if (seated) _status = 'seated';
    else if (_status === 'seated') { _status = 'seeking'; _hello(_hostPeer); }
    // The round this phone was in is gone (the host reloaded mid-round): back to the room.
    if (_cur && m.round !== undefined && ['card', 'ready', 'playing', 'scored'].includes(_phase())
        && m.round !== _cur.n && (m.last || 0) < _cur.n) {
        _resN = _cur.n;
        _emit('dropped', { ..._cur });
    }
    _emit('roster', seats());
}

// ---- ghosts: where everyone is in a time trial -----------------------------------
const _ghosts = new Map();   // seat index → { s, at }, this round only
const GHOST_MAX = 256;       // bytes of JSON: a kart's state is under 80
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
    if (JSON.stringify(m.s).length > GHOST_MAX) return;   // a racer is a few numbers, never a payload
    _ghosts.set(m.seat, { s: m.s, at: _now() });
}

// ---- races: who answered first (Shell Game across phones) ------------------------
// A race is a parallel game where each round goes to the fastest RIGHT answer on
// any phone. Every phone plays the same shuffles and sends PICK with how long it
// took after ITS cups stopped, so the network can't make a fast hand slow. The
// host calls the round once everyone has picked, or RACE_GRACE_MS after the first
// right answer arrives (a slower link still gets heard), or RACE_WAIT_MS after the
// first pick at all (a phone that dropped off). Only when every phone holds one
// player: a passed-round phone can't race itself (that room plays it as before).
export const RACES = ['shellgame'];
export const RACE_TO = 3;
const RACE_GRACE_MS = 700, RACE_WAIT_MS = 7000;
let _raceN = 0, _wins = {};
const _calls = new Map(), _picks = new Map(), _raceTimers = [];

/** Can this room race? Two or more players, each on a phone of their own. */
export function raceable() {
    const per = new Map();
    for (const s of _seats) if (!s.bye) per.set(s.peer, (per.get(s.peer) || 0) + 1);
    return per.size >= 2 && [...per.values()].every(n => n === 1);
}
function _roundMsg(r) { return { type: r.type, seed: r.seed, n: r.n, ...(r.race ? { race: true } : {}) }; }
function _raceReset(n) { _raceN = n; _wins = {}; _calls.clear(); _picks.clear(); _raceTimers.splice(0).forEach(clearTimeout); }

/** This phone's answer for round `round` of the race (seat: the player). ms < 0 or Infinity: no answer. */
export function sendPick(seat, round, right, ms) {
    if (!_role || !_raceN) return;
    const m = { n: _raceN, round, seat, right: !!right, ms: Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : -1 };
    if (isHost()) return _hostPick(SELF, m);
    _send(MSG.PICK, m, _hostPeer);
}
/** The call for round `round` (null until the host has made it). */
export const raceCall = round => _calls.get(round) || null;

function _hostPick(peer, m) {
    const r = _round, seat = _seats[m.seat];
    if (!r || !r.race || m.n !== r.n || !seat || seat.peer !== peer || _calls.has(m.round)) return;
    let picks = _picks.get(m.round);
    if (!picks) { picks = new Map(); _picks.set(m.round, picks); _raceTimers.push(setTimeout(() => _judge(m.round, true), RACE_WAIT_MS)); }
    if (picks.has(m.seat)) return;
    picks.set(m.seat, { right: !!m.right && m.ms >= 0, ms: m.ms });
    if (m.right && m.ms >= 0 && !picks.rightAt) { picks.rightAt = _now(); _raceTimers.push(setTimeout(() => _judge(m.round, true), RACE_GRACE_MS)); }
    _judge(m.round, false);
}
function _judge(round, timeUp) {
    const picks = _picks.get(round);
    if (!picks || _calls.has(round) || !_round || _raceN !== _round.n) return;
    const racers = _seats.map((s, i) => i).filter(i => !_seats[i].away && !_seats[i].bye);
    const allIn = racers.every(i => picks.has(i));
    const graceUp = picks.rightAt && _now() - picks.rightAt >= RACE_GRACE_MS - 5;
    if (!allIn && !(timeUp && (graceUp || !picks.rightAt))) return;
    if (!allIn && timeUp && picks.rightAt && !graceUp) return;
    let winner = -1, best = Infinity;
    for (const [i, p] of picks) if (p.right && p.ms < best) { best = p.ms; winner = i; }
    if (winner >= 0) _wins[winner] = (_wins[winner] || 0) + 1;
    const call = { winner, name: winner >= 0 ? _seats[winner].name : '', wins: { ..._wins }, done: winner >= 0 && _wins[winner] >= RACE_TO };
    _calls.set(round, call);
    _send(MSG.CALL, { n: _raceN, round, ...call });
}
function _repeatCalls() {
    const rounds = [..._calls.keys()].sort((a, b) => b - a).slice(0, 3);
    for (const round of rounds) _send(MSG.CALL, { n: _raceN, round, ..._calls.get(round) });
}

// ---- messages --------------------------------------------------------------------
function _onMsg(m, peer) {
    if (m.t === MSG.GHOST) return _onGhost(m, peer);
    if (m.t === MSG.CALL) { if (_role === 'client' && peer === _hostPeer && m.n === _raceN && !_calls.has(m.round)) _calls.set(m.round, { winner: m.winner, name: m.name, wins: m.wins || {}, done: !!m.done }); return; }
    if (_role === 'host') return _hostMsg(m, peer);
    if (_role !== 'client') return;
    if (m.t === MSG.ROSTER) return _onRoster(m, peer);
    if (m.t === MSG.REFUSE) {
        // Taken out by the host: go, and say why.
        if (m.reason === 'removed' && _status === 'seated' && peer === _hostPeer) {
            _emit('closed', 'The host removed you from the room.');
            _teardown(true);
            return;
        }
        if (_status === 'seated') return;
        const again = _status === 'refused' && _refusal === m.reason;
        _status = 'refused'; _refusal = m.reason;
        if (!again) _emit('refused', m.reason, m);
        return;
    }
    // Only the host sends the rest.
    if (!_hostPeer || peer !== _hostPeer) return;
    if (m.t === MSG.BYE) { _emit('closed', 'The host closed the room.'); _teardown(true); return; }
    if (m.t === MSG.WAIT) { if (_status !== 'seated' && _status !== 'waiting') { _status = 'waiting'; _emit('waiting', m.reason); } return; }
    if (mySeat() < 0) return;   // not playing (yet): only the roster matters
    if (m.t === MSG.ROUND) {
        if (!MG_PARALLEL.includes(m.type)) return;
        if (_cur && _cur.n === m.n) {
            // Sent again: this phone already has it. Repeat our READY if the host can't have heard it.
            if (_readyN === m.n && _goN !== m.n) _send(MSG.READY, { n: m.n }, _hostPeer);
            return;
        }
        if (_cur && m.n < _cur.n) return;
        _cur = { type: m.type, seed: m.seed, n: m.n, race: !!m.race };
        _ghosts.clear(); _ghostN = m.n;
        _raceReset(m.n);
        _emit('round', { ..._cur });
    } else if (m.t === MSG.GO) {
        if (!_cur || m.n !== _cur.n || _goN === m.n) return;
        _goN = m.n;
        _emit('go', {});
    } else if (m.t === MSG.RESULT) {
        if (!(m.n > _resN)) return;
        _resN = m.n;
        _totals = m.totals || _totals; _rules = m.rules || _rules;
        _emit('result', m);
    }
}

function _hostMsg(m, peer) {
    if (m.t === MSG.HELLO) return _onHello(m, peer);
    // Another host on this code: two rooms are sharing it.
    if (m.t === MSG.ROSTER) { if (!_collided) { _collided = true; _emit('collision'); } return; }
    const r = _round;
    if (m.t === MSG.READY) { if (r && m.n === r.n) _hostReady(peer); }
    else if (m.t === MSG.PICK) { if (r && r.race && m.n === r.n) _hostPick(peer, m); }
    else if (m.t === MSG.SCORE) { if (r && m.n === r.n) _hostScore(peer, m.scores || []); }
    else if (m.t === MSG.SYNC) {
        if (r && r.n === m.n) _hostScore(peer, m.scores || []);              // their scores never arrived
        else if (_last && _last.n === m.n) _send(MSG.RESULT, _last, peer);   // the result never did
    } else if (m.t === MSG.BYE) {
        _waiting.delete(peer);
        const mine = _seats.filter(s => s.peer === peer);
        if (!mine.length) return;
        mine.forEach(s => { s.bye = true; s.away = true; s.awayAt = -1e9; });
        _seatsChanged();
    } else if (m.t === MSG.CMD && _tv && _seats[0] && !_seats[0].away && _seats[0].peer === peer) _emit('cmd');
}
