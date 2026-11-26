// Spring Loaded — pick the spring stiffness that clears the ledge but not the ceiling.
// h = k·x²/(2mg), x = 0.3 m, m = 80 kg:  30 kN/m → 1.72 m · 70 kN/m → 4.01 m · 140 kN/m → 8.03 m
export default {
    id: 'm02', world: 'mech', order: 2, name: 'Spring Loaded',
    teaches: ['spring'], requires: ['move'],
    brief: 'The ledge is 3 m up. Too soft and you fall short; too stiff and you meet the ceiling.',
    map: [
        '####################',
        '#vvvvvvvvvvvvvvvvvv#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..............G...#',
        '#.........##########',
        '#.........##########',
        '#S........##########',
        '########.###########',
        '####################',
    ],
    parts: [
        { id: 'k30', kind: 'spring', k: 30000, label: 'Spring 30 kN/m' },
        { id: 'k70', kind: 'spring', k: 70000, label: 'Spring 70 kN/m' },
        { id: 'k140', kind: 'spring', k: 140000, label: 'Spring 140 kN/m' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 4, y: 9, accepts: 'spring' },
        { type: 'spring', id: 'pad', x: 8, y: 10, compress: 0.3, socket: 's1' },
    ],
    solution: { s1: 'k70' },
    par: { seconds: 4 },
};
