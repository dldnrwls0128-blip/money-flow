'use strict';
const $ = s => document.querySelector(s);
const app = $('#app');
let DATA = null, ALL = {}, ALL_UPD = null, TAB = 'lead', Q = '';
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
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = d => d ? `${+d.slice(4, 6)}/${+d.slice(6, 8)}` : '–';
const kst = iso => iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '–';
function money(v, usd) { if (v == null) return '–'; return usd ? '$' + fmt(v, v < 10 ? 3 : 2) : fmt(v) + '원'; }

// ---------- 주도주 점수 (하나의 기준) ----------
const SC_ITEMS = [['업종 주도 지속', 3], ['52주 고점 근접', 2], ['20일선 위', 1], ['업종 안 상위 3', 2], ['시장 폭', 1], ['유동성·과열 아님', 1]];   // leaders.json scores.it 와 같은 순서
const SC_COL = ['#3182f6', '#2fca73', '#a78bfa', '#14b8a6', '#f2b705', '#ff7a59'];
const lvl = s => s == null ? 'n' : s >= 8.5 ? 'g' : s >= 6 ? 'y' : 'r';
const lbl = s => s == null ? '점수 없음' : s >= 8.5 ? '주도주' : s >= 6 ? '근접' : '약함';
const COLOR = { g: '#22c55e', y: '#eab308', r: '#ef4444', n: '#475569' };
const scOf = code => (LEAD && LEAD.scores || {})[code] || null;
function sigOf(code) {   // 단 하나의 매수 신호: 시장 폭 45%↑ · 2주 연속 상위 3 업종 · 업종 안 상위 3 · 20일선 위 · 52주 고점 10% 안 · 제외 종목 아님
  const s = scOf(code);
  if (!LEAD) return { k: 'n', t: '데이터 불러오는 중' };
  if (!s) return { k: 'n', t: '점수 없음', why: '20일 평균 거래대금 10억 미만이거나 우선주·스팩·리츠, 또는 상장 140거래일 미만이라 계산 대상이 아니에요.' };
  if (s.f) return { k: 'r', t: '제외 (관리종목·거래정지)', why: '조건에 맞아도 관리종목·거래정지 종목은 사지 않아요.' };
  const nx = LEAD.check ? d8(LEAD.check.next) : '다음 점검일';
  if (s.p && LEAD.on) return { k: 'g', t: '매수 신호 (5칸 안)', why: `규칙 조건을 모두 채운 5종목 안이에요. 점검일(격주 수요일) 장 마감 기준이면 다음날 시가에 투자금의 1/5. 다음 점검 ${nx}.` };
  if (s.p) return { k: 'y', t: '후보 (시장 폭 대기)', why: `종목 조건은 채웠지만 시장 폭이 ${LEAD.breadth.pct}%로 45% 미만이라 지금은 매수 아님. 다음 점검 ${nx}.` };
  return { k: 'r', t: '매수 신호 아님', why: missing(s).join(' · ') };
}
function missing(s) {
  const m = [];
  if (!LEAD.on) m.push('시장 폭 45% 미만');
  if (s.it[0] < 3) m.push(s.it[0] === 1.5 ? '업종이 이번 주 처음 상위 3 (한 주 더 필요)' : '업종이 상위 3 아님');
  if (s.it[2] < 1) m.push('20일선 아래');
  if (s.h < -10) m.push('52주 고점에서 10% 넘게 떨어짐');
  if (!s.k) m.push('20일 평균 거래대금 30억 미만');
  else if (!s.rk && s.it[2] && s.h >= -10) m.push('업종 안 고점에 더 가까운 종목이 3개 넘음');
  if (!m.length && s.rk) m.push(`업종 안 ${s.rk}위 — 5칸이 앞 순위(업종마다 1등 먼저) 종목으로 이미 참`);
  return m.length ? m : ['5칸 안에 못 듦'];
}
function itemWhy(s, i) {
  const secTxt = s.sp ? `이번 주 업종 순위 ${s.sp}위` : '업종 순위 없음 (5종목 미만 업종)';
  return [
    s.it[0] === 3 ? `${secTxt}, 지난주 점검일에도 상위 3 → 2주 연속 주도 업종` : s.it[0] === 1.5 ? `${secTxt} — 이번 주 처음 상위 3, 한 주 더 필요` : s.it[0] === 0.5 ? `${secTxt} — 상위 3 바로 밖(4~6위)` : `${secTxt} — 주도 업종 아님`,
    `52주 고점 대비 ${s.h > 0 ? '+' : ''}${s.h}% (5% 안 2점 · 10% 안 1점)`,
    `종가 ${fmt(s.c)}원 · 20일 평균선 ${fmt(s.m20)}원 → ${s.c > s.m20 ? '위' : '아래'}`,
    s.rk ? `업종 안에서 20일선 위·고점 10% 안 종목 중 고점에 가까운 순서 ${s.rk}위${s.rk <= 3 ? '' : ' (3위 밖)'}` : '업종 안 상위 3 조건 밖 (20일선·고점·거래대금 조건 중 하나 미달)',
    `시장 폭 ${LEAD.breadth.pct}% (45% 이상이면 1점, 모든 종목 같음)`,
    `20일 평균 거래대금 ${fmt(s.tv)}억 (30억↑ 0.5점) · 20일선보다 ${((s.c / s.m20 - 1) * 100).toFixed(0)}% 위 (25% 이내 0.5점)`][i];
}
function scoreDetail(code) {
  const s = scOf(code); if (!s) return '';
  const rows = SC_ITEMS.map(([n, mx], i) => `<div class="wrow"><div class="row"><b><span class="dot" style="background:${SC_COL[i]}"></span>${n}</b><b>${s.it[i]} <span class="meta">/ ${mx}</span></b></div>
    <div class="wbar"><i style="width:${s.it[i] / mx * 100}%;background:${SC_COL[i]}"></i></div><div class="meta">${itemWhy(s, i)}</div></div>`).join('');
  return `<div class="detail">${rows}<div class="meta">점수·신호: ${d8(LEAD.asof)} 장 마감 기준 · <a href="#" data-act="method">점수 기준·과거 검증 보기</a></div></div>`;
}
const STOP_R = 0.20, TP_R = 0.30;
function holdAdvice(code, r) {   // 보유 종목: −20% 종가 손절 · +30% 절반 익절 · 유지 조건(업종 상위 5·업종 안 6위·고점 15% 안) · 시장 폭
  const c = cfg(); if (!c.h.includes(code)) return '';
  const pos = c.pos[code], s = scOf(code), out = [];
  const stop = pos && pos.a ? Math.round(pos.a * (1 - STOP_R)) : null, tp = pos && pos.a ? Math.round(pos.a * (1 + TP_R)) : null;
  const nx = LEAD && LEAD.check ? d8(LEAD.check.next) : '다음 점검일';
  if (stop && r.p != null && r.p <= stop) out.push(['r', `손절: 지금 가격이 손절선 ${fmt(stop)}원(평단 −20%) 아래예요. 오늘 종가도 아래면 다음 날 시가에 전부 매도.`]);
  else if (tp && r.p != null && r.p >= tp && !pos.half) out.push(['y', `절반 익절: 지금 가격이 +30% 선 ${fmt(tp)}원 위예요. 오늘 종가도 위면 다음 날 시가에 절반 매도, 나머지는 유지 조건이 깨질 때까지.`]);
  if (!out.length || out[0][0] === 'y') {
    if (LEAD && !LEAD.on) out.push(['r', `시장 폭 ${LEAD.breadth.pct}% (45% 미만): 점검일(${nx}) 장 마감에도 45% 미만이면 다음날 시가에 전부 현금.`]);
    else if (LEAD && s && (s.keep || s.p)) out.push(['g', `보유 유지: 유지 조건 안 (업종 ${s.sp || '–'}위 · 업종 안 ${s.kr || s.rk || '–'}위 · 고점 ${s.h}%). 다음 점검 ${nx}.`]);
    else if (LEAD) out.push(['r', `교체 예정: 유지 조건(업종 상위 5 · 업종 안 6위 · 52주 고점 15% 안)에서 벗어났어요. 점검일(${nx}) 장 마감에도 그대로면 다음날 시가에 매도.`]);
  }
  const line = stop ? `<span class="meta"> · 손절선 ${fmt(stop)}원 (평단×0.80) · +30% 선 ${fmt(tp)}원 (평단×1.30) · 둘 다 종가로 확인</span>
    <div class="row" style="margin-top:6px;justify-content:flex-start;gap:8px"><button class="mini${pos.half ? ' on' : ''}" data-act="half" data-code="${code}">${pos.half ? '✓ 절반 익절함' : '절반 익절함 표시'}</button><span class="meta">이 폰에만 저장</span></div>` : '<span class="meta"> · 평단을 넣으면 손절선(−20%)과 +30% 절반 익절 선을 계산해요</span>';
  return out.map(([k, t], i) => `<div class="hadv s-${k}">${t}${i === out.length - 1 ? line : ''}</div>`).join('');
}
// ---------- 점수 밑 상세 펼치기/접기 (종목별로 기억) ----------
let FOLD = {}; try { FOLD = JSON.parse(localStorage.getItem('mf_fold') || '{}') || {}; } catch {}
const isOpen = code => !!FOLD[code];
function setFold(code, open) { if (open) FOLD[code] = 1; else delete FOLD[code]; try { localStorage.setItem('mf_fold', JSON.stringify(FOLD)); } catch {} }
function foldBlock(code, head, detail) {
  const open = isOpen(code);
  return `<div class="fold${open ? ' open' : ''}" data-code="${code}">
    <button class="fhead" data-fold="${code}" aria-expanded="${open}">${head}<span class="ftog">${open ? '접기 ▴' : '점수 구성 ▾'}</span></button>
    <div class="fbody"><div class="finner">${detail}</div></div></div>`;
}
function foldAllBar() {
  return `<div class="foldall"><button class="linkbtn" data-foldall="1">모두 펼치기</button><button class="linkbtn" data-foldall="0">모두 접기</button></div>`;
}
function stockCard(code, opt = {}) {
  const c = cfg();
  const r = ALL[code];
  if (!r) return `<div class="card"><div class="name">${esc(code)}</div><div class="meta">시세를 찾지 못했어요 (상장폐지·코드 확인)</div>${actions(code, c)}</div>`;
  const pos = c.pos[code];
  let pl = '';
  if (pos && pos.a && r.p) {
    const rr = (r.p / pos.a - 1) * 100;
    pl = `<div class="pl ${cls(rr)}">내 수익률 ${pct(rr)}${pos.q ? ` · 평가손익 ${(r.p - pos.a) * pos.q >= 0 ? '+' : '−'}${fmt(Math.abs((r.p - pos.a) * pos.q))}원` : ''}<span class="meta"> (평단 ${fmt(pos.a)}원${pos.q ? ' · ' + fmt(pos.q) + '주' : ''})</span></div>`;
  }
  const s = scOf(code), t = s ? s.t : null, L_ = lvl(t), sg = sigOf(code);
  const head = `<span class="fstate s-${sg.k}">${sg.t}</span>`;
  const why = sg.why ? `<div class="whyline">${esc(sg.why)}</div>` : '';
  return `<div class="card">
    <div class="row"><div><div class="name nm tap" data-act="info" data-code="${code}">${logo(code, r.n)}<span>${esc(r.n)} <span class="meta">${code}</span> <span class="ibtn">ⓘ</span></span></div>
      <div class="meta">${money(r.p)} <span class="${cls(r.c)}">${pct(r.c)}</span>${r.sec ? ' · ' + esc(r.sec) : ''}</div></div>
      <button class="sbtn c-${L_}" data-fold="${code}" aria-label="점수 구성 펼치기"><span class="score">${t ?? '–'}</span><span class="badge b-${L_}">${lbl(t)}</span><span class="winfo" data-act="method">ⓘ 점수 기준</span></button></div>
    <div class="bar"><i style="width:${(t || 0) * 10}%;background:${COLOR[L_]}"></i></div>
    ${opt.tag ? `<div class="tags">${opt.tag}</div>` : ''}
    ${pl}${holdAdvice(code, r)}${s ? foldBlock(code, head, why + scoreDetail(code)) : `<div class="fold"><div class="fhead">${head}</div></div>${why}`}
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
function overseasCard(o, c) {
  return `<div class="card"><div class="row"><div><div class="name nm tap" data-act="info" data-code="${esc(o.code)}">${logo(o.code, o.n)}<span>${esc(o.n)} <span class="ibtn">ⓘ</span></span></div><div class="meta">${esc(o.full || '')}${o.at ? ' · ' + kst(o.at) + ' 기준' : ''}</div>
    <span class="badge b-n">해외·코인 · 주도주 점수 대상 아님</span></div>
    <div style="text-align:right"><div class="name">${money(o.p, true)}</div><div class="${cls(o.c)}">${pct(o.c)}</div>${o.krw ? `<div class="meta">${fmt(o.krw, 1)}원</div>` : ''}</div></div></div>`;
}

function osCard(o, c) {   // 해외·코인 카드 + 보유 추가/빼기 버튼
  return overseasCard(o, c).replace(/<\/div>$/, '') + `<div class="acts"><button class="mini" data-act="os" data-code="${esc(o.code)}">${c.os.includes(o.code) ? '− 보유에서 빼기' : '+ 보유'}</button></div></div>`;
}
// ---------- 실적 그래프 (SVG) ----------
let FINMODE = 'a';
const jos = v => v == null ? '–' : Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1)}조` : `${fmt(v)}억`;   // 막대 위 짧은 표기
const pLab = (k, q) => q ? `${k.slice(2, 4)}.${Math.ceil(+k.slice(4, 6) / 3)}Q` : `${k.slice(0, 4)}`;
function yoyTxt(v, v0) {
  if (v == null || v0 == null) return null;
  if (v0 <= 0 && v > 0) return ['흑전', 'up']; if (v0 > 0 && v <= 0) return ['적전', 'dn']; if (v0 <= 0 && v <= 0) return ['적지', 'dn'];
  const p = (v / v0 - 1) * 100; return [`${p > 0 ? '+' : ''}${Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1)}%`, p > 0 ? 'up' : p < 0 ? 'dn' : ''];
}
// 한 지표(매출/영업이익/순이익)의 막대그래프. S: 시리즈, key: 'r'|'o'|'n'
function barChart(S, key, title, q, extra) {
  const vals = S[key], n = S.k.length, lag = q ? 4 : 1;
  if (!vals || vals.every(v => v == null)) return `<div class="chart"><div class="ct">${title}</div><div class="meta">자료 없음</div></div>`;
  const W = 340, H = 150, top = 22, bot = 34, ih = H - top - bot;
  const mx = Math.max(0, ...vals.filter(v => v != null)), mn = Math.min(0, ...vals.filter(v => v != null));
  const span = (mx - mn) || 1, y = v => top + (mx - v) / span * ih, y0 = y(0);
  const bw = Math.min(46, W / n * 0.56), gap = W / n;
  let s = `<line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="#475569" stroke-width="1"/>`;
  vals.forEach((v, i) => {
    const cx = gap * i + gap / 2, est = S.e[i], lab = pLab(S.k[i], q) + (est ? '(E)' : '');
    if (v != null) {
      const yy = Math.min(y(v), y0), hh = Math.max(1.5, Math.abs(y(v) - y0)), neg = v < 0;
      const col = neg ? '#3b82f6' : key === 'r' ? '#22c55e' : key === 'o' ? '#eab308' : '#a78bfa';
      const yo = i >= lag ? yoyTxt(v, vals[i - lag]) : null;
      const mg = key === 'o' && S.r[i] ? ` · 영업이익률 ${(v / S.r[i] * 100).toFixed(1)}%` : '';
      const tip = `${title} ${lab}: ${jo(v)}${yo ? ` (${q ? '전년 같은 분기' : '전년'} 대비 ${yo[0]})` : ''}${mg}${est ? ' · 증권사 추정치' : ''}`;
      s += `<rect data-tip="${esc(tip)}" x="${cx - bw / 2}" y="${yy}" width="${bw}" height="${hh}" rx="3" fill="${col}" fill-opacity="${est ? .28 : .9}" ${est ? `stroke="${col}" stroke-dasharray="4 3" stroke-width="1.5"` : ''}/>`;
      s += `<text x="${cx}" y="${neg ? yy + hh + 12 : yy - 5}" class="bv">${jos(v)}</text>`;
      if (yo) s += `<text x="${cx}" y="${H - 4}" class="by ${yo[1]}">${yo[0]}</text>`;
    }
    s += `<text x="${cx}" y="${H - 18}" class="bl${est ? ' est' : ''}">${lab}</text>`;
  });
  return `<div class="chart"><div class="ct">${title}${extra || ''}</div><svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${s}</svg></div>`;
}
function marginRow(S, q) {
  const m = S.k.map((k, i) => S.o[i] != null && S.r[i] ? `<span class="${S.e[i] ? 'est' : ''}">${pLab(k, q)} <b>${(S.o[i] / S.r[i] * 100).toFixed(1)}%</b></span>` : '').filter(Boolean);
  return m.length ? `<div class="mrg"><span class="meta">영업이익률</span> ${m.join('')}</div>` : '';
}
function finCharts(x) {
  const S = FINMODE === 'q' ? x.fq : x.fa, q = FINMODE === 'q';
  const tabs = `<div class="chips fin-tabs"><button class="chip ${!q ? 'on' : ''}" data-fin="a">연간</button><button class="chip ${q ? 'on' : ''}" data-fin="q">분기</button></div>`;
  if (!S) return tabs + '<div class="meta">실적 자료가 없어요.</div>';
  return tabs + barChart(S, 'r', '매출액', q) + barChart(S, 'o', '영업이익', q) + marginRow(S, q) + barChart(S, 'n', '순이익', q)
    + `<div class="meta">아래 % = ${q ? '전년 같은 분기' : '전년'} 대비 · 흐린 점선 막대(E) = 증권사 추정치 · 막대를 누르면 금액이 보여요 · 음수는 파란색</div>`;
}
// ---------- 두 종목 실적 비교 ----------
let CMP = null;   // [codeA, codeB]
function compareChart(SA, SB, key, title, q, nA, nB) {
  const keys = [...new Set([...(SA ? SA.k : []), ...(SB ? SB.k : [])])].sort();
  const val = (S, k) => { if (!S) return null; const i = S.k.indexOf(k); return i < 0 ? null : S[key][i]; };
  const est = (S, k) => { if (!S) return 0; const i = S.k.indexOf(k); return i < 0 ? 0 : S.e[i]; };
  const all = keys.flatMap(k => [val(SA, k), val(SB, k)]).filter(v => v != null);
  if (!all.length) return '';
  const W = 340, H = 150, top = 20, bot = 22, ih = H - top - bot, mx = Math.max(0, ...all), mn = Math.min(0, ...all), span = (mx - mn) || 1;
  const y = v => top + (mx - v) / span * ih, y0 = y(0), gap = W / keys.length, bw = Math.min(22, gap * 0.34);
  let s = `<line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="#475569"/>`;
  keys.forEach((k, i) => {
    const cx = gap * i + gap / 2;
    [[SA, nA, '#3b82f6', -1], [SB, nB, '#f97316', 1]].forEach(([S, nm, col, side]) => {
      const v = val(S, k); if (v == null) return; const e = est(S, k);
      const yy = Math.min(y(v), y0), hh = Math.max(1.5, Math.abs(y(v) - y0)), x0 = cx + side * (bw / 2 + 1) - bw / 2;
      s += `<rect data-tip="${esc(`${nm} ${title} ${pLab(k, q)}${e ? '(E)' : ''}: ${jo(v)}`)}" x="${x0}" y="${yy}" width="${bw}" height="${hh}" rx="2" fill="${v < 0 ? '#60a5fa' : col}" fill-opacity="${e ? .3 : .92}" ${e ? `stroke="${col}" stroke-dasharray="3 2"` : ''}/>`;
    });
    s += `<text x="${cx}" y="${H - 6}" class="bl">${pLab(k, q)}${est(SA, k) || est(SB, k) ? '(E)' : ''}</text>`;
  });
  return `<div class="chart"><div class="ct">${title}</div><svg viewBox="0 0 ${W} ${H}" width="100%">${s}</svg></div>`;
}
async function openCompare(a, b) {
  const I = await loadInfo(); const A_ = (I.s || {})[a], B_ = (I.s || {})[b]; const q = FINMODE === 'q';
  const nA = (ALL[a] || {}).n || a, nB = (ALL[b] || {}).n || b;
  const SA = A_ && (q ? A_.fq : A_.fa), SB = B_ && (q ? B_.fq : B_.fa);
  const last = (S, k) => { if (!S) return null; for (let i = S.k.length - 1; i >= 0; i--) if (!S.e[i] && S[k][i] != null) return [S[k][i], S.k[i]]; return null; };
  const row = (lbl, f) => `<tr><td>${lbl}</td><td>${f(A_, SA)}</td><td>${f(B_, SB)}</td></tr>`;
  const m = modal(`<div class="sheet-h"><b>⚖️ 실적 비교</b><button class="mini" id="mcancel">닫기</button></div>
    <div class="legend"><span><i style="background:#3b82f6"></i>${esc(nA)}</span><span><i style="background:#f97316"></i>${esc(nB)}</span></div>
    <div class="chips fin-tabs"><button class="chip ${!q ? 'on' : ''}" data-fin="a" data-cmp="1">연간</button><button class="chip ${q ? 'on' : ''}" data-fin="q" data-cmp="1">분기</button></div>
    ${SA || SB ? compareChart(SA, SB, 'r', '매출액', q, nA, nB) + compareChart(SA, SB, 'o', '영업이익', q, nA, nB) : '<div class="meta">두 종목 모두 실적 자료가 없어요.</div>'}
    <table class="cmpt"><tr><th></th><th>${esc(nA)}</th><th>${esc(nB)}</th></tr>
      ${row('시가총액', x => x ? esc(x.mc) : '–')}
      ${row('최근 매출', (x, S) => { const l = last(S, 'r'); return l ? jo(l[0]) : '–'; })}
      ${row('최근 영업이익', (x, S) => { const l = last(S, 'o'); return l ? jo(l[0]) : '–'; })}
      ${row('영업이익률', (x, S) => { const r = last(S, 'r'), o = last(S, 'o'); return r && o && r[0] ? (o[0] / r[0] * 100).toFixed(1) + '%' : '–'; })}
      ${row('PER', x => x ? esc(x.per) : '–')}${row('PBR', x => x ? esc(x.pbr) : '–')}</table>
    <div class="meta">${q ? '분기' : '연간'} 확정치 기준 · 흐린 점선(E) = 추정치 · 자료: 네이버 증권</div>
    <div class="mrow"><button class="mini" data-act="info" data-code="${esc(a)}">← ${esc(nA)} 정보로</button></div>`);
  m.classList.add('sheet'); m.querySelector('#mcancel').onclick = closeModal; CMP = [a, b];
}
function pickCompare(a) {
  const I = INFO || { s: {} };
  const m = modal(`<div class="sheet-h"><b>⚖️ 비교할 종목 고르기</b><button class="mini" id="mcancel">닫기</button></div>
    <input id="cmpq" class="search" type="search" placeholder="종목명 또는 코드" autocomplete="off"><div id="cmpres" class="plist"></div>
    <div class="meta">종목정보가 있는 ${fmt(Object.keys(I.s).length)}개 종목 중에서 고를 수 있어요</div>`);
  m.classList.add('sheet'); m.querySelector('#mcancel').onclick = closeModal;
  const inp = m.querySelector('#cmpq'), res = m.querySelector('#cmpres');
  const sec = (ALL[a] || {}).sec;
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    let list = Object.keys(I.s).filter(c => c !== a && ALL[c]);
    list = q ? list.filter(c => c.startsWith(q) || ALL[c].n.toLowerCase().includes(q)) : list.filter(c => ALL[c].sec === sec);   // 처음엔 같은 업종
    list.sort((x, y) => (ALL[y].f?.tv || 0) - (ALL[x].f?.tv || 0));
    res.innerHTML = (q ? '' : `<div class="meta">같은 업종 (${esc(sec || '–')})</div>`) + (list.slice(0, 12).map(c => `<button class="pickrow" data-act="cmpgo" data-a="${esc(a)}" data-code="${c}">${logo(c, ALL[c].n)}<span>${esc(ALL[c].n)} <span class="meta">${c}</span></span></button>`).join('') || '<div class="meta">없어요</div>');
  };
  inp.addEventListener('input', draw); draw();
}
// ---------- 종목정보 (info.json, 처음 열 때 한 번 받음) ----------
let INFO = null, INFO_AT = 0, INFO_CUR = null;
async function loadInfo() {
  if (INFO && Date.now() - INFO_AT < 30 * 60e3) return INFO;
  try { const j = await (await fetch('info.json?t=' + Date.now(), { cache: 'no-store' })).json(); INFO = j; INFO_AT = Date.now(); } catch { INFO = INFO || { s: {}, news: {} }; }
  return INFO;
}
const jo = v => v == null ? '–' : Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(Math.abs(v) >= 100000 ? 1 : 2)}조` : `${fmt(v)}억`;
function yoy(v, v0) {
  if (v == null || v0 == null) return '';
  if (v0 <= 0 && v > 0) return '<span class="up">흑자전환</span>';
  if (v0 > 0 && v <= 0) return '<span class="dn">적자전환</span>';
  if (v0 <= 0 && v <= 0) return '<span class="dn">적자지속</span>';
  const p = (v / v0 - 1) * 100; return `<span class="${cls(p)}">${p > 0 ? '+' : ''}${p.toFixed(1)}%</span>`;
}
const perLabel = (k, q) => !k ? '' : q ? `${k.slice(0, 4)}년 ${Math.ceil(+k.slice(4, 6) / 3)}분기` : `${k.slice(0, 4)}년`;
function finTable(x, q) {
  if (!x) return '';
  const row = (n, k) => `<tr><td>${n}</td><td><b>${jo(x[k])}</b></td><td>${yoy(x[k], x[k + '0'])}</td></tr>`;
  return `<div class="fin"><div class="fh">${q ? '최근 분기' : '최근 연간'} · ${perLabel(x.p, q)}${x.p0 ? ` <span class="meta">(전년 ${perLabel(x.p0, q)} 대비)</span>` : ''}</div>
    <table>${row('매출액', 'rev')}${row('영업이익', 'op')}${row('순이익', 'ni')}</table></div>`;
}
const ndt = s => s && s.length >= 8 ? `${+s.slice(4, 6)}/${+s.slice(6, 8)}${s.length >= 12 ? ' ' + s.slice(8, 10) + ':' + s.slice(10, 12) : ''}` : '';
async function openInfo(code) {
  const ov = (DATA.overseas || []).find(o => o.code === code);
  const r = ALL[code] || ov;
  if (!r) return;
  const m = modal(`<div class="sheet-h"><div class="name nm">${logo(code, r.n)}<span>${esc(r.n)} <span class="meta">${esc(code)}</span></span></div><button class="mini" id="mcancel">닫기</button></div><div id="infobody"><div class="sk skl w60"></div><div class="sk skb"></div><div class="kvs" style="margin-top:12px"><div class="sk skb"></div><div class="sk skb"></div><div class="sk skb"></div><div class="sk skb"></div></div><div class="sk skb" style="height:140px"></div></div>`);
  m.classList.add('sheet'); m.querySelector('#mcancel').onclick = closeModal;
  if (ov) { $('#infobody').innerHTML = overseasInfo(ov); return; }
  const I = await loadInfo(); const x = (I.s || {})[code], nw = (I.news || {})[code] || [];
  const body = $('#infobody'); if (!body) return;
  const g = (k, v) => `<div class="kv"><span>${k}</span><b>${v ?? '–'}</b></div>`;
  let h = `<div class="meta" style="margin-bottom:6px">${money(r.p)} <span class="${cls(r.c)}">${pct(r.c)}</span>${r.sec ? ' · 업종 ' + esc(r.sec) : ''}${scOf(code) ? ` · 주도주 점수 <b>${scOf(code).t}</b>` : ''}</div>`;
  { const sg = sigOf(code); h += `<h3>📈 주도주 점수</h3><div class="hadv s-${sg.k}"><b>${sg.t}</b>${sg.why ? ' — ' + esc(sg.why) : ''}</div>${scoreDetail(code)}${holdAdvice(code, r)}`; }
  if (nw.length) h += `<div class="news">${nw.map(([t, d, u, o]) => `<a href="${esc(u)}" target="_blank" rel="noopener">📰 ${esc(t)}</a><span class="meta">${esc(o)} · ${ndt(d)}</span>`).join('')}</div>
    <div class="meta">뉴스는 네이버 증권이 이 종목에 연결한 최근 기사예요. 주가가 움직인 이유라고 보장하지 않아요.</div>`;
  if (!x) { h += `<h3>🏢 종목정보</h3><div class="card meta">정보 없음 · 종목정보는 20일 평균 거래대금 30억 이상 종목과 Top·탑픽 종목만 매일 모아요.</div>`; body.innerHTML = h; tidy(body); return; }
  if (x.d) h += `<h3>🏢 회사 소개</h3><div class="desc">${esc(x.d)}</div>`;
  h += `<h3>📊 종목정보 <span class="meta">${esc(x.t)} 기준</span></h3><div class="kvs">
    ${g('시가총액', esc(x.mc))}${g('업종', esc(r.sec || '–'))}${g('PER', esc(x.per))}${g('PBR', esc(x.pbr))}
    ${g('ROE', x.roe != null ? x.roe + '%' + (x.roep ? ` <span class="meta">(${x.roep.slice(0, 4)})</span>` : '') : '–')}${g('배당수익률', esc(x.dy))}
    ${y52html(r, x)}${g('외국인 보유율', esc(x.fr))}${g('추정 PER', esc(x.cper))}</div>`;
  h += `<h3>📈 실적 그래프</h3><div id="fincharts">${finCharts(x)}</div>
    <button class="bigbtn alt" style="width:100%;margin-top:8px" data-act="cmp" data-code="${esc(code)}">⚖️ 다른 종목과 실적 비교</button>`;
  h += `<details class="fold"><summary>숫자로 보기 (최근 연간·분기, 전년 대비)</summary>${finTable(x.a, false) + finTable(x.q, true)}</details>`;
  INFO_CUR = code;
  if (x.tp) h += `<div class="meta" style="margin-top:6px">증권사 목표주가 평균 ${esc(x.tp[0])}원 (${esc(x.tp[1])}) · 참고만</div>`;
  h += `<div class="meta" style="margin-top:8px">자료: 네이버 증권(지표·실적, 단위 억원 → 억/조 표시) · 52주 고저는 최근 250거래일 일봉(수정주가)으로 직접 계산 · 회사 소개 FnGuide/WISEfn · 실적은 확정치 기준</div>`;
  body.innerHTML = h; tidy(body);
}
function y52html(r, x) {   // 52주 고/저: 우리 일봉(최근 약 250거래일, 수정주가) 기준. 네이버 표기와 20% 넘게 다르면 함께 표시
  const g = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  const nv = s => { const v = Number(String(s || '').replace(/[^\d.]/g, '')); return v > 0 ? v : null; };
  const y = r.y52; const nh = nv(x && x.h52), nl = nv(x && x.l52);
  if (!y) return g('52주 최고', nh ? fmt(nh) + '원' : '–') + g('52주 최저', nl ? fmt(nl) + '원' : '–');
  const off = (a, b) => a && b && Math.abs(a / b - 1) > 0.2;
  const note = (v, d, n) => `${fmt(v)}원 <span class="meta">(${md(d)})</span>` + (off(n, v) ? `<div class="meta">네이버 표기 ${fmt(n)}원과 달라요 (액면분할 등 수정주가 차이)</div>` : '');
  return g('52주 최고', note(y[0], y[1], nh)) + g('52주 최저', note(y[2], y[3], nl));
}
function overseasInfo(o) {
  const g = (k, v) => `<div class="kv"><span>${k}</span><b>${v ?? '–'}</b></div>`;
  const usd = v => v == null ? '–' : '$' + fmt(v, v < 10 ? 3 : 2);
  const big = v => v == null ? '–' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + '조' : '$' + fmt(v / 1e8, 0) + '억';
  return `<div class="meta" style="margin-bottom:6px">${esc(o.full || '')}</div><h3>📊 정보</h3><div class="kvs">
    ${g('현재가', usd(o.p))}${g('등락', pct(o.c))}${o.mcap ? g('시가총액', big(o.mcap)) : ''}${o.krw ? g('원화', fmt(o.krw, 1) + '원') : ''}
    ${o.h52 != null ? g('52주 최고', usd(o.h52)) : ''}${o.l52 != null ? g('52주 최저', usd(o.l52)) : ''}</div>
    <div class="meta" style="margin-top:8px">${o.at ? '자료: Yahoo Finance (무료 자료라 시총·재무는 없어요)' : '자료: CoinGecko'}</div>`;
}
// ---------- 투자 책임 안내 · 점수 기준 설명 ----------
const DISC = '본 앱의 주도주 점수·신호는 참고용 정보이며 투자 판단과 그 결과의 책임은 본인에게 있습니다.';
const discLine = (cls = '') => `<div class="disc ${cls}">⚠️ ${DISC}</div>`;
function firstDisclaimer() {
  if (localStorage.getItem('mf_disc') === '1' || $('#modal')) return;
  const m = modal(`<div class="sheet-h"><b>시작하기 전에 꼭 읽어 주세요</b></div>
    <div class="discbig">${DISC}</div>
    <ul class="why"><li>주도주 점수와 매수 신호는 공개 시세로 자동 계산한 <b>근사치</b>예요. 매수·매도 추천이 아니에요.</li>
      <li>규칙(시장 폭·주도 업종·5종목·−20% 손절·+30% 절반 익절)과 가상 5칸 계좌 결과는 과거 약 3년 자료로 고른 것이라 앞으로도 맞는다는 보장이 없어요.</li>
      <li>데이터가 늦거나 틀릴 수 있어요. 중요한 결정 전에는 증권사 앱에서 꼭 확인하세요.</li></ul>
    <button class="bigbtn" style="width:100%;margin-top:12px" id="discok">확인했어요</button>`);
  m.classList.add('sheet');
  m.addEventListener('click', e => { if (e.target === m) e.stopImmediatePropagation(); }, true);   // 바깥 눌러 닫기 막기
  m.querySelector('#discok').onclick = () => { localStorage.setItem('mf_disc', '1'); closeModal(); };
}
const BT_SC = { period: '23.12.4~26.11.16 (154주, 매주 월요일)', rows: [['0~2.5', 34189, 0.16, 46.5, 0.79, -0.27], ['3~4.5', 20596, 0.25, 44.3, 0.74, 0.33], ['5~6.5', 6153, 0.55, 45.8, 2.10, 0.40], ['7~8', 2999, 1.17, 49.8, 2.79, 1.74], ['8.5~10', 795, 1.51, 52.8, 4.16, 2.51]], buy: [536, 2.47, 56.5, 4.21] };
function methodHTML() {
  const sg = v => (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  const stack = SC_ITEMS.map(([n, w], i) => `<i style="width:${w * 10}%;background:${SC_COL[i]}" title="${n} ${w}점"></i>`).join('');
  const how = ['네이버 업종(5종목 이상)마다 ① 거래대금 비중이 평소보다 늘어난 날의 비율(최근 10일) ② 60일 수익률 − 시장 평균 ③ 52주 고점 95% 안 종목 비율을 순위로 바꿔 평균 → 업종 순위. 이번 주와 지난주 점검일 모두 상위 3이면 3점, 이번 주만 상위 3이면 1.5점, 4~6위 0.5점.',
    '종가 ÷ 최근 250거래일 최고가. 95% 이상 2점, 90% 이상 1점.',
    '종가가 20일 평균선 위면 1점.',
    '같은 업종 안에서 20일선 위·52주 고점 10% 안·20일 평균 거래대금 30억 이상 종목을 고점에 가까운 순으로 줄 세워 3위 안이면 2점 (관리종목·거래정지는 순위에서 뺌).',
    '20일 평균 거래대금 30억 이상 종목 중 60일 평균선 위 비율이 45% 이상이면 1점 (그날 모든 종목 같음).',
    '20일 평균 거래대금 30억 이상 0.5점 + 20일선보다 25% 넘게 오르지 않았으면 0.5점.'];
  const rows = SC_ITEMS.map(([n, w], i) => `<div class="wrow"><div class="row"><b><span class="dot" style="background:${SC_COL[i]}"></span>${n}</b><b>${w}점</b></div><div>${how[i]}</div></div>`).join('');
  const tr = BT_SC.rows.map(([b, n, f1, w, f20, te]) => `<tr><td>${b}점</td><td>${fmt(n)}</td><td><b>${sg(f1)}</b></td><td>${w}%</td><td>${sg(f20)}</td><td>${sg(te)}</td></tr>`).join('');
  return `<div class="meta">하나의 방법만 써요: <b>주도주 로테이션</b>. 종목 점수(10점)는 이 규칙에 얼마나 가까운지를 보여 주고, 사고파는 건 아래 <b>매수 신호</b>와 <b>매도 규칙</b>만 따라요.</div>
    <div class="wstack">${stack}</div>
    <div class="wlegend">${SC_ITEMS.map(([n, w], i) => `<span><span class="dot" style="background:${SC_COL[i]}"></span>${n} ${w}</span>`).join('')}</div>
    ${rows}
    <div class="meta" style="margin-top:8px">색: 8.5점 이상 초록(주도주) · 6~8 노랑(근접) · 6 미만 빨강(약함)</div>
    <h3>업종 점수 (10점)</h3><ul class="why"><li>네이버 업종(5종목 이상)마다 세 가지를 업종끼리 순위(0~1)로 바꿔 각각 <b>3.3점</b>씩, 합쳐 <b>10점</b>: ① <b>돈 유입 지속</b> = 최근 10일 중 업종 거래대금 비중이 평소(60일)보다 10% 넘게 늘어난 날의 비율 ② <b>60일 강도</b> = 업종 60일 수익률 − 시장 평균 ③ <b>고점 근처 비율</b> = 52주 고점 95% 안 종목 비율.</li>
      <li>10점이면 세 가지 모두 전체 업종 중 1등이라는 뜻. 색은 종목 점수와 같아요 (8.5↑ 초록 · 6~8 노랑 · 6 미만 빨강). 업종 순위는 이 점수 순서예요.</li></ul>
    <h3>매수 (점검일에만, 모두 맞아야 함)</h3><ul class="why"><li><b>격주 수요일 장 마감 뒤</b> 점검 (기준일 26.11.18, 휴장이면 그 주 다음 거래일) → <b>다음날(목요일) 시가</b>에 주문</li><li>시장 폭 45% 이상 (아니면 <b>전부 현금</b>)</li><li>이번 주·지난주 같은 요일 모두 상위 3 업종 (2주 연속)</li><li>그 업종 안 20일선 위 · 52주 고점 10% 안 · 거래대금 30억↑ 종목을 고점에 가까운 순으로 줄 세워 <b>업종마다 1등 먼저, 그다음 2등…</b> 최대 <b>5종목</b>, 한 칸 = 투자금의 <b>1/5</b></li><li>관리종목·거래정지 아님 (감사의견 문제는 직접 확인) · 후보가 모자라면 빈 칸은 현금</li></ul>
    <h3>매도 규칙</h3><ul class="why"><li><b>종가가 매수가 −20% 아래</b>면 다음 날 시가에 전부 매도 (점검일 아니어도)</li><li><b>종가가 매수가 +30% 위</b>면 다음 날 시가에 <b>절반</b> 매도 (한 번만), 나머지는 계속</li><li>점검일에 <b>유지 조건</b>(업종 상위 5 · 업종 안 6위 안 · 52주 고점 15% 안)에서 벗어나면 매도하고 새 후보로 교체</li><li>점검일 시장 폭이 45% 밑이면 전부 매도하고 현금 대기</li></ul>
    <h3>점수가 높을수록 실제로 더 올랐나 (과거 검증)</h3>
    <div class="card inner"><div class="meta">${BT_SC.period} 점검일마다 유동성 종목(20일 평균 거래대금 30억↑) 전부에 점수를 매기고, 다음 점검일까지 1주 수익률과 20거래일 수익률을 평균 냈어요. 수수료 빼기 전·겹치는 표본 포함.</div>
      <table class="atab"><tr><th>점수</th><th>표본</th><th>1주 평균</th><th>1주 오른 비율</th><th>20일 평균</th><th>확인 1년만 1주</th></tr>${tr}</table>
      <ul class="why"><li>점수가 높을수록 평균 수익이 대체로 높았어요: 8.5점 이상 1주 +1.51% vs 2.5점 이하 +0.16%. 마지막 1년(25.11~)만 봐도 −0.27% → +2.51%로 순서대로 올라갔어요.</li>
        <li>예전 9칸 매수 신호(업종 안 상위 3)가 켜진 경우 ${fmt(BT_SC.buy[0])}건: 1주 평균 +${BT_SC.buy[1]}% · 오른 비율 ${BT_SC.buy[2]}% · 20일 평균 +${BT_SC.buy[3]}%.</li>
        <li>솔직한 한계: 낮은 점수 구간끼리는 순서가 뒤바뀐 때도 있었고(고른 기간엔 2.5점 이하가 3~4.5점보다 나음), 전체 종목을 한 줄로 세운 순위 상관은 거의 0이에요. <b>점수는 '상위 몇 개를 골라내는 데'만 쓸모가 있고 낮은 점수끼리 비교하는 건 의미가 적어요.</b></li>
        <li>배점은 업종 3·고점 2·업종 안 순위 2 방식과 업종 4·순위 1 방식을 3년 전체로 비교해 순서가 더 깔끔한 쪽을 골랐어요. 그래서 마지막 1년도 완전히 '안 보고' 고른 건 아니에요. 1주 오른 비율은 최고 구간도 53% 정도라 <b>한 종목만 보면 반반에 가까워요</b> — 5종목만 들면 한 종목 결과에 계좌가 크게 흔들려요.</li></ul></div>
    ${realBox()}
    <div class="disc">과거 결과가 미래 수익을 보장하지 않아요. 지금 상장된 종목만 봐서(생존 편향) 실제보다 좋게 나왔을 수 있고, 업종은 지금의 네이버 분류를 과거에도 썼어요.</div>
    ${discLine()}`;
}
function openMethod() {
  const m = modal(`<div class="sheet-h"><b>주도주 점수와 매매 규칙</b><button class="mini" id="mcancel">닫기</button></div>${methodHTML()}`);
  m.classList.add('sheet'); m.querySelector('#mcancel').onclick = closeModal;
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
// ---------- 주도주 로테이션 (v2.0, bt10 '가장 안정적' 규칙) ----------
let LEAD = null, LEAD_TRIED = false, LEAD_AT = 0;
async function loadLead() {
  LEAD_TRIED = true; LEAD_AT = Date.now();
  try { const r = await fetch('leaders.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) LEAD = await r.json(); } catch {}
  return LEAD;
}
const d8 = s => s ? `${+s.slice(4, 6)}/${+s.slice(6, 8)}(${'일월화수목금토'[new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).getDay()]})` : '–';
function breadthSpark(hist, th) {
  if (!hist || hist.length < 5) return '';
  const W = 300, H = 64, xs = i => (i / (hist.length - 1)) * W, ys = v => H - (Math.min(100, Math.max(0, v)) / 100) * H;
  const pts = hist.map(([, v], i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  return `<svg class="bspark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="최근 60거래일 시장 폭">
    <line x1="0" x2="${W}" y1="${ys(th)}" y2="${ys(th)}" class="th"/><polyline points="${pts}" class="ln"/></svg>
    <div class="meta row"><span>${d8(hist[0][0])}</span><span>점선 = ${th}% 기준</span><span>${d8(hist[hist.length - 1][0])}</span></div>`;
}
function leadCard(x, on) {
  const inA = ALL[x.code];
  return `<div class="card lcard"><div class="row"><b>${logo(x.code, x.n)}${esc(x.n)} <span class="meta">${esc(x.code)} · ${esc(x.sec)}</span></b>
      <span class="lsc c-${lvl(scOf(x.code)?.t)}" data-fold="${esc(x.code)}">${scOf(x.code)?.t ?? '–'}<small>/10</small></span></div>
    <div class="tags">${on ? '<span class="tag t-on">매수 신호 · 비중 1/5</span>' : '<span class="tag t-off">시장 폭 45% 넘으면 후보, 지금은 매수 아님</span>'}</div>
    <div class="lgrid"><div><span class="meta">종가</span><b>${fmt(x.c)}원</b></div><div><span class="meta">52주 고점 대비</span><b>${x.hi > 0 ? '+' : ''}${x.hi}%</b></div>
      <div><span class="meta">손절선(−20%)</span><b class="dn">${fmt(x.stop)}원</b></div><div><span class="meta">+30% 절반 익절</span><b class="up">${fmt(x.tp)}원</b></div></div>
    <div class="meta">20일선 ${fmt(x.ma20)}원 · 20일 평균 거래대금 ${fmt(x.tv20)}억 · 두 선은 오늘 종가에 샀다고 칠 때 값 (실제는 <b>내 매수가 × 0.80 / × 1.30</b>, 종가로 확인)${inA ? ` · <a href="#" data-act="info" data-code="${esc(x.code)}">종목 정보</a>` : ''}</div>
    ${scOf(x.code) ? foldBlock(x.code, '<span class="fstate meta">점수 구성 · 이유</span>', scoreDetail(x.code)) : ''}${inA ? actions(x.code, cfg()) : ''}</div>`;
}
function realBox() {
  const R = REPLAY;
  return `<div class="card real"><b>현실적인 기대치</b><ul class="why">
    <li>과거 약 3년(23.11~26.11) 자료로 다음날 시가 체결 + 슬리피지 0.3% + 비용 0.23%를 넣어 시험해 보니, 시작 주·요일에 따라 결과가 크게 달라서 <b>연 20~30% 안팎, 최대 하락 −25~−30%</b> 정도를 현실적인 범위로 봐요.${R ? ` (아래 '과거 시험 결과' 한 경로는 연 ${R.cagr}% · 최대 하락 ${R.mdd}%로 위쪽 결과예요)` : ''}</li>
    <li>5종목만 들어서 <b>한 종목이 계좌를 크게 흔들어요</b>. 한 번에 −25% 안팎 잃은 매매도 있었고(갭 하락은 −20% 손절선 아래로 체결), 수익은 몇 번의 큰 매매에 몰려요. 이기는 매매는 절반 정도.</li>
    <li>격주 점검이라 매매는 <b>한 달 4번 안팎</b>, 시간의 약 30%는 현금으로 쉬어요. 직전 최고점을 몇 달씩 회복 못 하는 기간도 있어요.</li>
    <li>지금 상장된 종목만으로 계산(생존 편향)했고, 업종은 지금의 네이버 분류를 과거에도 썼어요. 규칙도 같은 자료로 골랐어요. <b>과거 결과가 미래 수익을 보장하지 않아요.</b></li></ul></div>`;
}
function checklist() {
  const nx = LEAD && LEAD.check ? d8(LEAD.check.next) : '다음 점검일';
  return `<div class="card"><b>할 일 (체크리스트)</b><ol class="why chk">
    <li><b>격주 수요일 장 마감 뒤</b>(다음: ${nx}) 이 화면을 열어 시장 폭을 봐요. <b>45% 미만이면 전부 현금</b>으로 두고 끝.</li>
    <li>45% 이상이면 <b>2주 연속 상위 3 업종</b>에서 업종마다 1등 먼저, 그다음 2등… <b>최대 5종목</b>. 투자금을 5칸으로 나눠 1칸씩, 모자라면 빈 칸은 현금.</li>
    <li>가지고 있는 종목은 <b>유지 조건</b>(업종 상위 5 · 업종 안 6위 · 고점 15% 안) 안이면 그대로, 벗어나면 교체.</li>
    <li><b>다음날(목요일) 시가 부근</b>에 지정가로 나눠서 사고팔아요. 급하게 따라가지 않기.</li>
    <li><b>매일 종가 확인</b>: 매수가 −20% 아래면 다음 날 시가에 전부 매도, +30% 위면 다음 날 시가에 절반 매도(한 번만).</li>
    <li><b>관리종목·거래정지·감사의견 문제</b>가 있는 종목은 조건에 맞아도 빼요. (앱이 관리종목·거래정지는 자동으로 빼지만 직접 한 번 더 확인)</li></ol></div>`;
}
// ---------- 가상 5칸 계좌 · 과거 시험 · 업종 순위 ----------
let SLOTS = null, REPLAY = null, SLOTS_TRIED = false;
async function loadSlots() {
  SLOTS_TRIED = true;
  try { const r = await fetch('slots.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) SLOTS = (await r.json()).view; } catch {}
  try { if (!REPLAY) { const r = await fetch('replay.json', { cache: 'no-store' }); if (r.ok) REPLAY = await r.json(); } } catch {}
}
const w8 = s => s ? `${s.slice(2, 4)}.${+s.slice(4, 6)}.${+s.slice(6, 8)}` : '–';
function eqChart(curve, label) {
  if (!curve || !curve.length) return '';
  const W = 300, H = 110, n = curve.length;
  const vals = curve.flatMap(([, a, k]) => [a, k].filter(v => v != null));
  let lo = Math.min(...vals, 100), hi = Math.max(...vals, 100); if (hi - lo < 4) { hi += 2; lo -= 2; }
  const xs = i => n < 2 ? W / 2 : (i / (n - 1)) * W, ys = v => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const line = k => curve.map((r, i) => r[k] == null ? null : `${xs(i).toFixed(1)},${ys(r[k]).toFixed(1)}`).filter(Boolean).join(' ');
  const dot = n < 2 ? `<circle cx="${W / 2}" cy="${ys(curve[0][1])}" r="4" class="pa"/>` : '';
  const last = curve[n - 1];
  return `<svg class="eqc" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(label)}">
    <line x1="0" x2="${W}" y1="${ys(100)}" y2="${ys(100)}" class="th"/><polyline points="${line(2)}" class="lk"/><polyline points="${line(1)}" class="la"/>${dot}</svg>
    <div class="meta row"><span>${w8(curve[0][0])}</span><span><i class="lg la"></i>${esc(label)} ${fmt(last[1], 1)} · <i class="lg lk"></i>코스피 ${last[2] == null ? '–' : fmt(last[2], 1)} <span class="meta">(시작=100)</span></span><span>${w8(last[0])}</span></div>`;
}
function slotCard(x) {
  const k = x.status.startsWith('손절') || x.status.startsWith('교체') ? 'r' : x.status.includes('익절 예정') ? 'y' : 'g';
  return `<div class="card slot"><div class="row"><b>${logo(x.code, x.n)}${esc(x.n)} <span class="meta">${esc(x.code)}${x.sec ? ' · ' + esc(x.sec) : ''}</span></b><span class="fstate s-${k}">${esc(x.status)}</span></div>
    <div class="lbig2 ${cls(x.ret)}">${pct(x.ret, 1)} <span class="meta">· 비중 ${x.w}% · ${fmt(x.val)}원</span></div>
    <div class="lgrid"><div><span class="meta">매수 ${w8(x.ed)} 시가</span><b>${fmt(x.ep)}원</b></div><div><span class="meta">현재(종가)</span><b>${fmt(x.c)}원</b></div>
      <div><span class="meta">손절선(−20%)</span><b class="dn">${fmt(x.stop)}원</b></div><div><span class="meta">+30% 절반 익절</span><b class="up">${fmt(x.tp)}원</b>${x.half ? '<span class="meta">✓ 절반 팔았음</span>' : ''}</div></div></div>`;
}
const emptySlot = i => `<div class="card slot empty"><div class="row"><b><span class="slotno">${i}</span>현금 (조건 맞는 종목 없음)</b><span class="meta">1/5</span></div></div>`;
function slotsView() {
  const S = SLOTS;
  if (!S) return `<div class="card meta">가상 5칸 계좌를 불러오는 중이에요…</div>`;
  const ord = (S.orders || []).length ? `<div class="card"><b>다음 거래일 시가 주문 (${S.orders.length})</b><ul class="why">${S.orders.map(o => `<li><b class="${o.act === 'buy' ? 'up' : 'dn'}">${o.act === 'buy' ? '매수 1/5' : o.act === 'half' ? '절반 매도' : '매도'}</b> ${esc(o.n)} — ${esc(o.why)}</li>`).join('')}</ul></div>` : '';
  const allCash = !S.slots.length;
  const hist = (S.hist || []).length ? S.hist.map(h => `<tr><td>${esc(h.n)}${h.part === '절반' ? ' <span class="meta">절반</span>' : ''}</td><td>${w8(h.ed)}<br><span class="meta">${fmt(h.ep)}</span></td><td>${w8(h.xd)}<br><span class="meta">${fmt(h.xp)}</span></td><td class="${cls(h.ret)}"><b>${pct(h.ret, 1)}</b></td><td class="meta">${esc(h.why)}</td></tr>`).join('') : '';
  const kr = S.kospi_ret;
  return `<h2>가상 5칸 계좌 (규칙 그대로 자동 운용)</h2>
    <div class="meta hint">${w8(S.start)} 가상 ${fmt(S.start_cash / 1e4)}만원으로 시작 · 다음날 시가 체결 + 슬리피지 0.3% + 비용 0.23% 반영 · 서버가 장 마감 뒤 계산 (실제 돈 아님)</div>
    <div class="card acct"><div class="row"><div><span class="meta">계좌 평가액</span><div class="lbig2 ${cls(S.ret)}">${fmt(S.equity)}원 <span>${pct(S.ret)}</span></div></div>
      <div style="text-align:right"><span class="meta">현금</span><div><b>${S.cash_pct}%</b></div><span class="meta">코스피 ${kr == null ? '–' : pct(kr)}</span></div></div>
      ${allCash ? `<div class="ladvice">지금은 <b>5칸 모두 현금</b>이에요. 시장 폭(지금 ${LEAD ? LEAD.breadth.pct : '–'}%)이 점검일에 <b>45%를 넘으면 자동으로 채워져요</b>. 다음 점검 ${d8(S.check.next)}.</div>` : ''}
      ${eqChart(S.curve, '가상 계좌')}
      <div class="meta">다음 점검: <b>${esc(S.check.next_txt)}</b>${S.check.is_check_day ? ' · <b>오늘이 점검일</b>' : ''}</div></div>
    ${ord}
    ${S.slots.map(slotCard).join('')}${Array.from({ length: S.empty }, (_, i) => emptySlot(S.slots.length + i + 1)).join('')}
    <div class="card"><b>끝난 매매 기록</b>${hist ? `<table class="atab htab"><tr><th>종목</th><th>매수</th><th>매도</th><th>수익</th><th>이유</th></tr>${hist}</table>` : '<div class="meta">아직 끝난 매매가 없어요.</div>'}</div>`;
}
function replayView() {
  const R = REPLAY; if (!R) return '';
  const open = OPEN.has('replay');
  const body = open ? `<div class="meta">${esc(R.rule)} · ${w8(R.start)}~${w8(R.end)} · 가상 계좌가 그때부터 이 규칙만 따랐다면</div>
      ${eqChart(R.curve, '과거 시험')}
      <div class="lgrid g3"><div><span class="meta">연 수익</span><b class="up">${R.cagr}%</b></div><div><span class="meta">최대 하락</span><b class="dn">${R.mdd}%</b></div><div><span class="meta">3년 누적</span><b>${pct(R.tot, 0)}</b><span class="meta">코스피 ${pct(R.kospi_tot, 0)}</span></div>
        <div><span class="meta">이긴 매매</span><b>${R.win}%</b></div><div><span class="meta">평균 이익/손실</span><b>+${R.aw}% / ${R.al}%</b></div><div><span class="meta">매매/월</span><b>${R.pm}번</b></div>
        <div><span class="meta">평균 보유</span><b>${R.hold}거래일</b></div><div><span class="meta">최악 / 최고 매매</span><b>${R.worst}% / +${R.best}%</b></div><div><span class="meta">현금 시간</span><b>${R.cash}%</b></div></div>
      <div class="meta">최근 매매 ${Math.min(40, R.trades.length)}개 (총 ${fmt(R.ntr)}번)</div>
      <table class="atab htab"><tr><th>종목</th><th>매수</th><th>매도</th><th>수익</th><th>보유</th></tr>${R.trades.slice(0, 40).map(t => `<tr><td>${esc(t.n)}</td><td>${w8(t.ed)}</td><td>${w8(t.xd)}</td><td class="${cls(t.ret)}"><b>${pct(t.ret, 1)}</b></td><td class="meta">${t.days}일</td></tr>`).join('')}</table>
      <div class="disc">과거 시험 결과예요. 시작한 주가 달랐으면 연 20~30%대로 더 낮았던 경우가 많았어요. 생존 편향·같은 자료로 규칙을 고른 점 때문에 실제보다 좋게 나왔을 수 있어요.</div>` : '';
  return `<div class="card replay"><button class="fhead" data-toggle="replay"><b>과거 시험 결과 (최근 3년 같은 규칙)</b><span class="ftog">${open ? '접기 ▴' : '펼치기 ▾'}</span></button>${body}</div>`;
}
function secCard(s) {
  const L_ = lvl(s.sc), id = 'sec:' + s.n;
  const chg = s.last == null ? '<span class="chg new">NEW</span>' : s.chg > 0 ? `<span class="chg up">▲${s.chg}</span>` : s.chg < 0 ? `<span class="chg dn">▼${-s.chg}</span>` : '<span class="chg">–</span>';
  const badge = s.q ? '<span class="tag t-on">2주 연속 · 자격</span>' : s.pos <= 3 ? '<span class="tag t-wait">이번 주 처음 · 한 주 더</span>' : '';
  const P = [['돈 유입 지속', s.parts[0], `최근 10일 중 ${s.sus}%가 거래대금 비중이 평소보다 늘어난 날 · 지금 평소의 ${s.sh}배`, '#3182f6'],
    ['60일 강도', s.parts[1], `60일 수익이 시장 평균보다 ${s.rs60 > 0 ? '+' : ''}${s.rs60}%p`, '#2fca73'],
    ['고점 근처 비율', s.parts[2], `${s.m}종목 중 ${s.bhi}%가 52주 고점 95% 안`, '#a78bfa']];
  const detail = `<div class="detail">${P.map(([n, v, why, col]) => `<div class="wrow"><div class="row"><b><span class="dot" style="background:${col}"></span>${n}</b><b>${v} <span class="meta">/ 3.3</span></b></div>
      <div class="wbar"><i style="width:${v / 3.334 * 100}%;background:${col}"></i></div><div class="meta">${why} (업종끼리 순위로 환산)</div></div>`).join('')}
      <div class="meta">업종 점수 = 세 가지를 업종끼리 순위로 바꿔 각각 3.3점씩 · ${d8(LEAD.asof)} 장 마감 기준 · <a href="#" data-act="method">기준 보기</a></div></div>`;
  const tops = (s.top || []).map((t, i) => { const sc = scOf(t.code); const tl = lvl(sc && sc.t);
    return `<div class="secstk"><span class="meta">${i + 1}등</span><b class="${ALL[t.code] ? 'tap' : ''}" ${ALL[t.code] ? `data-act="info" data-code="${esc(t.code)}"` : ''}>${esc(t.n)}</b><span class="meta">고점 ${t.hi > 0 ? '+' : ''}${t.hi}%${t.ok ? '' : ' · 조건 밖'}</span><span class="lsc sm c-${tl}">${sc ? sc.t : '–'}<small>/10</small></span></div>`; }).join('');
  const head = `<span class="fstate meta">점수 구성 (3가지)</span>`;
  return `<div class="card seccard"><div class="row"><b><span class="secrk">${s.pos}</span>${esc(s.n)} ${chg}</b><span class="lsc c-${L_}" data-fold="${esc(id)}">${s.sc}<small>/10</small></span></div>
    <div class="bar"><i style="width:${s.sc * 10}%;background:${COLOR[L_]}"></i></div>
    <div class="tags">${badge}<span class="meta">지난주 ${s.last == null ? '10위 밖' : s.last + '위'} · 상위 3 연속 ${s.streak}주</span></div>
    ${tops ? `<div class="secstks">${tops}</div>` : ''}
    ${foldBlock(id, head, detail)}</div>`;
}
function viewLead() {
  const D = LEAD;
  if (!D && LEAD_TRIED) return '<div class="card">주도주 데이터를 아직 못 불러왔어요. 잠시 뒤 새로고침해 주세요. (장 마감 뒤 계산돼요)</div>' + discLine();
  if (!D) { loadLead().then(() => { if (TAB === 'lead') render(); }); return '<div class="card">주도주 데이터를 불러오는 중이에요… (장 마감 뒤 하루 한 번 계산해요)</div>' + discLine(); }
  if (!SLOTS_TRIED) loadSlots().then(() => { if (TAB === 'lead') render(); });
  const B = D.breadth, th = Math.round(D.rule.br * 100), on = D.on;
  const st = on ? `<span class="lstat on">매수 가능</span>` : `<span class="lstat off">전량 현금 대기</span>`;
  const gauge = `<div class="bgauge"><i style="width:${Math.min(100, B.pct)}%" class="${on ? 'on' : 'off'}"></i><b style="left:${th}%"></b></div>`;
  const need = on ? `기준 ${th}%보다 ${(B.pct - th).toFixed(1)}%p 위예요.` : `${th}%까지 <b>${fmt(B.need)}종목</b>이 더 60일선 위로 올라와야 해요. (60일선 바로 아래 5% 이내 ${B.near5}종목, 10% 이내 ${B.near10}종목)`;
  const picks = D.picks.length ? D.picks.map(x => leadCard(x, on)).join('') : '<div class="card meta">2주 연속 업종 안에 조건(20일선 위·52주 고점 10% 안)에 맞는 종목이 없어요.</div>';
  const exc = (D.excluded || []).length ? `<div class="meta hint">자동 제외: ${D.excluded.map(x => `${esc(x.n)}(${esc(x.why)})`).join(', ')}</div>` : '';
  const K = (DATA.index || {}).KOSPI, Kq = (DATA.index || {}).KOSDAQ;
  const idx = K && Kq ? `<div class="meta idxline">코스피 <b>${fmt(K.value, 2)}</b> <span class="${cls(K.pct)}">${pct(K.pct)}</span> · 코스닥 <b>${fmt(Kq.value, 2)}</b> <span class="${cls(Kq.pct)}">${pct(Kq.pct)}</span> <span class="meta">(지금 시세)</span></div>` : '';
  const C = D.check || {};
  return installCard() + idx + `<div class="card lhead"><div class="row"><b>주도주 5종목</b><span class="meta">${d8(D.asof)} 장 마감 기준</span></div>
      <div class="lbig">${B.pct}% ${st}</div>${gauge}
      <div class="meta">시장 폭 = 유동성 종목 ${fmt(B.n)}개 중 60일 평균선 위 ${fmt(B.above)}개. ${need}</div>
      ${on ? '' : '<div class="ladvice">지금은 <b>새로 사지 않고 현금으로 기다리는</b> 때예요. 아래 종목은 시장 폭이 45%를 넘으면 살 후보로만 보세요.</div>'}
      <div class="nextchk">다음 점검 <b>${d8(C.next)}</b> 장 마감 뒤 → 다음날 시가 주문 ${C.is_check_day ? '<span class="tag t-on">오늘 점검일</span>' : ''}</div>
      ${breadthSpark(B.hist, th)}</div>
    ${slotsView()}
    <h2>주도 업종 순위 Top 10</h2><div class="meta hint">업종 점수(10점) = 돈 유입 지속 + 60일 강도 + 고점 근처 비율 (각 3.3점). 이번 주와 지난주 같은 요일(${d8(D.prev_check)}) 모두 3위 안인 업종만 자격. 각 업종 1·2등 종목과 종목 점수(10점)를 같이 보여 줘요. 점수를 누르면 구성.</div>
    ${foldAllBar()}${(D.sectors || []).map(secCard).join('')}
    <h2>지금 5칸 후보 (${D.picks.length}/5${D.picks.length < 5 ? ` · 빈 ${5 - D.picks.length}칸은 현금` : ''})</h2>
    <div class="meta hint">자격 업종마다 20일선 위 · 52주 고점 10% 안 종목을 고점에 가까운 순으로 줄 세워 1등 먼저, 그다음 2등… 한 칸 = 투자금의 1/5. 실제 주문은 점검일 기준이에요.</div>
    ${picks}${exc}
    ${checklist()}${realBox()}${replayView()}
    <div class="meta hint">데이터: 네이버 금융 일봉(수정주가), 관리종목은 KRX KIND 목록${D.admin_ok ? '' : ' (오늘은 확인 실패 → 직접 확인하세요)'} · 계산 ${kst(D.made)} · 검사 ${fmt(D.stocks)}종목</div>
    ${discLine()}`;
}
const sortS = a => a.slice().sort((x, y) => ((scOf(y) || {}).t ?? -1) - ((scOf(x) || {}).t ?? -1));
function viewHold() {
  const c = cfg(); let h = '';
  if (OLDDEF) h += `<div class="card warnbox">이 목록은 예전 버전이 자동으로 넣은 <b>기본 예시 종목</b>일 수 있어요. 직접 고른 종목이 아니라면 지워 주세요.<div class="row" style="margin-top:10px;gap:8px;justify-content:flex-start"><button class="mini" data-act="wipe">🗑 내 종목 모두 지우기</button><button class="mini" data-act="keepmine">내가 고른 거예요</button></div></div>`;
  h += `<div class="tabhead"><h2>📌 ${esc(c.hName)} (${c.h.length})</h2><button class="mini" data-act="renh">✏️ 이름</button></div>`;
  if (c.h.length) h += foldAllBar();
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
    ${L.codes.length ? foldAllBar() : ''}
    ${L.codes.length ? sortS(L.codes).map(x => stockCard(x, { k: '-w' + L.id })).join('') : `<div class="card meta empty">아직 '${esc(L.name)}'에 종목이 없어요.<br>🔎 찾기에서 종목을 추가하세요. (카드의 ☆ 관심 추가 → 탭 고르기)</div>`}`;
}
// ---------- 간단한 창(이름 입력·탭 고르기) ----------
function modal(html) {
  closeModal();
  const m = document.createElement('div'); m.id = 'modal'; m.innerHTML = `<div class="mbox">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m); tidy(m); return m;
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
    <ul class="why">${(self.APP_CHANGES || []).filter(([v]) => +v.split('.')[0] >= 2).map(([v, d, t]) => `<li><b>v${esc(v)}</b> (${esc(d)}) ${esc(t)}</li>`).join('')}</ul></div>
  ${shareHelpCard()}
  <div class="card"><b>화면 테마</b><div class="theme-sel">${[['dark', '다크'], ['light', '라이트'], ['auto', '휴대폰 설정 따르기']].map(([k, n]) => `<button class="chip ${(localStorage.getItem('mf_theme') || 'dark') === k ? 'on' : ''}" data-act="theme" data-v="${k}">${n}</button>`).join('')}</div></div>
  <div class="card">${discLine()}</div>
  <h2>📈 이 앱의 방법은 하나: 주도주 로테이션</h2>
  <div class="card">${methodHTML()}</div>
  <div class="card"><b>갱신</b><ul class="why"><li>시세(현재가·등락)는 평일 08:50~15:50 약 10분마다 갱신돼요.</li>
    <li>주도주 점수·업종 순위·시장 폭·가상 5칸 계좌는 <b>장 마감 뒤 하루 한 번</b> 계산해요 (화면 위 '몇 월 며칠 장 마감 기준' 표시). 장중 가격이 움직여도 점수는 다음 계산 때 바뀌어요.</li>
    <li>앱은 1분마다 새 데이터를 확인해요. 초 단위 실시간 시세는 아니에요.</li></ul></div>
  <div class="card"><b>내 종목 저장</b><ul class="why"><li>관심·보유 종목, 평단·수량은 이 폰에만 저장되고 어디에도 올라가지 않아요. 앱 데이터를 지우면 사라져요.</li>
    <li>평단을 넣으면 보유 카드에 손절선(평단 × 0.80), +30% 절반 익절 선(평단 × 1.30), 유지 조건 안내가 나와요. '절반 익절함' 표시도 이 폰에만 저장돼요.</li><li>가상 5칸 계좌는 서버가 규칙대로 계산한 <b>공용 연습 계좌</b>예요. 내 보유 종목과는 상관없고, 내 정보는 서버로 가지 않아요. 공유는 앱 주소만 (#setup= 링크는 공유하지 마세요).</li></ul></div>`;
}

