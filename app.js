'use strict';
const $ = s => document.querySelector(s);
const app = $('#app');
let DATA = null, ALL = {}, ALL_UPD = null, TAB = 'home', Q = '';
const OPEN = new Set();   // 펼친 카드/상세 id

// ---------- 내 설정: 이 폰(localStorage)에만 저장 ----------
function blankCfg() { return { h: [], w: [], os: [], sw: {}, pos: {} }; }
function loadCfg() {
  try { const c = JSON.parse(localStorage.getItem('mf_cfg')); if (c) return Object.assign(blankCfg(), c); } catch {}
  return null;
}
function saveCfg(c) { localStorage.setItem('mf_cfg', JSON.stringify(c)); }
function cfg() { return loadCfg() || defaultCfg(); }
function defaultCfg() { const c = blankCfg(); if (DATA) { c.h = Object.keys(DATA.tracked || {}); c.os = (DATA.overseas || []).map(o => o.code); } return c; }
function parseSetup(str) {
  // h:코드,..|w:코드,..|os:SMR,..|sw:코드=매수1,매수2,매도1,매도2,손절;..|pos:코드=평단,수량;..
  const c = blankCfg();
  decodeURIComponent(str).split('|').forEach(part => {
    const i = part.indexOf(':'); if (i < 0) return;
    const k = part.slice(0, i), v = part.slice(i + 1); if (!v) return;
    if (k === 'h' || k === 'w' || k === 'os') c[k] = v.split(',').filter(Boolean);
    if (k === 'sw') v.split(';').forEach(x => { const [code, n] = x.split('='); if (code && n) c.sw[code] = n.split(',').map(Number); });
    if (k === 'pos') v.split(';').forEach(x => { const [code, n] = x.split('='); if (code && n) { const [a, q] = n.split(',').map(Number); c.pos[code] = { a, q }; } });
  });
  return c;
}
if (location.hash.startsWith('#setup=')) {
  const old = loadCfg(), nc = parseSetup(location.hash.slice(7));
  if (old) { nc.w = [...new Set([...(old.w || []), ...nc.w])]; nc.pos = Object.assign({}, old.pos, nc.pos); }
  saveCfg(nc); history.replaceState(null, '', location.pathname);
}

