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
function blankCfg() { return { h: [], os: [], sw: {}, pos: {}, hName: '보유종목', lists: [{ id: 'w', name: '관심종목', codes: [] }] }; }
function migrate(c) {   // 예전 저장 형식(w 배열) → 관심 탭 목록
  if (!Array.isArray(c.lists) || !c.lists.length) c.lists = [{ id: 'w', name: '관심종목', codes: [] }];
  if (Array.isArray(c.w)) { const l0 = c.lists[0]; l0.codes = [...new Set([...(l0.codes || []), ...c.w])]; delete c.w; }
  c.lists.forEach(l => { l.codes = l.codes || []; l.name = l.name || '관심'; });
  c.hName = c.hName || '보유종목';
  return c;
}
function loadCfg() {
  try { const c = JSON.parse(localStorage.getItem('mf_cfg')); if (c) return migrate(Object.assign(blankCfg(), c)); } catch {}
  return null;
}
function saveCfg(c) { c.src = c.src || 'user'; localStorage.setItem('mf_cfg', JSON.stringify(c)); }
function cfg() { return loadCfg() || blankCfg(); }   // 새 사용자는 항상 빈 목록 (기본 종목 자동 채우기 없음)
function parseSetup(str) {
  // h:코드,..|w:코드,..|os:SMR,..|sw:코드=매수1,매수2,매도1,매도2,손절;..|pos:코드=평단,수량;..
  const c = blankCfg();
  decodeURIComponent(str).split('|').forEach(part => {
    const i = part.indexOf(':'); if (i < 0) return;
    const k = part.slice(0, i), v = part.slice(i + 1); if (!v) return;
    if (k === 'h' || k === 'os') c[k] = v.split(',').filter(Boolean);
    if (k === 'w') c.lists[0].codes = v.split(',').filter(Boolean);
    if (k === 'sw') v.split(';').forEach(x => { const [code, n] = x.split('='); if (code && n) c.sw[code] = n.split(',').map(Number); });
    if (k === 'pos') v.split(';').forEach(x => { const [code, n] = x.split('='); if (code && n) { const [a, q] = n.split(',').map(Number); c.pos[code] = { a, q }; } });
  });
  return c;
}
if (location.hash.startsWith('#setup=')) {
  const old = loadCfg(), nc = parseSetup(location.hash.slice(7));
  if (old) {   // 예전 탭·관심 목록·이름은 그대로 두고 설정 링크 내용만 합침
    const add = nc.lists[0].codes; nc.lists = old.lists; nc.lists[0].codes = [...new Set([...nc.lists[0].codes, ...add])];
    nc.hName = old.hName; nc.pos = Object.assign({}, old.pos, nc.pos);
  }
  nc.src = 'setup'; saveCfg(nc); history.replaceState(null, '', location.pathname);
}

