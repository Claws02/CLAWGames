// ============================================================
// MIRROR LAGOON — the screen. Rules and the level maker: MirrorLogic.js.
//
// Tap a mirror to flip it (/ ↔ \). The lighthouse's beam bounces across the
// lagoon; light every lantern 🏮. Par is the fewest flips; 30 levels in three
// coves, each made from its number (the same on every phone).
// ============================================================
import { LEVEL_COUNT, WORLDS, worldOf, generate, trace, stars } from './MirrorLogic.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'mirror', icon: '🏮', title: 'Mirror Lagoon', blurb: 'Flip the mirrors so the lighthouse beam bounces through every lantern. 30 levels.' };

let _el = null, _lv = null, _i = 0, _m = {}, _flips = 0, _over = false, _setTitle = null;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _best = i => Solo.best(`mirror:${i}`) || 0;
const _total = () => Array.from({ length: LEVEL_COUNT }, (_, i) => _best(i)).reduce((a, b) => a + b, 0);
const _open = i => i === 0 || _best(i - 1) > 0;
const _level = i => generate(i, Solo.rng(Solo.hash(`mirror:${i}`)));

export function bestText() { const t = _total(); return t ? `★ ${t} / ${LEVEL_COUNT * 3}` : ''; }
export function mount(el, opts = {}) { _el = el; _setTitle = opts.title || (() => {}); _pick(); }
export function unmount() { _el = null; }

function _pick() {
    _setTitle('Mirror Lagoon');
    _el.innerHTML = `<p class="lead sg-lead">Tap a mirror to flip it. Bounce the lighthouse's beam through <b>every lantern</b> 🏮 in as few flips as you can.</p>` +
        WORLDS.map((name, w) => {
            const ids = Array.from({ length: 10 }, (_, k) => w * 10 + k);
            return `<div class="rb-world"><div class="panel-h bfont">${name} <small>★ ${ids.reduce((a, i) => a + _best(i), 0)} / 30</small></div><div class="rb-levels">${ids.map(i =>
                `<button class="rb-lv${_open(i) ? '' : ' locked'}" data-i="${i}" ${_open(i) ? '' : 'disabled'}><span class="bfont">${i + 1}</span><em>${_open(i) ? '★'.repeat(_best(i)) + '☆'.repeat(3 - _best(i)) : '🔒'}</em></button>`).join('')}</div></div>`;
        }).join('') + `<p class="hint">★ ${_total()} of ${LEVEL_COUNT * 3}</p>`;
    _el.querySelectorAll('.rb-lv:not(.locked)').forEach(b => b.addEventListener('click', () => play(+b.dataset.i)));
}

/** Play level i. */
export function play(i) {
    _i = i; _lv = _level(i); _m = { ..._lv.mirrors }; _flips = 0; _over = false;
    _el.innerHTML = `<div class="cs-top"><span class="bfont">${WORLDS[worldOf(i)].split(' ')[1]} ${i + 1}</span><span class="bfont" id="ml-hud"></span><button class="ghost-btn bfont if-small" id="btn-ml-reset">↺</button></div>
        <div class="ml-wrap"><div class="ml-src" id="ml-src">🗼</div><div class="ml-board" id="ml-board"></div></div>
        <div class="cs-done" id="ml-done" hidden>
            <div class="cs-done-h bfont" id="ml-done-h"></div><div class="cs-done-t bfont" id="ml-done-t"></div><div class="cs-done-best" id="ml-done-best"></div>
            <button class="go-btn bfont" id="btn-ml-next">NEXT LEVEL</button>
            <button class="ghost-btn bfont" id="btn-ml-levels">ALL LEVELS</button>
        </div>`;
    _el.querySelector('#btn-ml-reset').addEventListener('click', () => { if (!_over) { _m = { ..._lv.mirrors }; _flips = 0; _paint(); } });
    _el.querySelector('#btn-ml-levels').addEventListener('click', _pick);
    _el.querySelector('#btn-ml-next').addEventListener('click', () => (_i + 1 < LEVEL_COUNT ? play(_i + 1) : _pick()));
    _paint();
}

/** Flip the mirror on square k. */
export function flip(k) {
    if (_over || !(k in _m)) return;
    _m[k] = _m[k] === '/' ? '\\' : '/';
    _flips++;
    _sfx('swap'); try { Audio.haptic(10); } catch (e) {}
    const t = trace(_lv, _m);
    _paint(k);
    if (t.solved) _win();
}

function _paint(spun = -1) {
    const { w, h } = _lv, t = trace(_lv, _m), b = _el.querySelector('#ml-board');
    b.style.setProperty('--w', w); b.style.setProperty('--h', h);
    let html = '';
    for (let k = 0; k < w * h; k++) {
        const isM = k in _m, isL = _lv.lanterns.includes(k), isR = _lv.rocks.includes(k);
        html += `<${isM ? 'button' : 'span'} class="ml-sq${t.path.includes(k) ? ' lit' : ''}${isR ? ' rock' : ''}" data-k="${k}">` +
            (isM ? `<i class="ml-m${k === spun ? ' spin' : ''}">${_m[k] === '/' ? '╱' : '╲'}</i>` : isL ? `<b class="ml-l${t.lit.has(k) ? ' on' : ''}">🏮</b>` : isR ? '🪨' : '') + `</${isM ? 'button' : 'span'}>`;
    }
    // the beam, as a line through the squares' centres (from the shore)
    const pts = [[_lv.src[0] + 0.5, _lv.src[1] + 0.5], ...t.path.map(k => [(k % w) + 0.5, Math.floor(k / w) + 0.5])];
    html += `<svg class="ml-beam" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts.map(p => p.join(',')).join(' ')}" /></svg>`;
    b.innerHTML = html;
    b.querySelectorAll('button.ml-sq').forEach(el => el.addEventListener('click', () => flip(+el.dataset.k)));
    _el.querySelector('#ml-src').style.top = `calc(${(_lv.src[1] + 0.5) / h * 100}% - 14px)`;
    _el.querySelector('#ml-hud').textContent = `🏮 ${t.lit.size}/${_lv.lanterns.length} · ${_flips} / par ${_lv.par}`;
}

function _win() {
    _over = true;
    const st = stars(_flips, _lv.par), before = _best(_i), isBest = Solo.record(`mirror:${_i}`, st, 'high');
    Solo.record('mirror', _total(), 'high');
    if (st === 3) Solo.bump('mirror3');
    _sfx('win'); Solo.won();
    _el.querySelector('#ml-done').hidden = false;
    _el.querySelector('#ml-done-h').textContent = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} ALL LIT!`;
    _el.querySelector('#ml-done-t').textContent = `${_flips} flip${_flips === 1 ? '' : 's'} · par ${_lv.par}`;
    _el.querySelector('#ml-done-best').textContent = isBest && before ? '🏅 More stars than before!' : st < 3 ? `★★★ in ${_lv.par} flip${_lv.par === 1 ? '' : 's'}` : 'Perfect!';
    _el.querySelector('#btn-ml-next').textContent = _i + 1 < LEVEL_COUNT ? 'NEXT LEVEL' : 'ALL LEVELS';
    _el.querySelector('#ml-done').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** Probes: the level on screen. */
export const _debug = () => (_lv ? { i: _i, lv: _lv, mirrors: { ..._m }, flips: _flips, over: _over } : null);
