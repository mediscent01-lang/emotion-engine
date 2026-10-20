// 설문 격자 전체에서 제품별 평균 점수 구성(취향·상태·문맥·제품 보정·감점)을 본다. 쏠림 원인 진단용.
const path = require('path');
const { load, recommend, grid } = require('./harness.cjs');
const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
const ctx = load(file);
const agg = {};
for (const a of grid()) {
  recommend(ctx, a);
  ctx.S.engine.ranked.forEach((r, i) => {
    const k = r.product.code, g = agg[k] || (agg[k] = { n: 0, win: 0, final: 0, pref: 0, state: 0, ctx: 0, sku: 0, pen: 0 });
    g.n++; if (i === 0) g.win++;
    g.final += r.final; g.pref += r.preferenceFit; g.state += r.stateFit; g.ctx += r.context; g.sku += r.sku; g.pen += r.penalty;
  });
}
const rows = Object.entries(agg).map(([k, g]) => ({ 향: k, '1위': g.win, 최종: +(g.final / g.n).toFixed(1), 취향: +(g.pref / g.n).toFixed(1), 상태: +(g.state / g.n).toFixed(1), 문맥: +(g.ctx / g.n).toFixed(1), 보정: +(g.sku / g.n).toFixed(1), 감점: +(g.pen / g.n).toFixed(1) }));
console.table(rows.sort((a, b) => b['1위'] - a['1위']));
ctx.w.close();
