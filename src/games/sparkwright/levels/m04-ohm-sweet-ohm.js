// Ohm Sweet Ohm — I = V/R, P = I²R, and a fuse sized to protect the load.
// 12 V, door motor 10 Ω, runs at 0.4–1.0 A (burns above 1.0 A).
//   10 Ω → 0.6 A, P = 3.6 W: the 0.25 W body burns, the 5 W one holds
//   0 Ω jumper → 1.2 A: a 1 A fuse blows (saves the motor); a 5 A fuse lets the motor burn
//   47 Ω → 0.21 A: too weak.   0.5 A fuse: blows at 0.6 A.
// ★★★: 10 Ω 5 W + 1 A fuse = $4. (The 10 W body also works, but blows the budget: over-building costs.)
export default {
    id: 'm04', world: 'elec', order: 4, name: 'Ohm Sweet Ohm',
    teaches: ['ohm', 'power', 'fuse'], requires: ['move'],
    brief: 'Work order: power the door motor from the 12 V line. It runs on 0.4–1.0 A and burns out above 1 A. Fit a resistor and a fuse. Budget $4.',
    map: [
        '##################',
        '#.......#........#',
        '#.......#........#',
        '#.......#........#',
        '#................#',
        '#................#',
        '#S.............G.#',
        '##################',
    ],
    parts: [
        { id: 'r0', kind: 'resistor', ohms: 0, watts: 50, mass: 0.05, cost: 1, label: 'Jumper wire · 0 Ω' },
        { id: 'r10s', kind: 'resistor', ohms: 10, watts: 0.25, mass: 0.02, cost: 1, label: 'Resistor 10 Ω · 0.25 W' },
        { id: 'r10p', kind: 'resistor', ohms: 10, watts: 5, mass: 0.1, cost: 3, label: 'Resistor 10 Ω · 5 W' },
        { id: 'r10x', kind: 'resistor', ohms: 10, watts: 10, mass: 0.2, cost: 5, label: 'Resistor 10 Ω · 10 W' },
        { id: 'r47', kind: 'resistor', ohms: 47, watts: 5, mass: 0.1, cost: 3, label: 'Resistor 47 Ω · 5 W' },
        { id: 'f05', kind: 'fuse', amps: 0.5, mass: 0.02, cost: 1, label: 'Fuse 0.5 A' },
        { id: 'f1', kind: 'fuse', amps: 1, mass: 0.02, cost: 1, label: 'Fuse 1 A' },
        { id: 'f5', kind: 'fuse', amps: 5, mass: 0.02, cost: 1, label: 'Fuse 5 A' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 4, y: 6, slots: [{ id: 'r', accepts: 'resistor', label: 'Resistor' }, { id: 'fuse', accepts: 'fuse', label: 'Fuse' }] },
        { type: 'circuit', id: 'c1', socket: 's1', volts: 12, loadR: 10, iMin: 0.4, iMax: 1.0, drives: ['door'] },
        { type: 'door', id: 'door', x: 8, y: 4, h: 3 },
    ],
    solution: { s1: { r: 'r10p', fuse: 'f1' } },
    workOrder: { title: 'Power the door motor', checks: [{ type: 'budget', max: 4 }, { type: 'fuseProtects', device: 'c1' }] },
    par: { seconds: 6 },
};