// 예전 버전(1.4.0 이하)은 빈 폰에 예시 종목을 채운 뒤 저장해 버릴 수 있었음.
// 저장된 목록이 그 예시 목록과 똑같고(해시 비교), 평단·계획·설정 링크 흔적이 없으면 지울지 물어봄. 자동으로 지우지는 않음.
let OLDDEF = false;
(async () => {
  try {
    const c = loadCfg(); if (!c || c.src || Object.keys(c.sw).length || Object.keys(c.pos).length || !crypto.subtle) return;
    const s = [...c.h].sort().join(',') + '|' + [...c.os].sort().join(',');
    const hx = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hx === '211c38a951892619afecad16bee54ef17ea4daefa92adebe34722a86878819b0') { OLDDEF = true; if (DATA) render({ full: true }); }
  } catch {}
})();

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
function man(v, usd, forceMan) {
  if (v == null) return '–';
  if (usd) return '$' + fmt(v, v < 10 ? 3 : 2);
  if (v >= 100000 || forceMan) { const m = Math.round(v / 100) / 100; return m.toLocaleString('ko-KR', { minimumFractionDigits: Number.isInteger(m * 10) ? 1 : 2, maximumFractionDigits: 2 }) + '만'; }
  return fmt(v) + '원';
}
function range(a, b, usd) {   // a<=b
  if (a == null && b == null) return '–';
  if (a == null || b == null || a === b) return man(a ?? b, usd);
  const fm = Math.max(a, b) >= 100000;
  return `${man(Math.min(a, b), usd, fm)}~${man(Math.max(a, b), usd, fm)}`;
}
function gauge(price, L, W, usd, mine) {
  if (!L || price == null) return '<div class="meta" style="margin-top:8px">가격 범위: 일봉 데이터가 부족해 계산하지 않았어요.</div>';
  const [bt, bb, st, sb, stp] = L;   // 매수 위쪽, 매수 아래쪽, 손절선, 매도 아래쪽, 매도 위쪽
  const pts = [st, bb, bt, sb, stp, price].filter(v => v != null);
  const lo = Math.min(...pts) * 0.97, hi = Math.max(...pts) * 1.03;
  const x = v => ((v - lo) / (hi - lo) * 100);
  const seg = (a, b, c, tip) => a == null || b == null || b <= a ? '' : `<i data-tip="${esc(tip)}" title="${esc(tip)}" style="left:${x(a).toFixed(1)}%;width:${(x(b) - x(a)).toFixed(1)}%;background:${c}"></i>`;
  const buyLow = bb ?? st, sellHi = stp ?? hi;
  const dd = v => { const p = (v / price - 1) * 100; return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`; };
  const ddr = (a, b) => a == null || b == null || a === b ? dd(a ?? b) : `${dd(Math.min(a, b))}~${dd(Math.max(a, b))}`;
  const T = {
    stop: `손절 ${man(st, usd)} 아래 (현재가 대비 ${dd(st)})`,
    buf: `손절선~매수 구간 사이 ${range(st, bb, usd)}`,
    buy: `매수 구간 ${range(bb ?? st, bt, usd)} (현재가 대비 ${ddr(bb ?? st, bt)})`,
    wait: `기다리는 구간 ${range(bt, sb ?? hi, usd)}`,
    sell: sb != null ? `매도 구간 ${range(sb, stp ?? sb, usd)} (현재가 대비 ${ddr(sb, stp ?? sb)})` : '',
    now: `현재가 ${man(price, usd)}`
  };
  const bars = seg(lo, st, '#ef4444', T.stop) + (bb != null ? seg(st, bb, '#475569', T.buf) : '') + seg(bb ?? st, bt, '#3b82f6', T.buy)
    + seg(bt, sb ?? hi, '#64748b', T.wait) + seg(sb, sellHi, '#22c55e', T.sell);
  const mid = (a, b) => ((x(a) + x(b)) / 2).toFixed(1);
  const zl = [[mid(lo, st), '손절', 'r'], [mid(buyLow, bt), '매수', 'b']].concat(sb != null ? [[mid(sb, sellHi), '매도', 'g']] : [])
    .map((z, i, a) => { if (i) z[0] = Math.max(+z[0], +a[i - 1][0] + 13); z[0] = Math.min(Math.max(+z[0], 6), 94); return z; })
    .map(([p, n, c]) => { const tp = c === 'r' ? T.stop : c === 'b' ? T.buy : T.sell; return `<em class="z-${c}" data-tip="${esc(tp)}" title="${esc(tp)}" style="left:${p}%">${n}</em>`; }).join('');
  let state, sc;
  const nosup = W && W[0] && String(W[0]).startsWith('신저가');
  if (nosup) { state = '⚠️ 52주 신저가 · 아래 지지선 없음 (반등 확인 뒤 매수)'; sc = 'r'; }
  else if (price <= st) { state = '🚨 손절 주의 · 손절선 아래 (종가로 확인)'; sc = 'r'; }
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
    <div class="gwrap"><div class="mk" data-tip="${esc(T.now)}" title="${esc(T.now)}" style="left:${x(price).toFixed(1)}%"><span>${man(price, usd)}</span>▼</div>
      <div class="gbar">${bars}</div><div class="glab">${zl}</div></div>
    <div class="meta tiphint">구간에 손가락을 대거나 마우스를 올리면 가격이 보여요</div>
    <details><summary>구간 자세히 ${mine ? '(내가 정한 계획)' : '(일봉 지지·저항 자동 계산)'}</summary>${rows.join('')}
    <div class="meta">${mine ? '내가 정한 계획이 자동값보다 우선해요.' : esc(DATA.levels_rule || '')}</div></details>
  </div>`;
}

// ---------- 카드 ----------
function stockCard(code, opt = {}) {
  const c = cfg();
  const r = ALL[code] || (DATA.stocks_top || []).find(s => s.code === code);
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
    ${opt.tag ? `<div class="tags">${opt.tag}</div>` : ''}
    ${OPEN.has(id) ? detailHTML(id, r) : ''}
    ${pl}${gauge(r.p, L, c.sw[code] ? null : r.lw, false, !!c.sw[code])}
    ${actions(code, c)}
  </div>`;
}
function actions(code, c) {
  const inL = c.lists.filter(l => l.codes.includes(code)), inH = c.h.includes(code);
  const pe = OPEN.has('pos-' + code);
  return `<div class="acts">
    <button class="mini ${inL.length ? 'on2' : ''}" data-act="pick" data-code="${code}">${inL.length ? `★ ${esc(inL.length === 1 ? inL[0].name : '관심 ' + inL.length + '곳')}` : '☆ 관심 추가'}</button>
    <button class="mini" data-act="h" data-code="${code}">${inH ? esc(c.hName) + '에서 삭제' : '+ ' + esc(c.hName)}</button>
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

function osCard(o, c) {   // 해외·코인 카드 + 보유 추가/빼기 버튼
  return overseasCard(o, c).replace(/<\/div>$/, '') + `<div class="acts"><button class="mini" data-act="os" data-code="${esc(o.code)}">${c.os.includes(o.code) ? '− 보유에서 빼기' : '+ 보유'}</button></div></div>`;
}
// ---------- 앱 설치 · 친구에게 공유 ----------
const PLAIN_URL = 'https://dldnrwls0128-blip.github.io/money-flow/';   // 공유는 항상 이 주소만 (설정 링크 X)
const UA = navigator.userAgent || '';
const ENV = {
  ios: /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  android: /Android/i.test(UA),
  kakao: /KAKAOTALK/i.test(UA),
  inapp: /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|SamsungBrowser\/[\d.]+ .*CrossApp|; wv\)/i.test(UA),
  appName: /KAKAOTALK/i.test(UA) ? '카카오톡' : /NAVER\(inapp/i.test(UA) ? '네이버 앱' : /Instagram/i.test(UA) ? '인스타그램' : /FBAN|FBAV|FB_IAB/i.test(UA) ? '페이스북' : /Line\//i.test(UA) ? '라인' : /DaumApps/i.test(UA) ? '다음 앱' : '앱 안 브라우저',
  iosOther: /CriOS|FxiOS|EdgiOS|Whale/i.test(UA)
};
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let INSTALL_EVT = null, INSTALLED = false;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL_EVT = e; if (DATA && TAB === 'home') render({ full: true }); });
window.addEventListener('appinstalled', () => { INSTALLED = true; INSTALL_EVT = null; closeModal(); if (DATA) render({ full: true }); });
const showInstall = () => !isStandalone() && !INSTALLED;
function openExternalURL() {
  if (ENV.kakao && ENV.android) return 'intent://' + PLAIN_URL.replace(/^https:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
  if (ENV.kakao && ENV.ios) return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(PLAIN_URL);
  return '';
}
const SVG_SHARE = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const SVG_ADD = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const SVG_DOTS = '<svg viewBox="0 0 24 24" width="26" height="26" fill="#e2e8f0"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const step = (n, icon, html) => `<div class="step"><span class="sn">${n}</span><span class="si">${icon}</span><span>${html}</span></div>`;
function installSheet() {
  if (ENV.inapp) {
    const ext = openExternalURL(), br = ENV.ios ? '사파리' : '크롬', bro = ENV.ios ? '사파리로' : '크롬으로';
    return modal(`<b>📲 ${bro} 열어 주세요</b>
      <div class="meta" style="margin:6px 0 10px">${esc(ENV.appName)} 안에서는 앱 설치가 안 돼요. ${br}에서 열면 한 번에 설치할 수 있어요.</div>
      ${ext ? `<a class="bigbtn" id="openext" href="${esc(ext)}">${bro} 열기</a>` : ''}
      ${step(1, SVG_DOTS, `오른쪽 위(또는 아래) <b>⋮ / ⋯ 메뉴</b> 누르기`)}
      ${step(2, '🌐', `<b>다른 브라우저로 열기</b> (또는 ${bro} 열기) 고르기`)}
      ${step(3, '📲', `${br}에서 <b>📲 앱 설치</b> 누르기`)}
      <div class="mrow"><button class="mini" data-act="copylink">🔗 링크 복사</button><button class="mini" id="mcancel">닫기</button></div>`);
  }
  if (ENV.ios) {
    return modal(`<b>📲 아이폰에 설치하기</b>
      ${ENV.iosOther ? '<div class="meta" style="margin:6px 0">사파리에서 하는 게 가장 확실해요. (크롬도 iOS 16.4 이상이면 같은 방법으로 돼요)</div>' : ''}
      ${step(1, SVG_SHARE, `아래(또는 위) 막대의 <b>공유 버튼</b> 누르기`)}
      ${step(2, SVG_ADD, `목록을 올려서 <b>홈 화면에 추가</b> 누르기`)}
      ${step(3, '✅', `오른쪽 위 <b>추가</b> → 홈 화면에 <b>돈흐름</b> 아이콘이 생겨요`)}
      <div class="mrow"><button class="mini" id="mcancel">알겠어요</button></div>`);
  }
  return modal(`<b>📲 앱 설치</b>
    <div class="meta" style="margin:6px 0 10px">이미 설치했거나 브라우저가 바로 설치를 지원하지 않을 때는 이렇게 해 주세요.</div>
    ${step(1, SVG_DOTS, `크롬 오른쪽 위 <b>⋮ 메뉴</b> 누르기`)}
    ${step(2, SVG_ADD, `<b>앱 설치</b> 또는 <b>홈 화면에 추가</b> 누르기`)}
    ${step(3, '✅', `홈 화면에 <b>돈흐름</b> 아이콘이 생겨요`)}
    <div class="mrow"><button class="mini" id="mcancel">알겠어요</button></div>`);
}
async function doInstall() {
  if (INSTALL_EVT && !ENV.inapp) {
    const e = INSTALL_EVT; INSTALL_EVT = null;
    try { await e.prompt(); const r = await e.userChoice; if (r && r.outcome === 'accepted') { INSTALLED = true; } } catch {}
    render({ full: true }); return;
  }
  const m = installSheet(); const x = m.querySelector('#mcancel'); if (x) x.onclick = closeModal;
}
function flash(msg) { FLASH = msg; setUpdated(); setTimeout(() => { FLASH = ''; setUpdated(); }, 5000); }
async function copyLink() {
  try { await navigator.clipboard.writeText(PLAIN_URL); flash('🔗 링크를 복사했어요'); return true; } catch {}
  const ta = document.createElement('textarea'); ta.value = PLAIN_URL; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove();
  if (ok) flash('🔗 링크를 복사했어요'); else prompt('이 주소를 복사해서 보내 주세요', PLAIN_URL);
  return ok;
}
async function doShare() {
  const data = { title: '돈흐름', text: '돈이 어디로 몰리는지 한눈에 보는 앱 (참고용)', url: PLAIN_URL };
  if (navigator.share) { try { await navigator.share(data); return 'share'; } catch (e) { if (e && e.name === 'AbortError') return 'abort'; } }
  await copyLink(); return 'copy';
}
function installCard() {
  if (!showInstall() && !ENV.inapp) return '';
  if (localStorage.getItem('mf_insthide') === '1' && !ENV.inapp) return '';
  const msg = ENV.inapp ? `${esc(ENV.appName)} 안에서 열려 있어요. <b>${ENV.ios ? '사파리로' : '크롬으로'} 열면</b> 앱으로 설치할 수 있어요.`
    : '홈 화면에 설치하면 앱처럼 바로 열려요.';
  return `<div class="card instcard"><div>${msg}</div>
    <div class="mrow" style="justify-content:flex-start;margin-top:10px">
      <button class="bigbtn" data-act="install">📲 ${ENV.inapp ? (ENV.ios ? '사파리로' : '크롬으로') + ' 열기' : '앱 설치'}</button>
      <button class="bigbtn alt" data-act="share">📤 친구에게 공유</button></div>
    ${ENV.inapp ? '' : '<button class="linkbtn" data-act="hideinst">다음에 할게요</button>'}</div>`;
}
function shareHelpCard() {
  return `<h2>📲 설치 · 친구에게 알려주기</h2>
  <div class="card" style="text-align:center">
    <img src="icons/qr.png" alt="돈흐름 QR 코드" width="240" height="300" style="border-radius:16px;max-width:70%;height:auto">
    <div class="meta" style="margin:6px 0 10px">친구가 카메라로 찍으면 바로 열려요 · ${esc(PLAIN_URL)}</div>
    <div class="mrow" style="justify-content:center">
      ${showInstall() || ENV.inapp ? '<button class="bigbtn" data-act="install">📲 앱 설치</button>' : '<span class="meta">✅ 앱으로 실행 중이에요</span>'}
      <button class="bigbtn alt" data-act="share">📤 친구에게 공유</button></div>
    <div class="meta" style="margin-top:8px">공유하는 건 앱 주소뿐이에요. 내 종목·평단·계획은 이 폰에만 있고 같이 가지 않아요.</div></div>`;
}
// ---------- 화면 ----------
function viewHome() {
  const D = DATA, K = D.index.KOSPI, Kq = D.index.KOSDAQ;
  return installCard() + `<div class="card headline">${esc(D.headline)}</div>
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
const sortS = a => a.slice().sort((x, y) => ((ALL[y] || {}).s ?? -1) - ((ALL[x] || {}).s ?? -1));
function viewHold() {
  const c = cfg(); let h = '';
  if (OLDDEF) h += `<div class="card warnbox">이 목록은 예전 버전이 자동으로 넣은 <b>기본 예시 종목</b>일 수 있어요. 직접 고른 종목이 아니라면 지워 주세요.<div class="row" style="margin-top:10px;gap:8px;justify-content:flex-start"><button class="mini" data-act="wipe">🗑 내 종목 모두 지우기</button><button class="mini" data-act="keepmine">내가 고른 거예요</button></div></div>`;
  h += `<div class="tabhead"><h2>📌 ${esc(c.hName)} (${c.h.length})</h2><button class="mini" data-act="renh">✏️ 이름</button></div>`;
  h += c.h.length ? sortS(c.h).map(x => stockCard(x, { k: '-h' })).join('') : '<div class="card meta empty">아직 보유 종목이 없어요.<br>🔎 찾기에서 종목을 추가하세요.</div>';
  const os = (DATA.overseas || []).filter(o => c.os.includes(o.code));
  if (os.length) h += `<h2>🌎 해외·코인</h2>` + os.map(o => osCard(o, c)).join('');
  return h;
}
function curList(c) { const id = localStorage.getItem('mf_wtab'); return c.lists.find(l => l.id === id) || c.lists[0]; }
function viewWatch() {
  const c = cfg(), L = curList(c);
  const chips = c.lists.map(l => `<button class="chip ${l.id === L.id ? 'on' : ''}" data-act="wtab" data-id="${l.id}">${esc(l.name)} <span class="cnt">${l.codes.length}</span></button>`).join('')
    + `<button class="chip add" data-act="addtab">+ 탭 추가</button>`;
  return `<div class="chips" id="chips">${chips}</div>
    <div class="tabhead"><h2>⭐ ${esc(L.name)} (${L.codes.length})</h2>
      <span><button class="mini" data-act="rentab" data-id="${L.id}">✏️ 이름</button>${c.lists.length > 1 ? ` <button class="mini" data-act="deltab" data-id="${L.id}">🗑 삭제</button>` : ''}</span></div>
    <div class="meta hint">탭을 길게 누르면 이름을 바꿀 수 있어요</div>
    ${L.codes.length ? sortS(L.codes).map(x => stockCard(x, { k: '-w' + L.id })).join('') : `<div class="card meta empty">아직 '${esc(L.name)}'에 종목이 없어요.<br>🔎 찾기에서 종목을 추가하세요. (카드의 ☆ 관심 추가 → 탭 고르기)</div>`}`;
}
// ---------- 🎯 매수 탭: 점수 좋고 지금 매수 구간 ----------
const PREF_RE = /(\d?우[A-C]?|우선주)$|스팩|SPAC|ETN|리츠$/;
const BUY_MIN_TV = 30;   // 20일 평균 거래대금(억) 하한
function buyScan(th, hideLow) {
  const c = cfg(), mine = new Set([...c.h, ...c.lists.flatMap(l => l.codes)]);
  const inz = [], near = []; let n = 0;
  for (const [code, r] of Object.entries(ALL)) {
    if (r.s == null) continue;
    const my = mine.has(code);
    if (!my && (r.pf || PREF_RE.test(r.n) || (r.a20 ?? 0) < BUY_MIN_TV)) continue;
    n++;
    if (r.s < th) continue;
    const plan = !!c.sw[code];
    const L = plan ? [c.sw[code][0], c.sw[code][1], c.sw[code][4]] : r.l;
    if (!L || r.p == null) continue;
    const [bt, bb] = L, low = !plan && r.lw && String(r.lw[0] || '').startsWith('신저가');
    if (low && hideLow) continue;
    const it = { code, s: r.s, d: (r.p / bt - 1) * 100, low, my, plan };
    if (r.p <= bt * 1.01 && (bb == null || r.p >= bb)) inz.push(it);
    else if (r.p > bt * 1.01 && r.p <= bt * 1.03) near.push(it);
  }
  const so = (x, y) => y.s - x.s || Math.abs(x.d) - Math.abs(y.d);
  return { inz: inz.sort(so), near: near.sort(so), n };
}
function viewBuy() {
  const th = +(localStorage.getItem('mf_bth') || 6.5), hideLow = localStorage.getItem('mf_bhide') === '1';
  const { inz, near, n } = buyScan(th, hideLow);
  const chips = [6.0, 6.5, 7.0].map(v => `<button class="chip ${v === th ? 'on' : ''}" data-act="bth" data-v="${v}">${v.toFixed(1)}점+</button>`).join('')
    + `<button class="chip ${hideLow ? 'on' : ''}" data-act="bhide">신저가 숨기기</button>`;
  const card = it => stockCard(it.code, { k: '-b', tag: (it.low ? '<span class="tag t-low" data-tip="52주 신저가라 아래 지지선이 없어요. 현재가~−3%를 임시 매수 구간으로 둔 것이라 반등을 확인한 뒤 사는 게 안전해요">52주 신저가 · 반등 확인</span>' : '') + (it.plan ? '<span class="tag t-plan">내 계획 기준</span>' : '') + (it.my ? '<span class="tag t-my">내 종목</span>' : '') });
  return `<h2>🎯 점수 좋고 지금 매수 구간인 종목</h2>
    <div class="meta hint">점수 ${th.toFixed(1)}점 이상 · 현재가가 매수 구간 안 · 20일 평균 거래대금 ${BUY_MIN_TV}억 이상(우선주·스팩 제외) + 내 보유·관심 종목 · 검사 ${fmt(n)}종목 · 내 계획이 있으면 그 구간 기준</div>
    <div class="chips">${chips}</div>
    <h2>🔵 지금 매수 구간 (${inz.length})</h2>
    ${inz.length ? inz.map(card).join('') : '<div class="card meta">지금 조건에 맞는 종목이 없어요. 점수 기준을 낮춰 보세요.</div>'}
    <h2>⏳ 가까워지는 중 (${near.length})</h2>
    <div class="meta hint">매수 구간 위쪽보다 0~3% 위 · 조금 내려오면 매수 구간</div>
    ${near.length ? near.map(card).join('') : '<div class="card meta">해당 종목이 없어요.</div>'}
    <div class="meta hint">참고용이에요. 점수는 공개 시세로 계산한 근사치이고, 매수 구간은 일봉 지지선으로 자동 계산한 값이에요.</div>`;
}
// ---------- 간단한 창(이름 입력·탭 고르기) ----------
function modal(html) {
  closeModal();
  const m = document.createElement('div'); m.id = 'modal'; m.innerHTML = `<div class="mbox">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m); return m;
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
function askName(title, val, cb) {
  const m = modal(`<b>${esc(title)}</b><input id="mname" maxlength="12" value="${esc(val || '')}" placeholder="탭 이름 (최대 12자)">
    <div class="mrow"><button class="mini" id="mcancel">취소</button><button class="mini on" id="mok">확인</button></div>`);
  const inp = m.querySelector('#mname'); setTimeout(() => { inp.focus(); inp.select(); }, 50);
  const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } closeModal(); cb(v); };
  m.querySelector('#mok').onclick = ok; m.querySelector('#mcancel').onclick = closeModal;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) ok(); });
}
function newId() { return 'l' + Date.now().toString(36); }
function pickLists(code) {
  const c = cfg(), r = ALL[code] || {};
  const m = modal(`<b>${esc(r.n || code)} → 어느 관심 탭에 넣을까요?</b>
    <div class="plist">${c.lists.map(l => `<label class="pl"><input type="checkbox" data-id="${l.id}" ${l.codes.includes(code) ? 'checked' : ''}> ${esc(l.name)} <span class="meta">${l.codes.length}종목</span></label>`).join('')}</div>
    <button class="mini" id="pnew">+ 새 탭 만들어 넣기</button>
    <div class="mrow"><button class="mini" id="mcancel">취소</button><button class="mini on" id="mok">저장</button></div>`);
  m.querySelector('#mcancel').onclick = closeModal;
  m.querySelector('#mok').onclick = () => {
    const cc = cfg();
    m.querySelectorAll('input[type=checkbox]').forEach(b => { const l = cc.lists.find(x => x.id === b.dataset.id); if (!l) return;
      if (b.checked && !l.codes.includes(code)) l.codes.push(code); if (!b.checked) l.codes = l.codes.filter(x => x !== code); });
    saveCfg(cc); closeModal(); render({ full: true });
  };
  m.querySelector('#pnew').onclick = () => askName('새 관심 탭 이름', '', name => {
    const cc = cfg(); const l = { id: newId(), name, codes: [code] }; cc.lists.push(l); saveCfg(cc); render({ full: true });
  });
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
  const c = cfg();
  const os = (DATA.overseas || []).filter(o => o.code.toLowerCase().startsWith(q) || String(o.n).toLowerCase().startsWith(q) || String(o.full || '').toLowerCase().includes(q)).slice(0, 10)
    .map(o => osCard(o, c)).join('');
  return res.length || os ? res.map(([code]) => stockCard(code, { k: '-f' })).join('') + os : '<div class="card meta">찾는 종목이 없어요.</div>';
}
function viewFind() {
  return `<h2>🔎 종목 찾기</h2>
    <input id="q" class="search" type="search" enterkeyhint="search" placeholder="종목명 또는 코드 (예: 삼성전자, 005930, NVDA)" value="${esc(Q)}" autocomplete="off" autocorrect="off" spellcheck="false">
    <div class="meta hint">코스피·코스닥 ${fmt(Object.keys(ALL).length)}개 종목 · ETF 제외 · 해외·코인은 인기 종목 일부만 (예: NVDA, TSLA, BTC)</div>
    <div id="res">${findResults()}</div>`;
}

