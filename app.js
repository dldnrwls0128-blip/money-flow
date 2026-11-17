'use strict';
const $ = s => document.querySelector(s);
const app = $('#app');
let DATA = null;

// ---- 내 설정 (이 폰에만 저장, 서버로 안 보냄) ----
function loadCfg() { try { return JSON.parse(localStorage.getItem('mf_cfg')) || null; } catch { return null; } }
function saveCfg(c) { localStorage.setItem('mf_cfg', JSON.stringify(c)); }
function parseSetup(str) {
  // 형식: h:코드,코드|os:SMR,ACHR|sw:005380=매수1,매수2,매도1,매도2,손절
  const c = { h: [], os: [], sw: {} };
  decodeURIComponent(str).split('|').forEach(part => {
    const [k, v] = part.split(':'); if (!v) return;
    if (k === 'h') c.h = v.split(',').filter(Boolean);
    if (k === 'os') c.os = v.split(',').filter(Boolean);
    if (k === 'sw') v.split(';').forEach(x => { const [code, nums] = x.split('='); if (code && nums) c.sw[code] = nums.split(',').map(Number); });
  });
  return c;
}
function cfgToStr(c) {
  return 'h:' + c.h.join(',') + '|os:' + c.os.join(',') + '|sw:' + Object.entries(c.sw).map(([k, v]) => k + '=' + v.join(',')).join(';');
}
if (location.hash.startsWith('#setup=')) {
  saveCfg(parseSetup(location.hash.slice(7)));
  history.replaceState(null, '', location.pathname);
}

