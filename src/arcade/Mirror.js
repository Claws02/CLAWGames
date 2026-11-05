// ============================================================
// MIRROR LAGOON — the screen. Rules: MirrorLogic.js; levels: MirrorLevels.js.
//
// Tap a mirror to turn it a step (╱ → — → ╲ → │). Bounce the lighthouse
// beams through every lantern of their colour: red, blue, and purple (both).
// Bolted mirrors don't turn; glass lets only its own colour through; rocks
// stop everything. Par is the fewest taps; 30 levels in three coves.
//
// The board is one SVG built per level and then updated in place, so a
// mirror swings round smoothly, the beams flow, and lanterns glow and
// flicker when lit.
// ============================================================
import * as Logic from './MirrorLogic.js';
import * as Levels from './MirrorLevels.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

const { LEVEL_COUNT, WORLDS, worldOf, trace, stars, ORDER } = Logic;
const LEVELS = Levels.LEVELS;
export const meta = { id: 'mirror', icon: '🏮', title: 'Mirror Lagoon', blurb: 'Turn the mirrors so the red and blue lighthouse beams light every lantern. 30 levels.' };

const COL = { r: '#f43f5e', b: '#38bdf8', p: '#c084fc' };
const DIM = { r: '#7f1d1d', b: '#0c4a6e', p: '#4c1d95' };
const HINTS = {
    0: '🪞 Tap a mirror to turn it: ╱ → — → ╲ → │. Slanted mirrors turn the beam; flat ones let it slide past, or bounce it back.',
    6: '🔩 Bolted mirrors can\'t be turned. Work round them.',
    10: '🔵 A second lighthouse! Red lanterns need the red beam, blue ones the blue beam.',
    13: '🟥 Glass lets its own colour through and stops the other.',
    20: '🟣 Purple lanterns need both beams.',
};

let _el = null, _lv = null, _i = 0, _m = {}, _spin = {}, _taps = 0, _over = false, _setTitle = null, _wasLit = new Set();
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _best = i => Solo.best(`mirror:${i}`) || 0;
const _total = () => Array.from({ length: LEVEL_COUNT }, (_, i) => _best(i)).reduce((a, b) => a + b, 0);
const _open = i => i === 0 || _best(i - 1) > 0;

export function bestText() { const t = _total(); return t ? `★ ${t} / ${LEVEL_COUNT * 3}` : ''; }
export function mount(el, opts = {}) { _el = el; _setTitle = opts.title || (() => {}); _pick(); }
export function unmount() { _el = null; }

function _pick() {
    _setTitle('Mirror Lagoon');
    _el.innerHTML = `<p class="lead sg-lead">Turn the mirrors so the lighthouse beams light <b>every lantern</b> of their colour, in as few taps as you can.</p>` +
        WORLDS.map((name, w) => {
            const ids = Array.from({ length: 10 }, (_, k) => w * 10 + k);
            return `<div class="rb-world"><div class="panel-h bfont">${name} <small>★ ${ids.reduce((a, i) => a + _best(i), 0)} / 30</small></div><div class="rb-levels">${ids.map(i =>
                `<button class="rb-lv${_open(i) ? '' : ' locked'}" data-i="${i}" ${_open(i) ? '' : 'disabled'}><span class="bfont">${i + 1}</span><em>${_open(i) ? '★'.repeat(_best(i)) + '☆'.repeat(3 - _best(i)) : '🔒'}</em></button>`).join('')}</div></div>`;
        }).join('') + `<p class="hint">★ ${_total()} of ${LEVEL_COUNT * 3}</p>`;
    _el.querySelectorAll('.rb-lv:not(.locked)').forEach(b => b.addEventListener('click', () => play(+b.dataset.i)));
}