let FLASH = '';
function setUpdated() {
  const el = $('#updated'); if (!el || !DATA) return;
  const open = DATA.market_status === 'OPEN';
  el.innerHTML = `마지막 갱신 <b>${kst(DATA.updated)}</b> (KST) · ${open ? '🟢 장중 약 10분마다 갱신' : '⚪ 장 마감/휴장'}${FLASH ? ` <span class="flash">${FLASH}</span>` : ''}`;
}
function navLabels() {
  const c = cfg(); const b = document.querySelector('nav [data-tab=hold]');
  if (b) b.title = c.hName;
}
const EMO = /^(?:[\p{Extended_Pictographic}\u2600-\u27BF][\uFE0F\u200D\p{Extended_Pictographic}]*\s*)+/u;
function tidy(root) {   // 제목 앞 이모지 정리 (아이콘은 CSS 막대로 통일)
  (root || document).querySelectorAll('h2, h3').forEach(h => { const n = h.firstChild; if (n && n.nodeType === 3) n.textContent = n.textContent.replace(EMO, ''); });
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
  if (TAB === 'home' || TAB === 'buy') TAB = 'lead';
  app.innerHTML = (TAB === 'lead' ? viewLead() : TAB === 'hold' ? viewHold() : TAB === 'watch' ? viewWatch() : TAB === 'find' ? viewFind() : viewHelp())
    + (DATA.errors && DATA.errors.length ? `<div class="card meta">일부 데이터를 못 받았어요: ${DATA.errors.length}건</div>` : '');
  tidy(app);
  window.scrollTo(0, y);
  const q = $('#q');
  if (q) q.addEventListener('input', () => { Q = q.value; const r = $('#res'); if (r) r.innerHTML = findResults(); });
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-act=method]')) { e.preventDefault(); e.stopPropagation(); openMethod(); return; }
  const fa = e.target.closest('[data-foldall]');
  if (fa) { const op = fa.dataset.foldall === '1'; document.querySelectorAll('#app .fold').forEach(f => { f.classList.toggle('open', op); setFold(f.dataset.code, op); const b = f.querySelector('.fhead'); b.setAttribute('aria-expanded', op); b.querySelector('.ftog').textContent = op ? '접기 ▴' : '상세 ▾'; }); return; }
  const fd = e.target.closest('[data-fold]');
  if (fd && !e.target.closest('[data-tip]')) {   // 같은 종목 카드가 여러 곳에 있으면 모두 같이
    const code = fd.dataset.fold, op = !isOpen(code); setFold(code, op);
    document.querySelectorAll(`.fold[data-code="${code}"]`).forEach(f => { f.classList.toggle('open', op); const b = f.querySelector('.fhead'); b.setAttribute('aria-expanded', op); b.querySelector('.ftog').textContent = op ? '접기 ▴' : '상세 ▾'; });
    return; }
  const fb = e.target.closest('[data-fin]');
  if (fb) { FINMODE = fb.dataset.fin; if (fb.dataset.cmp && CMP) openCompare(CMP[0], CMP[1]);
    else { const x = (INFO && INFO.s || {})[INFO_CUR], box = $('#fincharts'); if (x && box) box.innerHTML = finCharts(x); } return; }
  const t = e.target.closest('[data-toggle],[data-act],[data-tab]'); if (!t) return;
  if (t.dataset.tab) { e.preventDefault(); TAB = t.dataset.tab; window.scrollTo(0, 0); render({ full: true }); return; }
  if (t.dataset.toggle) { const id = t.dataset.toggle; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); render({ full: true }); return; }
  const c = cfg(), code = t.dataset.code;
  if (t.dataset.act === 'pick') { pickLists(code); return; }
  if (t.dataset.act === 'info') { openInfo(code); return; }
  if (t.dataset.act === 'cmp') { loadInfo().then(() => pickCompare(code)); return; }
  if (t.dataset.act === 'cmpgo') { openCompare(t.dataset.a, code); return; }
  if (t.dataset.act === 'theme') { localStorage.setItem('mf_theme', t.dataset.v); applyTheme(); render({ full: true }); return; }
  if (t.dataset.act === 'install') { doInstall(); return; }
  if (t.dataset.act === 'share') { doShare(); return; }
  if (t.dataset.act === 'copylink') { copyLink(); return; }
  if (t.dataset.act === 'hideinst') { localStorage.setItem('mf_insthide', '1'); render({ full: true }); return; }
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
  if (t.dataset.act === 'half') { const p = c.pos[code]; if (p) { p.half = !p.half; } saveCfg(c); render({ full: true }); return; }
  if (t.dataset.act === 'pos') {
    const a = Number($('#pa-' + code).value.replace(/,/g, '')), q = Number($('#pq-' + code).value.replace(/,/g, ''));
    if (a > 0) c.pos[code] = { a, q: q > 0 ? q : 0, half: !!(c.pos[code] && c.pos[code].a === a && c.pos[code].half) }; else delete c.pos[code];
    OPEN.delete('pos-' + code);
  }
  saveCfg(c); render({ full: true });
});