// ---- 포맷 ----
const fmt = (n, d = 0) => n == null ? '–' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
const pctCls = p => p > 0 ? 'up' : p < 0 ? 'dn' : '';
const pct = p => p == null ? '–' : (p > 0 ? '+' : '') + Number(p).toFixed(2) + '%';
const won = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v)) + '억';
const lvl = s => s == null ? 'n' : s >= 7.5 ? 'g' : s >= 6 ? 'y' : 'r';
const lbl = s => s == null ? '점수 없음' : s >= 7.5 ? '사기 좋음' : s >= 6 ? '관망' : '주의';
const COLOR = { g: '#22c55e', y: '#eab308', r: '#ef4444', n: '#475569' };
const MAX = { 수급: 3, 거래대금: 2, 지속성: 2, 촉매: 2, 가격위치: 1 };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function kst(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function scoreCard(x, extra = '') {
  const L = lvl(x.score);
  const parts = x.parts ? Object.entries(x.parts).map(([k, v]) =>
    `<span>${k} <span class="meta">/${MAX[k]}</span></span><span class="pb"><i style="width:${v / MAX[k] * 100}%"></i></span><b>${v}</b>`).join('') : '';
  const why = (x.why || []).map(w => `<li>${esc(w)}</li>`).join('');
  const leaders = x.leaders ? `<li>대표 종목: ${x.leaders.map(l => `${esc(l.name)} <span class="${pctCls(l.pct)}">${pct(l.pct)}</span>`).join(', ')}</li>` : '';
  const sub = x.price != null ? `${fmt(x.price)}원 <span class="${pctCls(x.pct)}">${pct(x.pct)}</span>${x.sector ? ' · ' + esc(x.sector) : ''}`
                              : `<span class="${pctCls(x.pct)}">${pct(x.pct)}</span> · 오른 종목 ${x.rise ?? '–'} / 내린 종목 ${x.fall ?? '–'}`;
  return `<div class="card">
    <div class="row"><div><div class="name">${esc(x.name)}</div><div class="meta">${sub}</div>
      <span class="badge b-${L}">${lbl(x.score)}</span></div>
      <div class="score c-${L}">${x.score ?? '–'}</div></div>
    <div class="bar"><i style="width:${(x.score || 0) * 10}%;background:${COLOR[L]}"></i></div>
    ${extra}
    ${parts ? `<details><summary>왜 이 점수? (자세히)</summary><div class="parts">${parts}</div><ul class="why">${why}${leaders}</ul></details>` : ''}
  </div>`;
}

function swingBlock(q, p) {
  if (!p || q.price == null) return '';
  const [b1, b2, s1, s2, stop] = p; const c = q.price;
  const d = v => ((v / c - 1) * 100).toFixed(1);
  const rows = [['팔기 2차 (나머지)', s2], ['팔기 1차 (절반)', s1], ['사기 1차 (절반)', b1], ['사기 2차 (절반)', b2], ['손절 (종가 기준)', stop]];
  const st = c <= stop ? '<div class="card warn" style="margin:8px 0 0">⚠️ 지금 가격이 손절가 이하예요. 종가로 확인하세요.</div>' : '';
  return `<div class="plan"><b>내 스윙 계획</b> · 지금 ${fmt(c)}원
    ${rows.map(([k, v]) => `<div class="pr ${Math.abs(v / c - 1) < 0.01 ? 'hit' : ''}"><span>${k}</span><span>${fmt(v)}원 <span class="meta">(${d(v) > 0 ? '+' : ''}${d(v)}%)</span></span></div>`).join('')}
    ${st}</div>`;
}

function render() {
  const D = DATA; if (!D) return;
  const cfg = loadCfg();
  const K = D.index.KOSPI, Q = D.index.KOSDAQ;
  const open = D.market_status === 'OPEN';
  $('#updated').innerHTML = `마지막 갱신 <b>${kst(D.updated)}</b> (KST) · ${open ? '🟢 장중 약 10분마다 자동 갱신' : '⚪ 장 마감/휴장'}`;
  let h = `<div class="card headline">${esc(D.headline)}</div>
  <div class="grid">
    <div class="card big"><div class="k">코스피</div><div class="v">${fmt(K.value, 2)}</div><div class="d ${pctCls(K.pct)}">${pct(K.pct)}</div></div>
    <div class="card big"><div class="k">코스닥</div><div class="v">${fmt(Q.value, 2)}</div><div class="d ${pctCls(Q.pct)}">${pct(Q.pct)}</div></div>
    <div class="card big"><div class="k">외국인 (코스피)</div><div class="v ${pctCls(K.foreign)}">${won(K.foreign)}</div><div class="meta">코스닥 ${won(Q.foreign)}</div></div>
    <div class="card big"><div class="k">기관 (코스피)</div><div class="v ${pctCls(K.institution)}">${won(K.institution)}</div><div class="meta">코스닥 ${won(Q.institution)} · 개인 ${won(K.personal)}</div></div>
  </div>
  <h2>💰 돈이 몰리는 업종 Top 5</h2>${D.sectors_top.map(s => scoreCard(s)).join('')}
  <h2>🔥 점수 높은 종목 Top 5</h2>${D.stocks_top.map(s => scoreCard(s)).join('')}`;

  // 내 종목
  const tracked = D.tracked || {};
  const myDom = cfg ? cfg.h : Object.keys(tracked);
  const myOs = cfg ? cfg.os : (D.overseas || []).map(o => o.code);
  h += `<h2>📌 ${cfg ? '내 보유 종목' : '관심 종목'}</h2>`;
  if (!cfg) h += `<div class="card meta">설정 링크로 한 번 열면 이 폰에 '내 보유 종목'과 스윙 계획이 저장돼요. (아래 '설정'에서도 바꿀 수 있어요)</div>`;
  const doms = myDom.map(c => tracked[c] ? { ...tracked[c] } : { code: c, name: c + ' (데이터 없음)', score: null })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  h += doms.map(q => scoreCard(q, swingBlock(q, cfg && cfg.sw[q.code]))).join('');
  h += (D.overseas || []).filter(o => myOs.includes(o.code)).map(o => `<div class="card"><div class="row"><div>
      <div class="name">${esc(o.code === 'ondo-finance' ? 'ONDO' : o.code)}</div><div class="meta">${esc(o.name)}${o.at ? ' · ' + kst(o.at) + ' 기준' : ' · 24시간 변동'}</div>
      <span class="badge b-n">해외·코인 (점수 없음)</span></div>
      <div style="text-align:right"><div class="name">$${fmt(o.price, o.price < 10 ? 3 : 2)}</div><div class="${pctCls(o.pct)}">${pct(o.pct)}</div>${o.krw ? `<div class="meta">${fmt(o.krw, 1)}원</div>` : ''}</div></div></div>`).join('');

  h += `<h2>📋 더 보기</h2>
  <div class="card"><details><summary>전체 업종 점수 (${D.sectors_all.length}개)</summary><table>
    ${D.sectors_all.map(s => `<tr><td>${esc(s.name)}</td><td class="r ${pctCls(s.pct)}">${pct(s.pct)}</td><td class="r"><b class="c-${lvl(s.score)}">${s.score}</b></td></tr>`).join('')}
  </table></details></div>
  <div class="card"><details><summary>점수는 어떻게 매기나요?</summary><ul class="why">
    <li><b>수급 3점</b>: 전 거래일·최근 3일 외국인+기관 순매수가 거래량에서 차지하는 비율</li>
    <li><b>거래대금 2점</b>: 오늘 거래대금이 20일 평균보다 얼마나 빠른 속도로 붙는지</li>
    <li><b>지속성 2점</b>: 최근 5일 중 외국인+기관이 순매수한 날 수</li>
    <li><b>촉매 2점 (근사치)</b>: 뉴스·공시는 자동으로 못 읽어서, 오늘 시장 대비 얼마나 강한지(업종은 상승 종목 비율 포함)로 대신 계산해요</li>
    <li><b>가격위치 1점</b>: 60일 고가·저가 범위에서 낮을수록 높은 점수 (저점 매수)</li>
    <li>업종 점수는 업종별 시가총액 상위 5개 종목(우선주 제외)을 합산해요. 업종 Top5는 거래대금이 너무 작은 업종은 빼요.</li>
    <li>🟢 7.5점 이상 사기 좋음 · 🟡 6~7.4 관망 · 🔴 6점 미만 주의</li>
    <li>${esc(D.flow_note)} 아침 보고서 점수와 계산 방식이 달라 숫자가 다를 수 있어요.</li>
  </ul></details></div>
  <div class="card"><details><summary>⚙️ 설정 (내 보유 종목)</summary>
    <div class="meta" style="margin:6px 0">이 폰에만 저장돼요. 국내 종목은 6자리 코드, 미국은 티커. 국내 종목은 앱이 추적 중인 종목만 시세가 나와요.</div>
    <label class="meta">국내 종목 코드 (쉼표로 구분)</label><input id="cf-h" value="${esc((cfg ? cfg.h : Object.keys(tracked)).join(','))}">
    <label class="meta">해외·코인</label><input id="cf-os" value="${esc((cfg ? cfg.os : myOs).join(','))}">
    <label class="meta">스윙 계획 (코드=사기1,사기2,팔기1,팔기2,손절; 여러 개는 ;)</label><input id="cf-sw" value="${esc(cfg ? Object.entries(cfg.sw).map(([k, v]) => k + '=' + v.join(',')).join(';') : '')}">
    <button class="btn" id="cf-save">저장</button>
  </details></div>`;
  if (D.errors && D.errors.length) h += `<div class="card meta">일부 데이터를 못 받았어요: ${D.errors.length}건</div>`;
  app.innerHTML = h;
  $('#cf-save').onclick = () => {
    saveCfg(parseSetup(['h:' + $('#cf-h').value.replace(/\s/g, ''), 'os:' + $('#cf-os').value.replace(/\s/g, ''), 'sw:' + $('#cf-sw').value.replace(/\s/g, '')].join('|')));
    render(); alert('저장했어요');
  };
}

async function load() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    DATA = await r.json(); render();
  } catch (e) { if (!DATA) app.innerHTML = '<div class="card">데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</div>'; }
}
$('#reload').onclick = load;
load();
setInterval(load, 60 * 1000);           // 1분마다 새 데이터 확인
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