// ---------- 포맷 ----------
const fmt = (n, d = 0) => n == null ? '–' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
const cls = p => p > 0 ? 'up' : p < 0 ? 'dn' : '';
const pct = (p, d = 2) => p == null ? '–' : (p > 0 ? '+' : '') + Number(p).toFixed(d) + '%';
const eok = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v)) + '억';
const lvl = s => s == null ? 'n' : s >= 7.5 ? 'g' : s >= 6 ? 'y' : 'r';
const lbl = s => s == null ? '점수 없음' : s >= 7.5 ? '사기 좋음' : s >= 6 ? '관망' : '주의';
const COLOR = { g: '#22c55e', y: '#eab308', r: '#ef4444', n: '#475569' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = d => d ? `${+d.slice(4, 6)}/${+d.slice(6, 8)}` : '–';
const kst = iso => iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '–';
function money(v, usd) { if (v == null) return '–'; return usd ? '$' + fmt(v, v < 10 ? 3 : 2) : fmt(v) + '원'; }

// ---------- 점수 근거 ----------
const PARTS = [['수급', 3], ['거래대금', 2], ['지속성', 2], ['촉매', 2], ['가격위치', 1]];
function explain(pt, f, sector) {
  f = f || {};
  const out = [];
  const g = (v, m) => v / m;
  // 수급
  let ev = f.fd ? `${md(f.fd)} ${sector ? '상위 5종목 합 ' : ''}외국인 ${eok(f.fo)} · 기관 ${eok(f.oo)}` + (f.r1 != null ? ` (거래량의 ${f.r1 > 0 ? '+' : ''}${f.r1}%)` : '') : '수급 데이터 없음 → 중간값';
  out.push([PARTS[0], pt[0], ev, g(pt[0], 3) >= .7 ? '외국인·기관이 사고 있어요' : g(pt[0], 3) >= .45 ? '큰손 매매가 팽팽해요' : '외국인·기관이 팔고 있어요']);
  // 거래대금
  ev = `오늘 거래대금 ${fmt(f.tv)}억` + (f.rk ? ` · 전체 ${fmt(f.rk)}위/${fmt(f.tot)}` : '') + (f.pace != null ? ` · 평소(20일 평균) 대비 ${f.pace}배 속도` : '');
  out.push([PARTS[1], pt[1], ev, f.pace >= 1.5 ? '평소보다 돈이 훨씬 많이 몰려요' : f.pace >= 0.8 ? '평소 수준으로 거래돼요' : '평소보다 관심이 적어요']);
  // 지속성
  ev = f.n ? `최근 ${f.n}일 중 ${f.pd}일 외국인+기관 순매수` + (f.sk ? ` · ${Math.abs(f.sk)}일 연속 순${f.sk > 0 ? '매수' : '매도'}` : '') : '데이터 없음 → 중간값';
  out.push([PARTS[2], pt[2], ev, f.sk >= 3 ? '며칠째 꾸준히 사들이고 있어요' : f.sk <= -3 ? '며칠째 계속 팔고 있어요' : '사고팔기가 섞여 있어요']);
  // 촉매
  ev = `시장 대비 오늘 ${f.rel > 0 ? '+' : ''}${f.rel ?? 0}%p` + (f.br != null ? ` · 업종 안 오른 종목 ${f.br}%` : '') + ' (뉴스 대신 강도로 근사)';
  out.push([PARTS[3], pt[3], ev, f.rel >= 1.5 ? '오늘 시장보다 확실히 강해요' : f.rel <= -1.5 ? '오늘 시장보다 약해요' : '시장과 비슷하게 움직여요']);
  // 가격위치
  ev = (f.p60 != null ? `60일 범위 중 ${f.p60}%` : '60일 범위 없음') + (f.p52 != null ? ` · 52주 범위 중 ${f.p52}% 위치` : '');
  out.push([PARTS[4], pt[4], ev, f.p60 == null ? '' : f.p60 <= 25 ? '바닥권이라 저점 매수에 유리해요' : f.p60 >= 75 ? '고점권이라 따라 사기는 주의' : '중간 위치예요']);
  return out;
}
function detailHTML(id, r, sector) {
  if (!r.pt) return `<div class="meta" style="margin-top:8px">아직 점수용 일별 데이터가 없어요 (장 마감 후 갱신 때 채워져요).</div>`;
  const rows = explain(r.pt, r.f, sector).map(([[k, m], v, ev, it]) => `
    <div class="ex"><div class="row"><b>${k}</b><b class="c-${lvl(v / m * 10)}">${v} / ${m}</b></div>
    <div class="pb"><i style="width:${v / m * 100}%;background:${COLOR[lvl(v / m * 10)]}"></i></div>
    <div class="meta">${esc(ev)}</div>${it ? `<div>👉 ${esc(it)}</div>` : ''}</div>`).join('');
  return `<div class="detail">${rows}<div class="meta">기준: 수급 ${r.f && r.f.fd ? md(r.f.fd) + ' 확정치' : '–'} · 시세 ${kst(DATA.updated)} · <a href="#" data-tab="help">점수 규칙 보기</a></div></div>`;
}

// ---------- 가격 띠(게이지) ----------
function gauge(price, L, W, usd, mine) {
  if (!L || price == null) return '<div class="meta" style="margin-top:8px">가격 범위: 일봉 데이터가 부족해 계산하지 않았어요.</div>';
  let [b1, b2, st, s1, s2] = L;
  const pts = [st, b2, b1, s1, s2, price].filter(v => v != null);
  const lo = Math.min(...pts) * 0.97, hi = Math.max(...pts) * 1.03;
  const x = v => ((v - lo) / (hi - lo) * 100).toFixed(1);
  const seg = (a, b, c) => a == null || b == null || b <= a ? '' : `<i style="left:${x(a)}%;width:${x(b) - x(a)}%;background:${c}"></i>`;
  const top2 = s2 ?? s1;
  const bars = seg(lo, st, '#ef4444') + (b2 != null ? seg(st, b2, '#475569') + seg(b2, b1, '#3b82f6') : seg(st, b1, '#3b82f6')) + seg(b1, s1 ?? hi, '#64748b') + seg(s1, s2 ?? hi, '#22c55e') + (s2 ? seg(s2, hi, '#15803d') : '');
  const tl = [[st, '손절'], [b2, '2차매수'], [b1, '1차매수'], [s1, '목표1'], [s2, '목표2']].filter(t => t[0] != null);
  const ticks = tl.map(([v]) => `<s style="left:${x(v)}%"></s>`).join('');
  const tlab = tl.map(([v, n], i) => `<em style="left:${x(v)}%;top:${i % 2 ? 16 : 0}px">${n}</em>`).join('');
  let state, sc;
  if (price <= st) { state = '🚨 손절 주의 · 손절가 아래 (종가로 확인)'; sc = 'r'; }
  else if (b2 != null && price < b2) { state = '⚠️ 2차 매수가 아래 · 손절가 가까움'; sc = 'r'; }
  else if (price <= b1 * 1.01) { state = '🔵 매수 구간'; sc = 'b'; }
  else if (s1 == null && !mine) { state = '⏳ 매수가 위 · 위쪽 저항 없음(신고가권)'; sc = 'n'; }
  else if (s1 == null || price < s1 * (mine ? 1 : 0.99)) { state = '⏳ 매수가 위 · 기다리기'; sc = 'n'; }
  else if (!mine) { state = '🟢 1차 목표 도달 · 절반 팔기 구간'; sc = 'g'; }
  else if (s2 == null || price < s2) { state = '🟢 1차 매도 도달 · 절반 팔기'; sc = 'g'; }
  else { state = '🟢 2차 매도 도달 · 나머지 팔기'; sc = 'g'; }
  const from = v => { const d = (v / price - 1) * 100; return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`; };
  const vsb1 = v => { const d = (v / b1 - 1) * 100; return `1차 매수 대비 ${d > 0 ? '+' : ''}${d.toFixed(1)}%`; };
  const rows = [
    ['🟢', '2차 매도 (나머지)', s2, W && W[4], true], ['🟢', '1차 매도 (절반)', s1, W && W[3], true],
    ['🔵', '1차 매수 (절반)', b1, W && W[0]], ['🔵', '2차 매수 (절반)', b2, W && W[1]], ['🔴', '손절 (종가 기준)', st, W && W[2], true]]
    .filter(r => r[2] != null).map(([ic, k, v, why, rel]) => `<div class="lv"><div class="row"><span>${ic} ${k}</span><b>${money(v, usd)}</b></div>
      <div class="meta">지금부터 ${from(v)}${rel && v !== b1 ? ' · ' + vsb1(v) : ''}${why ? ' · ' + esc(why) : ''}</div></div>`).join('');
  return `<div class="gauge">
    <div class="state s-${sc}">${state}</div>
    <div class="gwrap"><div class="mk" style="left:${x(price)}%"><span>${money(price, usd)}</span>▼</div>
      <div class="gbar">${bars}${ticks}</div>
      <div class="glab">${tlab}</div></div>
    <details ${OPEN.has('lv') ? 'open' : ''}><summary>가격선 자세히 ${mine ? '(내가 정한 계획)' : '(일봉 지지·저항 자동 계산)'}</summary>${rows}
    <div class="meta">${mine ? '설정에서 직접 넣은 계획이 자동값보다 우선해요.' : esc(DATA.levels_rule || '')}</div></details>
  </div>`;
}

// ---------- 카드 ----------
function stockCard(code, opt = {}) {
  const c = cfg();
  const r = ALL[code] || (DATA.tracked || {})[code] || (DATA.stocks_top || []).find(s => s.code === code);
  if (!r) return `<div class="card"><div class="name">${esc(code)}</div><div class="meta">시세를 찾지 못했어요 (상장폐지·코드 확인)</div>${actions(code, c)}</div>`;
  const id = 'st-' + code + (opt.k || '');
  const L = c.sw[code] ? [c.sw[code][0], c.sw[code][1], c.sw[code][4], c.sw[code][2], c.sw[code][3]] : r.l;
  const pos = c.pos[code];
  let pl = '';
  if (pos && pos.a && r.p) {
    const rr = (r.p / pos.a - 1) * 100;
    pl = `<div class="pl ${cls(rr)}">내 수익률 ${pct(rr)}${pos.q ? ` · 평가손익 ${(r.p - pos.a) * pos.q >= 0 ? '+' : '−'}${fmt(Math.abs((r.p - pos.a) * pos.q))}원` : ''}<span class="meta"> (평단 ${fmt(pos.a)}원${pos.q ? ' · ' + fmt(pos.q) + '주' : ''})</span></div>`;
  }
  const L_ = lvl(r.s);
  return `<div class="card">
    <div class="row"><div><div class="name">${esc(r.n)} <span class="meta">${code}</span></div>
      <div class="meta">${money(r.p)} <span class="${cls(r.c)}">${pct(r.c)}</span>${r.sec ? ' · ' + esc(r.sec) : ''}</div></div>
      <button class="sbtn c-${L_}" data-toggle="${id}"><span class="score">${r.s ?? '–'}</span><span class="badge b-${L_}">${lbl(r.s)}</span><span class="meta">왜? ▾</span></button></div>
    <div class="bar"><i style="width:${(r.s || 0) * 10}%;background:${COLOR[L_]}"></i></div>
    ${OPEN.has(id) ? detailHTML(id, r) : ''}
    ${pl}${gauge(r.p, L, c.sw[code] ? null : r.lw, false, !!c.sw[code])}
    ${actions(code, c)}
  </div>`;
}
function actions(code, c) {
  const inW = c.w.includes(code), inH = c.h.includes(code);
  const pe = OPEN.has('pos-' + code);
  return `<div class="acts">
    <button class="mini" data-act="w" data-code="${code}">${inW ? '★ 관심 해제' : '☆ 관심 추가'}</button>
    <button class="mini" data-act="h" data-code="${code}">${inH ? '보유 삭제' : '+ 보유 추가'}</button>
    ${inH ? `<button class="mini" data-toggle="pos-${code}">평단·수량</button>` : ''}</div>
    ${inH && pe ? `<div class="posf"><input inputmode="numeric" id="pa-${code}" placeholder="평단(원)" value="${c.pos[code]?.a ?? ''}">
      <input inputmode="numeric" id="pq-${code}" placeholder="수량(주)" value="${c.pos[code]?.q ?? ''}">
      <button class="mini on" data-act="pos" data-code="${code}">저장</button></div>` : ''}`;
}
function sectorCard(s, i) {
  const id = 'sec-' + s.n; const L_ = lvl(s.s);
  const open = OPEN.has(id), dopen = OPEN.has('d' + id);
  return `<div class="card">
    <div class="row"><div><div class="name">${esc(s.n)}</div>
      <div class="meta"><span class="${cls(s.c)}">${pct(s.c)}</span> · 오른 ${s.rise} / 내린 ${s.fall} · ${s.cnt}종목</div></div>
      <button class="sbtn c-${L_}" data-toggle="d${id}"><span class="score">${s.s}</span><span class="badge b-${L_}">${lbl(s.s)}</span><span class="meta">왜? ▾</span></button></div>
    <div class="bar"><i style="width:${s.s * 10}%;background:${COLOR[L_]}"></i></div>
    ${dopen ? detailHTML(id, s, true) : ''}
    <button class="pickbtn" data-toggle="${id}">${open ? '▲ 탑픽 접기' : `▼ 이 업종 탑픽 3 보기`}</button>
    ${open ? `<div class="picks">${(s.picks || []).length ? s.picks.map(c => stockCard(c, { k: '-' + s.n })).join('') : '<div class="meta">거래대금 기준을 넘는 종목이 없어요.</div>'}
      <div class="meta">탑픽 기준: 업종 안 점수 상위 3개 · 20일 평균 거래대금 ${DATA.min_pick_tv_eok}억 이상 · 우선주 제외</div></div>` : ''}
  </div>`;
}
function overseasCard(o, c) {
  const L = c.sw[o.code] ? [c.sw[o.code][0], c.sw[o.code][1], c.sw[o.code][4], c.sw[o.code][2], c.sw[o.code][3]] : o.l;
  const isCoin = !o.at;
  return `<div class="card"><div class="row"><div><div class="name">${esc(o.n)}</div><div class="meta">${esc(o.full || '')}${o.at ? ' · ' + kst(o.at) + ' 기준' : ''}</div>
    <span class="badge b-n">해외·코인 · 점수 없음</span></div>
    <div style="text-align:right"><div class="name">${money(o.p, true)}</div><div class="${cls(o.c)}">${pct(o.c)}</div>${o.krw ? `<div class="meta">${fmt(o.krw, 1)}원</div>` : ''}</div></div>
    ${isCoin && !L ? '<div class="meta" style="margin-top:8px">코인은 무료 일봉(고가·저가) 데이터가 없어 가격 범위는 생략해요.</div>' : gauge(o.p, L, c.sw[o.code] ? null : o.lw, true, !!c.sw[o.code])}</div>`;
}

// ---------- 화면 ----------
function viewHome() {
  const D = DATA, K = D.index.KOSPI, Kq = D.index.KOSDAQ;
  return `<div class="card headline">${esc(D.headline)}</div>
  <div class="grid">
    <div class="card big"><div class="k">코스피</div><div class="v">${fmt(K.value, 2)}</div><div class="d ${cls(K.pct)}">${pct(K.pct)}</div></div>
    <div class="card big"><div class="k">코스닥</div><div class="v">${fmt(Kq.value, 2)}</div><div class="d ${cls(Kq.pct)}">${pct(Kq.pct)}</div></div>
    <div class="card big"><div class="k">외국인 (코스피)</div><div class="v ${cls(K.foreign)}">${eok(K.foreign)}</div><div class="meta">코스닥 ${eok(Kq.foreign)}</div></div>
    <div class="card big"><div class="k">기관 (코스피)</div><div class="v ${cls(K.institution)}">${eok(K.institution)}</div><div class="meta">코스닥 ${eok(Kq.institution)} · 개인 ${eok(K.personal)}</div></div>
  </div>
  <h2>💰 돈이 몰리는 업종 Top 5</h2><div class="meta hint">업종을 누르면 그 안의 탑픽 3종목이 나와요</div>
  ${D.sectors_top.map(sectorCard).join('')}
  <h2>🔥 점수 높은 종목 Top 5</h2><div class="meta hint">시총 ${fmt(D.min_top_mcap_eok)}억↑ · 20일 평균 거래대금 ${D.min_top_tv_eok}억↑ 종목 중</div>
  ${D.stocks_top.map(s => stockCard(s.code, { k: '-top' })).join('')}
  <h2>📋 전체 업종 (${D.sectors_all.length}개)</h2>
  ${OPEN.has('allsec') ? D.sectors_all.map(sectorCard).join('') + `<button class="pickbtn" data-toggle="allsec">▲ 접기</button>`
    : `<button class="pickbtn" data-toggle="allsec">▼ 전체 업종 점수 펼치기</button>`}`;
}
function viewMine() {
  const c = cfg(); let h = '';
  if (!loadCfg()) h += `<div class="card meta">아직 이 폰에 저장된 내 종목이 없어 기본 목록을 보여줘요. 찾기 탭에서 추가하거나 설정 링크로 한 번 열어 주세요.</div>`;
  const sortS = a => a.slice().sort((x, y) => ((ALL[y] || {}).s ?? -1) - ((ALL[x] || {}).s ?? -1));
  h += `<h2>📌 보유 종목 (${c.h.length})</h2>` + (c.h.length ? sortS(c.h).map(x => stockCard(x, { k: '-h' })).join('') : '<div class="card meta">찾기 탭에서 + 보유 추가를 눌러 주세요.</div>');
  const os = (DATA.overseas || []).filter(o => c.os.includes(o.code));
  if (os.length) h += `<h2>🌎 해외·코인</h2>` + os.map(o => overseasCard(o, c)).join('');
  h += `<h2>⭐ 관심 종목 (${c.w.length})</h2>` + (c.w.length ? sortS(c.w).map(x => stockCard(x, { k: '-w' })).join('') : '<div class="card meta">찾기 탭에서 ☆ 관심 추가를 눌러 주세요.</div>');
  return h;
}
function viewFind() {
  const q = Q.trim().toLowerCase();
  let res = [];
  if (q) {
    for (const [code, r] of Object.entries(ALL)) {
      const n = r.n.toLowerCase();
      if (code.startsWith(q) || n.includes(q)) res.push([code, r, n === q ? 0 : n.startsWith(q) ? 1 : 2]);
    }
    res.sort((a, b) => a[2] - b[2] || (b[1].f?.tv || 0) - (a[1].f?.tv || 0)); res = res.slice(0, 20);
  }
  return `<h2>🔎 종목 찾기</h2>
    <input id="q" type="search" placeholder="종목명 또는 6자리 코드 (예: 현대차, 005380)" value="${esc(Q)}" autocomplete="off">
    <div class="meta hint">코스피·코스닥 ${fmt(Object.keys(ALL).length)}개 종목 · ETF 제외 · 해외 종목은 아직 추가할 수 없어요</div>
    <div id="res">${q ? (res.length ? res.map(([code]) => stockCard(code, { k: '-f' })).join('') : '<div class="card meta">찾는 종목이 없어요.</div>') : ''}</div>`;
}
function viewHelp() {
  return `<div class="card"><b>앱 버전</b> v${esc(self.APP_VERSION)} · 배포 ${esc(self.APP_DATE)}
    <ul class="why">${(self.APP_CHANGES || []).map(([v, d, t]) => `<li><b>v${esc(v)}</b> (${esc(d)}) ${esc(t)}</li>`).join('')}</ul></div>
  <h2>❓ 점수와 가격선은 이렇게 정해요</h2>
  <div class="card"><b>점수 (10점 만점)</b><ul class="why">
    <li><b>수급 3점</b>: 전 거래일과 최근 3일 동안 외국인+기관 순매수가 거래량에서 차지하는 비율. 많이 살수록 높아요.</li>
    <li><b>거래대금 2점</b>: 오늘 거래대금이 20일 평균보다 얼마나 빠른 속도로 쌓이는지 (장중엔 지난 시간만큼 비례 계산). 평소의 2배 속도면 만점.</li>
    <li><b>지속성 2점</b>: 최근 5거래일 중 외국인+기관이 순매수한 날 수. 5일 모두면 만점.</li>
    <li><b>촉매 2점 (근사치)</b>: 뉴스·공시는 자동으로 읽지 못해서, 오늘 시장(코스피·코스닥) 대비 얼마나 강한지로 대신해요. 업종은 업종 안 오른 종목 비율도 반영.</li>
    <li><b>가격위치 1점</b>: 60일 고가~저가 범위에서 낮은 곳일수록 높은 점수 (저점 매수). 52주 위치는 참고로 같이 보여줘요.</li>
    <li>🟢 7.5점 이상 <b>사기 좋음</b> · 🟡 6~7.4 <b>관망</b> · 🔴 6점 미만 <b>주의</b></li>
    <li>업종 점수: 업종(네이버 업종 분류) 시가총액 상위 5종목(우선주 제외)을 합산.</li>
    <li>${esc(DATA.flow_note)}</li></ul></div>
  <div class="card"><b>가격선 (매수·매도·손절)</b><ul class="why"><li>${esc(DATA.levels_rule)}</li>
    <li>모두 실제 일봉 고가·저가에서 뽑아요. 설정에서 직접 넣은 스윙 계획(예: 현대차)이 있으면 그것을 먼저 써요.</li>
    <li>가격 띠: 🔴 손절 아래 · ⬛ 손절~2차 매수 사이 · 🔵 매수 구간(2차~1차) · ⬜ 기다리는 구간 · 🟢 매도 구간(1차~2차 목표). ▼가 지금 가격.</li></ul></div>
  <div class="card"><b>목록 기준</b><ul class="why">
    <li>종목 Top 5: 시총 ${fmt(DATA.min_top_mcap_eok)}억 이상, 20일 평균 거래대금 ${DATA.min_top_tv_eok}억 이상</li>
    <li>업종 탑픽 3: 업종 안 20일 평균 거래대금 ${DATA.min_pick_tv_eok}억 이상, 우선주 제외, 점수 순</li>
    <li>업종 Top 5: 상위 종목 거래대금이 너무 작은 업종은 빼요</li></ul></div>
  <div class="card"><b>갱신</b><ul class="why"><li>평일 08:50~15:50 약 10분마다 시세·점수 갱신, 18:10쯤 전 종목 일별 데이터(수급·일봉) 갱신. GitHub 일정상 몇 분 늦을 수 있어요.</li>
    <li>앱은 1분마다 새 데이터를 확인해요. 초 단위 실시간 시세는 아니에요.</li></ul></div>
  <div class="card"><b>내 종목 저장</b><ul class="why"><li>관심·보유 종목, 평단·수량, 스윙 계획은 이 폰에만 저장되고 어디에도 올라가지 않아요. 앱 데이터를 지우면 사라져요.</li></ul>
    <details><summary>⚙️ 스윙 계획 직접 넣기</summary>
    <div class="meta">형식: 코드=사기1,사기2,팔기1,팔기2,손절 (여러 개는 ;)</div>
    <input id="cf-sw" value="${esc(Object.entries(cfg().sw).map(([k, v]) => k + '=' + v.join(',')).join(';'))}">
    <button class="btn" id="cf-save">저장</button></details></div>`;
}

function render() {
  if (!DATA) return;
  const open = DATA.market_status === 'OPEN';
  $('#updated').innerHTML = `마지막 갱신 <b>${kst(DATA.updated)}</b> (KST) · ${open ? '🟢 장중 약 10분마다 갱신' : '⚪ 장 마감/휴장'}`;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === TAB));
  const y = window.scrollY;
  app.innerHTML = (TAB === 'home' ? viewHome() : TAB === 'mine' ? viewMine() : TAB === 'find' ? viewFind() : viewHelp())
    + (DATA.errors && DATA.errors.length ? `<div class="card meta">일부 데이터를 못 받았어요: ${DATA.errors.length}건</div>` : '');
  window.scrollTo(0, y);
  const q = $('#q');
  if (q) { q.oninput = () => { Q = q.value; const p = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); }; }
  const sv = $('#cf-save');
  if (sv) sv.onclick = () => { const c = cfg(); c.sw = parseSetup('sw:' + $('#cf-sw').value.replace(/\s/g, '')).sw; saveCfg(c); alert('저장했어요'); render(); };
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-toggle],[data-act],[data-tab]'); if (!t) return;
  if (t.dataset.tab) { e.preventDefault(); TAB = t.dataset.tab; window.scrollTo(0, 0); render(); return; }
  if (t.dataset.toggle) { const id = t.dataset.toggle; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); render(); return; }
  const c = cfg(), code = t.dataset.code;
  if (t.dataset.act === 'w') c.w = c.w.includes(code) ? c.w.filter(x => x !== code) : [...c.w, code];
  if (t.dataset.act === 'h') {
    if (c.h.includes(code)) { if (!confirm('보유 종목에서 삭제할까요?')) return; c.h = c.h.filter(x => x !== code); delete c.pos[code]; }
    else c.h = [...c.h, code];
  }
  if (t.dataset.act === 'pos') {
    const a = Number($('#pa-' + code).value.replace(/,/g, '')), q = Number($('#pq-' + code).value.replace(/,/g, ''));
    if (a > 0) c.pos[code] = { a, q: q > 0 ? q : 0 }; else delete c.pos[code];
    OPEN.delete('pos-' + code);
  }
  saveCfg(c); render();
});

async function load() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    const d = await r.json(); const changed = !DATA || d.updated !== DATA.updated; DATA = d;
    if (changed || !ALL_UPD) {
      try { const a = await (await fetch('all.json?t=' + Date.now(), { cache: 'no-store' })).json(); ALL = a.s || {}; ALL_UPD = a.updated; } catch {}
    }
    if (changed) render();
  } catch (e) { if (!DATA) app.innerHTML = '<div class="card">데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</div>'; }
}
// ---------- 버전 표시 · 새 버전 안내 ----------
$('#ver').textContent = 'v' + self.APP_VERSION;
$('#verfoot').textContent = `앱 버전 v${self.APP_VERSION} · 배포 ${self.APP_DATE}`;
async function checkVersion() {
  try {
    const t = await (await fetch('version.js?t=' + Date.now(), { cache: 'no-store' })).text();
    const m = t.match(/APP_VERSION\s*=\s*'([^']+)'/);
    if (m && m[1] !== self.APP_VERSION) { const b = $('#newver'); b.hidden = false; b.querySelector('b').textContent = `v${m[1]} 받기 · 눌러서 새로고침`; }
  } catch {}
}
$('#newver').onclick = async () => {
  try { const r = await navigator.serviceWorker?.getRegistration(); if (r) await r.update(); } catch {}
  location.reload();
};
checkVersion();
setInterval(checkVersion, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
$('#reload').onclick = () => { DATA = null; load(); checkVersion(); };
load();
setInterval(load, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
