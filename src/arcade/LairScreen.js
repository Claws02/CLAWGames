// ============================================================
// OLD INK'S LAIR — the 3D for a chamber (rules: LairLogic.js).
// Tiny Planet's screen (Planet.js) owns the renderer, the buttons and the
// cards; this builds one chamber's scene, steps it and draws it.
//
//   const lair = createLair(kit, chamber, hooks)
//     kit:   { T, renderer, toon, crab(color), pose(crab, dt, moving, cheer, lift), skin }
//     hooks: { say(text, color), hint(text, secs), pop(vec3, text), sfx(name), buzz(pattern), won(state) }
//   lair.frame(dt, stick)     step and draw
//   lair.jump()               the jump button
//   lair.hold(on)             the throw button: down starts the wind-up, up throws
//   lair.look(dyaw, dpitch)   the right thumb: turn and tilt the camera
//   lair.restart()            the same chamber again
//   lair.state()              the LairLogic state (HUD, probes)
//   lair.dispose()
//
// THE LOOK is the game's ink-outlined cartoon (Toon.js): flat candy colours,
// a stepped shade, chunky shapes, and a thick dark outline. Everything that can
// hurt is Old Ink's: spiky urchins, a current he stirs up, his gull. The
// warnings are on the ground: the current's streaks run the way it goes, the
// gull's shadow and a red ring say where it will land, a throw shows its bounce.
// Motion is gentle: things breathe, bob and blink, and react when you come near.
// ============================================================
import * as K from './LairLogic.js';
import { cross, mix, norm, tangent, toward, walk } from './PlanetLogic.js';
import { makeToon } from './Toon.js';

