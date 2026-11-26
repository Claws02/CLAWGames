// Old Ink's Lair: the talking locals (archived).
//
// Grandpa Turtle (World 1), Pip the seahorse (World 2) and Hermie the hermit crab
// (World 3) stood by each new thing and talked you through it in comic speech
// bubbles. Retired after a play-test ("archive the turtle directions"): the lair
// teaches by layout and the 💡 hints instead. Nothing in the app imports this file.
//
// To bring them back: put LOCALS[id] on each chamber as npcs, paste BUILD into
// createLair() in LairScreen.js after the signs (it needs T, Y, G, scene, put,
// toward, fl, rides, riders, level), and UPDATE into its frame loop beside signVis.

/** Each chamber's locals, by chamber id, as the recipe text (it uses LairLogic's at() and spots): { p, who: 'turtle' | 'seahorse' | 'hermit', look, rock?, say: [lines ≤ 110 letters] }. */
export const LOCALS = {
    'stair': String.raw`[{ p: at(16.8, 20), who: 'turtle', look: at(18.4, 0), say: ['Old Ink is at the top of the stair! The current drags you onto his urchins.', 'Drop a coconut in the water: the current carries it into the cove vent. Then the other vent blows.'] },
        { p: at(8.2, 4), who: 'turtle', look: SHELF, say: ['Old Ink slams an arm down where the red ring is. Dodge it!', 'Right after a slam, hit his head with a coconut.'] }]`,
    'beach': String.raw`[{ p: at(17.6, 22), who: 'turtle', look: at(18.4, 0), say: ['Old Ink took our Tide Pearl and ran into his sandcastle!', 'Grab coconuts from the palm. Hold the coconut button, then let go to throw.', 'That cracked bit of wall? Two good hits knock it down.'] },
        { p: at(14.6, -14), who: 'turtle', look: at(16, 0), say: ['The moat is too deep to swim. Jump onto a log as it drifts by.', 'Push the sand block against the wall, hop on it, then up onto the wall.'] },
        { p: at(6.4, 30), who: 'turtle', look: at(7.4, 0), say: ['A coconut on the red plate drops the red gate.', 'The blue bullseye only opens its gate for a few seconds. Be quick!'] }]`,
    'stream': String.raw`[{ p: at(17.4, 24), who: 'turtle', look: at(18.4, 0), say: ['Old Ink fled up the river to the mesa!', 'Vent A is too high to throw to. Toss a coconut on the jelly pad: it throws it up for you.', 'Plug one vent and the other one blows. Ride it over the river.'] },
        { p: at(8.4, 66), who: 'turtle', look: at(8.6, 30), say: ['Don\'t throw at the bullseye: it\'s tucked in a coral cave.', 'Throw at the smooth rock face from the yellow spot. It bounces into the cave.'] }]`,
    'yard': String.raw`[{ p: at(17.2, 16), who: 'turtle', look: at(18.4, 0), say: ['Old Ink paid his gull with our pearl. It keeps it in its nest up on the sea stack.', 'A coconut in the bullseye on the hut opens the net gate.'] },
        { p: at(11.6, 20), who: 'turtle', look: at(13.6, 0), say: ['The gull has a stolen coconut. It won\'t dive while it holds one: knock it loose!', 'When it dives, step aside, then jump on its back. Boing!'] },
        { p: at(6.4, 34), who: 'turtle', look: at(7.4, 0), say: ['That big plate is too heavy for a crab. Only the gull is heavy enough.', 'Stand on it till the gull dives, then step off. Down comes the drawbridge!'] }]`,
    'sink': String.raw`[{ p: at(18.0, -2), who: 'seahorse', look: at(18.6, -20), say: ['Old Ink got away down a sinkhole!', 'Holes here go right through our little planet, and out the other side.'] }]`,
    'pool': String.raw`[{ p: at(16.6, 20), who: 'seahorse', look: at(18.4, 0), say: ['His trail goes up to the little moon!', 'Step on the launch pad to fly there. What you do up there opens things down here.'] }]`,
    'tide': String.raw`[{ p: at(16.4, 22), who: 'seahorse', look: at(18.4, 0), say: ['The tide comes and goes. Don\'t get caught on the sand!', 'Wait on a raft, and the water lifts you up.'] }]`,
    'deep': String.raw`[{ p: at(16.2, 14), who: 'seahorse', look: at(18.4, 0), say: ['This is Old Ink\'s deepest lair. The tiles crumble: don\'t stop on them!'] },
        { p: at(9.2, 16), who: 'seahorse', look: at(9.0, 0), say: ['Steam jets bubble first, then blast. Wait for the blast, then run past.'] }]`,
    'slide': String.raw`[{ p: at(18.4, 30), who: 'hermit', look: at(18.2, 10), say: ['Old Ink gave the pearl to the Hermit King! I only just got away.', 'On the obsidian you can\'t walk or jump: you slide till something stops you. The dots show where.'] },
        { p: lakeAt(LAKE, 1, -1.6), who: 'hermit', look: lakeAt(LAKE, 2, 4), rock: true, say: ['Coconuts slide too! One on the yellow plate opens the bridge.'] }]`,
};

