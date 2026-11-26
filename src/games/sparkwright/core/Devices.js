// ============================================================
// DEVICES — the engineering. Pure functions, SI units in, SI units out.
//
// The engine, the solver, the lint AND the on-screen readouts all call
// these, so what the player is shown is exactly what the world does.
// tests/devices.test.mjs checks each against hand-worked numbers.
//
//   springLaunch(springs[], x, m)       → { k, h }                  parallel springs: k adds
//   liftDrive(motor, gear, drumR, m)    → { state, torqueOut, torqueNeed, margin, v }
//        state: 'nomotor' | 'nogear' | 'stall' | 'strip' | 'ok'
//   circuit(V, load, resistors[], fuse) → { state, R, I, P[] }
//        state: 'open' | 'nofuse' | 'fuse' | 'burn-load' | 'burn-r' | 'low' | 'on'
// Each result carries `lines`: the worked maths, shown AFTER the player tests it.
// ============================================================
import { SI } from './Rules.js';

const TAU = 2 * Math.PI;
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const fmtN = n => n.toLocaleString('en-US');

/**
 * Spring pad. Springs fitted side by side push in parallel, so k = Σk.
 * Elastic energy ½·k·x² becomes potential energy m·g·h:   h = k·x² / (2·m·g)
 * m is everything being thrown: the engineer plus the parts still in the tray.
 */
export function springLaunch(springs, x, m) {
    const k = springs.reduce((a, s) => a + s.k, 0);
    const h = (k * x * x) / (2 * m * SI.g);
    const kLine = springs.length > 1 ? `k = ${springs.map(s => fmtN(s.k)).join(' + ')} = ${fmtN(k)} N/m` : `k = ${fmtN(k)} N/m`;
    return {
        k, h,
        lines: [kLine, `h = k·x² / (2·m·g) = ${fmtN(k)} × ${x}² / (2 × ${round(m, 1)} × ${SI.g})`, `  = ${round(h)} m`],
    };
}

/**
 * Geared lift. Motor (torque N·m, rpm) → n:1 gearbox (efficiency η, output
 * rating maxTorque) → drum of radius r.
 *   torqueOut  = τ·n·η          what the drive can give
 *   torqueNeed = m·g·r          what the load asks for (m = car + rider)
 *   strip      when torqueNeed > gear.maxTorque (the gearbox carries the load torque)
 *   v          = (rpm·2π/60) / n · r
 */
export function liftDrive(motor, gear, drumR, m) {
    if (!motor) return { state: 'nomotor', lines: ['No motor fitted.'] };
    if (!gear) return { state: 'nogear', lines: ['No gearbox fitted.'] };
    const torqueOut = motor.torque * gear.ratio * gear.eff;
    const torqueNeed = m * SI.g * drumR;
    const v = ((motor.rpm * TAU) / 60 / gear.ratio) * drumR;
    const margin = torqueOut / torqueNeed;
    const state = torqueOut < torqueNeed ? 'stall' : torqueNeed > gear.maxTorque ? 'strip' : 'ok';
    const lines = [
        `τ_out = τ·n·η = ${motor.torque} × ${gear.ratio} × ${gear.eff} = ${round(torqueOut, 1)} N·m`,
        `τ_need = m·g·r = ${round(m, 1)} × ${SI.g} × ${drumR} = ${round(torqueNeed, 1)} N·m`,
    ];
    if (state === 'stall') lines.push('✗ stalls: τ_out < τ_need');
    else if (state === 'strip') lines.push(`✗ strips: the gearbox is rated ${gear.maxTorque} N·m, the load puts ${round(torqueNeed, 1)} through it`);
    else lines.push(`✓ lifts at v = ω·r / n = ${round(v)} m/s (torque margin ×${round(margin)})`);
    return { state, torqueOut, torqueNeed, margin, v, lines };
}

/**
 * Series loop: supply V → resistors → load → fuse.
 *   R = R_load + ΣR,   I = V / R,   P_i = I²·R_i
 * Checked in the order a real circuit fails: no fuse (interlock: no power),
 * fuse blows (I > I_fuse), load burns (I > load.iMax), a resistor burns
 * (P > its rating), too little current (I < load.iMin), else on.
 * `load` = { R, iMin, iMax }. Empty resistor slot or no supply = open circuit.
 */
export function circuit(V, load, resistors, fuse) {
    if (V == null) return { state: 'open', I: 0, R: Infinity, P: [], lines: ['No supply fitted: open circuit, I = 0 A'] };
    if (resistors.some(r => r == null)) return { state: 'open', I: 0, R: Infinity, P: [], lines: ['A resistor slot is empty: open circuit, I = 0 A'] };
    const R = load.R + resistors.reduce((a, r) => a + r.ohms, 0);
    const I = R > 0 ? V / R : Infinity;
    const P = resistors.map(r => I * I * r.ohms);
    const lines = [
        `R = ${[load.R, ...resistors.map(r => r.ohms)].join(' + ')} = ${round(R)} Ω`,
        `I = V / R = ${V} / ${round(R)} = ${round(I, 3)} A`,
    ];
    resistors.forEach((r, i) => { if (r.ohms > 0) lines.push(`P = I²·R = ${round(I, 3)}² × ${r.ohms} = ${round(P[i], 2)} W (rated ${r.watts} W)`); });
    let state;
    if (!fuse) state = 'nofuse';
    else if (I > fuse.amps) state = 'fuse';
    else if (I > load.iMax) state = 'burn-load';
    else if (resistors.some((r, i) => P[i] > r.watts)) state = 'burn-r';
    else if (I < load.iMin) state = 'low';
    else state = 'on';
    lines.push({
        nofuse: '✗ no fuse fitted: the safety interlock keeps the power off',
        fuse: `✗ ${round(I, 2)} A is over the ${fuse?.amps} A fuse: it blows`,
        'burn-load': `✗ ${round(I, 2)} A is over the load's ${load.iMax} A limit, and the ${fuse?.amps} A fuse didn't stop it: the load burns`,
        'burn-r': '✗ a resistor is over its power rating: it burns',
        low: `✗ ${round(I, 3)} A is under the ${load.iMin} A the load needs`,
        on: `✓ ${round(I, 3)} A: inside ${load.iMin}–${load.iMax} A, fuse ${fuse?.amps} A holds`,
    }[state]);
    return { state, R, I, P, lines };
}