const CHARGE_S = 0.9;                       // how long a full wind-up takes
const GATE_COLOR = { eye: 0xff5fa8, plate: 0xffc83a, yard: 0x5fd0ff, red: 0xff5f5f, blue: 0x5f8bff, green: 0x4ade80, gold: 0xffc83a, cage: 0x5fd0ff };
const SHOW = { cliff: 2.4, cove: 1.5, step: 2, gate: 2.1 };      // how tall each kind of wall is drawn
const rngOf = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function createLair(kit, level, hooks) {
    const { T, renderer } = kit, R = K.R, Y = kit.toon || makeToon(T);
    const V = a => new T.Vector3(a[0], a[1], a[2]);
    const basic = (color, o = {}) => new T.MeshBasicMaterial({ color, ...o });
    const m4 = new T.Matrix4(), v1 = new T.Vector3(), v2 = new T.Vector3();
    const at3 = (p, lift = 0) => V(p).multiplyScalar(R + lift);
    const put = (obj, p, fwd, lift = 0) => {
        const up = V(p), f = V(tangent(p, fwd || [0.3, 0.2, 1])), x = new T.Vector3().crossVectors(up, f);
        obj.quaternion.setFromRotationMatrix(m4.makeBasis(x, up, f)); obj.position.copy(up.multiplyScalar(R + lift));
    };
    // A matrix standing on the ground at p, facing fwd, with a size (and a little spin about the vertical).
    const stand = (p, fwd, lift, sx, sy, sz, yaw = 0) => {
        const up = V(p), f = V(tangent(p, fwd)), x = new T.Vector3().crossVectors(up, f);
        if (yaw) { const c = Math.cos(yaw), s = Math.sin(yaw), f2 = f.clone().multiplyScalar(c).addScaledVector(x, s), x2 = x.clone().multiplyScalar(c).addScaledVector(f, -s); f.copy(f2); x.copy(x2); }
        return new T.Matrix4().makeBasis(x, up, f).scale(new T.Vector3(sx, sy, sz)).setPosition(up.clone().multiplyScalar(R + lift));
    };
    const around = K.around, TOP = K.TOP;
    const sfl = { ...K.create(level), blocks: [], logs: [] }, fl = p => K.floorAt(sfl, p);      // (the ground's height: terraces, ramps, posts)
    const scene = new T.Scene(); scene.background = new T.Color(0x9fe0ff);
    const camera = new T.PerspectiveCamera(58, 1, 0.1, 400);
    scene.add(new T.HemisphereLight(0xffffff, 0x8a7aa0, 0.5));
    const sun = new T.DirectionalLight(0xfff4d6, 0.75); scene.add(sun); scene.add(sun.target);

    // ── The planet, painted by what each part of it is ───────────────────────
    { const geo = new T.IcosahedronGeometry(R, 14), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new T.Color();
      const pal = { sand: [0xf3d890, 0xe9c87a], sea: [0x5aaed4, 0x4a9ec6], rock: [0xd2b98f, 0xc2a77c], grass: [0x8fd96a, 0x76c456], stone: [0xb9a6ea, 0xa994de], dais: [0xf6bdf3, 0xe9a7ee] };
      const cur = level.currents && level.currents[0], bands = level.ground || [[1.8, 'dais'], [5.6, 'stone'], [9.2, 'grass'], [level.bank, 'rock'], [99, 'sand']];
      for (let i = 0; i < pos.count; i += 3) {
          const p = norm([(pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3]);
          const d = K.dist(p, TOP), n = Math.sin(p[0] * 9.1 + 0.7) * Math.sin(p[1] * 8.3 + 1.9) + Math.sin(p[2] * 7.7 + p[0] * 3.1) * 0.6, tint = 0.96 + (((Math.sin(p[0] * 91.7 + p[1] * 47.3 + p[2] * 13.1) * 43758.5) % 1 + 1) % 1) * 0.08;
          const sea = cur && d > cur.r0 && d < cur.r1 && K.covers(cur, p);
          let kind = 'sand'; for (const [d1, k] of bands) if (d < d1) { kind = k === 'sea' || k === 'rock' ? (sea ? 'sea' : 'rock') : k; break; }
          c.setHex(pal[kind][n > 0.3 ? 1 : 0]).multiplyScalar(tint);
          for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeVertexNormals();
      scene.add(new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }))); }
    scene.add(new T.Mesh(new T.SphereGeometry(R * 1.16, 28, 18), basic(0xffffff, { transparent: true, opacity: 0.16, side: T.BackSide, depthWrite: false })));

    // ── Shapes ───────────────────────────────────────────────────────────────
    const G = {
        tower: new T.CylinderGeometry(0.52, 0.64, 1, 16),
        rock: new T.IcosahedronGeometry(0.5, 0), rockSoft: new T.IcosahedronGeometry(0.5, 1), brick: new T.BoxGeometry(1, 1, 1), crystal: new T.ConeGeometry(0.2, 1, 5),
        sph: new T.SphereGeometry(0.5, 16, 12), sphLow: new T.SphereGeometry(0.5, 10, 8), cyl: new T.CylinderGeometry(0.5, 0.5, 1, 14), cylLow: new T.CylinderGeometry(0.5, 0.5, 1, 9), cone: new T.ConeGeometry(0.5, 1, 8), coneLow: new T.ConeGeometry(0.5, 1, 5),
        box: new T.BoxGeometry(1, 1, 1), disc: new T.CircleGeometry(1, 28), ring: new T.RingGeometry(0.82, 1, 32), tube: new T.CylinderGeometry(1, 1, 1, 20, 1, true), dot: new T.SphereGeometry(0.08, 6, 5),
    };
    G.disc.rotateX(-Math.PI / 2); G.ring.rotateX(-Math.PI / 2);
    // The palette: candy colours; the ink does the rest.
    const C = {
        cliff: [0xd9893f, 0xc4742f, 0xe69b52], moss: 0x7ad65a, mossDark: 0x55b84c, stone: [0x9a82e0, 0x8670d2, 0xb39cf0], cove: [0x9fa6c4, 0x8890b4, 0xb6bcd6], dam: [0x7f8bb0, 0x6b779e, 0x929dc4],
        wood: 0xc98f52, wood2: 0xa87440, nut: 0x8a5a2e, nutDark: 0x5a3a1c, white: 0xffffff, gull: 0xf7f8ff, gullGrey: 0x9fb2d6, gullTip: 0x3f4a66, beak: 0xff9a1f, ink: 0x7b3fe4, inkLight: 0xa57bff, inkSpot: 0xc8aaff,
        sand: [0xf2cf86, 0xe8bf6e, 0xf7dc9c], sandDark: 0xc99a52, vine: 0x3fae4a, vineLeaf: 0x6fd65a, log: 0x9a6534, logEnd: 0xd9a066,
        urchin: 0x7a3fc0, spike: 0xe6b9ff, sea: 0x3fa9f5, pearl: 0xfff1ff, pole: 0xf5f5f5, gold: 0xffc83a, green: 0x4ade80, pink: 0xff7ab8,
    };

    // ── Walls ────────────────────────────────────────────────────────────────
    const walls = [];
    const arcPoints = (w, step = 0.5, phase = 0, keep = null) => {
        const c = w.c || TOP, circ = 2 * Math.PI * R * Math.sin(w.r / R), n = Math.max(12, Math.round(circ / step)), out = [];
        for (let i = 0; i < n; i++) { const deg = (i + 0.5 + phase) * (360 / n), p = around(c, w.r, deg); if (K.covers(w, p) && (!keep || keep(p))) out.push({ p, deg, len: circ / n, f: toward(p, c) }); }
        return out;
    };
    // A wall of boulders: rows stacked up, each boulder a squashed rock a little out of line.
    function boulderWall(w, kind, rows, step = 0.5, keep = null) {
        const rnd = rngOf(11 + Math.round(w.r * 10)), items = arcPoints(w, step, 0, keep), inst = rows.map((row, ri) => Y.instanced(G.rockSoft, items.length, row.thick || 0.1));
        inst.forEach(i => { scene.add(i.body); if (i.line) scene.add(i.line); });
        const jit = rows.map(() => items.map(() => [rnd(), rnd(), rnd(), rnd()]));
        const rebuild = hk => rows.forEach((row, ri) => items.forEach((it, i) => {
            const j = jit[ri][i], big = row.big ? row.big(it, i) : 1, h = row.h * (0.9 + j[0] * 0.3) * big * hk;
            const cols = row.color, hex = cols[(i + ri) % cols.length];
            inst[ri].set(i, stand(walk(it.p, it.f, (row.inset || 0) / R), it.f, fl(it.p) + row.y0 * hk + h / 2, it.len * (row.wide || 1.2) * (1 + j[1] * 0.3), Math.max(0.02, h), (row.depth || 0.9) * (0.85 + j[2] * 0.4), (j[3] - 0.5) * 0.5), hex);
        }));
        const wall = { w, k: 0, last: -1, rebuild, inst };
        rebuild(1); inst.forEach(i => i.done()); walls.push(wall); return wall;
    }
    // A fence of glowing crystals: a gate. It sinks into its stones when it opens.
    function crystalFence(w, hex) {
        const rnd = rngOf(23 + Math.round(w.r * 7)), items = arcPoints(w, 0.8);
        const cr = Y.instanced(G.crystal, items.length, 0.07, { emissive: new T.Color(hex).multiplyScalar(0.45) }), base = Y.instanced(G.rockSoft, items.length, 0.08);
        for (const i of [cr, base]) { scene.add(i.body); if (i.line) scene.add(i.line); }
        const jit = items.map(() => [rnd(), rnd(), rnd()]);
        const rebuild = hk => items.forEach((it, i) => {
            const j = jit[i], h = (1.15 + j[0] * 0.75) * hk;
            cr.set(i, stand(it.p, it.f, fl(it.p) + h / 2 + 0.1, 1.9, Math.max(0.02, h), 1.9, (j[1] - 0.5) * 2), j[2] > 0.5 ? hex : new T.Color(hex).lerp(new T.Color(0xffffff), 0.3).getHex());
            base.set(i, stand(it.p, it.f, fl(it.p) + 0.14, it.len * 1.0, 0.4, 0.62, (j[1] - 0.5) * 0.6), 0x6f5f8a);
        });
        const wall = { w, k: 0, last: -1, rebuild, inst: [cr, base], gate: true };
        rebuild(1); cr.done(); base.done(); walls.push(wall); return wall;
    }
    for (const w of level.rings || []) {
        const kind = w.kind || 'gate';
        if (kind === 'slide') continue;
        if (kind === 'cliff') boulderWall(w, kind, [
            { y0: 0, h: 1.3, thick: 0.13, color: C.cliff, depth: 1.5, inset: 0.4, wide: 1.3 },
            { y0: 0.95, h: 1.15, thick: 0.12, color: C.cliff, depth: 1.25, inset: 0.58, wide: 1.25 },
            { y0: 1.9, h: 0.8, thick: 0.11, color: [C.moss, C.mossDark], depth: 1.3, inset: 0.7, wide: 1.5 }], 0.7);
        else if (kind === 'cove') {
            // low boulders round the cove, and two tall standing stones either side of its mouth
            const gap = w.gap, a0 = gap[0] - gap[1], a1 = gap[0] + gap[1];
            boulderWall(w, kind, [{ y0: 0, h: 0.85, thick: 0.1, color: C.cove, depth: 0.85, wide: 1.3 }, { y0: 0.6, h: 0.6, thick: 0.09, color: [C.cove[2], C.cove[0]], depth: 0.75, inset: 0.05, wide: 1.3 }], 0.5, p => !(level.rings || []).some(r => r.kind === 'cliff' && Math.abs(K.dist(p, r.c || TOP) - r.r) < 0.65));
            for (const a of [a0, a1]) {
                const p = around(w.c, w.r, a), pil = Y.prop([{ geo: G.rock, color: C.cove[1], s: [0.8, 1.9, 0.8], p: [0, 0.95, 0] }, { geo: G.rock, color: C.cove[2], s: [0.62, 0.8, 0.62], p: [0.02, 1.7, 0] }, { geo: G.sph, color: C.moss, s: [0.7, 0.28, 0.7], p: [0, 2.1, 0] }], { thick: 0.1 });
                scene.add(pil); put(pil, p, toward(p, w.c), 0);
            }
        } else if (kind === 'step' || kind === 'castle' || kind === 'crack') {
            // (bricks: courses, each offset by half a brick; built just below)
            continue;
        } else if (w.gate) crystalFence(w, GATE_COLOR[w.gate] || 0xff5fa8);
    }
    // The step: two courses of bricks, the upper offset by half a brick, the top one lighter.
    for (const w of (level.rings || []).filter(r => r.kind === 'step')) {
        const courses = Array.from({ length: Math.max(1, Math.round(w.h)) }, (_, ri) => arcPoints(w, 0.62, ri * 0.5)), inst = courses.map(items => Y.instanced(G.brick, items.length, 0.07));
        inst.forEach(i => { scene.add(i.body); scene.add(i.line); });
        courses.forEach((items, ri) => items.forEach((it, i) => inst[ri].set(i, stand(walk(it.p, it.f, (ri ? 0.03 : 0) / R), it.f, 0.5 + ri, it.len * 0.97, 1.0, 0.62), ri ? C.stone[2] : C.stone[i % 2])));
        inst.forEach(i => i.done());
    }
    // Sandcastle walls: one hand-patted wall (wider at the foot, bumpy, with course lines), battlements along the top, bucket-shaped
    // towers at its ends and along the way (some with flags), shells pressed into the sand. A cracked section is grey stone.
    const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
    const spansOf = (w, step) => {          // the arcs of ring w that stand, as lists of { p, f, deg }
        const c = w.c || TOP, circ = 2 * Math.PI * R * Math.sin(w.r / R), n = Math.max(24, Math.round(circ / step)), on = [];
        for (let i = 0; i < n; i++) { const deg = (i / n) * 360, p = around(c, w.r, deg); on.push(K.covers(w, p) ? { p, f: toward(p, c), deg } : null); }
        const spans = []; let cur = null;
        for (let i = 0; i < n; i++) { if (on[i]) { if (!cur) spans.push(cur = []); cur.push(on[i]); } else cur = null; }
        if (spans.length > 1 && on[0] && on[n - 1]) spans[0] = spans.pop().concat(spans[0]);        // (one span across the seam)
        return { spans, full: spans.length === 1 && spans[0].length === n };
    };
    function sandWall(w, pal, opt = {}) {
        const h = w.h, prof = [[-0.62, 0], [-0.55, h * 0.18], [-0.5, h * 0.62], [-0.46, h], [0.46, h], [0.5, h * 0.62], [0.55, h * 0.18], [0.62, 0]];
        const { spans, full } = spansOf(w, 0.28), pos = [], col = [], cc = new T.Color(), ends = [];
        const vert = (sp, si, k) => {
            const it = sp[si], [x0, y0] = prof[k], top = k === 3 || k === 4, n = (hash(si + it.deg, k) - 0.5);
            const x = x0 + (top ? 0 : n * (opt.rough || 0.07)), y = y0 + (top ? n * (opt.jag || 0.04) : 0);
            const v = V(it.p).multiplyScalar(R + y).addScaledVector(V(it.f), x);
            // colour: darker at the foot, a darker line between courses, lighter on top, a little speckle
            const course = (y / Math.max(0.5, h)) * Math.max(1, Math.round(h * 1.5)), line = Math.abs(course - Math.round(course)) < 0.07 && !top && y > 0.1;
            cc.setHex(top ? pal.top : y < 0.22 ? pal.foot : pal.face[(Math.floor(si / 6) + Math.floor(course)) % pal.face.length]);
            if (line) cc.multiplyScalar(0.82); cc.multiplyScalar(0.94 + hash(si, k + 7) * 0.1);
            return [v, cc.r, cc.g, cc.b];
        };
        const tri = (a, b, c2) => { for (const q of [a, b, c2]) { pos.push(q[0].x, q[0].y, q[0].z); col.push(q[1], q[2], q[3]); } };
        for (const sp of spans) {
            const m = sp.length - (full ? 0 : 1);
            for (let si = 0; si < m; si++) { const sj = (si + 1) % sp.length; for (let k = 0; k < prof.length - 1; k++) { const a = vert(sp, si, k), b = vert(sp, si, k + 1), c2 = vert(sp, sj, k), d = vert(sp, sj, k + 1); tri(a, c2, b); tri(b, c2, d); } }
            if (!full) for (const [si, flip] of [[0, true], [sp.length - 1, false]]) {        // end caps
                const vs = prof.map((_, k) => vert(sp, si, k)), mid = [vs[0][0].clone().add(vs[prof.length - 1][0]).multiplyScalar(0.5).addScaledVector(V(sp[si].p), h * 0.5), vs[1][1], vs[1][2], vs[1][3]];
                for (let k = 0; k < prof.length - 1; k++) flip ? tri(vs[k], mid, vs[k + 1]) : tri(vs[k + 1], mid, vs[k]);
                ends.push(sp[si]);
            }
        }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        const mesh = Y.part(geo, Y.toon(0xffffff, { vertexColors: true }), 0.06);
        return { mesh, spans, ends };
    }
    const towerProp = (hgt, flag) => {
        const parts = [{ geo: G.tower, color: C.sand[0], s: [1, hgt, 1], p: [0, hgt / 2, 0] }, { geo: G.cylLow, color: C.sandDark, s: [1.36, 0.1, 1.36], p: [0, hgt * 0.32, 0] }, { geo: G.cylLow, color: C.sandDark, s: [1.26, 0.1, 1.26], p: [0, hgt * 0.68, 0] }, { geo: G.cylLow, color: C.sand[2], s: [1.2, 0.12, 1.2], p: [0, hgt, 0] }];
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push({ geo: G.brick, color: C.sand[2], s: [0.24, 0.3, 0.2], p: [Math.cos(a) * 0.48, hgt + 0.2, Math.sin(a) * 0.48], r: [0, -a, 0] }); }
        for (let k = 0; k < 4; k++) parts.push({ geo: G.coneLow, color: k % 2 ? 0xffb6c8 : 0xfff3e0, s: [0.12, 0.18, 0.12], p: [Math.cos(k * 1.7) * 0.6, hgt * (0.25 + k * 0.15), Math.sin(k * 1.7) * 0.6], r: [Math.PI / 2, 0, k], ink: false });
        if (flag) { parts.push({ geo: G.cylLow, color: 0x8a5a2e, s: [0.05, 1.1, 0.05], p: [0, hgt + 0.7, 0] }); parts.push({ geo: G.coneLow, color: 0xff4d6d, s: [0.35, 0.5, 0.06], p: [0.2, hgt + 1.05, 0], r: [0, 0, -Math.PI / 2] }); }
        return Y.prop(parts, { thick: 0.07 });
    };
    const crackWalls = [];
    for (const w of (level.rings || []).filter(r => r.kind === 'castle' || r.kind === 'crack')) {
        const n = Math.max(1, Math.round(w.h)), crack = w.kind === 'crack', grp = new T.Group(); scene.add(grp);
        const wall = sandWall(w, crack ? { face: [0x9c8a74, 0x8f7a66, 0xa89680], foot: 0x6e5c4a, top: 0xb3a28c } : { face: C.sand, foot: C.sandDark, top: 0xfbe4ad }, crack ? { rough: 0.16, jag: 0.35 } : {});
        grp.add(wall.mesh);
        if (!crack) {
            // battlements along the outer edge of the top
            if (w.top) { const items = []; wall.spans.forEach(sp => sp.forEach((it, i) => { if (i % 3 === 1) items.push(it); })); const mm = Y.instanced(G.brick, items.length, 0.06); grp.add(mm.body); grp.add(mm.line); items.forEach((it, i) => mm.set(i, stand(walk(it.p, it.f, -0.36 / R), it.f, w.h + 0.2, 0.42, 0.42, 0.26), C.sand[(i % 2) + 1])); mm.done(); }
            // towers at the ends of each stretch and every few steps along it, alternate ones flying a flag
            const spots = [...wall.ends]; wall.spans.forEach(sp => { const every = Math.max(10, Math.round(5 / 0.28)); for (let i = Math.round(every / 2); i < sp.length - every / 2; i += every) spots.push(sp[i]); });
            spots.forEach((it, i) => { const tw = towerProp(w.h + 0.7, i % 2 === 0); put(tw, it.p, it.f, 0); grp.add(tw); });

        }
        if (crack) {
            // big glowing zig-zag cracks on both faces, from the first look: the wall says "hit me here"
            const cg = new T.Group(), glow = basic(0xff8a2a), items = arcPoints(w, 0.55); grp.add(cg);
            for (const side of [1, -1]) items.forEach((it, j) => { for (let k = 0; k < n; k++) { const c = new T.Mesh(G.box, glow); c.scale.set(0.11, 0.62, 0.05); put(c, walk(it.p, it.f, side * 0.5 / R), it.f, 0.45 + k * 0.95 + (j % 2) * 0.2); c.rotateZ((k + j) % 2 ? 0.55 : -0.55); cg.add(c); } });
            // rubble at its foot on the beach side, and a ring on the ground that pulses when the crab is near
            const mid = items[Math.floor(items.length / 2)], rub = [];
            for (let k = 0; k < 9; k++) rub.push({ geo: G.rock, color: [0x8f7a66, 0x7d6a58, 0xb59a7c][k % 3], p: [(k - 4) * 0.32, 0.1, 0.9 + (k % 3) * 0.25], s: 0.28 + (k % 3) * 0.08 });
            const pile = Y.prop(rub, { thick: 0.05 }); put(pile, mid.p, mid.f.map(x => -x), 0); scene.add(pile);
            const ring = new T.Mesh(G.ring, basic(0xff8a2a, { transparent: true, opacity: 0.6, depthWrite: false, side: T.DoubleSide })); put(ring, walk(mid.p, mid.f, -1.2 / R), null, 0.08); ring.scale.setScalar(1.3); scene.add(ring);
            crackWalls.push({ w, grp, cg, pile, ring, glow, mid, shake: 0, said: false });
        }
        if (w.vine) {                   // vines down both faces of the wall
            const vw = { r: w.r, c: w.c, only: w.vine };
            for (const it of arcPoints(vw, 0.35)) for (const side of [1, -1]) {
                const h = n * (0.75 + 0.25 * Math.sin(it.deg * 7)), v = new T.Mesh(G.box, Y.toon(C.vine)); v.scale.set(0.09, h, 0.06); put(v, walk(it.p, it.f, side * 0.52 / R), it.f, h / 2 + 0.05); scene.add(v);
                for (let k = 0; k < 3; k++) { const lf = new T.Mesh(G.sphLow, Y.toon(C.vineLeaf)); lf.scale.set(0.2, 0.12, 0.08); put(lf, walk(it.p, it.f, side * 0.56 / R), it.f, 0.3 + k * h / 3); lf.rotateZ(k % 2 ? 0.7 : -0.7); scene.add(lf); }
            }
        }
    }
    // Terraces, ramps and shelves: raised ground with a grassy (or stone) top and rocky cliff sides, darker bands of strata.
    const LEDGE = { terrace: { top: [0x8fd96a, 0x7fcf5c], side: [0xc9935a, 0xb98249, 0xd6a46a] }, mesa: { top: [0xe8b46a, 0xdca65c], side: [0xd9893f, 0xc4742f, 0xe69b52] }, ramp: { top: [0xcfae7a, 0xc19f6c], side: [0xa98758, 0x977648, 0xb89668] }, shelf: { top: [0xaab0c4, 0x9aa1b6], side: [0x8890a8, 0x7a8299, 0x969db3] } };
    for (const l of level.ledges || []) {
        const pal = LEDGE[l.kind] || LEDGE.terrace, c0 = l.c || TOP, partial = !!(l.only || l.gap), lon0 = l.only ? l.only[0] - l.only[1] : 0, lon1 = l.only ? l.only[0] + l.only[1] : 360;
        const nR = Math.max(2, Math.ceil((l.r1 - l.r0) / 0.4)), circ = 2 * Math.PI * R * Math.sin(Math.max(l.r1, 0.5) / R), nL = Math.max(8, Math.ceil(circ * (lon1 - lon0) / 360 / 0.45));
        const hAt = r => (l.h1 == null ? l.h : l.h + (l.h1 - l.h) * (r - l.r0) / (l.r1 - l.r0)), pos = [], col = [], cc = new T.Color();
        const P3 = (r, lon, y) => V(around(c0, Math.max(r, 0.001), lon)).multiplyScalar(R + y);
        const push = (v, hex, k) => { pos.push(v.x, v.y, v.z); cc.setHex(hex).multiplyScalar(k); col.push(cc.r, cc.g, cc.b); };
        const quad = (a, b, c2, d, hex, k = 1) => { push(a, hex, k); push(b, hex, k); push(c2, hex, k); push(a, hex, k); push(c2, hex, k); push(d, hex, k); };
        for (let i = 0; i < nR; i++) for (let j = 0; j < nL; j++) {        // the top
            const r0 = l.r0 + (i / nR) * (l.r1 - l.r0), r1 = l.r0 + ((i + 1) / nR) * (l.r1 - l.r0), a0 = lon0 + (j / nL) * (lon1 - lon0), a1 = lon0 + ((j + 1) / nL) * (lon1 - lon0);
            const hex = pal.top[hash(i * 3.1, j * 1.7) > 0.7 ? 1 : 0], k = 0.97 + hash(i, j) * 0.05;
            quad(P3(r0, a0, hAt(r0)), P3(r1, a0, hAt(r1)), P3(r1, a1, hAt(r1)), P3(r0, a1, hAt(r0)), hex, k);
        }
        const side = (rA, aA, rB, aB) => {                                     // a cliff face down to the ground, in bands
            const hA = hAt(rA), hB = hAt(rB), bands = Math.max(1, Math.ceil(Math.max(hA, hB) / 0.7));
            for (let b = 0; b < bands; b++) { const y0 = b / bands, y1 = (b + 1) / bands; quad(P3(rA, aA, hA * y0 - 0.05), P3(rB, aB, hB * y0 - 0.05), P3(rB, aB, hB * y1), P3(rA, aA, hA * y1), pal.side[b % pal.side.length], 0.9 + hash(rA + aA, b) * 0.15); }
        };
        for (let j = 0; j < nL; j++) { const a0 = lon0 + (j / nL) * (lon1 - lon0), a1 = lon0 + ((j + 1) / nL) * (lon1 - lon0); side(l.r1, a1, l.r1, a0); if (l.r0 > 0.01) side(l.r0, a0, l.r0, a1); }
        if (partial) for (let i = 0; i < nR; i++) { const r0 = l.r0 + (i / nR) * (l.r1 - l.r0), r1 = l.r0 + ((i + 1) / nR) * (l.r1 - l.r0); side(r0, lon0, r1, lon0); side(r1, lon1, r0, lon1); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        const mesh = new T.Mesh(geo, Y.toon(0xffffff, { vertexColors: true, side: T.DoubleSide })); scene.add(mesh);
    }
    // Stone posts (a pillar is a tall one): a column with rings and a cap.
    for (const k of level.posts || []) {
        const base = K.floorAt({ ...sfl, lv: { ...level, posts: [] } }, k.p), hh = k.h - base;
        const g = Y.prop([{ geo: G.cyl, color: 0xb7aec8, s: [k.r * 2, hh, k.r * 2], p: [0, hh / 2, 0] }, { geo: G.cylLow, color: 0x9a90ae, s: [k.r * 2.3, 0.18, k.r * 2.3], p: [0, 0.09, 0] }, { geo: G.cylLow, color: 0x9a90ae, s: [k.r * 2.25, 0.12, k.r * 2.25], p: [0, hh * 0.55, 0] }, { geo: G.cylLow, color: 0xd0c8de, s: [k.r * 2.4, 0.2, k.r * 2.4], p: [0, hh - 0.1, 0] }], { thick: 0.07 });
        put(g, k.p, [1, 0, 0], base); scene.add(g);
    }
    // Jelly pads: a pink wobbly dome.
    const padMeshes = (level.pads || []).map(k => { const g = Y.prop([{ geo: G.sph, color: 0xff8ad8, s: [k.r * 2, 0.5, k.r * 2], p: [0, 0.05, 0] }, { geo: G.sphLow, color: 0xffd1f0, s: [k.r * 0.8, 0.12, k.r * 0.6], p: [-k.r * 0.3, 0.24, -k.r * 0.2], ink: false }], { thick: 0.06 }); put(g, k.p, k.to ? toward(k.p, k.to) : [1, 0, 0], fl(k.p) - 0.02 - (K.PAD_H || 0.25) + 0.02); scene.add(g);
        if (k.to) { const ar = Y.prop([{ geo: G.box, color: 0xfff3a0, s: [0.22, 0.06, 0.6], p: [0, 0.3, -0.1] }, { geo: G.coneLow, color: 0xfff3a0, s: [0.5, 0.45, 0.08], p: [0, 0.3, 0.38], r: [Math.PI / 2, 0, 0] }], { thick: 0.04 }); g.add(ar); }
        return { k, g, wob: 0 }; });
    // Stone walls (the bank-shot lane, the ramp's rails): a low run of blocks along each bar.
    for (const b of (level.bars || []).filter(x => x.kind === 'lane' || x.kind === 'rail' || x.kind === 'chute')) {
        const len = K.dist(b.a, b.b), n = Math.max(2, Math.round(len / 0.5)), m = Y.instanced(G.rockSoft, n, 0.08), nrm = norm(cross(b.a, b.b)); scene.add(m.body); scene.add(m.line);
        for (let i = 0; i < n; i++) { const tt = (i + 0.5) / n, p = norm(mix(b.a, b.b, 1 - tt, tt)), base = fl(p), hh = b.kind === 'rail' ? 1.0 : b.kind === 'chute' ? 1.3 : Math.max(0.8, b.h - base); m.set(i, stand(p, tangent(p, nrm), base + hh / 2, 0.62, hh, 0.7, hash(i, 2) * 2), [0x9aa1b6, 0x8890a8, 0xaab0c4][i % 3]); }
        m.done();
    }
    // Deep pools: dark water with a lighter rim, sitting on the ground they're in.
    const poolMeshes = (level.pools || []).map((q, i) => { const base = fl(q.p), g = new T.Group(); const w = new T.Mesh(G.disc, basic(0x2f7fc4, { transparent: true, opacity: 0.92 })); w.scale.setScalar(q.r); g.add(w); const rim = new T.Mesh(G.ring, basic(0x9fdcff, { transparent: true, opacity: 0.8, side: T.DoubleSide })); rim.scale.setScalar(q.r); rim.position.y = 0.01; g.add(rim); put(g, q.p, [1, 0, 0], base + 0.06 + i * 0.004); scene.add(g); return { q, g, rim }; });
    // The bumper: a bright yellow board on a stone footing, with arrows on its face pointing the way a coconut glances off.
    const bumpers = (level.bars || []).filter(x => x.kind === 'bumper').map(b => {
        const mid = norm(mix(b.a, b.b, 0.5, 0.5)), len = K.dist(b.a, b.b), base = fl(mid), along = toward(mid, b.b), nrm = tangent(mid, cross(mid, along)), g = new T.Group();
        const sp = (level.spots || []).find(x => x.via && K.dist(x.via, mid) < 0.5), face = sp ? (K.dist(walk(mid, nrm, 0.3 / R), sp.p) < K.dist(walk(mid, nrm, -0.3 / R), sp.p) ? 1 : -1) : 1;
        g.add(Y.prop([{ geo: G.box, color: 0x8890a8, s: [len + 0.3, 0.5, 0.7], p: [0, 0.25, 0] }, { geo: G.box, color: 0xffd23a, s: [len, 2.3, 0.3], p: [0, 1.6, 0] }, { geo: G.box, color: 0xff9a1f, s: [len + 0.1, 0.18, 0.34], p: [0, 2.8, 0] }], { thick: 0.08 }));
        if (sp) for (let k = 0; k < 3; k++) {    // chevrons: from where the coconut comes in, to where it goes out
            const ch = new T.Group(); for (const sgn of [1, -1]) { const bar = new T.Mesh(G.box, basic(0x2b1240)); bar.scale.set(0.5, 0.11, 0.05); bar.position.set(0, sgn * 0.14, 0); bar.rotation.z = sgn * 0.6; ch.add(bar); }
            const outDir = K.dist(walk(mid, along, 0.5 / R), sp.to) < K.dist(walk(mid, along, -0.5 / R), sp.to) ? 1 : -1;
            ch.position.set((k - 1) * 0.7, 1.6, face * 0.17); ch.rotation.y = face > 0 ? 0 : Math.PI; ch.scale.x = outDir * face; g.add(ch);
        }
        put(g, mid, along, base); g.rotateY(Math.PI / 2); scene.add(g); return g;
    });
    // The throw spot: a painted ring with crab footprints and a coconut, and green dots from it to the bumper and on to the bullseye.
    const spots = (level.spots || []).map(sp => {
        const base = fl(sp.p), g = new T.Group(), ring = new T.Mesh(G.ring, basic(0xffd23a, { transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false })); ring.scale.setScalar(0.75); g.add(ring);
        const fill = new T.Mesh(G.disc, basic(0xffd23a, { transparent: true, opacity: 0.25, depthWrite: false })); fill.scale.setScalar(0.62); g.add(fill);
        for (const [x, z] of [[-0.18, -0.1], [0.18, -0.1], [-0.25, 0.15], [0.25, 0.15]]) { const f2 = new T.Mesh(G.disc, basic(0xb07a2e)); f2.scale.setScalar(0.07); f2.position.set(x, 0.01, z); g.add(f2); }
        put(g, sp.p, toward(sp.p, sp.via), base + 0.08); scene.add(g);
        const dots = [], col = 0xffd23a;
        for (const [a, b, st, en] of [[sp.p, sp.via, 0.85, 0.5], [sp.via, sp.to, 0.5, 0.9]]) { const len = K.dist(a, b), n = Math.max(2, Math.floor((len - st - en) / 0.4)); for (let k = 0; k <= n; k++) { const f = (st + k * (len - st - en) / n) / len, p = norm(mix(a, b, 1 - f, f)), d = new T.Mesh(G.disc, basic(col, { transparent: true, opacity: 0.6, depthWrite: false })); d.scale.setScalar(0.15); put(d, p, null, fl(p) + 0.1); scene.add(d); dots.push(d); } }
        return { sp, g, ring, dots, said: false };
    });
    // A palm on the mesa with a coconut hanging from its frond on a rope.
    const hangVis = (level.hangs || []).map(hg => {
        const foot = walk(hg.p, toward(hg.p, TOP), 1.2 / R), g = new T.Group(); const trunk = Y.prop([{ geo: G.cyl, color: 0xa87440, s: [0.3, 2.6, 0.3], p: [0, 1.3, 0], r: [0, 0, -0.2] }, { geo: G.sph, color: 0x4cc064, s: [1.6, 0.2, 0.7], p: [0.6, 2.6, 0], r: [0, 0, -0.3] }, { geo: G.sph, color: 0x37a655, s: [0.7, 0.2, 1.4], p: [-0.2, 2.65, 0.3] }], { thick: 0.06 });
        g.add(trunk); put(g, foot, toward(foot, hg.p), fl(foot)); scene.add(g);
        const rope = new T.Mesh(G.box, basic(0x7a5a3a)); scene.add(rope); return { hg, rope };
    });
    // Sand blocks to push, floating logs, golden shells.
    const blockMeshes = (level.blocks || []).map(() => { const g = Y.prop([{ geo: G.box, color: C.sand[1], s: [1.05, 1, 1.05], p: [0, 0.5, 0] }, { geo: G.box, color: C.sand[2], s: [0.85, 0.06, 0.85], p: [0, 1.0, 0], ink: false }, { geo: G.box, color: C.sandDark, s: [0.5, 0.05, 1.07], p: [0, 0.35, 0], ink: false }], { thick: 0.08 }); scene.add(g); return g; });
    const logMeshes = (level.logs || []).map(() => { const g = Y.prop([{ geo: G.cyl, color: C.log, s: [0.55, 1.9, 0.55], r: [0, 0, Math.PI / 2], p: [0, 0.18, 0] }, { geo: G.cylLow, color: C.logEnd, s: [0.42, 0.04, 0.42], r: [0, 0, Math.PI / 2], p: [0.96, 0.18, 0], ink: false }, { geo: G.cylLow, color: C.logEnd, s: [0.42, 0.04, 0.42], r: [0, 0, Math.PI / 2], p: [-0.96, 0.18, 0], ink: false }], { thick: 0.07 }); scene.add(g); return g; });
    const goldMeshes = (level.gold || []).map(() => { const g = new T.Group(), sh = Y.prop([{ geo: G.coneLow, color: 0xffd23a, s: [0.32, 0.55, 0.32], r: [0, 0, 1.2] }, { geo: G.sphLow, color: 0xffe98a, s: 0.18, p: [-0.18, -0.08, 0], ink: false }], { thick: 0.05 }); g.add(sh); const halo = new T.Mesh(G.disc, basic(0xfff3a0, { transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide })); halo.scale.setScalar(0.55); halo.rotation.x = Math.PI / 2; g.add(halo); scene.add(g); return { g, sh, halo }; });
    // The slide down from the shelf: a wooden ramp with rails and arrows.
    const slide = (level.rings || []).find(w => w.kind === 'slide'); let slideLadder = null;
    if (slide) {
        const lon = slide.only[0], hi = K.at(slide.r - 0.15, lon), lo = K.at(slide.r + 1.9, lon), a = at3(hi, slide.show || SHOW.cliff), b = at3(lo, 0.1), len = a.distanceTo(b), g = new T.Group();
        g.add(Y.part(G.box, C.wood, 0.05)); g.children[0].scale.set(1.9, 0.16, len);
        for (const sx of [-1, 1]) { const rail = Y.part(G.box, C.wood2, 0.04); rail.scale.set(0.12, 0.3, len); rail.position.set(sx * 0.95, 0.2, 0); g.add(rail); }
        for (let i = 0; i < 3; i++) { const ar = Y.part(G.coneLow, C.gold, 0.03); ar.scale.set(0.5, 0.5, 0.3); ar.rotation.x = Math.PI / 2; ar.position.set(0, 0.14, (i - 1) * len * 0.26); g.add(ar); }
        // a rope ladder: rolled up at the top until the shelf's flag is reached, then it unrolls down the slide and the way works both ways
        const lad = new T.Group(); lad.position.set(0, 0.2, -len / 2); g.add(lad);
        for (const sx of [-0.45, 0.45]) { const r = Y.part(G.box, 0xc89b5a, 0.03); r.scale.set(0.08, 0.08, len); r.position.set(sx, 0, len / 2); lad.add(r); }
        for (let i = 0; i < Math.floor(len / 0.6); i++) { const r = Y.part(G.box, 0x9a6a34, 0.03); r.scale.set(0.98, 0.07, 0.12); r.position.set(0, 0.02, 0.3 + i * 0.6); lad.add(r); }
        const roll = Y.part(G.cyl, 0xc89b5a, 0.05); roll.scale.set(0.35, 1.0, 0.35); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.25, -len / 2 + 0.2); g.add(roll);
        slideLadder = { lad, roll, k: 0 };
        g.position.copy(a.clone().add(b).multiplyScalar(0.5)); g.up.copy(V(hi)); g.lookAt(b); scene.add(g);
    }
    // The spring rocks: a dam of grey boulders across the west end of the current, where the water starts.
    const foam = [];
    for (const dam of (level.bars || []).filter(b => b.kind === 'dam')) {
        const len = K.dist(dam.a, dam.b), n = Math.round(len / 0.7), rnd = rngOf(77), rowsD = [{ y: 0.7, h: 1.5, s: 1.3 }, { y: 1.8, h: 1.3, s: 1.1 }, { y: 2.8, h: 1.0, s: 0.9 }];
        const inst = rowsD.map(() => Y.instanced(G.rockSoft, n, 0.12)); inst.forEach(i => { scene.add(i.body); scene.add(i.line); });
        const nrm = norm(cross(dam.a, dam.b));
        rowsD.forEach((row, ri) => { for (let i = 0; i < n; i++) { const t = (i + 0.5 + (ri % 2) * 0.5) / (n + 0.5), p = norm(mix(dam.a, dam.b, 1 - t, t)), j = [rnd(), rnd(), rnd()]; inst[ri].set(i, stand(p, tangent(p, nrm), row.y * 0.75 + (j[0] - 0.5) * 0.3, row.s * (1.1 + j[1] * 0.5), row.h * (0.85 + j[2] * 0.4), row.s * 1.3, j[2] * 3), C.dam[(i + ri) % 3]); } inst[ri].done(); });
        // water pouring out of the top of the dam on its east side
        const mid = norm(mix(dam.a, dam.b, 0.5, 0.5)), east = tangent(mid, cross(TOP, mid));
        const cw = level.currents && level.currents[0]; if (!cw || Math.abs(((K.lonOf(mid) - (cw.only[0] - cw.only[1]) + 540) % 360) - 180) > 12) continue;   // (falls only where the stream starts)
        for (let i = 0; i < 5; i++) { const sheet = new T.Mesh(G.box, basic(0x9fd8ff, { transparent: true, opacity: 0.7 })); sheet.scale.set(0.5, 2.2, 0.2); const p = norm(mix(dam.a, dam.b, 0.3 + i * 0.1, 0.7 - i * 0.1)); put(sheet, walk(p, east, 0.55 / R), tangent(p, east), 1.2); scene.add(sheet); foam.push({ m: sheet, p, i }); }
    }

    // ── The water: a skin over the channel, and streaks that run the way it goes ──
    const cur = level.currents && level.currents[0], streaks = [];
    if (cur) {
        const lon0 = cur.only[0] - cur.only[1], lon1 = cur.only[0] + cur.only[1], nL = Math.round((lon1 - lon0) / 5), rows = Math.ceil((cur.r1 - cur.r0) / 0.7), pos = [];
        for (let i = 0; i < nL; i++) for (let j = 0; j < rows; j++) {
            const a0 = lon0 + (i / nL) * (lon1 - lon0), a1 = lon0 + ((i + 1) / nL) * (lon1 - lon0), r0 = cur.r0 + ((cur.r1 - cur.r0) * j) / rows, r1 = cur.r0 + ((cur.r1 - cur.r0) * (j + 1)) / rows;
            const q = [around(TOP, r0, a0), around(TOP, r1, a0), around(TOP, r1, a1), around(TOP, r0, a1)].map(p => at3(p, 0.07));
            for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k].x, q[k].y, q[k].z);
        }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3)); scene.add(new T.Mesh(geo, basic(0x3fa9f5, { transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false })));
        const sm = basic(0xffffff, { transparent: true, opacity: 0.7, depthWrite: false }), sg = new T.BoxGeometry(0.1, 0.03, 0.8);
        for (let i = 0; i < 110; i++) { const m = new T.Mesh(sg, sm); scene.add(m); streaks.push({ m, lon: lon0 + Math.random() * (lon1 - lon0), d: cur.r0 + 0.2 + Math.random() * (cur.r1 - cur.r0 - 0.4), s: 0.7 + Math.random() * 0.6, lon0, lon1 }); }
    }

    // ── Urchins: Old Ink's fence. Round, purple, spiky and cross. ────────────
    const urchinProp = () => {
        const parts = [{ geo: G.sphLow, color: C.urchin, s: 0.95 }];
        for (let i = 0; i < 22; i++) { const a = Math.acos(1 - 2 * (i + 0.5) / 22), b = i * 2.4, d = new T.Vector3(Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d), e = new T.Euler().setFromQuaternion(q);
            parts.push({ geo: G.coneLow, color: C.spike, p: [d.x * 0.62, d.y * 0.62, d.z * 0.62], r: [e.x, e.y, e.z], s: [0.2, 0.5, 0.2] }); }
        return Y.prop(parts, { thick: 0.045 });
    };
    const urchins = (level.urchins || []).map((u, i) => {
        const g = new T.Group(), body = urchinProp(); g.add(body);
        // two cross yellow eyes on the front, looking at the crab
        const eyes = [-1, 1].map(k => { const e = new T.Group(), w = Y.part(G.sph, C.white, 0.03); w.scale.setScalar(0.26); e.add(w); const pu = new T.Mesh(G.sph, basic(0x1a1024)); pu.scale.setScalar(0.12); pu.position.z = 0.1; e.add(pu); e.position.set(k * 0.22, 0.2, 0.52); const br = Y.part(G.box, 0x3a1a60, 0.02); br.scale.set(0.3, 0.07, 0.07); br.position.set(k * 0.22, 0.42, 0.5); br.rotation.z = -k * 0.45; g.add(br); g.add(e); return e; });
        g.scale.setScalar(u.r * 1.05); scene.add(g); return { u, g, body, eyes, ph: i * 1.7 };
    });
    // Stepping rocks: grey stone, a grassy top with a few flowers.
    const rocks = (level.rocks || []).map(k => {
        const g = Y.prop([{ geo: G.cylLow, color: 0x7f8bb0, p: [0, -0.02, 0], s: [1.12, 0.5, 1.12] }, { geo: G.cylLow, color: 0xa0aac4, p: [0, 0.2, 0], s: [1.02, 0.28, 1.02] }, { geo: G.cyl, color: C.moss, p: [0, 0.4, 0], s: [0.9, 0.1, 0.9] },
            { geo: G.sph, color: C.pink, p: [0.3, 0.52, 0.2], s: 0.16 }, { geo: G.sph, color: C.gold, p: [-0.35, 0.52, -0.1], s: 0.14 }, { geo: G.coneLow, color: C.mossDark, p: [0.05, 0.56, -0.35], s: [0.14, 0.3, 0.14] }, { geo: G.coneLow, color: C.mossDark, p: [-0.2, 0.55, 0.38], s: [0.12, 0.26, 0.12] }], { thick: 0.09 });
        g.scale.set(k.r, 1, k.r); scene.add(g); return { k, g };
    });
    // Vents: a stony crater, a bubble column when it blows, and a ring that says which is which.
    const vents = (level.vents || []).map(v => {
        const g = Y.prop([{ geo: G.cylLow, color: 0xa39ab8, p: [0, 0.03, 0], s: [1.25, 0.16, 1.25] }, { geo: G.cylLow, color: 0x6e6585, p: [0, 0.1, 0], s: [0.8, 0.12, 0.8] }, { geo: G.cylLow, color: 0x1d0f2b, p: [0, 0.17, 0], s: [0.56, 0.06, 0.56], ink: false }], { thick: 0.05 });
        g.scale.setScalar(v.r / 0.6);
        const base = (rocks.find(r => K.dist(r.k.p, v.p) < 0.4) ? K.ROCK_H : 0) || fl(v.p);
        scene.add(g); const lift = v.lift || 0, col = new T.Mesh(G.tube, basic(0xbdeaff, { transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false })); col.visible = false; scene.add(col);
        const bands = lift ? [0, 1, 2, 3].map(i => { const b = new T.Mesh(G.ring, basic(0xffffff, { transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false })); b.visible = false; scene.add(b); return { b, t: i / 4 }; }) : [];
        const bubbles = Array.from({ length: 10 }, (_, i) => { const b = new T.Mesh(G.sphLow, basic(0xeaf9ff, { transparent: true, opacity: 0.85 })); b.visible = false; scene.add(b); return { b, t: i / 10 }; });
        const halo = new T.Mesh(G.ring, basic(v.float ? 0xe0d6f5 : 0x7ee7ff, { transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide })); halo.scale.setScalar(v.r + 0.4); scene.add(halo);
        return { v, g, col, bands, bubbles, halo, base, lift };
    });
    // Flags, the palm, the plate, the bullseye, the pearl.
    const checks = (level.checks || []).map((p0, i) => {
        const p = walk(p0, cross(p0, tangent(p0, K.TOP)), 0.8 / R), g = new T.Group(), pole = Y.part(G.cyl, C.pole, 0.04); pole.scale.set(0.07, 1.5, 0.07); pole.position.y = 0.75; g.add(pole);
        const stone = Y.part(G.rock, 0x9aa3b8, 0.04); stone.scale.set(0.5, 0.3, 0.5); stone.position.y = 0.06; g.add(stone);
        const off = Y.toon(C.pole), on = Y.toon(C.green), cloth = Y.part(G.box, off, 0.03); cloth.scale.set(0.7, 0.42, 0.04); cloth.position.set(0.36, 1.25, 0); g.add(cloth);
        scene.add(g); return { p, i, g, cloth, off, on };
    });
    const palm = (() => {
        const trunk = [], leaves = [], g = new T.Group(), top = new T.Group();
        for (let i = 0; i < 5; i++) trunk.push({ geo: G.cylLow, color: i % 2 ? 0xb07a45 : 0x9a6b3f, p: [i * 0.045, 0.22 + i * 0.4, 0], r: [0, 0, -0.09], s: [0.22 - i * 0.02, 0.44, 0.22 - i * 0.02] });
        g.add(Y.prop(trunk, { thick: 0.045 }));
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; leaves.push({ geo: G.sph, color: i % 2 ? 0x4cc064 : 0x37a655, p: [Math.cos(a) * 0.62, -0.02 - 0.12 * (i % 2), Math.sin(a) * 0.62], r: [Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5], s: [0.42, 0.1, 1.5] }); }
        for (let i = 0; i < 3; i++) leaves.push({ geo: G.sph, color: C.nut, p: [Math.cos(i * 2.1) * 0.22, -0.15, Math.sin(i * 2.1) * 0.22], s: 0.3 });
        const crown = Y.prop(leaves, { thick: 0.05 }); top.add(crown); top.position.set(0.2, 2.15, 0); g.add(top); g.scale.setScalar(1.15); scene.add(g); put(g, level.palm, [1, 0, 0]); return { g, top };
    })();
    const plates = (level.plates || []).map(pl => {
        const g = new T.Group(), rim = Y.prop([{ geo: G.cylLow, color: 0xb9aed0, s: [2.25, 0.22, 2.25], p: [0, 0.08, 0] }], { thick: 0.06 }); g.add(rim);
        const gc = GATE_COLOR[[].concat(pl.gate)[0]] || 0xffc83a, off = Y.toon(gc), on = Y.toon(C.green), top = Y.part(G.cylLow, off, 0.04); top.scale.set(1.6, 0.12, 1.6); top.position.y = 0.22; g.add(top);
        g.scale.setScalar(pl.r / 1.125); const halo = new T.Mesh(G.ring, basic(gc, { transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })); halo.scale.setScalar(pl.r + 0.15); scene.add(halo); scene.add(g);
        return { pl, g, top, off, on, halo };
    });
    const targets = (level.targets || []).map(tg => {
        const g = new T.Group(), post = Y.part(G.cylLow, C.wood2, 0.04); post.scale.set(0.16, 1.1, 0.16); post.position.y = 0.55; g.add(post);
        const face = new T.Group(); face.position.y = 1.15; const mats = [];
        [[0.62, 0xff4d4d], [0.44, 0xffffff], [0.26, 0xff4d4d]].forEach(([r, hex], i) => { const m = Y.toon(hex); mats.push(m); const d = Y.part(G.cyl, m, i ? 0 : 0.05); d.scale.set(r * 2, 0.1 + i * 0.03, r * 2); d.rotation.x = Math.PI / 2; face.add(d); });
        g.add(face); scene.add(g); return { tg, g, face, hit: 0, mats };
    });
    // Signal lines: a dotted line on the ground from each plate and bullseye to every gate it works, in that gate's colour.
    // Dim while the switch is off; bright, with a pulse running along it, while it holds the gate; a timed one goes dark dot by dot.
    const signals = [], s0 = { ...K.create(level), blocks: [], logs: [] };
    for (const [kind, list] of [['plate', level.plates || []], ['target', level.targets || []]]) for (const sw of list) for (const g of [].concat(sw.gate)) {
        const ring = (level.rings || []).find(r => r.gate === g); if (!ring) continue;
        const c0 = ring.c || TOP, dest = around(c0, ring.r + (K.dist(sw.p, c0) > ring.r ? 0.35 : -0.35), K.lonOf(sw.p, c0)), len = K.dist(sw.p, dest), st = (sw.r || 0.45) + 0.2, n = Math.max(2, Math.floor((len - st - 0.15) / 0.38));
        const mat = basic(GATE_COLOR[g] || 0xffffff, { transparent: true, opacity: 0.4, depthWrite: false, side: T.DoubleSide }), dots = [];
        for (let k = 0; k <= n; k++) { const f = (st + k * ((len - st - 0.15) / n)) / len, p = norm(mix(sw.p, dest, 1 - f, f)), d = new T.Mesh(G.disc, mat.clone()); d.scale.setScalar(0.11); put(d, p, null, 0.09 + K.floorAt(s0, p)); scene.add(d); dots.push(d); }
        // a coloured ring round a bullseye's post, so it matches its gate
        if (kind === 'target') { const rg = new T.Mesh(G.ring, basic(GATE_COLOR[g] || 0xffffff, { transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })); rg.scale.setScalar(0.6); put(rg, sw.p, null, 0.1); scene.add(rg); }
        signals.push({ kind, sw, g, dots });
    }
    const pearl = new T.Group();
    { const orb = Y.part(G.sph, Y.toon(C.pearl, { emissive: new T.Color(0xff8ad8).multiplyScalar(0.5) }), 0.05); orb.scale.setScalar(1.0); orb.position.y = 0.95; pearl.add(orb);
      const shine = new T.Mesh(G.sph, basic(0xffffff)); shine.scale.setScalar(0.22); shine.position.set(-0.2, 1.18, 0.2); pearl.add(shine);
      const dais = Y.prop([{ geo: G.cylLow, color: 0xd9c8f0, s: [1.7, 0.3, 1.7], p: [0, 0.15, 0] }, { geo: G.cylLow, color: 0xece0fa, s: [1.2, 0.2, 1.2], p: [0, 0.38, 0] }], { thick: 0.06 }); pearl.add(dais);
      const glow = new T.Mesh(G.disc, basic(0xff8ad8, { transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide })); glow.scale.setScalar(1.3); glow.position.y = 0.52; pearl.add(glow);
      pearl.userData = { orb, shine, glow }; scene.add(pearl); }

    // ── Old Ink: a big purple octopus with a bulbous head, big eyes and eight swaying arms ──
    const inkAt = K.TOP, OSC = 0.8;               // (he sits on the pearl, in the middle of the chamber)
    const octo = (() => {
        const g = new T.Group();
        const head = Y.prop([{ geo: G.sph, color: C.ink, s: [1.7, 2.1, 1.7], p: [0, 1.5, 0] }, { geo: G.sph, color: C.inkLight, s: [1.2, 1.1, 1.2], p: [0, 0.75, 0.38] },
            ...[[0.5, 2.2, 0.35, 0.26], [-0.45, 2.45, 0.1, 0.2], [0.1, 2.7, -0.3, 0.24], [-0.15, 2.0, -0.62, 0.2], [0.6, 1.8, -0.35, 0.18]].map(([x, y, z, r]) => ({ geo: G.sphLow, color: C.inkSpot, p: [x, y, z], s: r, ink: false }))], { thick: 0.09 });
        g.add(head); const lids = [], pupils = [];
        const eyes = [-1, 1].map(k => {
            const e = new T.Group(), ball = Y.part(G.sph, C.white, 0.06); ball.scale.setScalar(0.66); e.add(ball);
            const iris = new T.Mesh(G.sph, basic(0xffd23a)); iris.scale.set(0.34, 0.34, 0.2); iris.position.z = 0.3; e.add(iris);
            const pu = new T.Mesh(G.sph, basic(0x1a1024)); pu.scale.set(0.14, 0.3, 0.12); pu.position.z = 0.37; e.add(pu); pupils.push({ pu, iris });
            const lid = Y.part(G.sph, C.ink, 0.05); lid.scale.set(0.72, 0.72, 0.72); lid.position.set(0, 0.03, 0); e.add(lid); lids.push(lid);
            e.position.set(k * 0.62, 1.55, 0.78); g.add(e); return e;
        });
        const brows = [-1, 1].map(k => { const b = Y.part(G.box, 0x4a1d9a, 0.03); b.scale.set(0.62, 0.14, 0.2); b.position.set(k * 0.62, 2.0, 0.86); g.add(b); return b; });
        const mouth = Y.part(G.sphLow, 0x2b0f55, 0.0); mouth.scale.set(0.5, 0.18, 0.16); mouth.position.set(0, 0.95, 1.0); g.add(mouth);
        // eight tapered arms, rebuilt each frame so they can sway and curl
        const arms = Array.from({ length: 8 }, (_, i) => {
            const nS = 16, nR = 8, mk = () => { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array((nS + 1) * nR * 3), 3)); geo.setAttribute('normal', new T.BufferAttribute(new Float32Array((nS + 1) * nR * 3), 3)); const idx = []; for (let s = 0; s < nS; s++) for (let r = 0; r < nR; r++) { const a = s * nR + r, b = s * nR + (r + 1) % nR, c2 = (s + 1) * nR + r, d = (s + 1) * nR + (r + 1) % nR; idx.push(a, b, c2, b, d, c2); } geo.setIndex(idx); return geo; };
            const geo = mk(), lineGeo = mk(), body = new T.Mesh(geo, Y.toon(i % 2 ? C.ink : 0x8a52f0)), line = new T.Mesh(lineGeo, Y.ink); body.frustumCulled = line.frustumCulled = false; line.renderOrder = -1; g.add(body); g.add(line);
            return { geo, lineGeo, nS, nR, body, phi: (i / 8) * Math.PI * 2 + 0.2 };
        });
        scene.add(g); return { g, head, eyes, lids, pupils, brows, mouth, arms, blink: 0, nextBlink: 2 };
    })();
    // dizzy stars over his head
    const inkStars = new T.Group(); for (let i = 0; i < 4; i++) { const sp = new T.Mesh(new T.OctahedronGeometry(0.2, 0), basic(0xfde047)); inkStars.add(sp); } inkStars.visible = false; octo.g.add(inkStars);
    const slamRing = new T.Mesh(G.ring, basic(0xff3b3b, { transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })), slamFill = new T.Mesh(G.disc, basic(0xff3b3b, { transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide }));
    slamRing.visible = slamFill.visible = false; scene.add(slamRing); scene.add(slamFill);
    function updateArm(a, t, i, mad, sl, flat = 0) {
        const { geo, lineGeo, nS, nR } = a, slamming = sl && sl.arm === i, phi = slamming ? sl.phi : a.phi, pos = geo.attributes.position, nor = geo.attributes.normal, lp = lineGeo.attributes.position;
        const out = new T.Vector3(Math.sin(phi), 0, Math.cos(phi)), side = new T.Vector3(Math.cos(phi), 0, -Math.sin(phi)), up = new T.Vector3(0, 1, 0);
        const pts = []; const sway = Math.sin(t * 1.1 + i * 1.3) * 0.5 * (1 - flat), lift = (mad ? 1.2 : 0) * (1 - flat);
        for (let s = 0; s <= nS; s++) { const u = s / nS; let rho = 0.8 + u * 1.35, sw = Math.sin(u * 3 + t * 1.4 + i) * 0.35 + sway * u, h = 0.12 + Math.pow(u, 2) * (0.9 + 0.3 * Math.sin(t * 1.7 + i * 2)) * (1 - flat * 0.9) + u * u * 1.4 * (1 - flat) + u * lift;
            if (slamming) { rho += (Math.max(0.8, u * sl.d) - rho) * sl.ext; sw *= 1 - sl.ext; h += (0.12 + sl.lift * 3.4 * Math.sin(Math.PI * Math.min(1, u * 1.05)) - h) * sl.ext; }
            pts.push(new T.Vector3().addScaledVector(out, rho).addScaledVector(side, sw).addScaledVector(up, h)); }
        const n = new T.Vector3(), b = new T.Vector3(), tg = new T.Vector3();
        for (let s = 0; s <= nS; s++) {
            tg.subVectors(pts[Math.min(nS, s + 1)], pts[Math.max(0, s - 1)]).normalize(); n.crossVectors(tg, up); if (n.lengthSq() < 1e-4) n.set(1, 0, 0); n.normalize(); b.crossVectors(tg, n).normalize();
            const r = 0.5 * Math.pow(1 - s / nS, 0.8) + 0.11;
            for (let k = 0; k < nR; k++) { const an = (k / nR) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an), idx = (s * nR + k) * 3;
                const nx = n.x * cs + b.x * sn, ny = n.y * cs + b.y * sn, nz = n.z * cs + b.z * sn;
                pos.array[idx] = pts[s].x + nx * r; pos.array[idx + 1] = pts[s].y + ny * r; pos.array[idx + 2] = pts[s].z + nz * r; nor.array[idx] = nx; nor.array[idx + 1] = ny; nor.array[idx + 2] = nz;
                lp.array[idx] = pts[s].x + nx * (r + 0.04); lp.array[idx + 1] = pts[s].y + ny * (r + 0.04); lp.array[idx + 2] = pts[s].z + nz * (r + 0.04); }
        }
        pos.needsUpdate = nor.needsUpdate = lp.needsUpdate = true;
    }

    // ── The crab and its tools ───────────────────────────────────────────────
    const crab = kit.crab(kit.skin); scene.add(crab.g);
    const shade = basic(0x000000, { transparent: true, opacity: 0.26, depthWrite: false });
    const shadow = new T.Mesh(new T.CircleGeometry(0.5, 16), shade); shadow.geometry.rotateX(-Math.PI / 2); scene.add(shadow);
    const coconut = () => Y.prop([{ geo: G.sph, color: C.nut, s: 0.62 }, { geo: G.sph, color: C.nutDark, p: [0, 0.2, 0], s: [0.4, 0.28, 0.4], ink: false }, { geo: G.sphLow, color: 0x2a190c, p: [0.12, 0.05, 0.28], s: 0.07, ink: false }, { geo: G.sphLow, color: 0x2a190c, p: [-0.12, 0.05, 0.28], s: 0.07, ink: false }, { geo: G.sphLow, color: 0x2a190c, p: [0, -0.08, 0.3], s: 0.07, ink: false }], { thick: 0.05 });
    const held = coconut(); held.visible = false; scene.add(held);
    const aimRing = new T.Mesh(G.ring, basic(0xffe45a, { transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide })); aimRing.visible = false; scene.add(aimRing);
    const dots = Array.from({ length: 30 }, () => { const d = new T.Mesh(G.dot, basic(0xffffff, { transparent: true, opacity: 0.85 })); d.visible = false; scene.add(d); return d; });
    const bankMark = new T.Mesh(new T.OctahedronGeometry(0.3, 0), basic(0xffe45a)); bankMark.visible = false; scene.add(bankMark);
    const nuts = new Map();
    // ── The gull: a plump, grumpy seagull ────────────────────────────────────
    const gull = (() => {
        const g = new T.Group(), body = new T.Group(); g.add(body);
        body.add(Y.prop([{ geo: G.sph, color: C.gull, s: [0.95, 0.8, 1.35] }, { geo: G.sph, color: C.gullGrey, s: [0.9, 0.5, 1.1], p: [0, 0.2, -0.08] }, { geo: G.coneLow, color: C.gullGrey, p: [0, 0.05, -0.78], r: [-1.2, 0, 0], s: [0.6, 0.5, 0.18] },
            { geo: G.coneLow, color: C.gullTip, p: [0, 0.05, -0.98], r: [-1.2, 0, 0], s: [0.42, 0.18, 0.1] }, { geo: G.cylLow, color: C.beak, p: [-0.16, -0.5, 0.12], s: [0.07, 0.3, 0.07] }, { geo: G.cylLow, color: C.beak, p: [0.16, -0.5, 0.12], s: [0.07, 0.3, 0.07] }], { thick: 0.085 }));
        const head = new T.Group(); head.position.set(0, 0.34, 0.66); body.add(head);
        head.add(Y.part(G.sph, C.gull, 0.055)); head.children[0].scale.setScalar(0.62);
        const eyeW = [-1, 1].map(k => { const e = new T.Group(), w = Y.part(G.sph, C.white, 0.04); w.scale.setScalar(0.27); e.add(w); const pu = new T.Mesh(G.sph, basic(0x1a1024)); pu.scale.setScalar(0.12); pu.position.z = 0.1; e.add(pu); e.position.set(k * 0.2, 0.1, 0.22); head.add(e); return { e, pu }; });
        const brows = [-1, 1].map(k => { const b = Y.part(G.box, 0x6b7388, 0.02); b.scale.set(0.24, 0.06, 0.08); b.position.set(k * 0.2, 0.3, 0.25); head.add(b); return b; });
        const beakUp = Y.part(G.coneLow, C.beak, 0.04), beakDn = Y.part(G.coneLow, 0xff8a00, 0.035);
        beakUp.scale.set(0.2, 0.46, 0.14); beakUp.rotation.x = Math.PI / 2; beakUp.position.set(0, 0.0, 0.5); beakDn.scale.set(0.16, 0.36, 0.1); beakDn.rotation.x = Math.PI / 2; beakDn.position.set(0, -0.08, 0.46); head.add(beakUp); head.add(beakDn);
        const wings = [-1, 1].map(k => {
            const w = new T.Group(), inner = Y.part(G.sph, C.gull, 0.05); inner.scale.set(1.0, 0.16, 0.62); inner.position.x = k * 0.5; w.add(inner);
            const tipG = new T.Group(); tipG.position.x = k * 1.02; const tip = Y.part(G.sph, C.gullGrey, 0.05); tip.scale.set(0.9, 0.12, 0.5); tip.position.x = k * 0.4; tipG.add(tip);
            const black = Y.part(G.sphLow, C.gullTip, 0.03); black.scale.set(0.3, 0.1, 0.4); black.position.x = k * 0.82; tipG.add(black); w.add(tipG); w.position.set(k * 0.42, 0.18, 0.05); body.add(w); return { w, tipG, k };
        });
        const loot = coconut(); loot.scale.setScalar(0.8); loot.position.set(0, -0.72, 0.28); body.add(loot);
        const star = new T.Group(); for (let i = 0; i < 3; i++) { const s = new T.Mesh(G.sphLow, basic(0xffe45a)); s.scale.setScalar(0.16); star.add(s); } star.position.y = 0.9; body.add(star);
        g.scale.setScalar(1.45); scene.add(g); return { g, body, head, eyeW, brows, beakUp, beakDn, wings, loot, star, blink: 0, nextBlink: 1.5 };
    })();
    const gullShade = new T.Mesh(G.disc, shade), gullRing = new T.Mesh(G.ring, basic(0xff3b3b, { transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide })); scene.add(gullShade); scene.add(gullRing);
    // Sparks.
    const N = 240, pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3).fill(9999), 3)); pg.setAttribute('color', new T.BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = new T.Points(pg, new T.PointsMaterial({ size: 0.26, vertexColors: true, transparent: true, depthWrite: false })); sparks.frustumCulled = false; scene.add(sparks);
    const pool = Array.from({ length: N }, () => ({ life: 0, v: [0, 0, 0] })); let next = 0;
    const burst = (o, color, n, speed) => {
        const pos = pg.attributes.position, col = pg.attributes.color, c = new T.Color(color), up = o.clone().normalize();
        for (let i = 0; i < n; i++) { const k = next = (next + 1) % N, d = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().addScaledVector(up, 0.8).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8)); pool[k].life = 0.5 + Math.random() * 0.4; pool[k].v = [d.x, d.y, d.z]; pos.setXYZ(k, o.x, o.y, o.z); col.setXYZ(k, c.r, c.g, c.b); }
        col.needsUpdate = true;
    };

    let pitch = 0, shelfK = 0, s = K.create(level), t = 0, charge = -1, cheer = 0, camP = null, shake = 0, doneAt = 0, told = false, disposed = false, intro = 0, camStart = null, snap = false, inkMad = 0, bristle = 0, downT = 0, hurtFlash = 0, swat = 0;

    function events(evs) {
        for (const e of evs) {
            if (e.type === 'thud') hooks.sfx('dice_land');
            else if (e.type === 'plop') { burst(at3(e.p, 0.2), 0x9bd8ff, 14, 3); hooks.sfx('boost'); }
            else if (e.type === 'bank') { burst(at3(e.p, e.nut.h), 0xffffff, 8, 3); hooks.sfx('tick'); }
            else if (e.type === 'pick') { burst(at3(e.nut.p, 0.4), 0xffe9b0, 8, 2.4); hooks.sfx('tick'); hooks.buzz(6); }
            else if (e.type === 'land' && e.onRock) { burst(at3(s.crab.p, K.ROCK_H), 0xd9e4ff, 8, 2.5); hooks.sfx('dice_land'); }
            else if (e.type === 'bounce') { burst(at3(e.nut.p, 0.5), 0xfff08a, 16, 4); hooks.sfx('land_good'); hooks.buzz(12); cheer = 0.3; }
            else if (e.type === 'trick') { burst(at3(s.crab.p, e.h), 0xffffff, 30, 6); hooks.sfx('win'); hooks.pop(at3(s.crab.p, e.h + 1), '✨ TRICK SHOT!'); cheer = 0.5; }
            else if (e.type === 'plug') { burst(at3(e.vent.p, 0.4), 0x9bffb0, 26, 5); hooks.sfx('coin_gain'); hooks.buzz([12, 20, 30]); hooks.say(e.now ? `🫧 VENT ${e.now.id} IS BLOWING!` : '🫧 PLUGGED', '#86efac'); hooks.pop(at3(e.vent.p, 1.4), e.now ? `VENT ${e.now.id} BLOWS` : 'PLUGGED'); }
            else if (e.type === 'calm') { hooks.hint(`VENT ${e.vent.id} IS QUIET: ONLY ONE VENT BLOWS, AND IT'S VENT ${e.blowing ? e.blowing.id : '?'}`, 3.2); hooks.sfx('tick'); }
            else if (e.type === 'lift') { burst(at3(e.vent.p, 0.3), 0xdff6ff, 24, 5); hooks.sfx('boost'); hooks.buzz([15, 20, 40]); hooks.pop(at3(e.vent.p, 1.6), 'WHOOSH! STEER OVER THE CLIFF'); cheer = 0.6; }
            else if (e.type === 'lost') { burst(at3(e.p, 0.3), 0xc084fc, 14, 4); hooks.sfx('land_bad'); hooks.pop(at3(e.p, 1), e.why === 'urchin' ? 'SPIKED! IT WASHES UP AT THE PALM' : 'LOST'); }
            else if (e.type === 'washed') { burst(at3(e.nut.p, 0.3), 0x9bd8ff, 10, 3); hooks.pop(at3(e.nut.p, 1), '🥥 BACK AT THE PALM'); }
            else if (e.type === 'target') { const v = targets.find(x => x.tg === e.target); if (v) v.hit = 1; burst(at3(e.target.p, 1.1), 0x4ade80, 26, 5); hooks.sfx('coin_gain'); hooks.buzz([10, 20, 30]); hooks.say(e.secs ? `🎯 BULLSEYE! ${e.secs} SECONDS: RUN!` : '🎯 BULLSEYE! THE GATE IS OPEN', '#86efac'); }
            else if (e.type === 'press') { hooks.sfx('shield'); hooks.buzz(10); hooks.pop(at3(e.plate.p, 0.8), 'GATE OPEN'); }
            else if (e.type === 'release') { hooks.sfx('tick'); hooks.pop(at3(e.plate.p, 0.8), 'GATE SHUT AGAIN'); }
            else if (e.type === 'gull-up') hooks.hint('🐦 THE GULL HAS SEEN YOU: WATCH ITS SHADOW', 2.4);
            else if (e.type === 'gull-dive') { hooks.sfx('boost'); hooks.buzz([20, 20]); hooks.hint('🐦 DIVING! MOVE, THEN JUMP ON IT AS IT LANDS', 2.2); }
            else if (e.type === 'gull-miss') hooks.pop(at3(s.gull.p, 1.4), 'MISSED! JUMP ON IT NOW');
            else if (e.type === 'steal') { burst(at3(s.crab.p, 0.8), 0xffffff, 20, 4); hooks.sfx('land_bad'); hooks.buzz([30, 30, 30]); hooks.say('🐦 IT STOLE A COCONUT!', '#fca5a5'); shake = 0.3; }
            else if (e.type === 'stomp') { burst(at3(s.gull.p, 0.6), 0xffffff, 30, 5); hooks.sfx('land_good'); hooks.buzz([15, 20, 40]); hooks.pop(at3(s.gull.p, 1.3), '🐦 BONK!'); cheer = 0.4; }
            else if (e.type === 'stun') { burst(at3(s.gull.p, 0.6), 0xfff08a, 16, 4); if (e.by === 'nut') { hooks.sfx('land_good'); hooks.pop(at3(s.gull.p, 1.3), '🥥 BONK!'); } }
            else if (e.type === 'drop') hooks.pop(at3(e.nut.p, 1), 'IT DROPPED THE COCONUT');
            else if (e.type === 'check') { burst(at3(e.p, 1), 0x4ade80, 22, 4); hooks.sfx('land_good'); hooks.buzz(10); hooks.pop(at3(e.p, 1.6), '🚩 CHECKPOINT'); if (slide && slide.earn === e.i) hooks.hint('🪜 THE ROPE LADDER ON THE SLIDE AT THE BACK IS DOWN: A WAY BACK UP IF YOU FALL', 3.5); }
            else if (e.type === 'ouch' || e.type === 'peck') { hooks.sfx('land_bad'); hooks.buzz([30, 30, 30]); hooks.hint(`${e.type === 'peck' ? 'PECKED! NO COCONUT TO STEAL' : 'OUCH! SPIKES'} · BACK AT THE ${e.at > 0 ? 'FLAG' : 'START'}`, 2.2); shake = 0.4; snap = true; bristle = 1; }
            else if (e.type === 'ink-wake') { hooks.sfx('boost'); hooks.buzz([20, 20, 20]); hooks.say('🐙 OLD INK WAKES!', '#c4b5fd'); hooks.hint('🔴 STEP OUT OF THE RED RING, OR JUMP · 🥥 JUST AFTER HE SLAMS, HIS HEAD IS OPEN: THROW!', 5); inkMad = 1; }
            else if (e.type === 'ink-slam') { burst(at3(e.p, 0.3), 0xff8a8a, 22, 5); hooks.sfx('land_bad'); hooks.buzz(e.hit ? [40, 30, 40] : 14); shake = Math.max(shake, e.hit ? 0.5 : 0.25); hooks.pop(at3(K.TOP, 3.4), '🎯 NOW! HIS HEAD IS OPEN'); }
            else if (e.type === 'ink-ouch') { hooks.hint(e.touch ? 'DON\'T TOUCH HIM! THROW COCONUTS AT HIS HEAD' : 'SLAMMED! KEEP MOVING, OR JUMP AS IT LANDS', 2); snap = true; }
            else if (e.type === 'ink-rest') hooks.pop(at3(K.TOP, 3.2), 'CATCHING HIS BREATH: THROW AT HIS HEAD');
            else if (e.type === 'ink-block') { burst(at3(e.p, 1.2), 0xffffff, 10, 3); hooks.sfx('tick'); hooks.pop(at3(e.p, 1.6), e.why === 'hurt' ? 'HE IS SHAKEN: WAIT' : 'SWATTED! THROW JUST AFTER HE SLAMS'); swat = 0.4; }
            else if (e.type === 'ink-hit') { burst(at3(e.p, e.h), 0xffe45a, 36, 6); hooks.sfx('coin_gain'); hooks.buzz([20, 20, 40]); hooks.pop(at3(e.p, e.h + 1), e.hp > 0 ? `🥥 HIT! ${e.hp} TO GO` : '🥥 KNOCKED OUT!'); hurtFlash = 1; shake = Math.max(shake, 0.4); cheer = 0.6; }
            else if (e.type === 'ink-down') { burst(at3(K.TOP, 1.5), 0xc4b5fd, 50, 7); hooks.sfx('win'); hooks.buzz([30, 30, 30, 30, 120]); hooks.say('🐙 OLD INK IS DOWN!', '#fde047'); hooks.hint('THE PLATE\'S COCONUT HOLDS THE FENCE OPEN: GO TAKE THE PEARL', 6); }
            else if (e.type === 'pile') burst(at3(e.nut.p, 0.5), 0xffe9b0, 10, 2.5);
            else if (e.type === 'crack') { burst(at3(e.p, 1.5), 0xe8c27a, 22, 4); hooks.sfx('dice_land'); hooks.buzz(14); shake = Math.max(shake, 0.15); const v = crackWalls.find(x => x.w === e.w); if (v) v.shake = 1; hooks.pop(at3(e.p, 2.6), `CRACK! ${e.left} MORE`); }
            else if (e.type === 'break') { for (let k = 0; k < 3; k++) burst(at3(e.p, 1 + k), 0xe8c27a, 30, 6); hooks.sfx('land_bad'); hooks.buzz([20, 30, 40]); shake = Math.max(shake, 0.4); hooks.say('💥 THE WALL IS DOWN!', '#fde68a'); }
            else if (e.type === 'vine-full') hooks.hint('🌿 YOUR CLAWS ARE FULL: THROW YOUR COCONUTS DOWN TO CLIMB', 2.6);
            else if (e.type === 'climb') { hooks.sfx('tick'); }
            else if (e.type === 'push') hooks.hint('📦 PUSHING THE SAND BLOCK: GET IT AGAINST THE WALL AND CLIMB ON', 2.6);
            else if (e.type === 'sink') { burst(at3(s.crab.p, 0.2), 0x7ec8ff, 26, 4); hooks.sfx('land_bad'); hooks.buzz([30, 30]); hooks.hint('SPLASH! THE MOAT IS DEEP · BACK AT THE FLAG', 2.2); snap = true; }
            else if (e.type === 'gold') { burst(at3(e.p, e.h + 0.5), 0xffd23a, 36, 5); hooks.sfx('win'); hooks.buzz([15, 20, 30]); hooks.pop(at3(e.p, e.h + 1.4), `🐚 GOLDEN SHELL ${s.gold.length}/${(level.gold || []).length}`); cheer = 0.5; }
            else if (e.type === 'nudge') burst(at3(e.nut.p, 0.4), 0xffffff, 8, 2);
            else if (e.type === 'timeout') { hooks.sfx('tick'); hooks.pop(at3(s.crab.p, 2), 'THE GATE SHUT AGAIN'); }
            else if (e.type === 'pad') { const v = padMeshes.find(x => K.dist(x.k.p, e.p) < x.k.r + 0.3); if (v) v.wob = 1; burst(at3(e.p, 0.4), 0xff8ad8, 12, 3.5); hooks.sfx('boost'); }
            else if (e.type === 'knock') { burst(at3(e.p, e.h), 0xffe9b0, 22, 4); hooks.sfx('coin_gain'); hooks.pop(at3(e.p, e.h + 1), '🥥 KNOCKED LOOSE!'); }
            else if (e.type === 'unstick') { burst(at3(e.nut.p, e.nut.h), 0xffffff, 12, 3); hooks.sfx('tick'); hooks.hint('🥥 YOU TOOK THE COCONUT BACK: ITS GATE SHUTS AGAIN', 2.2); }
            else if (e.type === 'won') { burst(at3(level.goal, 1.5), 0xff8ad8, 50, 7); burst(at3(level.goal, 1.5), 0xffd84a, 40, 6); hooks.sfx('win'); hooks.buzz([30, 30, 30, 30, 120]); cheer = 1.2; inkMad = 2; doneAt = t + 1.8; }
        }
    }

    const tmp = new T.Vector3();
    function draw(dt) {
        const c = s.crab, g = s.gull, cn = K.count(s), cw = at3(c.p, c.h + 0.5);
        // Gates sink as they open; everything else just stands.
        walls.forEach(v => {
            v.k += ((K.up(s, v.w) ? 0 : 1) - v.k) * Math.min(1, dt * 8);
            if (Math.abs(v.k - v.last) > 0.002) { v.last = v.k; v.rebuild(1 - v.k * 0.96); v.inst.forEach(i => i.done()); }
        });
        // The water: streaks sliding east and starting again; the dam's falls shimmer.
        streaks.forEach(q => { q.lon += (cur.speed / (2 * Math.PI * R * Math.sin(q.d / R))) * 360 * dt * q.s * 0.9; if (q.lon > q.lon1) { q.lon = q.lon0; q.d = cur.r0 + 0.2 + Math.random() * (cur.r1 - cur.r0 - 0.4); }
            const p = around(TOP, q.d, q.lon); put(q.m, p, tangent(p, cross(TOP, p)), 0.1); const edge = Math.min(q.lon - q.lon0, q.lon1 - q.lon) / 12; q.m.scale.set(1, 1, 0.6 + q.s * 0.7); q.m.visible = edge > 0.02 && !(K.rockUnder(s, p)); });
        foam.forEach(f => { f.m.scale.y = 2.0 + Math.sin(t * 6 + f.i * 1.3) * 0.25; f.m.material.opacity = 0.55 + 0.2 * Math.sin(t * 5 + f.i); });
        // Urchins breathe, and bristle and stare when the crab comes close.
        bristle = Math.max(0, bristle - dt);
        urchins.forEach((v, i) => {
            const d = K.dist(v.u.p, c.p), near = d < 3.6 ? 1 - d / 3.6 : 0, k = 1 + Math.sin(t * 2 + v.ph) * 0.04 + near * 0.12 + bristle * 0.1;
            put(v.g, v.u.p, toward(v.u.p, c.p), fl(v.u.p) + 0.3 + Math.sin(t * 1.6 + v.ph) * 0.04); v.g.scale.setScalar(v.u.r * 1.35 * k);
            v.eyes.forEach(e => { e.children[1].position.x = 0; e.scale.y = 1 - near * 0.35; });
        });
        rocks.forEach(v => put(v.g, v.k.p, [1, 0, 0], 0.05));
        const blow = K.blowing(s);
        vents.forEach(vn => {
            put(vn.g, vn.v.p, null, 0.1 + vn.base); put(vn.halo, vn.v.p, null, 0.12 + vn.base);
            const plugged = !!s.plug[vn.v.id], active = blow === vn.v && !plugged;
            vn.halo.material.opacity = active ? 0.6 + 0.4 * Math.abs(Math.sin(t * 4)) : plugged ? 0.12 : 0.28;
            vn.col.visible = active && vn.lift > 0;
            if (vn.col.visible) { put(vn.col, vn.v.p, null, vn.base + vn.lift / 2); vn.col.scale.set(vn.v.r * 0.95, vn.lift, vn.v.r * 0.95); vn.col.material.opacity = 0.16 + 0.05 * Math.sin(t * 5); }
            vn.bands.forEach(b => { b.t = (b.t + dt * 0.4) % 1; b.b.visible = active; if (active) { put(b.b, vn.v.p, null, vn.base + 0.2 + b.t * vn.lift); b.b.scale.setScalar(vn.v.r * (0.9 + 0.3 * b.t)); b.b.material.opacity = 0.55 * (1 - b.t); } });
            vn.bubbles.forEach(b => { b.t = (b.t + dt * (active ? 0.5 : 0.18)) % 1; const rise = b.t * (active ? (vn.lift ? 3.4 : 1.8) : 0.5); b.b.visible = active || (!plugged && !vn.lift); b.b.position.copy(at3(vn.v.p, vn.base + 0.3 + rise)); tmp.copy(V(cross(vn.v.p, [0, 1, 0]))).normalize(); b.b.position.addScaledVector(tmp, Math.sin(t * 5 + b.t * 9) * 0.14 * vn.v.r); b.b.scale.setScalar((0.1 + b.t * 0.16) * (active ? 1.4 : 1)); });
        });
        checks.forEach(v => { put(v.g, v.p, [1, 0, 0], fl(v.p)); v.cloth.material = s.cp >= v.i ? v.on : v.off; v.cloth.rotation.y = Math.sin(t * 4 + v.i) * 0.25; });
        palm.top.rotation.z = Math.sin(t * 1.3) * 0.05; palm.top.rotation.x = Math.cos(t * 1.1) * 0.04;
        plates.forEach(v => { const on = !!s.held[[].concat(v.pl.gate)[0]]; v.top.material = on ? v.on : v.off; const ph = fl(v.pl.p); put(v.g, v.pl.p, null, ph + (on ? -0.02 : 0.02)); put(v.halo, v.pl.p, null, ph + 0.12); });
        targets.forEach(v => { v.hit = Math.max(0, v.hit - dt * 1.5); const ta = K.targetAt(s, v.tg); put(v.g, ta.p, toward(ta.p, c.p), ta.h - 1.1 - (v.tg.h ? v.tg.h - 1.1 : 0)); v.face.rotation.z = v.hit * 8; v.face.scale.setScalar(1 + v.hit * 0.4); const op = s.open[[].concat(v.tg.gate)[0]]; const hex = op ? (typeof op === 'number' && op < 2 && Math.sin(t * 20) > 0 ? 0xffe45a : 0x4ade80) : 0xff4d4d; v.mats[0].color.setHex(hex); v.mats[2].color.setHex(hex); });
        // The pearl and Old Ink: he watches the crab, blinks, narrows his eyes when it comes close, and rears up when the pearl is taken.
        inkMad = Math.max(0, inkMad - dt);
        put(pearl, TOP, [1, 0, 0], fl(TOP)); pearl.userData.orb.position.y = 0.95 + Math.sin(t * 2) * 0.08 + (s.won ? Math.min(2, (t - (doneAt - 1.8)) * 1.5) : 0); pearl.userData.shine.position.y = pearl.userData.orb.position.y + 0.23; pearl.userData.orb.rotation.y = t; pearl.userData.glow.material.opacity = 0.25 + 0.15 * Math.sin(t * 3);
        const bs = s.boss, bst = bs ? bs.state : 'none', alive = bst !== 'down';
        hurtFlash = Math.max(0, hurtFlash - dt * 2.5); downT = bst === 'down' ? Math.min(1.6, downT + dt) : 0;
        const dk = Math.min(1, downT / 1.6), dizzy = false, hurt = bst === 'hurt';
        pearl.visible = !bs || bst === 'down' || s.won;
        octo.g.visible = dk < 1 && !!level.boss;
        put(octo.g, inkAt, toward(inkAt, c.p), fl(inkAt) - dk * 3.2); octo.g.scale.setScalar(OSC * (1 - dk * 0.7) * (1 + Math.sin(t * 1.5) * 0.025 + (inkMad > 0 ? 0.25 * Math.abs(Math.sin(t * 14)) : 0) + (hurt ? 0.12 * Math.sin(bs.t * 34) : 0) + (bst === 'wind' ? 0.05 * Math.min(1, bs.t) : 0)));
        const open = bst === 'recover'; swat = Math.max(0, swat - dt);
        octo.head.material.emissive.setRGB(0.55 * hurtFlash + (open ? 0.35 + 0.2 * Math.sin(t * 14) : 0), 0.45 * hurtFlash + (open ? 0.3 : 0), 0.4 * hurtFlash);
        inkStars.visible = dizzy || hurt; inkStars.position.y = 3.3; inkStars.children.forEach((sp, i) => { const a = t * 4 + i * Math.PI / 2; sp.position.set(Math.cos(a) * 0.9, Math.sin(t * 3 + i) * 0.12, Math.sin(a) * 0.9); sp.rotation.y = t * 5; });
        // the slam: his nearest arm goes up and over the place, then comes down on it; a red ring fills as it is about to land
        let sl = null; slamRing.visible = slamFill.visible = false;
        if (bs && (bst === 'wind' || bst === 'recover') && bs.tx) {
            octo.g.updateMatrixWorld(); octo.g.worldToLocal(tmp.copy(at3(bs.tx, 0.1)));
            const phi = Math.atan2(tmp.x, tmp.z), dT = Math.hypot(tmp.x, tmp.z); let arm = 0, bd = 999; const lt = K.lonOf(bs.tx);
            octo.arms.forEach((a, i) => { const d = Math.abs(((lt - K.armLon(s, i) + 540) % 360) - 180); if (d < bd) { bd = d; arm = i; } });
            const dur = K.BOSS.wind[Math.min(2, bs.round)], prog = bst === 'wind' ? Math.min(1, bs.t / dur) : 1;
            sl = bst === 'wind' ? { arm, phi, d: dT, ext: 0.35 + 0.6 * prog, lift: 1 } : { arm, phi, d: dT, ext: bs.t < K.BOSS.recover - 0.3 ? 1 : Math.max(0, (K.BOSS.recover - bs.t) / 0.3), lift: 0 };
            if (bst === 'wind') { slamRing.visible = slamFill.visible = true; put(slamRing, bs.tx, null, 0.12); put(slamFill, bs.tx, null, 0.11); slamRing.scale.setScalar(K.BOSS.hitR * (1 + 0.05 * Math.sin(t * 20))); slamFill.scale.setScalar(K.BOSS.hitR * prog); slamFill.material.opacity = 0.18 + 0.3 * prog; }
        }
        const dInk = K.dist(inkAt, c.p), near = Math.max(0, Math.min(1, 1 - (dInk - 1.5) / 4));
        octo.nextBlink -= dt; if (octo.nextBlink <= 0) { octo.blink = 0.18; octo.nextBlink = 2 + Math.random() * 3; } octo.blink = Math.max(0, octo.blink - dt);
        octo.g.updateMatrixWorld(); octo.g.worldToLocal(tmp.copy(cw)); const look = Math.hypot(tmp.x, tmp.z) || 1;
        octo.lids.forEach(l => { const close = octo.blink > 0 ? 1 : Math.min(0.7, 0.12 + near * 0.35 + (inkMad > 0 ? 0.4 : 0)); l.visible = close > 0.14; l.scale.set(0.74, 0.74 * close, 0.74); l.position.y = 0.33 - 0.3 * close; });
        octo.pupils.forEach(p => { p.pu.position.x = dizzy ? Math.cos(t * 9) * 0.12 : (tmp.x / look) * 0.08; p.pu.position.y = dizzy ? Math.sin(t * 9) * 0.12 : 0; p.iris.position.x = dizzy ? 0 : (tmp.x / look) * 0.05; });
        octo.brows.forEach((b, i) => { b.rotation.z = (i ? 1 : -1) * (0.15 + near * 0.45 + (inkMad > 0 ? 0.3 : 0)); b.position.y = 2.0 - near * 0.1; });
        octo.mouth.scale.set(0.5, 0.14 + (inkMad > 0 ? 0.25 : 0), 0.16);
        octo.arms.forEach((a, i) => {
            if (bs) { octo.g.updateMatrixWorld(); octo.g.worldToLocal(tmp.copy(at3(K.at(2, K.armLon(s, i)), 0.1))); a.phi = Math.atan2(tmp.x, tmp.z); }
            const flat = dk > 0 || hurt ? 1 : 0;
            updateArm(a, t, i, inkMad > 0 || bst === 'wind' || dk > 0 || (swat > 0 && i % 2 === 0), sl, flat);
        });

        if (slideLadder) { const want = slide.earn != null && s.cp >= slide.earn ? 1 : 0; slideLadder.k += (want - slideLadder.k) * Math.min(1, dt * 2); slideLadder.lad.scale.z = Math.max(0.02, slideLadder.k); slideLadder.lad.visible = slideLadder.k > 0.03; slideLadder.roll.scale.x = slideLadder.roll.scale.z = 0.35 * (1 - slideLadder.k * 0.7); }
        crackWalls.forEach(v => {
            const standing = K.up(s, v.w), dmg = s.dmg[v.w.id] || 0, near = K.dist(c.p, v.mid.p) < 5;
            v.grp.visible = standing; v.ring.visible = standing; v.shake = Math.max(0, v.shake - dt * 3);
            v.grp.position.set((Math.random() - 0.5) * v.shake * 0.2, 0, (Math.random() - 0.5) * v.shake * 0.2);
            v.glow.color.setHex(dmg ? 0xff3b1f : 0xff8a2a); v.glow.color.multiplyScalar(0.75 + 0.25 * Math.sin(t * (near ? 8 : 3)));
            v.ring.material.opacity = (near ? 0.5 : 0.25) + 0.25 * Math.sin(t * 5); v.ring.scale.setScalar(1.3 + 0.12 * Math.sin(t * 5));
            if (standing && near && !v.said) { v.said = true; hooks.hint('🧱 THAT SECTION OF WALL IS CRACKED: THROW COCONUTS AT IT', 3); }
        });
        (s.blocks || []).forEach((b, i) => put(blockMeshes[i], b.p, toward(b.p, K.TOP), K.floorAt({ ...s, blocks: [] }, b.p)));
        (s.logs || []).forEach((l, i) => { put(logMeshes[i], l.p, tangent(l.p, cross(K.TOP, l.p)), 0.05 + Math.sin(t * 2 + i) * 0.04); logMeshes[i].rotateY(Math.PI / 2); });
        (level.gold || []).forEach((gd, i) => { const v = goldMeshes[i]; v.g.visible = !s.gold.includes(i); if (v.g.visible) { put(v.g, gd.p, [1, 0, 0], (gd.h || 0) + 0.45 + Math.sin(t * 2.5 + i) * 0.1); v.sh.rotation.y = t * 2.2; v.halo.material.opacity = 0.25 + 0.15 * Math.sin(t * 4 + i); } });
        hangVis.forEach(v => { const n = s.nuts.find(x => x.state === 'hang'); v.rope.visible = !!n; if (n) { const top = n.h + 1.6; v.rope.scale.set(0.05, top - n.h, 0.05); put(v.rope, n.p, null, (top + n.h) / 2 + 0.2); } });
        padMeshes.forEach(v => { v.wob = Math.max(0, v.wob - dt * 3); v.g.scale.set(1 + v.wob * 0.15, 1 - v.wob * 0.4, 1 + v.wob * 0.15); });
        spots.forEach(v => {
            const on = K.dist(c.p, v.sp.p) < 0.8, done = !!s.open[v.sp.gate];
            v.ring.scale.setScalar(0.75 + 0.06 * Math.sin(t * (on ? 9 : 4))); v.g.visible = !done;
            v.dots.forEach((d, k) => { d.visible = !done; d.material.opacity = on ? 0.55 + 0.45 * Math.max(0, Math.sin(t * 6 - k * 0.6)) : 0.45; d.scale.setScalar(on ? 0.2 : 0.15); });
            if (on && !v.said && !done) { v.said = true; hooks.hint('🎯 THE THROW SPOT: AIM AT THE YELLOW BUMPER. THE AIM TURNS GREEN WHEN IT WILL HIT', 4); }
        });
        poolMeshes.forEach((v, i) => { v.rim.scale.setScalar(v.q.r * (1 + 0.02 * Math.sin(t * 2 + i))); });
        signals.forEach(v => {
            const on = v.kind === 'plate' ? !!s.held[v.g] : !!s.open[v.g], left = typeof s.open[v.g] === 'number' && v.sw.secs ? s.open[v.g] / v.sw.secs : 1, n = v.dots.length;
            v.dots.forEach((d, k) => { const lit = on && k / n < left; d.material.opacity = lit ? 0.7 + 0.3 * Math.max(0, Math.sin(t * 7 - k * 0.7)) : 0.5; d.scale.setScalar(lit ? 0.24 + 0.05 * Math.max(0, Math.sin(t * 7 - k * 0.7)) : 0.17); });
        });
        // Coconuts: lying, floating, flying, plugging a vent, stuck in the bullseye.
        const seen = new Set();
        for (const n of s.nuts) {
            seen.add(n.id);
            let v = nuts.get(n.id);
            if (!v) {
                v = coconut(); scene.add(v); nuts.set(n.id, v);
                // a gold arrow over a coconut that is lying or floating: drawn on top of everything, so it can always be found
                const ar = new T.Mesh(new T.ConeGeometry(0.34, 0.7, 4), new T.MeshBasicMaterial({ color: 0xfde047, depthTest: false, transparent: true, opacity: 0.95 }));
                ar.rotation.x = Math.PI; ar.renderOrder = 20; v.add(ar); v.userData.arrow = ar;
            }
            const ar = v.userData.arrow, loose = n.state === 'rest' || n.state === 'float';
            ar.visible = loose; if (loose) { ar.position.y = 1.5 + Math.sin(t * 4 + n.id) * 0.18; ar.rotation.y = t * 2; }
            const lift = n.state === 'fly' ? n.h : n.state === 'float' ? 0.16 + Math.sin(t * 3 + n.id) * 0.05 : n.state === 'plug' ? 0.3 + K.floorAt(s, n.p) : n.state === 'stuck' || n.state === 'hang' ? n.h : 0.2 + K.floorAt(s, n.p);
            put(v, n.p, n.d, lift); if (n.state === 'fly') v.rotateX(t * 9);
        }
        for (const [id, v] of nuts) if (!seen.has(id)) { scene.remove(v); nuts.delete(id); }

        // The crab.
        cheer = Math.max(0, cheer - dt);
        put(crab.g, c.p, c.face, c.h); put(shadow, c.p, c.face, 0.04 + K.floorAt(s, c.p)); shadow.scale.setScalar(Math.max(0.4, 1 - (c.h - K.floorAt(s, c.p)) * 0.1));
        kit.pose(crab, dt, c.moving && !c.air, Math.max(cheer > 0 ? 0.3 : 0, charge >= 0 ? 0.14 : 0));

        // The gull: its shadow and the red ring are the warning.
        gull.g.visible = !!g; gullShade.visible = gullRing.visible = false;
        if (g) {
            const flying = g.h > 0.05 || g.state === 'circle' || g.state === 'rise', stunned = g.state === 'stun', diving = g.state === 'dive' || g.state === 'land';
            const face = diving ? toward(g.p, g.tx || c.p) : g.state === 'circle' ? toward(g.p, c.p) : tangent(g.p, cross(TOP, g.p));
            put(gull.g, g.p, face, g.h + 0.78 + (flying ? 0 : Math.abs(Math.sin(t * 5)) * (g.state === 'walk' || g.state === 'flee' ? 0.1 : 0)));
            gull.body.rotation.x = diving ? 0.9 : g.state === 'rise' ? -0.35 : 0; gull.body.rotation.z = stunned ? Math.PI * 0.5 * Math.min(1, g.t * 4) : 0;
            const flap = flying ? Math.sin(t * 22) : stunned ? -0.9 : Math.sin(t * 2.5) * 0.08;
            gull.wings.forEach(({ w, tipG, k }) => { w.rotation.z = k * (0.15 + flap * 0.85); tipG.rotation.z = k * (flap * 0.55 - (flying ? 0 : 0.5)); });
            gull.nextBlink -= dt; if (gull.nextBlink <= 0) { gull.blink = 0.14; gull.nextBlink = 1.5 + Math.random() * 3; } gull.blink = Math.max(0, gull.blink - dt);
            const grumpy = diving || g.state === 'circle' || g.state === 'flee';
            gull.eyeW.forEach(({ e, pu }, i) => { e.scale.y = stunned ? 0.4 : gull.blink > 0 ? 0.15 : 1; pu.visible = !stunned; });
            gull.brows.forEach((b, i) => { b.rotation.z = (i ? 1 : -1) * (grumpy ? 0.55 : 0.12); b.position.y = grumpy ? 0.27 : 0.32; });
            const squawk = diving ? 0.2 + 0.1 * Math.sin(t * 30) : g.state === 'flee' ? 0.12 : 0.02; gull.beakDn.rotation.x = Math.PI / 2 + squawk * 2.2; gull.beakDn.position.y = -0.08 - squawk * 0.6;
            gull.head.rotation.y = flying ? 0 : Math.sin(t * 2.2) * 0.35; gull.head.position.y = 0.34 + (flying ? 0 : Math.sin(t * 5) * 0.03);
            gull.loot.visible = g.loot > 0; gull.star.visible = stunned; gull.star.rotation.y = t * 6; gull.star.children.forEach((sp, i) => sp.position.set(Math.cos(t * 5 + i * 2.1) * 0.5, 0, Math.sin(t * 5 + i * 2.1) * 0.5));
            gullShade.visible = g.h > 0.1; put(gullShade, g.p, null, 0.05); gullShade.scale.setScalar(Math.max(0.3, 0.75 - g.h * 0.06));
            const tell = g.state === 'circle' ? c.p : (g.state === 'dive' || g.state === 'land') && g.tx ? g.tx : null;
            if (tell) { gullRing.visible = true; put(gullRing, tell, null, 0.1); const k = g.state === 'dive' ? 1 - Math.min(1, g.t / K.GULL.dive) : 1; gullRing.scale.setScalar(K.GULL.hit * (1.1 + k * 0.7)); gullRing.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(t * (g.state === 'dive' ? 22 : 8))); }
        }

        // Winding up: the coconut overhead, and where it would come down.
        const k = charge >= 0 ? Math.min(1, charge) : -1;
        held.visible = k >= 0 && cn.held > 0; aimRing.visible = k >= 0 && cn.held > 0;
        if (k >= 0 && cn.held > 0) {
            put(held, c.p, c.face, c.h + 1.25); held.scale.setScalar(0.7 + k * 0.4);
            const a = K.aim(s, k);
            put(aimRing, a.p, null, 0.09 + K.floorAt(s, a.p)); aimRing.scale.setScalar(0.85 * (1 + Math.sin(t * 10) * 0.08));
            aimRing.material.color.setHex(a.hit ? 0x4ade80 : a.wet ? 0x7ee7ff : 0xffe45a); dots.forEach(d => d.material.color.setHex(a.hit ? 0x4ade80 : 0xffffff));
            dots.forEach((d, i) => { const q = a.path[i]; d.visible = !!q; if (q) d.position.copy(at3(q[0], q[1])); });
            bankMark.visible = !!a.bank; if (a.bank) { bankMark.position.copy(at3(a.bank[0], a.bank[1])); bankMark.scale.setScalar(1 + Math.sin(t * 12) * 0.25); }
        } else { dots.forEach(d => { d.visible = false; }); bankMark.visible = false; }

        // Sparks.
        const pos = pg.attributes.position;
        pool.forEach((q, i) => {
            if (q.life <= 0) return;
            q.life -= dt;
            if (q.life <= 0) { pos.setXYZ(i, 9999, 9999, 9999); return; }
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), l = Math.hypot(x, y, z) || 1;
            q.v[0] -= (x / l) * 7 * dt; q.v[1] -= (y / l) * 7 * dt; q.v[2] -= (z / l) * 7 * dt;
            pos.setXYZ(i, x + q.v[0] * dt, y + q.v[1] * dt, z + q.v[2] * dt);
        });
        pos.needsUpdate = true;

        // The camera: behind and above, higher when the crab is, swinging in from far out on a fresh go, steeper on the shelf.
        const dT = K.dist(c.p, TOP); shelfK += ((dT < 9.7 && dT > 5.0 ? 1 : 0) - shelfK) * Math.min(1, dt * 3);
        const up = V(c.p), f = V(c.f), want = up.clone().multiplyScalar(R + (9.6 + 3.2 * shelfK) * (1 + 0.4 * pitch) + c.h * 0.45).addScaledVector(f, -(8.6 - 3.6 * shelfK) * (1 - 0.35 * pitch));
        { // never inside a terrace: keep the camera above the ground (and the crab's own level) wherever it would be
          const cp = norm([want.x, want.y, want.z]), gh = Math.max(fl(cp), fl(norm(mix(c.p, cp, 0.5, 0.5))), fl(norm(mix(c.p, cp, 0.8, 0.2))), c.h);
          if (gh > c.h + 0.8) want.copy(up).multiplyScalar(R + gh + 7.5).addScaledVector(f, -2.2);        // (a cliff behind the crab: look down from above it instead)
          else if (want.length() < R + gh + 3.2) want.setLength(R + gh + 3.2); }
        if (snap && camP) { camP.copy(want); snap = false; }
        if (!camP) { camP = V(TOP).multiplyScalar(R + fl(TOP) + 4.5).addScaledVector(V(tangent(TOP, c.p)), -11); camStart = camP.clone(); intro = 3.2; }
        intro = Math.max(0, intro - dt);
        if (intro > 0 && intro < 1.9 && camStart) {          // the swoop from the pearl to the crab: over the planet, not through it
            const k = 1 - intro / 1.9, e = k * k * (3 - 2 * k), a0 = camStart.clone().normalize(), a1 = want.clone().normalize(), om = Math.acos(Math.max(-1, Math.min(1, a0.dot(a1)))) || 1e-6;
            const dir = a0.multiplyScalar(Math.sin((1 - e) * om) / Math.sin(om)).add(a1.multiplyScalar(Math.sin(e * om) / Math.sin(om))).normalize();
            camP.copy(dir).multiplyScalar(camStart.length() * (1 - e) + want.length() * e + 9 * Math.sin(Math.PI * e));
        } else if (intro <= 0) camP.lerp(want, dt ? Math.min(1, dt * 7) : 0);
        camera.position.copy(camP);
        shake = Math.max(0, shake - dt * 2.4);
        if (shake > 0 && dt) camera.position.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 0.5));
        const lookCrab = V(c.p).multiplyScalar(R + c.h * 0.4).addScaledVector(f, 1.8), lookPearl = V(TOP).multiplyScalar(R + fl(TOP) + 1), k3 = intro > 1.9 ? 1 : intro > 0 ? intro / 1.9 : 0;
        camera.up.copy(V(TOP).multiplyScalar(k3).addScaledVector(V(c.p), 1 - k3).addScaledVector(V(tangent(TOP, c.p)), 1.6 * k3 * (1 - k3)).normalize()); camera.lookAt(lookCrab.lerp(lookPearl, k3 * k3));
        sun.position.copy(camera.position).addScaledVector(V(cross(c.f, c.p)), 9).addScaledVector(V(c.p), 6); sun.target.position.set(0, 0, 0);
        const sz = renderer.getSize(new T.Vector2());
        if (Math.abs(camera.aspect - sz.x / sz.y) > 1e-3) { camera.aspect = sz.x / sz.y; camera.updateProjectionMatrix(); }
        renderer.render(scene, camera);
    }

    return {
        camera,
        frame(dt, stick, steps = 1) {
            if (disposed) return;
            t += dt;
            if (dt && !s.won) {
                if (charge >= 0) charge += dt / CHARGE_S;
                for (let i = 0; i < steps; i++) events(K.step(s, dt, stick));
            }
            if (s.won && !told && !doneAt) doneAt = t + 0.9;
            if (doneAt && t >= doneAt) { doneAt = 0; told = true; hooks.won(s); }
            draw(dt);
        },
        jump() { if (K.jump(s)) { hooks.sfx('swap'); hooks.buzz(8); return true; } return false; },
        /** The right thumb: turn the camera round the crab, and tilt it. */
        look(a, dpitch = 0) { if (a) K.turnView(s, a); pitch = Math.max(-0.9, Math.min(0.9, pitch + dpitch)); },
        /** The throw button: down winds up, up lets go. now: throw at once with that much charge. */
        hold(on, now = null) {
            if (s.won) return null;
            if (now != null) { charge = -1; if (s.crab.nuts < 1) return null; hooks.sfx('swap'); return K.throwNut(s, now); }
            if (on) { if (charge < 0) { if (s.crab.nuts < 1) { hooks.hint('NO COCONUT IN YOUR CLAWS: WALK INTO ONE TO PICK IT UP', 2); return null; } charge = 0; } return null; }
            if (charge < 0) return null;
            const kk = Math.min(1, charge); charge = -1;
            hooks.sfx('swap'); hooks.buzz(8);
            return K.throwNut(s, kk);
        },
        charging: () => (charge >= 0 ? Math.min(1, charge) : -1),
        restart() { s = K.create(level); charge = -1; camP = null; doneAt = 0; told = false; inkMad = 0; downT = 0; hurtFlash = 0; targets.forEach(v => { v.mats[0].color.setHex(0xff4d4d); v.mats[2].color.setHex(0xff4d4d); }); walls.forEach(v => { v.last = -1; }); },
        state: () => s,
        level,
        dispose() {
            disposed = true;
            scene.traverse(o => { if (o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { if (x !== Y.ink) x.dispose(); }); });
        },
    };
}
