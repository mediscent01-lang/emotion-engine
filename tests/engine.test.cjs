// 감정엔진 v12 회귀 테스트: node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { load, recommend, grid, makeNnfx2, parseBio, rrSeries } = require('./harness.cjs');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = load();
test.after(() => ctx.w.close());

test('페이지 스크립트가 오류 없이 실행된다', () => {
  assert.deepStrictEqual(ctx.errors, []);
});

test('추천 대상은 정보가 확정된 10향이고 제인·뉴리프는 빠진다', () => {
  const codes = ctx.w.eval('SCENTS.map(s=>s.code)');
  assert.strictEqual(codes.length, 10);
  for (const c of ['Secret Garden', 'Violet Hill', 'Sunlit Window', 'Urban Forest']) assert.ok(codes.includes(c), c);
  assert.ok(!codes.includes('제인') && !codes.includes('뉴리프'));
});

test('모든 추천 향에 공식몰 상품 링크가 있다', () => {
  const missing = ctx.w.eval('SCENTS.filter(s=>!LINKS[s.code]).map(s=>s.code).join()');
  assert.strictEqual(missing, '');
});

test('노트는 공식몰과 같다 (AnnE: Lemon·Yuzu·Grapefruit / Lavender·Jasmine / Cedarwood·Musk)', () => {
  const a = ctx.w.eval("SCENTS.find(s=>s.code==='AnnE')");
  assert.deepStrictEqual([a.top, a.middle, a.base].map(x => [...x]), [['Lemon', 'Yuzu', 'Grapefruit'], ['Lavender', 'Jasmine'], ['Cedarwood', 'Musk']]);
});

test('모든 노트가 향 계열 사전에 있다', () => {
  const unknown = ctx.w.eval('SCENTS.flatMap(s=>[...s.top,...s.middle,...s.base]).filter(n=>!NOTE_FAMILY[n]).join()');
  assert.strictEqual(unknown, '');
});

test('무작위 설문에서 10향이 모두 1위가 될 수 있고, 한 향이 40%를 넘지 않는다', () => {
  const fams = ['citrus', 'green', 'floral', 'woody', 'musk', 'powdery', 'amber_spice', 'fruity'];
  const chars = ['fresh_clean', 'soft_comfort', 'elegant_floral', 'deep_woody'];
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const win = {};
  for (let i = 0; i < 1500; i++) {
    const sel = [...new Set([fams[Math.floor(rnd() * 8)], fams[Math.floor(rnd() * 8)]])];
    const r = recommend(ctx, { tension: 1 + Math.floor(rnd() * 5), fatigue: 1 + Math.floor(rnd() * 5), focus: 1 + Math.floor(rnd() * 5), mood: 1 + Math.floor(rnd() * 5), social: 1 + Math.floor(rnd() * 5), sensitivity: 1 + Math.floor(rnd() * 5),
      intention: rnd() < .5 ? 'change' : 'keep', scentFamilies: sel, scentAvoid: ['none'], scentCharacter: chars[Math.floor(rnd() * 4)], scentIntensity: 'medium' });
    win[r.primary] = (win[r.primary] || 0) + 1;
  }
  // Who am I는 명시적 선택용(자동 추천 억제)이라 제외
  for (const c of ['AnnE', 'Foggy Study', 'Red Tara', 'The Great', '말괄량이', 'Secret Garden', 'Violet Hill', 'Sunlit Window', 'Urban Forest']) assert.ok(win[c] > 0, `${c} 1위 0회`);
  Object.entries(win).forEach(([k, v]) => assert.ok(v / 1500 < 0.40, `${k} ${(v / 15).toFixed(1)}%`));
});

test('비선호 계열을 고르면 그 계열이 주인 향은 1위가 되지 않는다', () => {
  for (const a of grid().slice(0, 30)) {
    const r = recommend(ctx, { ...a, scentFamilies: ['citrus'], scentAvoid: ['woody'] });
    assert.notStrictEqual(r.primary, 'Urban Forest');
  }
});

test('추천 문구에 취향과 겹치는 실제 노트가 들어간다', () => {
  recommend(ctx, { tension: 2, fatigue: 2, focus: 4, mood: 2, social: 4, sensitivity: 2, intention: 'change', scentFamilies: ['citrus'], scentAvoid: ['none'], scentCharacter: 'fresh_clean', scentIntensity: 'medium' });
  const nm = ctx.S.engine.noteMatch;
  assert.ok(nm.notes.length > 0);
  assert.match(ctx.S.copy, /겹치는 실제 노트/);
});