/** The screen code, as it was in LairScreen.js (kept as text: it ran inside createLair()). */
export const BUILD = String.raw`
    const NPC = {
        turtle: () => Y.prop([{ geo: G.sph, color: 0x5fae4a, s: [1.1, 0.7, 1.25], p: [0, 0.55, 0] }, { geo: G.sph, color: 0x8fd96a, s: [0.7, 0.45, 0.8], p: [0, 0.82, 0] }, { geo: G.cylLow, color: 0xe8d29a, s: [1.15, 0.12, 1.3], p: [0, 0.3, 0] },
            { geo: G.sph, color: 0xb9d98a, s: [0.46, 0.44, 0.5], p: [0, 0.72, 0.72] }, { geo: G.sphLow, color: 0xffffff, s: [0.14, 0.14, 0.1], p: [-0.11, 0.84, 0.94] }, { geo: G.sphLow, color: 0xffffff, s: [0.14, 0.14, 0.1], p: [0.11, 0.84, 0.94] },
            { geo: G.sphLow, color: 0x1a1024, s: [0.07, 0.07, 0.05], p: [-0.11, 0.84, 0.99], ink: false }, { geo: G.sphLow, color: 0x1a1024, s: [0.07, 0.07, 0.05], p: [0.11, 0.84, 0.99], ink: false },
            { geo: G.coneLow, color: 0xf5f5f5, s: [0.3, 0.36, 0.2], p: [0, 0.5, 0.86], r: [Math.PI, 0, 0] }, { geo: G.box, color: 0xf5f5f5, s: [0.34, 0.06, 0.08], p: [0, 0.96, 0.9] },
            ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => ({ geo: G.sphLow, color: 0xb9d98a, s: [0.26, 0.22, 0.3], p: [x * 0.46, 0.18, z * 0.42] })),
            { geo: G.cylLow, color: 0x8a5a2e, s: [0.07, 1.3, 0.07], p: [0.58, 0.65, 0.4] }, { geo: G.sphLow, color: 0xa87440, s: [0.14, 0.14, 0.14], p: [0.58, 1.3, 0.4] }], { thick: 0.05 }),
        seahorse: () => Y.prop([...[0, 1, 2, 3, 4].map(k => ({ geo: G.sph, color: k % 2 ? 0xffb35c : 0xff9a3c, s: [0.42 - k * 0.04, 0.38, 0.4 - k * 0.04], p: [0, 1.4 - k * 0.28, Math.sin(k * 0.9) * 0.16 - 0.05] })),
            { geo: G.sph, color: 0xffb35c, s: [0.44, 0.4, 0.46], p: [0, 1.72, 0.08] }, { geo: G.cylLow, color: 0xffb35c, s: [0.13, 0.4, 0.13], p: [0, 1.7, 0.42], r: [Math.PI / 2, 0, 0] },
            { geo: G.sphLow, color: 0xffffff, s: [0.15, 0.15, 0.1], p: [-0.16, 1.8, 0.2] }, { geo: G.sphLow, color: 0xffffff, s: [0.15, 0.15, 0.1], p: [0.16, 1.8, 0.2] },
            { geo: G.sphLow, color: 0x1a1024, s: [0.07, 0.07, 0.05], p: [-0.18, 1.8, 0.25], ink: false }, { geo: G.sphLow, color: 0x1a1024, s: [0.07, 0.07, 0.05], p: [0.18, 1.8, 0.25], ink: false },
            { geo: G.coneLow, color: 0xffe0a8, s: [0.12, 0.42, 0.3], p: [0, 1.25, -0.3], r: [-0.5, 0, 0] }, { geo: G.coneLow, color: 0xff7f9e, s: [0.12, 0.3, 0.12], p: [0, 2.0, 0.0] },
            { geo: G.cylLow, color: 0xff9a3c, s: [0.12, 0.5, 0.12], p: [0, 0.2, 0.12], r: [0.9, 0, 0] }], { thick: 0.05 }),
        hermit: () => Y.prop([{ geo: G.coneLow, color: 0xff8ac4, s: [0.9, 1.0, 0.9], p: [0, 0.82, -0.12], r: [-0.25, 0, 0] }, { geo: G.cylLow, color: 0xffb3d6, s: [0.86, 0.16, 0.86], p: [0, 0.4, -0.08], r: [-0.25, 0, 0] },
            { geo: G.sph, color: 0xff5a4e, s: [0.6, 0.4, 0.5], p: [0, 0.3, 0.32] }, ...[-1, 1].flatMap(k => [{ geo: G.sph, color: 0xff5a4e, s: [0.26, 0.2, 0.22], p: [k * 0.36, 0.32, 0.56] },
                { geo: G.cylLow, color: 0x8a2a24, s: [0.04, 0.24, 0.04], p: [k * 0.1, 0.56, 0.4] }, { geo: G.sphLow, color: 0xffffff, s: [0.12, 0.12, 0.12], p: [k * 0.1, 0.7, 0.42] }, { geo: G.sphLow, color: 0x1a1024, s: [0.06, 0.06, 0.06], p: [k * 0.1, 0.7, 0.47], ink: false }])], { thick: 0.05 }),
    };
    // a speech bubble: drawn on a canvas, shown as a sprite over the speaker's head (always facing you, never hidden by walls)
    const bubbleOf = () => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const tex = new T.CanvasTexture(cv); if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
        const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.renderOrder = 10; sp.visible = false; scene.add(sp); return { cv, g2: cv.getContext('2d'), tex, sp, text: null }; };
    const drawBubble = (b, text) => {
        if (b.text === text) return; b.text = text; const g2 = b.g2, W = 512; g2.clearRect(0, 0, W, 256); g2.font = 'bold 30px "Baloo 2", "Trebuchet MS", sans-serif';
        const words = text.split(' '), lines = []; let line = ''; for (const w of words) { const tryL = line ? line + ' ' + w : w; if (g2.measureText(tryL).width > W - 70 && line) { lines.push(line); line = w; } else line = tryL; } lines.push(line);
        const h = 40 + lines.length * 36, y0 = 200 - h; g2.fillStyle = '#ffffff'; g2.strokeStyle = '#2b1d33'; g2.lineWidth = 7;
        g2.beginPath(); g2.roundRect ? g2.roundRect(14, y0, W - 28, h, 26) : g2.rect(14, y0, W - 28, h); g2.fill(); g2.stroke();
        g2.beginPath(); g2.moveTo(W / 2 - 22, 198); g2.lineTo(W / 2, 240); g2.lineTo(W / 2 + 22, 198); g2.fill(); g2.stroke(); g2.fillStyle = '#ffffff'; g2.fillRect(W / 2 - 18, 192, 36, 10);
        g2.fillStyle = '#2b1d33'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; lines.forEach((l, i) => g2.fillText(l, W / 2, y0 + 38 + i * 36)); b.tex.needsUpdate = true; };
    const npcVis = (level.npcs || []).map(n => {
        const grp = new T.Group(), lift = n.rock ? 0.7 : 0, base = fl(n.p), body = (NPC[n.who] || NPC.turtle)(); body.position.y = lift; grp.add(body);
        if (n.rock) grp.add(Y.prop([{ geo: G.rockSoft, color: 0x46343f, s: [1.7, 1.1, 1.5], p: [0, 0.15, 0] }], { thick: 0.05 }));
        const f = toward(n.p, n.look || TOP); put(grp, n.p, f, base); scene.add(grp); if (rides(n.p)) riders.push({ obj: grp });
        return { n, grp, body, lift, base, f, b: bubbleOf(), k: 0, t: 0, line: 0, said: false };
    });
`;

