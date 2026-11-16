// ============================================================
// COCONUT TRIALS — the 3D for a puzzle planet (rules: TrickLogic.js).
// Tiny Planet's screen (Planet.js) owns the renderer, the buttons and the
// cards; this builds one trial's scene, steps it and draws it.
//
//   const t = createTrial(kit, level, hooks)
//     kit:   { T, renderer, crab(color), pose(crab, dt, moving, cheer, lift), skin }
//     hooks: { say(text, color), hint(text, secs), pop(vec3, text), sfx(name), buzz(pattern), won(stars, state) }
//   t.frame(dt, stick)      step and draw
//   t.jump()                the jump button
//   t.hold(on)              the throw button: down starts the wind-up, up throws
//   t.restart()             the same trial again
//   t.state()               the TrickLogic state (HUD, probes)
//   t.dispose()
// ============================================================
import * as K from './TrickLogic.js';
import { cross, mix, norm, tangent, toward, walk } from './PlanetLogic.js';

const CHARGE_S = 0.9;                      // how long a full wind-up takes
// A look for each trial: ground, grass, sky.
const LOOKS = [
    [0xf3d98f, 0x86cf6a, 0x8fd8ff], [0xbfe3a0, 0x6fbf73, 0xa9e4ff], [0xf6e3a8, 0x9bd68a, 0x7fc8f8],
    [0xe9c9a0, 0xc79a6b, 0xffd9a8], [0xd7cdf0, 0xa99be0, 0xc9b8ff], [0xc9ced8, 0x9aa3b5, 0x55689a],
];

