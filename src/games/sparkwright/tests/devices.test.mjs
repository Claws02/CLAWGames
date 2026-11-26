// node tests/devices.test.mjs — device maths vs hand-worked numbers, plus the checker on broken work orders.
import assert from 'node:assert/strict';
import { springLaunch, liftDrive, circuit } from '../core/Devices.js';
import { compile, step } from '../core/World.js';
import { lintLevel } from '../core/Lint.js';
import { P } from '../core/Rules.js';
import m03 from '../levels/m03-heavy-lifting.js';
import m04 from '../levels/m04-ohm-sweet-ohm.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('spring: ½kx² = mgh, parallel springs add', () => {
    // 70 000 × 0.3² / (2 × 80 × 9.81) = 6300 / 1569.6 = 4.0138
    near(springLaunch([{ k: 70000 }], 0.3, 80).h, 4.0138, 1e-3, 'h');
    const par = springLaunch([{ k: 30000 }, { k: 45000 }], 0.3, 80);
    assert.equal(par.k, 75000);
    near(par.h, 75000 * 0.09 / (2 * 80 * 9.81), 1e-12, 'parallel h');
    // a heavier load flies lower in proportion
    near(springLaunch([{ k: 70000 }], 0.3, 160).h, 4.0138 / 2, 1e-3, 'mass');
});
t('lift: torque, speed, stall and strip', () => {
    const mC = { torque: 6, rpm: 6000 }, g50 = { ratio: 50, eff: 0.9, maxTorque: 250 }, g80 = { ratio: 80, eff: 0.9, maxTorque: 180 };
    const a = liftDrive(mC, g50, 0.1, 200);
    near(a.torqueOut, 270, 1e-9, 'τout'); near(a.torqueNeed, 196.2, 1e-9, 'τneed');
    assert.equal(a.state, 'ok');
    near(a.v, (6000 * 2 * Math.PI / 60) / 50 * 0.1, 1e-12, 'v');   // 1.2566 m/s
    assert.equal(liftDrive(mC, g80, 0.1, 200).state, 'strip');        // 432 ≥ 196 but rated 180
    assert.equal(liftDrive({ torque: 2, rpm: 12000 }, g50, 0.1, 200).state, 'stall');   // 90 < 196
    assert.equal(liftDrive(null, g50, 0.1, 200).state, 'nomotor');
});
t("circuit: Ohm's law, power ratings, fuse order", () => {
    const load = { R: 10, iMin: 0.4, iMax: 1.0 };
    const f1 = { amps: 1 }, f5 = { amps: 5 };
    const ok = circuit(12, load, [{ ohms: 10, watts: 5 }], f1);
    near(ok.I, 0.6, 1e-12, 'I'); near(ok.P[0], 3.6, 1e-9, 'P = I²R'); assert.equal(ok.state, 'on');
    assert.equal(circuit(12, load, [{ ohms: 10, watts: 0.25 }], f1).state, 'burn-r');    // 3.6 W in a 0.25 W body
    assert.equal(circuit(12, load, [{ ohms: 0, watts: 50 }], f1).state, 'fuse');        // 1.2 A > 1 A fuse
    assert.equal(circuit(12, load, [{ ohms: 0, watts: 50 }], f5).state, 'burn-load');   // fuse too big: the motor burns
    assert.equal(circuit(12, load, [{ ohms: 47, watts: 5 }], f1).state, 'low');
    assert.equal(circuit(12, load, [{ ohms: 10, watts: 5 }], null).state, 'nofuse');
    assert.equal(circuit(12, load, [null], f1).state, 'open');
    near(circuit(24, { R: 20, iMin: 0.5, iMax: 0.8 }, [{ ohms: 5, watts: 5 }, { ohms: 10, watts: 5 }], { amps: 0.75 }).I, 24 / 35, 1e-12, 'series');
});
t('engine: spring launch height in-world matches the maths (tray mass counted)', () => {
    const lvl = { map: ['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#S.......#', '####.#####', '##########'],
        parts: [{ id: 'k', kind: 'spring', k: 70000, mass: 1, cost: 1 }, { id: 'brick', kind: 'battery', volts: 6, mass: 20, cost: 1 }],
        devices: [{ type: 'socket', id: 's', x: 1, y: 10, slots: [{ id: 'a', accepts: 'spring' }], preset: { a: 'k' } }, { type: 'spring', id: 'p', x: 4, y: 11, compress: 0.3, socket: 's' }] };
    const w = compile(lvl);
    let minFeet = 99, launched = false;
    for (let i = 0; i < 200; i++) {
        const ev = step(w, { r: i < 30, l: false, u: false, d: false, j: false, act: null });
        if (ev.some(e => e.type === 'spring')) launched = true;
        if (launched) minFeet = Math.min(minFeet, w.s.p.y + P.H);
    }
    assert.ok(launched, 'launched');
    near(11 - minFeet, 70000 * 0.09 / (2 * 100 * 9.81), 0.25, 'in-world rise with a 20 kg tray (discrete integration tolerance)');
});
t('checker: an impossible budget and a missing wrong answer are caught', () => {
    const tight = lintLevel({ ...m03, workOrder: { ...m03.workOrder, checks: [{ type: 'budget', max: 10 }, m03.workOrder.checks[1]] } });
    assert.ok(tight.problems.some(p => /no build earns all three stars/.test(p.what)), 'impossible work order');
    const soft = lintLevel({ ...m04, devices: m04.devices.map(d => (d.type === 'circuit' ? { ...d, iMin: 0, iMax: 100 } : d)), parts: m04.parts.map(p => (p.kind === 'resistor' ? { ...p, watts: 1000 } : p.kind === 'fuse' ? { ...p, amps: 50 } : p)) });
    assert.ok(soft.problems.some(p => /every build works|too forgiving/.test(p.what)), 'forgiving puzzle flagged');
});
console.log(`\n${n} passed`);
