// ============================================================
// WHEEL — a prize wheel of the games this table can play. Spin, land, then
// PLAY IT or VETO.
//
// THE SHOW. While it spins the wheel owns the middle of the screen, as big
// as the screen allows; marquee bulbs chase round the rim, the pointer
// flicks on every peg and the last turn crawls. It lands, the winning slice
// flashes, and the result card takes the middle: the wheel shrinks and rides
// up above it.
//
// THE RULES. The wheel is dealt from the table's Rotation (nothing repeats
// until everything has been played) and the table shares two Vetoes per
// session. The result is chosen first and the wheel is steered onto it, so
// the animation can never disagree with the pick.
// ============================================================
import * as Catalog from './Catalog.js';
import * as Rotation from './Rotation.js';
import * as Vetoes from './Vetoes.js';
import { seats } from './Seats.js';
import { sfx, haptic } from '../claw-core/engine/AudioManager.js';

const MAX_SLICES = 12;
const COLORS = ['#ff5fa2', '#ffd23f', '#2ec4b6', '#8b5cf6', '#ff9f1c', '#3b9dff', '#2fd67b', '#ef4444'];
const SPIN_MS = 5200;                 // long enough for the last turn to crawl
const BULBS = 28;
const FLASHES = 4, FLASH_MS = 190;    // the winning slice blinks before the reveal

let _slices = [], _angle = 0, _pick = null, _onPlay = null, _pool = null, _meta = null;
let _phase = 'idle';                  // idle | spin | reveal | landed
let _flashIdx = -1, _flashOn = false, _bulbT = 0, _raf = 0, _lastT = 0, _lastTickAt = 0;

const $ = id => document.getElementById(id);
const _visible = () => !$('scr-wheel').hidden;

/**
 * pool: optional () => [types] to deal from (a party passes its own);
 * meta: optional () => string for the line above the wheel (a party's round).
 * Vetoes are NOT reset here: the caller starts a session with Vetoes.reset().
 */
export function open(onPlay, pool = null, meta = null) {
    _onPlay = onPlay;
    _pool = pool || (() => Rotation.fresh(seats.count));
    _meta = meta;
    _phase = 'idle'; _flashIdx = -1;
    _deal();
    _hideResult();
    _paintMeta();
    requestAnimationFrame(_layout);
    _startLoop();
}

// A fresh wheel: up to MAX_SLICES of the games still due.
function _deal() {
    const pool = _pool().slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    _slices = pool.slice(0, MAX_SLICES);
}

function _paintMeta() {
    const r = Rotation.progress(seats.count);
    const bits = [];
    if (_meta) bits.push(_meta());
    bits.push(`🚫 ${Vetoes.left()} VETO${Vetoes.left() === 1 ? '' : 'ES'} LEFT`);
    bits.push(`🔄 ${r.done} / ${r.total} PLAYED`);
    $('wheel-meta').innerHTML = bits.filter(Boolean).map(b => `<span>${b}</span>`).join('');
}

// ---- layout: as big as the stage allows; smaller and higher once landed ----
function _layout() {
    if (!_visible()) return;
    const stage = $('wheel-stage'), wrap = $('wheel-wrap'), cv = $('wheel');
    const st = stage.getBoundingClientRect();
    const big = Math.max(180, Math.floor(Math.min(st.width - 8, st.height - 24, 880)));
    let size = big;
    if (_phase === 'landed') {
        const card = $('wheel-result').offsetHeight || 0;
        size = Math.max(140, Math.floor(Math.min(big * 0.75, st.height - card - 36)));
    }
    wrap.style.width = size + 'px';
    // Backing store sized for the BIG wheel, so the shrink is a CSS scale.
    const px = Math.min(1800, Math.round(big * Math.min(2, window.devicePixelRatio || 1)));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    _draw();
}
window.addEventListener('resize', () => requestAnimationFrame(_layout));