export const UPDATE = String.raw`
        npcVis.forEach((v, i) => { const d = K.dist(c.p, v.n.p), near = d < (v.n.rock ? 6.5 : 3.6);
            if (near && !v.said) { v.said = true; v.line = 0; v.t = 0; hooks.sfx('tick'); }
            if (!near && d > (v.n.rock ? 8 : 5)) v.said = false;
            v.k += ((near ? 1 : 0) - v.k) * Math.min(1, dt * 6); v.t += dt;
            if (near && v.t > 4.2 && v.n.say.length > 1) { v.t = 0; v.line = (v.line + 1) % v.n.say.length; }
            if (near) { const want = toward(v.n.p, c.p); v.f = norm(mix(v.f, want, 1 - Math.min(1, dt * 3), Math.min(1, dt * 3))); }
            if (!rides(v.n.p)) put(v.grp, v.n.p, v.f, v.base); v.body.position.y = v.lift + Math.abs(Math.sin(t * (near ? 6 : 2) + i)) * (near ? 0.08 : 0.03);
            const sp = v.b.sp; sp.visible = v.k > 0.05; if (sp.visible) { drawBubble(v.b, v.n.say[v.line]); const top = at3(v.n.p, v.base + v.lift + (v.n.who === 'seahorse' ? 2.9 : 2.1)); sp.position.copy(top); sp.scale.set(3.6 * v.k, 1.8 * v.k, 1); } });
`;