// ---- drawing pieces (SVG, one square = 1 unit) ---------------------------------------
const lighthouse = (s, w, h) => {
    const rot = { r: 90, l: -90, d: 180, u: 0 }[s.d];
    return `<g class="ml-house" transform="translate(${s.x + 0.5} ${s.y + 0.5}) rotate(${rot})">
        <circle r=".46" fill="${COL[s.c]}" opacity=".25" class="ml-house-glow" />
        <path d="M-.2 .38 L-.13 -.18 L.13 -.18 L.2 .38 Z" fill="#fff" stroke="#2b1240" stroke-width=".05" />
        <path d="M-.17 .14 L.17 .14 L.155 .02 L-.155 .02 Z M-.19 .32 L.19 .32 L.18 .24 L-.18 .24 Z" fill="${COL[s.c]}" />
        <rect x="-.15" y="-.34" width=".3" height=".17" rx=".04" fill="#fde68a" stroke="#2b1240" stroke-width=".04" />
        <path d="M-.17 -.34 L0 -.46 L.17 -.34 Z" fill="${COL[s.c]}" stroke="#2b1240" stroke-width=".04" />
    </g>`;
};
const rock = (x, y, k) => {
    const j = n => ((Math.sin(k * 12.9 + n * 78.2) * 43758.5) % 1 + 1) % 1 * 0.08;
    return `<g transform="translate(${x + 0.5} ${y + 0.5})"><path d="M${-0.38 + j(1)} .2 Q-.42 -.14 ${-0.16} ${-0.33 + j(2)} Q.08 ${-0.42 + j(3)} .3 -.22 Q.44 .02 .34 .26 Q.1 .38 -.38 .2 Z" fill="url(#ml-rock)" stroke="#1c1917" stroke-width=".05" />
        <path d="M-.2 -.2 Q-.05 -.3 .12 -.24" stroke="rgba(255,255,255,.35)" stroke-width=".05" fill="none" stroke-linecap="round" />
        <circle cx=".12" cy=".1" r=".05" fill="rgba(0,0,0,.25)" /><path d="M-.3 .2 Q-.2 .1 -.08 .22" stroke="#4d7c0f" stroke-width=".06" fill="none" /></g>`;
};
const glass = (x, y, c) => `<g transform="translate(${x} ${y})"><rect x=".1" y=".1" width=".8" height=".8" rx=".1" fill="${COL[c]}" opacity=".35" stroke="${COL[c]}" stroke-width=".05" />
    <path d="M.22 .7 L.7 .22 M.32 .8 L.8 .32" stroke="rgba(255,255,255,.55)" stroke-width=".05" stroke-linecap="round" /></g>`;
const lantern = (x, y, c, i) => `<g class="ml-lan" data-i="${i}" transform="translate(${x + 0.5} ${y + 0.5})">
    <circle class="ml-lan-glow" r=".5" fill="${COL[c]}" />
    <line x1="0" y1="-.42" x2="0" y2="-.3" stroke="#2b1240" stroke-width=".05" />
    <rect x="-.14" y="-.32" width=".28" height=".07" rx=".02" fill="#2b1240" />
    <ellipse class="ml-lan-body" rx=".27" ry=".26" fill="${DIM[c]}" stroke="#2b1240" stroke-width=".05" style="--on:${COL[c]};--off:${DIM[c]}" />
    <path d="M-.27 0 Q0 .07 .27 0 M-.24 -.12 Q0 -.06 .24 -.12 M-.24 .12 Q0 .18 .24 .12" stroke="rgba(43,18,64,.45)" stroke-width=".03" fill="none" />
    ${c === 'p' ? '<path d="M-.27 0 A.27 .26 0 0 1 .27 0 Z" fill="#f43f5e" opacity=".35" /><path d="M-.27 0 A.27 .26 0 0 0 .27 0 Z" fill="#38bdf8" opacity=".35" />' : ''}
    <rect x="-.14" y=".25" width=".28" height=".07" rx=".02" fill="#2b1240" />
    <line x1="0" y1=".32" x2="0" y2=".42" stroke="#fde047" stroke-width=".05" class="ml-lan-tassel" />
</g>`;
const mirror = (x, y, k, bolted) => `<g class="ml-mir${bolted ? ' bolted' : ''}" data-k="${k}" transform="translate(${x + 0.5} ${y + 0.5})">
    <circle r=".36" fill="${bolted ? '#78350f' : 'rgba(255,255,255,.12)'}" stroke="${bolted ? '#451a03' : 'rgba(255,255,255,.35)'}" stroke-width=".04" />
    ${bolted ? '<circle cx="-.24" cy="-.24" r=".04" fill="#fde68a" /><circle cx=".24" cy=".24" r=".04" fill="#fde68a" /><circle cx=".24" cy="-.24" r=".04" fill="#fde68a" /><circle cx="-.24" cy=".24" r=".04" fill="#fde68a" />' : ''}
    <g class="ml-bar"><rect x="-.44" y="-.065" width=".88" height=".13" rx=".05" fill="${bolted ? '#d6a35c' : 'url(#ml-silver)'}" stroke="#2b1240" stroke-width=".04" />
    <line x1="-.36" y1="-.02" x2=".36" y2="-.02" stroke="rgba(255,255,255,.85)" stroke-width=".025" /></g>
    ${bolted ? '' : `<rect class="ml-hit" x="-.5" y="-.5" width="1" height="1" fill="transparent" />`}
</g>`;
// a state's angle: ╱ is -45°, then each tap turns it 45° clockwise
const _angle = k => -45 + 45 * _spin[k];

