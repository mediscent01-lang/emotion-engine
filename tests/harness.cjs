// 감정엔진 index.html을 jsdom에 올려 추천 계산을 그대로 실행하는 테스트 도구.
// 외부 CDN 스크립트는 막고, 엑셀 모듈(XLSX)만 node 패키지로 주입한다.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const XLSX = require('xlsx');

function load(htmlPath = path.join(__dirname, '..', 'index.html')) {
  const html = fs.readFileSync(htmlPath, 'utf8').replace(/<script[^>]*\ssrc="https?:[^"]*"[^>]*><\/script>/g, '');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e && e.message || e)));
  vc.on('error', e => errors.push(String(e)));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/emotion-engine/', virtualConsole: vc,
    beforeParse(w) {
      w.XLSX = XLSX;
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
      w.scrollTo = () => {};
      // 화면 애니메이션(레이더·파형)이 테스트를 붙잡지 않게 멈춘다.
      w.requestAnimationFrame = () => 0;
      w.cancelAnimationFrame = () => {};
    },
  });
  // 환영 화면 카운터 등 반복 타이머가 프로세스를 붙잡지 않게 한다.
  setTimeout(() => {}, 0);
  const w = dom.window;
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const S = w.eval('S');
  return { w, S, errors, dom };
}

const SCALE_IDS = ['tension', 'fatigue', 'focus', 'mood', 'social', 'sensitivity'];

// 설문 응답을 넣고 추천을 계산한다. bio가 있으면 S.bio로 넣는다.
function recommend(ctx, answers, bio = null) {
  const { w, S } = ctx;
  w.eval('invalidateRecommendation()');
  S.survey = JSON.parse(JSON.stringify(answers));
  S.intention = answers.intention || null;
  S.bio = bio;
  w.eval('window.computeFinal()');
  return {
    primary: S.primary && S.primary.code,
    alt: S.alts && S.alts[0] && S.alts[0].code,
    match: S.matchScore,
    scores: { ...S.scores },
    ranked: (S.engine && S.engine.ranked || []).map(r => [r.product.code, r.final]),
  };
}

// 설문 조합 격자: 상태 6문항 5단계 중 대표값 + 의도 2 + 취향 계열 조합
function grid() {
  const fams = [['citrus'], ['floral'], ['woody'], ['musk'], ['green', 'citrus'], ['floral', 'powdery'], ['amber_spice', 'woody'], ['fruity', 'citrus'], ['green', 'woody', 'musk']];
  const chars = ['fresh_clean', 'soft_comfort', 'elegant_floral', 'deep_woody'];
  const levels = [1, 3, 5];
  const out = [];
  let i = 0;
  for (const t of levels) for (const f of levels) for (const fo of levels) for (const m of levels) {
    const fam = fams[i % fams.length], ch = chars[i % chars.length];
    out.push({
      tension: t, fatigue: f, focus: fo, mood: m, social: 6 - f, sensitivity: t,
      intention: i % 2 ? 'keep' : 'change', scentFamilies: fam, scentAvoid: ['none'], scentCharacter: ch, scentIntensity: 'medium',
    });
    i++;
  }
  return out;
}

// NNFX2 형식 흉내 엑셀(EEG·Power Spectrum·HRV 3시트)을 만든다.
function makeNnfx2({ rr = [], eeg = {}, hrv = {} } = {}) {
  const wb = XLSX.utils.book_new();
  const eegHead = ['time', 'left theta size determination value', 'right theta size determination value', 'left alpha size determination value', 'right alpha size determination value',
    'left l-beta size determination value', 'right l-beta size determination value', 'concentration size determination value', 'left relaxation size determination value',
    'right relaxation size determination value', 'left-right balance size determination value'];
  const e = { thetaL: 5, thetaR: 5, alphaL: 5, alphaR: 5, betaL: 5, betaR: 5, conc: 5, relaxL: 5, relaxR: 5, bal: 5, ...eeg };
  const eegRows = [eegHead];
  for (let i = 0; i < 30; i++) eegRows.push([i, e.thetaL, e.thetaR, e.alphaL, e.alphaR, e.betaL, e.betaR, e.conc, e.relaxL, e.relaxR, e.bal]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eegRows), 'EEG');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Band', 'Power'], ['Delta', 12.5], ['Theta', 8.1], ['Alpha', 9.4], ['Beta', 6.2]]), 'Power Spectrum');
  const hrvRows = [['index', 'RR Interval', 'Heart Rate'], ...rr.map((v, i) => [i + 1, v, Math.round(60000 / v)])];
  hrvRows.push([], ['Total Power', hrv.tp ?? 6.2], ['LF/HF', hrv.lfhf ?? 1.4], ['HF Power', hrv.hf ?? 3.1]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hrvRows), 'HRV');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

// 브라우저 File 대신 FileReader가 읽을 수 있는 Blob을 만들어 parseBioXLS를 부른다.
async function parseBio(ctx, bytes, name = 'test_omnifit001_M_60.xls') {
  const { w } = ctx;
  const file = new w.File([bytes], name);
  return w.eval('parseBioXLS')(file);
}

// 정상 리듬 RR(ms): 평균 800, 호흡성 변동 ± 40
function rrSeries(n = 120, base = 800, amp = 40) {
  return Array.from({ length: n }, (_, i) => Math.round(base + amp * Math.sin(i / 3) + ((i * 7919) % 11) - 5));
}

module.exports = { load, recommend, grid, makeNnfx2, parseBio, rrSeries, SCALE_IDS };
