// ============================================================
// CLIPS — which games have a gameplay clip (assets/clips/<id>.mp4 and .jpg).
// Made by scripts/capture-clips.js; don't edit by hand.
// ============================================================
export const HAVE = new Set(["mirror","snapstrike","sumospheres","treasure"]);
export const clip = id => (HAVE.has(id) ? { video: `assets/clips/${id}.mp4`, poster: `assets/clips/${id}.jpg` } : null);
