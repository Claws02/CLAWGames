// Swing Set — swing & ride. Yo-yo strings swing you, ABC blocks fall under
// you, toy cars carry you, a ruler seesaw tips with your weight.
//   A  first yo-yo: run off the edge into the string, swing, JUMP to let go (coin 1 on a high swing)
//   B  the ABC-block bridge falls just behind you: keep running (coin 2 above it)
//   C  ride the toy car over the long pit, then the elevator car up (coin 3 at the top of its ride)
//   D  the ruler tips toward your weight: run across fast and jump off the high end to the ledge
//   E  two yo-yos, string to string, to the toy chest
export default {
    id: 'c3', order: 3, name: 'Swing Set', theme: 'swing', icon: '🪀',
    brief: 'Yo-yos, falling blocks, toy cars and a seesaw. Timing is everything.',
    map: [
        '##################################################################################################',
        '#................................................................................................#',
        '#................................................................................................#',
        '#................................................................................................#',
        '#................................................................................................#',
        '#..........................................................#######...............................#',
        '#..........................................................#######...............................#',
        '#..........................................................#######...............................#',
        '#..........................................................#######..........#####................#',
        '#..........................................................#######..........#####............G...#',
        '#..........................................................#######..........#####.........########',
        '#..........................................................#######..........#####.........########',
        '#.................##CCCCCCCCCC####.........................#######..........#####.........########',
        '#.S...............##..........####.........................#######..........#####.........########',
        '########........####..........####....................###########################.........########',
        '########^^^^^^^^####^^^^^^^^^^####^^^^^^^^^^^^^^^^^^^^###########################^^^^^^^^^########',
    ],
    devices: [
        { type: 'sign', x: 5, y: 6, text: 'JUMP INTO THE STRING, JUMP TO LET GO' },
        { type: 'rope', id: 'yo1', x: 11.5, y: 5, len: 6 },
        { type: 'sign', x: 25, y: 9, text: 'DON\'T STOP ON THE BLOCKS' },
        { type: 'mover', id: 'car1', x: 34, y: 12, w: 3, to: [51, 12], period: 420 },
        { type: 'sign', x: 42, y: 8, text: 'RIDE THE TOY CAR' },
        { type: 'mover', id: 'lift', x: 55, y: 13, w: 3, to: [55, 5], period: 300 },
        { type: 'seesaw', id: 'ruler', x: 70, y: 11, half: 4, tilt: -0.7 },
        { type: 'sign', x: 70, y: 6.5, text: 'RUN ACROSS BEFORE IT TIPS' },
        { type: 'rope', id: 'yo2', x: 83.5, y: 4, len: 6 },
        { type: 'rope', id: 'yo3', x: 88, y: 4, len: 5 },
        { type: 'coin', x: 16, y: 8 },
        { type: 'coin', x: 27, y: 9 },
        { type: 'coin', x: 56, y: 2 },
        { type: 'flag', x: 17, y: 13 },
        { type: 'flag', x: 62, y: 4 },
    ],
    par: { seconds: 30 },
    needs: ['yo1', 'car1', 'lift', 'ruler'],
};
