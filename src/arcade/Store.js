// localStorage that never throws: private windows, blocked storage and quota
// errors all degrade to "nothing saved" rather than a broken arcade.
const PREFIX = 'claw.';
export function load(key, fallback) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
}
export function save(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* not persisted */ }
}
