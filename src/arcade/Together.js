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
import * as Confirm from './Confirm.js';
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
    _paintResume();
}

// A tab that was hosting and got reloaded can reopen its room: same code,
// same players and points, everyone back as their phones say hello.
function _paintResume() {
    const b = $('btn-net-resume');
    if (!b) return;
    const snap = Room.resumable();
    b.hidden = !snap;
    if (snap) b.textContent = `↻ REOPEN ROOM ${snap.code} (${snap.seats.length} players)`;
}

// The strip across the top while this phone has lost its host.
function _banner(text) {
    let el = $('net-banner');
    if (!text) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'net-banner'; el.className = 'net-banner bfont'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text;
}

export function init(show, goHome) {
    _show = show; _home = goHome;
    Room.setScorer(pointsFor);
    prefill();
    // A join link (?join=ABCD, shown on the TV) fills the code in.
    const j = new URLSearchParams(location.search).get('join');
    if (j && Room.codeOk(j.toUpperCase())) $('net-code').value = j.toUpperCase();
    $('btn-net-add').addEventListener('click', () => _addName());

    // Whether the hosting phone plays too, or just runs the room (kept between visits).
    const plays = $('btn-net-plays');
    const paintPlays = () => {
        const on = Store.load('hostPlays', true);
        plays.textContent = on ? '🎮 HOST PLAYS TOO: ON' : '🎮 HOST PLAYS TOO: OFF · just runs the room';
        plays.classList.toggle('on', on);
        plays.setAttribute('aria-pressed', String(on));
    };
    plays.addEventListener('click', () => { Store.save('hostPlays', !Store.load('hostPlays', true)); paintPlays(); });
    paintPlays();
    $('btn-net-host').addEventListener('click', async () => {
        _hint('Opening a room…');
        try { await Room.host(_names(), { watch: !Store.load('hostPlays', true) }); _show('room'); _paintRoom(); _hint(''); }
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
            setTimeout(() => { if (Room.role() === 'client' && Room.status() === 'seeking') $('room-hint').textContent = 'Still looking for that room. Check the code, or refresh this page and join again.'; }, 12000);
        } catch (e) { _hint("Couldn't join. Check the code and your connection."); }
    });

    Room.on('roster', () => { if (!_tvHere()) _paintRoom(); });
    Room.on('round', r => { if (!_tvHere()) { _pending = r; _force(null); _showCard(); } });
    Room.on('readyCount', (k, n, missing = []) => {
        if (_tvHere() || (!Room.isWatching() && !$('btn-nc-ready').disabled)) return;
        $('nc-wait').textContent = `${k} of ${n} phones ready${missing.length ? ` · waiting for ${missing.join(', ')}` : ''}…`;
    });
    Room.on('go', () => {
        if (_tvHere()) return;
        _force(null);
        if (Room.isWatching()) { $('nc-wait').textContent = '🎮 PLAYING… look at the other phones!'; return; }
        _play();
    });
    Room.on('scoreCount', (k, n, missing = []) => {
        if (_tvHere()) return;
        const t = `${k} of ${n} scores in${missing.length && k ? ` · waiting for ${missing.join(', ')}` : ''}`;
        if (Room.isWatching()) $('nc-wait').textContent = `🎮 PLAYING… ${t}`;
        else if (!_playing && !$('scr-netresult').hidden && $('btn-nr-next').hidden) $('nr-wait').textContent = t;
    });
    // The host's way past a phone that never answers.
    Room.on('stall', (kind, missing) => { if (!_tvHere()) _force(kind, missing); });
    Room.on('result', r => { if (!_tvHere()) { _force(null); _showResult(r); } });
    Room.on('closed', msg => { _banner(null); Toast.show(msg); _abortGame(); _home(); });
    Room.on('reconnecting', () => _banner('📡 Lost the host. Reconnecting… keep this screen on'));
    Room.on('reconnected', () => { _banner(null); Toast.show('Back in the room!'); if (!_tvHere()) _paintRoom(); });
    Room.on('waiting', () => _paintRoom());
    Room.on('refused', () => _paintRoom());
    Room.on('collision', () => Toast.show(Room.isHost()
        ? `Another room is using ${Room.code()}. Close this one and host a new room.`
        : 'Two rooms are using this code. Ask your host to open a new room.', '#ef4444'));
    // The host lost the round (it reloaded mid-game): back to the room.
    Room.on('dropped', () => { _abortGame(); _show('room'); _paintRoom(); Toast.show('That round was lost when the host dropped out. Next one!'); });
    Room.on('resumed', () => { if (!Room.isTv()) { _show('room'); _paintRoom(); } });
    $('btn-net-resume')?.addEventListener('click', async () => {
        const snap = Room.resumable();
        if (!snap) return _paintResume();
        _hint('Reopening the room…');
        try { await Room.host([], { resume: snap }); _hint(''); }
        catch (e) { _hint("Couldn't reopen the room. Check your connection and try again."); }
    });
    $('btn-nc-force')?.addEventListener('click', () => { if (_forceKind === 'ready') Room.startNow(); else Room.finishNow(); _force(null); });
    $('btn-nr-finish')?.addEventListener('click', () => { Room.finishNow(); _force(null); });
    $('btn-room-refresh')?.addEventListener('click', () => location.reload());

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

