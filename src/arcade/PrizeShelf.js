// ============================================================
// PRIZE SHELF — the capsule claw machine and the display cabinet.
// Rules and the plushies: Prizes.js.
//
// The machine is full of sealed capsules (blue, silver, gold: the colour sets
// the odds, not the plush). Steer the claw (its shadow shows where it will
// land), DROP, and it grabs the capsule under it: the nearer the middle, the
// firmer the grip. A capsule that slips, or a miss, costs nothing: a claw
// token (or the day's free drop) is spent only when a capsule reaches the
// chute. Then it wobbles, cracks and pops open: a plush with a name and a
// story. New ones go in the cabinet, a shelf per set; repeats are sparkles for
// the shop (a token, a gold capsule, or the plush you're missing). Finishing a
// set lights its shelf and pays a reward.
// ============================================================
import * as P from './Prizes.js';
import * as Solo from './SoloStats.js';
import * as Audio from '../claw-core/engine/AudioManager.js';

export const meta = { id: 'shelf', icon: '🧸', title: 'Prize Shelf', blurb: 'A capsule claw machine and a cabinet of 60 plush critters in six sets. Daily puzzles earn the tokens; one free drop a day.' };

const SPEED = 0.6;                   // how fast the claw steers (floor widths a second)
let _el = null, _cv = null, _g = null, _W = 0, _H = 0, _raf = 0, _rnd = Math.random;
let _pile = [], _claw = null, _keys = new Set(), _drag = null, _busy = false, _onDone = null, _last = 0, _sparkT = 0;
const _sfx = n => { try { Audio.sfx(n); } catch (e) {} };
const _buzz = p => { try { Audio.haptic(p); } catch (e) {} };
const _esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RCOL = { common: '#38bdf8', rare: '#c084fc', legendary: '#fbbf24' };

export function bestText() {
    const n = Object.keys(Solo.shelf()).length, t = Solo.tokens(), free = Solo.freeDropReady();
    return `${n} / ${P.PRIZES.length} collected${free ? ' · 🎁 free drop today' : t ? ` · 🎟️ ${t} to spend` : ''}`;
}

export function mount(el) {
    _el = el;
    _pile = P.pile(_rnd);
    _claw = { x: 0.6, z: 0.5, h: 0, open: 1, state: 'idle', t: 0, held: null, msg: '' };
    el.innerHTML = `
        <div class="ps-head"><span class="bfont ps-pill" id="ps-tokens"></span><span class="bfont ps-pill" id="ps-spark"></span><button class="ghost-btn bfont ps-shopbtn" id="btn-ps-shop">🛒 SHOP</button></div>
        <div class="ps-banner" id="ps-banner" hidden></div>
        <div class="ps-machine"><canvas id="ps-cv"></canvas></div>
        <div class="ps-ctrl">
            <div class="ps-pad">
                <button class="ps-arrow up" data-k="up" aria-label="Back">▲</button>
                <button class="ps-arrow left" data-k="left" aria-label="Left">◀</button>
                <button class="ps-arrow right" data-k="right" aria-label="Right">▶</button>
                <button class="ps-arrow down" data-k="down" aria-label="Forward">▼</button>
            </div>
            <button class="go-btn bfont ps-drop" id="btn-ps-drop">DROP!</button>
        </div>
        <p class="hint ps-hint" id="ps-hint"></p>
        <div class="ps-cabinet" id="ps-cabinet"></div>
        <div class="ps-over" id="ps-over" hidden></div>`;
    _cv = el.querySelector('#ps-cv'); _g = _cv.getContext('2d');
    _size();
    // steering: hold an arrow, the keyboard, or drag on the machine
    el.querySelectorAll('.ps-arrow').forEach(b => {
        const on = e => { e.preventDefault(); _keys.add(b.dataset.k); b.classList.add('held'); };
        const off = () => { _keys.delete(b.dataset.k); b.classList.remove('held'); };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    });
    _cv.addEventListener('pointerdown', e => { if (_claw.state === 'idle') { _drag = { x: e.clientX, y: e.clientY, cx: _claw.x, cz: _claw.z }; _cv.setPointerCapture?.(e.pointerId); } });
    _cv.addEventListener('pointermove', e => { if (_drag && _claw.state === 'idle') { const r = _cv.getBoundingClientRect(); _claw.x = _clamp(_drag.cx + (e.clientX - _drag.x) / r.width * 1.1, 0.06, 0.94); _claw.z = _clamp(_drag.cz - (e.clientY - _drag.y) / r.height * 2.2, 0.04, 0.96); } });
    _cv.addEventListener('pointerup', () => { _drag = null; });
    _onKey = e => { const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]; if (k) { e.preventDefault(); (e.type === 'keydown' ? _keys.add(k) : _keys.delete(k)); } if (e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); drop(); } };
    window.addEventListener('keydown', _onKey); window.addEventListener('keyup', _onKey);
    el.querySelector('#btn-ps-drop').addEventListener('click', () => drop());
    el.querySelector('#btn-ps-shop').addEventListener('click', shop);
    _paint();
    _last = performance.now();
    const tick = now => { if (!_el) return; const dt = Math.min(0.05, (now - _last) / 1000); _last = now; _step(dt); _draw(now / 1000); _raf = requestAnimationFrame(tick); };
    _raf = requestAnimationFrame(tick);
}
let _onKey = null;
export function unmount() { cancelAnimationFrame(_raf); _raf = 0; if (_onKey) { window.removeEventListener('keydown', _onKey); window.removeEventListener('keyup', _onKey); } _el = null; _busy = false; _keys.clear(); }

