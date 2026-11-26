// The Toy Box — the hub. Walk to a door and press ▲ (or ENTER) to start a
// course; finish it and you're back here at the same door. Not a course:
// kind 'hub' gets its own checks (every door reachable from every door).
export default {
    id: 'base', kind: 'hub', order: 0, name: 'The Toy Box',
    brief: 'Walk to a door and press ▲ to play a course.',
    map: [
        '########################################',
        '#......................................#',
        '#......................................#',
        '#......................................#',
        '#......................................#',
        '#......................................#',
        '#..====................................#',
        '#......................................#',
        '#......................................#',
        '#......................................#',
        '#......................................#',
        '#....S.................................#',
        '#TT#####################################',
        '########################################',
    ],
    devices: [
        { type: 'sign', x: 20, y: 3, text: 'PLAYROOM PARKOUR' },
        { type: 'portal', id: 'door-c1', x: 9, y: 11, to: 'c1' },
        { type: 'portal', id: 'door-c2', x: 15, y: 11, to: 'c2' },
        { type: 'portal', id: 'door-c3', x: 21, y: 11, to: 'c3' },
        { type: 'portal', id: 'door-c4', x: 27, y: 11, to: 'c4' },
        { type: 'portal', id: 'door-soon', x: 34, y: 11, to: 'soon' },
    ],
};
