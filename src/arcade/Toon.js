// ============================================================
// TOON — the game's 3D art style, in one place.
//
//   · bright, flat candy colours with a soft stepped shade (toon shading)
//   · chunky, rounded shapes
//   · a thick dark-ink outline round everything that matters: the same ink
//     colour as the buttons and cards (#2b1240), so the 3D looks like part of
//     the UI, like stickers on the world
//
// The outline is an "inverted hull": a copy of the shape, pushed outwards and
// drawn inside-out in ink, so only a rim of it shows.
//
//   const Y = makeToon(THREE)
//   Y.toon(0xff8a5c)                       a toon material
//   Y.prop([{ geo, color, p, r, s }, …])   several shapes merged into ONE mesh (vertex colours) with its outline
//   Y.part(geo, color, thick)              one outlined mesh (for things that animate on their own)
//   Y.instanced(geo, count, thick)         many copies in two draw calls: { body, line, set(i, matrix, hex), done() }
//   Y.inkify(group, thick)                 turn a group's Lambert meshes toon, and outline them
//   Y.hull(geo, t)                         the outline's geometry
// ============================================================
export const INK = 0x2b1240;

export function makeToon(T) {
    // Three steps of light, hard-edged: the stepped shade of a cartoon.
    const ramp = new T.DataTexture(new Uint8Array([105, 175, 230, 255]), 4, 1, T.LuminanceFormat);
    ramp.minFilter = ramp.magFilter = T.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
    const inkMat = new T.MeshBasicMaterial({ color: INK, side: T.BackSide });
    const toon = (color, o = {}) => new T.MeshToonMaterial({ color, gradientMap: ramp, ...o });

    // The outline's geometry: every vertex pushed out along the average of the faces that meet there, so a hard-edged box
    // grows evenly instead of cracking open at its corners.
    const hulls = new WeakMap();
    function hull(geo, t) {
        let m = hulls.get(geo); if (!m) hulls.set(geo, m = new Map());
        const k = Math.round(t * 1e4); if (m.has(k)) return m.get(k);
        const g = geo.index ? geo.toNonIndexed() : geo.clone(), pos = g.attributes.position, n = pos.count, sum = new Map();
        const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), f = new T.Vector3(), key = i => `${Math.round(pos.getX(i) * 400)},${Math.round(pos.getY(i) * 400)},${Math.round(pos.getZ(i) * 400)}`;
        for (let i = 0; i < n; i += 3) {
            a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
            f.subVectors(b, a).cross(c.sub(a));
            for (let j = 0; j < 3; j++) { const kk = key(i + j), s = sum.get(kk) || [0, 0, 0]; s[0] += f.x; s[1] += f.y; s[2] += f.z; sum.set(kk, s); }
        }
        for (let i = 0; i < n; i++) { const s = sum.get(key(i)), l = Math.hypot(s[0], s[1], s[2]) || 1; pos.setXYZ(i, pos.getX(i) + (s[0] / l) * t, pos.getY(i) + (s[1] / l) * t, pos.getZ(i) + (s[2] / l) * t); }
        g.deleteAttribute('normal'); g.deleteAttribute('uv');
        m.set(k, g); return g;
    }

    /** One outlined mesh. thick is in the shape's own units (before any scale you give the mesh). */
    function part(geo, color, thick = 0.09, o = {}) {
        const mat = color && color.isMaterial ? color : toon(color, o);
        const mesh = new T.Mesh(geo, mat);
        if (thick > 0) { const h = new T.Mesh(hull(geo, thick), inkMat); h.renderOrder = -1; mesh.add(h); mesh.userData.line = h; }
        return mesh;
    }

    /** Shapes merged into one mesh with vertex colours, and one outline mesh: two draw calls however many parts. thick: world units. */
    function prop(parts, { thick = 0.07 } = {}) {
        const body = { p: [], n: [], c: [] }, line = [];
        const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), col = new T.Color(), v = new T.Vector3(), nm = new T.Matrix3();
        for (const { geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], ink = true } of parts) {
            const sc = Array.isArray(s) ? s : [s, s, s];
            m.compose(v.set(p[0], p[1], p[2]), q.setFromEuler(e.set(r[0], r[1], r[2])), new T.Vector3(sc[0], sc[1], sc[2]));
            nm.getNormalMatrix(m);
            const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m);
            col.setHex(color);
            const pos = g.attributes.position, nor = g.attributes.normal;
            for (let i = 0; i < pos.count; i++) { body.p.push(pos.getX(i), pos.getY(i), pos.getZ(i)); body.n.push(nor.getX(i), nor.getY(i), nor.getZ(i)); body.c.push(col.r, col.g, col.b); }
            if (ink && thick > 0) { const h = hull(geo, thick / ((sc[0] + sc[1] + sc[2]) / 3)).clone(); h.applyMatrix4(m); line.push(h); }
        }
        const bg = new T.BufferGeometry();
        bg.setAttribute('position', new T.Float32BufferAttribute(body.p, 3)); bg.setAttribute('normal', new T.Float32BufferAttribute(body.n, 3)); bg.setAttribute('color', new T.Float32BufferAttribute(body.c, 3));
        const mesh = new T.Mesh(bg, toon(0xffffff, { vertexColors: true }));
        if (line.length) {
            const lp = []; for (const h of line) { const a = h.attributes.position; for (let i = 0; i < a.count; i++) lp.push(a.getX(i), a.getY(i), a.getZ(i)); }
            const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
            const lm = new T.Mesh(lg, inkMat); lm.renderOrder = -1; mesh.add(lm); mesh.userData.line = lm;
        }
        return mesh;
    }

    /** Many copies of a shape (a wall of boulders, a fence of crystals) in two draw calls. */
    function instanced(geo, count, thick = 0.07, o = {}) {
        const body = new T.InstancedMesh(geo, toon(0xffffff, o), count), line = thick > 0 ? new T.InstancedMesh(hull(geo, thick), inkMat, count) : null;
        body.frustumCulled = false; if (line) { line.frustumCulled = false; line.renderOrder = -1; }
        const c = new T.Color();
        return {
            body, line, count,
            set(i, matrix, hex) { body.setMatrixAt(i, matrix); if (line) line.setMatrixAt(i, matrix); if (hex != null) body.setColorAt(i, c.setHex(hex)); },
            done() { body.instanceMatrix.needsUpdate = true; if (body.instanceColor) body.instanceColor.needsUpdate = true; if (line) line.instanceMatrix.needsUpdate = true; },
        };
    }

    /** A group's plain (Lambert) meshes become toon, and each gets its outline. Basic-material bits (pupils) are left alone. */
    function inkify(root, thick = 0.08) {
        const list = []; root.traverse(o => { if (o.isMesh && o.material && o.material.isMeshLambertMaterial && !o.userData.noInk) list.push(o); });
        const made = new Map();                   // (meshes that shared a colour keep sharing one material, so a recolour still reaches them all)
        for (const o of list) {
            const c = o.material.color.getHex(); if (!made.has(c)) made.set(c, toon(c, { flatShading: false })); o.material = made.get(c);
            const h = new T.Mesh(hull(o.geometry, thick), inkMat); h.renderOrder = -1; o.add(h); o.userData.line = h;
        }
        return root;
    }

    return { T, ramp, ink: inkMat, toon, hull, part, prop, instanced, inkify, INK };
}
