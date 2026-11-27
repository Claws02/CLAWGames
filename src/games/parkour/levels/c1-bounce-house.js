// Bounce House — bounce & launch. Sponges throw you back harder the farther you
// fall (hold JUMP as you land for more), jack-in-the-boxes launch you, toy cannons fire you.
//   A  first sponge: one held bounce clears the 3-high block (coin 1 on the way up)
//   B  bounce shaft: keep holding JUMP, each bounce higher, up the 6-high block
//   C  drop into the pit: falling farther = a bigger bounce, up the 8-high tower (coin 2 needs the biggest bounce)
//   D  down to the floor: the jack-in-the-box throws you up through the high shelf; E the sideways jack flings you over the spikes
//   F  the toy cannon fires you over the big pit; G the swinging cannon: shoot when it points high (coin 3 up top)
export default {
    id: 'c1', order: 1, name: 'Bounce House', theme: 'bounce', icon: '🦘',
    brief: 'Sponges, springs and cannons. Hold JUMP as you land on a sponge to bounce higher.',
    map: [
        '##########################################################################################',
        '#........................................................................................#',
        '#........................................................................................#',
        '#.....................................................................................G..#',
        '#.........................................======..................................########',
        '#...............................................................................##########',
        '#.............................#######...........................................##########',
        '#.............................#######...........................................##########',
        '#................########.....#######....................#####..................##########',
        '#................########.....#######....................#####.......########...##########',
        '#................########.....#######....................#####.......########...##########',
        '#........##......########.....#######....................#####.......########...##########',
        '#........##......########.....#######....................#####.......########...##########',
        '#.S......##......########.....#######...........^^^^^^^^^#####^^^^^^^########^^^##########',
        '######TT#####TTTT########TTTTT############################################################',
        '##########################################################################################',
    ],
    devices: [
        { type: 'sign', x: 5, y: 8.5, text: 'HOLD JUMP AS YOU LAND' },
        { type: 'sign', x: 14.5, y: 6.5, text: 'KEEP HOLDING: HIGHER!' },
        { type: 'sign', x: 27, y: 9.5, text: 'DROP IN FROM HIGH UP' },
        { type: 'spring', id: 'jack1', x: 44, y: 13, power: 1.22 },
        { type: 'spring', id: 'jack2', x: 47, y: 3, dx: 1, kick: 16, power: 0.45 },
        { type: 'cannon', id: 'boom1', x: 60, y: 7, aim: [[1, -0.5]], power: 1.15 },
        { type: 'sign', x: 59.5, y: 4.5, text: 'JUMP TO FIRE' },
        { type: 'cannon', id: 'boom2', x: 75, y: 8, aim: [[1, -2.2], [1, -0.2]], period: 140, power: 1.4 },
        { type: 'sign', x: 74.5, y: 5, text: 'FIRE WHEN IT POINTS UP' },
        { type: 'coin', x: 7, y: 9 },
        { type: 'coin', x: 27, y: 4 },
        { type: 'coin', x: 79, y: 2 },
        { type: 'flag', x: 33, y: 5 },
        { type: 'flag', x: 58, y: 7 },
    ],
    par: { seconds: 30 },
    needs: ['T', 'jack1', 'jack2', 'boom1', 'boom2'],
};
