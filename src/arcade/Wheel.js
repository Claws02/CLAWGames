// ============================================================
// WHEEL — a prize wheel of the games this table can play. Spin, land, then
// PLAY IT or VETO. Each human seat gets one veto per visit to the wheel.
// The result is chosen first and the wheel is steered onto it, so the
// animation can never disagree with the pick.
// ============================================================
import * as Catalog from './Catalog.js';
import { seats, humans } from './Seats.js';
import { sfx } from '../claw-core/engine/AudioManager.js';

const MAX_SLICES = 12;
const COLORS = ['#ff5fa2', '#ffd23f', '#2ec4b6', '#8b5cf6', '#ff9f1c', '#3b9dff', '#2fd67b', '#ef4444'];
const SPIN_MS = 3800;

let _slices = [], _angle = 0, _vetoes = 0, _pick = null, _spinning = false, _onPlay = null, _pool = null;

// pool: optional () => [types]; a party passes its not-yet-played games.
export function open(onPlay, pool = null) {
    _onPlay = onPlay;
    _pool = pool;
    _vetoes = humans();
    _deal();
    _hideResult();
    _draw();
}

// A fresh wheel: up to MAX_SLICES random eligible games.
function _deal() {
    const pool = (_pool ? _pool() : Catalog.eligible(seats.count)).slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    _slices = pool.slice(0, MAX_SLICES);
}

function _draw() {
    const cv = document.getElementById('wheel'), ctx = cv.getContext('2d');
    const W = cv.width, R = W / 2, n = Math.max(_slices.length, 1), arc = Math.PI * 2 / n;
    ctx.clearRect(0, 0, W, W);
    ctx.save(); ctx.translate(R, R); ctx.rotate(_angle);
    _slices.forEach((type, i) => {
        const a0 = i * arc - Math.PI / 2 - arc / 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 4, a0, a0 + arc); ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = '#2b1240'; ctx.stroke();
        ctx.save();
        ctx.rotate(a0 + arc / 2);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.font = `${Math.min(46, 360 / n + 14)}px sans-serif`;
        ctx.fillText(Catalog.MG_INFO[type].icon, R - 22, 0);
        ctx.font = `${Math.min(30, 240 / n + 8)}px 'Bebas Neue', sans-serif`;
        ctx.fillStyle = '#2b1240';
        const t = Catalog.MG_INFO[type].title;
        ctx.fillText(t.length > 12 ? t.slice(0, 11) + '…' : t, R - 82, 0);
        ctx.restore();
    });
    ctx.restore();
    if (!_slices.length) {
        ctx.fillStyle = '#2b1240'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('No games fit this table', R, R - 90);
    }
}

function _spin() {
    if (_spinning || !_slices.length) return;
    _spinning = true;
    _hideResult();
    document.getElementById('btn-spin').disabled = true;
    const n = _slices.length, arc = Math.PI * 2 / n;
    const idx = Math.floor(Math.random() * n);
    // Slice i is centred at angle i*arc (relative to the pin) once the wheel is
    // rotated by -i*arc. Land somewhere inside the slice, not dead centre.
    const jitter = (Math.random() - 0.5) * arc * 0.6;
    const from = _angle;
    const target = -idx * arc + jitter;
    const turns = 5 + Math.floor(Math.random() * 3);
    const base = from - (((from - target) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const to = base + turns * Math.PI * 2;
    const t0 = performance.now();
    let lastTick = Math.floor(from / arc);
    const step = now => {
        const k = Math.min(1, (now - t0) / SPIN_MS);
        const e = 1 - Math.pow(1 - k, 4);          // ease-out quart
        _angle = from + (to - from) * e;
        const tick = Math.floor(_angle / arc);
        if (tick !== lastTick) { lastTick = tick; try { sfx('dice_land'); } catch (err) {} }
        _draw();
        if (k < 1) return requestAnimationFrame(step);
        _spinning = false;
        _angle = to % (Math.PI * 2);
        document.getElementById('btn-spin').disabled = false;
        _showResult(_slices[idx]);
    };
    requestAnimationFrame(step);
}

function _showResult(type) {
    _pick = type;
    const info = Catalog.MG_INFO[type];
    document.getElementById('wr-icon').textContent = info.icon;
    document.getElementById('wr-title').textContent = info.title;
    document.getElementById('wr-desc').textContent = info.desc.split(/(?<=[.!?])\s/)[0];
    const veto = document.getElementById('btn-wheel-veto');
    veto.textContent = `VETO (${_vetoes})`;
    veto.disabled = _vetoes <= 0 || _slices.length < 2;
    document.getElementById('wheel-result').hidden = false;
    try { sfx('mg_win'); } catch (err) {}
}

function _hideResult() { document.getElementById('wheel-result').hidden = true; _pick = null; }

export function init() {
    document.getElementById('btn-spin').addEventListener('click', _spin);
    document.getElementById('btn-wheel-play').addEventListener('click', () => { if (_pick && _onPlay) _onPlay(_pick); });
    document.getElementById('btn-wheel-veto').addEventListener('click', () => {
        if (_vetoes <= 0 || !_pick) return;
        _vetoes--;
        _slices = _slices.filter(t => t !== _pick);   // a vetoed game leaves the wheel
        _hideResult(); _draw(); _spin();
    });
}