async function load(manual) {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); const changed = !DATA || d.updated !== DATA.updated; DATA = d;
    let lchg = false;
    if (changed || !LEAD || Date.now() - LEAD_AT > 15 * 60e3) { const old = LEAD && LEAD.made; await loadLead(); lchg = !!LEAD && LEAD.made !== old; if (lchg || !SLOTS) await loadSlots(); }
    if (changed || !ALL_UPD) {
      try { const a = await (await fetch('all.json?t=' + Date.now(), { cache: 'no-store' })).json(); ALL = a.s || {}; ALL_UPD = a.updated; } catch {}
    }
    if (manual) {
      const now = new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
      FLASH = changed ? `✅ 새 데이터 받음 ${now}` : `✅ 확인함 ${now} · 최신이에요`;
      setTimeout(() => { FLASH = ''; setUpdated(); }, 6000);
    }
    if (changed || lchg) render(); else setUpdated();
    firstDisclaimer();
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
const ICO = {
  lead: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m14 6 3-3 3 3"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  buy: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  hold: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>',
  watch: '<path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  find: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'
};
const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;
const NAV = [['lead', '주도주'], ['hold', '보유'], ['watch', '관심'], ['find', '찾기'], ['help', '도움말']]
  .map(([t, n], k) => `<button data-tab="${t}"${k ? '' : ' class="on"'} aria-label="${n}">${ico(t)}<span>${n}</span></button>`).join('');
function applyTheme() {
  const v = localStorage.getItem('mf_theme') || 'dark'; document.documentElement.dataset.theme = v;
  const light = v === 'light' || (v === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = light ? '#f2f4f6' : '#0b0f17';
}
applyTheme(); try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme); } catch {}
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
  const nv = document.querySelector('header nav'); if (nv && !nv.querySelector('svg')) nv.innerHTML = NAV;
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
