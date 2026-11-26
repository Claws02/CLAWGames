// node tests/devices.test.mjs — device maths against hand-worked numbers.
import assert from 'node:assert/strict';
import { springLaunch, liftDrive, seriesCircuit } from '../core/Devices.js';
import { compile, step } from '../core/World.js';
import { P } from '../core/Rules.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('spring: ½kx² = mgh', () => {
    // 70 000 × 0.3² / (2 × 80 × 9.81) = 6300 / 1569.6 = 4.0138
    near(springLaunch(70000, 0.3, 80).h, 4.0138, 1e-3, 'h');
    near(springLaunch(30000, 0.3, 80).h, 1.7202, 1e-3, 'h');
    // doubling k doubles h; doubling x quadruples it
    near(springLaunch(140000, 0.3, 80).h / springLaunch(70000, 0.3, 80).h, 2, 1e-9, 'k');
    near(springLaunch(70000, 0.6, 80).h / springLaunch(70000, 0.3, 80).h, 4, 1e-9, 'x');
});
t('lift: torque and speed through a reduction', () => {
    const m = { torque: 3, rpm: 12000 };
    const a = liftDrive({ ratio: 80, eff: 0.9 }, m, 0.1, 200);
    near(a.torqueOut, 216, 1e-9, 'τout'); near(a.torqueNeed, 196.2, 1e-9, 'τneed'); assert.ok(a.ok);
    near(a.v, (12000 * 2 * Math.PI / 60) / 80 * 0.1, 1e-12, 'v');   // 1.5708 m/s
    assert.equal(liftDrive({ ratio: 20, eff: 0.9 }, m, 0.1, 200).ok, false);
});
t("circuit: Ohm's law, open, fuse", () => {
    near(seriesCircuit(12, 10, [10], 0.4, 1.0).I, 0.6, 1e-12, 'I');
    assert.equal(seriesCircuit(12, 10, [10], 0.4, 1.0).state, 'on');
    assert.equal(seriesCircuit(12, 10, [0], 0.4, 1.0).state, 'blown');   // 1.2 A
    assert.equal(seriesCircuit(12, 10, [47], 0.4, 1.0).state, 'low');    // 0.21 A
    assert.equal(seriesCircuit(12, 10, [null], 0.4, 1.0).state, 'open');
    near(seriesCircuit(24, 20, [5, 10], 0.5, 0.8).I, 24 / 35, 1e-12, 'series');
});
t('engine: spring launch height matches the device maths in-world', () => {
    const lvl = { map: ['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#S.......#', '####.#####', '##########'],
        parts: [{ id: 'k', kind: 'spring', k: 70000 }], devices: [{ type: 'socket', id: 's', x: 1, y: 10, accepts: 'spring', preset: 'k' }, { type: 'spring', id: 'p', x: 4, y: 11, compress: 0.3, socket: 's' }] };
    const w = compile(lvl);
    let minFeet = 99, launched = false;
    for (let i = 0; i < 200; i++) {
        const ev = step(w, { r: i < 30, l: false, u: false, d: false, j: false, act: null });
        if (ev.some(e => e.type === 'spring')) launched = true;
        if (launched) minFeet = Math.min(minFeet, w.s.p.y + P.H);
    }
    assert.ok(launched, 'launched');
    near(11 - minFeet, 4.0138, 0.25, 'in-world rise (discrete integration tolerance)');
});
console.log(`\n${n} passed`);
