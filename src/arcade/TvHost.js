// ============================================================
// TV HOST — the arcade on the big screen. Open the site in Chrome on a
// laptop, cast the tab to the TV, and tap 📺 HOST ON A TV: this tab hosts a
// Play Together room with no seat of its own. Phones join with the code and
// are the controllers.
//
//   tvroom (code + who's in) → wheel → tvround (ready / playing) →
//   tvresult (scores, drinks, rules) → wheel … → final scores
//
// The laptop's mouse drives these screens, and so does the captain (the
// first phone in), whose one button means "do the next thing": spin, play
// the landed game, or spin the next round.
// ============================================================
import * as Room from '../net/Room.js';
import * as Wheel from './Wheel.js';
import * as Vetoes from './Vetoes.js';
import * as Toast from './Toast.js';
import { MG_INFO, MG_NET_INFO, MG_PARALLEL } from '../claw-core/config/MinigameRegistry.js';
import { rulesHTML, drinkLine, NET_COLORS, showDrinks, paintDrinkToggle } from './Together.js';
import * as DrinkCard from './DrinkCard.js';

const $ = id => document.getElementById(id);
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const descOf = type => (MG_NET_INFO[type] || MG_INFO[type].desc).replace(/^\S+ PAYDAY — [^.]*\.\s*/, '');

let _show = null, _current = () => '';
// Mini Golf's four-minute rounds (twice over on a passed phone) stall a
// party's pace; it keeps its own clubhouse mode.
const GAMES = MG_PARALLEL.filter(t => t !== 'minigolf');
let _played = [];          // this room's games so far: nothing repeats until all have been
let _round = null;

export const active = () => Room.isHost() && Room.isTv();

export function init(show, current) {
    _show = show; _current = current;
    $('btn-net-tv').addEventListener('click', start);
    $('btn-tv-spin').addEventListener('click', spin);
    $('btn-tvx-next').addEventListener('click', spin);
    $('btn-tv-end').addEventListener('click', final);
    $('btn-tvx-end').addEventListener('click', final);
    $('btn-tv-drink').addEventListener('click', () => Room.setDrinking(Room.mode() !== 'drinking'));

    Room.on('roster', () => { if (active()) _paint(); });
    Room.on('round', r => { if (active()) { _round = r; _paintRound('Phones: tap I\'M READY'); } });
    Room.on('readyCount', (k, n) => { if (active()) $('tvr-status').textContent = `${k} of ${n} phones ready…`; });
    Room.on('go', () => { if (active()) $('tvr-status').textContent = '🎮 PLAYING… look at your phones!'; });
    Room.on('scoreCount', (k, n) => { if (active()) $('tvr-status').textContent = `🎮 PLAYING… ${k} of ${n} scores in`; });
    Room.on('result', r => { if (active()) _paintResult(r); });
    Room.on('cmd', () => { if (active()) _captain(); });
}

async function start() {
    $('net-hint').textContent = 'Opening a room for the TV…';
    try { await Room.host([], { tv: true }); }
    catch (e) { $('net-hint').textContent = "Couldn't open a room. Check your connection and try again."; return; }
    $('net-hint').textContent = '';
    _played = []; _round = null;
    Vetoes.reset();
    document.body.classList.add('tv');
    _show('tvroom');
    _paint();
}

/** Leaving the TV room (back, or the room closing). */
export function stop() { document.body.classList.remove('tv'); }

// The join link: this page, without the TV's own query, plus ?join=CODE.
function _joinUrl() {
    const q = new URLSearchParams(location.search);
    const keep = q.get('net') ? `&net=${q.get('net')}` : '';
    return { show: `${location.host}${location.pathname.replace(/index\.html$/, '')}`, href: `${location.origin}${location.pathname}?join=${Room.code()}${keep}` };
}

