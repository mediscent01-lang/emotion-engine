// 화면(UX) 회귀 테스트: 흐름·접근성·결과 설명
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { load, recommend } = require('./harness.cjs');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = load();
const { w, S } = ctx;
const $ = id => w.document.getElementById(id);
test.after(() => w.close());

const ANS = { tension: 4, fatigue: 4, focus: 2, mood: 4, social: 2, sensitivity: 3, intention: 'change', scentFamilies: ['citrus', 'floral'], scentAvoid: ['none'], scentCharacter: 'fresh_clean', scentIntensity: 'medium' };

test('스크립트 오류 없음', () => assert.deepStrictEqual(ctx.errors, []));

test('엔진이 쓰는 화면 요소 ID가 모두 있다', () => {
  const ids = ['toast', 'hdrPill', 'progFill', 'sqFill', 'sqFrac', 'sqQuestions', 'bioUploadCard', 'bioDropZone', 'bioFile', 'bioConsent', 'bioResultCard', 'bioFileName', 'bioInterpret', 'bioApplyStatus', 'bioFusionPreview', 'bioScoreBars', 'bioRawGrid', 'bioErrorCard', 'bioErrorMsg',
    'aSteps', 'aWave', 'aFill', 'aStatus', 'aTxt', 'ringArc', 'ringPct', 'btnSkip', 'bioReportBadge', 'rCode', 'rNotes', 'rTags', 'rMatchPct', 'rMatchBar', 'rMatchReason', 'rMatchTag', 'eqRows', 'aStress', 'aBal', 'aEne', 'aFocus', 'aMood', 'aRecovery', 'eqCompare', 'buyList', 'rTable',
    'preferenceRecipeBlock', 'btnShare', 'btnInsight', 'btnReset', 'insName', 'insBody', 'insA', 'insB', 'insC', 'insB0', 'insB1', 'insB2', 'btnInsProd', 'histList', 'btnHDel', 'bbar', 'bbarBack', 'bbarNext', 'shareOv', 'shareCard', 'scDate', 'scName', 'scSub', 'scAxis', 'btnScDl', 'btnScCopy', 'btnScClose'];
  const missing = ids.filter(id => !$(id));
  assert.deepStrictEqual(missing, []);
});

test('ID가 중복되지 않는다', () => {
  const all = [...w.document.querySelectorAll('[id]')].map(e => e.id);
  const dup = all.filter((id, i) => all.indexOf(id) !== i);
  assert.deepStrictEqual(dup, []);
});

test('확대 금지(user-scalable=no)를 쓰지 않는다', () => assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(html)));

test('결과 화면: 추천 이유·공식몰 링크·함께 시향할 향 2개', () => {
  recommend(ctx, ANS);
  w.eval("goPage('report')");
  assert.ok($('heroBuy').href.startsWith('https://shifti.co.kr/product/detail.html?product_no='));
  assert.match($('whyCard').textContent, /향 취향/);
  assert.match($('whyCard').textContent, /오늘의 상태/);
  assert.ok($('whyCard').querySelectorAll('.note-chip').length > 0, '겹치는 노트 칩');
  assert.strictEqual($('buyList').querySelectorAll('.buy-card').length, 2);
  assert.ok(![...$('buyList').querySelectorAll('.buy-name')].some(n => n.textContent === S.primary.code), '1순위는 대체 목록에 다시 나오지 않음');
});

test('전문 지표는 "분석 상세 보기" 안에 있고 기본으로 접혀 있다', () => {
  const d = $('expertDetails');
  assert.strictEqual(d.open, false);
  for (const id of ['recommendationBlock', 'closedLoopBlock', 'eqRows', 'rTable']) {
    const e = $(id); if (e) assert.ok(d.contains(e), id);
  }
});

test('단계 표시: 질문 1단계 → 결과 3단계', () => {
  w.eval("goPage('survey')");
  assert.strictEqual($('stepper').hidden, false);
  assert.strictEqual(w.document.querySelector('#stepper li.now').dataset.step, '1');
  w.eval("goPage('report')");
  assert.strictEqual(w.document.querySelector('#stepper li.now').dataset.step, '3');
  w.eval("goPage('welcome')");
  assert.strictEqual($('stepper').hidden, true);
});

test('생체신호 화면의 "결과 보기"는 파일이 없으면 건너뛰기로 동작한다', () => {
  S.bio = null;
  w.eval("goPage('bio')");
  assert.strictEqual($('bbarNext').textContent, '결과 보기');
  $('bbarNext').click();
  assert.strictEqual(S.page, 'analysis');
});

test('설문 중에는 상태 점수를 보여 주지 않는다', () => {
  assert.match(html, /\.sq-axes\{display:none\}/);
});

test('본문 최소 글자 크기: CSS에 12px 미만 글자 지정이 없다', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const small = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => +m[1]).filter(v => v < 11.5);
  assert.deepStrictEqual(small, []);
});