export function createTrial(kit, level, hooks) {
    const { T, renderer } = kit, R = K.R;
    const V = a => new T.Vector3(a[0], a[1], a[2]);
    const lam = (color, o = {}) => new T.MeshLambertMaterial({ color, flatShading: true, ...o });
    const basic = (color, o = {}) => new T.MeshBasicMaterial({ color, ...o });
    const m4 = new T.Matrix4();
    const at = (p, lift = 0) => V(p).multiplyScalar(R + lift);
    const put = (obj, p, fwd, lift = 0) => {
        const up = V(p), f = V(tangent(p, fwd || [0.3, 0.2, 1])), x = new T.Vector3().crossVectors(up, f);
        obj.quaternion.setFromRotationMatrix(m4.makeBasis(x, up, f)); obj.position.copy(up.multiplyScalar(R + lift));
    };
    const look = LOOKS[Math.max(0, K.LEVELS.indexOf(level)) % LOOKS.length];
    const scene = new T.Scene(); scene.background = new T.Color(look[2]);
    const camera = new T.PerspectiveCamera(58, 1, 0.1, 400);
    scene.add(new T.HemisphereLight(0xffffff, 0x8a7a66, 0.95));
    const sun = new T.DirectionalLight(0xfff4d6, 0.8); scene.add(sun); scene.add(sun.target);

    // The planet, coloured by face.
    { const geo = new T.IcosahedronGeometry(R, 12), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), a = new T.Color(look[0]), b = new T.Color(look[1]), c = new T.Color();
      for (let i = 0; i < pos.count; i += 3) {
          const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / (3 * R), y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / (3 * R), z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / (3 * R);
          const n = Math.sin(x * 2.9 + 0.7) * Math.sin(y * 2.3 + 1.9) + Math.sin(z * 2.6 + x * 1.3) * 0.6, tint = 0.94 + (((Math.sin(x * 91.7 + y * 47.3 + z * 13.1) * 43758.5) % 1 + 1) % 1) * 0.1;
          c.copy(n > 0.3 ? b : a).multiplyScalar(tint);
          for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeVertexNormals();
      scene.add(new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }))); }
    scene.add(new T.Mesh(new T.SphereGeometry(R * 1.16, 28, 18), basic(0xffffff, { transparent: true, opacity: 0.18, side: T.BackSide, depthWrite: false })));

    // ── The trial's furniture ───────────────────────────────────────────────
    const G = {
        slab: new T.BoxGeometry(1, 1, 0.22), nut: new T.SphereGeometry(0.3, 10, 8), cap: new T.SphereGeometry(0.17, 7, 5),
        pole: new T.CylinderGeometry(0.05, 0.05, 2.2, 6), flag: new T.BoxGeometry(0.8, 0.5, 0.04), disc: new T.CircleGeometry(1, 28), ring: new T.RingGeometry(0.82, 1, 32),
        pad: new T.CylinderGeometry(1, 0.86, 0.28, 18), arm: new T.BoxGeometry(0.3, 1, 1), coil: new T.CylinderGeometry(0.34, 0.42, 0.2, 12),
        post: new T.CylinderGeometry(0.07, 0.09, 1.1, 6), shell: new T.ConeGeometry(0.26, 0.44, 9), dot: new T.SphereGeometry(0.08, 6, 5),
    };
    G.disc.rotateX(-Math.PI / 2); G.ring.rotateX(-Math.PI / 2);
    const M = {
        wood: lam(0xb9824d), stone: lam(0x9aa3b5), tall: lam(0x6f7a90), gate: lam(0xe0569a), beat: lam(0x22c1c3), bumper: new T.MeshLambertMaterial({ color: 0xff8a1f, emissive: 0x7a3300, flatShading: true }),
        sand: lam(0xf1d9a0), raft: lam(0xa9743f), crumbly: lam(0xb9b2a6), lowArm: lam(0xff5a4d), tallArm: lam(0x7c3aed), spring: lam(0xff4d6d), flagOff: lam(0xf5f5f5), flagOn: lam(0x4ade80), nut: lam(0x7a4a26), cap: lam(0x3f2a16),
        pole: lam(0xf5f5f5), flag: lam(0xff4d6d), plate: lam(0xff7a5a), plateOn: lam(0x4ade80), post: lam(0xd9d9e3),
        gold: new T.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x8a6200, flatShading: true }), water: basic(0x3fa9f5, { transparent: true, opacity: 0.78, side: T.DoubleSide }),
        aim: basic(0xffe45a, { transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide }), dot: basic(0xffffff, { transparent: true, opacity: 0.8 }), shade: basic(0x000000, { transparent: true, opacity: 0.22, depthWrite: false }),
    };
    const wallMat = w => (w.bumper ? M.bumper : w.beat ? M.beat : w.gate ? M.gate : w.h <= 1 ? M.wood : w.h <= 2.4 ? M.stone : M.tall);
    const wallH = w => Math.min(w.h, 3.6);
    const walls = [];                        // { w, slabs: [mesh], k }: k is how far it has sunk (a gate opening)
    const frame = c => { const e1 = tangent(c, [0, 0, 1]); return [e1, cross(c, e1)]; };
    const around = (c, r, deg) => { const [e1, e2] = frame(c), a = (deg * Math.PI) / 180; return walk(c, mix(e1, e2, Math.cos(a), Math.sin(a)), r / R); };
    for (const w of level.rings || []) {
        const c = w.c || [0, 1, 0], from = w.from ?? -180, to = w.to ?? 180, n = Math.max(6, Math.round(((to - from) / 360) * (2 * Math.PI * R * Math.sin(w.r / R)) / 0.55)), slabs = [];
        for (let i = 0; i < n; i++) {
            const deg = from + ((i + 0.5) / n) * (to - from), p = around(c, w.r, deg), m = new T.Mesh(G.slab, wallMat(w));
            m.userData = { p, f: toward(p, c), len: ((to - from) / 360) * (2 * Math.PI * R * Math.sin(w.r / R)) / n * 1.08 }; scene.add(m); slabs.push(m);
        }
        walls.push({ w, slabs, k: 0 });
    }
    for (const w of level.bars || []) {
        const len = K.dist(w.a, w.b), n = Math.max(2, Math.round(len / 0.55)), slabs = [], nrm = norm(cross(w.a, w.b));
        for (let i = 0; i < n; i++) { const p = norm(mix(w.a, w.b, 1 - (i + 0.5) / n, (i + 0.5) / n)), m = new T.Mesh(G.slab, wallMat(w)); m.userData = { p, f: tangent(p, nrm), len: (len / n) * 1.08 }; scene.add(m); slabs.push(m); }
        walls.push({ w, slabs, k: 0 });
    }
    // Water: a strip of the sphere, a hair above the ground.
    for (const mo of level.moats || []) {
        const c = mo.c || [0, 1, 0], from = mo.from ?? -180, to = mo.to ?? 180, n = Math.max(8, Math.round((to - from) / 6)), pos = [];
        const rows = Math.max(2, Math.ceil((mo.r1 - mo.r0) / 0.5));
        for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
            const d0 = from + (i / n) * (to - from), d1 = from + ((i + 1) / n) * (to - from), ra = mo.r0 + ((mo.r1 - mo.r0) * j) / rows, rb = mo.r0 + ((mo.r1 - mo.r0) * (j + 1)) / rows;
            const q = [around(c, ra, d0), around(c, rb, d0), around(c, rb, d1), around(c, ra, d1)].map(p => at(p, 0.05));
            for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k].x, q[k].y, q[k].z);
        }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
        scene.add(new T.Mesh(geo, M.water));
    }
    // Islands in the water: sand ones, rafts that slide, grey ones that sink.
    const pads = (level.pads || []).map(pd => { const m = new T.Mesh(G.pad, pd.to ? M.raft : pd.crumble ? M.crumbly : M.sand); m.scale.set(pd.r, 1, pd.r); scene.add(m); return { pd, m }; });
    // Sweepers: a post, and an arm that comes round.
    const sweepers = (level.sweepers || []).map(w => {
        const g = new T.Group(), tall = w.h > 1.2, hh = tall ? 2.3 : 0.42;
        const post = new T.Mesh(G.post, M.post); post.scale.set(1.6, (tall ? 2.6 : 1.1) / 1.1, 1.6); post.position.y = (tall ? 2.6 : 1.1) / 2; g.add(post);
        const arm = new T.Mesh(G.arm, tall ? M.tallArm : M.lowArm); arm.scale.set(1, hh, w.len); arm.position.set(0, tall ? 0.25 + hh / 2 : 0.5, w.len / 2); g.add(arm);
        // the ground it sweeps, so its reach is plain before you step in
        const reach = new T.Mesh(G.ring, basic(tall ? 0x7c3aed : 0xff5a4d, { transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide })); reach.scale.setScalar(w.len); scene.add(reach);
        scene.add(g); return { w, g, reach };
    });
    const springs = (level.springs || []).map(sp => { const g = new T.Group(); g.add(new T.Mesh(G.coil, M.post)); const top = new T.Mesh(G.pad, M.spring); top.scale.set(sp.r, 0.5, sp.r); top.position.y = 0.2; g.add(top); scene.add(g); return { sp, g, top, t: 0 }; });
    const checks = (level.checks || []).map((p, i) => { const g = new T.Group(); const pole = new T.Mesh(G.pole, M.pole); pole.scale.y = 0.7; pole.position.y = 0.77; g.add(pole); const cloth = new T.Mesh(G.flag, M.flagOff); cloth.scale.setScalar(0.8); cloth.position.set(0.34, 1.3, 0); g.add(cloth); scene.add(g); return { p, i, g, cloth }; });
    const plates = (level.plates || []).map(pl => { const m = new T.Mesh(G.disc, M.plate); m.scale.setScalar(pl.r); scene.add(m); return { pl, m }; });
    const targets = (level.targets || []).map(tg => {
        const g = new T.Group(); g.add(new T.Mesh(G.post, M.post)); g.children[0].position.y = 0.55;
        const face = new T.Group(); face.position.y = 1.1;
        [[0.55, 0xff4d4d], [0.38, 0xffffff], [0.2, 0xff4d4d]].forEach(([r, col], i) => { const d = new T.Mesh(new T.CylinderGeometry(r, r, 0.06 + i * 0.02, 20), lam(col)); d.rotation.x = Math.PI / 2; face.add(d); });
        g.add(face); scene.add(g); return { tg, g, face, hit: 0 };
    });
    // The flag, and the golden shell.
    const flag = new T.Group(); { const p = new T.Mesh(G.pole, M.pole); p.position.y = 1.1; flag.add(p); const f = new T.Mesh(G.flag, M.flag); f.position.set(0.42, 1.9, 0); flag.add(f); const r = new T.Mesh(G.ring, basic(0xffe45a, { transparent: true, opacity: 0.8, side: T.DoubleSide })); r.scale.setScalar(K.FLAG_R); r.position.y = 0.06; flag.add(r); flag.userData.ring = r; flag.userData.cloth = f; }
    scene.add(flag);
    const shell = new T.Mesh(G.shell, M.gold); shell.geometry = G.shell; scene.add(shell);
    // The crab, its shadow, the coconut it winds up, and where a throw would land.
    const crab = kit.crab(kit.skin); scene.add(crab.g);
    const shadow = new T.Mesh(new T.CircleGeometry(0.5, 16), M.shade); shadow.geometry.rotateX(-Math.PI / 2); scene.add(shadow);
    const held = new T.Mesh(G.nut, M.nut); held.visible = false; scene.add(held);
    const aimRing = new T.Mesh(G.ring, M.aim); aimRing.visible = false; scene.add(aimRing);
    const dots = Array.from({ length: 30 }, () => { const d = new T.Mesh(G.dot, M.dot); d.visible = false; scene.add(d); return d; });
    const bankMark = new T.Mesh(new T.OctahedronGeometry(0.3, 0), basic(0xffe45a)); bankMark.visible = false; scene.add(bankMark);
    const nuts = new Map();
    // Sparks.
    const N = 220, pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3).fill(9999), 3)); pg.setAttribute('color', new T.BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = new T.Points(pg, new T.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, depthWrite: false })); sparks.frustumCulled = false; scene.add(sparks);
    const pool = Array.from({ length: N }, () => ({ life: 0, v: [0, 0, 0] })); let next = 0;
    const burst = (o, color, n, speed) => {
        const pos = pg.attributes.position, col = pg.attributes.color, c = new T.Color(color), up = o.clone().normalize();
        for (let i = 0; i < n; i++) { const k = next = (next + 1) % N, d = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().addScaledVector(up, 0.8).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8)); pool[k].life = 0.5 + Math.random() * 0.4; pool[k].v = [d.x, d.y, d.z]; pos.setXYZ(k, o.x, o.y, o.z); col.setXYZ(k, c.r, c.g, c.b); }
        col.needsUpdate = true;
    };

    let s = K.create(level), t = 0, charge = -1, cheer = 0, camP = null, shake = 0, doneAt = 0, told = false, disposed = false, intro = 0, snap = false;

    function events(evs) {
        for (const e of evs) {
            if (e.type === 'thud') hooks.sfx('dice_land');
            else if (e.type === 'plop') { burst(at(e.p, 0.2), 0x9bd8ff, 14, 3); hooks.sfx('boost'); hooks.pop(at(e.p, 0.8), '🥥 IT FLOATS!'); }
            else if (e.type === 'bank') { burst(at(e.p, e.nut.h), 0xffffff, 8, 3); hooks.sfx('tick'); }
            else if (e.type === 'bounce') { burst(at(e.nut.p, 0.5), 0xfff08a, 16, 4); hooks.sfx('land_good'); hooks.buzz(12); cheer = 0.3; }
            else if (e.type === 'trick') { burst(at(s.crab.p, e.h), 0xffffff, 34, 6); burst(at(s.crab.p, e.h), 0xffd84a, 20, 4); hooks.sfx('win'); hooks.buzz([15, 20, 40]); hooks.pop(at(s.crab.p, e.h + 1), '✨ TRICK SHOT!'); cheer = 0.5; shake = 0.3; }
            else if (e.type === 'target') { const v = targets.find(x => x.tg === e.target); if (v) v.hit = 1; burst(at(e.target.p, 1.1), 0x4ade80, 26, 5); hooks.sfx('coin_gain'); hooks.buzz([10, 20, 30]); hooks.say('🎯 BULLSEYE! THE GATE IS OPEN', '#86efac'); }
            else if (e.type === 'press') { hooks.sfx('shield'); hooks.buzz(10); hooks.pop(at(e.plate.p, 0.8), 'GATE OPEN'); }
            else if (e.type === 'release') { hooks.sfx('tick'); hooks.pop(at(e.plate.p, 0.8), 'GATE SHUT'); }
            else if (e.type === 'splash' || e.type === 'bonk') { hooks.sfx('land_bad'); hooks.buzz([30, 30, 30]); hooks.hint(`${e.type === 'bonk' ? 'BONK!' : 'SPLASH!'} BACK TO THE ${e.at >= 0 ? 'FLAG' : 'START'}`, 2); shake = 0.4; snap = true; }
            else if (e.type === 'check') { burst(at(e.p, 1), 0x4ade80, 22, 4); hooks.sfx('land_good'); hooks.buzz(10); hooks.pop(at(e.p, 1.6), '🚩 CHECKPOINT'); }
            else if (e.type === 'spring') { const v = springs.find(x => x.sp === e.spring); if (v) v.t = 0.3; burst(at(e.spring.p, 0.4), 0xff7a9a, 16, 5); hooks.sfx('boost'); hooks.buzz(12); hooks.pop(at(e.spring.p, 1.4), 'BOING!'); }
            else if (e.type === 'crack') hooks.sfx('tick');
            else if (e.type === 'sink') { burst(at(K.padAt(s, e.pad), 0.2), 0x9bd8ff, 12, 3); hooks.sfx('boost'); }
            else if (e.type === 'shell') { burst(at(level.shell, 0.5), 0xffd84a, 30, 5); hooks.sfx('coin_gain'); hooks.buzz(14); hooks.pop(at(level.shell, 1), '⭐ GOLDEN SHELL!'); }
            else if (e.type === 'won') { burst(at(level.flag, 1.5), 0xffd84a, 50, 7); burst(at(level.flag, 1.5), 0xff7ab8, 40, 6); hooks.sfx('win'); hooks.buzz([30, 30, 30, 30, 120]); cheer = 1.2; doneAt = t + 1.5; }
        }
    }

    function draw(dt) {
        const c = s.crab;
        walls.forEach(v => {
            v.k += ((K.up(s, v.w) ? 0 : 1) - v.k) * Math.min(1, dt * 8);
            const h = wallH(v.w) * (1 - v.k * 0.96);
            v.slabs.forEach(m => { put(m, m.userData.p, m.userData.f, h / 2); m.scale.set(m.userData.len * (1 + h * 0.11), Math.max(0.02, h), 1); });
        });
        // Bumpers glow, so the wall to aim at is the one that stands out.
        M.bumper.emissive.setHex(0x7a3300).multiplyScalar(0.7 + 0.6 * Math.abs(Math.sin(t * 3)));
        pads.forEach((v, i) => { const st = s.pads[i].t, gone = K.padGone(s, i), sunk = gone ? Math.min(1, (st - K.PAD_SINK_S) * 4) : 0;
            v.m.visible = sunk < 1; put(v.m, K.padAt(s, i), [1, 0, 0], 0.1 - sunk * 0.7 + (st != null && !gone ? Math.sin(t * 60) * 0.025 : 0)); });
        sweepers.forEach(v => { put(v.g, v.w.c, K.armDir(s, v.w)); put(v.reach, v.w.c, null, 0.07); });
        springs.forEach(v => { v.t = Math.max(0, v.t - dt); put(v.g, v.sp.p, null, 0.1); v.top.position.y = 0.2 + (v.t > 0 ? 0.35 : Math.abs(Math.sin(t * 4)) * 0.05); });
        checks.forEach(v => { put(v.g, v.p, [1, 0, 0]); v.cloth.material = s.cp >= v.i ? M.flagOn : M.flagOff; v.cloth.rotation.y = Math.sin(t * 4 + v.i) * 0.25; });
        plates.forEach(v => { const on = !!s.held[v.pl.gate]; v.m.material = on ? M.plateOn : M.plate; put(v.m, v.pl.p, null, on ? 0.03 : 0.1); });
        targets.forEach(v => { v.hit = Math.max(0, v.hit - dt * 1.5); put(v.g, v.tg.p, toward(v.tg.p, c.p)); v.face.rotation.z = v.hit * 8; v.face.scale.setScalar(1 + v.hit * 0.4); if (s.open[v.tg.gate]) v.face.children.forEach(d => d.material.color.setHex(0x4ade80)); });
        put(flag, level.flag, [1, 0, 0]); flag.userData.cloth.rotation.y = Math.sin(t * 4) * 0.25; flag.userData.ring.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(t * 3));
        shell.visible = !s.shell && !!level.shell;
        if (shell.visible) { put(shell, level.shell, null, 0.45 + Math.sin(t * 2.5) * 0.1); shell.rotateY(t * 2.4); shell.rotateZ(1.1); }

        // Coconuts.
        const seen = new Set();
        for (const n of s.nuts) {
            seen.add(n.id);
            let v = nuts.get(n.id);
            if (!v) { v = new T.Group(); v.add(new T.Mesh(G.nut, M.nut)); const cap = new T.Mesh(G.cap, M.cap); cap.position.y = 0.2; v.add(cap); scene.add(v); nuts.set(n.id, v); }
            put(v, n.p, n.d, n.state === 'fly' ? n.h : n.state === 'float' ? 0.18 + Math.sin(t * 3 + n.id) * 0.05 : 0.24);
            if (n.state === 'fly') v.rotateX(t * 9);
        }
        for (const [id, v] of nuts) if (!seen.has(id)) { scene.remove(v); nuts.delete(id); }

        // The crab.
        cheer = Math.max(0, cheer - dt);
        put(crab.g, c.p, c.face, c.h); put(shadow, c.p, c.face, 0.04); shadow.scale.setScalar(Math.max(0.4, 1 - c.h * 0.18));
        kit.pose(crab, dt, c.moving && !c.air, Math.max(cheer > 0 ? 0.3 : 0, charge >= 0 ? 0.14 : 0));

        // Winding up: the coconut overhead, and where it would come down.
        const k = charge >= 0 ? Math.min(1, charge) : -1;
        held.visible = k >= 0; aimRing.visible = k >= 0;
        if (k >= 0) {
            put(held, c.p, c.face, c.h + 1.25); held.scale.setScalar(0.6 + k * 0.4);
            const a = K.aim(s, k);
            put(aimRing, a.p, null, 0.09); aimRing.scale.setScalar(0.85 * (1 + Math.sin(t * 10) * 0.08));
            dots.forEach((d, i) => { const q = a.path[i]; d.visible = !!q; if (q) d.position.copy(at(q[0], q[1])); });
            bankMark.visible = !!a.bank; if (a.bank) { bankMark.position.copy(at(a.bank[0], a.bank[1])); bankMark.scale.setScalar(1 + Math.sin(t * 12) * 0.25); }
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

        // The camera: behind and above, a little higher while the crab is in the air.
        const up = V(c.p), f = V(c.f), want = up.clone().multiplyScalar(R + 9.6 + c.h * 0.5).addScaledVector(f, -8.6);
        // (each go opens from far out, so the whole planet is seen before the crab is)
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
            if (s.won && !told && !doneAt) doneAt = t + 0.9;          // (won some other way than through events())
            if (doneAt && t >= doneAt) { doneAt = 0; told = true; hooks.won(K.stars(s), s); }
            draw(dt);
        },
        jump() { if (K.jump(s)) { hooks.sfx('swap'); hooks.buzz(8); return true; } return false; },
        /** The throw button: down winds up, up lets go. charge (optional): throw now with this much. */
        hold(on, now = null) {
            if (s.won) return null;
            if (now != null) { charge = -1; hooks.sfx('swap'); return K.throwNut(s, now); }
            if (on) { if (charge < 0) charge = 0; return null; }
            if (charge < 0) return null;
            const k = Math.min(1, charge); charge = -1;
            hooks.sfx('swap'); hooks.buzz(8);
            return K.throwNut(s, k);
        },
        charging: () => (charge >= 0 ? Math.min(1, charge) : -1),
        restart() { s = K.create(level); charge = -1; camP = null; doneAt = 0; told = false; targets.forEach(v => v.face.children.forEach((d, i) => d.material.color.setHex(i === 1 ? 0xffffff : 0xff4d4d))); },
        state: () => s,
        level,
        dispose() {
            disposed = true;
            scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => x.dispose()); });
        },
    };
}
