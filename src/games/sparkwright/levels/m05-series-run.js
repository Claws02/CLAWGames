// Series Run — resistors in series add. The light bridge needs 0.5–0.8 A from 24 V through a 20 Ω lamp,
// so the two sockets must add to 10–28 Ω.  5+10 ✓ · 5+22 ✓ · 10+22 → 0.46 A ✗ · anything with 47 ✗
export default {
    id: 'm05', world: 'elec', order: 5, name: 'Series Run',
    teaches: ['series'], requires: ['ohm', 'fuse'],
    brief: 'Two sockets in series. Their resistances add. Light the bridge without blowing the fuse.',
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
        { id: 'r5', kind: 'resistor', ohms: 5, label: 'Resistor 5 Ω' },
        { id: 'r10', kind: 'resistor', ohms: 10, label: 'Resistor 10 Ω' },
        { id: 'r22', kind: 'resistor', ohms: 22, label: 'Resistor 22 Ω' },
        { id: 'r47', kind: 'resistor', ohms: 47, label: 'Resistor 47 Ω' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 2, y: 6, accepts: 'resistor' },
        { type: 'socket', id: 's2', x: 4, y: 6, accepts: 'resistor' },
        { type: 'circuit', id: 'c1', volts: 24, loadR: 20, iMin: 0.5, iMax: 0.8, sockets: ['s1', 's2'], drives: ['bridge'] },
        { type: 'bridge', id: 'bridge', x: 7, y: 7, w: 6 },
    ],
    solution: { s1: 'r5', s2: 'r10' },
    par: { seconds: 5 },
};