// START / FINISH WITHOUT THEM: shown to the host once a round has waited on
// somebody for a while (Room 'stall'); kind null hides it.
let _forceKind = null;
function _force(kind, missing = []) {
    _forceKind = kind;
    const who = missing.length ? missing.join(', ') : 'them';
    const card = $('btn-nc-force'), fin = $('btn-nr-finish');
    if (!card || !fin) return;
    card.hidden = !(kind === 'ready' || (kind === 'score' && Room.isWatching()));
    card.textContent = kind === 'ready' ? `▶ START WITHOUT ${who.toUpperCase()}` : `⏹ FINISH WITHOUT ${who.toUpperCase()}`;
    fin.hidden = !(kind === 'score' && !Room.isWatching());
    fin.textContent = `⏹ FINISH WITHOUT ${who.toUpperCase()}`;
}

/** Leaving any Play Together screen leaves the room. */
export async function leave() { _abortGame(); await Room.leave(); }

// ---- room --------------------------------------------------------------------------
function _rows(host, names, extra, away = []) {
    host.innerHTML = names.map((name, i) =>
        `<div class="st-row${away[i] ? ' away' : ''}"><span class="st-place">${extra ? extra.place[i] : ''}</span>` +
        `<span class="st-dot" style="background:${color(i)}">${Room.mySeats().includes(i) ? '⭐' : away[i] ? '💤' : '📱'}</span>` +
        `<span class="st-name">${_esc(name)}${i === 0 ? (Room.isTv() ? ' (captain)' : Room.hostSeated() ? ' (host)' : '') : ''}${away[i] ? ' <small>away</small>' : ''}</span>` +
        `<span class="st-bar"><i style="width:${extra ? extra.bar[i] : 0}%;background:${color(i)}"></i></span>` +
        `<span class="st-pts bfont">${extra ? extra.pts[i] : (Room.totals()[i] || 0)}</span></div>`).join('');
}

const _esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The house rules in play, for a drinking room. */
export function rulesHTML(list) {
    return list.length ? `<div class="panel-h bfont">🍺 House rules</div>` +
        list.map(x => `<div class="rule-row"><b>${_esc(x.name)}</b> ${_esc(x.rule)}</div>`).join('') : '';
}

// Pass the phone plays the same seed in turn, so in a game you can remember
// (Trivia's answers, the shells' shuffles, the balloons' limits) whoever plays
// second has watched the answers. With a shared phone in the room those games
// are kept out of SURPRISE ME (and the TV's wheel) and marked on the picker.
const _memorable = t => !!(MG_INFO[t] && MG_INFO[t].memorable);
/** The games SURPRISE ME (and the TV's wheel) draws from, right now. */
export function fairPool(list = MG_PARALLEL) {
    if (!Room.sharedPhone()) return list.slice();
    const fair = list.filter(t => !_memorable(t));
    return fair.length ? fair : list.slice();
}
export function surprise() { const pool = fairPool(); return pool[Math.floor(Math.random() * pool.length)]; }

// The host taps a player to take them out of the room (and everyone on their phone).
async function _askRemove(i) {
    const seats = Room.seats(), s = seats[i];
    if (!Room.isHost() || !s || s.me) return;
    const mates = Room.phoneOf(i).map(k => seats[k].name).filter(n => n !== s.name);
    const ok = await Confirm.ask(`Remove ${s.name}${mates.length ? ` (and ${mates.join(', ')} on the same phone)` : ''} from the room?`, 'REMOVE');
    if (ok) Room.remove(i);
}