const _clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function _size() {
    const w = Math.min(_el.clientWidth || 360, 460), h = Math.round(w * 1.02), dpr = Math.min(window.devicePixelRatio || 1, 2);
    _cv.width = Math.round(w * dpr); _cv.height = Math.round(h * dpr); _cv.style.width = `${w}px`; _cv.style.height = `${h}px`;
    _g.setTransform(dpr, 0, 0, dpr, 0, 0); _W = w; _H = h;
}

// ---- paying for a go -----------------------------------------------------------------------
const _canPay = () => Solo.freeDropReady() || Solo.tokens() > 0;
function _pay() { if (Solo.useFreeDrop()) return 'free'; return Solo.spendToken() ? 'token' : null; }

// ---- the claw: steer, drop, grab, carry -------------------------------------------------------
/** Move the claw straight to (x, z) (probes). */
export function steerTo(x, z) { if (_claw && _claw.state === 'idle') { _claw.x = _clamp(x, 0.06, 0.94); _claw.z = _clamp(z, 0.04, 0.96); } }

/**
 * Drop the claw where it is. Resolves when it's over: { result: 'won' | 'slip' |
 * 'miss' | 'nopay', prize?, tier? }.
 */
export function drop() {
    if (!_el || _claw.state !== 'idle' || _busy) return Promise.resolve({ result: 'busy' });
    if (!_canPay()) { _hint('No tokens yet: every daily puzzle you solve earns one (and there\'s a free drop each day).'); _sfx('land_bad'); return Promise.resolve({ result: 'nopay' }); }
    _busy = true;
    const g = P.grab(_pile, _claw.x, _claw.z, _rnd);
    _claw.grab = g; _claw.state = 'down'; _claw.t = 0; _claw.slipAt = g.slip ? 0.25 + _rnd() * 0.5 : -1;
    _sfx('gate_roll'); _paint();
    return new Promise(done => { _onDone = done; });
}

