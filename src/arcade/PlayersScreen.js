// ============================================================
// PLAYERS — the list of profiles on this phone, and one profile up close:
// rename, pick a character, see the record and the rivalries.
// ============================================================
import * as Profiles from './Profiles.js';
import { CHARS, faceHTML, portraits } from './Characters.js';
import { MG_INFO } from './Catalog.js';
import * as Confirm from './Confirm.js';
import { SEAT_STYLE } from '../host/ArcadeState.js';

const $ = id => document.getElementById(id);
// Off the table a profile has no seat colour; each wears one by list position,
// so the list reads as four colours rather than one.
const tint = id => SEAT_STYLE[Math.max(0, Profiles.list().findIndex(p => p.id === id)) % SEAT_STYLE.length];
const pct = (w, p) => (p ? Math.round(w / p * 100) + '%' : '–');

let _openProfile = null;
export function init(openProfile) { _openProfile = openProfile; }

export function paintList() {
    const profs = Profiles.list();
    SEAT_STYLE.forEach((s, k) => portraits([...new Set(profs.filter((_, i) => i % 4 === k).map(p => p.char))], s.color));
    const host = $('player-list');
    host.innerHTML = '';
    profs.forEach(p => {
        const st = Profiles.stats(p.id), s = tint(p.id);
        const b = document.createElement('button');
        b.className = 'pl-card';
        b.dataset.id = p.id;
        b.innerHTML = `<span class="dot" style="background:${s.hex}">${faceHTML(p.char, s.color)}</span>` +
            `<b class="bfont pl-name"></b><small>${st.plays ? `${st.wins} wins · ${st.plays} played` : 'No games yet'}</small>`;
        b.querySelector('.pl-name').textContent = p.name;
        b.addEventListener('click', () => _openProfile(p.id));
        host.appendChild(b);
    });
    const add = document.createElement('button');
    add.className = 'pl-card pl-add';
    add.id = 'btn-player-add';
    add.innerHTML = `<span class="dot">＋</span><b class="bfont">New player</b><small>Name & character</small>`;
    add.addEventListener('click', () => _openProfile(Profiles.create('', Profiles.freeChar())));
    host.appendChild(add);
    $('players-sum').textContent = profs.length
        ? 'Pick a player on the seat screen to track their record.'
        : 'Make a player to keep your name, character and record.';
}

export function paintProfile(id, onGone) {
    const p = Profiles.get(id);
    if (!p) return onGone();
    const s = tint(id), st = Profiles.stats(id);
    portraits(CHARS.map(c => c.id), s.color);

    $('pf-face').innerHTML = `<span class="dot big" style="background:${s.hex}">${faceHTML(p.char, s.color)}</span>`;
    const name = $('pf-name');
    name.value = p.name;
    name.onchange = () => {
        const n = Profiles.cleanName(name.value);
        if (n && !Profiles.nameTaken(n, id)) Profiles.update(id, { name: n });
        name.value = Profiles.get(id).name;
    };

    const chars = $('pf-chars');
    chars.innerHTML = '';
    CHARS.forEach(c => {
        const b = document.createElement('button');
        b.className = 'ch-pick' + (c.id === p.char ? ' sel' : '');
        b.dataset.char = c.id;
        b.innerHTML = `${faceHTML(c.id, s.color, 'face sm')}<span>${c.name}</span>`;
        b.addEventListener('click', () => { Profiles.update(id, { char: c.id }); paintProfile(id, onGone); });
        chars.appendChild(b);
    });

    const best = Profiles.bestGame(id);
    $('pf-stats').innerHTML = [
        ['Played', st.plays], ['Wins', st.wins], ['Win rate', pct(st.wins, st.plays)], ['Beat bots', st.botWins],
    ].map(([k, v]) => `<div class="pf-stat"><b class="bfont">${v}</b><small>${k}</small></div>`).join('');
    $('pf-best').textContent = best && st.games[best].w
        ? `Best game: ${MG_INFO[best]?.title || best} (${st.games[best].w} of ${st.games[best].p} won)`
        : '';

    const rivals = Profiles.rivals(id);
    $('pf-rivals').innerHTML = rivals.length
        ? rivals.map(r => `<div class="rv-row"><span class="rv-name">${r.name}</span>` +
            `<span class="rv-rec bfont ${r.w > r.l ? 'up' : r.w < r.l ? 'down' : ''}">${r.w} – ${r.l}</span></div>`).join('')
        : '<p class="hint">Play against another player on this phone to start a rivalry.</p>';

    $('btn-pf-delete').onclick = async () => {
        if (!(await Confirm.ask(`Delete ${p.name} and their record?`, 'DELETE'))) return;
        Profiles.remove(id);
        onGone();
    };
}
