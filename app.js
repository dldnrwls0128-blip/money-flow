'use strict';
const $ = s => document.querySelector(s);
const app = $('#app');
let DATA = null, ALL = {}, ALL_UPD = null, TAB = 'home', Q = '';
let LOGOS = new Set();
fetch('logos/index.json?t=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' }).then(r => r.json()).then(a => { LOGOS = new Set(a); if (DATA) render({ full: true }); }).catch(() => {});
const LCOL = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626'];
function logo(code, name) {
  const ch = String(name || code || '?').trim().charAt(0);
  let h = 0; for (const c of String(code)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const fb = `<span class="logo lfb" style="background:${LCOL[h % LCOL.length]}">${esc(ch)}</span>`;
  if (!LOGOS.has(code)) return fb;
  return `<img class="logo" src="logos/${encodeURIComponent(code)}.webp" alt="" loading="lazy" decoding="async" width="26" height="26" onerror="this.outerHTML=this.dataset.fb" data-fb='${fb.replace(/'/g, '&#39;')}'>`;
}
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

// ---------- 가격 띠(게이지): 매수 구간 · 매도 구간 · 손절선 ----------
function man(v, usd) {
  if (v == null) return '–';
  if (usd) return '$' + fmt(v, v < 10 ? 3 : 2);
  if (v >= 100000) { const m = Math.round(v / 100) / 100; return m.toLocaleString('ko-KR', { minimumFractionDigits: Number.isInteger(m * 10) ? 1 : 2, maximumFractionDigits: 2 }) + '만'; }
  return fmt(v) + '원';
}
function range(a, b, usd) {   // a<=b
  if (a == null && b == null) return '–';
  if (a == null || b == null || a === b) return man(a ?? b, usd);
  return `${man(Math.min(a, b), usd)}~${man(Math.max(a, b), usd)}`;
}
function gauge(price, L, W, usd, mine) {
  if (!L || price == null) return '<div class="meta" style="margin-top:8px">가격 범위: 일봉 데이터가 부족해 계산하지 않았어요.</div>';
  const [bt, bb, st, sb, stp] = L;   // 매수 위쪽, 매수 아래쪽, 손절선, 매도 아래쪽, 매도 위쪽
  const pts = [st, bb, bt, sb, stp, price].filter(v => v != null);
  const lo = Math.min(...pts) * 0.97, hi = Math.max(...pts) * 1.03;
  const x = v => ((v - lo) / (hi - lo) * 100);
  const seg = (a, b, c) => a == null || b == null || b <= a ? '' : `<i style="left:${x(a).toFixed(1)}%;width:${(x(b) - x(a)).toFixed(1)}%;background:${c}"></i>`;
  const buyLow = bb ?? st, sellHi = stp ?? hi;
  const bars = seg(lo, st, '#ef4444') + (bb != null ? seg(st, bb, '#475569') : '') + seg(bb ?? st, bt, '#3b82f6') + seg(bt, sb ?? hi, '#64748b') + seg(sb, sellHi, '#22c55e');
  const mid = (a, b) => ((x(a) + x(b)) / 2).toFixed(1);
  const zl = [[mid(lo, st), '손절', 'r'], [mid(buyLow, bt), '매수', 'b']].concat(sb != null ? [[mid(sb, sellHi), '매도', 'g']] : [])
    .map((z, i, a) => { if (i) z[0] = Math.max(+z[0], +a[i - 1][0] + 13); z[0] = Math.min(Math.max(+z[0], 6), 94); return z; })
    .map(([p, n, c]) => `<em class="z-${c}" style="left:${p}%">${n}</em>`).join('');
  let state, sc;
  if (price <= st) { state = '🚨 손절 주의 · 손절선 아래 (종가로 확인)'; sc = 'r'; }
  else if (bb != null && price < bb) { state = '⚠️ 매수 구간 아래 · 손절선 가까움'; sc = 'r'; }
  else if (price <= bt * 1.01) { state = '🔵 매수 구간'; sc = 'b'; }
  else if (sb == null) { state = '⏳ 매수 구간 위 · 위쪽 저항 없음(신고가권)'; sc = 'n'; }
  else if (price < sb * (mine ? 1 : 0.99)) { state = '⏳ 매수 구간 위 · 기다리기'; sc = 'n'; }
  else if (stp == null || price < stp) { state = '🟢 매도 구간 · 절반 팔기'; sc = 'g'; }
  else { state = '🟢 매도 구간 위쪽 도달 · 나머지 팔기'; sc = 'g'; }
  const d = v => { const p = (v / price - 1) * 100; return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`; };
  const dr = (a, b) => a == null || b == null || a === b ? d(a ?? b) : `${d(Math.min(a, b))} ~ ${d(Math.max(a, b))}`;
  const vb = v => { const p = (v / bt - 1) * 100; return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`; };
  const why = (a, b) => [a, b].filter(Boolean).map(esc).join(' / ');
  const rows = [];
  if (sb != null) rows.push(`<div class="lv"><div class="row"><span>🟢 매도 구간</span><b>${range(sb, stp, usd)}</b></div>
    <div class="meta">지금부터 ${dr(sb, stp)} · 매수가 대비 ${stp != null ? vb(sb) + ' ~ ' + vb(stp) : vb(sb)} · 들어오면 절반, 위쪽에서 나머지${W ? ' · 근거: ' + why(W[3], W[4]) : ''}</div></div>`);
  rows.push(`<div class="lv"><div class="row"><span>🔵 매수 구간</span><b>${range(bb, bt, usd)}</b></div>
    <div class="meta">지금부터 ${dr(bb, bt)} · 위쪽에서 절반, 아래쪽에서 절반${W ? ' · 근거: ' + why(W[0], W[1]) : ''}</div></div>`);
  rows.push(`<div class="lv"><div class="row"><span>🔴 손절</span><b>${man(st, usd)} 아래</b></div>
    <div class="meta">종가 기준 · 지금부터 ${d(st)} · 매수가 대비 ${vb(st)}${W && W[2] ? ' · 근거: ' + esc(W[2]) : ''}</div></div>`);
  const summary = `<div class="zsum"><span class="zb">매수 ${range(bb, bt, usd)}</span>${sb != null ? `<span class="zg">매도 ${range(sb, stp, usd)}</span>` : ''}<span class="zr">손절 ${man(st, usd)} 아래</span></div>`;
  return `<div class="gauge">
    <div class="state s-${sc}">${state}</div>${summary}
    <div class="gwrap"><div class="mk" style="left:${x(price).toFixed(1)}%"><span>${man(price, usd)}</span>▼</div>
      <div class="gbar">${bars}</div><div class="glab">${zl}</div></div>
    <details><summary>구간 자세히 ${mine ? '(내가 정한 계획)' : '(일봉 지지·저항 자동 계산)'}</summary>${rows.join('')}
    <div class="meta">${mine ? '내가 정한 계획이 자동값보다 우선해요.' : esc(DATA.levels_rule || '')}</div></details>
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
    <div class="row"><div><div class="name nm">${logo(code, r.n)}<span>${esc(r.n)} <span class="meta">${code}</span></span></div>
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
  return `<div class="card"><div class="row"><div><div class="name nm">${logo(o.code, o.n)}<span>${esc(o.n)}</span></div><div class="meta">${esc(o.full || '')}${o.at ? ' · ' + kst(o.at) + ' 기준' : ''}</div>
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
function findResults() {
  const q = Q.trim().toLowerCase();
  let res = [];
  if (q) {
    for (const [code, r] of Object.entries(ALL)) {
      const n = r.n.toLowerCase();
      if (code.startsWith(q) || n.includes(q)) res.push([code, r, n === q ? 0 : n.startsWith(q) ? 1 : 2]);
    }
    res.sort((a, b) => a[2] - b[2] || (b[1].f?.tv || 0) - (a[1].f?.tv || 0)); res = res.slice(0, 20);
  }
  if (!q) return '';
  return res.length ? res.map(([code]) => stockCard(code, { k: '-f' })).join('') : '<div class="card meta">찾는 종목이 없어요.</div>';
}
function viewFind() {
  return `<h2>🔎 종목 찾기</h2>
    <input id="q" class="search" type="search" enterkeyhint="search" placeholder="종목명 또는 코드 (예: 현대차, 005380)" value="${esc(Q)}" autocomplete="off" autocorrect="off" spellcheck="false">
    <div class="meta hint">코스피·코스닥 ${fmt(Object.keys(ALL).length)}개 종목 · ETF 제외 · 해외 종목은 아직 추가할 수 없어요</div>
    <div id="res">${findResults()}</div>`;
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
    <li>모두 실제 일봉 고가·저가에서 뽑아요. 아래에서 직접 넣은 계획(예: 현대차)이 있으면 그것을 먼저 써요.</li>
    <li>가격 띠: 🔴 손절선 아래 · 🔵 매수 구간 · ⬜ 기다리는 구간 · 🟢 매도 구간. ▼가 지금 가격.</li>
    <li>사고팔 때는 반반: 매수 구간 위쪽에서 절반, 아래쪽에서 절반 · 매도 구간에 들어오면 절반, 위쪽에서 나머지.</li></ul></div>
  <div class="card"><b>목록 기준</b><ul class="why">
    <li>종목 Top 5: 시총 ${fmt(DATA.min_top_mcap_eok)}억 이상, 20일 평균 거래대금 ${DATA.min_top_tv_eok}억 이상</li>
    <li>업종 탑픽 3: 업종 안 20일 평균 거래대금 ${DATA.min_pick_tv_eok}억 이상, 우선주 제외, 점수 순</li>
    <li>업종 Top 5: 상위 종목 거래대금이 너무 작은 업종은 빼요</li></ul></div>
  <div class="card"><b>갱신</b><ul class="why"><li>평일 08:50~15:50 약 10분마다 시세·점수 갱신, 18:10쯤 전 종목 일별 데이터(수급·일봉) 갱신. GitHub 일정상 몇 분 늦을 수 있어요.</li>
    <li>앱은 1분마다 새 데이터를 확인해요. 초 단위 실시간 시세는 아니에요.</li></ul></div>
  <div class="card"><b>내 종목 저장</b><ul class="why"><li>관심·보유 종목, 평단·수량, 스윙 계획은 이 폰에만 저장되고 어디에도 올라가지 않아요. 앱 데이터를 지우면 사라져요.</li></ul>
    <details ${OPEN.has('plan') ? 'open' : ''}><summary data-toggle-keep="plan">⚙️ 내 매매 계획 직접 넣기</summary>${planEditor()}</details></div>`;
}

let FLASH = '';
function setUpdated() {
  const el = $('#updated'); if (!el || !DATA) return;
  const open = DATA.market_status === 'OPEN';
  el.innerHTML = `마지막 갱신 <b>${kst(DATA.updated)}</b> (KST) · ${open ? '🟢 장중 약 10분마다 갱신' : '⚪ 장 마감/휴장'}${FLASH ? ` <span class="flash">${FLASH}</span>` : ''}`;
}
function planEditor() {
  const c = cfg();
  const F = [['매수 구간 위쪽', 0], ['매수 구간 아래쪽', 1], ['매도 구간 아래쪽', 2], ['매도 구간 위쪽', 3], ['손절선', 4]];
  const one = (code, v) => `<div class="plan-ed" data-code="${esc(code)}">
    <div class="row"><b>${esc((ALL[code] || {}).n || code)} <span class="meta">${esc(code)}</span></b><button class="mini" data-act="plandel" data-code="${esc(code)}">삭제</button></div>
    <div class="pgrid">${F.map(([n, i]) => `<label><span class="meta">${n}</span><input inputmode="numeric" data-i="${i}" value="${v[i] ?? ''}"></label>`).join('')}</div></div>`;
  return `<div class="meta" style="margin:6px 0">숫자는 원 단위. 저장하면 이 폰에만 저장되고 자동 계산보다 먼저 써요.</div>
    ${Object.entries(c.sw).map(([k, v]) => one(k, v)).join('')}
    <div class="plan-ed" data-code="">
      <label><span class="meta">새 계획 종목 코드 (6자리)</span><input id="plan-new" inputmode="numeric" maxlength="6" placeholder="예: 005380"></label>
      <div class="pgrid">${F.map(([n, i]) => `<label><span class="meta">${n}</span><input inputmode="numeric" data-i="${i}"></label>`).join('')}</div></div>
    <button class="btn" data-act="plansave">계획 저장</button>`;
}

function render(opts = {}) {
  if (!DATA) return;
  const ae = document.activeElement;
  if (TAB === 'find' && ae && ae.id === 'q' && !opts.full) {   // 입력 중에는 검색창을 다시 그리지 않음
    const r = $('#res'); if (r) r.innerHTML = findResults(); setUpdated(); return;
  }
  setUpdated();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === TAB));
  const y = window.scrollY;
  app.innerHTML = (TAB === 'home' ? viewHome() : TAB === 'mine' ? viewMine() : TAB === 'find' ? viewFind() : viewHelp())
    + (DATA.errors && DATA.errors.length ? `<div class="card meta">일부 데이터를 못 받았어요: ${DATA.errors.length}건</div>` : '');
  window.scrollTo(0, y);
  const q = $('#q');
  if (q) q.addEventListener('input', () => { Q = q.value; const r = $('#res'); if (r) r.innerHTML = findResults(); });
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-toggle],[data-act],[data-tab]'); if (!t) return;
  if (t.dataset.tab) { e.preventDefault(); TAB = t.dataset.tab; window.scrollTo(0, 0); render({ full: true }); return; }
  if (t.dataset.toggle) { const id = t.dataset.toggle; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); render({ full: true }); return; }
  const c = cfg(), code = t.dataset.code;
  if (t.dataset.act === 'w') c.w = c.w.includes(code) ? c.w.filter(x => x !== code) : [...c.w, code];
  if (t.dataset.act === 'h') {
    if (c.h.includes(code)) { if (!confirm('보유 종목에서 삭제할까요?')) return; c.h = c.h.filter(x => x !== code); delete c.pos[code]; }
    else c.h = [...c.h, code];
  }
  if (t.dataset.act === 'plandel') { if (!confirm('이 계획을 삭제할까요?')) return; delete c.sw[code]; saveCfg(c); render({ full: true }); return; }
  if (t.dataset.act === 'plansave') {
    let bad = '';
    document.querySelectorAll('.plan-ed').forEach(box => {
      const code0 = box.dataset.code || ($('#plan-new')?.value || '').trim();
      const v = [...box.querySelectorAll('input[data-i]')].map(i => Number(i.value.replace(/[,\s원]/g, '')) || null);
      if (!code0 || v.every(x => x == null)) return;
      if (!/^\d{6}$|^[A-Z.]+$/.test(code0)) { bad = '종목 코드를 확인해 주세요'; return; }
      const [bt, bb, sb, stp, st] = v;
      if (!bt || !st) { bad = '매수 구간 위쪽과 손절선은 꼭 넣어 주세요'; return; }
      c.sw[code0] = [bt, bb ?? bt, sb, stp ?? sb, st];
    });
    if (bad) { alert(bad); return; }
    saveCfg(c); OPEN.add('plan'); alert('저장했어요'); render({ full: true }); return;
  }
  if (t.dataset.act === 'pos') {
    const a = Number($('#pa-' + code).value.replace(/,/g, '')), q = Number($('#pq-' + code).value.replace(/,/g, ''));
    if (a > 0) c.pos[code] = { a, q: q > 0 ? q : 0 }; else delete c.pos[code];
    OPEN.delete('pos-' + code);
  }
  saveCfg(c); render({ full: true });
});

async function load(manual) {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); const changed = !DATA || d.updated !== DATA.updated; DATA = d;
    if (changed || !ALL_UPD) {
      try { const a = await (await fetch('all.json?t=' + Date.now(), { cache: 'no-store' })).json(); ALL = a.s || {}; ALL_UPD = a.updated; } catch {}
    }
    if (manual) {
      const now = new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
      FLASH = changed ? `✅ 새 데이터 받음 ${now}` : `✅ 확인함 ${now} · 최신이에요`;
      setTimeout(() => { FLASH = ''; setUpdated(); }, 6000);
    }
    if (changed) render(); else setUpdated();
    return true;
  } catch (e) {
    if (manual) { FLASH = '⚠️ 인터넷 연결을 확인해 주세요'; setUpdated(); }
    if (!DATA) app.innerHTML = '<div class="card">데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</div>';
    return false;
  }
}
// ---------- 버전 표시 · 새 버전 안내 ----------
// 예전 버전 화면(index.html)이 남아 있어도 멈추지 않도록 필요한 요소를 직접 만든다
(function ensureShell() {
  const h1 = document.querySelector('header h1');
  if (h1 && !$('#ver')) { const s = document.createElement('span'); s.id = 'ver'; s.className = 'ver'; h1.append(' ', s); }
  const hd = document.querySelector('header');
  if (hd && !$('#newver')) { const d = document.createElement('div'); d.id = 'newver'; d.className = 'newver'; d.hidden = true; d.innerHTML = '🆕 새 버전이 있어요 · <b>눌러서 새로고침</b>'; hd.append(d); }
  if (hd && !document.querySelector('header nav')) {
    const n = document.createElement('nav');
    n.innerHTML = '<button data-tab="home" class="on">🏠 홈</button><button data-tab="mine">📌 내 종목</button><button data-tab="find">🔎 찾기</button><button data-tab="help">❓ 도움말</button>';
    hd.insertBefore(n, $('#newver'));
  }
  const ft = document.querySelector('footer');
  if (ft && !$('#verfoot')) { const s = document.createElement('span'); s.id = 'verfoot'; ft.append(document.createElement('br'), s); }
  document.title = '돈흐름';
})();
$('#ver').textContent = 'v' + self.APP_VERSION;
$('#verfoot').textContent = `앱 버전 v${self.APP_VERSION} · 배포 ${self.APP_DATE}`;
let NEWV = null;
async function checkVersion() {
  try {
    const t = await (await fetch('version.js?t=' + Date.now(), { cache: 'no-store' })).text();
    const m = t.match(/APP_VERSION\s*=\s*'([^']+)'/);
    if (m && m[1] !== self.APP_VERSION) { NEWV = m[1]; const b = $('#newver'); b.hidden = false; b.querySelector('b').textContent = `v${m[1]} 받기 · 눌러서 새로고침`; }
  } catch {}
}
async function applyUpdate() {
  const b = $('#newver'); b.querySelector('b').textContent = '새 버전 받는 중…';
  let reloaded = false;
  const go = () => { if (!reloaded) { reloaded = true; location.reload(); } };
  setTimeout(go, 4000);   // 무슨 일이 있어도 4초 뒤 새로고침
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/money-flow/');
    if (reg) {
      navigator.serviceWorker.addEventListener('controllerchange', go, { once: true });
      await reg.update();
      const w = reg.waiting || reg.installing;
      if (w) { w.postMessage('skipWaiting'); w.addEventListener('statechange', () => { if (w.state === 'activated') go(); }); return; }
    }
  } catch {}
  go();
}
$('#newver').addEventListener('click', applyUpdate);
async function manualReload() {
  const btn = $('#reload'); if (btn.classList.contains('spin')) return;
  btn.classList.add('spin'); FLASH = '⏳ 새 데이터 확인 중…'; setUpdated();
  await Promise.all([load(true), checkVersion(), new Promise(r => setTimeout(r, 600))]);
  btn.classList.remove('spin');
}
$('#reload').addEventListener('click', manualReload);
checkVersion();
setInterval(checkVersion, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(); checkVersion(); } });
load();
setInterval(load, 60 * 1000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/money-flow/sw.js', { scope: '/money-flow/', updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