// ---- drawing ------------------------------------------------------------------
function _draw() {
    const cv = $('wheel'), ctx = cv.getContext('2d');
    const W = cv.width, R = W / 2, k = W / 640, n = Math.max(_slices.length, 1), arc = Math.PI * 2 / n;
    const rim = 28 * k, rS = R - rim;
    ctx.clearRect(0, 0, W, W);

    // The rim and its marquee bulbs.
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.fillStyle = '#2b1240'; ctx.fill();
    const chase = Math.floor(_bulbT);
    for (let i = 0; i < BULBS; i++) {
        const a = i / BULBS * Math.PI * 2;
        const lit = _phase === 'landed' || _phase === 'reveal' ? (chase % 2 === 0) : ((i + chase) % 3 === 0);
        ctx.beginPath();
        ctx.arc(R + Math.cos(a) * (R - rim / 2), R + Math.sin(a) * (R - rim / 2), rim * 0.26, 0, Math.PI * 2);
        ctx.fillStyle = lit ? '#fff6a8' : '#6d3f8f';
        if (lit) { ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 14 * k; }
        ctx.fill(); ctx.shadowBlur = 0;
    }

    ctx.save(); ctx.translate(R, R); ctx.rotate(_angle);
    _slices.forEach((type, i) => {
        const a0 = i * arc - Math.PI / 2 - arc / 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rS, a0, a0 + arc); ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill();
        if (i === _flashIdx && _flashOn) { ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fill(); }
        ctx.lineWidth = 5 * k; ctx.strokeStyle = '#2b1240'; ctx.stroke();
        ctx.save();
        ctx.rotate(a0 + arc / 2);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.font = `${Math.min(46, 360 / n + 14) * k}px sans-serif`;
        ctx.fillText(Catalog.MG_INFO[type].icon, rS - 16 * k, 0);
        ctx.font = `${Math.min(30, 240 / n + 8) * k}px 'Bebas Neue', sans-serif`;
        ctx.fillStyle = '#2b1240';
        const t = Catalog.MG_INFO[type].title;
        ctx.fillText(t.length > 12 ? t.slice(0, 11) + '…' : t, rS - 76 * k, 0);
        ctx.restore();
    });
    ctx.restore();
    if (!_slices.length) {
        ctx.fillStyle = '#fff'; ctx.font = `${28 * k}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('No games fit this table', R, R - 90 * k);
    }
}

// The bulbs chase all the time the wheel is on screen: slowly while it
// waits, fast while it spins, all blinking together once it has landed.
function _startLoop() {
    if (_raf) return;
    _lastT = performance.now();
    const loop = now => {
        if (!_visible()) { _raf = 0; return; }
        const dt = Math.min(0.1, (now - _lastT) / 1000); _lastT = now;
        _bulbT += dt * (_phase === 'spin' ? 16 : _phase === 'idle' ? 3 : 4);
        if (_phase !== 'spin') _draw();          // the spin draws its own frames
        _raf = requestAnimationFrame(loop);
    };
    _raf = requestAnimationFrame(loop);
}

// ---- the spin -----------------------------------------------------------------
function _flick() {
    const pin = $('wheel-pin');
    try {
        pin.animate([{ transform: 'translateX(-50%) rotate(-30deg)' }, { transform: 'translateX(-50%) rotate(0deg)' }],
                    { duration: 140, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    } catch (e) { /* no Web Animations: the click is enough */ }
}

function _spin() {
    if (_phase === 'spin' || _phase === 'reveal' || !_slices.length) return;
    _hideResult();
    _phase = 'spin';
    _layout();
    $('btn-spin').disabled = true;
    try { sfx('dice_throw'); } catch (e) {}
    const n = _slices.length, arc = Math.PI * 2 / n;
    const idx = Math.floor(Math.random() * n);
    // Slice i is under the pin once the wheel is rotated by -i*arc. Land
    // somewhere inside it, not dead centre: a near miss of the next slice is
    // half the fun.
    const jitter = (Math.random() - 0.5) * arc * 0.7;
    const from = _angle;
    const target = -idx * arc + jitter;
    const turns = 6 + Math.floor(Math.random() * 3);
    const base = from - (((from - target) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const to = base + turns * Math.PI * 2;
    const t0 = performance.now();
    // Pegs sit on the slice borders; count them in the frame the pin reads.
    const pegAt = a => Math.floor((a + arc / 2) / arc);
    let lastPeg = pegAt(from);
    const step = now => {
        const k = Math.min(1, (now - t0) / SPIN_MS);
        const e = 1 - Math.pow(1 - k, 5);          // ease-out quint: a long, slow crawl
        _angle = from + (to - from) * e;
        const peg = pegAt(_angle);
        if (peg !== lastPeg) {
            lastPeg = peg;
            _flick();
            if (now - _lastTickAt > 45) { _lastTickAt = now; try { sfx('dice_land'); } catch (err) {} }
        }
        _draw();
        if (k < 1) return requestAnimationFrame(step);
        _angle = ((to % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        _reveal(idx);
    };
    requestAnimationFrame(step);
}

// The winning slice blinks, then the card takes the middle.
function _reveal(idx) {
    _phase = 'reveal';
    _flashIdx = idx;
    let f = 0;
    const blink = () => {
        _flashOn = !_flashOn;
        if (_flashOn) { try { sfx('countdown'); } catch (e) {} }
        _draw();
        if (++f < FLASHES * 2) return setTimeout(blink, FLASH_MS);
        _flashOn = true;
        $('btn-spin').disabled = false;
        _showResult(_slices[idx]);
    };
    blink();
}

function _showResult(type) {
    _pick = type;
    _phase = 'landed';
    const info = Catalog.MG_INFO[type];
    $('wr-icon').textContent = info.icon;
    $('wr-title').textContent = info.title;
    $('wr-desc').textContent = Catalog.descOf(type).split(/(?<=[.!?])\s/)[0];
    const veto = $('btn-wheel-veto');
    veto.textContent = _slices.length < 2 ? 'LAST ONE LEFT' : Vetoes.label();
    veto.disabled = Vetoes.left() <= 0 || _slices.length < 2;
    const card = $('wheel-result');
    card.hidden = false;
    // Restart the entrance animations on every reveal.
    card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    $('wheel-stage').classList.add('landed');
    _layout();
    _confetti();
    try { sfx('mg_win'); } catch (err) {}
}

function _hideResult() {
    $('wheel-result').hidden = true;
    $('wheel-stage').classList.remove('landed');
    _pick = null; _flashIdx = -1; _flashOn = false;
    if (_phase === 'landed') _phase = 'idle';
}

// A burst of paper from behind the card.
function _confetti() {
    const host = $('wheel-confetti');
    if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    host.innerHTML = '';
    for (let i = 0; i < 46; i++) {
        const p = document.createElement('i');
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
        p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
        p.style.setProperty('--dy', `${Math.sin(a) * d - 120}px`);
        p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
        p.style.background = COLORS[i % COLORS.length];
        p.style.animationDelay = `${Math.random() * 80}ms`;
        host.appendChild(p);
    }
    setTimeout(() => { host.innerHTML = ''; }, 1600);
}

export function init() {
    $('btn-spin').addEventListener('click', _spin);
    $('btn-wheel-play').addEventListener('click', () => {
        if (!_pick || !_onPlay) return;
        try { sfx('go'); } catch (e) {}
        _onPlay(_pick);
    });
    $('btn-wheel-veto').addEventListener('click', () => {
        if (!_pick || _slices.length < 2 || !Vetoes.use()) return;
        try { sfx('land_bad'); haptic([80]); } catch (e) {}
        const gone = _pick;
        _slices = _slices.filter(t => t !== gone);   // a vetoed game leaves the wheel
        _hideResult(); _paintMeta(); _layout();
        setTimeout(_spin, 450);                      // and the wheel goes again
    });
}