/** Play level i. */
export function play(i) {
    _i = i; _lv = LEVELS[i]; _m = { ..._lv.mirrors }; _taps = 0; _over = false; _wasLit = new Set();
    _spin = {}; for (const k in _lv.mirrors) _spin[k] = _lv.mirrors[k]; for (const k in _lv.fixed) _spin[k] = _lv.fixed[k];
    const { w, h } = _lv, hint = HINTS[i];
    _setTitle('Mirror Lagoon');
    _el.innerHTML = `<div class="cs-top"><span class="bfont">${WORLDS[worldOf(i)].split(' ')[1]} ${i + 1}</span><span class="bfont" id="ml-hud"></span><button class="ghost-btn bfont if-small" id="btn-ml-reset">↺</button></div>
        ${hint ? `<div class="rb-hint">${hint}</div>` : ''}
        <div class="ml-wrap" style="--w:${w};--h:${h}"><svg class="ml-svg" id="ml-board" viewBox="-1 -1 ${w + 2} ${h + 2}">${_board()}</svg></div>
        <div class="cs-done" id="ml-done" hidden>
            <div class="cs-done-h bfont" id="ml-done-h"></div><div class="cs-done-t bfont" id="ml-done-t"></div><div class="cs-done-best" id="ml-done-best"></div>
            <button class="go-btn bfont" id="btn-ml-next">NEXT LEVEL</button>
            <button class="ghost-btn bfont" id="btn-ml-levels">ALL LEVELS</button>
        </div>`;
    _el.querySelector('#btn-ml-reset').addEventListener('click', () => {
        if (_over) return;
        for (const k in _lv.mirrors) { while (_spin[k] % 4 !== _lv.mirrors[k]) _spin[k]++; }   // turn on round to the start (never spin back)
        _m = { ..._lv.mirrors }; _taps = 0; _paint();
    });
    _el.querySelector('#btn-ml-levels').addEventListener('click', _pick);
    _el.querySelector('#btn-ml-next').addEventListener('click', () => (_i + 1 < LEVEL_COUNT ? play(_i + 1) : _pick()));
    _el.querySelectorAll('.ml-mir:not(.bolted)').forEach(g => g.addEventListener('click', () => turn(+g.dataset.k)));
    _paint();
}