function _step(dt) {
    const c = _claw;
    if (c.state === 'idle') {
        const vx = (_keys.has('right') ? 1 : 0) - (_keys.has('left') ? 1 : 0), vz = (_keys.has('up') ? 1 : 0) - (_keys.has('down') ? 1 : 0);
        c.x = _clamp(c.x + vx * SPEED * dt, 0.06, 0.94); c.z = _clamp(c.z + vz * SPEED * dt * 0.9, 0.04, 0.96);
        c.open = Math.min(1, c.open + dt * 3);
        return;
    }
    c.t += dt;
    const cap = c.grab.capsule;
    if (c.state === 'down') {
        c.h = Math.min(1, c.t / 0.7);
        if (c.h >= 1) { c.state = 'close'; c.t = 0; _sfx('swap'); }
    } else if (c.state === 'close') {
        c.open = Math.max(cap ? 0.35 : 0, 1 - c.t / 0.3);
        if (c.t >= 0.3) { c.state = 'up'; c.t = 0; if (cap) { c.held = cap; _pile = _pile.filter(x => x !== cap); _buzz(15); } }
    } else if (c.state === 'up') {
        c.h = Math.max(0, 1 - c.t / 0.7);
        if (c.held && c.slipAt >= 0 && c.h < 1 - c.slipAt * 0.9) return _slip();
        if (c.h <= 0) {
            if (!c.held) { _finish({ result: 'miss' }, 'Missed! Your token\'s safe: line the shadow up with a capsule and try again.'); return; }
            c.state = 'carry'; c.t = 0; c.from = { x: c.x, z: c.z };
        }
    } else if (c.state === 'carry') {
        const k = Math.min(1, c.t / 0.8), e = k * k * (3 - 2 * k);
        c.x = c.from.x + (P.CHUTE.x - c.from.x) * e; c.z = c.from.z + (P.CHUTE.z - c.from.z) * e;
        if (c.held && c.slipAt >= 0 && k > 0.4) return _slip();
        if (k >= 1) { c.state = 'release'; c.t = 0; _sfx('gate_open'); }
    } else if (c.state === 'release') {
        c.open = Math.min(1, c.t / 0.25);
        if (c.t >= 0.5) {
            const tier = c.held.tier; c.held = null;
            const paid = _pay();
            if (!paid) { _finish({ result: 'nopay' }, 'No tokens left.'); return; }
            const r = P.refill(_pile, _rnd); if (r) _pile.push(r);
            c.state = 'home'; c.t = 0;
            _open(tier, paid).then(res => _finish({ result: 'won', ...res }, ''));
        }
    } else if (c.state === 'home') {
        // drift back to the middle while the capsule opens
        c.x += (0.6 - c.x) * Math.min(1, dt * 3); c.z += (0.5 - c.z) * Math.min(1, dt * 3);
    } else if (c.state === 'drop') {   // a slipped capsule falling back to the floor
        c.fall.t += dt;
        if (c.fall.t > 0.45) { _pile.push({ ...c.fall.cap, x: c.fall.x, z: c.fall.z }); c.fall = null; c.state = 'up2'; c.t = 0; }
    } else if (c.state === 'up2') {
        c.h = Math.max(0, c.h - dt / 0.5);
        if (c.h <= 0) _finish({ result: 'slip' }, `It slipped! Your token's safe. ${c.grab.capsule.tier === 'gold' ? 'Gold capsules are slippery: drop right on the middle.' : 'Drop nearer the middle for a firmer grip.'}`);
    }
}
function _slip() {
    const c = _claw, cap = c.held;
    c.held = null; c.open = 1; _sfx('land_bad'); _buzz([20, 40, 20]);
    const x = _clamp(c.x + (_rnd() - 0.5) * 0.12, 0.28, 0.92), z = _clamp(c.z + (_rnd() - 0.5) * 0.1, 0.12, 0.94);
    c.fall = { cap, x, z, fromH: c.h, t: 0 }; c.state = 'drop'; c.t = 0;
}
function _finish(res, msg) {
    _claw.state = 'idle'; _claw.t = 0; _busy = false;
    if (msg) _hint(msg);
    _paint();
    const d = _onDone; _onDone = null; d && d(res);
}

// ---- opening a capsule ---------------------------------------------------------------------------
/** Open a capsule of this tier: the reveal, the shelf, any set reward. Resolves with { prize, fresh, tier }. */
function _open(tier, how = 'token', forced = null) {
    const owned = Solo.shelf();
    const prize = forced || P.draw(_rnd, tier, owned, Solo.prizeDry());
    const res = Solo.addPrize(prize.id, P.SPARKLE[prize.rarity]);
    if (res.fresh && prize.rarity === 'legendary') Solo.bump('legendary');
    Solo.won();
    const set = P.SETS.find(s => s.id === prize.set), prog = P.progress(set.id, Solo.shelf());
    let reward = null;
    if (prog.done && Solo.markSet(set.id)) { reward = set.reward; Solo.giveTokens(reward.tokens); if (reward.gold) Solo.addGold(reward.gold); }
    _paint();
    return _reveal({ prize, tier, fresh: res.fresh, sparkles: res.sparkles, set, prog, reward, how }).then(() => ({ prize, fresh: res.fresh, tier }));
}

