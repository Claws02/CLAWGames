// Heavy Lifting — a gear reduction trades speed for torque.
// Motor 3 N·m @ 12 000 rpm, drum r = 0.1 m, car 120 kg + you 80 kg → needs 196.2 N·m.
//   20:1 → 54 N·m (stalls) · 80:1 → 216 N·m @ 1.57 m/s · 200:1 → 540 N·m @ 0.63 m/s
export default {
    id: 'm03', world: 'mech', order: 3, name: 'Heavy Lifting',
    teaches: ['torque'], requires: ['move'],
    brief: 'The lift motor is fast but weak. Gear it down until it can carry you — but not so far it crawls.',
    map: [
        '######################',
        '#....................#',
        '#....................#',
        '#................G...#',
        '#.............########',
        '#.............########',
        '#.............########',
        '#.............########',
        '#.............########',
        '#S............########',
        '######################',
        '######################',
    ],
    parts: [
        { id: 'g20', kind: 'gear', ratio: 20, eff: 0.9, label: 'Gearbox 20:1' },
        { id: 'g80', kind: 'gear', ratio: 80, eff: 0.9, label: 'Gearbox 80:1' },
        { id: 'g200', kind: 'gear', ratio: 200, eff: 0.9, label: 'Gearbox 200:1' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 6, y: 9, accepts: 'gear' },
        { type: 'lift', id: 'lift', x: 12, w: 2, yTop: 4, yBottom: 10, socket: 's1',
          motor: { torque: 3, rpm: 12000 }, drumR: 0.1, massKg: 120 },
    ],
    solution: { s1: 'g80' },
    par: { seconds: 8 },
};
