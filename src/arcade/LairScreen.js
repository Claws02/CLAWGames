// ============================================================
// OLD INK'S LAIR — the 3D for a chamber (rules: LairLogic.js).
// Tiny Planet's screen (Planet.js) owns the renderer, the buttons and the
// cards; this builds one chamber's scene, steps it and draws it.
//
//   const lair = createLair(kit, chamber, hooks)
//     kit:   { T, renderer, crab(color), pose(crab, dt, moving, cheer, lift), skin }
//     hooks: { say(text, color), hint(text, secs), pop(vec3, text), sfx(name), buzz(pattern), won(state) }
//   lair.frame(dt, stick)     step and draw
//   lair.jump()               the jump button
//   lair.hold(on)             the throw button: down starts the wind-up, up throws
//   lair.restart()            the same chamber again
//   lair.state()              the LairLogic state (HUD, probes)
//   lair.dispose()
//
// Everything that can hurt is Old Ink's: the urchins' spikes, the current he
// stirs up, his gull. What can't is in plain colours. The warnings are on the
// ground: the current's streaks run the way it goes, the gull's shadow and a
// red ring say where it will land, the preview of a throw shows the bounce.
// ============================================================
import * as K from './LairLogic.js';
import { cross, mix, norm, tangent, toward, walk } from './PlanetLogic.js';

const CHARGE_S = 0.9;                       // how long a full wind-up takes
const GATE_COLOR = { eye: 0xe0569a, plate: 0xf5b82e };
const WALL_SHOW = { cliff: 2.4, slide: 0.5, cove: 1.5, step: 2, gate: 2.1 };      // how tall each kind of wall is drawn