function _board() {
    const { w, h } = _lv;
    let s = `<defs>
        <linearGradient id="ml-silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc" /><stop offset=".5" stop-color="#cbd5e1" /><stop offset="1" stop-color="#94a3b8" /></linearGradient>
        <radialGradient id="ml-rock" cx=".35" cy=".3"><stop offset="0" stop-color="#a8a29e" /><stop offset="1" stop-color="#44403c" /></radialGradient>
        <pattern id="ml-waves" width="2" height="1" patternUnits="userSpaceOnUse"><path d="M0 .5 Q.5 .3 1 .5 T2 .5" stroke="rgba(255,255,255,.08)" stroke-width=".06" fill="none" /></pattern>
        <filter id="ml-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".12" /></filter>
    </defs>
    <rect x="-1" y="-1" width="${w + 2}" height="${h + 2}" rx=".6" fill="#fcd34d" />
    <rect x="-.15" y="-.15" width="${w + 0.3}" height="${h + 0.3}" rx=".35" fill="#0e7490" stroke="#2b1240" stroke-width=".08" />
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#ml-waves)" class="ml-waves" />`;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s += `<rect x="${x + 0.06}" y="${y + 0.06}" width=".88" height=".88" rx=".14" fill="rgba(255,255,255,.07)" />`;
    _lv.rocks.forEach(k => { s += rock(k % w, Math.floor(k / w), k); });
    _lv.glass.forEach(gl => { s += glass(gl.k % w, Math.floor(gl.k / w), gl.c); });
    s += `<g id="ml-beams"></g>`;
    _lv.lanterns.forEach((l, i) => { s += lantern(l.k % w, Math.floor(l.k / w), l.c, i); });
    for (const k in _lv.fixed) s += mirror(k % w, Math.floor(k / w), k, true);
    for (const k in _lv.mirrors) s += mirror(k % w, Math.floor(k / w), k, false);
    _lv.sources.forEach(src => { s += lighthouse(src, w, h); });
    return s;
}

/** Turn the mirror on square k one step. */
export function turn(k) {
    if (_over || !(k in _m)) return;
    _m[k] = (_m[k] + 1) % 4; _spin[k]++; _taps++;
    _sfx('swap'); try { Audio.haptic(10); } catch (e) {}
    const t = _paint();
    if (t.solved) _win();
}
export const flip = turn;   // (the old name)

function _paint() {
    const t = trace(_lv, _m), b = _el.querySelector('#ml-board');
    for (const k in _spin) { const g = b.querySelector(`.ml-mir[data-k="${k}"] .ml-bar`); if (g) g.style.transform = `rotate(${_angle(k)}deg)`; }
    b.querySelector('#ml-beams').innerHTML = t.beams.map(bm => {
        const pts = bm.pts.map(p => p.join(',')).join(' ');
        return `<polyline points="${pts}" stroke="${COL[bm.c]}" class="ml-glow" filter="url(#ml-glow)" /><polyline points="${pts}" stroke="${COL[bm.c]}" class="ml-core" /><polyline points="${pts}" class="ml-flow" />`;
    }).join('');
    b.querySelectorAll('.ml-lan').forEach(g => {
        const i = +g.dataset.i, on = t.lit.has(i);
        g.classList.toggle('on', on);
        if (on && !_wasLit.has(i)) { g.classList.remove('pop'); void g.getBBox(); g.classList.add('pop'); _sfx('land_good'); }
    });
    _wasLit = new Set(t.lit);
    _el.querySelector('#ml-hud').textContent = `🏮 ${t.lit.size}/${_lv.lanterns.length} · ${_taps} / par ${_lv.par}`;
    return t;
}

function _win() {
    _over = true;
    const st = stars(_taps, _lv.par), before = _best(_i), isBest = Solo.record(`mirror:${_i}`, st, 'high');
    Solo.record('mirror', _total(), 'high');
    if (st === 3) Solo.bump('mirror3');
    _sfx('win'); Solo.won();
    _el.querySelector('#ml-board').classList.add('won');
    _el.querySelector('#ml-done').hidden = false;
    _el.querySelector('#ml-done-h').textContent = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} ALL LIT!`;
    _el.querySelector('#ml-done-t').textContent = `${_taps} tap${_taps === 1 ? '' : 's'} · par ${_lv.par}`;
    _el.querySelector('#ml-done-best').textContent = isBest && before ? '🏅 More stars than before!' : st < 3 ? `★★★ in ${_lv.par} tap${_lv.par === 1 ? '' : 's'}` : 'Perfect!';
    _el.querySelector('#btn-ml-next').textContent = _i + 1 < LEVEL_COUNT ? 'NEXT LEVEL' : 'ALL LEVELS';
    _el.querySelector('#ml-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** Probes: the level on screen. */
export const _debug = () => (_lv ? { i: _i, lv: _lv, mirrors: { ..._m }, taps: _taps, over: _over } : null);
