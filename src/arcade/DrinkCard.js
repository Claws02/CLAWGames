// ============================================================
// DRINK CARD — drinking mode's call after every round, on every screen:
// who drinks and how many sips, who hands one out, and any new house rule.
// Full screen and impossible to miss; CHEERS (or the next round) clears it.
//
//   show({ names, sips, give, rule, rules, me, bots, colors })
//   hide()
// ============================================================
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let _el = null;

/**
 * names, sips: per seat. give: the seat that hands out a sip, or -1.
 * rule: { name, rule } dealt this round, or null. rules: every rule in play.
 * me: this device's seats (a phone shows "YOU"). bots: seats that never drink.
 */
export function show({ names, sips, give = -1, rule = null, rules = [], me = [], bots = [], colors = [] }) {
    hide();
    const rows = names.map((name, i) => ({ name, i, n: sips[i] || 0 }))
        .filter(r => r.n > 0 && !bots[r.i])
        .sort((a, b) => b.n - a.n);
    const mine = me.length === 1 ? sips[me[0]] || 0 : 0;
    const safe = names.filter((_, i) => !sips[i] && !bots[i]);
    _el = document.createElement('div');
    _el.className = 'drink-wrap';
    _el.setAttribute('role', 'dialog');
    _el.innerHTML = `<div class="drink-card">
        <div class="drink-h bfont">🍺 DRINK UP! 🍺</div>
        ${me.length === 1 ? `<div class="drink-me bfont">${mine ? `YOU DRINK ${mine} ${mine === 1 ? 'SIP' : 'SIPS'}` : "YOU'RE SAFE THIS ROUND"}</div>` : ''}
        ${me.length > 1 ? `<div class="drink-me bfont">${me.map(i => `${esc(names[i])}: ${sips[i] ? `${sips[i]} ${sips[i] === 1 ? 'SIP' : 'SIPS'}` : 'SAFE'}`).join(' · ')}</div>` : ''}
        <div class="drink-rows">${rows.map(r => `<div class="drink-row${me.includes(r.i) ? ' me' : ''}">
            <span class="dr-dot" style="background:${colors[r.i] || '#ff9f1c'}"></span>
            <span class="dr-name">${esc(r.name)}${me.includes(r.i) ? ' (you)' : ''}</span>
            <span class="dr-n bfont">${r.n}</span><span class="dr-u">${r.n === 1 ? 'sip' : 'sips'}</span></div>`).join('')
            || '<p class="drink-note">Nobody drinks this round!</p>'}</div>
        ${safe.length && rows.length ? `<p class="drink-note">Safe: ${safe.map(esc).join(', ')}</p>` : ''}
        ${give >= 0 ? `<p class="drink-give">🎁 <b>${esc(names[give])}</b> won: hand out <b>1 sip</b> to anyone</p>` : ''}
        ${rule ? `<p class="drink-rule">📜 New rule for <b>${esc(rule.name)}</b>: ${esc(rule.rule)}</p>` : ''}
        ${rules.length > (rule ? 1 : 0) ? `<details class="drink-rules"><summary>House rules in play (${rules.length})</summary>${rules.map(x => `<div><b>${esc(x.name)}</b>: ${esc(x.rule)}</div>`).join('')}</details>` : ''}
        <button class="go-btn bfont drink-ok">🍻 CHEERS</button>
    </div>`;
    _el.querySelector('.drink-ok').addEventListener('click', hide);
    document.body.appendChild(_el);
}

export function hide() { if (_el) { _el.remove(); _el = null; } }
export const isOpen = () => !!_el;
