// ============================================================
// CLIPS — which games have a gameplay clip (assets/clips/<id>.mp4 and .jpg).
// Made by scripts/capture-clips.js; don't edit by hand.
// ============================================================
export const HAVE = new Set(["animalstack","balloonpump","balloontoss","barrage","blockparty","bombpass","bowling","brainrot","bumpercars","clearout","coral","critter","express","fourinarow","gridrecall","higherlower","highnoon","icefloe","kartgp","kite","lightcycles","lighthouse","lilypad","lootcatch","memorymatch","minecart","minigolf","mirror","musicalchairs","oddoneout","orbdeflect","orbit","pancakes","paths","pearl","penalty","pinball","puck","rebound","redlight","reefdrop","rhythmforge","riftdive","rooftop","sackrace","shelf","shellgame","shutbox","snapstrike","snowball","sortrush","speedboat","steadyhand","stopclock","sumospheres","tag","tankclash","treasure","treeclimb","trivia","turfwar","vaultheist","yatzy"]);
export const clip = id => (HAVE.has(id) ? { video: `assets/clips/${id}.mp4`, poster: `assets/clips/${id}.jpg` } : null);