/** Open a gold capsule you're holding (set rewards, the shop). */
export function openGold() {
    if (!_el || _busy || !Solo.useGold()) return Promise.resolve(null);
    _busy = true;
    return _open('gold', 'gold').then(r => { _busy = false; _paint(); return r; });
}

let _skipReveal = null;
function _reveal(o) {
    const ov = _el.querySelector('#ps-over'), cap = P.CAPSULES[o.tier], p = o.prize;
    ov.hidden = false;
    ov.className = `ps-over rev r-${p.rarity}`;
    ov.innerHTML = `<div class="ps-rev" style="--cap:${cap.color};--capd:${cap.dark};--rc:${RCOL[p.rarity]}">
        <div class="ps-rays"></div>
        <div class="ps-cap" id="ps-cap"><i class="ps-cap-top"></i><i class="ps-cap-bot"></i><i class="ps-cap-shine"></i></div>
        <div class="ps-plush-big" id="ps-plush">${p.icon}</div>
        <div class="ps-rev-card" id="ps-rev-card">
            <div class="ps-rarity bfont">${p.rarity.toUpperCase()}${o.how === 'free' ? ' · 🎁 FREE DROP' : ''}</div>
            <div class="ps-name bfont">${_esc(p.name)} <small>the ${_esc(p.id)}</small></div>
            <p class="ps-bio">${_esc(p.bio)}</p>
            <div class="ps-new bfont">${o.fresh ? '✨ NEW FOR YOUR CABINET!' : `A repeat: +${o.sparkles} ✨ sparkle${o.sparkles === 1 ? '' : 's'} for the shop`}</div>
            <div class="ps-setline">${o.set.icon} ${_esc(o.set.name)}: ${o.prog.have} / ${o.prog.of}</div>
            ${o.reward ? `<div class="ps-setdone bfont">🎉 SET COMPLETE! +${o.reward.tokens} 🎟️${o.reward.gold ? ` · +${o.reward.gold} gold capsule${o.reward.gold > 1 ? 's' : ''}` : ''}</div>` : ''}
            <button class="go-btn bfont" id="btn-ps-nice">${o.fresh ? 'ADD TO SHELF' : 'NICE!'}</button>
        </div>
        <p class="ps-tapskip" id="ps-tapskip">tap to open</p>
    </div>`;
    _sfx('gate_roll');
    return new Promise(done => {
        const capEl = ov.querySelector('#ps-cap');
        let stage = 0;
        const pop = () => {
            if (stage > 0) return; stage = 1;
            capEl.classList.add('open'); ov.classList.add('popped');
            ov.querySelector('#ps-tapskip').hidden = true;
            _sfx(p.rarity === 'legendary' ? 'win' : p.rarity === 'rare' ? 'coin_gain' : 'land_good');
            _buzz(p.rarity === 'common' ? 30 : [40, 40, 90]);
            _confetti(ov.querySelector('.ps-rev'), p.rarity === 'common' ? 24 : 50);
            if (o.reward) setTimeout(() => _confetti(ov.querySelector('.ps-rev'), 60), 600);
        };
        const t1 = setTimeout(pop, 1500);   // it wobbles, then pops (or tap to pop now)
        _skipReveal = pop;
        ov.querySelector('.ps-rev').addEventListener('click', e => { if (e.target.id !== 'btn-ps-nice') { clearTimeout(t1); pop(); } });
        ov.querySelector('#btn-ps-nice').addEventListener('click', e => {
            e.stopPropagation();
            ov.hidden = true; ov.innerHTML = ''; _skipReveal = null; _paint();
            if (o.fresh) _flyToShelf(p.id);
            done();
        });
    });
}
/** Probes: skip the wobble and close the reveal. */
export function _closeReveal() { _skipReveal && _skipReveal(); const b = _el && _el.querySelector('#btn-ps-nice'); b && b.click(); }

