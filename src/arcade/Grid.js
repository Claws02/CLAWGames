// ============================================================
// GRID — browse every game. Favourites and recently played on top, genre
// chips and length chips (⚡ quick, ⏱ medium, 🐢 long: Mix.js) to filter.
// Games the table can't play are greyed with the reason, never hidden: "why
// isn't Bowling here" deserves an answer.
// ============================================================
import * as Catalog from './Catalog.js';
import * as Stats from './Stats.js';
import { seats } from './Seats.js';
import * as Solo from './Solo.js';
import * as GameCards from './GameCards.js';
import * as Mix from './Mix.js';

let _genre = 'all', _len = 'all', _onPick = null, _pool = null, _poolWhy = null, _solo = false;

// pool: optional () => [types] that may be picked; others grey out as already
// played. A party passes its not-yet-played games.
// solo: Quick Play for one — only the games that play alone, each with its best.
// poolWhy: optional (type) => why a game outside the pool can't be picked.
export function open(onPick, pool = null, { solo = false, poolWhy = null } = {}) { _onPick = onPick; _pool = pool; _poolWhy = poolWhy; _solo = solo; _chips(); _render(); }

function _why(type) {
    if (_solo) return Solo.isSoloGame(type) ? '' : 'Not a solo game yet';
    const why = Catalog.whyNot(type, seats.count);
    if (why || !_pool) return why;
    return _pool().includes(type) ? '' : (_poolWhy?.(type) || 'Played this rotation');
}

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
    // Lengths: a row of their own under the genres, built here so a cached index.html still gets it.
    const row = document.createElement('div');
    row.className = 'chips len-chips';
    row.id = 'len-chips';
    const lens = [['all', 'ANY LENGTH'], ...Object.entries(Mix.LENGTHS || {}).map(([id, l]) => [id, `${l.icon} ${l.name}`])];
    lens.forEach(([id, label]) => {
        const b = document.createElement('button');
        b.textContent = label; b.dataset.len = id;
        b.className = id === _len ? 'sel' : '';
        b.addEventListener('click', () => {
            _len = id;
            row.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
            _render();
        });
        row.appendChild(b);
    });
    host.after(row);
}

function _card(type) {
    const info = Catalog.MG_INFO[type], g = Catalog.genreOf(type);
    const why = _why(type);
    const el = document.createElement('div');
    el.className = 'card has-clip' + (why ? ' blocked' : '');
    el.dataset.type = type;
    el.setAttribute('role', 'button');
    const n = Stats.plays(type);
    el.innerHTML =
        `<button class="fav${Stats.isFav(type) ? ' on' : ''}" aria-label="Favourite">⭐</button>` +
        GameCards.media(type, info.icon) +
        `<span class="cn">${info.title}</span>` +
        `<span class="cg g-${g}">${Catalog.MG_GENRES[g]?.name || g} ${Mix.LENGTHS?.[Mix.lengthOf?.(type)]?.icon || ''}</span>` +
        `<span class="cs">${why || (_solo ? _bestLine(type) : n ? `played ${n}×` : 'new!')}</span>`;
    el.querySelector('.fav').addEventListener('click', e => {
        e.stopPropagation();
        e.currentTarget.classList.toggle('on', Stats.toggleFav(type));
    });
    // a tap opens the preview: the clip big, how to play, the best, PLAY
    el.addEventListener('click', () => GameCards.preview({
        id: type, icon: info.icon, title: info.title, tag: Catalog.MG_GENRES[g]?.name || g, tagClass: `g-${g}`,
        desc: Catalog.descOf(type), best: _solo ? _bestLine(type) : n ? `Played ${n}×` : '', blocked: why,
        onPlay: () => { if (_onPick) _onPick(type); },
    }));
    return el;
}

function _bestLine(type) {
    const b = Solo.best(type);
    return b ? `🏆 ${Solo.fmt(type, b.score)} · ${b.name}` : 'no score yet';
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
    const all = Catalog.allTypes(_solo).filter(t => (_genre === 'all' || Catalog.genreOf(t) === _genre) && (_len === 'all' || Mix.lengthOf(t) === _len));
    const ok = all.filter(t => !_why(t));
    const no = all.filter(t => _why(t));
    if (_genre === 'all' && _len === 'all') {
        _section(grid, '⭐ Favourites', Stats.favorites().filter(t => ok.includes(t)));
        _section(grid, '🕒 Recently played', Stats.recent().filter(t => ok.includes(t)));
    }
    if (_solo) {
        _section(grid, `🎯 ${ok.length} solo games · beat the high score`, ok);
        _section(grid, '🚫 Need somebody to play against', no);
        GameCards.watch(grid);
        return;
    }
    _section(grid, `🎮 ${ok.length} ready for ${seats.count} players`, ok);
    _section(grid, _pool ? '🚫 Not available' : `🚫 Not for ${seats.count} players`, no);
    GameCards.watch(grid);
}
