// ============================================================
// VETOES — two per play session, shared by the whole table. A session is
// one party, or one visit to the wheel from the home screen. Spend one to
// throw out the game fate picked; it never comes back.
// ============================================================
export const PER_SESSION = 2;
let _left = PER_SESSION;

export const reset = () => { _left = PER_SESSION; };
export const left = () => _left;
/** Spend one; false when none are left. */
export function use() {
    if (_left <= 0) return false;
    _left--;
    return true;
}
/** "VETO (2)" / "NO VETOES LEFT". */
export const label = () => (_left > 0 ? `VETO (${_left})` : 'NO VETOES LEFT');
