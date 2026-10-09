// ============================================================
// SEATS — who is playing: how many, which are bots, how hard the bots are,
// and which player profile sits in each human seat (or a guest). Every mode
// starts here. Persisted, so the table you set up last time is the table you
// get.
//
// A seat's colour never changes (games read colours per slot); a profile
// brings its name and character to whichever seat it takes.
// ============================================================
import * as Store from './Store.js';
import * as Profiles from './Profiles.js';
import { faceHTML, portraits } from './Characters.js';
import { SEAT_STYLE, MIN_SEATS, MAX_SEATS, state, setPlayerCount } from '../host/ArcadeState.js';
import { TIERS } from '../host/BotTiers.js';

const saved = Store.load('seats', null);
export const seats = {
    count: saved?.count ?? 2,
    bots:  saved?.bots  ?? [false, true, true, true],
    tier:  saved?.tier  ?? 'medium',
    who:   saved?.who   ?? [null, null, null, null],   // profile id per seat
};
const _persist = () => Store.save('seats', seats);

/** Drop seat claims for profiles that were deleted, or that sit twice. */
export function tidy() {
    const seen = new Set();
    seats.who = seats.who.map(id => {
        if (!id || !Profiles.get(id) || seen.has(id)) return null;
        seen.add(id);
        return id;
    });
}
tidy();

export const humans = () => seats.bots.slice(0, seats.count).filter(b => !b).length;
export const anyBots = () => seats.bots.slice(0, seats.count).some(Boolean);

/** The profile in a seat, if a human with a profile sits there. */
export const profileAt = i => (!seats.bots[i] && seats.who[i]) ? Profiles.get(seats.who[i]) : null;
/** Profile ids for the table, null for guests and bots. */
export const table = () => Array.from({ length: seats.count }, (_, i) => profileAt(i)?.id || null);

export function seatName(i) {
    if (seats.bots[i]) return `Bot ${SEAT_STYLE[i].name}`;
    return profileAt(i)?.name || `Player ${i + 1}`;
}
export const seatChar = i => profileAt(i)?.char || SEAT_STYLE[i].charType;

/** Put the table's names and characters on the players the core will read. */
export function applyToState() {
    setPlayerCount(seats.count);
    for (let i = 0; i < seats.count; i++) {
        const p = state.players[i];
        p.name = seatName(i);
        p.charType = seatChar(i);
    }
}

let _onGo = null;
export function open(onGo) { _onGo = onGo; tidy(); _render(); }

function _render() {
    document.querySelectorAll('.seat-count button').forEach(b =>
        b.classList.toggle('sel', +b.dataset.n === seats.count));

    const list = document.getElementById('seat-list');
    list.innerHTML = '';
    for (let i = 0; i < seats.count; i++) {
        const s = SEAT_STYLE[i], bot = seats.bots[i];
        const el = document.createElement('div');
        el.className = 'seat' + (bot ? ' is-bot' : '');
        el.dataset.seat = i;
        el.innerHTML =
            `<button class="seat-who" ${bot ? 'disabled' : ''} aria-label="Choose who sits here">` +
                `<span class="dot" style="background:${s.hex}">${faceHTML(seatChar(i), s.color)}${bot ? '<i class="bot-tag">🤖</i>' : ''}</span>` +
                `<span class="nm"></span>` +
                (bot ? '' : `<span class="swap">${profileAt(i) ? 'change' : 'tap to pick'}</span>`) +
            `</button>` +
            `<div class="kind"><button data-k="human" class="${bot ? '' : 'sel'}">HUMAN</button>` +
            `<button data-k="bot" class="${bot ? 'sel' : ''}">BOT</button></div>`;
        el.querySelector('.nm').textContent = seatName(i);
        el.querySelector('.seat-who').addEventListener('click', () => pick(i));
        el.querySelectorAll('.kind button').forEach(b => b.addEventListener('click', () => {
            seats.bots[i] = b.dataset.k === 'bot';
            _persist(); _render();
        }));
        list.appendChild(el);
    }

    const seg = document.getElementById('tier-seg');
    seg.innerHTML = '';
    Object.entries(TIERS).forEach(([id, t]) => {
        const b = document.createElement('button');
        b.textContent = `${t.icon} ${t.label}`;
        b.dataset.tier = id;
        b.className = id === seats.tier ? 'sel' : '';
        b.disabled = !anyBots();
        b.addEventListener('click', () => { seats.tier = id; _persist(); _render(); });
        seg.appendChild(b);
    });

    const ok = humans() > 0;
    document.getElementById('btn-seats-go').disabled = !ok;
    document.getElementById('seat-hint').textContent = ok
        ? (seats.count > 2 ? `${seats.count} players: only games that seat everyone will light up.` : '')
        : 'Somebody has to be human!';
}

// ---- the picker sheet: a profile, a new player, or a guest --------------------
function pick(seat) {
    const s = SEAT_STYLE[seat];
    const profs = Profiles.list();
    portraits([...new Set(profs.map(p => p.char))], s.color);   // one GL context for the lot
    const wrap = document.createElement('div');
    wrap.className = 'confirm-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="confirm-card pick-card">
        <p class="confirm-q">Who's in the <b style="color:${s.hex}">${s.name}</b> seat?</p>
        <div class="pick-list"></div>
        <form class="pick-new"><input maxlength="14" placeholder="New player's name" aria-label="New player's name">
            <button class="go-btn bfont" type="submit">ADD</button></form>
        <div class="wr-btns"><button class="veto-btn bfont pick-guest">PLAY AS GUEST</button></div>
    </div>`;
    const done = () => { wrap.remove(); _persist(); _render(); };
    const take = id => {
        // A profile sits in one seat only: taking it here frees the old one.
        seats.who = seats.who.map(w => (w === id ? null : w));
        seats.who[seat] = id;
        done();
    };
    const listEl = wrap.querySelector('.pick-list');
    profs.forEach(p => {
        const at = seats.who.findIndex((w, i) => w === p.id && i < seats.count && !seats.bots[i]);
        const b = document.createElement('button');
        b.className = 'pick-row' + (at === seat ? ' sel' : '');
        b.innerHTML = `${faceHTML(p.char, s.color, 'face sm')}<span class="pr-name"></span>` +
            (at >= 0 && at !== seat ? `<em style="background:${SEAT_STYLE[at].hex}">${SEAT_STYLE[at].name}</em>` : '');
        b.querySelector('.pr-name').textContent = p.name;
        b.addEventListener('click', () => take(p.id));
        listEl.appendChild(b);
    });
    if (!profs.length) listEl.innerHTML = '<p class="hint">No players yet. Add one to keep your name, character and record.</p>';

    const form = wrap.querySelector('.pick-new'), input = form.querySelector('input');
    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = Profiles.cleanName(input.value);
        if (!name) return input.focus();
        if (Profiles.nameTaken(name)) { input.value = ''; input.placeholder = `${name} is taken`; return input.focus(); }
        take(Profiles.create(name, Profiles.freeChar()));
    });
    wrap.querySelector('.pick-guest').addEventListener('click', () => { seats.who[seat] = null; done(); });
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
}

export function init() {
    document.querySelectorAll('.seat-count button').forEach(b => b.addEventListener('click', () => {
        seats.count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, +b.dataset.n));
        _persist(); _render();
    }));
    document.getElementById('btn-seats-go').addEventListener('click', () => {
        if (humans() > 0 && _onGo) _onGo();
    });
}