function viewHelp() {
  return `<div class="card"><b>앱 버전</b> v${esc(self.APP_VERSION)} · 배포 ${esc(self.APP_DATE)}
    <ul class="why">${(self.APP_CHANGES || []).map(([v, d, t]) => `<li><b>v${esc(v)}</b> (${esc(d)}) ${esc(t)}</li>`).join('')}</ul></div>
  ${shareHelpCard()}
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
    <li>모두 실제 일봉 고가·저가에서 뽑아요. 아래에서 직접 넣은 계획이 있으면 그것을 먼저 써요.</li>
    <li>가격 띠: 🔴 손절선 아래 · 🔵 매수 구간 · ⬜ 기다리는 구간 · 🟢 매도 구간. ▼가 지금 가격.</li>
    <li>사고팔 때는 반반: 매수 구간 위쪽에서 절반, 아래쪽에서 절반 · 매도 구간에 들어오면 절반, 위쪽에서 나머지.</li></ul></div>
  <div class="card"><b>목록 기준</b><ul class="why">
    <li>종목 Top 5: 시총 ${fmt(DATA.min_top_mcap_eok)}억 이상, 20일 평균 거래대금 ${DATA.min_top_tv_eok}억 이상</li>
    <li>업종 탑픽 3: 업종 안 20일 평균 거래대금 ${DATA.min_pick_tv_eok}억 이상, 우선주 제외, 점수 순</li>
    <li>업종 Top 5: 상위 종목 거래대금이 너무 작은 업종은 빼요</li></ul></div>
  <div class="card"><b>갱신</b><ul class="why"><li>평일 08:50~15:50 약 10분마다 시세·점수 갱신, 18:10쯤 전 종목 일별 데이터(수급·일봉) 갱신. GitHub 일정상 몇 분 늦을 수 있어요.</li>
    <li>앱은 1분마다 새 데이터를 확인해요. 초 단위 실시간 시세는 아니에요.</li></ul></div>
  <div class="card"><b>🎯 매수 탭</b><ul class="why"><li>점수가 기준(6.0/6.5/7.0점) 이상이고 현재가가 매수 구간 안에 있는 종목을 점수 높은 순으로 보여줘요.</li><li>전 종목 중 20일 평균 거래대금 30억 이상(우선주·스팩 제외) + 내 보유·관심 종목을 검사해요. 내 계획이 있으면 그 구간으로 판단해요.</li><li>"가까워지는 중"은 매수 구간 위쪽보다 0~3% 위에 있는 종목이에요.</li><li>"52주 신저가" 표시는 아래 지지선이 없어 임시 구간이라 반등 확인 뒤 사는 게 안전해요.</li></ul></div>
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
      <label><span class="meta">새 계획 종목 코드 (6자리)</span><input id="plan-new" inputmode="numeric" maxlength="6" placeholder="예: 005930"></label>
      <div class="pgrid">${F.map(([n, i]) => `<label><span class="meta">${n}</span><input inputmode="numeric" data-i="${i}"></label>`).join('')}</div></div>
    <button class="btn" data-act="plansave">계획 저장</button>`;
}

