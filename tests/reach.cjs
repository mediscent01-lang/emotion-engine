// 무작위 설문 3,000건으로 각 향이 1위가 될 수 있는지(도달 가능성)와 1·2위 분포를 본다.
const { load, recommend } = require('./harness.cjs');
const path = require('path');
const ctx = load(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const fams = ['citrus', 'green', 'floral', 'woody', 'musk', 'powdery', 'amber_spice', 'fruity'];
const chars = ['fresh_clean', 'soft_comfort', 'elegant_floral', 'deep_woody'];
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const win = {}, top2 = {};
for (let i = 0; i < 3000; i++) {
  const k = 1 + Math.floor(rnd() * 3), sel = [];
  while (sel.length < k) { const f = pick(fams); if (!sel.includes(f)) sel.push(f); }
  const a = { tension: 1 + Math.floor(rnd() * 5), fatigue: 1 + Math.floor(rnd() * 5), focus: 1 + Math.floor(rnd() * 5), mood: 1 + Math.floor(rnd() * 5), social: 1 + Math.floor(rnd() * 5), sensitivity: 1 + Math.floor(rnd() * 5),
    intention: rnd() < .5 ? 'change' : 'keep', scentFamilies: sel, scentAvoid: ['none'], scentCharacter: pick(chars), scentIntensity: 'medium' };
  const r = recommend(ctx, a);
  win[r.primary] = (win[r.primary] || 0) + 1;
  [r.primary, r.alt].forEach(c => top2[c] = (top2[c] || 0) + 1);
}
const pct = m => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, (v / 30).toFixed(1) + '%']));
console.log('1위', pct(win));
console.log('1·2위 노출', pct(top2));
ctx.w.close();
