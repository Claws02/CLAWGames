// ============================================================
// SEATS — who is playing: how many, which are bots, how hard the bots are.
// Every mode starts here. Persisted, so the table you set up last time is the
// table you get.
// ============================================================
import * as Store from './Store.js';
import { SEAT_STYLE, MIN_SEATS, MAX_SEATS } from '../host/ArcadeState.js';
import { TIERS } from '../host/BotTiers.js';

const saved = Store.load('seats', null);
export const seats = {
    count: saved?.count ?? 2,
    bots:  saved?.bots  ?? [false, true, true, true],
    tier:  saved?.tier  ?? 'medium',
};
const _persist = () => Store.save('seats', seats);

export const humans = () => seats.bots.slice(0, seats.count).filter(b => !b).length;
export const anyBots = () => seats.bots.slice(0, seats.count).some(Boolean);

let _onGo = null;
export function open(onGo) { _onGo = onGo; _render(); }

function _render() {
    document.querySelectorAll('.seat-count button').forEach(b =>
        b.classList.toggle('sel', +b.dataset.n === seats.count));

    const list = document.getElementById('seat-list');
    list.innerHTML = '';
    for (let i = 0; i < seats.count; i++) {
        const s = SEAT_STYLE[i], bot = seats.bots[i];
        const el = document.createElement('div');
        el.className = 'seat';
        el.dataset.seat = i;
        el.innerHTML =
            `<div class="dot" style="background:${s.hex}">${bot ? '🤖' : '😀'}</div>` +
            `<div class="nm">${bot ? 'Bot ' + s.name : 'Player ' + (i + 1)}</div>` +
            `<div class="kind"><button data-k="human" class="${bot ? '' : 'sel'}">HUMAN</button>` +
            `<button data-k="bot" class="${bot ? 'sel' : ''}">BOT</button></div>`;
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

export function init() {
    document.querySelectorAll('.seat-count button').forEach(b => b.addEventListener('click', () => {
        seats.count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, +b.dataset.n));
        _persist(); _render();
    }));
    document.getElementById('btn-seats-go').addEventListener('click', () => {
        if (humans() > 0 && _onGo) _onGo();
    });
}
