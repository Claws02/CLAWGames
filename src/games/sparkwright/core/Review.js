// ============================================================
// REVIEW — the design review after a shift: three stars.
//
//   ★ 1  the shift is cleared
//   ★ 2, ★ 3  the work order's two checks (level.workOrder.checks)
//
// Check types:
//   { type: 'budget', max }             fitted parts cost ≤ max ($)
//   { type: 'par' }                     cleared within level.par.seconds
//   { type: 'noRestarts' }              no deaths on the way
//   { type: 'liftTime', device, max }   the lift's top-to-bottom travel ≤ max s
//   { type: 'fuseProtects', device }    the fuse is no bigger than what the load survives
//   { type: 'margin', device, min }     lift torque margin τ_out/τ_need ≥ min
//
//   review(level, world, result?) → [{ label, ok, detail, analytic }]
// With no result (the checker's analytic pass) par/noRestarts come back ok: null.
// Pure: the game's win card and the lint both call it.
// ============================================================
import { fittedCost, evalLift, evalCircuit } from './World.js';

const r2 = v => Math.round(v * 100) / 100;

export function review(level, w, result = null) {
    const out = [{ label: 'Shift cleared', ok: result ? true : null, detail: result ? `${result.seconds.toFixed(2)} s` : '', analytic: false }];
    for (const c of level.workOrder?.checks || []) out.push(check(level, w, c, result));
    return out;
}

function check(level, w, c, result) {
    const L = w.L;
    switch (c.type) {
        case 'budget': {
            const cost = fittedCost(w);
            return { label: `On budget ($${c.max})`, ok: cost <= c.max, detail: `you spent $${cost}`, analytic: true };
        }
        case 'par':
            return { label: `Under par (${level.par.seconds} s)`, ok: result ? result.seconds <= level.par.seconds : null, detail: result ? `${result.seconds.toFixed(2)} s` : '', analytic: false };
        case 'noRestarts':
            return { label: 'No restarts', ok: result ? result.deaths === 0 : null, detail: result ? `${result.deaths} restarts` : '', analytic: false };
        case 'liftTime': {
            const l = L.byId[c.device], d = evalLift(w, l);
            const t = d.state === 'ok' ? (l.yBottom - l.yTop) / d.v : Infinity;
            return { label: `Lift reaches the top in ≤ ${c.max} s`, ok: t <= c.max, detail: Number.isFinite(t) ? `${r2(t)} s` : 'it never got there', analytic: true };
        }
        case 'margin': {
            const d = evalLift(w, L.byId[c.device]);
            return { label: `Torque margin ≥ ×${c.min}`, ok: d.state === 'ok' && d.margin >= c.min, detail: d.margin ? `×${r2(d.margin)}` : '—', analytic: true };
        }
        case 'fuseProtects': {
            const dev = L.byId[c.device];
            const fuse = Object.values(w.s.sockets[dev.socket]).map(id => id && L.parts[id]).find(p => p && p.kind === 'fuse');
            const r = evalCircuit(w, dev);
            return { label: `Fuse protects the load (≤ ${dev.iMax} A)`, ok: !!fuse && fuse.amps <= dev.iMax && r.state === 'on', detail: fuse ? `${fuse.amps} A fuse` : 'no fuse', analytic: true };
        }
        default:
            return { label: `unknown check ${c.type}`, ok: false, detail: '', analytic: true };
    }
}

export const stars = rows => rows.filter(r => r.ok).length;