export function createLair(kit, level, hooks) {
    const { T, renderer } = kit, R = K.R;
    const V = a => new T.Vector3(a[0], a[1], a[2]);
    const lam = (color, o = {}) => new T.MeshLambertMaterial({ color, flatShading: true, ...o });
    const basic = (color, o = {}) => new T.MeshBasicMaterial({ color, ...o });
    const m4 = new T.Matrix4();
    const at3 = (p, lift = 0) => V(p).multiplyScalar(R + lift);
    const put = (obj, p, fwd, lift = 0) => {
        const up = V(p), f = V(tangent(p, fwd || [0.3, 0.2, 1])), x = new T.Vector3().crossVectors(up, f);
        obj.quaternion.setFromRotationMatrix(m4.makeBasis(x, up, f)); obj.position.copy(up.multiplyScalar(R + lift));
    };
    const around = K.around, TOP = K.TOP;
    const scene = new T.Scene(); scene.background = new T.Color(0x9fe0ff);
    const camera = new T.PerspectiveCamera(58, 1, 0.1, 400);
    scene.add(new T.HemisphereLight(0xffffff, 0x8a7a66, 0.95));
    const sun = new T.DirectionalLight(0xfff4d6, 0.8); scene.add(sun); scene.add(sun.target);

    // ── The planet, painted by what each part of it is ───────────────────────
    { const geo = new T.IcosahedronGeometry(R, 14), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new T.Color();
      const pal = { sand: [0xf3dc9e, 0xe9cd86], sea: [0x5fa5c8, 0x4f93b8], rock: [0xcdbb9c, 0xbba98b], grass: [0x8fd46e, 0x73c05c], stone: [0xc4b8de, 0xb3a6d2], dais: [0xf7e3ff, 0xeed0ff] };
      const cur = level.currents && level.currents[0];
      for (let i = 0; i < pos.count; i += 3) {
          const p = norm([(pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3]);
          const d = K.dist(p, TOP), n = Math.sin(p[0] * 9.1 + 0.7) * Math.sin(p[1] * 8.3 + 1.9) + Math.sin(p[2] * 7.7 + p[0] * 3.1) * 0.6, tint = 0.95 + (((Math.sin(p[0] * 91.7 + p[1] * 47.3 + p[2] * 13.1) * 43758.5) % 1 + 1) % 1) * 0.1;
          const sea = cur && d > cur.r0 && d < cur.r1 && K.covers(cur, p);
          const kind = d < 1.8 ? 'dais' : d < 5.6 ? 'stone' : d < 9.2 ? 'grass' : d < level.bank ? (sea ? 'sea' : 'rock') : 'sand';
          c.setHex(pal[kind][n > 0.3 ? 1 : 0]).multiplyScalar(tint);
          for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeVertexNormals();
      scene.add(new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }))); }
    scene.add(new T.Mesh(new T.SphereGeometry(R * 1.16, 28, 18), basic(0xffffff, { transparent: true, opacity: 0.16, side: T.BackSide, depthWrite: false })));

    // ── Shapes and materials ─────────────────────────────────────────────────
    const G = {
        slab: new T.BoxGeometry(1, 1, 0.3), nut: new T.SphereGeometry(0.3, 10, 8), cap: new T.SphereGeometry(0.17, 7, 5),
        trunk: new T.CylinderGeometry(0.09, 0.14, 0.5, 6), leaf: new T.ConeGeometry(0.22, 1.0, 4),
        disc: new T.CircleGeometry(1, 28), ring: new T.RingGeometry(0.82, 1, 32), spike: new T.ConeGeometry(0.1, 0.5, 5), core: new T.IcosahedronGeometry(0.42, 0),
        rock: new T.CylinderGeometry(1, 1.12, 0.5, 9), post: new T.CylinderGeometry(0.07, 0.09, 1.1, 6), pole: new T.CylinderGeometry(0.05, 0.05, 2.2, 6), flag: new T.BoxGeometry(0.8, 0.5, 0.04),
        bubble: new T.SphereGeometry(0.14, 8, 6), streak: new T.BoxGeometry(0.1, 0.03, 0.8), vent: new T.CylinderGeometry(0.62, 0.78, 0.22, 10), pearl: new T.SphereGeometry(0.5, 16, 12),
        body: new T.SphereGeometry(0.5, 12, 9), wing: new T.BoxGeometry(0.9, 0.06, 0.34), beak: new T.ConeGeometry(0.09, 0.28, 6), dot: new T.SphereGeometry(0.08, 6, 5), blob: new T.SphereGeometry(1, 14, 10),
    };
    G.disc.rotateX(-Math.PI / 2); G.ring.rotateX(-Math.PI / 2); G.beak.rotateX(Math.PI / 2); G.streak.translate(0, 0, 0);
    const M = {
        cliff: lam(0x9a8f86), cliffTop: lam(0x7f9a6a), slide: lam(0xb9824d), cove: lam(0x8c8f9a), step: lam(0xb8a2d8), nut: lam(0x7a4a26), capM: lam(0x3f2a16), trunk: lam(0x9a6b3f), leaf: lam(0x3fae5a),
        urchin: lam(0x5b2a86), spike: lam(0xc084fc), rock: lam(0x8e96a8), moss: lam(0x6ea65a), vent: lam(0x5e5560), ventB: lam(0x68607a),
        water: basic(0x3fa9f5, { transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }), streak: basic(0xffffff, { transparent: true, opacity: 0.6, depthWrite: false }),
        pole: lam(0xf5f5f5), flagOff: lam(0xf5f5f5), flagOn: lam(0x4ade80), plate: lam(0xffc83a), plateOn: lam(0x4ade80), post: lam(0xd9d9e3),
        gullBody: lam(0xf6f6f2), gullWing: lam(0xdfe3ea), beak: lam(0xff9a1f), shade: basic(0x000000, { transparent: true, opacity: 0.26, depthWrite: false }),
        danger: basic(0xff3b3b, { transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }), aim: basic(0xffe45a, { transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide }),
        dot: basic(0xffffff, { transparent: true, opacity: 0.85 }), bubble: basic(0xdff6ff, { transparent: true, opacity: 0.8 }), ink: lam(0x6b3fa0), inkEye: basic(0xffe45a), pearl: new T.MeshLambertMaterial({ color: 0xfff1ff, emissive: 0xff8ad8, flatShading: true }),
        glow: basic(0xff8ad8, { transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide }),
    };

    // ── The furniture ────────────────────────────────────────────────────────
    // Walls, as slabs round their centres where they cover. A gate sinks when it opens.
    const walls = [];
    const arcPoints = (w, step = 0.5) => {
        const c = w.c || TOP, n = Math.max(12, Math.round((2 * Math.PI * R * Math.sin(w.r / R)) / step)), out = [];
        for (let i = 0; i < n; i++) { const deg = (i + 0.5) * (360 / n), p = around(c, w.r, deg); if (K.covers(w, p)) out.push({ p, deg, len: (2 * Math.PI * R * Math.sin(w.r / R)) / n }); }
        return out;
    };
    for (const w of level.rings || []) {
        const c = w.c || TOP, kind = w.kind || 'gate', mat = w.gate ? lam(GATE_COLOR[w.gate] || 0xe0569a) : M[kind === 'cliff' ? 'cliff' : kind === 'slide' ? 'slide' : kind === 'cove' ? 'cove' : 'step'];
        const bars = !!w.gate;          // (a gate is a fence of bars you can see the pearl through)
        const slabs = arcPoints(w, bars ? 0.62 : 0.5).map(({ p, len }) => { const m = new T.Mesh(G.slab, mat); m.userData = { p, f: toward(p, c), len: bars ? 0.2 : len * 1.12 }; scene.add(m); return m; });
        walls.push({ w, slabs, k: 0, h: WALL_SHOW[kind] || 2 });
    }
    for (const w of level.bars || []) {
        const len = K.dist(w.a, w.b), n = Math.max(2, Math.round(len / 0.5)), nrm = norm(cross(w.a, w.b)), slabs = [];
        for (let i = 0; i < n; i++) { const p = norm(mix(w.a, w.b, 1 - (i + 0.5) / n, (i + 0.5) / n)), m = new T.Mesh(G.slab, M.cliff); m.userData = { p, f: tangent(p, nrm), len: (len / n) * 1.12 }; scene.add(m); slabs.push(m); }
        walls.push({ w, slabs, k: 0, h: 2.6 });
    }
    // The slide down from the shelf: a plank from the cliff's top to the beach.
    const slide = (level.rings || []).find(w => w.kind === 'slide');
    if (slide) {
        const lon = slide.only[0], hi = K.at(slide.r - 0.1, lon), lo = K.at(slide.r + 1.7, lon), a = at3(hi, WALL_SHOW.cliff), b = at3(lo, 0.12);
        const plank = new T.Mesh(new T.BoxGeometry(1.9, 0.14, a.distanceTo(b)), M.slide); plank.position.copy(a.clone().add(b).multiplyScalar(0.5)); plank.up.copy(V(hi)); plank.lookAt(b); scene.add(plank);
    }
    // The water: a skin over the channel, and streaks that run the way it goes.
    const cur = level.currents && level.currents[0], streaks = [];
    if (cur) {
        const lon0 = cur.only[0] - cur.only[1], lon1 = cur.only[0] + cur.only[1], nL = Math.round((lon1 - lon0) / 5), rows = Math.ceil((cur.r1 - cur.r0) / 0.7), pos = [];
        for (let i = 0; i < nL; i++) for (let j = 0; j < rows; j++) {
            const a0 = lon0 + (i / nL) * (lon1 - lon0), a1 = lon0 + ((i + 1) / nL) * (lon1 - lon0), r0 = cur.r0 + ((cur.r1 - cur.r0) * j) / rows, r1 = cur.r0 + ((cur.r1 - cur.r0) * (j + 1)) / rows;
            const q = [around(TOP, r0, a0), around(TOP, r1, a0), around(TOP, r1, a1), around(TOP, r0, a1)].map(p => at3(p, 0.07));
            for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k].x, q[k].y, q[k].z);
        }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3)); scene.add(new T.Mesh(geo, M.water));
        for (let i = 0; i < 110; i++) { const m = new T.Mesh(G.streak, M.streak); scene.add(m); streaks.push({ m, lon: lon0 + Math.random() * (lon1 - lon0), d: cur.r0 + 0.2 + Math.random() * (cur.r1 - cur.r0 - 0.4), s: 0.7 + Math.random() * 0.6, lon0, lon1 }); }
    }
    // Urchins (Old Ink's fence), rocks to stand on, and the vents.
    const spiky = u => { const g = new T.Group(); g.add(new T.Mesh(G.core, M.urchin)); for (let i = 0; i < 14; i++) { const s = new T.Mesh(G.spike, M.spike), a = Math.acos(1 - 2 * (i + 0.5) / 14), b = i * 2.4; s.position.set(Math.sin(a) * Math.cos(b) * 0.4, Math.cos(a) * 0.4, Math.sin(a) * Math.sin(b) * 0.4); s.lookAt(s.position.clone().multiplyScalar(3)); s.rotateX(Math.PI / 2); g.add(s); } g.scale.setScalar(u.r * 1.4); scene.add(g); return g; };
    const urchins = (level.urchins || []).map(u => ({ u, g: spiky(u) }));
    const rocks = (level.rocks || []).map(k => { const m = new T.Mesh(G.rock, M.rock); m.scale.set(k.r, 1, k.r); const top = new T.Mesh(G.disc, M.moss); top.position.y = 0.26; top.scale.setScalar(0.8); m.add(top); scene.add(m); return { k, m }; });
    const vents = (level.vents || []).map(v => { const m = new T.Mesh(G.vent, v.float ? M.vent : M.ventB); m.scale.set(v.r / 0.62, 1, v.r / 0.62); scene.add(m);
        const bubbles = Array.from({ length: 9 }, (_, i) => { const b = new T.Mesh(G.bubble, M.bubble); scene.add(b); return { b, t: i / 9 }; });
        const halo = new T.Mesh(G.ring, basic(v.float ? 0xb9c0cc : 0x7ee7ff, { transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide })); halo.scale.setScalar(v.r + 0.35); scene.add(halo);
        return { v, m, bubbles, halo }; });
    // Flags, the palm, the plate, the bullseye, the pearl, and Old Ink watching it.
    const checks = (level.checks || []).map((p0, i) => { const p = walk(p0, cross(p0, tangent(p0, K.TOP)), 0.8 / R); const g = new T.Group(); const pole = new T.Mesh(G.pole, M.pole); pole.scale.y = 0.7; pole.position.y = 0.77; g.add(pole); const cloth = new T.Mesh(G.flag, M.flagOff); cloth.scale.setScalar(0.8); cloth.position.set(0.34, 1.3, 0); g.add(cloth); scene.add(g); return { p, i, g, cloth }; });
    const palm = (() => { const g = new T.Group(), top = new T.Group(); for (let i = 0; i < 4; i++) { const t = new T.Mesh(G.trunk, M.trunk); t.position.set(i * 0.05, 0.25 + i * 0.44, 0); t.rotation.z = -0.1; t.scale.setScalar(1 - i * 0.1); g.add(t); }
        for (let i = 0; i < 6; i++) { const lf = new T.Group(), m = new T.Mesh(G.leaf, M.leaf); m.position.z = 0.5; m.rotation.x = Math.PI / 2 + 0.55; m.scale.set(1, 1, 0.35); lf.add(m); lf.rotation.y = (i / 6) * Math.PI * 2; top.add(lf); }
        top.position.set(0.2, 1.86, 0); g.add(top); g.scale.setScalar(1.15); scene.add(g); put(g, level.palm, [1, 0, 0]); return { g, top }; })();
    const plates = (level.plates || []).map(pl => { const m = new T.Mesh(G.disc, M.plate); m.scale.setScalar(pl.r); scene.add(m); const halo = new T.Mesh(G.ring, basic(GATE_COLOR[pl.gate] || 0xffc83a, { transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })); halo.scale.setScalar(pl.r + 0.1); scene.add(halo); return { pl, m, halo }; });
    const targets = (level.targets || []).map(tg => {
        const g = new T.Group(); const post = new T.Mesh(G.post, M.post); post.position.y = 0.55; g.add(post);
        const face = new T.Group(); face.position.y = 1.1;
        [[0.55, 0xff4d4d], [0.38, 0xffffff], [0.2, 0xff4d4d]].forEach(([r, color], i) => { const d = new T.Mesh(new T.CylinderGeometry(r, r, 0.06 + i * 0.02, 20), lam(color)); d.rotation.x = Math.PI / 2; face.add(d); });
        g.add(face); scene.add(g); return { tg, g, face, hit: 0 }; });
    const pearl = new T.Group(); { const orb = new T.Mesh(G.pearl, M.pearl); orb.position.y = 0.95; pearl.add(orb); const glow = new T.Mesh(G.disc, M.glow); glow.scale.setScalar(1.2); glow.position.y = 0.05; pearl.add(glow); const dais = new T.Mesh(new T.CylinderGeometry(0.7, 0.85, 0.3, 14), lam(0xe5d4f5)); dais.position.y = 0.15; pearl.add(dais); pearl.userData = { orb, glow }; scene.add(pearl); }
    const ink = (() => {
        const g = new T.Group(), body = new T.Mesh(G.blob, M.ink); body.scale.set(0.95, 0.8, 0.95); body.position.y = 0.8; g.add(body);
        const eyes = [-1, 1].map(k => { const e = new T.Mesh(G.dot, M.inkEye); e.scale.setScalar(1.6); e.position.set(k * 0.36, 1.0, 0.78); g.add(e); const pu = new T.Mesh(G.dot, basic(0x1a1024)); pu.position.set(k * 0.36, 1.0, 0.92); g.add(pu); return e; });
        const arms = Array.from({ length: 8 }, (_, i) => { const a = new T.Group(); for (let j = 0; j < 5; j++) { const seg = new T.Mesh(G.blob, M.ink); seg.scale.setScalar(0.3 - j * 0.04); seg.position.set(0, 0.25 - j * 0.04, 0.55 + j * 0.42); a.add(seg); } a.rotation.y = (i / 8) * Math.PI * 2; g.add(a); return a; });
        g.scale.setScalar(1.15); scene.add(g); return { g, arms, body }; })();
    const inkAt = K.at(2.6, 180);       // (on the far side of the pearl from the gates)

    // The crab, its shadow, the coconut it winds up, the preview of a throw.
    const crab = kit.crab(kit.skin); scene.add(crab.g);
    const shadow = new T.Mesh(new T.CircleGeometry(0.5, 16), M.shade); shadow.geometry.rotateX(-Math.PI / 2); scene.add(shadow);
    const held = new T.Mesh(G.nut, M.nut); held.visible = false; scene.add(held);
    const aimRing = new T.Mesh(G.ring, M.aim); aimRing.visible = false; scene.add(aimRing);
    const dots = Array.from({ length: 30 }, () => { const d = new T.Mesh(G.dot, M.dot); d.visible = false; scene.add(d); return d; });
    const bankMark = new T.Mesh(new T.OctahedronGeometry(0.3, 0), basic(0xffe45a)); bankMark.visible = false; scene.add(bankMark);
    const nuts = new Map();
    // The gull.
    const gull = (() => {
        const g = new T.Group(), body = new T.Mesh(G.body, M.gullBody); body.scale.set(0.8, 0.6, 1.3); g.add(body);
        const head = new T.Mesh(G.body, M.gullBody); head.scale.setScalar(0.5); head.position.set(0, 0.2, 0.62); g.add(head);
        const beak = new T.Mesh(G.beak, M.beak); beak.position.set(0, 0.17, 0.92); g.add(beak);
        const eye = new T.Mesh(G.dot, basic(0x1a1024)); eye.position.set(0.1, 0.27, 0.78); g.add(eye); const eye2 = eye.clone(); eye2.position.x = -0.1; g.add(eye2);
        const wings = [-1, 1].map(k => { const w = new T.Group(), m = new T.Mesh(G.wing, M.gullWing); m.position.x = k * 0.48; w.add(m); w.position.set(k * 0.28, 0.18, 0); g.add(w); return { w, k }; });
        const loot = new T.Group(); loot.add(new T.Mesh(G.nut, M.nut)); loot.children[0].scale.setScalar(0.75); loot.position.set(0, -0.42, 0.1); g.add(loot);
        const star = new T.Group(); for (let i = 0; i < 3; i++) { const s = new T.Mesh(G.dot, basic(0xffe45a)); s.scale.setScalar(1.3); star.add(s); } star.position.y = 0.7; g.add(star);
        g.scale.setScalar(0.95); scene.add(g); return { g, wings, loot, star, body, beak }; })();
    const gullShade = new T.Mesh(G.disc, M.shade), gullRing = new T.Mesh(G.ring, M.danger); scene.add(gullShade); scene.add(gullRing);
    // Sparks.
    const N = 240, pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3).fill(9999), 3)); pg.setAttribute('color', new T.BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = new T.Points(pg, new T.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, depthWrite: false })); sparks.frustumCulled = false; scene.add(sparks);
    const pool = Array.from({ length: N }, () => ({ life: 0, v: [0, 0, 0] })); let next = 0;
    const burst = (o, color, n, speed) => {
        const pos = pg.attributes.position, col = pg.attributes.color, c = new T.Color(color), up = o.clone().normalize();
        for (let i = 0; i < n; i++) { const k = next = (next + 1) % N, d = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().addScaledVector(up, 0.8).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8)); pool[k].life = 0.5 + Math.random() * 0.4; pool[k].v = [d.x, d.y, d.z]; pos.setXYZ(k, o.x, o.y, o.z); col.setXYZ(k, c.r, c.g, c.b); }
        col.needsUpdate = true;
    };

    let pitch = 0, shelfK = 0, s = K.create(level), t = 0, charge = -1, cheer = 0, camP = null, shake = 0, doneAt = 0, told = false, disposed = false, intro = 0, snap = false, shown = 0, inkMad = 0;

    function events(evs) {
        for (const e of evs) {
            if (e.type === 'thud') hooks.sfx('dice_land');
            else if (e.type === 'plop') { burst(at3(e.p, 0.2), 0x9bd8ff, 14, 3); hooks.sfx('boost'); }
            else if (e.type === 'bank') { burst(at3(e.p, e.nut.h), 0xffffff, 8, 3); hooks.sfx('tick'); }
            else if (e.type === 'pick') { burst(at3(e.nut.p, 0.4), 0xffe9b0, 8, 2.4); hooks.sfx('tick'); hooks.buzz(6); }
            else if (e.type === 'bounce') { burst(at3(e.nut.p, 0.5), 0xfff08a, 16, 4); hooks.sfx('land_good'); hooks.buzz(12); cheer = 0.3; }
            else if (e.type === 'trick') { burst(at3(s.crab.p, e.h), 0xffffff, 30, 6); hooks.sfx('win'); hooks.pop(at3(s.crab.p, e.h + 1), '✨ TRICK SHOT!'); cheer = 0.5; }
            else if (e.type === 'plug') { burst(at3(e.vent.p, 0.4), 0x9bffb0, 26, 5); hooks.sfx('coin_gain'); hooks.buzz([12, 20, 30]); hooks.say(e.now ? `🫧 VENT ${e.now.id} IS BLOWING!` : '🫧 PLUGGED', '#86efac'); hooks.pop(at3(e.vent.p, 1.4), e.now ? `VENT ${e.now.id} BLOWS` : 'PLUGGED'); }
            else if (e.type === 'lift') { burst(at3(e.vent.p, 0.3), 0xdff6ff, 24, 5); hooks.sfx('boost'); hooks.buzz([15, 20, 40]); hooks.pop(at3(e.vent.p, 1.6), 'WHOOSH!'); cheer = 0.6; }
            else if (e.type === 'lost') { burst(at3(e.p, 0.3), 0xc084fc, 14, 4); hooks.sfx('land_bad'); hooks.pop(at3(e.p, 1), e.why === 'urchin' ? 'SPIKED! IT WASHES UP AT THE PALM' : 'LOST'); }
            else if (e.type === 'washed') { burst(at3(e.nut.p, 0.3), 0x9bd8ff, 10, 3); hooks.pop(at3(e.nut.p, 1), '🥥 BACK AT THE PALM'); }
            else if (e.type === 'target') { const v = targets.find(x => x.tg === e.target); if (v) v.hit = 1; burst(at3(e.target.p, 1.1), 0x4ade80, 26, 5); hooks.sfx('coin_gain'); hooks.buzz([10, 20, 30]); hooks.say('🎯 BULLSEYE! THE GATE IS OPEN', '#86efac'); }
            else if (e.type === 'press') { hooks.sfx('shield'); hooks.buzz(10); hooks.pop(at3(e.plate.p, 0.8), 'GATE OPEN'); }
            else if (e.type === 'release') { hooks.sfx('tick'); hooks.pop(at3(e.plate.p, 0.8), 'GATE SHUT AGAIN'); }
            else if (e.type === 'gull-up') hooks.hint('🐦 THE GULL HAS SEEN YOU: WATCH ITS SHADOW', 2.4);
            else if (e.type === 'gull-dive') { hooks.sfx('boost'); hooks.buzz([20, 20]); hooks.hint('🐦 DIVING! MOVE, THEN JUMP ON IT AS IT LANDS', 2.2); }
            else if (e.type === 'gull-miss') hooks.pop(at3(s.gull.p, 1.4), 'MISSED! JUMP ON IT NOW');
            else if (e.type === 'steal') { burst(at3(s.crab.p, 0.8), 0xffffff, 20, 4); hooks.sfx('land_bad'); hooks.buzz([30, 30, 30]); hooks.say('🐦 IT STOLE A COCONUT!', '#fca5a5'); shake = 0.3; }
            else if (e.type === 'stomp') { burst(at3(s.gull.p, 0.6), 0xffffff, 30, 5); hooks.sfx('land_good'); hooks.buzz([15, 20, 40]); hooks.pop(at3(s.gull.p, 1.3), '🐦 BONK!'); cheer = 0.4; }
            else if (e.type === 'stun') { burst(at3(s.gull.p, 0.6), 0xfff08a, 16, 4); if (e.by === 'nut') { hooks.sfx('land_good'); hooks.pop(at3(s.gull.p, 1.3), '🥥 BONK!'); } }
            else if (e.type === 'drop') hooks.pop(at3(e.nut.p, 1), 'IT DROPPED THE COCONUT');
            else if (e.type === 'check') { burst(at3(e.p, 1), 0x4ade80, 22, 4); hooks.sfx('land_good'); hooks.buzz(10); hooks.pop(at3(e.p, 1.6), '🚩 CHECKPOINT'); }
            else if (e.type === 'ouch' || e.type === 'peck') { hooks.sfx('land_bad'); hooks.buzz([30, 30, 30]); hooks.hint(`${e.type === 'peck' ? 'PECKED! NO COCONUT TO STEAL' : 'OUCH! SPIKES'} · BACK AT THE ${e.at > 0 ? 'FLAG' : 'START'}`, 2.2); shake = 0.4; snap = true; }
            else if (e.type === 'won') { burst(at3(level.goal, 1.5), 0xff8ad8, 50, 7); burst(at3(level.goal, 1.5), 0xffd84a, 40, 6); hooks.sfx('win'); hooks.buzz([30, 30, 30, 30, 120]); cheer = 1.2; inkMad = 2; doneAt = t + 1.8; }
        }
    }

    function draw(dt) {
        const c = s.crab, g = s.gull, cn = K.count(s);
        // Walls: gates sink when they open.
        walls.forEach(v => {
            v.k += ((K.up(s, v.w) ? 0 : 1) - v.k) * Math.min(1, dt * 8);
            const h = v.h * (1 - v.k * 0.96), tall = v.w.kind === 'cliff';
            v.slabs.forEach(m => { put(m, m.userData.p, m.userData.f, h / 2); m.scale.set(v.w.gate ? m.userData.len : m.userData.len * (1 + h * 0.06), Math.max(0.02, h), tall ? 1.4 : v.w.gate ? 0.5 : 1); });
        });
        // The current: streaks sliding east and starting again.
        streaks.forEach(q => { q.lon += (cur.speed / (2 * Math.PI * R * Math.sin(q.d / R))) * 360 * dt * q.s * 0.9; if (q.lon > q.lon1) { q.lon = q.lon0; q.d = cur.r0 + 0.2 + Math.random() * (cur.r1 - cur.r0 - 0.4); }
            const p = around(TOP, q.d, q.lon); put(q.m, p, tangent(p, cross(TOP, p)), 0.1); const edge = Math.min(q.lon - q.lon0, q.lon1 - q.lon) / 12; q.m.scale.set(1, 1, 0.6 + q.s * 0.7); q.m.visible = edge > 0.02 && !(K.rockUnder(s, p)); });
        urchins.forEach((v, i) => { put(v.g, v.u.p, null, 0.28 + Math.sin(t * 2 + i) * 0.03); v.g.rotation.y = t * 0.3 + i; });
        rocks.forEach(v => put(v.m, v.k.p, [1, 0, 0], 0.18));
        const blow = K.blowing(s);
        vents.forEach(vn => {
            put(vn.m, vn.v.p, null, 0.1); put(vn.halo, vn.v.p, null, 0.28);
            const on = blow === vn.v, plugged = !!s.plug[vn.v.id], active = on && !plugged;
            vn.halo.material.opacity = active ? 0.6 + 0.4 * Math.abs(Math.sin(t * 4)) : plugged ? 0.15 : 0.3;
            vn.bubbles.forEach(b => { b.t = (b.t + dt * (active ? 0.55 : 0.2)) % 1; const rise = b.t * (active ? (vn.v.lift ? 3.4 : 1.8) : 0.5), wob = Math.sin(t * 5 + b.t * 9) * 0.14; b.b.visible = active || (!plugged && (!vn.v.lift ? true : false)); b.b.position.copy(at3(vn.v.p, 0.3 + rise)); const side = V(cross(vn.v.p, [0, 1, 0])).normalize(); b.b.position.addScaledVector(side, wob); b.b.scale.setScalar(0.6 + b.t * 0.7); });
        });
        checks.forEach(v => { put(v.g, v.p, [1, 0, 0]); v.cloth.material = s.cp >= v.i ? M.flagOn : M.flagOff; v.cloth.rotation.y = Math.sin(t * 4 + v.i) * 0.25; });
        palm.top.rotation.z = Math.sin(t * 1.3) * 0.06; palm.top.rotation.x = Math.cos(t * 1.1) * 0.05;
        plates.forEach(v => { const on = !!s.held[v.pl.gate]; v.m.material = on ? M.plateOn : M.plate; put(v.m, v.pl.p, null, on ? 0.03 : 0.09); put(v.halo, v.pl.p, null, 0.12); });
        targets.forEach(v => { v.hit = Math.max(0, v.hit - dt * 1.5); put(v.g, v.tg.p, toward(v.tg.p, c.p)); v.face.rotation.z = v.hit * 8; v.face.scale.setScalar(1 + v.hit * 0.4); if (s.open[v.tg.gate]) v.face.children.forEach(d => d.material.color.setHex(0x4ade80)); });
        // The pearl and Old Ink: he watches the crab; when it's taken he rears up.
        inkMad = Math.max(0, inkMad - dt);
        put(pearl, TOP, [1, 0, 0]); pearl.userData.orb.position.y = 0.95 + Math.sin(t * 2) * 0.1 + (s.won ? Math.min(2, (t - (doneAt - 1.8)) * 1.5) : 0); pearl.userData.orb.rotation.y = t; pearl.userData.glow.material.opacity = 0.25 + 0.15 * Math.sin(t * 3);
        put(ink.g, inkAt, toward(inkAt, c.p), 0); ink.g.scale.setScalar(1.15 + (inkMad > 0 ? 0.3 * Math.abs(Math.sin(t * 14)) : 0.03 * Math.sin(t * 1.5)));
        ink.arms.forEach((a, i) => { a.rotation.y = (i / 8) * Math.PI * 2 + Math.sin(t * 1.2 + i) * 0.25; a.rotation.x = inkMad > 0 ? -0.5 : 0; });

        // Coconuts: lying, floating, flying, plugging a vent, stuck in the bullseye.
        const seen = new Set();
        for (const n of s.nuts) {
            seen.add(n.id);
            let v = nuts.get(n.id);
            if (!v) { v = new T.Group(); v.add(new T.Mesh(G.nut, M.nut)); const cap = new T.Mesh(G.cap, M.capM); cap.position.y = 0.2; v.add(cap); scene.add(v); nuts.set(n.id, v); }
            const lift = n.state === 'fly' ? n.h : n.state === 'float' ? 0.16 + Math.sin(t * 3 + n.id) * 0.05 : n.state === 'plug' ? 0.34 : n.state === 'stuck' ? 1.1 : 0.24;
            put(v, n.p, n.d, lift); if (n.state === 'fly') v.rotateX(t * 9);
        }
        for (const [id, v] of nuts) if (!seen.has(id)) { scene.remove(v); nuts.delete(id); }

        // The crab.
        cheer = Math.max(0, cheer - dt);
        put(crab.g, c.p, c.face, c.h); put(shadow, c.p, c.face, 0.04); shadow.scale.setScalar(Math.max(0.4, 1 - c.h * 0.1));
        kit.pose(crab, dt, c.moving && !c.air, Math.max(cheer > 0 ? 0.3 : 0, charge >= 0 ? 0.14 : 0));

        // The gull: its shadow and the red ring are the warning.
        gull.g.visible = !!g; gullShade.visible = gullRing.visible = false;
        if (g) {
            const flying = g.h > 0.05 || g.state === 'circle' || g.state === 'rise', face = g.state === 'dive' || g.state === 'land' ? toward(g.p, g.tx || c.p) : g.state === 'circle' ? toward(g.p, c.p) : tangent(g.p, cross(TOP, g.p));
            put(gull.g, g.p, face, g.h + 0.45); if (g.state === 'stun') { gull.g.rotateZ(Math.PI * 0.5 * Math.sin(Math.min(1, g.t * 4))); gull.g.position.y -= 0; }
            gull.wings.forEach(({ w, k }) => { w.rotation.z = k * (flying ? Math.sin(t * 22) * 0.9 : g.state === 'stun' ? -0.6 : 0.2); });
            gull.loot.visible = g.loot > 0; gull.star.visible = g.state === 'stun'; gull.star.rotation.y = t * 6;
            gullShade.visible = g.h > 0.1; put(gullShade, g.p, null, 0.05); gullShade.scale.setScalar(Math.max(0.3, 0.7 - g.h * 0.06));
            const tell = g.state === 'circle' ? c.p : (g.state === 'dive' || g.state === 'land') && g.tx ? g.tx : null;
            if (tell) { gullRing.visible = true; put(gullRing, tell, null, 0.1); const k = g.state === 'dive' ? 1 - Math.min(1, g.t / K.GULL.dive) : 1; gullRing.scale.setScalar(K.GULL.hit * (1.1 + k * 0.7)); gullRing.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(t * (g.state === 'dive' ? 22 : 8))); }
        }

        // Winding up: the coconut overhead, and where it would come down.
        const k = charge >= 0 ? Math.min(1, charge) : -1;
        held.visible = k >= 0 && cn.held > 0; aimRing.visible = k >= 0 && cn.held > 0;
        if (k >= 0 && cn.held > 0) {
            put(held, c.p, c.face, c.h + 1.25); held.scale.setScalar(0.6 + k * 0.4);
            const a = K.aim(s, k);
            put(aimRing, a.p, null, 0.09); aimRing.scale.setScalar(0.85 * (1 + Math.sin(t * 10) * 0.08));
            aimRing.material.color.setHex(a.wet ? 0x7ee7ff : 0xffe45a);
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

        // The camera: behind and above, higher when the crab is, and swinging in from far out on a fresh go.
        const dT = K.dist(c.p, TOP); shelfK += ((dT < 9.7 && dT > 5.0 ? 1 : 0) - shelfK) * Math.min(1, dt * 3);
        const up = V(c.p), f = V(c.f), want = up.clone().multiplyScalar(R + (9.6 + 3.2 * shelfK) * (1 + 0.4 * pitch) + c.h * 0.45).addScaledVector(f, -(8.6 - 3.6 * shelfK) * (1 - 0.35 * pitch));
        if (snap && camP) { camP.copy(want); snap = false; }
        if (!camP) { camP = up.clone().multiplyScalar(R * 4.2).addScaledVector(f, R * 1.4); intro = 1.8; }
        intro = Math.max(0, intro - dt);
        camP.lerp(want, dt ? Math.min(1, dt * (intro > 0 ? 2.4 : 7)) : 0);
        camera.position.copy(camP);
        shake = Math.max(0, shake - dt * 2.4);
        if (shake > 0 && dt) camera.position.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 0.5));
        camera.up.copy(V(c.p)); camera.lookAt(V(c.p).multiplyScalar(R + c.h * 0.4).addScaledVector(f, 1.8));
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
        /** The right thumb: turn the camera round the crab, and tilt it. */
        look(a, dpitch = 0) { if (a) K.turnView(s, a); pitch = Math.max(-0.9, Math.min(0.9, pitch + dpitch)); },
        jump() { if (K.jump(s)) { hooks.sfx('swap'); hooks.buzz(8); return true; } return false; },
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
        restart() { s = K.create(level); charge = -1; camP = null; doneAt = 0; told = false; inkMad = 0; targets.forEach(v => v.face.children.forEach((d, i) => d.material.color.setHex(i === 1 ? 0xffffff : 0xff4d4d))); },
        state: () => s,
        level,
        dispose() {
            disposed = true;
            scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => x.dispose()); });
        },
    };
}
