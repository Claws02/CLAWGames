// ============================================================
// HERO SPRITES — your character, posed. A sheet of frames rendered ONCE from
// claw-core's rigged figure (CharacterRig: the same toy, with the floating
// gloves the minigames animate), so the 2D renderer can draw a hero that
// runs, jumps, tucks, flails, swings, climbs, swims and cheers, without
// keeping a WebGL context alive (browsers cap them, and phones are slow to
// make them).
//
//   const sheet = createHeroSheet(type, color)   → sheet | null (no WebGL: callers use the portrait)
//   sheet.canvas            the atlas (a 2D canvas)
//   sheet.at(name, i)       → { sx, sy } of frame i of pose `name` (wraps)
//   sheet.count(name)       frames in a pose
//   sheet.size              one frame's side, px
//   sheet.span              one frame's side, in figure heights
//   sheet.feet              where the feet are, as a share of the frame from the top
//
// Cosmetic only: the engine never sees any of this.
// ============================================================
import * as Rig from '../../claw-core/engine/CharacterRig.js';

const TAU = Math.PI * 2;
const SPAN = 2.1;        // a frame is this many figure heights across
const FEET = 0.8;        // feet this far down the frame
const SIDE = 0.85;       // turned this far toward the right (radians): a three-quarter view
const BACK = Math.PI;    // climbing: back to the camera

// Each pose is a list of frames; a frame writes the animator's target pose
// (a flat record: y, squash, leanX, rollZ, fallX, spinY, nod, tilt, eyeOpen,
// hand[0..1] {x, y, z, rx}), starting from the figure standing at rest.
// `face` overrides the facing for that pose. `anim` borrows one of the
// animator's own states at a time instead.
function poses(r) {
    const H = r.H, W = r.halfW, F = r.front;
    const out = r.halfW + r.handR * 1.3;
    const set = (h, x, y, z, rx = 0) => { h.x = x; h.y = y; h.z = z; h.rx = rx; };
    return {
        idle: [0, 1, 2, 3].map(i => T => {
            const b = Math.sin((i / 4) * TAU);
            T.squash = 1 + b * 0.03;
            T.hand[0].y += b * 0.035 * H; T.hand[1].y -= b * 0.035 * H;
        }),
        blink: [T => { T.eyeOpen = 0.08; }],
        run: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ anim: 'run', t: i / 8, rate: 2, then: T => { T.leanX = 0.38; T.y *= 1.4; } })),
        crouch: [T => {
            T.squash = 0.76; T.leanX = 0.14; T.eyeOpen = 0.9;
            set(T.hand[0], -W * 0.8, H * 0.2, F * 0.7); set(T.hand[1], W * 0.8, H * 0.2, F * 0.7);
        }],
        rise: [T => {
            T.squash = 1.12; T.leanX = 0.16; T.eyeOpen = 1.2;
            set(T.hand[0], -out + 0.05 * H, H * 1.0, 0.12); set(T.hand[1], out - 0.05 * H, H * 1.0, 0.12);
        }],
        apex: [T => {
            T.squash = 0.98; T.leanX = 0.08; T.eyeOpen = 1.25;
            set(T.hand[0], -out - 0.3 * H, H * 0.78, 0.05); set(T.hand[1], out + 0.3 * H, H * 0.78, 0.05);
        }],
        fall: [0, 1].map(i => T => {
            T.squash = 1.05; T.leanX = -0.14; T.eyeOpen = 1.35; T.tilt = i ? 0.08 : -0.08;
            set(T.hand[0], -out - (i ? 0.28 : 0.16) * H, H * (i ? 1.12 : 0.98), 0.05);
            set(T.hand[1], out + (i ? 0.16 : 0.28) * H, H * (i ? 0.98 : 1.12), 0.05);
        }),
        launch: [T => {
            // Superhero: stretched long, both fists out front.
            T.squash = 1.16; T.leanX = 0.5; T.eyeOpen = 1.3;
            set(T.hand[0], -W * 0.35, H * 0.95, F + H * 0.35); set(T.hand[1], W * 0.35, H * 0.95, F + H * 0.35);
        }],
        tuck: [T => {
            // Curled up for a somersault, eyes squeezed shut with glee.
            T.squash = 0.8; T.leanX = 0.25; T.eyeOpen = 0.25;
            set(T.hand[0], -W * 0.55, H * 0.32, F + 0.05); set(T.hand[1], W * 0.55, H * 0.32, F + 0.05);
        }],
        skid: [T => {
            // Leaning back, hands out front: sliding on ice or turning hard.
            T.squash = 0.92; T.leanX = -0.42; T.eyeOpen = 1.3;
            set(T.hand[0], -W * 0.7, H * 0.6, F + H * 0.3); set(T.hand[1], W * 0.7, H * 0.72, F + H * 0.22);
        }],
        hang: [0, 1].map(i => T => {
            // Both gloves on the string above, swinging the body.
            T.squash = 1.08; T.leanX = i ? 0.22 : -0.12; T.eyeOpen = 1.15;
            set(T.hand[0], -H * 0.1, H * 1.18, 0.02); set(T.hand[1], H * 0.1, H * 1.28, 0.02);
        }),
        climb: [0, 1].map(i => ({ face: BACK, pose: T => {
            T.squash = 1.02; T.nod = -0.1;
            set(T.hand[0], -out + 0.05 * H, H * (i ? 1.12 : 0.82), -F * 0.6);
            set(T.hand[1], out - 0.05 * H, H * (i ? 0.82 : 1.12), -F * 0.6);
        } })),
        swim: [0, 1, 2, 3].map(i => T => {
            // Belly down, doggy-paddling.
            const a = (i / 4) * TAU, s = Math.sin(a), c = Math.cos(a);
            T.leanX = 1.0; T.squash = 0.96; T.eyeOpen = 1.1; T.nod = -0.5;
            set(T.hand[0], -out, H * 0.42 + c * 0.12 * H, F + s * 0.32 * H);
            set(T.hand[1], out, H * 0.42 - c * 0.12 * H, F - s * 0.32 * H);
        }),
        cheer: [0, 1, 2, 3].map(i => ({ anim: 'victory', t: (i / 4) * (Math.PI / 5.5) })),
        wave: [0, 1].map(i => ({ face: 0.35, pose: T => {
            T.eyeOpen = 1.1; T.tilt = i ? 0.1 : -0.04;
            set(T.hand[1], out + (i ? 0.32 : 0.12) * H, H * 1.05, 0.15, 0);
        } })),
        hurt: [{ anim: 'hit', t: 0.2 }],
    };
}

