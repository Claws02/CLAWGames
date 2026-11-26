// Spring Loaded — two spring mounts side by side: springs in parallel ADD (k = k₁ + k₂).
// h = k·x²/(2·m·g), x = 0.3 m, m = 80 kg + the parts still in your tray.
//   30k → 1.7 m · 45k → 2.6 m · 70k → ~4.0 m · 30k+45k = 75k → ~4.1 m · 140k → ~7.9 m (spikes)
// Ledge is 3 m. $10 budget: only 30k + 45k ($10) clears it on budget; 70k alone works but costs $12.
export default {
    id: 'm02', world: 'mech', order: 2, name: 'Spring Loaded',
    teaches: ['spring', 'parallel'], requires: ['move'],
    brief: 'Work order: get up to the loading ledge, 3 m up. The pad squashes 0.3 m and has two spring mounts. Budget $10.',
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
        { id: 'k30', kind: 'spring', k: 30000, mass: 0.8, cost: 4, label: 'Spring 30 kN/m' },
        { id: 'k45', kind: 'spring', k: 45000, mass: 1.0, cost: 6, label: 'Spring 45 kN/m' },
        { id: 'k70', kind: 'spring', k: 70000, mass: 1.4, cost: 12, label: 'Spring 70 kN/m' },
        { id: 'k140', kind: 'spring', k: 140000, mass: 2.2, cost: 20, label: 'Spring 140 kN/m' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 4, y: 9, slots: [{ id: 'a', accepts: 'spring', label: 'Mount A' }, { id: 'b', accepts: 'spring', label: 'Mount B' }] },
        { type: 'spring', id: 'pad', x: 8, y: 10, compress: 0.3, socket: 's1' },
    ],
    solution: { s1: { a: 'k30', b: 'k45' } },
    workOrder: { title: 'Reach the loading ledge', checks: [{ type: 'budget', max: 10 }, { type: 'noRestarts' }] },
    par: { seconds: 5 },
};
