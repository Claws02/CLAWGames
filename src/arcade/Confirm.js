// An in-app yes/no card. Native confirm() is blocked in some web views (and
// looks out of place in the app), so questions are asked on the page itself.
export function ask(question, yes = 'YES', no = 'CANCEL') {
    return new Promise(resolve => {
        const wrap = document.createElement('div');
        wrap.className = 'confirm-wrap';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.innerHTML = `<div class="confirm-card"><p class="confirm-q"></p>` +
            `<div class="wr-btns"><button class="go-btn bfont confirm-yes"></button>` +
            `<button class="veto-btn bfont confirm-no"></button></div></div>`;
        wrap.querySelector('.confirm-q').textContent = question;
        wrap.querySelector('.confirm-yes').textContent = yes;
        wrap.querySelector('.confirm-no').textContent = no;
        const done = v => { wrap.remove(); resolve(v); };
        wrap.querySelector('.confirm-yes').addEventListener('click', () => done(true));
        wrap.querySelector('.confirm-no').addEventListener('click', () => done(false));
        wrap.addEventListener('click', e => { if (e.target === wrap) done(false); });
        document.body.appendChild(wrap);
        wrap.querySelector('.confirm-no').focus();
    });
}