/** Render every pose of `type` in `color` into one atlas, or null where there's no WebGL. */
export function createHeroSheet(type, color, size = 192) {
    if (typeof THREE === 'undefined' || !Rig.buildRiggedCharacter) return null;
    let gl = null, rig = null;
    try {
        rig = Rig.buildRiggedCharacter(type, color);
        if (rig.shadow) rig.shadow.visible = false;          // the 2D renderer draws its own
        const anim = new Rig.CharacterAnimator(rig);
        const H = rig.H, S = H * SPAN;

        gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        gl.setPixelRatio(1);
        gl.setSize(size, size, false);
        gl.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.95));
        const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(2.5, 4, 3.5); scene.add(key);
        const rim = new THREE.DirectionalLight(0xbcd8ff, 0.55); rim.position.set(-3, 2, -2); scene.add(rim);
        scene.add(rig.root);
        // Orthographic, a little from above: every frame the same scale, feet on the same line.
        const cam = new THREE.OrthographicCamera(-S / 2, S / 2, S * FEET, -S * (1 - FEET), 0.1, 50);
        cam.position.set(0, 10 * Math.sin(0.12), 10 * Math.cos(0.12));
        cam.lookAt(0, 0, 0);
        cam.updateProjectionMatrix();

        const P = poses(rig);
        const names = Object.keys(P);
        const total = names.reduce((n, k) => n + P[k].length, 0);
        const cols = 8, rows = Math.ceil(total / cols);
        const atlas = document.createElement('canvas');
        atlas.width = cols * size; atlas.height = rows * size;
        const actx = atlas.getContext('2d');
        const index = {};
        let n = 0;
        for (const name of names) {
            index[name] = [n, P[name].length];
            for (const fr of P[name]) {
                const spec = typeof fr === 'function' ? { pose: fr } : fr;
                anim.face(spec.face ?? SIDE, true);
                anim.clock = 0;                                   // no breathing wobble between frames
                anim._blinkAt = 99;                               // and no random blink
                if (spec.anim) {
                    anim.play(spec.anim, { restart: true, rate: spec.rate });
                    anim.t = spec.t || 0;
                } else {
                    anim.play('idle', { restart: true });
                }
                anim.update(0);                                   // writes the target (and doesn't move yet)
                if (spec.pose) spec.pose(anim.target, rig);
                if (spec.then) spec.then(anim.target, rig);
                anim.applyPose(10);                               // snap all the way to it
                gl.render(scene, cam);
                actx.drawImage(gl.domElement, (n % cols) * size, Math.floor(n / cols) * size, size, size);
                n++;
            }
        }
        return {
            canvas: atlas, size, span: SPAN, feet: FEET,
            count: name => index[name]?.[1] || 0,
            at(name, i = 0) {
                const e = index[name] || index.idle;
                const k = e[0] + (((Math.floor(i) % e[1]) + e[1]) % e[1]);
                return { sx: (k % cols) * size, sy: Math.floor(k / cols) * size };
            },
        };
    } catch (e) {
        console.warn('[parkour] hero sprites unavailable:', e);
        return null;
    } finally {
        try { rig?.dispose(); } catch (e) {}
        if (gl) { gl.dispose(); try { gl.forceContextLoss(); } catch (e) {} }
    }
}