function navLabels() {
  const c = cfg(); const b = document.querySelector('nav [data-tab=hold]');
  if (b) b.title = c.hName;
}
function render(opts = {}) {
  if (!DATA) return;
  navLabels();
  const ae = document.activeElement;
  if (TAB === 'find' && ae && ae.id === 'q' && !opts.full) {   // 입력 중에는 검색창을 다시 그리지 않음
    const r = $('#res'); if (r) r.innerHTML = findResults(); setUpdated(); return;
  }
  setUpdated();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === TAB));
  const y = window.scrollY;
  if (TAB === 'mine') TAB = 'hold';
  app.innerHTML = (TAB === 'home' ? viewHome() : TAB === 'hold' ? viewHold() : TAB === 'watch' ? viewWatch() : TAB === 'buy' ? viewBuy() : TAB === 'find' ? viewFind() : viewHelp())
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
  if (t.dataset.act === 'pick') { pickLists(code); return; }
  if (t.dataset.act === 'install') { doInstall(); return; }
  if (t.dataset.act === 'share') { doShare(); return; }
  if (t.dataset.act === 'copylink') { copyLink(); return; }
  if (t.dataset.act === 'hideinst') { localStorage.setItem('mf_insthide', '1'); render({ full: true }); return; }
  if (t.dataset.act === 'bth') { localStorage.setItem('mf_bth', t.dataset.v); render({ full: true }); return; }
  if (t.dataset.act === 'bhide') { localStorage.setItem('mf_bhide', localStorage.getItem('mf_bhide') === '1' ? '0' : '1'); render({ full: true }); return; }
  if (t.dataset.act === 'wtab') { localStorage.setItem('mf_wtab', t.dataset.id); render({ full: true }); return; }
  if (t.dataset.act === 'addtab') { askName('새 관심 탭 이름', '', name => { const cc = cfg(); const l = { id: newId(), name, codes: [] }; cc.lists.push(l); saveCfg(cc); localStorage.setItem('mf_wtab', l.id); render({ full: true }); }); return; }
  if (t.dataset.act === 'rentab') { const l = c.lists.find(x => x.id === t.dataset.id); askName('탭 이름 바꾸기', l.name, name => { const cc = cfg(); cc.lists.find(x => x.id === l.id).name = name; saveCfg(cc); render({ full: true }); }); return; }
  if (t.dataset.act === 'renh') { askName('보유 탭 이름 바꾸기', c.hName, name => { const cc = cfg(); cc.hName = name; saveCfg(cc); render({ full: true }); }); return; }
  if (t.dataset.act === 'deltab') { const l = c.lists.find(x => x.id === t.dataset.id); if (c.lists.length < 2 || !confirm(`'${l.name}' 탭을 삭제할까요? (안의 ${l.codes.length}종목 목록도 지워져요)`)) return;
    c.lists = c.lists.filter(x => x.id !== l.id); saveCfg(c); localStorage.removeItem('mf_wtab'); render({ full: true }); return; }
  if (t.dataset.act === 'os') { c.os = c.os.includes(code) ? c.os.filter(x => x !== code) : [...c.os, code]; saveCfg(c); render({ full: true }); return; }
  if (t.dataset.act === 'wipe') { if (!confirm('보유·관심 종목, 평단, 계획을 이 폰에서 모두 지울까요?')) return; localStorage.removeItem('mf_cfg'); localStorage.removeItem('mf_wtab'); OLDDEF = false; render({ full: true }); return; }
  if (t.dataset.act === 'keepmine') { c.src = 'user-ok'; saveCfg(c); OLDDEF = false; render({ full: true }); return; }
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
// ---------- 관심 탭 길게 누르기 → 이름 바꾸기 ----------
let lpT = null, lpFired = false, lpXY = [0, 0];
document.addEventListener('pointerdown', e => {
  const ch = e.target.closest('.chip[data-id]'); if (!ch) return; lpFired = false; lpXY = [e.clientX, e.clientY];
  lpT = setTimeout(() => { lpFired = true; const c = cfg(); const l = c.lists.find(x => x.id === ch.dataset.id);
    if (l) askName('탭 이름 바꾸기', l.name, name => { const cc = cfg(); cc.lists.find(x => x.id === l.id).name = name; saveCfg(cc); render({ full: true }); }); }, 600);
});
['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'pointermove' && Math.abs(e.clientX - lpXY[0]) + Math.abs(e.clientY - lpXY[1]) < 10) return; if (ev === 'pointerleave' && e.target !== document) return; clearTimeout(lpT); }));
document.addEventListener('click', e => { if (lpFired && !e.target.closest('.mbox')) { e.stopPropagation(); e.preventDefault(); lpFired = false; } }, true);
document.addEventListener('contextmenu', e => { if (e.target.closest('.chip')) e.preventDefault(); });

// ---------- 가격 띠 말풍선 (PC: 마우스 올리기 · 폰: 누르기) ----------
const TIP = document.createElement('div'); TIP.id = 'tip'; TIP.hidden = true; document.body.appendChild(TIP);
let tipEl = null;
function showTip(el, cx) {
  const t = el.dataset.tip; if (!t) return;
  tipEl = el; TIP.textContent = t; TIP.style.left = '0px'; TIP.style.top = '0px'; TIP.hidden = false;
  const r = el.getBoundingClientRect();
  const x0 = cx != null ? cx : r.left + r.width / 2;
  const w = TIP.getBoundingClientRect().width, h = TIP.offsetHeight, vw = Math.min(document.documentElement.clientWidth, window.innerWidth);
  let left = Math.max(8, Math.min(x0 - w / 2, vw - w - 10));
  let top = r.top - h - 10; if (top < 70) top = r.bottom + 10;
  TIP.style.left = left + 'px'; TIP.style.top = (top + window.scrollY) + 'px';
}
function hideTip() { TIP.hidden = true; tipEl = null; }
document.addEventListener('mouseover', e => { if (e.pointerType === 'touch') return; const el = e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX); });
document.addEventListener('mousemove', e => { const el = e.target.closest('[data-tip]'); if (el && el === tipEl && !TIP.dataset.pinned) showTip(el, e.clientX); });
document.addEventListener('mouseout', e => { const el = e.target.closest('[data-tip]'); if (el && !TIP.dataset.pinned && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-tip]');
  if (el) { e.preventDefault(); if (tipEl === el && TIP.dataset.pinned) { delete TIP.dataset.pinned; hideTip(); } else { showTip(el, e.clientX); TIP.dataset.pinned = '1'; } return; }
  if (!e.target.closest('#tip')) { delete TIP.dataset.pinned; hideTip(); }
}, true);
window.addEventListener('scroll', () => { if (!TIP.hidden) { delete TIP.dataset.pinned; hideTip(); } }, { passive: true });

