// 같은 설문 격자로 두 버전(index.html vs 기준 파일)의 추천 분포를 비교한다.
// 사용: node tests/compare.cjs [기준 html 경로]
const path = require('path');
const fs = require('fs');
const { load, recommend, grid } = require('./harness.cjs');

const basePath = process.argv[2] || path.join(__dirname, 'baseline_v11.html');
const cur = load(path.join(__dirname, '..', 'index.html'));
const base = fs.existsSync(basePath) ? load(basePath) : null;
const cases = grid();
const dist = (rows) => rows.reduce((m, r) => (m[r.primary] = (m[r.primary] || 0) + 1, m), {});
const curRows = cases.map(a => recommend(cur, a));
const out = { cases: cases.length, current: dist(curRows) };
if (base) {
  const baseRows = cases.map(a => recommend(base, a));
  out.baseline = dist(baseRows);
  out.changed = curRows.filter((r, i) => r.primary !== baseRows[i].primary).length;
}
console.log(JSON.stringify(out, null, 1));
cur.w.close(); if (base) base.w.close();