function _confetti(host, n) {
    const cols = ['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#fb923c'];
    for (let i = 0; i < n; i++) {
        const c = document.createElement('i'); c.className = 'ps-conf';
        c.style.setProperty('--x', `${(Math.random() - 0.5) * 340}px`); c.style.setProperty('--y', `${-60 - Math.random() * 220}px`);
        c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`); c.style.background = cols[i % cols.length]; c.style.animationDelay = `${Math.random() * 0.15}s`;
        host.appendChild(c); setTimeout(() => c.remove(), 1600);
    }
}
function _flyToShelf(id) {
    const slot = _el && _el.querySelector(`.ps-plush[data-id="${CSS.escape(id)}"]`);
    if (!slot) return;
    slot.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    slot.classList.remove('arrive'); void slot.offsetWidth; slot.classList.add('arrive');
}

// ---- the cabinet, a plush's card, the shop ----------------------------------------------------------
function _paint() {
    if (!_el) return;
    const shelf = Solo.shelf(), t = Solo.tokens(), free = Solo.freeDropReady(), gold = Solo.golds();
    _el.querySelector('#ps-tokens').textContent = `🎟️ ${t}`;
    _el.querySelector('#ps-spark').textContent = `✨ ${Solo.sparkles()}`;
    _el.querySelector('#btn-ps-drop').disabled = _busy || !_canPay();
    _el.querySelector('#btn-ps-drop').textContent = free ? 'FREE DROP!' : 'DROP!';
    const ban = _el.querySelector('#ps-banner');
    if (gold) { ban.hidden = false; ban.innerHTML = `🟡 You have ${gold} gold capsule${gold > 1 ? 's' : ''}! <button class="go-btn bfont" id="btn-ps-gold">OPEN</button>`; ban.querySelector('#btn-ps-gold').addEventListener('click', openGold); }
    else if (free) { ban.hidden = false; ban.textContent = '🎁 Your free drop for today is ready!'; }
    else ban.hidden = true;
    if (!_busy && _claw && _claw.state === 'idle' && !/slipped|Missed/.test(_el.querySelector('#ps-hint').textContent)) _hint(_canPay() ? 'Steer the claw (watch its shadow), then DROP on a capsule. Gold ones are best, and slipperiest.' : 'No tokens yet: every daily puzzle you solve earns one, and there\'s a free drop each day.');
    const done = Solo.setsDone();
    _el.querySelector('#ps-cabinet').innerHTML = `<div class="ps-cab-top bfont">🧸 YOUR CABINET <span>${Object.keys(shelf).length} / ${P.PRIZES.length}</span></div>` +
        P.SETS.map(set => {
            const pr = P.progress(set.id, shelf), complete = done.includes(set.id);
            return `<section class="ps-set${complete ? ' done' : ''}" data-set="${set.id}">
                <header><span class="bfont">${set.icon} ${set.name}</span><b>${pr.have} / ${pr.of}</b><small>${complete ? '✓ complete' : `reward: ${set.reward.tokens} 🎟️${set.reward.gold ? ` + ${set.reward.gold} 🟡` : ''}`}</small></header>
                <div class="ps-row">${P.inSet(set.id).map((p, i) => shelf[p.id]
                    ? `<button class="ps-plush r-${p.rarity}" data-id="${p.id}" style="--d:${(i % 5) * 0.2}s" aria-label="${_esc(p.name)} the ${_esc(p.id)}"><span>${p.icon}</span>${shelf[p.id] > 1 ? `<i>×${shelf[p.id]}</i>` : ''}</button>`
                    : `<span class="ps-plush miss r-${p.rarity}" title="still to find"><span>${p.icon}</span></span>`).join('')}</div>
            </section>`;
        }).join('');
    _el.querySelectorAll('.ps-plush[data-id]').forEach(b => b.addEventListener('click', () => card(b.dataset.id)));
}

/** A plush's card: name, story, rarity, when you found it. */
export function card(id) {
    const p = P.byId(id), n = Solo.shelf()[id], ov = _el.querySelector('#ps-over'), set = P.setOf(id), f = Solo.foundOn(id);
    if (!p || !n) return;
    ov.hidden = false; ov.className = `ps-over card r-${p.rarity}`;
    ov.innerHTML = `<div class="ps-card" style="--rc:${RCOL[p.rarity]}">
        <div class="ps-card-art"><span>${p.icon}</span></div>
        <div class="ps-rarity bfont">${p.rarity.toUpperCase()} · ${set.icon} ${_esc(set.name)}</div>
        <div class="ps-name bfont">${_esc(p.name)} <small>the ${_esc(p.id)}</small></div>
        <p class="ps-bio">${_esc(p.bio)}</p>
        <p class="ps-found">${f ? `Found ${f}` : 'Found a while ago'}${n > 1 ? ` · you have ${n}` : ''}</p>
        <button class="ghost-btn bfont" id="btn-ps-close">CLOSE</button></div>`;
    const close = () => { ov.hidden = true; ov.innerHTML = ''; };
    ov.querySelector('#btn-ps-close').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); }, { once: true });
}

/** The sparkle shop: a token, a gold capsule, or a plush you're missing. */
export function shop() {
    if (!_el || _busy) return;
    const ov = _el.querySelector('#ps-over'), sp = Solo.sparkles(), shelf = Solo.shelf();
    const miss = P.PRIZES.filter(p => !shelf[p.id]);
    ov.hidden = false; ov.className = 'ps-over shop';
    ov.innerHTML = `<div class="ps-shop">
        <div class="ps-shop-h bfont">🛒 SPARKLE SHOP <span>✨ ${sp}</span></div>
        <p class="hint">Repeats turn into sparkles: 1 for a common, 3 for a rare, 6 for a legend.</p>
        <div class="ps-items">
            <button class="ps-item" data-buy="token" ${sp < P.SHOP.token ? 'disabled' : ''}><b>🎟️</b><span>A claw token</span><em>✨ ${P.SHOP.token}</em></button>
            <button class="ps-item" data-buy="gold" ${sp < P.SHOP.gold ? 'disabled' : ''}><b>🟡</b><span>A gold capsule</span><em>✨ ${P.SHOP.gold}</em></button>
        </div>
        <div class="ps-shop-h2 bfont">PICK THE ONE YOU WANT</div>
        <div class="ps-picks">${miss.length ? miss.map(p => `<button class="ps-pick r-${p.rarity}" data-pick="${p.id}" ${sp < P.SHOP.pick[p.rarity] ? 'disabled' : ''}><span class="ps-sil">${p.icon}</span><em>✨ ${P.SHOP.pick[p.rarity]}</em></button>`).join('') : '<p class="hint">You have them all! 🏅</p>'}</div>
        <button class="ghost-btn bfont" id="btn-ps-close">CLOSE</button></div>`;
    const close = () => { ov.hidden = true; ov.innerHTML = ''; };
    ov.querySelector('#btn-ps-close').addEventListener('click', close);
    ov.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => { buy(b.dataset.buy); }));
    ov.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { buy('pick', b.dataset.pick); }));
}

/** Buy from the shop. Returns what happened (or false: not enough sparkles). */
export function buy(kind, id = null) {
    const cost = kind === 'pick' ? P.SHOP.pick[P.byId(id)?.rarity] : P.SHOP[kind];
    if (!cost || !Solo.spendSparkles(cost)) return false;
    _sfx('coin_gain');
    const ov = _el.querySelector('#ps-over'); ov.hidden = true; ov.innerHTML = '';
    if (kind === 'token') { Solo.giveTokens(1); _hint('🎟️ A token, bought with sparkles. Happy hunting!'); _paint(); return 'token'; }
    if (kind === 'gold') { Solo.addGold(1); _paint(); return openGold(); }
    _busy = true;
    const p = P.byId(id);
    return _open(p.rarity === 'legendary' ? 'gold' : p.rarity === 'rare' ? 'silver' : 'blue', 'shop', p).then(r => { _busy = false; _paint(); return r; });
}

function _hint(t) { const h = _el && _el.querySelector('#ps-hint'); if (h) h.textContent = t; }

// ---- drawing the machine (canvas) -------------------------------------------------------------------
const FRONT_Y = 0.86, BACK_Y = 0.5, FRONT_W = 0.86, BACK_W = 0.6, TOP_Y = 0.2;
const proj = (x, z) => { const w = FRONT_W + (BACK_W - FRONT_W) * z, y = FRONT_Y + (BACK_Y - FRONT_Y) * z; return [(0.5 + (x - 0.5) * w) * _W, y * _H, 1 - z * 0.35]; };

function _capsule(g, x, y, r, tier, t, lift = 0) {
    const c = P.CAPSULES[tier];
    g.save(); g.translate(x, y - lift);
    if (tier === 'gold') { const gl = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2); gl.addColorStop(0, `rgba(253,224,71,${0.45 + 0.2 * Math.sin(t * 4 + x)})`); gl.addColorStop(1, 'rgba(253,224,71,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 2, 0, 7); g.fill(); }
    // bottom half (white), top half (colour), seam, shine
    g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI); g.fill();
    const top = g.createLinearGradient(0, -r, 0, 0); top.addColorStop(0, c.color); top.addColorStop(1, c.dark);
    g.fillStyle = top; g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.fill();
    g.strokeStyle = 'rgba(43,18,64,.75)'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-r * 0.38, -r * 0.5, r * 0.28, r * 0.15, -0.6, 0, 7); g.fill();
    if (tier === 'gold' && Math.sin(t * 3 + x * 7) > 0.92) { g.fillStyle = '#fff'; g.font = `${Math.round(r)}px sans-serif`; g.textAlign = 'center'; g.fillText('✦', r * 0.5, -r * 0.4); }
    g.restore();
}

function _draw(t) {
    const g = _g, W = _W, H = _H, c = _claw;
    if (!g) return;
    g.clearRect(0, 0, W, H);
    // the cabinet: a candy-pink machine with a marquee of blinking bulbs
    const body = g.createLinearGradient(0, 0, W, 0); body.addColorStop(0, '#db2777'); body.addColorStop(0.5, '#f472b6'); body.addColorStop(1, '#db2777');
    g.fillStyle = body; g.beginPath(); g.roundRect ? g.roundRect(2, 2, W - 4, H - 4, 22) : g.rect(2, 2, W - 4, H - 4); g.fill();
    g.strokeStyle = '#2b1240'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#2b1240'; g.beginPath(); g.roundRect ? g.roundRect(14, 10, W - 28, H * 0.1, 12) : g.rect(14, 10, W - 28, H * 0.1); g.fill();
    g.fillStyle = '#fde047'; g.font = `900 ${Math.round(H * 0.055)}px "Bebas Neue", Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('✦ CAPSULE CLAW ✦', W / 2, 10 + H * 0.05);
    for (let i = 0; i < 14; i++) { const on = Math.floor(t * 4 + i) % 3 === 0; g.fillStyle = on ? '#fef08a' : '#a16207'; g.beginPath(); g.arc(24 + i * ((W - 48) / 13), 10 + H * 0.1 + 6, 3.5, 0, 7); g.fill(); }
    // the glass box: back wall, floor
    const gx0 = W * 0.06, gx1 = W * 0.94, gy0 = H * 0.17, gy1 = H * 0.93;
    const wall = g.createLinearGradient(0, gy0, 0, gy1); wall.addColorStop(0, '#1e1b4b'); wall.addColorStop(1, '#4c1d95');
    g.fillStyle = wall; g.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(t * 2 + i)})`; g.fillRect(gx0 + ((i * 53) % (gx1 - gx0)), gy0 + ((i * 37) % (H * 0.3)), 2, 2); }
    const [bl, by] = proj(0, 1), [br] = proj(1, 1), [fl, fy] = proj(0, 0), [fr] = proj(1, 0);
    const floor = g.createLinearGradient(0, by, 0, fy); floor.addColorStop(0, '#7c3aed'); floor.addColorStop(1, '#a78bfa');
    g.fillStyle = floor; g.beginPath(); g.moveTo(bl, by); g.lineTo(br, by); g.lineTo(fr, fy); g.lineTo(fl, fy); g.closePath(); g.fill();
    // the chute, front left
    const [chx, chy, chs] = proj(P.CHUTE.x, P.CHUTE.z);
    g.fillStyle = '#1e1b4b'; g.beginPath(); g.ellipse(chx, chy, 30 * chs * (W / 360), 12 * chs * (W / 360), 0, 0, 7); g.fill();
    g.strokeStyle = '#fde047'; g.lineWidth = 2.5; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#fde047'; g.font = `900 ${Math.round(H * 0.026)}px Nunito, sans-serif`; g.fillText('PRIZE', chx, chy + 22 * chs * (W / 360));
    // the claw's shadow on the floor (where it will land), then capsules back to front
    const R0 = 0.05 * W;
    const items = _pile.map(cp => ({ cp, z: cp.z }));
    if (c.fall) { const k = Math.min(1, c.fall.t / 0.45); items.push({ cp: c.fall.cap, z: c.fall.z, fall: k }); }
    items.sort((a, b) => b.z - a.z);
    const [sx, sy, ss] = proj(c.x, c.z);
    if (c.state === 'idle' || c.state === 'down') {
        g.fillStyle = 'rgba(15,10,40,.45)'; g.beginPath(); g.ellipse(sx, sy, R0 * 1.25 * ss, R0 * 0.45 * ss, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(253,224,71,.85)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.ellipse(sx, sy, R0 * 1.25 * ss, R0 * 0.45 * ss, 0, 0, 7); g.stroke(); g.setLineDash([]);
    }
    for (const it of items) {
        if (it.fall !== undefined) { const [px, py, ps] = proj(c.fall.x, c.fall.z); const k = it.fall, lift = (1 - k * k) * (py - (TOP_Y * H + (c.fall.fromH) * (py - TOP_Y * H))) ; _capsule(g, px, py - R0 * ps * 0.7, R0 * ps, it.cp.tier, t, Math.max(0, lift)); continue; }
        const [px, py, ps] = proj(it.cp.x, it.cp.z);
        g.fillStyle = 'rgba(15,10,40,.3)'; g.beginPath(); g.ellipse(px, py, R0 * ps, R0 * 0.35 * ps, 0, 0, 7); g.fill();
        _capsule(g, px, py - R0 * ps * 0.7, R0 * ps, it.cp.tier, t);
    }
    // the rail, the cable and the claw
    const railY = gy0 + 8, clawTop = railY + 10, floorY = sy - R0 * ss * 1.4, cy = clawTop + c.h * (floorY - clawTop);
    g.fillStyle = '#94a3b8'; g.fillRect(gx0, railY - 3, gx1 - gx0, 6);
    g.fillStyle = '#475569'; g.fillRect(sx - 14, railY - 7, 28, 12);
    g.strokeStyle = '#cbd5e1'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, railY); g.lineTo(sx, cy); g.stroke();
    const cs = 0.75 + ss * 0.35;
    g.save(); g.translate(sx, cy); g.scale(cs, cs);
    if (c.held) _capsule(g, 0, 22, R0 * ss / cs, c.held.tier, t);
    const spread = 0.25 + c.open * 0.55;
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 4; g.lineCap = 'round';
    for (const s of [-1, 0, 1]) { if (s === 0) { g.beginPath(); g.moveTo(0, 4); g.lineTo(0, 26); g.stroke(); continue; } g.beginPath(); g.moveTo(0, 4); g.quadraticCurveTo(s * 18 * spread * 1.6, 14, s * 16 * spread, 30); g.lineTo(s * 8 * spread, 34); g.stroke(); }
    g.fillStyle = '#64748b'; g.strokeStyle = '#1e293b'; g.lineWidth = 2; g.beginPath(); g.arc(0, 2, 8, 0, 7); g.fill(); g.stroke();
    g.restore();
    // glass: a sheen across the front
    g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(gx0, gy0); g.lineTo(gx0 + W * 0.25, gy0); g.lineTo(gx0 + W * 0.05, gy1); g.lineTo(gx0, gy1); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    g.textBaseline = 'alphabetic';
}

/** Probes. */
export const _debug = () => (_claw ? { x: _claw.x, z: _claw.z, state: _claw.state, busy: _busy, pile: _pile.map(c => ({ ...c })), golds: Solo.golds() } : null);
export function _setRnd(fn) { _rnd = fn || Math.random; }
export const byId = P.byId;
