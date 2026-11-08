// ============================================================
// DICE — dice for the board games (Shut the Box, and Pig, Farkle, Liar's Dice
// to come): faces drawn as pips in CSS, and the tumble when they're rolled.
//
//   DICE_CSS                 the styles (scaled by the --c unit, see Tabletop)
//   dieHtml(v)               a face's inner HTML (v = 0: blank)
//   paint(el, v)             show face v on a .bd-die element
//   roll(table, els, n, rnd) tumble those dice for ROLL_MS, then land on n new
//                            faces: a promise of the faces. rnd() in [0, 1)
//                            (Math.random unless a game wants it seeded)
// ============================================================

export const ROLL_MS = 650, FACE_MS = 70;

export const DICE_CSS = `
.bd-die{width:calc(var(--c)*1.25);height:calc(var(--c)*1.25);border-radius:calc(var(--c)*.22);background:#fff;border:calc(var(--c)*.07) solid #3f4652;box-sizing:border-box;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:calc(var(--c)*.14);transition:transform .15s;box-shadow:0 calc(var(--c)*.08) 0 #3f4652}
.bd-die.blank{background:#5f6670}
.bd-die.tumble{transform:rotate(var(--r)) translateY(calc(var(--c)*-.1))}
.bd-pip{width:72%;height:72%;border-radius:50%;background:#1b1b1f;place-self:center}
`;

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const dieHtml = v => (v ? Array.from({ length: 9 }, (_, i) => (PIPS[v].includes(i) ? '<span class="bd-pip"></span>' : '<span></span>')).join('') : '');

export function paint(el, v) {
    el.classList.toggle('blank', !v);
    if (el._v !== v) { el.innerHTML = dieHtml(v); el._v = v; }
}

export function roll(table, els, n = els.length, rnd = Math.random) {
    const face = () => 1 + Math.floor(rnd() * 6);
    return new Promise(done => {
        let t = 0;
        const step = () => {
            if (table.done) return;
            t += FACE_MS;
            if (t < ROLL_MS) {
                els.forEach(el => { paint(el, 1 + Math.floor(Math.random() * 6)); el.classList.add('tumble'); el.style.setProperty('--r', `${Math.random() * 50 - 25}deg`); });
                table.after(step, FACE_MS);
                return;
            }
            const faces = Array.from({ length: n }, face);
            els.forEach((el, i) => { el.classList.remove('tumble'); paint(el, faces[i]); });
            done(faces);
        };
        step();
    });
}
