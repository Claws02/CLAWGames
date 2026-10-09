// A short message at the top of the screen.
export function show(msg, color) {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const t = document.createElement('div');
    t.className = 'toast';
    if (color) t.style.background = color;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 2600);
}
