// Shift Change — spring up with a heavier tray (the batteries ride with you), then choose the
// supply, resistor and fuse for the door motor: 8 Ω, runs 0.45–0.8 A, burns above 0.8 A.
//   12 V + 10 Ω → 0.667 A, P = 4.4 W (5 W ✓) + 0.75 A fuse ✓ — every other supply/resistor pair is
//   too weak, burns the resistor or the motor. Budget $16 = 30k + 45k springs + 12 V + 10 Ω + 0.75 A.
export default {
    id: 'm06', world: 'elec', order: 6, name: 'Shift Change',
    teaches: ['voltage'], requires: ['spring', 'parallel', 'ohm', 'power', 'fuse'],
    brief: 'Work order: get up top, then wire the door motor (8 Ω, runs 0.45–0.8 A, burns above 0.8 A) from a battery. Everything you haven\'t fitted rides in your tray. Budget $16.',
    map: [
        '########################',
        '#.................#....#',
        '#################.#....#',
        '#vvvvvvvvvvvvvvvv.#....#',
        '#.................#....#',
        '#......................#',
        '#......................#',
        '#.....................G#',
        '#.........##############',
        '#.........##############',
        '#S........##############',
        '########.###############',
        '########################',
    ],
    parts: [
        { id: 'k30', kind: 'spring', k: 30000, mass: 0.8, cost: 4, label: 'Spring 30 kN/m' },
        { id: 'k45', kind: 'spring', k: 45000, mass: 1.0, cost: 6, label: 'Spring 45 kN/m' },
        { id: 'k70', kind: 'spring', k: 70000, mass: 1.4, cost: 12, label: 'Spring 70 kN/m' },
        { id: 'k140', kind: 'spring', k: 140000, mass: 2.2, cost: 20, label: 'Spring 140 kN/m' },
        { id: 'b6', kind: 'battery', volts: 6, mass: 0.6, cost: 2, label: 'Battery 6 V' },
        { id: 'b12', kind: 'battery', volts: 12, mass: 1.2, cost: 3, label: 'Battery 12 V' },
        { id: 'b24', kind: 'battery', volts: 24, mass: 2.5, cost: 6, label: 'Battery 24 V' },
        { id: 'r10', kind: 'resistor', ohms: 10, watts: 5, mass: 0.1, cost: 2, label: 'Resistor 10 Ω · 5 W' },
        { id: 'r22', kind: 'resistor', ohms: 22, watts: 5, mass: 0.1, cost: 2, label: 'Resistor 22 Ω · 5 W' },
        { id: 'r47', kind: 'resistor', ohms: 47, watts: 5, mass: 0.1, cost: 2, label: 'Resistor 47 Ω · 5 W' },
        { id: 'f05', kind: 'fuse', amps: 0.5, mass: 0.02, cost: 1, label: 'Fuse 0.5 A' },
        { id: 'f075', kind: 'fuse', amps: 0.75, mass: 0.02, cost: 1, label: 'Fuse 0.75 A' },
        { id: 'f1', kind: 'fuse', amps: 1, mass: 0.02, cost: 1, label: 'Fuse 1 A' },
    ],
    devices: [
        { type: 'socket', id: 'sk', x: 4, y: 10, slots: [{ id: 'a', accepts: 'spring', label: 'Mount A' }, { id: 'b', accepts: 'spring', label: 'Mount B' }] },
        { type: 'spring', id: 'pad', x: 8, y: 11, compress: 0.3, socket: 'sk' },
        { type: 'socket', id: 'sb', x: 13, y: 7, slots: [{ id: 'bat', accepts: 'battery', label: 'Battery' }, { id: 'r', accepts: 'resistor', label: 'Resistor' }, { id: 'fuse', accepts: 'fuse', label: 'Fuse' }] },
        { type: 'circuit', id: 'c1', socket: 'sb', loadR: 8, iMin: 0.45, iMax: 0.8, drives: ['door'] },
        { type: 'door', id: 'door', x: 18, y: 5, h: 3 },
    ],
    solution: { sk: { a: 'k30', b: 'k45' }, sb: { bat: 'b12', r: 'r10', fuse: 'f075' } },
    workOrder: { title: 'Open the shift-change door', checks: [{ type: 'budget', max: 16 }, { type: 'fuseProtects', device: 'c1' }] },
    par: { seconds: 12 },
};
