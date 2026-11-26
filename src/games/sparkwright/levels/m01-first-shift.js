// First Shift — run, jump, ladders. No devices yet.
export default {
    id: 'm01', world: 'mech', order: 1, name: 'First Shift',
    teaches: ['move', 'ladder'], requires: [],
    brief: 'Clock in. Run, jump the pit, climb to the exit.',
    map: [
        '##########################',
        '#........................#',
        '#....................G...#',
        '#.................########',
        '#...............H........#',
        '#.........###...H........#',
        '#.........#.....H........#',
        '#S.....####.....H........#',
        '#####..########^######...#',
        '#####..#############.....#',
        '#####^^###################',
    ],
    parts: [],
    devices: [],
    solution: {},
    par: { seconds: 6 },
};