// ---------- 버전 표시 · 새 버전 안내 ----------
// 예전 버전 화면(index.html)이 남아 있어도 멈추지 않도록 필요한 요소를 직접 만든다
const NAV = [['home', '🏠', '홈'], ['buy', '🎯', '매수'], ['hold', '📌', '보유'], ['watch', '⭐', '관심'], ['find', '🔎', '찾기'], ['help', '❓', '도움말']]
  .map(([t, i, n], k) => `<button data-tab="${t}"${k ? '' : ' class="on"'}><i>${i}</i><span>${n}</span></button>`).join('');
(function ensureShell() {
  const h1 = document.querySelector('header h1');
  if (h1 && !$('#ver')) { const s = document.createElement('span'); s.id = 'ver'; s.className = 'ver'; h1.append(' ', s); }
  const hd = document.querySelector('header');
  if (hd && !$('#newver')) { const d = document.createElement('div'); d.id = 'newver'; d.className = 'newver'; d.hidden = true; d.innerHTML = '🆕 새 버전이 있어요 · <b>눌러서 새로고침</b>'; hd.append(d); }
  if (hd && !document.querySelector('header nav')) {
    const n = document.createElement('nav');
    n.innerHTML = NAV;
    hd.insertBefore(n, $('#newver'));
  }
  const nv = document.querySelector('header nav'); if (nv && !nv.querySelector('[data-tab=buy]')) nv.innerHTML = NAV;
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