function _paintRoom() {
    if (!$('scr-room') || $('scr-room').hidden) return;
    $('room-code').textContent = Room.code() || '····';
    const seats = Room.seats();
    _rows($('room-seats'), seats.map(s => s.name), null, seats.map(s => s.away));
    const host = Room.isHost();
    // The host's way to take somebody out: tap their row.
    $('room-seats').querySelectorAll('.st-row').forEach((row, i) => {
        if (!host || seats[i].me) return;
        row.classList.add('tappable');
        row.title = 'Tap to remove from the room';
        row.addEventListener('click', () => _askRemove(i));
    });
    // A guest sees drinking mode but can't change it: say whose call it is.
    const note = $('room-drink-note');
    if (note) {
        note.hidden = host || Room.role() !== 'client' || Room.status() !== 'seated';
        note.textContent = `🍺 Drinking mode is the host's call: ${Room.mode() === 'drinking' ? 'ON' : 'OFF'}`;
    }
    $('room-host-panel').hidden = !host;
    $('room-captain').hidden = !Room.isCaptain();
    paintDrinkToggle($('btn-room-drink'));
    const rules = $('room-rules');
    rules.innerHTML = Room.mode() === 'drinking' ? rulesHTML(Room.rules()) : '';
    rules.hidden = !rules.innerHTML;
    if (host) {
        const g = $('room-games');
        g.innerHTML = '';
        const shared = Room.sharedPhone();
        const mk = (type, icon, title) => {
            const el = document.createElement('div');
            el.className = 'card' + (seats.length < 2 ? ' blocked' : '');
            el.dataset.type = type;
            const warn = shared && _memorable(type);
            if (warn) { el.classList.add('warn'); el.title = 'A shared phone sees the answers to whoever plays second'; }
            el.innerHTML = `<span class="ci">${icon}</span><span class="cn">${title}</span>${warn ? '<span class="cw">⚠ SHARED PHONE</span>' : ''}`;
            el.addEventListener('click', () => {
                if (Room.seats().length < 2) return;
                Room.startRound(type === 'random' ? surprise() : type);
            });
            g.appendChild(el);
        };
        mk('random', '🎲', 'SURPRISE ME');
        MG_PARALLEL.forEach(t => mk(t, MG_INFO[t].icon, MG_INFO[t].title));
    }
    const st = Room.status(), refused = Room.role() === 'client' && st === 'refused';
    $('btn-room-refresh') && ($('btn-room-refresh').hidden = !(refused && _refusal() === 'update'));
    $('room-hint').textContent = refused
        ? (_refusal() === 'update' ? 'This phone has a different version of CLAW Games from the host. Refresh to update, then join again.'
            : _refusal() === 'removed' ? 'The host removed you from this room.'
            : 'This room is full (12 players). You will be let in if a seat comes free.')
        : Room.role() === 'client' && st === 'waiting' ? "A round is on right now. You're in from the next one!"
        : Room.role() === 'client' && st === 'seeking' ? 'Connecting to the host…'
        : Room.isTv()
        ? (seats.length < 2 ? 'Waiting for more players to join on the TV…'
            : Room.isCaptain() ? "You're the captain: spin the wheel from here, or on the TV." : 'Watch the TV: the wheel picks the game.')
        : seats.length < 2
        ? (host ? `Share the code. Friends tap Play Together, then JOIN with ${Room.code()}. Keep this phone on: the room lives here.` : 'Connecting to the host…')
        : (host ? `${seats.length} players in. Pick a game! Keep this phone on: the room lives here.${Room.sharedPhone() ? ' A phone is shared: games marked ⚠ show the answers to whoever plays second, so SURPRISE ME skips them.' : ''} Tap a player to remove them.` : 'Waiting for the host to pick a game…');
}
let _lastRefusal = null;
Room.on('refused', reason => { _lastRefusal = reason; });
const _refusal = () => _lastRefusal;

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
    // A host sitting out watches the round go by: no ready, no game.
    $('btn-nc-ready').hidden = Room.isWatching();
    if (Room.isWatching()) { $('nc-wait').textContent = "You're running the room: the other phones play. Waiting for them to get ready…"; return; }
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
            _ghostLink(Room.mySeats()[scores.length]);
            _raceLink(r.race ? Room.mySeats()[scores.length] : -1);
            SoloArena.play(r.type, r.seed, score => {
                SoloArena.setGhostLink?.(null);
                SoloArena.setRaceLink?.(null);
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

// Time trials draw everyone else racing as ghosts (claw-core SoloArena): this
// phone's racer goes out on the room, and the room's racers come back in.
function _ghostLink(seat) {
    SoloArena.setGhostLink?.({
        send: s => Room.sendGhost(seat, s),
        others: () => Room.ghosts().filter(g => g.seat !== seat)
            .map(g => ({ id: g.seat, name: Room.seats()[g.seat]?.name || '', color: color(g.seat), state: g.s, at: g.at })),
    });
}

// Races (Shell Game): each round goes to the fastest right answer on any phone.
// This phone's picks go to the host (Room.sendPick) and its calls come back.
function _raceLink(seat) {
    SoloArena.setRaceLink?.(seat < 0 ? null : {
        me: seat, to: Room.RACE_TO,
        pick: (round, right, ms) => Room.sendPick(seat, round, right, ms),
        call: round => Room.raceCall(round),
    });
}

function _abortGame() {
    const was = _playing;
    _playing = false; _handoff = null;
    SoloArena.setGhostLink?.(null);
    SoloArena.setRaceLink?.(null);
    if (was && $('arcade').hidden) { try { SoloArena.forceEnd(); } catch (e) {} SoloArena.reset(); }
    $('arcade').hidden = false;
}

// A result can be re-sent (a late phone, a repaint); count each round once.
let _countedRound = null, _drankRound = null;

function _showResult(r) {
    // Decided while this phone was still playing (it started late, or the
    // host's grace period ran out): take the game down first.
    _abortGame();
    if (r.n !== _countedRound) { _countedRound = r.n; if (!Room.isWatching()) { Stats.recordTogether(); Trophies.announce(600); } }
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
