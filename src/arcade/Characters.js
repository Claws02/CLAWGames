// ============================================================
// CHARACTERS — the cast a player can pick, the same nine figures and names
// HundredBlockDash uses (its GameConfig CHAR_NAMES / CHAR_ICONS), and their
// portraits: the real 3D meshes, rendered offscreen once and cached.
// ============================================================
import { createCharacterMesh } from '../claw-core/engine/CharacterModels.js';

export const CHARS = [
    { id: 'slime',     name: 'Bloop',     icon: '💧' },
    { id: 'ghost',     name: 'Spook',     icon: '👻' },
    { id: 'boxy',      name: 'Crate',     icon: '🧊' },
    { id: 'bunny',     name: 'Thumper',   icon: '🐰' },
    { id: 'cabbie',    name: 'Cabbie',    icon: '🚕' },
    { id: 'vendor',    name: 'Vendor',    icon: '🌮' },
    { id: 'banker',    name: 'Banker',    icon: '💼' },
    { id: 'bodyguard', name: 'Bodyguard', icon: '🦺' },
    { id: 'investor',  name: 'Investor',  icon: '📈' },
];
export const charOf = id => CHARS.find(c => c.id === id) || CHARS[0];

// type|color → data URL. A portrait is a ~10 kB PNG; there are at most
// 9 characters × 4 seat colours, so the cache never needs evicting.
const _cache = new Map();

/**
 * Portraits for `types` in `color`, as data URLs (missing on a device with
 * no WebGL, where callers fall back to the emoji). One throwaway WebGL
 * context per call, released before returning: browsers cap live contexts,
 * and a minigame stage may want one right after.
 */
export function portraits(types, color, size = 176) {
    const out = {};
    const todo = types.filter(t => {
        const hit = _cache.get(t + '|' + color);
        if (hit) out[t] = hit;
        return !hit;
    });
    if (!todo.length || typeof THREE === 'undefined') return out;
    let gl = null;
    try {
        gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        gl.setSize(size, size, false);
        gl.setClearColor(0x000000, 0);
        const s = new THREE.Scene();
        s.add(new THREE.AmbientLight(0xffffff, 0.95));
        const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(2.5, 4, 3.5); s.add(key);
        const rim = new THREE.DirectionalLight(0xbcd8ff, 0.55); rim.position.set(-3, 2, -2); s.add(rim);
        const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
        for (const t of todo) {
            const grp = createCharacterMesh(t, color);
            s.add(grp);
            // Framed from the bounding sphere, so tall figures keep their ears
            // and hats and squat ones are not tiny (HBD's Renderer does the same).
            const sph = new THREE.Box3().setFromObject(grp).getBoundingSphere(new THREE.Sphere());
            const dist = (sph.radius * 0.86) / Math.sin((cam.fov * Math.PI / 180) / 2);
            cam.position.set(sph.center.x + dist * 0.2, sph.center.y + dist * 0.13, sph.center.z + dist);
            cam.lookAt(sph.center);
            gl.render(s, cam);
            const url = gl.domElement.toDataURL('image/png');
            _cache.set(t + '|' + color, url);
            out[t] = url;
            s.remove(grp);
            grp.traverse(o => {
                o.geometry?.dispose();
                (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose());
            });
        }
    } catch (e) {
        console.warn('[Characters] portraits unavailable:', e);
    } finally {
        if (gl) { gl.dispose(); try { gl.forceContextLoss(); } catch (e) {} }
    }
    return out;
}

/** An <img> for one character, or its emoji where there is no WebGL. */
export function faceHTML(type, color, cls = 'face') {
    const url = portraits([type], color)[type];
    const c = charOf(type);
    return url ? `<img class="${cls}" src="${url}" alt="${c.name}">` : `<span class="${cls} emoji">${c.icon}</span>`;
}