// The join link as a QR code. The encoder (vendor/qrcode.js, MIT) loads on
// first use; without it the TV still shows the address and the code.
let _qrLib = null, _qrFor = '';
function _loadQr() {
    return _qrLib ||= new Promise((ok, no) => {
        if (window.qrcode) return ok(window.qrcode);
        const s = document.createElement('script');
        s.src = 'vendor/qrcode.js';
        s.onload = () => (window.qrcode ? ok(window.qrcode) : no());
        s.onerror = no;
        document.head.appendChild(s);
    });
}
function _paintQr(href) {
    if (!Room.code() || _qrFor === href) return;
    _qrFor = href;
    _loadQr().then(qrcode => {
        if (_qrFor !== href) return;
        const qr = qrcode(0, 'M');
        qr.addData(href);
        qr.make();
        $('tv-qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
        $('tv-qr').hidden = false;
    }).catch(() => { _qrLib = null; _qrFor = ''; });
}

function _rows(host, names, extra) {
    host.innerHTML = names.map((name, i) =>
        `<div class="st-row"><span class="st-place">${extra ? extra.place[i] : ''}</span>` +
        `<span class="st-dot" style="background:${NET_COLORS[i % NET_COLORS.length]}">📱</span>` +
        `<span class="st-name">${esc(name)}${i === 0 ? ' <small>captain</small>' : ''}</span>` +
        `<span class="st-pts bfont">${extra ? extra.pts[i] : (Room.totals()[i] || 0)}</span></div>`).join('')
        || '<p class="hint">Nobody yet…</p>';
}

function _paintRules() {
    const html = Room.mode() === 'drinking' ? rulesHTML(Room.rules()) : '';
    document.querySelectorAll('.tv-rules').forEach(el => { el.innerHTML = html; el.hidden = !html; });
    document.querySelectorAll('.tv-mode').forEach(el => { el.textContent = Room.mode() === 'drinking' ? '🍺 DRINKING MODE' : '🎉 PARTY MODE'; });
}

export function repaint() { _paint(); }

function _paint() {
    _paintRules();
    paintDrinkToggle($('btn-tv-drink'));
    if (_current() !== 'tvroom') return;
    const u = _joinUrl();
    $('tv-url').textContent = u.show;
    $('tv-url').title = u.href;
    $('tv-code').textContent = Room.code() || '····';
    _paintQr(u.href);
    const seats = Room.seats();
    _rows($('tv-seats'), seats.map(s => s.name));
    $('btn-tv-spin').disabled = seats.length < 2;
    $('btn-tv-end').hidden = !Room.totals().some(Boolean);
    $('tv-hint').textContent = seats.length < 2 ? 'Waiting for at least 2 players…' : `${seats.length} players in. Spin when you're ready!`;
}

// ---- the wheel -------------------------------------------------------------------
function _pool() {
    const left = GAMES.filter(t => !_played.includes(t));
    return left.length ? left : GAMES.slice();
}

// auto: start the wheel turning as soon as it's up (the captain's button).
function spin(auto = false) {
    DrinkCard.hide();
    if (Room.seats().length < 2) return Toast.show('Need at least 2 players to spin.');
    _show('wheel', false);
    Wheel.open(type => {
        if (!Room.startRound(type)) { Toast.show('Need at least 2 players.'); _show('tvroom', false); return _paint(); }
        if (_played.length >= GAMES.length) _played = [];
        _played.push(type);
    }, _pool, () => `📺 ROUND ${_round ? _round.n + 1 : 1}`);
    if (auto === true) requestAnimationFrame(() => $('btn-spin').click());
}

// The captain's one button.
function _captain() {
    const at = _current();
    if (at === 'tvroom' || at === 'tvresult') return spin(true);
    if (at !== 'wheel') return;
    const play = $('btn-wheel-play');
    if (!$('wheel-result').hidden && play && !play.disabled) play.click();
    else if (!$('btn-spin').disabled) $('btn-spin').click();
}

// ---- round & result --------------------------------------------------------------
function _paintRound(status) {
    const r = _round;
    _show('tvround', false);
    _paintRules();
    $('tvr-round').textContent = `ROUND ${r.n}`;
    $('tvr-icon').textContent = MG_INFO[r.type].icon;
    $('tvr-title').textContent = MG_INFO[r.type].title;
    $('tvr-desc').textContent = descOf(r.type);
    $('tvr-status').textContent = status;
}

function _places(scores) {
    const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const place = [];
    order.forEach((seat, k) => { place[seat] = k && scores[seat] === scores[order[k - 1]] ? place[order[k - 1]] : k; });
    return place;
}

function _paintResult(r) {
    _show('tvresult', false);
    _paintRules();
    $('tvx-game').innerHTML = `${MG_INFO[r.type].icon} ${MG_INFO[r.type].title} · round ${r.n}`;
    $('tvx-title').textContent = r.winner < 0 ? 'A TIE!' : `${r.names[r.winner]} WINS!`;
    const d = r.drinks;
    _rows($('tvx-rows'), r.names, {
        place: _places(r.scores).map(p => MEDALS[p] || p + 1),
        pts: r.totals.map((t, i) => `${t}<small>${r.scores[i]} pts · +${r.pay[i]}${d ? ` · 🍺 ${d.sips[i]}` : ''}</small>`),
    });
    const box = $('tvx-drinks');
    box.hidden = !d;
    // The whole room sees the call, big, until the next spin.
    if (d) showDrinks(r);
    if (d) {
        const drinkers = r.names.map((n, i) => (d.sips[i] ? `<div class="sip-row"><b>${esc(n)}</b> drinks <span class="bfont">${d.sips[i]}</span> ${d.sips[i] === 1 ? 'sip' : 'sips'}</div>` : '')).join('');
        box.innerHTML = `<div class="panel-h bfont">🍺 Drinks</div>${drinkers}<p>${drinkLine(r)}</p>`;
    }
}

function final() {
    DrinkCard.hide();
    const names = Room.seats().map(s => s.name), totals = Room.totals();
    _show('tvresult', false);
    _paintRules();
    const best = Math.max(0, ...totals);
    const top = names.filter((_, i) => totals[i] === best);
    $('tvx-game').textContent = 'FINAL SCORES';
    $('tvx-title').textContent = top.length === 1 ? `🏆 ${top[0]} IS THE CHAMP!` : '🏆 A SHARED CROWN!';
    _rows($('tvx-rows'), names, { place: _places(totals).map(p => MEDALS[p] || p + 1), pts: totals.map(t => `${t}`) });
    $('tvx-drinks').hidden = true;
}
