// The Toy Box — the hub. Walk to a door and press ▲ (or ENTER) to start a
// course; finish it and you're back here at the same door. Two floors: courses
// 1–4 downstairs, 5–8 upstairs (the jack-in-the-box throws you up; walk off
// either end of the top shelf to come back down). Not a course: kind 'hub'
// gets its own checks (every door reachable from every door).
export default {
    id: 'base', kind: 'hub', order: 0, name: 'The Toy Box',
    brief: 'Walk to a door and press ▲ to play a course.',
    map: [
        '############################################',
        '#..........................................#',
        '#..........................................#',
        '#..........................................#',
        '#..........................................#',
        '#..........................................#',
        '#...=====================================..#',
        '#..........................................#',
        '#..........................................#',
        '#..........................................#',
        '#..........................................#',
        '#..........................................#',
        '#..........................................#',
        '#...S......................................#',
        '#TT#########################################',
        '############################################',
    ],
    devices: [
        { type: 'sign', x: 21, y: 9.6, text: 'PLAYROOM PARKOUR', big: true },
        { type: 'portal', id: 'door-c1', x: 9, y: 13, to: 'c1' },
        { type: 'portal', id: 'door-c2', x: 15, y: 13, to: 'c2' },
        { type: 'portal', id: 'door-c3', x: 21, y: 13, to: 'c3' },
        { type: 'portal', id: 'door-c4', x: 27, y: 13, to: 'c4' },
        { type: 'spring', id: 'upstairs', x: 42, y: 13, power: 1.15 },
        { type: 'sign', x: 40.5, y: 10.6, text: 'UPSTAIRS ↑' },
        { type: 'portal', id: 'door-c5', x: 9, y: 5, to: 'c5' },
        { type: 'portal', id: 'door-c6', x: 15, y: 5, to: 'c6' },
        { type: 'portal', id: 'door-c7', x: 21, y: 5, to: 'c7' },
        { type: 'portal', id: 'door-c8', x: 27, y: 5, to: 'c8' },
        { type: 'portal', id: 'door-soon', x: 34, y: 5, to: 'soon' },
    ],
};
