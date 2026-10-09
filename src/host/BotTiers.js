// Bot difficulty tiers. Values match HundredBlockDash's PROFILES in core/Bot.js
// so a Hard bot is equally hard in both apps.
export const TIERS = {
    easy:   { label: 'Easy',   skill: 0.25, icon: '🙂' },
    medium: { label: 'Medium', skill: 0.55, icon: '😐' },
    hard:   { label: 'Hard',   skill: 0.85, icon: '😈' },
};
export const skillFor = tier => (TIERS[tier] || TIERS.medium).skill;
