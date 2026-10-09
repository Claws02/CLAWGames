// ============================================================
// GRID — browse every game. Favourites and recently played on top, genre
// chips to filter. Games the table can't play are greyed with the reason,
// never hidden: "why isn't Bowling here" deserves an answer.
// ============================================================
import * as Catalog from './Catalog.js';
import * as Stats from './Stats.js';
import { seats } from './Seats.js';

let _genre = 'all', _onPick = null;

export function open(onPick) { _onPick = onPick; _chips(); _render(); }

function _chips() {
    const host = document.getElementById('genre-chips');
    if (host.childElementCount) return;
    const mk = (id, label) => {
        const b = document.createElement('button');
        b.textContent = label; b.dataset.genre = id;
        b.className = id === _genre ? 'sel' : '';
        b.addEventListener('click', () => {
            _genre = id;
            host.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
            _render();
        });
        host.appendChild(b);
    };
    mk('all', 'ALL');
    Object.entries(Catalog.MG_GENRES).forEach(([id, g]) => mk(id, g.name));
}

function _card(type) {
    const info = Catalog.MG_INFO[type], g = Catalog.genreOf(type);
    const why = Catalog.whyNot(type, seats.count);
    const el = document.createElement('div');
    el.className = 'card' + (why ? ' blocked' : '');
    el.dataset.type = type;
    el.setAttribute('role', 'button');
    const n = Stats.plays(type);
    el.innerHTML =
        `<button class="fav${Stats.isFav(type) ? ' on' : ''}" aria-label="Favourite">⭐</button>` +
        `<span class="ci">${info.icon}</span>` +
        `<span class="cn">${info.title}</span>` +
        `<span class="cg g-${g}">${Catalog.MG_GENRES[g]?.name || g}</span>` +
        `<span class="cs">${why || (n ? `played ${n}×` : 'new!')}</span>`;
    el.querySelector('.fav').addEventListener('click', e => {
        e.stopPropagation();
        e.currentTarget.classList.toggle('on', Stats.toggleFav(type));
    });
    el.addEventListener('click', () => { if (!why && _onPick) _onPick(type); });
    return el;
}

function _section(grid, title, types) {
    if (!types.length) return;
    const h = document.createElement('div');
    h.className = 'grid-head'; h.textContent = title;
    grid.appendChild(h);
    types.forEach(t => grid.appendChild(_card(t)));
}

function _render() {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = '';
    const all = Catalog.allTypes().filter(t => _genre === 'all' || Catalog.genreOf(t) === _genre);
    const ok = all.filter(t => !Catalog.whyNot(t, seats.count));
    const no = all.filter(t => Catalog.whyNot(t, seats.count));
    if (_genre === 'all') {
        _section(grid, '⭐ Favourites', Stats.favorites().filter(t => ok.includes(t)));
        _section(grid, '🕒 Recently played', Stats.recent().filter(t => ok.includes(t)));
    }
    _section(grid, `🎮 ${ok.length} ready for ${seats.count} players`, ok);
    _section(grid, `🚫 Not for ${seats.count} players`, no);
}
