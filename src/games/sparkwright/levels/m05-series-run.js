// Series Run — two resistors in series add, the same current runs through both, and each
// must survive its own I²R. 24 V, lamp 20 Ω, needs 0.5–0.8 A (burns above 0.8 A).
//   5 Ω (5 W) + 10 Ω → 35 Ω, 0.686 A, P = 2.35 W + 4.7 W ✓      $4 + 0.75 A fuse $1 = $5 ★★★
//   5 Ω (0.5 W) + 10 Ω → the small 5 Ω burns · 10 + 22 → 0.46 A too dim · 47 Ω anything → dim or burns
export default {
    id: 'm05', world: 'elec', order: 5, name: 'Series Run',
    teaches: ['series'], requires: ['ohm', 'power', 'fuse'],
    brief: 'Work order: light the bridge lamp from 24 V. It needs 0.5–0.8 A and burns above 0.8 A. Two resistor slots in a line, one fuse. Budget $5.',
    map: [
        '######################',
        '#....................#',
        '#....................#',
        '#....................#',
        '#....................#',
        '#....................#',
        '#S..................G#',
        '#######......#########',
        '#######^^^^^^#########',
        '######################',
    ],
    parts: [
        { id: 'r5s', kind: 'resistor', ohms: 5, watts: 0.5, mass: 0.02, cost: 1, label: 'Resistor 5 Ω · 0.5 W' },
        { id: 'r5p', kind: 'resistor', ohms: 5, watts: 5, mass: 0.1, cost: 2, label: 'Resistor 5 Ω · 5 W' },
        { id: 'r10', kind: 'resistor', ohms: 10, watts: 5, mass: 0.1, cost: 2, label: 'Resistor 10 Ω · 5 W' },
        { id: 'r22', kind: 'resistor', ohms: 22, watts: 10, mass: 0.2, cost: 3, label: 'Resistor 22 Ω · 10 W' },
        { id: 'r47', kind: 'resistor', ohms: 47, watts: 1, mass: 0.05, cost: 1, label: 'Resistor 47 Ω · 1 W' },
        { id: 'f05', kind: 'fuse', amps: 0.5, mass: 0.02, cost: 1, label: 'Fuse 0.5 A' },
        { id: 'f075', kind: 'fuse', amps: 0.75, mass: 0.02, cost: 1, label: 'Fuse 0.75 A' },
        { id: 'f2', kind: 'fuse', amps: 2, mass: 0.02, cost: 1, label: 'Fuse 2 A' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 3, y: 6, slots: [{ id: 'r1', accepts: 'resistor', label: 'Resistor 1' }, { id: 'r2', accepts: 'resistor', label: 'Resistor 2' }, { id: 'fuse', accepts: 'fuse', label: 'Fuse' }] },
        { type: 'circuit', id: 'c1', socket: 's1', volts: 24, loadR: 20, iMin: 0.5, iMax: 0.8, drives: ['bridge'] },
        { type: 'bridge', id: 'bridge', x: 7, y: 7, w: 6 },
    ],
    solution: { s1: { r1: 'r5p', r2: 'r10', fuse: 'f075' } },
    workOrder: { title: 'Light the bridge', checks: [{ type: 'budget', max: 5 }, { type: 'fuseProtects', device: 'c1' }] },
    par: { seconds: 6 },
};
