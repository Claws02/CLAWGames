// Heavy Lifting — pick a motor AND a gearbox. τ_out = τ·n·η must beat τ_need = m·g·r,
// and the gearbox must be rated for the load torque, or its teeth strip.
// Car 120 kg + you 80 kg + your tray, drum r = 0.1 m → τ_need ≈ 208 N·m.
//   Motor C 6 N·m + 50:1 (rated 250) → 270 N·m ✓ fast (≈1.26 m/s, 4.8 s) $28
//   Motor A 2 N·m + 200:1 (rated 400) → 340 N·m ✓ but slow (≈0.63 m/s, 9.5 s) $18
//   anything + 80:1 (rated 180) → strips · small motor + 50:1 → stalls
export default {
    id: 'm03', world: 'mech', order: 3, name: 'Heavy Lifting',
    teaches: ['torque', 'ratings'], requires: ['move'],
    brief: 'Work order: build the lift drive. It must carry the 120 kg car and you up 6 m, top in 6 s or less. Budget $30.',
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
        { id: 'mA', kind: 'motor', torque: 2, rpm: 12000, mass: 3, cost: 8, label: 'Motor A · 2 N·m · 12 000 rpm' },
        { id: 'mB', kind: 'motor', torque: 3, rpm: 12000, mass: 4, cost: 14, label: 'Motor B · 3 N·m · 12 000 rpm' },
        { id: 'mC', kind: 'motor', torque: 6, rpm: 6000, mass: 7, cost: 22, label: 'Motor C · 6 N·m · 6 000 rpm' },
        { id: 'g50', kind: 'gear', ratio: 50, eff: 0.9, maxTorque: 250, mass: 2, cost: 6, label: 'Gearbox 50:1 · rated 250 N·m' },
        { id: 'g80', kind: 'gear', ratio: 80, eff: 0.9, maxTorque: 180, mass: 2, cost: 7, label: 'Gearbox 80:1 · rated 180 N·m' },
        { id: 'g200', kind: 'gear', ratio: 200, eff: 0.85, maxTorque: 400, mass: 3, cost: 10, label: 'Gearbox 200:1 · rated 400 N·m' },
    ],
    devices: [
        { type: 'socket', id: 's1', x: 6, y: 9, slots: [{ id: 'motor', accepts: 'motor', label: 'Motor' }, { id: 'gear', accepts: 'gear', label: 'Gearbox' }] },
        { type: 'lift', id: 'lift', x: 12, w: 2, yTop: 4, yBottom: 10, socket: 's1', drumR: 0.1, massKg: 120 },
    ],
    solution: { s1: { motor: 'mC', gear: 'g50' } },
    workOrder: { title: 'Drive the freight lift', checks: [{ type: 'budget', max: 30 }, { type: 'liftTime', device: 'lift', max: 6 }] },
    par: { seconds: 9 },
};
