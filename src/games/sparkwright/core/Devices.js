// ============================================================
// DEVICES — the engineering. Pure functions, SI units in, SI units out.
//
// The engine, the solver, the lint AND the on-screen readouts all call
// these, so what the player is shown is exactly what the world does.
// tests/devices.test.mjs checks each against hand-worked numbers.
//
//   springLaunch(k, x, m)            → { h }        launch height, m
//   liftDrive(gear, motor, drumR, m) → { torqueOut, torqueNeed, ok, v }
//   seriesCircuit(V, loadR, parts, iMin, iMax) → { R, I, state }
// ============================================================
import { SI } from './Rules.js';

const TAU = 2 * Math.PI;
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Spring pad. Elastic energy ½·k·x² becomes potential energy m·g·h.
 *   h = k·x² / (2·m·g)
 * k N/m, x compression m, m kg. Losses ignored [simplification, stated in-game].
 */
export function springLaunch(k, x, m) {
    const h = (k * x * x) / (2 * m * SI.g);
    return {
        h,
        lines: [
            `h = k·x² / (2·m·g)`,
            `  = ${k.toLocaleString('en-US')} × ${x}² / (2 × ${m} × ${SI.g})`,
            `  = ${round(h)} m`,
        ],
    };
}

/**
 * Geared lift. A motor (torque N·m, speed rpm) drives a drum of radius r
 * through an n:1 reduction with efficiency eff.
 *   torqueOut  = τ_motor · n · eff
 *   torqueNeed = m · g · r                (m = platform + rider)
 *   v          = (rpm · 2π/60) / n · r    m/s
 * The lift only moves if torqueOut ≥ torqueNeed.
 */
export function liftDrive(gear, motor, drumR, m) {
    const torqueOut = motor.torque * gear.ratio * gear.eff;
    const torqueNeed = m * SI.g * drumR;
    const v = ((motor.rpm * TAU) / 60 / gear.ratio) * drumR;
    const ok = torqueOut >= torqueNeed;
    return {
        torqueOut, torqueNeed, ok, v,
        lines: [
            `τ_out = τ·n·η = ${motor.torque} × ${gear.ratio} × ${gear.eff} = ${round(torqueOut, 1)} N·m`,
            `τ_need = m·g·r = ${m} × ${SI.g} × ${drumR} = ${round(torqueNeed, 1)} N·m`,
            ok ? `✓ lifts at v = ω·r = ${round(v)} m/s` : `✗ stalls — not enough torque`,
        ],
    };
}

/**
 * Series loop: battery V, a fixed load, and the resistors in the sockets.
 * Any empty socket = open circuit.
 *   R = R_load + ΣR,   I = V / R
 * state: 'open' | 'low' (I < iMin) | 'on' | 'blown' (I > iMax)
 */
export function seriesCircuit(V, loadR, resistors, iMin, iMax) {
    if (V == null || resistors.some(r => r == null)) {
        return { R: Infinity, I: 0, state: 'open', lines: ['Open circuit — a socket is empty', 'I = 0 A'] };
    }
    const R = loadR + resistors.reduce((a, r) => a + r, 0);
    const I = R > 0 ? V / R : Infinity;
    const state = I > iMax ? 'blown' : I >= iMin ? 'on' : 'low';
    const rTerms = [loadR, ...resistors].map(r => `${r}`).join(' + ');
    return {
        R, I, state,
        lines: [
            `R = ${rTerms} = ${round(R)} Ω`,
            `I = V / R = ${V} / ${round(R)} = ${round(I, 3)} A`,
            state === 'on' ? `✓ within ${iMin}–${iMax} A`
                : state === 'low' ? `✗ below ${iMin} A — load won't run`
                : `✗ over ${iMax} A — FUSE BLOWS`,
        ],
    };
}
