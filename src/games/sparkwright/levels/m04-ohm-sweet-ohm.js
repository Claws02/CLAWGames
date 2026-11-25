// Ohm Sweet Ohm — I = V/R. The door motor needs 0.4–1.0 A; the fuse blows above 1.0 A.
// 12 V, motor 10 Ω:  jumper 0 Ω → 1.2 A (blows) · 10 Ω → 0.6 A ✓ · 47 Ω → 0.21 A (too weak)
export default {
    id: 'm04', world: 'elec', order: 4, name: 'Ohm Sweet Ohm',
    teaches: ['ohm', 'fuse'], requires: ['move'],
    brief: 'The door motor runs on 0.4–1.0 A from a 12 V supply. Pick the resistor that lands in the window.',
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
        { id: 'r0', kind: 'resistor', ohms: 0, label: 'Jumper wire 0 Ω' },
        { id: 'r10', kind: 'resistor', ohms: 10, label: 'Resistor 10 Ω' },
        { id: 'r47', kind: 'resistor', ohms: 47, label: 'Resistor 47 Ω' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 4, y: 6, accepts: 'resistor' },
        { type: 'circuit', id: 'c1', volts: 12, loadR: 10, iMin: 0.4, iMax: 1.0, sockets: ['s1'], drives: ['door'] },
        { type: 'door', id: 'door', x: 8, y: 4, h: 3 },
    ],
    solution: { s1: 'r10' },
    par: { seconds: 4 },
};
