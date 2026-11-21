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
import * as SG from './Signs.js';

const CHARGE_S = 0.9;                       // how long a full wind-up takes
const GATE_COLOR = { net: 0x5fd0ff, nest: 0xffc83a, bridge: 0xffc83a, lid: 0x9be7ff,  eye: 0xff5fa8, plate: 0xffc83a, yard: 0x5fd0ff, red: 0xff5f5f, blue: 0x5f8bff, green: 0x4ade80, gold: 0xffc83a, cage: 0x5fd0ff };
const SHOW = { cliff: 2.4, cove: 1.5, step: 2, gate: 2.1 };      // how tall each kind of wall is drawn
const rngOf = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function createLair(kit, level, hooks, shared = null) {      // (shared: the state carried over from the other world of a chamber with a moon)
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
    const sfl = { lv: level, blocks: [], logs: [], open: {}, held: {}, dmg: {} }, fl = p => K.floorAt(sfl, p);      // (the ground's height: terraces, ramps, posts)
    // Each world has its own look: World 1 a sunny island, World 2 the coral caves (deep teal sky, pale coral sand, sea-grass, pink coral).
    const THEME = {
        beach: { sky: 0x9fe0ff, hemi: [0xffffff, 0x8a7aa0], ground: { sand: [0xf3d890, 0xe9c87a], sea: [0x5aaed4, 0x4a9ec6], rock: [0xd2b98f, 0xc2a77c], grass: [0x8fd96a, 0x76c456], stone: [0xb9a6ea, 0xa994de], dais: [0xf6bdf3, 0xe9a7ee] } },
        moon: { sky: 0x141d40, hemi: [0xe8e4ff, 0x3a3366], ground: { sand: [0xc9c3dc, 0xbdb6d2], sea: [0x8f86b8, 0x8077aa], rock: [0xa59cc6, 0x968db9], grass: [0xb4acd2, 0xa69ec6], stone: [0xd8d2ea, 0xccc5e2], dais: [0xe6e0f6, 0xdcd5f0] }, stars: true, craters: true },
        deep: { sky: 0x182a52, hemi: [0xc8e8ff, 0x3a2a66], ground: { sand: [0xd9c4d8, 0xcbb4cb], sea: [0x0e1a33, 0x0b1529], rock: [0x8a7fb8, 0x7d72ab], grass: [0x2f9c8a, 0x278a7a], stone: [0x6fb8b0, 0x62aaa2], dais: [0xffc4e6, 0xffb0dc] }, decor: true },
        volcano: { sky: 0x3a1a26, hemi: [0xffd9c2, 0x4a1a2a], ground: { sand: [0x4a4250, 0x3e3746], sea: [0xff6a1f, 0xff8a2a], rock: [0x5a4f63, 0x4f4558], grass: [0x6b5f74, 0x5f5468], stone: [0x7a6a74, 0x6e5f69], dais: [0xffb37a, 0xffa060], lava: [0xff5a1a, 0xff8a24] }, embers: true },
        reef: { sky: 0x2f7f9c, hemi: [0xd8fff6, 0x5a3f8a], ground: { sand: [0xf2d9cf, 0xe7c7bd], sea: [0x2fb3c4, 0x27a1b3], rock: [0xc7a9e0, 0xb796d4], grass: [0x46c2a6, 0x37ad93], stone: [0x8fd4c9, 0x7cc7bb], dais: [0xffc4e6, 0xffb0dc] }, decor: true },
    }[level.theme || 'beach'] || null;
    const scene = new T.Scene(); scene.background = new T.Color(THEME.sky);
    const camera = new T.PerspectiveCamera(58, 1, 0.1, 400);
    scene.add(new T.HemisphereLight(THEME.hemi[0], THEME.hemi[1], 0.5));
    const sun = new T.DirectionalLight(0xfff4d6, 0.75); scene.add(sun); scene.add(sun.target);

    // ── The planet, painted by what each part of it is ───────────────────────
    { const geo = new T.IcosahedronGeometry(R, 14), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new T.Color();
      const pal = THEME.ground;
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
    // A rock wall in layers (strata): one solid mesh along the ring, banded in colour, bulging and stepping in and out a little band by
    // band (small ledges), its top ragged; ink-outlined. Overgrown (moss on top, vines hanging down both faces, flowers in the seams)
    // when o.moss.
    function coralTops(w) {         // sea fans, tube corals and anemones along the top of a coral wall
        const items = arcPoints(w, 1.1), rnd = rngOf(55 + Math.round(w.r * 3));
        items.forEach((it, i) => { const base = fl(it.p) + 2.9, kind = i % 3;
            const g = kind === 0 ? Y.prop([{ geo: G.coneLow, color: 0xb98be6, s: [0.8, 1.1, 0.1], p: [0, 0.55, 0] }, { geo: G.coneLow, color: 0xcaa2ef, s: [0.55, 0.8, 0.09], p: [0.2, 0.45, 0.02], r: [0, 0, -0.4] }], { thick: 0.04 })
                : kind === 1 ? Y.prop([0, 1, 2].map(k => ({ geo: G.cylLow, color: [0xffb35c, 0xff9f45, 0xffc77f][k], s: [0.18, 0.5 + k * 0.25, 0.18], p: [(k - 1) * 0.2, 0.25 + k * 0.12, (k % 2) * 0.12] })), { thick: 0.04 })
                : Y.prop([{ geo: G.sph, color: 0xff7ab8, s: [0.5, 0.3, 0.5], p: [0, 0.12, 0] }, ...[0, 1, 2, 3, 4].map(k => ({ geo: G.cylLow, color: 0xffb3d6, s: [0.06, 0.3, 0.06], p: [Math.cos(k * 1.26) * 0.16, 0.36, Math.sin(k * 1.26) * 0.16] }))], { thick: 0.03 });
            put(g, it.p, [rnd() - 0.5, 0, rnd() - 0.5], base); scene.add(g); });
    }
    function strataWall(w, o) {
        const items = arcPoints(w, 0.32), n = items.length; if (n < 2) return;
        const rnd = rngOf(33 + Math.round(w.r * 7)), bands = o.bands, H = o.h, D = o.depth || 1.1, pos = [], col = [], cc = new T.Color();
        const stepDeg = items.length > 1 ? Math.abs(items[1].deg - items[0].deg) : 1;
        const top = items.map((_, i) => H * (0.88 + 0.12 * Math.sin(i * 0.9) + rnd() * 0.08));
        const bulge = Array.from({ length: bands + 1 }, (_, b) => items.map((_, i) => (b % 3 === 2 ? 0.12 : 0) + 0.08 * Math.sin(i * 0.55 + b * 1.7) + rnd() * 0.04));
        const V3 = (it, side, b, i) => { const hb = (b / bands) * top[i], off = side * (D / 2 + bulge[b][i]); return V(walk(it.p, it.f, -off / R)).multiplyScalar(R + fl(it.p) + hb); };
        const push = (v, hex, k = 1) => { pos.push(v.x, v.y, v.z); cc.setHex(hex).multiplyScalar(k); col.push(cc.r, cc.g, cc.b); };
        const quad = (a, b2, c2, d, hex, k) => { push(a, hex, k); push(b2, hex, k); push(c2, hex, k); push(a, hex, k); push(c2, hex, k); push(d, hex, k); };
        const band = b => o.colors[b % o.colors.length];
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n; if (Math.abs(((items[j].deg - items[i].deg + 540) % 360) - 180) > stepDeg * 1.6) continue;        // (across a gap)
            const a = items[i], b2 = items[j], k = 0.92 + ((Math.sin(i * 127.1 + 931.3) * 43758.5453) % 1 + 1) % 1 * 0.12;
            for (const side of [1, -1]) for (let b = 0; b < bands; b++) quad(V3(a, side, b, i), V3(b2, side, b, j), V3(b2, side, b + 1, j), V3(a, side, b + 1, i), band(b), k * (side > 0 ? 1 : 0.94));
            quad(V3(a, 1, bands, i), V3(b2, 1, bands, j), V3(b2, -1, bands, j), V3(a, -1, bands, i), o.moss ? C.moss : band(bands), 1);       // the top
        }
        // the ends of a wall with a gap: a face across each
        const ends = []; for (let i = 0; i < n; i++) { const j = (i + 1) % n; const jump = Math.abs(((items[j].deg - items[i].deg + 540) % 360) - 180) > stepDeg * 1.6; if (jump) ends.push(i, j); }
        for (const i of ends) for (let b = 0; b < bands; b++) quad(V3(items[i], 1, b, i), V3(items[i], -1, b, i), V3(items[i], -1, b + 1, i), V3(items[i], 1, b + 1, i), band(b), 0.85);
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        const mesh = new T.Mesh(geo, Y.toon(0xffffff, { vertexColors: true, side: T.DoubleSide })); scene.add(mesh);
        const line = new T.Mesh(Y.hull(geo, 0.06), Y.ink); line.renderOrder = -1; mesh.add(line);
        if (!o.moss) return;
        // moss along the top, vines hanging down both faces, flowers in the seams
        const tops = items.filter((_, i) => i % 2 === 0), moss = Y.instanced(G.sphLow, tops.length, 0.05); scene.add(moss.body); if (moss.line) scene.add(moss.line);
        tops.forEach((it, k) => { const i = items.indexOf(it); moss.set(k, stand(it.p, it.f, fl(it.p) + top[i] + 0.05, 0.6 + rnd() * 0.3, 0.32, D + 0.25, rnd() * 3), k % 2 ? C.moss : C.mossDark); }); moss.done();
        const vines = []; items.forEach((it, i) => { if (i % 4 === 1) vines.push([it, i, 1]); if (i % 5 === 3) vines.push([it, i, -1]); });
        const vm = Y.instanced(G.cylLow, vines.length, 0.03); scene.add(vm.body); if (vm.line) scene.add(vm.line);
        vines.forEach(([it, i, side], k) => { const len = 0.6 + rnd() * 1.3, q = walk(it.p, it.f, -side * (D / 2 + 0.06) / R); vm.set(k, stand(q, it.f, fl(it.p) + top[i] - len / 2, 0.07, len, 0.07, 0), k % 2 ? C.vine : 0x55b84c); }); vm.done();
        const fls = items.filter((_, i) => i % 6 === 2), fm = Y.instanced(G.sphLow, fls.length, 0.03); scene.add(fm.body); if (fm.line) scene.add(fm.line);
        fls.forEach((it, k) => { const i = items.indexOf(it), side = k % 2 ? 1 : -1, q = walk(it.p, it.f, -side * (D / 2 + 0.14) / R); fm.set(k, stand(q, it.f, fl(it.p) + top[i] * (0.35 + (k % 3) * 0.18), 0.16, 0.16, 0.16, 0), [0xff7ab8, 0xffe45a, 0xffffff][k % 3]); }); fm.done();
    }
    // A glass wall: clear crystal panels in a frame (you can see what's behind it, but a coconut bounces off). For a target you
    // must hit some other way than straight at it.
    function glassWall(w, hh) {
        const items = arcPoints(w, 0.5), pane = Y.instanced(G.box, items.length, 0, { transparent: true, opacity: 0.45, depthWrite: false }), post = Y.instanced(G.box, items.length, 0.05);
        for (const i of [pane, post]) { scene.add(i.body); if (i.line) scene.add(i.line); }
        items.forEach((it, i) => { const base = fl(it.p); pane.set(i, stand(it.p, it.f, base + hh / 2, it.len * 1.02, hh, 0.08), 0x9be7ff); post.set(i, stand(walk(it.p, tangent(it.p, cross(it.p, it.f)), (it.len / 2) / R), it.f, base + hh / 2, 0.1, hh + 0.1, 0.14), i % 2 ? 0x6fb8d8 : 0x8fd0ea); });
        pane.done(); post.done();
        const top = Y.instanced(G.box, items.length, 0.04); scene.add(top.body); if (top.line) scene.add(top.line); items.forEach((it, i) => top.set(i, stand(it.p, it.f, fl(it.p) + hh + 0.05, it.len * 1.05, 0.1, 0.18), 0xdff6ff)); top.done();
    }
    // A coral cave: a ring of coral heads round a bullseye, open only at its mouth (the gap), with a couple of chinks to peek
    // through; brain coral and sea fans on top. Low enough that the bullseye's face shows over it.
    function coralCave(w) {
        const items = arcPoints(w, 0.36), rnd = rngOf(61), rows = [[0.0, 0.62, 0.7], [0.5, 0.52, 0.6], [0.95, 0.42, 0.48]], cols = [[0xff7f9e, 0xf06a8c, 0xffb35c], [0xb98be6, 0xa877dc, 0xff9bb3], [0x6fe0c5, 0xffb35c, 0xff7f9e]];
        const total = items.length * rows.length, m = Y.instanced(G.rockSoft, total, 0.06); scene.add(m.body); if (m.line) scene.add(m.line); let k = 0;
        items.forEach((it, i) => rows.forEach(([y, s, d], ri) => { const peek = ri === 1 && (i % 7 === 3); const base = fl(it.p); m.set(k++, stand(it.p, it.f, base + y + s * 0.5, peek ? 0.001 : s * (1 + rnd() * 0.3), peek ? 0.001 : s * (0.8 + rnd() * 0.3), peek ? 0.001 : d, rnd() * 2), cols[ri][(i + ri) % 3]); }));
        m.done();
        const tops = items.filter((_, i) => i % 3 === 1);
        tops.forEach((it, i) => { const base = fl(it.p) + 1.3, g = i % 2 ? Y.prop([{ geo: G.sph, color: 0xffd1a8, s: [0.5, 0.36, 0.5], p: [0, 0.12, 0] }, { geo: G.box, color: 0xe8a07a, s: [0.36, 0.03, 0.04], p: [0, 0.3, 0], ink: false }], { thick: 0.04 })
            : Y.prop([{ geo: G.coneLow, color: 0xb98be6, s: [0.5, 0.8, 0.08], p: [0, 0.4, 0] }, { geo: G.coneLow, color: 0xcaa2ef, s: [0.34, 0.6, 0.07], p: [0.15, 0.32, 0.02], r: [0, 0, -0.4] }], { thick: 0.03 }); put(g, it.p, it.f, base); scene.add(g); });
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
        if (kind === 'cliff') strataWall(w, { h: 3.2, bands: 7, depth: 1.5, colors: [0xc4742f, 0xd9893f, 0xe69b52, 0xb5652a, 0xd98a52, 0xf0b070, 0xc97a3a], moss: true });
        else if (kind === 'crater') strataWall(w, { h: 2.3, bands: 5, depth: 1.5, colors: [0x8a81b2, 0x9d94c2, 0xb2aad4, 0x7a7298, 0xc2bbdc] });
        else if (kind === 'coralLow') boulderWall(w, kind, [{ y0: 0, h: 1.2, thick: 0.08, color: [0xff7f9e, 0xf06a8c, 0xffb35c], depth: 0.8, wide: 1.3 }, { y0: 0.9, h: 0.6, thick: 0.07, color: [0xb98be6, 0x6fe0c5], depth: 0.6, inset: 0.05, wide: 1.2 }], 0.42);
        else if (kind === 'coral') { coralTops(w); } if (kind === 'coral') boulderWall(w, kind, [
            { y0: 0, h: 1.5, thick: 0.1, color: [0xff7f9e, 0xf06a8c, 0xff9bb3], depth: 1.4, wide: 1.4 },
            { y0: 1.1, h: 1.3, thick: 0.1, color: [0xb98be6, 0xa877dc, 0xcaa2ef], depth: 1.1, inset: 0.15, wide: 1.3 },
            { y0: 2.1, h: 0.9, thick: 0.09, color: [0xffb35c, 0xff9f45, 0x6fe0c5], depth: 0.9, inset: 0.3, wide: 1.2 }], w.r < 1.5 ? 0.45 : 0.6);
        else if (kind === 'cove' && w.look === 'glass') glassWall(w, 3.4);
        else if (kind === 'cove' && w.look === 'coralcave') coralCave(w);
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
    // Things that ride the tide on a floating island: each frame they go up by the water's height.
    const riders = [], rides = p => !!(level.tide && (level.ledges || []).some(l => l.ride && K.dist(p, l.c || TOP) >= l.r0 && K.dist(p, l.c || TOP) < l.r1 && K.covers(l, p)));
    const gatedLedges = [];
    // Terraces, ramps and shelves: raised ground with a grassy (or stone) top and rocky cliff sides, darker bands of strata.
    const LEDGE = { boardwalk: { top: [0xd9a066, 0xc98f52], side: [0xa87440, 0x8a5a2e, 0xb98249], open: true }, boardwalkRamp: { top: [0xd9a066, 0xc98f52], side: [0xa87440, 0x8a5a2e], open: true }, bridge: { top: [0xe0aa70, 0xc98f52], side: [0x8a5a2e, 0xa87440], open: true }, stack: { top: [0x7fcf5c, 0x6fbf4f], side: [0x8f86a8, 0x7d7496, 0xa29abb] }, basalt: { top: [0x5a4a5e, 0x514356], side: [0x3a2c3c, 0x46343f, 0x2e2230] }, obsidian: { top: [0x1c1726, 0x231d30], side: [0x120e1a, 0x18131f, 0x0e0b14] },  beachShelf: { top: [0xf2d9cf, 0xe7c7bd], side: [0xd9bfae, 0xccb09e, 0xe2cbbd] },  coralShelf: { top: [0xff9bb3, 0xff8aa6], side: [0xb98be6, 0xa877dc, 0xcaa2ef] },  terrace: { top: [0x8fd96a, 0x7fcf5c], side: [0xc9935a, 0xb98249, 0xd6a46a] }, mesa: { top: [0xe8b46a, 0xdca65c], side: [0xd9893f, 0xc4742f, 0xe69b52] }, ramp: { top: [0xcfae7a, 0xc19f6c], side: [0xa98758, 0x977648, 0xb89668] }, shelf: { top: [0xaab0c4, 0x9aa1b6], side: [0x8890a8, 0x7a8299, 0x969db3] } };
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
            if (pal.open) { quad(P3(rA, aA, hA - 0.28), P3(rB, aB, hB - 0.28), P3(rB, aB, hB), P3(rA, aA, hA), pal.side[0], 0.95); return; }
            if (l.ride) quad(P3(rA, aA, -3), P3(rB, aB, -3), P3(rB, aB, -0.05), P3(rA, aA, -0.05), pal.side[2 % pal.side.length], 0.75);      // (a floating island's underside, hidden under the water)
            for (let b = 0; b < bands; b++) { const y0 = b / bands, y1 = (b + 1) / bands; quad(P3(rA, aA, hA * y0 - 0.05), P3(rB, aB, hB * y0 - 0.05), P3(rB, aB, hB * y1), P3(rA, aA, hA * y1), pal.side[b % pal.side.length], 0.9 + hash(rA + aA, b) * 0.15); }
        };
        for (let j = 0; j < nL; j++) { const a0 = lon0 + (j / nL) * (lon1 - lon0), a1 = lon0 + ((j + 1) / nL) * (lon1 - lon0); side(l.r1, a1, l.r1, a0); if (l.r0 > 0.01) side(l.r0, a0, l.r0, a1); }
        if (partial) for (let i = 0; i < nR; i++) { const r0 = l.r0 + (i / nR) * (l.r1 - l.r0), r1 = l.r0 + ((i + 1) / nR) * (l.r1 - l.r0); side(r0, lon0, r1, lon0); side(r1, lon1, r0, lon1); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        const mesh = new T.Mesh(geo, Y.toon(0xffffff, { vertexColors: true, side: T.DoubleSide })); scene.add(mesh);
        if (l.ride) riders.push({ obj: mesh, island: true });
        if (pal.open) {          // stilts: wooden posts down to the water, along the edges and across
            const pts = []; for (const rr of [l.r0 + 0.25, (l.r0 + l.r1) / 2, l.r1 - 0.25]) { const circ2 = 2 * Math.PI * R * Math.sin(Math.max(rr, 0.5) / R), n2 = Math.max(4, Math.round(circ2 * (lon1 - lon0) / 360 / 1.6)); for (let j = 0; j < n2; j++) pts.push(around(c0, rr, lon0 + ((j + 0.5) / n2) * (lon1 - lon0))); }
            const st = Y.instanced(G.cylLow, pts.length, 0.05); scene.add(st.body); if (st.line) scene.add(st.line);
            pts.forEach((q, i) => { const hq = hAt(K.dist(q, c0)); st.set(i, stand(q, [1, 0, 0], (hq - 0.28) / 2, 0.22, Math.max(0.05, hq - 0.28), 0.22), i % 2 ? 0x8a5a2e : 0x9a6534); }); st.done();
        }
        if (l.gate) {        // closed, the drawbridge stands up at the deck's edge on its chains
            const lonM = l.only ? l.only[0] : 0, edge = around(c0, l.r1 - 0.15, lonM), wd = 2 * Math.PI * R * Math.sin(l.r1 / R) * ((l.only ? l.only[1] * 2 : 10) / 360);
            const raised = Y.prop([{ geo: G.box, color: 0xc98f52, s: [wd * 0.95, 2.6, 0.16], p: [0, 1.3, 0] }, ...[0.5, 1.3, 2.1].map(y => ({ geo: G.box, color: 0x8a5a2e, s: [wd, 0.14, 0.2], p: [0, y, 0] })),
                ...[-1, 1].map(sx => ({ geo: G.cylLow, color: 0x6b7388, s: [0.06, 1.6, 0.06], p: [sx * wd * 0.45, 2.2, -0.5], r: [0.6, 0, 0] }))], { thick: 0.06 });
            put(raised, edge, toward(edge, c0), l.h1 != null ? l.h1 : l.h); scene.add(raised); gatedLedges.push({ l, mesh, raised });
        }
    }
    // Stone posts (a pillar is a tall one): a column with rings and a cap.
    for (const k of level.posts || []) {
        const base = K.floorAt({ ...sfl, lv: { ...level, posts: [] } }, k.p), hh = k.h - base;
        const g = k.kind === 'shrine' ? Y.prop([{ geo: G.cylLow, color: 0xd9c3b0, s: [k.r * 2.6, 0.3, k.r * 2.6], p: [0, 0.15, 0] }, { geo: G.cyl, color: 0xeee2d0, s: [k.r * 1.5, hh - 0.4, k.r * 1.5], p: [0, 0.3 + (hh - 0.4) / 2, 0] },
                { geo: G.cylLow, color: 0xffb3c6, s: [k.r * 2.1, 0.16, k.r * 2.1], p: [0, hh - 0.05, 0] }, { geo: G.sphLow, color: 0xff8aa6, s: [k.r * 1.3, 0.35, k.r * 1.3], p: [0, hh + 0.08, 0] },
                ...[[0.3, 0.2], [-0.25, 0.35], [0.1, -0.3]].map(([x, z]) => ({ geo: G.sphLow, color: 0x7b3fe4, s: [0.22, 0.05, 0.16], p: [x * k.r * 2, hh + 0.04, z * k.r * 2], ink: false }))], { thick: 0.06 })
            : k.kind === 'hut' ? Y.prop([...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => ({ geo: G.cylLow, color: 0x8a5a2e, s: [0.14, hh * 0.45, 0.14], p: [x * k.r * 0.75, hh * 0.22, z * k.r * 0.75] })),
                { geo: G.box, color: 0xe8d2b0, s: [k.r * 1.9, hh * 0.42, k.r * 1.7], p: [0, hh * 0.65, 0] }, { geo: G.box, color: 0x5fb8d8, s: [k.r * 0.5, hh * 0.18, 0.05], p: [0, hh * 0.68, k.r * 0.86] },
                { geo: G.coneLow, color: 0xd9653f, s: [k.r * 2.9, hh * 0.32, k.r * 2.6], p: [0, hh * 0.95, 0], r: [0, Math.PI / 4, 0] }, { geo: G.box, color: 0xc98f52, s: [k.r * 2.2, 0.12, k.r * 2.0], p: [0, hh - 0.04, 0] }], { thick: 0.06 })
            : k.kind === 'mast' ? Y.prop([{ geo: G.cyl, color: 0xa87440, s: [k.r * 1.6, hh, k.r * 1.6], p: [0, hh / 2, 0] }, { geo: G.box, color: 0x9a6534, s: [2.4, 0.12, 0.12], p: [0, hh * 0.6, 0] },
                { geo: G.cylLow, color: 0xc98f52, s: [1.3, 0.5, 1.3], p: [0, hh - 0.15, 0] }, { geo: G.box, color: 0xff5f5f, s: [0.7, 0.4, 0.04], p: [0.4, hh + 0.75, 0] }, { geo: G.cylLow, color: 0x8a5a2e, s: [0.06, 1.0, 0.06], p: [0, hh + 0.5, 0] }], { thick: 0.06 })
            : k.kind === 'obsidian' ? Y.prop([{ geo: G.cyl, color: 0x2a2236, s: [k.r * 2, hh, k.r * 2], p: [0, hh / 2, 0] }, { geo: G.coneLow, color: 0x3e3352, s: [k.r * 1.9, 0.6, k.r * 1.9], p: [0, hh + 0.3, 0] }, { geo: G.box, color: 0x8a74c4, s: [0.08, hh * 0.7, 0.04], p: [k.r * 0.6, hh * 0.5, k.r * 0.75], ink: false }], { thick: 0.06 }) : k.kind === 'lighthouse' ? Y.prop([...[0, 1, 2, 3].map(j => ({ geo: G.cyl, color: j % 2 ? 0xffffff : 0xff4d4d, s: [k.r * 2 * (1 - j * 0.06), hh / 4, k.r * 2 * (1 - j * 0.06)], p: [0, hh / 8 + (j * hh) / 4, 0] })), { geo: G.cylLow, color: 0xffe45a, s: [k.r * 1.3, 0.12, k.r * 1.3], p: [0, hh + 0.06, 0], ink: false }], { thick: 0.07 }) : Y.prop([{ geo: G.cyl, color: 0xb7aec8, s: [k.r * 2, hh, k.r * 2], p: [0, hh / 2, 0] }, { geo: G.cylLow, color: 0x9a90ae, s: [k.r * 2.3, 0.18, k.r * 2.3], p: [0, 0.09, 0] }, { geo: G.cylLow, color: 0x9a90ae, s: [k.r * 2.25, 0.12, k.r * 2.25], p: [0, hh * 0.55, 0] }, { geo: G.cylLow, color: 0xd0c8de, s: [k.r * 2.4, 0.2, k.r * 2.4], p: [0, hh - 0.1, 0] }], { thick: 0.07 });
        put(g, k.p, [1, 0, 0], base); scene.add(g);
    }
    // Jelly pads: a pink wobbly dome.
    const padMeshes = (level.pads || []).map(k => { const g = Y.prop([{ geo: G.sph, color: 0xff8ad8, s: [k.r * 2, 0.5, k.r * 2], p: [0, 0.05, 0] }, { geo: G.sphLow, color: 0xffd1f0, s: [k.r * 0.8, 0.12, k.r * 0.6], p: [-k.r * 0.3, 0.24, -k.r * 0.2], ink: false }], { thick: 0.06 }); put(g, k.p, k.to ? toward(k.p, k.to) : [1, 0, 0], fl(k.p) - 0.02 - (K.PAD_H || 0.25) + 0.02); scene.add(g);
        if (k.to) { const ar = Y.prop([{ geo: G.box, color: 0xfff3a0, s: [0.22, 0.06, 0.6], p: [0, 0.3, -0.1] }, { geo: G.coneLow, color: 0xfff3a0, s: [0.5, 0.45, 0.08], p: [0, 0.3, 0.38], r: [Math.PI / 2, 0, 0] }], { thick: 0.04 }); g.add(ar); }
        return { k, g, wob: 0 }; });
    // Stone walls (the bank-shot lane, the ramp's rails): a low run of blocks along each bar.
    for (const b of (level.bars || []).filter(x => x.kind === 'chute' && x.look === 'coral')) {          // coral reef rails: a low ridge of coral heads
        const len = K.dist(b.a, b.b), n = Math.max(3, Math.round(len / 0.32)), m = Y.instanced(G.rockSoft, n * 2, 0.06), nrm = norm(cross(b.a, b.b)), rnd = rngOf(77); scene.add(m.body); if (m.line) scene.add(m.line);
        for (let i = 0; i < n; i++) { const tt = (i + 0.5) / n, p = norm(mix(b.a, b.b, 1 - tt, tt)), base = fl(p), c2 = [0xff7f9e, 0xffb35c, 0xb98be6, 0x6fe0c5][i % 4];
            m.set(i * 2, stand(p, tangent(p, nrm), base + 0.2, 0.62 + rnd() * 0.2, 0.42 + rnd() * 0.18, 0.56, rnd() * 3), c2); m.set(i * 2 + 1, stand(p, tangent(p, nrm), base + (i % 3 ? 0.001 : 0.5), i % 3 ? 0.001 : 0.3, i % 3 ? 0.001 : 0.36, i % 3 ? 0.001 : 0.28, rnd() * 3), [0xffd1a8, 0xff9bb3, 0xcaa2ef][i % 3]); }
        m.done();
    }
    for (const b of (level.bars || []).filter(x => x.kind === 'chute' && x.look === 'glass')) {         // glass rails: see the bullseye down the chute
        const len = K.dist(b.a, b.b), n = Math.max(2, Math.round(len / 0.5)), pane = Y.instanced(G.box, n, 0, { transparent: true, opacity: 0.45, depthWrite: false }), rail = Y.instanced(G.box, n, 0.04), nrm = norm(cross(b.a, b.b));
        for (const i of [pane, rail]) { scene.add(i.body); if (i.line) scene.add(i.line); }
        for (let i = 0; i < n; i++) { const tt = (i + 0.5) / n, p = norm(mix(b.a, b.b, 1 - tt, tt)), base = fl(p); pane.set(i, stand(p, tangent(p, nrm), base + 0.75, 0.08, 1.5, len / n * 1.02), 0x9be7ff); rail.set(i, stand(p, tangent(p, nrm), base + 1.52, 0.16, 0.1, len / n * 1.05), 0xdff6ff); }
        pane.done(); rail.done();
    }
    for (const b of (level.bars || []).filter(x => x.kind === 'lane' || x.kind === 'rail' || (x.kind === 'chute' && !x.look))) {
        const len = K.dist(b.a, b.b), n = Math.max(2, Math.round(len / 0.5)), m = Y.instanced(G.rockSoft, n, 0.08), nrm = norm(cross(b.a, b.b)); scene.add(m.body); scene.add(m.line);
        for (let i = 0; i < n; i++) { const tt = (i + 0.5) / n, p = norm(mix(b.a, b.b, 1 - tt, tt)), base = fl(p), hh = b.kind === 'rail' ? 1.0 : b.kind === 'chute' ? 1.3 : Math.max(0.8, b.h - base); m.set(i, stand(p, tangent(p, nrm), base + hh / 2, 0.62, hh, 0.7, hash(i, 2) * 2), [0x9aa1b6, 0x8890a8, 0xaab0c4][i % 3]); }
        m.done();
    }
    // Deep pools: dark water with a lighter rim, sitting on the ground they're in.
    const poolMeshes = (level.pools || []).map((q, i) => { const base = fl(q.p), g = new T.Group(); const w = new T.Mesh(G.disc, basic(0x2f7fc4, { transparent: true, opacity: 0.92 })); w.scale.setScalar(q.r); g.add(w); const rim = new T.Mesh(G.ring, basic(0x9fdcff, { transparent: true, opacity: 0.8, side: T.DoubleSide })); rim.scale.setScalar(q.r); rim.position.y = 0.01; g.add(rim); const deep = new T.Mesh(G.disc, basic(0x1d5a96, { transparent: true, opacity: 0.85 })); deep.scale.setScalar(q.r * 0.55); deep.position.y = 0.005; g.add(deep);
        const ripple = new T.Mesh(G.ring, basic(0xdff6ff, { transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide })); ripple.position.y = 0.015; g.add(ripple);
        put(g, q.p, [1, 0, 0], base + 0.06 + i * 0.004); scene.add(g);
        // a rim of wet stones, where this pool's edge isn't inside another pool
        const others = (level.pools || []).filter(o => o !== q), n = Math.max(10, Math.round(2 * Math.PI * q.r / 0.42)), pts = [];
        for (let k = 0; k < n; k++) { const pp = around(q.p, q.r + 0.05, (k / n) * 360); if (!others.some(o => K.dist(o.p, pp) < o.r - 0.05)) pts.push(pp); }
        if (pts.length) { const st = Y.instanced(G.rockSoft, pts.length, 0.05); scene.add(st.body); if (st.line) scene.add(st.line); pts.forEach((pp, k) => st.set(k, stand(pp, toward(pp, q.p), fl(pp) + 0.08, 0.42 + hash(k, i) * 0.2, 0.26, 0.36, hash(i, k) * 3), [0x9aa1b6, 0x7f8aa6, 0xb2b9cc][k % 3])); st.done(); }
        return { q, g, rim, ripple }; });
    // The bumper: a bright yellow board on a stone footing, with arrows on its face pointing the way a coconut glances off.
    const bumpers = (level.bars || []).filter(x => x.kind === 'bumper').map(b => {
        const mid = norm(mix(b.a, b.b, 0.5, 0.5)), len = K.dist(b.a, b.b), base = fl(mid), along = toward(mid, b.b), nrm = tangent(mid, cross(mid, along)), g = new T.Group();
        const sp = (level.spots || []).find(x => x.via && K.dist(x.via, mid) < 0.5), face = sp ? (K.dist(walk(mid, nrm, 0.3 / R), sp.p) < K.dist(walk(mid, nrm, -0.3 / R), sp.p) ? 1 : -1) : 1;
        if (b.look === 'rock') g.add(Y.prop([
            ...[0, 1, 2, 3].flatMap(k => [-1, 0, 1].map(j => ({ geo: G.rockSoft, color: [0x6e6a86, 0x7d7896, 0x5f5b78, 0x8a85a2][(k + j + 3) % 4], s: [len * 0.42 + (j ? 0 : 0.2), 0.86 - k * 0.04, 1.1 - k * 0.08], p: [j * len * 0.3 + ((k % 2) - 0.5) * 0.12, 0.38 + k * 0.68, -0.12] }))),
            { geo: G.sph, color: 0xb8bfd2, s: [len - 0.4, 2.0, 0.3], p: [0, 1.45, face * 0.3] }, { geo: G.rockSoft, color: 0x6e6a86, s: [0.9, 0.9, 0.9], p: [len / 2, 0.3, 0.2] }, { geo: G.rockSoft, color: 0x7d7896, s: [0.8, 0.7, 0.8], p: [-len / 2, 0.25, 0.1] },
            { geo: G.sph, color: 0x7ad65a, s: [len * 0.9, 0.3, 0.8], p: [0, 2.95, -0.1] }, { geo: G.sphLow, color: 0x55b84c, s: [0.5, 0.3, 0.5], p: [len * 0.32, 3.05, 0.0] }], { thick: 0.07 }));
        else g.add(Y.prop([{ geo: G.box, color: 0x8890a8, s: [len + 0.6, 0.45, 0.9], p: [0, 0.22, 0] },
            { geo: G.box, color: 0xff5fa8, s: [len - 0.2, 1.9, 0.5], p: [0, 1.5, 0] }, { geo: G.cyl, color: 0xff8ac4, s: [0.6, len - 0.2, 0.6], p: [0, 2.45, 0], r: [0, 0, Math.PI / 2] }, { geo: G.cyl, color: 0xff8ac4, s: [0.6, len - 0.2, 0.6], p: [0, 0.6, 0], r: [0, 0, Math.PI / 2] },
            ...[-1, 1].flatMap(sx => [{ geo: G.cyl, color: 0xf5f5f5, s: [0.34, 2.9, 0.34], p: [sx * (len / 2), 1.45, 0] }, { geo: G.sph, color: 0xffd23a, s: [0.46, 0.46, 0.46], p: [sx * (len / 2), 3.0, 0] },
                ...[0, 1, 2].map(k => ({ geo: G.cylLow, color: 0xc9d2e6, s: [0.5, 0.1, 0.5], p: [sx * (len / 2), 0.9 + k * 0.5, 0] }))])], { thick: 0.08 }));
        const star = new T.Group(); for (let k = 0; k < 4; k++) { const bar = new T.Mesh(G.box, basic(0xffffff)); bar.scale.set(0.9, 0.12, 0.05); bar.rotation.z = k * Math.PI / 4; star.add(bar); } star.position.set(0, 1.5, face * (b.look === 'rock' ? 0.46 : 0.27)); g.add(star);
        if (sp) for (let k = 0; k < 3; k++) {    // chevrons: from where the coconut comes in, to where it goes out
            const ch = new T.Group(); for (const sgn of [1, -1]) { const bar = new T.Mesh(G.box, basic(0x2b1240)); bar.scale.set(0.5, 0.11, 0.05); bar.position.set(0, sgn * 0.14, 0); bar.rotation.z = sgn * 0.6; ch.add(bar); }
            const outDir = K.dist(walk(mid, along, 0.5 / R), sp.to) < K.dist(walk(mid, along, -0.5 / R), sp.to) ? 1 : -1;
            ch.position.set((k - 1) * 0.7 + (k - 1) * 0.15, 1.5, face * (b.look === 'rock' ? 0.47 : 0.27)); if (k === 1) ch.visible = false; ch.rotation.y = face > 0 ? 0 : Math.PI; ch.scale.x = outDir * face; g.add(ch);
        }
        put(g, mid, along, base); g.rotateY(Math.PI / 2); scene.add(g); return g;
    });
    // The throw spot: a painted ring with crab footprints and a coconut, and green dots from it to the bumper and on to the bullseye.
    const spots = (level.spots || []).map(sp => {
        const base = fl(sp.p), g = new T.Group(), ring = new T.Mesh(G.ring, basic(0xffd23a, { transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false })); ring.scale.setScalar(0.75); g.add(ring);
        const fill = new T.Mesh(G.disc, basic(0xffd23a, { transparent: true, opacity: 0.25, depthWrite: false })); fill.scale.setScalar(0.62); g.add(fill);
        for (const [x, z] of [[-0.18, -0.1], [0.18, -0.1], [-0.25, 0.15], [0.25, 0.15]]) { const f2 = new T.Mesh(G.disc, basic(0xb07a2e)); f2.scale.setScalar(0.07); f2.position.set(x, 0.01, z); g.add(f2); }
        put(g, sp.p, toward(sp.p, sp.via), base + 0.08); scene.add(g);
        const dots = [];
        for (const [a, b, st, en, col] of [[sp.p, sp.via, 0.85, 0.5, 0xffd23a], ...(sp.to ? [[sp.via, sp.to, 0.5, 0.9, 0x4ade80]] : [])]) { const len = K.dist(a, b), n = Math.max(2, Math.floor((len - st - en) / 0.4)); for (let k = 0; k <= n; k++) { const f = (st + k * (len - st - en) / n) / len, p = norm(mix(a, b, 1 - f, f)), d = new T.Mesh(G.disc, basic(col, { transparent: true, opacity: 0.6, depthWrite: false })); d.scale.setScalar(0.15); put(d, p, null, fl(p) + 0.1); scene.add(d); dots.push(d); } }
        return { sp, g, ring, dots, said: false };
    });
    // Holes through the planet: a dark mouth with a sandy rim; a blowhole has a grate over it (coconuts only); a lid is a crystal
    // dome that sinks away when its bullseye is hit. Where each one comes out, a faint swirl on the ground.
    const holeVis = (level.holes || []).map(h => {
        const base = fl(h.p), g = new T.Group(), mouth = new T.Mesh(G.disc, basic(0x0e1a24)); mouth.scale.setScalar(h.r); mouth.position.y = 0.03; g.add(mouth);
        const rim = Y.prop([{ geo: G.cylLow, color: h.nutOnly ? 0xff8aa6 : 0xd9c3b0, s: [h.r * 2 + 0.4, 0.14, h.r * 2 + 0.4], p: [0, 0.02, 0] }], { thick: 0.05 }); rim.children.length; g.add(rim); mouth.position.y = 0.1;
        if (h.nutOnly) for (let k = -2; k <= 2; k++) { const bar = Y.part(G.box, 0x8a7aa0, 0.02); bar.scale.set(h.r * 1.8 * Math.sqrt(1 - (k / 3) ** 2), 0.06, 0.08); bar.position.set(0, 0.16, k * h.r * 0.32); g.add(bar); }
        let lid = null; if (h.lid) { lid = new T.Mesh(new T.SphereGeometry(h.r + 0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), Y.toon(GATE_COLOR[h.lid] || 0x9be7ff, { transparent: true, opacity: 0.75, emissive: new T.Color(0x3fa9c4) })); g.add(lid); }
        put(g, h.p, [1, 0, 0], base); scene.add(g);
        const out = K.holeExit(h), sw = new T.Mesh(G.ring, basic(0x0e1a24, { transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide })); sw.scale.setScalar(0.6); put(sw, out, null, fl(out) + 0.07); scene.add(sw);
        return { h, g, lid, sw, k: 0 };
    });
    if (!level.theme || level.theme === 'beach') {      // a beach that looks lived on: starfish, shells, driftwood, pebbles, tufts of dune grass (on the open sand only)
        const avoid = [level.start, level.palm, ...(level.posts || []).map(k => k.p), ...(level.pads || []).map(k => k.p), ...(level.signs || []).map(k => k.p), ...(level.checks || [])];
        const rnd = rngOf(4242); let made = 0;
        for (let i = 0; i < 160 && made < 30; i++) {
            const p = K.at((level.bank || 12) + 0.9 + rnd() * (19.8 - (level.bank || 12) - 0.9), rnd() * 360); if (avoid.some(a => a && K.dist(a, p) < 1.5) || fl(p) > 0.05) continue; made++;
            const kind = i % 5, c = [0xff7a5c, 0xffb35c, 0xff8ad8][i % 3];
            const g = kind === 0 ? Y.prop([0, 1, 2, 3, 4].map(k => ({ geo: G.coneLow, color: c, s: [0.16, 0.42, 0.06], p: [Math.sin(k * 1.257) * 0.17, 0.04, Math.cos(k * 1.257) * 0.17], r: [Math.PI / 2, k * 1.257, 0] })).concat([{ geo: G.sphLow, color: c, s: [0.22, 0.08, 0.22], p: [0, 0.04, 0] }]), { thick: 0.03 })      // a starfish
                : kind === 1 ? Y.prop([{ geo: G.coneLow, color: 0xffe0ec, s: [0.26, 0.34, 0.26], p: [0, 0.12, 0], r: [0, 0, 1.3] }, { geo: G.sphLow, color: 0xff9ec4, s: [0.14, 0.14, 0.14], p: [-0.14, 0.06, 0] }], { thick: 0.03 })      // a shell
                : kind === 2 ? Y.prop([{ geo: G.cylLow, color: 0xc9a27a, s: [0.18, 1.3, 0.18], p: [0, 0.09, 0], r: [0, 0, Math.PI / 2] }, { geo: G.cylLow, color: 0xb08a62, s: [0.1, 0.5, 0.1], p: [0.3, 0.2, 0.08], r: [0.5, 0, 0.9] }], { thick: 0.04 })      // driftwood
                : kind === 3 ? Y.prop([0, 1, 2].map(k => ({ geo: G.rockSoft, color: [0xb7aec8, 0x9a90ae, 0xd0c8de][k], s: [0.28 - k * 0.06, 0.18 - k * 0.03, 0.24 - k * 0.05], p: [k * 0.22 - 0.2, 0.06, (k % 2) * 0.16] })), { thick: 0.03 })      // pebbles
                : Y.prop([0, 1, 2, 3].map(k => ({ geo: G.coneLow, color: k % 2 ? 0x8fbf5a : 0x6fa64a, s: [0.07, 0.5 + k * 0.08, 0.07], p: [(k - 1.5) * 0.08, 0.25, (k % 2) * 0.06], r: [0, 0, (k - 1.5) * 0.2] })), { thick: 0.025 });      // dune grass
            put(g, p, [rnd() - 0.5, 0.1, rnd() - 0.5], fl(p)); scene.add(g);
        }
    }
    if (level.boss) {      // Old Ink's arena: puddles of ink, and his pots, broken
        const keep = [...(level.plates || []).map(x => x.p), ...(level.targets || []).map(x => x.p), ...(level.signs || []).map(x => x.p)], rnd = rngOf(909);
        for (let i = 0; i < 9; i++) { const p = K.at(3.4 + rnd() * 1.9, i * 40 + rnd() * 20); if (keep.some(k => K.dist(k, p) < 1.3)) continue;
            if (i % 3) { const pu = new T.Mesh(G.disc, basic(0x3a1a6a, { transparent: true, opacity: 0.7, depthWrite: false })); pu.scale.set(0.5 + rnd() * 0.5, 1, 0.35 + rnd() * 0.4); put(pu, p, [rnd() - 0.5, 0, rnd() - 0.5], fl(p) + 0.03); scene.add(pu); }
            else { const pot = Y.prop([{ geo: G.cylLow, color: 0xc98a5a, s: [0.5, 0.35, 0.5], p: [0, 0.17, 0] }, { geo: G.coneLow, color: 0xb0764a, s: [0.3, 0.3, 0.12], p: [0.3, 0.08, 0.1], r: [1.2, 0.4, 0] }, { geo: G.coneLow, color: 0xd99a6a, s: [0.22, 0.24, 0.1], p: [-0.28, 0.06, -0.12], r: [1.4, -0.6, 0] }], { thick: 0.04 }); put(pot, p, [rnd() - 0.5, 0, rnd() - 0.5], fl(p)); scene.add(pot); } }
    }
    if (THEME.decor) {      // kelp and coral bushes on the open sand, away from anything you need to use
        const avoid = [level.start, level.palm, ...(level.holes || []).map(h => h.p), ...(level.posts || []).map(k => k.p), ...(level.pads || []).map(k => k.p), ...(level.spots || []).map(k => k.p)];
        const rnd = rngOf(907); let made = 0;
        for (let i = 0; i < 90 && made < 26; i++) {
            const p = K.at((level.bank || 7) + 1.2 + rnd() * (19.6 - (level.bank || 7) - 1.2), rnd() * 360); if (avoid.some(a => a && K.dist(a, p) < 1.8)) continue; made++;
            const kelp = rnd() > 0.5, g = kelp ? Y.prop([0, 1, 2].map(k => ({ geo: G.cyl, color: k % 2 ? 0x2fae8c : 0x45c79f, s: [0.12, 1.3 + k * 0.4, 0.12], p: [(k - 1) * 0.18, (1.3 + k * 0.4) / 2, (k % 2) * 0.12], r: [0, 0, (k - 1) * 0.15] })), { thick: 0.04 })
                : Y.prop([{ geo: G.sphLow, color: [0xff7f9e, 0xffb35c, 0xb98be6][i % 3], s: [0.7, 0.5, 0.7], p: [0, 0.25, 0] }, { geo: G.coneLow, color: [0xff9bb3, 0xffc77f, 0xcaa2ef][i % 3], s: [0.2, 0.6, 0.2], p: [0.15, 0.6, 0] }, { geo: G.coneLow, color: [0xff9bb3, 0xffc77f, 0xcaa2ef][i % 3], s: [0.16, 0.5, 0.16], p: [-0.2, 0.5, 0.1] }], { thick: 0.05 });
            put(g, p, [rnd(), 0.2, rnd()], fl(p)); scene.add(g); if (rides(p)) riders.push({ obj: g });
        }
    }
    // Launch pads: a glowing ring with a chevron pointing up; where it flies you, the other world hangs in the sky.
    const launchVis = (level.launch || []).map(k => {
        const g = Y.prop([{ geo: G.cylLow, color: 0x6b5fa8, s: [k.r * 2.3, 0.2, k.r * 2.3], p: [0, 0.1, 0] }, { geo: G.cylLow, color: 0x9be7ff, s: [k.r * 1.7, 0.08, k.r * 1.7], p: [0, 0.22, 0], ink: false }], { thick: 0.06 });
        for (let j = 0; j < 3; j++) { const ch = new T.Mesh(G.coneLow, basic(0xffffff, { transparent: true, opacity: 0.8 })); ch.scale.set(0.35, 0.3, 0.35); ch.position.y = 0.5 + j * 0.45; ch.userData.j = j; g.add(ch); }
        put(g, k.p, [1, 0, 0], fl(k.p)); scene.add(g); return { k, g };
    });
    if (THEME.stars) { const pos = []; const rnd = rngOf(55); for (let i = 0; i < 260; i++) { const v = new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(120); pos.push(v.x, v.y, v.z); } const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.7 }))); }
    if (THEME.craters) { const rnd = rngOf(77); for (let i = 0; i < 14; i++) { const p = K.at(7.5 + rnd() * 12, rnd() * 360); if ((level.launch || []).some(k => K.dist(k.p, p) < 2) || (level.posts || []).some(k => K.dist(k.p, p) < 1.5)) continue; const r = 0.5 + rnd() * 0.8, cr = new T.Mesh(G.ring, basic(0x8a81b2, { transparent: true, opacity: 0.8, side: T.DoubleSide })); cr.scale.setScalar(r); put(cr, p, null, fl(p) + 0.05); scene.add(cr); const fl2 = new T.Mesh(G.disc, basic(0xa59cc6)); fl2.scale.setScalar(r * 0.82); put(fl2, p, null, fl(p) + 0.04); scene.add(fl2); } }
    let otherPos = null, flightPos = null;
    if (level.moon || level.theme === 'moon') {     // the other world, hanging in the sky
        const lp0 = (level.launch || [])[0], upv = lp0 ? V(lp0.p).add(V(tangent(lp0.p, TOP)).multiplyScalar(0.7)) : new T.Vector3(0.5, 0.75, -0.45);      // (it hangs above the launch pad, so a flight goes up into the sky)
        const other = level.moon ? { r: 2.4, c: 0xd8d2ea, at: upv } : { r: 5, c: 0x46c2a6, at: upv };
        const sph = Y.part(new T.SphereGeometry(other.r, 24, 16), Y.toon(other.c, { emissive: new T.Color(other.c).multiplyScalar(0.25) }), 0.12); sph.position.copy(other.at.normalize().multiplyScalar(R * 4.5)); scene.add(sph); otherPos = sph.position.clone();
    }
    // The tide: a sheet of water over the lagoon that rises and falls; rafts ride on it.
    let tideMesh = null;
    if (level.tide) {
        const z = level.tide, nR = 10, nL = 72, pos = [];
        const P3 = (r, lon) => V(around(z.c || TOP, r, lon)).multiplyScalar(R);
        for (let i = 0; i < nR; i++) for (let j = 0; j < nL; j++) { const r0 = z.r0 + (i / nR) * (z.r1 - z.r0), r1 = z.r0 + ((i + 1) / nR) * (z.r1 - z.r0), a0 = (j / nL) * 360, a1 = ((j + 1) / nL) * 360;
            for (const q of [P3(r0, a0), P3(r1, a0), P3(r1, a1), P3(r0, a0), P3(r1, a1), P3(r0, a1)]) pos.push(q.x, q.y, q.z); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        tideMesh = new T.Mesh(geo, basic(0x2fb3c4, { transparent: true, opacity: 0.62, side: T.DoubleSide, depthWrite: false })); scene.add(tideMesh);
    }
    const raftVis = (level.rafts || []).map(k => { const g = Y.prop([...[-1, 0, 1].map(j => ({ geo: G.cyl, color: j ? 0xa87440 : 0xc98f52, s: [0.42, k.r * 2, 0.42], r: [0, 0, Math.PI / 2], p: [0, 0.1, j * 0.42] })), { geo: G.box, color: 0x8a5a2e, s: [0.12, 0.08, k.r * 1.6], p: [k.r * 0.6, 0.32, 0] }, { geo: G.box, color: 0x8a5a2e, s: [0.12, 0.08, k.r * 1.6], p: [-k.r * 0.6, 0.32, 0] }], { thick: 0.06 }); scene.add(g); return { k, g }; });
    // The chasm: a dark ring going down into nothing; crumbling tiles across it (they shake, crack and drop when stepped on).
    if (level.chasm) { const z = level.chasm, nR = 6, nL = 72, pos = [];
        const P3 = (r, lon) => V(around(z.c || TOP, r, lon)).multiplyScalar(R + 0.04);
        for (let i = 0; i < nR; i++) for (let j = 0; j < nL; j++) { const r0 = z.r0 + (i / nR) * (z.r1 - z.r0), r1 = z.r0 + ((i + 1) / nR) * (z.r1 - z.r0), a0 = (j / nL) * 360, a1 = ((j + 1) / nL) * 360; for (const q of [P3(r0, a0), P3(r1, a0), P3(r1, a1), P3(r0, a0), P3(r1, a1), P3(r0, a1)]) pos.push(q.x, q.y, q.z); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); scene.add(new T.Mesh(geo, basic(0x050a16, { side: T.DoubleSide })));
        for (const r of [z.r0, z.r1]) { const items = arcPoints({ r }, 0.6), m = Y.instanced(G.rockSoft, items.length, 0.06); scene.add(m.body); scene.add(m.line); items.forEach((it, i) => m.set(i, stand(it.p, it.f, 0.12, 0.6, 0.3, 0.5, i), [0x5d5490, 0x4c447d][i % 2])); m.done(); } }
    const tileVis = (level.crumbles || []).map(tl => { const g = Y.prop([{ geo: G.cylLow, color: 0xb9a6d6, s: [tl.r * 2, 0.35, tl.r * 2], p: [0, -0.1, 0] }, { geo: G.cylLow, color: 0xd2c4e6, s: [tl.r * 1.6, 0.06, tl.r * 1.6], p: [0, 0.09, 0], ink: false }], { thick: 0.05 });
        const crack = new T.Group(); for (let k = 0; k < 3; k++) { const c2 = new T.Mesh(G.box, basic(0x2b1240)); c2.scale.set(tl.r * 1.4, 0.03, 0.05); c2.rotation.y = k * 1.05; c2.position.y = 0.13; crack.add(c2); } crack.visible = false; g.add(crack);
        put(g, tl.p, [1, 0, 0], 0); scene.add(g); return { tl, g, crack, drop: 0 }; });
    // Steam jets: a vent in the floor; it bubbles (the warning), then a column of steam roars up.
    const jetVis = (level.jets || []).map(j => { const base = fl(j.p), g = new T.Group();
        g.add(Y.prop([{ geo: G.cylLow, color: 0x7d72ab, s: [j.r * 2, 0.16, j.r * 2], p: [0, 0.06, 0] }, { geo: G.cylLow, color: 0x2b1f4a, s: [j.r * 1.2, 0.04, j.r * 1.2], p: [0, 0.15, 0], ink: false }], { thick: 0.05 }));
        const col = new T.Mesh(G.tube || new T.CylinderGeometry(1, 1, 1, 16, 1, true), basic(0xf4f8ff, { transparent: true, opacity: 0.0, depthWrite: false, side: T.DoubleSide })); col.visible = false; g.add(col);
        const bub = []; for (let k = 0; k < 5; k++) { const b = new T.Mesh(G.sphLow, basic(0xdff6ff, { transparent: true, opacity: 0.8 })); b.scale.setScalar(0.12); b.visible = false; g.add(b); bub.push(b); }
        put(g, j.p, [1, 0, 0], base); scene.add(g); return { j, g, col, bub }; });
    // The obsidian lake: glowing seams between its cells, so the grid reads; blocks to push; cracks; the plate and the gate at the bridge.
    let lakeVis = null;
    if (level.lake) { const z = level.lake, m = basic(0xff7a2a, { transparent: true, opacity: 0.4, depthWrite: false }), H = r => K.lakeH(z, r) + 0.03;
        for (let r = 0; r <= z.rows; r++) for (let c = 0; c < z.cols; c++) { const p = K.lakeAt(z, r - 0.5, c), d = new T.Mesh(G.box, m); d.scale.set(0.05, 0.02, 0.8); put(d, p, tangent(p, cross(TOP, p)), Math.max(H(r - 1), H(Math.min(r, z.rows - 1)))); scene.add(d); }
        for (let r = 0; r < z.rows; r++) for (let c = 0; c <= z.cols; c++) { const p = K.lakeAt(z, r, c - 0.5), d = new T.Mesh(G.box, m); d.scale.set(0.05, 0.02, 0.8); put(d, p, toward(p, TOP), H(r)); scene.add(d); }
        for (const [r, c] of z.ramps || []) for (let k = 0; k < 3; k++) { const p = K.lakeAt(z, r - 0.3 + k * 0.3, c), a = Y.prop([{ geo: G.coneLow, color: 0xffb37a, s: [0.36, 0.3, 0.08], r: [-Math.PI / 2, 0, 0], p: [0, 0.06, 0] }], { thick: 0.03 }); put(a, p, toward(p, TOP).map(x => -x), K.lakeH(z, r - 1) + (K.lakeH(z, r) - K.lakeH(z, r - 1)) * (0.2 + k * 0.3) + 0.05); scene.add(a); }
        const ex = K.lakeAt(z, -0.9, z.exit), arw = Y.prop([{ geo: G.coneLow, color: 0xffd23a, s: [0.5, 0.6, 0.12], r: [Math.PI / 2, 0, 0], p: [0, 0.12, 0] }], { thick: 0.04 }); put(arw, ex, toward(ex, TOP), fl(ex) + 0.04); scene.add(arw);
        // blocks: chunky obsidian cubes with a glowing seam, so they read as "push me", not as pillars
        const blocks = (z.blocks || []).map(() => { const g = Y.prop([{ geo: G.box, color: 0x3a2f4e, s: [0.72, 0.72, 0.72], p: [0, 0.36, 0] }, { geo: G.box, color: 0xff8a2a, s: [0.74, 0.06, 0.74], p: [0, 0.5, 0], ink: false }, { geo: G.box, color: 0x52446c, s: [0.5, 0.06, 0.5], p: [0, 0.74, 0] }], { thick: 0.05 }); scene.add(g); return { g, p: null, h: 0, sink: 0 }; });
        // cracks: a pale web on the glass; cracked, it glows; broken, a hole of lava
        const cracks = (z.cracks || []).map(([r, c]) => { const p = K.lakeAt(z, r, c), g = new T.Group(), web = [], mats = [];
            for (let k = 0; k < 4; k++) { const mt = basic(0xf2ecff); mats.push(mt); const ln = new T.Mesh(G.box, mt); ln.scale.set(0.7 - k * 0.08, 0.025, 0.07); ln.rotation.y = k * 0.8 + 0.3; ln.position.y = 0.035; g.add(ln); web.push(ln); }
            const hole = new T.Mesh(G.disc, basic(0xff5a1a)); hole.scale.setScalar(0.4); hole.position.y = 0.04; hole.visible = false; g.add(hole);
            put(g, p, [1, 0, 0], K.lakeH(z, r)); scene.add(g); return { r, c, g, mats, hole, last: -1 }; });
        // the plate (a coconut on it holds the gate open) and the gate across the bridge, joined by a line of dots in the gate's colour
        const gc = GATE_COLOR.plate, plates = (z.plates || []).map(([r, c]) => { const p = K.lakeAt(z, r, c), g = new T.Group(), off = Y.toon(gc), on = Y.toon(C.green), top = Y.part(G.cylLow, off, 0.04); top.scale.set(0.7, 0.1, 0.7); top.position.y = 0.06; g.add(top); put(g, p, [1, 0, 0], K.lakeH(z, r)); scene.add(g); return { top, off, on }; });
        let gate = null;
        if ((z.plates || []).length) { const gp = K.lakeAt(z, -0.55, z.exit), g = new T.Group();
            for (let k = -2; k <= 2; k++) { const bar = Y.part(G.cyl, Y.toon(gc, { transparent: true, opacity: 0.85 }), 0.04); bar.scale.set(0.09, 1.3, 0.09); bar.position.set(k * 0.17, 0.65, 0); g.add(bar); }
            put(g, gp, tangent(gp, cross(TOP, gp)), K.lakeH(z, 0)); scene.add(g); gate = { g, gp, y: 0 };
            for (const [r, c] of z.plates) { const a = K.lakeAt(z, r, c), len = K.dist(a, gp), n = Math.max(2, Math.floor(len / 0.4)); for (let k = 1; k < n; k++) { const f = k / n, q = norm(mix(a, gp, 1 - f, f)), d = new T.Mesh(G.disc, basic(gc, { transparent: true, opacity: 0.55, depthWrite: false })); d.scale.setScalar(0.12); put(d, q, null, fl(q) + 0.05); scene.add(d); } } }
        lakeVis = { z, blocks, cracks, plates, gate };
    }
    // Picture signs: a signpost by each new thing, its board a little looping picture (Signs.js) of a ghost crab acting the rule out.
    // It plays while you're near; a sparkle hangs over each one you haven't been to yet.
    const signVis = (level.signs || []).map(sg => {
        const cv = document.createElement('canvas'); cv.width = SG.SIGN_W; cv.height = SG.SIGN_H; const g2 = cv.getContext('2d'); SG.drawSign(g2, sg.kind, 0);
        const tex = new T.CanvasTexture(cv); if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
        const grp = new T.Group(), inner = new T.Group(), lift = sg.rock ? 0.7 : 0, base = fl(sg.p); grp.add(inner);
        if (sg.rock) grp.add(Y.prop([{ geo: G.rockSoft, color: 0x46343f, s: [1.7, 1.1, 1.5], p: [0, 0.15, 0] }, { geo: G.rockSoft, color: 0x5a4a5e, s: [0.9, 0.6, 0.8], p: [0.5, 0.45, 0.2] }], { thick: 0.05 }));
        inner.add(Y.prop([{ geo: G.cyl, color: C.wood2, s: [0.16, 1.7, 0.16], p: [0, lift + 0.85, -0.05] }, { geo: G.box, color: C.wood, s: [2.1, 1.6, 0.14], p: [0, lift + 2.1, -0.05] }, { geo: G.box, color: C.wood2, s: [2.18, 0.12, 0.18], p: [0, lift + 2.94, -0.05] }], { thick: 0.05 }));
        const face = new T.Mesh(new T.PlaneGeometry(1.92, 1.44), new T.MeshBasicMaterial({ map: tex })); face.position.set(0, lift + 2.1, 0.03); inner.add(face);
        const spark = Y.prop([{ geo: G.crystal, color: 0xffd23a, s: [0.9, 0.5, 0.9], r: [Math.PI, 0, 0], p: [0, 0, 0] }], { thick: 0.04 }); spark.position.set(0, lift + 3.45, 0); inner.add(spark);
        inner.scale.setScalar(0.5); put(grp, sg.p, toward(sg.p, sg.look || TOP), base); scene.add(grp); if (rides(sg.p)) riders.push({ obj: grp });
        return { sg, g2, tex, t: 0, drawn: 0, grp, inner, spark, seen: false, k: 0, f: toward(sg.p, sg.look || TOP), base, lift };
    });
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
    // On the lake, while you're stopped: where each of the four ways would take you (and the block, if it's a push), marked at the end:
    // a white ring (you'd stop there), red (lava), gold (off up the bridge), blue (back on the rim). With a coconut in your claws, a green
    // arc shows any throw from here that would end on the plate. On the rim, by the edge: where coming on here would take you.
    let lakePrev = null;
    if (lakeVis) {
        const dot = col => { const d = new T.Mesh(G.disc, basic(col, { transparent: true, opacity: 0.6, depthWrite: false })); d.scale.setScalar(0.09); d.visible = false; scene.add(d); return d; };
        const dots = Array.from({ length: 140 }, () => dot(0xffffff));
        const ring = () => { const m = new T.Mesh(G.ring, basic(0xffffff, { transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide })); m.scale.setScalar(0.32); m.visible = false; scene.add(m); return m; };
        const ends = Array.from({ length: 6 }, ring);
        const ghost = new T.Mesh(G.box, basic(0xff8a2a, { transparent: true, opacity: 0.35, depthWrite: false })); ghost.scale.setScalar(0.7); ghost.visible = false; scene.add(ghost);
        lakePrev = { dots, ends, ghost, key: '' };
    }
    if (level.goal && level.start) { const d0 = K.dist(level.start, level.goal), dir = toward(level.start, level.goal);
        for (let i = 0; i < 7; i++) { const q = walk(level.start, dir, (1.6 + i * 0.55) / R), side = tangent(q, cross(q, dir)), qq = walk(q, side, ((i % 2 ? 1 : -1) * 0.18) / R); if (K.dist(qq, level.goal) > d0 - 0.5) continue;
            const sp = new T.Mesh(G.disc, basic(0x6b2fd0, { transparent: true, opacity: 0.55 - i * 0.05, depthWrite: false })); sp.scale.set(0.16 + (i % 3) * 0.04, 1, 0.12 + (i % 2) * 0.05); put(sp, qq, dir, fl(qq) + 0.04); scene.add(sp); if (rides(qq)) riders.push({ obj: sp }); } }
    const embers = []; if (THEME.embers) { const rnd = rngOf(31); for (let i = 0; i < 40; i++) { const e = new T.Mesh(G.sphLow, basic(i % 3 ? 0xff8a2a : 0xffd23a)); e.scale.setScalar(0.06 + rnd() * 0.05); scene.add(e); embers.push({ e, p: K.at(7 + rnd() * 8, rnd() * 360), h: rnd() * 3, v: 0.6 + rnd() * 0.8 }); } }
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
    const palm = !level.palm ? { top: new T.Group() } : (() => {
        const trunk = [], leaves = [], g = new T.Group(), top = new T.Group();
        for (let i = 0; i < 5; i++) trunk.push({ geo: G.cylLow, color: i % 2 ? 0xb07a45 : 0x9a6b3f, p: [i * 0.045, 0.22 + i * 0.4, 0], r: [0, 0, -0.09], s: [0.22 - i * 0.02, 0.44, 0.22 - i * 0.02] });
        g.add(Y.prop(trunk, { thick: 0.045 }));
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; leaves.push({ geo: G.sph, color: i % 2 ? 0x4cc064 : 0x37a655, p: [Math.cos(a) * 0.62, -0.02 - 0.12 * (i % 2), Math.sin(a) * 0.62], r: [Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5], s: [0.42, 0.1, 1.5] }); }
        for (let i = 0; i < 3; i++) leaves.push({ geo: G.sph, color: C.nut, p: [Math.cos(i * 2.1) * 0.22, -0.15, Math.sin(i * 2.1) * 0.22], s: 0.3 });
        const crown = Y.prop(leaves, { thick: 0.05 }); top.add(crown); top.position.set(0.2, 2.15, 0); g.add(top); g.scale.setScalar(1.15); scene.add(g); put(g, level.palm, [1, 0, 0], fl(level.palm)); if (rides(level.palm)) riders.push({ obj: g }); return { g, top };
    })();
    const plates = (level.plates || []).map(pl => {
        const g = new T.Group(), rim = Y.prop([{ geo: G.cylLow, color: pl.heavy ? 0x5a6074 : 0xb9aed0, s: [2.25, pl.heavy ? 0.34 : 0.22, 2.25], p: [0, 0.08, 0] }], { thick: 0.06 }); g.add(rim);
        if (pl.heavy) { for (let k = 0; k < 8; k++) { const b = Y.part(G.sphLow, 0x9aa1b6, 0.02); b.scale.setScalar(0.16); b.position.set(Math.cos(k * Math.PI / 4) * 0.95, 0.27, Math.sin(k * Math.PI / 4) * 0.95); g.add(b); }
            const foot = new T.Group(); for (const a of [-0.55, 0, 0.55]) { const toe = new T.Mesh(G.box, basic(0x2b1d33)); toe.scale.set(0.09, 0.03, 0.62); toe.rotation.y = a; toe.position.set(Math.sin(a) * 0.3, 0.36, Math.cos(a) * 0.3); foot.add(toe); } g.add(foot); }
        const gc = GATE_COLOR[[].concat(pl.gate)[0]] || 0xffc83a, off = Y.toon(gc), on = Y.toon(C.green), top = Y.part(G.cylLow, off, 0.04); top.scale.set(1.6, 0.12, 1.6); top.position.y = 0.22; g.add(top);
        g.scale.setScalar(pl.r / 1.125); const halo = new T.Mesh(G.ring, basic(gc, { transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })); halo.scale.setScalar(pl.r + 0.15); scene.add(halo); scene.add(g);
        return { pl, g, top, off, on, halo };
    });
    const targets = (level.targets || []).map(tg => {
        const g = new T.Group(), post = Y.part(G.cylLow, C.wood2, 0.04); post.scale.set(0.16, 1.1, 0.16); post.position.y = 0.55; g.add(post);
        const face = new T.Group(); face.position.y = 1.15; const mats = [];
        [[0.62, 0xff4d4d], [0.44, 0xffffff], [0.26, 0xff4d4d]].forEach(([r, hex], i) => { const m = Y.toon(hex); mats.push(m); const d = Y.part(G.cyl, m, i ? 0 : 0.05); d.scale.set(r * 2, 0.1 + i * 0.03, r * 2); d.rotation.x = Math.PI / 2; face.add(d); });
        if (tg.tall) { face.scale.setScalar(1.45); face.position.y = 1.5; post.scale.set(0.2, 1.5, 0.2); post.position.y = 0.75; const glow = new T.Mesh(G.disc, basic(0xffe45a, { transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide })); glow.scale.setScalar(1.25); glow.rotation.x = Math.PI / 2; glow.position.set(0, 1.5, -0.12); g.add(glow); }      // (a bullseye you bank into: big, raised, with a glow behind it)
        g.add(face); scene.add(g); return { tg, g, face, hit: 0, mats };
    });
    // Signal lines: a dotted line on the ground from each plate and bullseye to every gate it works, in that gate's colour.
    // Dim while the switch is off; bright, with a pulse running along it, while it holds the gate; a timed one goes dark dot by dot.
    const signals = [], s0 = sfl;
    for (const [kind, list] of [['plate', level.plates || []], ['target', level.targets || []]]) for (const sw of list) for (const g of [].concat(sw.gate)) {
        const ring = (level.rings || []).find(r => r.gate === g); if (!ring) continue;
        const c0 = ring.c || TOP, dest = around(c0, ring.r + (K.dist(sw.p, c0) > ring.r ? 0.35 : -0.35), K.lonOf(sw.p, c0)), len = K.dist(sw.p, dest), st = (sw.r || 0.45) + 0.2, n = Math.max(2, Math.floor((len - st - 0.15) / 0.38));
        const mat = basic(GATE_COLOR[g] || 0xffffff, { transparent: true, opacity: 0.4, depthWrite: false, side: T.DoubleSide }), dots = [];
        for (let k = 0; k <= n; k++) { const f = (st + k * ((len - st - 0.15) / n)) / len, p = norm(mix(sw.p, dest, 1 - f, f)), d = new T.Mesh(G.disc, mat.clone()); d.scale.setScalar(0.11); put(d, p, null, 0.09 + K.floorAt(s0, p)); scene.add(d); dots.push(d); }
        // a coloured ring round a bullseye's post, so it matches its gate
        if (kind === 'target') { const rg = new T.Mesh(G.ring, basic(GATE_COLOR[g] || 0xffffff, { transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })); rg.scale.setScalar(0.6); put(rg, sw.p, null, 0.1); scene.add(rg); }
        signals.push({ kind, sw, g, dots });
    }
    const remotes = (level.rings || []).filter(w => w.gate && w.remote).map(w => {
        const pad = (level.launch || [])[0]; if (!pad) return { w };
        const c0 = w.c || TOP, from = around(c0, w.r + 0.4, K.lonOf(pad.p, c0)), len = K.dist(from, pad.p), n = Math.max(2, Math.floor((len - 1.2) / 0.45)), dots = [];
        for (let k = 0; k <= n; k++) { const f = (0.1 + k * (len - 1.2) / n) / len, p = norm(mix(from, pad.p, 1 - f, f)), d = new T.Mesh(G.disc, basic(GATE_COLOR[w.gate] || 0xffc83a, { transparent: true, opacity: 0.55, depthWrite: false })); d.scale.setScalar(0.16); put(d, p, null, fl(p) + 0.1); scene.add(d); dots.push(d); }
        return { w, dots, said: false };
    });
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
    // The gull's nest round the pearl: a ring of twigs and a heap of the coconuts it stole.
    if (level.nest) { const twigs = Y.instanced(G.cylLow, 36, 0.04); scene.add(twigs.body); if (twigs.line) scene.add(twigs.line);
        for (let i = 0; i < 36; i++) { const a = (i / 36) * 360, q = around(TOP, 1.0 + (i % 3) * 0.12, a), f = tangent(q, cross(TOP, q)); twigs.set(i, stand(q, f, fl(TOP) + 0.18 + (i % 3) * 0.12, 0.1, 1.1, 0.1, 1.4 + (i % 5) * 0.2), i % 2 ? 0x9a6534 : 0xb98249); }
        twigs.done(); const rnd = rngOf(77); for (let i = 0; i < 9; i++) { const n = coconut(); n.scale.setScalar(0.8); const q = around(TOP, 0.6 + rnd() * 0.35, i * 40 + rnd() * 20); scene.add(n); put(n, q, [1, 0, 0], fl(TOP) + 0.2 + (i % 3) * 0.12); } }       // (a drawbridge: there only while its gate is open)
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

    let pitch = 0, shelfK = 0, lakeK = 0, s = shared || K.create(level), t = 0, myW = shared ? shared.w : 0, charge = -1, cheer = 0, camP = null, shake = 0, doneAt = 0, told = false, disposed = false, intro = 0, camStart = null, snap = false, inkMad = 0, bristle = 0, downT = 0, hurtFlash = 0, swat = 0;

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
            else if (e.type === 'hole') { burst(at3(e.p, 0.3), 0x9be7ff, 16, 3.5); burst(at3(e.out, 0.5), 0x9be7ff, 20, 4.5); hooks.sfx('boost'); if (e.crab) { hooks.buzz([15, 20, 30]); snap = true; hooks.hint('🕳️ THROUGH THE PLANET! (A HOLE COMES OUT ON THE FAR SIDE)', 2.4); } }
            else if (e.type === 'launch') { burst(at3(e.p, 0.5), 0x9be7ff, 40, 7); hooks.sfx('boost'); hooks.buzz([20, 30, 50]); hooks.say(e.to === 'moon' ? '🌙 TO THE MOON!' : '🌍 HOME!', '#c7d2fe'); }
            else if (e.type === 'nut-launch') { burst(at3(e.p, 0.5), 0x9be7ff, 18, 5); hooks.sfx('boost'); hooks.pop(at3(e.p, 1.4), e.to === 'moon' ? '🥥 OFF TO THE MOON' : '🥥 OFF HOME'); }
            else if (e.type === 'tide-in') { hooks.hint('🌊 THE TIDE IS COMING IN!', 2.2); hooks.sfx('boost'); }
            else if (e.type === 'tide-out') { hooks.hint('🌊 THE TIDE IS GOING OUT', 2); }
            else if (e.type === 'swept') { burst(at3(s.crab.p, 0.3), 0x7ec8ff, 26, 4); hooks.sfx('land_bad'); hooks.buzz([30, 30]); hooks.hint('SWEPT AWAY BY THE TIDE · BACK AT THE FLAG', 2.2); snap = true; }
            else if (e.type === 'tile-crack') { hooks.sfx('tick'); const v = tileVis[e.i]; if (v) burst(at3(v.tl.p, 0.2), 0xd2c4e6, 6, 2); }
            else if (e.type === 'tile-fall') { burst(at3(e.p, 0.2), 0xb9a6d6, 18, 3.5); hooks.sfx('dice_land'); }
            else if (e.type === 'fall') { hooks.sfx('land_bad'); hooks.buzz([30, 30]); hooks.hint('INTO THE CHASM! · BACK AT THE FLAG (DON\'T STOP ON THE TILES)', 2.4); snap = true; }
            else if (e.type === 'scald') { burst(at3(s.crab.p, 0.6), 0xffffff, 26, 5); hooks.sfx('land_bad'); hooks.buzz([30, 30]); hooks.hint('SCALDED BY THE STEAM · BACK AT THE FLAG (WAIT FOR THE BURST, THEN GO)', 2.4); snap = true; }
            else if (e.type === 'burn') { burst(at3(s.crab.p, 0.3), 0xff6a1f, 30, 5); hooks.sfx('land_bad'); hooks.buzz([30, 30]); hooks.hint('INTO THE LAVA! · BACK AT THE FLAG', 2.2); snap = true; }
            else if (e.type === 'lake-go') hooks.sfx('swap');
            else if (e.type === 'lake-stop') { burst(at3(s.crab.p, s.crab.h + 0.2), 0x8a74c4, 8, 2); hooks.sfx('tick'); const z = level.lake; if (e.r === 0 && e.c === z.exit && !K.lakeGateOpen(s)) hooks.hint('THE GATE IS SHUT · A COCONUT ON THE YELLOW PLATE OPENS IT', 2.6); }
            else if (e.type === 'lake-push') { hooks.sfx('dice_land'); hooks.buzz(12); if (!s.pushSaid) { s.pushSaid = true; hooks.hint('PUSHED! A BLOCK SLIDES TOO, UNTIL SOMETHING STOPS IT', 2.4); } }
            else if (e.type === 'lake-sink') { burst(at3(e.p, 0.3), 0xff6a1f, 22, 4); hooks.hint('THE BLOCK SLID INTO THE LAVA · GO BACK TO THE RIM TO SET THE LAKE BACK', 2.6); }
            else if (e.type === 'lake-crack') { hooks.sfx('tick'); hooks.buzz([10, 20, 10]); hooks.hint('IT CRACKED! STOP ON IT AGAIN AND IT BREAKS', 2.4); }
            else if (e.type === 'lake-break') { hooks.hint('IT BROKE! CRACKED GLASS TAKES ONE STOP, NOT TWO', 2.4); }
            else if (e.type === 'lake-reset') hooks.hint('THE LAKE SETS BACK AS IT WAS', 1.8);
            else if (e.type === 'lake-nojump') { hooks.buzz(8); hooks.hint('NO JUMPING ON THE OBSIDIAN · YOUR CLAWS CAN\'T GRIP IT', 1.8); }
            else if (e.type === 'lake-bump') hooks.sfx('tick');
            else if (e.type === 'lake-plate') { hooks.sfx('land_good'); hooks.hint('THE GATE OPENS!', 1.8); }
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
        checks.forEach(v => { put(v.g, v.p, [1, 0, 0], K.floorAt(s, v.p)); v.cloth.material = s.cp >= v.i ? v.on : v.off; v.cloth.rotation.y = Math.sin(t * 4 + v.i) * 0.25; });
        palm.top.rotation.z = Math.sin(t * 1.3) * 0.05; palm.top.rotation.x = Math.cos(t * 1.1) * 0.04;
        gatedLedges.forEach(v => { v.mesh.visible = !!(s.open[v.l.gate] || s.held[v.l.gate]); if (v.raised) v.raised.visible = !v.mesh.visible; });
        plates.forEach(v => { const on = !!s.held[[].concat(v.pl.gate)[0]]; v.top.material = on ? v.on : v.off; const ph = fl(v.pl.p); put(v.g, v.pl.p, null, ph + (on ? -0.02 : 0.02)); put(v.halo, v.pl.p, null, ph + 0.12); });
        targets.forEach(v => { v.hit = Math.max(0, v.hit - dt * 1.5); const ta = K.targetAt(s, v.tg); put(v.g, ta.p, toward(ta.p, c.p), ta.h - 1.1 - (v.tg.h ? v.tg.h - 1.1 : 0)); v.face.rotation.z = v.hit * 8; v.face.scale.setScalar(1 + v.hit * 0.4); const op = s.open[[].concat(v.tg.gate)[0]]; const hex = op ? (typeof op === 'number' && op < 2 && Math.sin(t * 20) > 0 ? 0xffe45a : 0x4ade80) : 0xff4d4d; v.mats[0].color.setHex(hex); v.mats[2].color.setHex(hex); });
        // The pearl and Old Ink: he watches the crab, blinks, narrows his eyes when it comes close, and rears up when the pearl is taken.
        inkMad = Math.max(0, inkMad - dt);
        put(pearl, TOP, [1, 0, 0], fl(TOP)); pearl.userData.orb.position.y = 0.95 + Math.sin(t * 2) * 0.08 + (s.won ? Math.min(2, (t - (doneAt - 1.8)) * 1.5) : 0); pearl.userData.shine.position.y = pearl.userData.orb.position.y + 0.23; pearl.userData.orb.rotation.y = t; pearl.userData.glow.material.opacity = 0.25 + 0.15 * Math.sin(t * 3);
        const bs = s.boss, bst = bs ? bs.state : 'none', alive = bst !== 'down';
        hurtFlash = Math.max(0, hurtFlash - dt * 2.5); downT = bst === 'down' ? Math.min(1.6, downT + dt) : 0;
        const dk = Math.min(1, downT / 1.6), dizzy = false, hurt = bst === 'hurt';
        pearl.visible = !!level.goal && (!bs || bst === 'down' || s.won);
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
        holeVis.forEach(v => { if (v.lid) { const open = !K.up(s, { gate: v.h.lid }); v.k += ((open ? 1 : 0) - v.k) * Math.min(1, dt * 4); v.lid.position.y = -v.k * (v.h.r + 0.3); v.lid.visible = v.k < 0.98; } v.sw.rotation.y = t * 1.5; });
        launchVis.forEach(v => v.g.children.forEach(ch => { if (ch.userData.j != null) { ch.position.y = 0.5 + ((ch.userData.j * 0.45 + t * 0.9) % 1.35); ch.material.opacity = 0.9 - (ch.position.y - 0.5) / 1.6; } }));
        remotes.forEach(v => {
            const shut = K.up(s, v.w); (v.dots || []).forEach((d, k) => { d.visible = shut; d.material.opacity = 0.4 + 0.4 * Math.max(0, Math.sin(t * 5 - k * 0.6)); });
            if (shut && !v.said && Math.abs(K.dist(c.p, v.w.c || TOP) - v.w.r) < 1.6) { v.said = true; hooks.hint(v.w.remote === 'moon' ? '🌙 THIS FENCE\'S SWITCH IS ON THE MOON: FOLLOW THE DOTS TO THE LAUNCH PAD' : '🔒 THIS GATE\'S SWITCH IS SOMEWHERE ELSE', 4); }
        });
        if (tideMesh) { const W = s.tideW || 0; tideMesh.visible = W > 0.02; tideMesh.scale.setScalar((R + W) / R);
            riders.forEach(v => { if (!v.base) v.base = v.obj.position.clone(); if (v.island) v.obj.scale.setScalar((R + W) / R); else v.obj.position.copy(v.base).multiplyScalar((v.base.length() + W) / v.base.length()); }); }
        raftVis.forEach((v, i) => put(v.g, v.k.p, [1, 0, 0], (s.tideW || 0) + 0.02 + Math.sin(t * 2 + i) * ((s.tideW || 0) > 0.1 ? 0.04 : 0)));
        tileVis.forEach((v, i) => { const st = s.tiles && s.tiles[i], down = st && st.down > 0, cracking = st && st.k >= 0;
            v.drop = down ? Math.min(6, v.drop + dt * 12) : Math.max(0, v.drop - dt * 6); v.crack.visible = !!cracking || v.drop > 0;
            put(v.g, v.tl.p, [1, 0, 0], -v.drop + (cracking ? (Math.random() - 0.5) * 0.06 : 0)); v.g.visible = v.drop < 5.5; });
        jetVis.forEach((v, i) => { const st = K.jetState(s, v.j);
            v.col.visible = st === 'fire'; if (st === 'fire') { v.col.scale.set(v.j.r * (0.8 + 0.1 * Math.sin(t * 30 + i)), 3.2, v.j.r * (0.8 + 0.1 * Math.sin(t * 25 + i))); v.col.position.y = 1.7; v.col.material.opacity = 0.55 + 0.2 * Math.sin(t * 20); }
            v.bub.forEach((b, k) => { b.visible = st === 'warn'; if (b.visible) { const ph = (t * 1.8 + k / 5) % 1; b.position.set(Math.cos(k * 1.3) * v.j.r * 0.4, 0.2 + ph * 0.9, Math.sin(k * 1.3) * v.j.r * 0.4); b.material.opacity = 0.9 - ph * 0.8; } }); });
        npcVis.forEach((v, i) => { const d = K.dist(c.p, v.n.p), near = d < (v.n.rock ? 6.5 : 3.6);
            if (near && !v.said) { v.said = true; v.line = 0; v.t = 0; hooks.sfx('tick'); }
            if (!near && d > (v.n.rock ? 8 : 5)) v.said = false;
            v.k += ((near ? 1 : 0) - v.k) * Math.min(1, dt * 6); v.t += dt;
            if (near && v.t > 4.2 && v.n.say.length > 1) { v.t = 0; v.line = (v.line + 1) % v.n.say.length; }
            if (near) { const want = toward(v.n.p, c.p); v.f = norm(mix(v.f, want, 1 - Math.min(1, dt * 3), Math.min(1, dt * 3))); }
            if (!rides(v.n.p)) put(v.grp, v.n.p, v.f, v.base); v.body.position.y = v.lift + Math.abs(Math.sin(t * (near ? 6 : 2) + i)) * (near ? 0.08 : 0.03);
            const sp = v.b.sp; sp.visible = v.k > 0.05; if (sp.visible) { drawBubble(v.b, v.n.say[v.line]); const top = at3(v.n.p, v.base + v.lift + (v.n.who === 'seahorse' ? 2.9 : 2.1)); sp.position.copy(top); sp.scale.set(3.6 * v.k, 1.8 * v.k, 1); } });
        signVis.forEach(v => { const near = K.dist(c.p, v.sg.p) < (v.sg.rock ? 7 : 4.5);
            v.k += ((near ? 1 : 0) - v.k) * Math.min(1, dt * 5); v.inner.scale.setScalar(0.5 + 0.55 * v.k);       // (small from afar; walk up and it grows, and turns to face you)
            if (near) { const want = toward(v.sg.p, c.p); v.f = norm(mix(v.f, want, 1 - Math.min(1, dt * 4), Math.min(1, dt * 4))); }
            if (!v.sg.rock && !rides(v.sg.p)) put(v.grp, v.sg.p, v.f, v.base); else if (!rides(v.sg.p)) put(v.grp, v.sg.p, v.f, v.base);
            if (near) { v.seen = true; v.t += dt; if (v.t - v.drawn > 0.05) { v.drawn = v.t; SG.drawSign(v.g2, v.sg.kind, v.t); v.tex.needsUpdate = true; } }
            else if (v.t) { v.t = 0; v.drawn = 0; SG.drawSign(v.g2, v.sg.kind, 0); v.tex.needsUpdate = true; }
            v.spark.visible = !v.seen; if (!v.seen) { v.spark.rotation.y = t * 2; v.spark.position.y = (v.sg.rock ? 0.7 : 0) + 3.45 + Math.sin(t * 3) * 0.12; } });
        if (lakePrev && s.lake) { const z = level.lake, P = lakePrev, LG = K.Lake, open = K.lakeGateOpen(s);
            const edge = z.r0 + (z.rows - 0.5) * z.dd, dC = K.dist(c.p, TOP), colF = (K.lonOf(c.p) - z.lon0) / z.dl, onRim = !c.lake && !c.slide && !c.air && dC > edge && dC < edge + 1.4 && colF > -0.5 && colF < z.cols - 0.5;
            const key = c.slide ? 'slide' : c.lake ? `L${c.lake}|${c.nuts}|${c.aiming ? 1 : 0}|${JSON.stringify(s.lake)}` : onRim ? `R${Math.round(colF)}|${JSON.stringify(s.lake)}` : '';
            if (key !== P.key) { P.key = key; P.plateHint = false; let di = 0, ei = 0; P.dots.forEach(d => { d.visible = false; }); P.ends.forEach(e => { e.visible = false; }); P.ghost.visible = false;
                const H = r => (r >= z.rows ? K.lakeH(z, z.rows - 1) : r < 0 ? K.lakeH(z, 0) : K.lakeH(z, r)) + 0.06;
                const trail = (from, cells, col, endCol) => { let prev = from;
                    for (const [r, cc] of cells) { const q = K.lakeAt(z, Math.max(-1, Math.min(z.rows, r)), cc);
                        for (const f of [0.5, 1]) { if (di >= P.dots.length) break; const pp = norm(mix(prev[0], q, 1 - f, f)), hh = prev[1] + (H(r) - prev[1]) * f, d = P.dots[di++]; d.material.color.setHex(col); d.visible = true; put(d, pp, null, hh); }
                        prev = [q, H(r)]; }
                    if (endCol != null && ei < P.ends.length && cells.length) { const e = P.ends[ei++]; e.material.color.setHex(endCol); e.visible = true; put(e, prev[0], null, prev[1] + 0.02); } };
                const OUT = { stop: 0xffffff, lava: 0xff4d4d, win: 0xffd23a, rim: 0x7ee7ff };
                if (key.startsWith('L') && !c.aiming) { const [r0, c0] = c.lake, from = [K.lakeAt(z, r0, c0), H(r0)];
                    for (const [dr, dc] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) { const m = LG.move(z, LG.clone(s.lake), r0, c0, dr, dc, c.nuts < K.CARRY);
                        if (m.kind === 'push') { const b = m.block, bp = [K.lakeAt(z, ...b.from), H(b.from[0])]; trail(bp, b.path, 0xff8a2a, b.lost ? OUT.lava : null); if (b.to && !b.lost) { P.ghost.visible = true; put(P.ghost, K.lakeAt(z, ...b.to), toward(K.lakeAt(z, ...b.to), TOP), K.lakeH(z, b.to[0]) + 0.36); } }
                        else if (m.kind === 'slide') trail(from, m.path, m.out === 'stop' ? 0xffffff : OUT[m.out] || 0xff4d4d, m.broke ? OUT.lava : OUT[m.out]); }
                    if (c.nuts > 0 && !open) for (const [dr, dc] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) { const tt = LG.throwNut(z, LG.clone(s.lake), r0, c0, dr, dc);
                        if (tt.end && LG.plateAt(z, ...tt.end)) { trail([from[0], from[1] + 0.9], tt.path, 0x4ade80, 0x4ade80); P.plateHint = true; } } }
                else if (key.startsWith('R')) { const col = Math.round(colF), m = LG.enter(z, LG.clone(s.lake), col, c.nuts < K.CARRY); trail([c.p, c.h + 0.06], m.path, 0xffffff, m.broke ? OUT.lava : OUT[m.out]); } }
            if (key) { const k = 0.5 + 0.25 * Math.sin(t * 5); P.dots.forEach(d => { if (d.visible) d.material.opacity = k; }); P.ends.forEach(e => { if (e.visible) e.scale.setScalar(0.3 + 0.04 * Math.sin(t * 6)); }); } }
        if (lakeVis && s.lake) { const { z } = lakeVis;
            lakeVis.blocks.forEach((v, i) => { const b = s.lake.blocks[i]; if (!b) return; const lost = b[0] < -50;
                if (!lost) { const p = K.lakeAt(z, b[0], b[1]), h = K.lakeH(z, b[0]); if (!v.p) { v.p = p.slice(); v.h = h; } const a = K.dist(v.p, p) / R; if (a > 1e-4) v.p = walk(v.p, toward(v.p, p), Math.min(a, (K.SLIDE_V * dt) / R)); v.h += Math.max(-7 * dt, Math.min(5 * dt, h - v.h)); v.sink = 0; }
                else if (v.p) v.sink = Math.min(1.5, v.sink + dt);
                v.g.visible = !!v.p && v.sink < 1.4; if (v.p) put(v.g, v.p, toward(v.p, TOP), v.h - v.sink); });
            lakeVis.cracks.forEach(v => { const st = s.lake.cracks[v.r + ',' + v.c] || 0; if (st === v.last) return; v.last = st; v.mats.forEach(mt => mt.color.setHex(st ? 0xff8a2a : 0xf2ecff)); v.hole.visible = st >= 2; });
            const open = K.lakeGateOpen(s), hint = lakePrev && lakePrev.plateHint && !open && Math.sin(t * 9) > 0; lakeVis.plates.forEach(v => { v.top.material = open || hint ? v.on : v.off; v.top.scale.set(0.7 * (hint ? 1.25 : 1), 0.1, 0.7 * (hint ? 1.25 : 1)); });      // (flashing green: a throw from here would end on it)
            if (lakeVis.gate) { const gt = lakeVis.gate; gt.y += Math.max(-dt * 3, Math.min(dt * 3, (open ? -1.4 : 0) - gt.y)); put(gt.g, gt.gp, tangent(gt.gp, cross(TOP, gt.gp)), K.lakeH(z, 0) + gt.y); }
        }
        embers.forEach(m => { m.h += m.v * dt; if (m.h > 3.5) m.h = 0; put(m.e, m.p, null, m.h); });
        spots.forEach(v => {
            const on = K.dist(c.p, v.sp.p) < 0.8, done = !!s.open[v.sp.gate];
            v.ring.scale.setScalar(0.75 + 0.06 * Math.sin(t * (on ? 9 : 4))); v.g.visible = !done;
            v.dots.forEach((d, k) => { d.visible = !done; d.material.opacity = on ? 0.55 + 0.45 * Math.max(0, Math.sin(t * 6 - k * 0.6)) : 0.45; d.scale.setScalar(on ? 0.2 : 0.15); });
            if (on && !v.said && !done) { v.said = true; hooks.hint(v.sp.say || ((level.holes || []).some(h => K.dist(h.p, v.sp.via) < 0.3) ? '🎯 THE THROW SPOT: THROW INTO THE BLOWHOLE. THE AIM TURNS GREEN WHEN IT WILL HIT' : '🎯 THE THROW SPOT: AIM AT THE SMOOTH ROCK FACE. THE AIM TURNS GREEN WHEN IT WILL HIT'), 4); }
        });
        poolMeshes.forEach((v, i) => { v.rim.scale.setScalar(v.q.r * (1 + 0.02 * Math.sin(t * 2 + i))); const ph = ((t * 0.35 + i * 0.3) % 1); v.ripple.scale.setScalar(v.q.r * (0.2 + 0.75 * ph)); v.ripple.material.opacity = 0.5 * (1 - ph); });
        signals.forEach(v => {
            const on = v.kind === 'plate' ? !!s.held[v.g] : !!s.open[v.g], left = typeof s.open[v.g] === 'number' && v.sw.secs ? s.open[v.g] / v.sw.secs : 1, n = v.dots.length;
            v.dots.forEach((d, k) => { const lit = on && k / n < left; d.material.opacity = lit ? 0.7 + 0.3 * Math.max(0, Math.sin(t * 7 - k * 0.7)) : 0.5; d.scale.setScalar(lit ? 0.24 + 0.05 * Math.max(0, Math.sin(t * 7 - k * 0.7)) : 0.17); });
        });
        // Coconuts: lying, floating, flying, plugging a vent, stuck in the bullseye.
        const seen = new Set();
        for (const n of s.nuts) {
            if ((n.w || 0) !== (s.w || 0)) continue;
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
        crab.g.visible = true; shadow.visible = !s.travel && !(s.arriving > 0);
        put(crab.g, c.p, c.face, c.h); crab.g.scale.setScalar(1);
        flightPos = null;
        if (s.travel && otherPos) {                      // leaving: rise off the pad, then away toward the other world in the sky
            const k = 1 - s.travel.t / K.TRAVEL_S, e = k * k * (3 - 2 * k), pad = at3(s.travel.from, 0.4), up = V(s.travel.from);
            const ctrl = pad.clone().addScaledVector(up, 6), a = pad.clone().multiplyScalar((1 - e) * (1 - e)).add(ctrl.clone().multiplyScalar(2 * e * (1 - e))).add(otherPos.clone().multiplyScalar(0.9 * e * e));
            crab.g.position.copy(a); crab.g.scale.setScalar(1 - 0.75 * e); crab.g.rotateX(t * 8); flightPos = a;
            if (Math.random() < 0.5) burst(a, 0x9be7ff, 2, 1.5);
        } else if (s.arriving > 0 && otherPos) {         // arriving: down out of the sky onto the landing place
            const k = 1 - s.arriving / 1.5, e = 1 - (1 - k) * (1 - k), land = at3(c.p, c.h), far = otherPos.clone().multiplyScalar(0.85), ctrl = land.clone().addScaledVector(V(c.p), 7);
            const a = far.multiplyScalar((1 - e) * (1 - e)).add(ctrl.multiplyScalar(2 * e * (1 - e))).add(land.clone().multiplyScalar(e * e));
            crab.g.position.copy(a); crab.g.scale.setScalar(0.35 + 0.65 * e); flightPos = a;
            if (Math.random() < 0.5) burst(a, 0x9be7ff, 2, 1.5);
        } put(shadow, c.p, c.face, 0.04 + K.floorAt(s, c.p)); shadow.scale.setScalar(Math.max(0.4, 1 - (c.h - K.floorAt(s, c.p)) * 0.1));
        kit.pose(crab, dt, c.moving && !c.air, Math.max(cheer > 0 ? 0.3 : 0, charge >= 0 ? 0.14 : 0));

        // The gull: its shadow and the red ring are the warning.
        gull.g.visible = !!g; gullShade.visible = gullRing.visible = false;
        if (g) {
            const flying = g.h > 0.05 || g.state === 'circle' || g.state === 'rise', stunned = g.state === 'stun', diving = g.state === 'dive' || g.state === 'land';
            const face = diving ? toward(g.p, g.tx || c.p) : g.state === 'circle' ? toward(g.p, c.p) : tangent(g.p, cross(TOP, g.p));
            put(gull.g, g.p, face, g.h + (g.b || 0) + 0.78 + (flying ? 0 : Math.abs(Math.sin(t * 5)) * (g.state === 'walk' || g.state === 'flee' ? 0.1 : 0)));
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
            gullShade.visible = g.h > 0.1; put(gullShade, g.p, null, K.floorAt(s, g.p) + 0.05); gullShade.scale.setScalar(Math.max(0.3, 0.75 - g.h * 0.06));
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
        lakeK += ((c.lake || c.slide ? 1 : 0) - lakeK) * Math.min(1, dt * 2);       // (on the obsidian: higher, looking down on the grid)
        const up = V(c.p), f = V(c.f), want = up.clone().multiplyScalar(R + (9.6 + 3.2 * shelfK + 3.5 * lakeK) * (1 + 0.4 * pitch) + c.h * 0.45).addScaledVector(f, -(8.6 - 3.6 * shelfK - 1.8 * lakeK) * (1 - 0.35 * pitch));
        { // never inside a terrace: keep the camera above the ground (and the crab's own level) wherever it would be
          const cp = norm([want.x, want.y, want.z]), gh = Math.max(fl(cp), fl(norm(mix(c.p, cp, 0.5, 0.5))), fl(norm(mix(c.p, cp, 0.8, 0.2))), c.h);
          if (gh > c.h + 0.8) want.copy(up).multiplyScalar(R + gh + 7.5).addScaledVector(f, -2.2);        // (a cliff behind the crab: look down from above it instead)
          else if (want.length() < R + gh + 3.2) want.setLength(R + gh + 3.2); }
        if (snap && camP) { camP.copy(want); snap = false; }
        if (!camP && s.arriving > 0) { camP = at3(c.p, 12).addScaledVector(V(c.f), -10); intro = 0; }
        if (!camP) { camP = V(TOP).multiplyScalar(R + fl(TOP) + 4.5).addScaledVector(V(tangent(TOP, c.p)), -11); camStart = camP.clone(); intro = 3.2; }
        intro = Math.max(0, intro - dt);
        if (intro > 0 && intro < 1.9 && camStart) {          // the swoop from the pearl to the crab: over the planet, not through it
            const k = 1 - intro / 1.9, e = k * k * (3 - 2 * k), a0 = camStart.clone().normalize(), a1 = want.clone().normalize(), om = Math.acos(Math.max(-1, Math.min(1, a0.dot(a1)))) || 1e-6;
            const dir = a0.multiplyScalar(Math.sin((1 - e) * om) / Math.sin(om)).add(a1.multiplyScalar(Math.sin(e * om) / Math.sin(om))).normalize();
            camP.copy(dir).multiplyScalar(camStart.length() * (1 - e) + want.length() * e + 9 * Math.sin(Math.PI * e));
        } else if (intro <= 0) camP.lerp(want, dt ? Math.min(1, dt * 7) : 0);
        if (flightPos) { const back = s.travel ? at3(s.travel.from, 2.5 + 5 * (1 - s.travel.t / K.TRAVEL_S)).addScaledVector(V(tangent(s.travel.from, TOP)), 8) : at3(c.p, 10).addScaledVector(V(c.f), -9); camP.lerp(back, Math.min(1, dt * 3)); }
        camera.position.copy(camP);
        shake = Math.max(0, shake - dt * 2.4);
        if (shake > 0 && dt) camera.position.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 0.5));
        const lookCrab = flightPos ? flightPos.clone() : V(c.p).multiplyScalar(R + c.h * 0.4).addScaledVector(f, 1.8), lookPearl = V(TOP).multiplyScalar(R + fl(TOP) + 1), k3 = intro > 1.9 ? 1 : intro > 0 ? intro / 1.9 : 0;
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
                if (s.arriving > 0) { s.arriving = Math.max(0, s.arriving - dt); if (s.arriving <= 0) { burst(at3(s.crab.p, 0.3), 0x9be7ff, 26, 4); hooks.sfx('land_good'); hooks.buzz(14); } }
                else for (let i = 0; i < steps; i++) events(K.step(s, dt, stick));
            }
            if ((s.w || 0) !== myW && hooks.travel) { hooks.travel(s); return; }
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
            s.crab.aiming = !!on && s.crab.nuts > 0;
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