test('RR은 RR 열에서만 읽는다 (v11: LF/HF 1.4가 1400ms로 섞여 RMSSD 162ms)', async () => {
  const b = await parseBio(ctx, makeNnfx2({ rr: rrSeries() }));
  assert.ok(b.raw.rmssd > 5 && b.raw.rmssd < 30, `RMSSD ${b.raw.rmssd}`);
  assert.strictEqual(b.rr.total, 120);
});

test('첫 박동이 이상값이어도 정상 박동을 버리지 않는다', async () => {
  const rr = rrSeries(120).map((v, i) => (i % 6 === 0 ? Math.round(v * 1.6) : v));
  const b = await parseBio(ctx, makeNnfx2({ rr }));
  assert.strictEqual(b.rr.removed, 20);
  assert.ok(b.raw.rmssd != null);
  assert.ok(b.warnings.some(w => w.includes('이상 박동')));
});

test('RR이 1분보다 짧으면 RR 기반 HRV를 계산하지 않고 품질을 낮춘다', async () => {
  const b = await parseBio(ctx, makeNnfx2({ rr: rrSeries(40) }));
  assert.strictEqual(b.raw.rmssd, null);
  assert.ok(b.quality < 0.9);
});

test('뇌파: FAA·참여지수(EI)를 계산하고, 집중 축은 EI 방향으로 움직인다', async () => {
  const lo = await parseBio(ctx, makeNnfx2({ rr: rrSeries(), eeg: { betaL: 3, betaR: 3, alphaL: 7, alphaR: 7, thetaL: 7, thetaR: 7, conc: 5 } }));
  const hi = await parseBio(ctx, makeNnfx2({ rr: rrSeries(), eeg: { betaL: 8, betaR: 8, alphaL: 3, alphaR: 3, thetaL: 3, thetaR: 3, conc: 5 } }));
  assert.ok(hi.raw.ei > lo.raw.ei && hi.focus > lo.focus);
  const pos = await parseBio(ctx, makeNnfx2({ rr: rrSeries(), eeg: { alphaL: 4, alphaR: 6 } }));
  const neg = await parseBio(ctx, makeNnfx2({ rr: rrSeries(), eeg: { alphaL: 6, alphaR: 4 } }));
  assert.ok(pos.raw.faa > 0 && neg.raw.faa < 0 && pos.mood > neg.mood);
});

test('업로드 파일명(측정 ID·성별·나이)을 남기지 않는다', async () => {
  const b = await parseBio(ctx, makeNnfx2({ rr: rrSeries() }), '127016_omnifit001_M_60_x.xls');
  assert.ok(!JSON.stringify(b).includes('127016'));
});

test('화면 문구에 "진단"·효능 단정 표현이 없다', () => {
  const visible = html.replaceAll('의학적 진단·치료를 위한 것이 아니며', '');
  for (const w of ['진단', '즉각 상승 효과', '이완 효과', '긴장 완화를 위해', '촉진됩니다', '호흡 속도를 낮춥니다']) assert.ok(!visible.includes(w), w);
});

test('생체신호 업로드 전에 동의를 받는다', () => {
  assert.match(html, /id="bioConsent"/);
  ctx.w.document.getElementById('bioConsent').checked = false;
  let clicked = false;
  ctx.w.document.getElementById('bioFile').click = () => { clicked = true; };
  ctx.w.eval('bioPick()');
  assert.strictEqual(clicked, false);
  ctx.w.document.getElementById('bioConsent').checked = true;
  ctx.w.eval('bioPick()');
  assert.strictEqual(clicked, true);
});

test('기록에 생체 수치를 남기지 않는다', async () => {
  const b = await parseBio(ctx, makeNnfx2({ rr: rrSeries() }));
  recommend(ctx, grid()[3], b);
  ctx.w.eval('window.saveHist()');
  const list = JSON.parse(ctx.w.localStorage.getItem('shifti_v5bio'));
  assert.ok(list.length > 0 && !('rmssd' in list[0]));
});

test('엑셀 라이브러리는 취약점이 고쳐진 SheetJS 0.20.3을 먼저 불러온다', () => {
  assert.match(html, /cdn\.sheetjs\.com\/xlsx-0\.20\.3/);
});
