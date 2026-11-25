// Shift Change — spring up to the ledge, then pick supply AND resistor for the door.
// Spring: as m02 (70 kN/m clears 3 m; 140 kN/m hits the spikes).
// Door motor 8 Ω, needs 0.45–0.7 A:  12 V + 10 Ω → 0.667 A ✓ — every other pair is low or blows the fuse.
export default {
    id: 'm06', world: 'elec', order: 6, name: 'Shift Change',
    teaches: ['voltage'], requires: ['spring', 'ohm', 'fuse'],
    brief: 'Get up top, then choose a battery and a resistor. Only one pair runs the door motor safely.',
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
        { id: 'k30', kind: 'spring', k: 30000, label: 'Spring 30 kN/m' },
        { id: 'k70', kind: 'spring', k: 70000, label: 'Spring 70 kN/m' },
        { id: 'k140', kind: 'spring', k: 140000, label: 'Spring 140 kN/m' },
        { id: 'b6', kind: 'battery', volts: 6, label: 'Battery 6 V' },
        { id: 'b12', kind: 'battery', volts: 12, label: 'Battery 12 V' },
        { id: 'b24', kind: 'battery', volts: 24, label: 'Battery 24 V' },
        { id: 'r10', kind: 'resistor', ohms: 10, label: 'Resistor 10 Ω' },
        { id: 'r22', kind: 'resistor', ohms: 22, label: 'Resistor 22 Ω' },
        { id: 'r47', kind: 'resistor', ohms: 47, label: 'Resistor 47 Ω' },
    ],
    devices: [
        { type: 'socket', id: 'sk', x: 4, y: 10, accepts: 'spring' },
        { type: 'spring', id: 'pad', x: 8, y: 11, compress: 0.3, socket: 'sk' },
        { type: 'socket', id: 'sb', x: 12, y: 7, accepts: 'battery' },
        { type: 'socket', id: 'sr', x: 14, y: 7, accepts: 'resistor' },
        { type: 'circuit', id: 'c1', battery: 'sb', loadR: 8, iMin: 0.45, iMax: 0.7, sockets: ['sr'], drives: ['door'] },
        { type: 'door', id: 'door', x: 18, y: 5, h: 3 },
    ],
    solution: { sk: 'k70', sb: 'b12', sr: 'r10' },
    par: { seconds: 9 },
};
