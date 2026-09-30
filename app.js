/* 值班速查 PWA — app.js (vanilla, no build step) */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const main = $('#main'), titleEl = $('#title'), backBtn = $('#btn-back'), ptChip = $('#pt-chip'), toastEl = $('#toast');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- data ----------
const DATA = { chapters: [], flows: [], flowById: {}, chapterById: {}, entries: [] };
async function loadData() {
  const [ch, idx] = await Promise.all([fetch('data/chapters.json').then(r => r.json()), fetch('data/flows/index.json').then(r => r.json())]);
  DATA.chapters = ch; ch.forEach(c => DATA.chapterById[c.id] = c);
  const flows = await Promise.all(idx.files.map(f => fetch('data/flows/' + f).then(r => r.json())));
  DATA.flows = flows; flows.forEach(f => DATA.flowById[f.id] = f);
  DATA.entries = [];
  flows.forEach(f => (f.entries || []).forEach((e, i) => DATA.entries.push({ ...e, flow: f.id, flowTitle: f.title, chapter: f.chapter, idx: i })));
  // mark result nodes whose expressions depend on flow variables (unsafe to open directly)
  const BUILTIN = new Set(['wt', 'age', 'sex', 'cr', 'crcl', 'ibw', 'round', 'min', 'max', 'clamp', 'Math', 'true', 'false', 'null', 'undefined']);
  flows.forEach(f => Object.values(f.nodes).forEach(n => {
    if (n.type !== 'result') return;
    const exprs = [];
    const grab = (s) => { for (const m of String(s || '').matchAll(/\{([^{}]+)\}/g)) exprs.push(m[1]); };
    [n.title, n.summary, ...(n.steps || []), ...(n.watch || []), ...(n.call || []), ...(n.ddx || [])].forEach(grab);
    (n.orders || []).forEach(o => { ['drug', 'dose', 'route', 'freq', 'note', 'with', 'alt'].forEach(k => grab(o[k])); if (o.cond) exprs.push(o.cond); });
    n._needsVars = exprs.some(e => (e.replace(/'[^']*'|"[^"]*"/g, '').match(/[A-Za-z_]\w*/g) || []).some(id => !BUILTIN.has(id)));
  }));
}

// ---------- patient ----------
const PT_KEY = 'oncall.patient.v1';
const patient = Object.assign({ wt: null, age: null, sex: 'M', cr: null }, safeJSON(localStorage.getItem(PT_KEY)));
function safeJSON(s) { try { return s ? JSON.parse(s) : {}; } catch { return {}; } }
function savePatient() { try { localStorage.setItem(PT_KEY, JSON.stringify(patient)); } catch {} renderChip(); }
function ptVars() {
  const wt = patient.wt || 60, age = patient.age || 65, sex = patient.sex || 'M', cr = patient.cr || 1.0;
  let crcl = ((140 - age) * wt) / (72 * cr); if (sex === 'F') crcl *= 0.85;
  return { wt, age, sex, cr, crcl: Math.round(crcl), ibw: null, _default: !patient.wt };
}
function renderChip() {
  const v = ptVars();
  ptChip.textContent = `${v.wt} kg · CrCl ${v.crcl}${patient.cr ? '' : '?'}`;
  ptChip.classList.toggle('default', !patient.wt);
}

// ---------- expression engine ----------
const HELPERS = { round: (x, d = 0) => { const m = Math.pow(10, d); return Math.round(x * m) / m; }, min: Math.min, max: Math.max, clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)), Math };
function evalExpr(expr, vars) {
  const scope = { ...HELPERS, ...vars };
  const keys = Object.keys(scope).filter(k => /^[a-zA-Z_$][\w$]*$/.test(k));
  for (let i = 0; i < 12; i++) {
    try { return new Function(...keys, `"use strict"; return (${expr});`)(...keys.map(k => scope[k])); }
    catch (e) {
      const m = /^(\w+) is not defined/.exec(e.message || '');
      if (m && !(m[1] in scope)) { scope[m[1]] = undefined; keys.push(m[1]); continue; } // undefined flow vars are falsy
      console.warn('expr error', expr, e); return '?';
    }
  }
  return '?';
}
function tpl(s, vars) { return String(s ?? '').replace(/\{([^{}]+)\}/g, (_, e) => { const v = evalExpr(e, vars); return v === undefined || v === null ? '?' : String(v); }); }
function md(s) { // inline markdown → html
  let t = esc(s);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
  return t;
}
function truthy(cond, vars) { if (cond === undefined || cond === null || cond === '') return true; const v = evalExpr(String(cond), vars); return v === '?' ? false : !!v; }

// ---------- router ----------
const state = { tab: 'home', route: null, flowRun: null, scroll: {} };
const MEM = !!window.MEMORY_ROUTER; state.stack = [];
function curHash() { return MEM ? (state.h || '#/home') : location.hash; }
function go(hash) { if (!hash.startsWith('#')) hash = '#' + hash; if (MEM) { state.stack.push(state.h || '#/home'); state.h = hash; route(); } else location.hash = hash; }
function goBack() { if (MEM) { state.h = state.stack.pop() || '#/home'; route(); } else history.length > 1 ? history.back() : go('/home'); }
window.addEventListener('hashchange', route);
function route() {
  const h = curHash().replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const view = parts[0] || 'home';
  state.route = { view, parts, params };
  window.scrollTo(0, 0);
  const tabs = { home: 'home', search: 'search', calc: 'calc', chapters: 'chapters', ch: 'chapters', flow: 'home', about: 'home' };
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === (tabs[view] || 'home')));
  backBtn.style.visibility = (view === 'home' || view === 'search' || view === 'calc' || view === 'chapters') && parts.length <= 1 ? 'hidden' : 'visible';
  const R = { home: renderHome, search: renderSearch, calc: renderCalc, chapters: renderChapters, ch: renderChapter, flow: renderFlow, about: renderAbout };
  (R[view] || renderHome)(parts, params);
}
backBtn.onclick = () => { if (state.route.view === 'flow' && state.flowRun && state.flowRun.hist.length > 1) { flowBack(); } else goBack(); };
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => go('/' + b.dataset.tab));
ptChip.onclick = () => openPatientSheet();

function setTitle(t) { titleEl.textContent = t; document.title = t === '值班速查' ? t : t + ' · 值班速查'; }
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), 1600); }

// ---------- home ----------
const GROUP_ORDER = ['生命徵象', '頭部', '胸部', '腹部', '水與尿', '皮膚四肢', '症狀治療', '檢驗異常', '管路', '急救'];
function renderHome() {
  setTitle('值班速查');
  const v = ptVars();
  let html = `<div class="search" role="search"><span class="muted">🔍</span><input id="home-q" type="search" placeholder="輸入情境、診斷、藥名…（例：血壓高、DKA、Lokelma）" enterkeyhint="search" autocomplete="off"></div>`;
  html += `<div id="home-hits"></div>`;
  if (v._default) html += `<div class="card small" style="border-color:var(--orange);margin-bottom:8px"><b>尚未設定病人參數</b>：劑量目前以 60 kg、65 歲、Cr 1.0 計算。點右上角輸入體重／年齡／Cr，醫囑會自動換算。</div>`;
  const recent = getRecent();
  if (recent.length) html += `<h2 class="sec">最近使用</h2><div class="chips">${recent.map((r, i) => `<button data-r="${i}">${esc(r.label)}</button>`).join('')}</div>`;
  const groups = {};
  DATA.entries.filter(e => e.type === 'symptom').forEach(e => { (groups[e.group] ||= []).push(e); });
  let sel = ''; try { sel = localStorage.getItem('oncall.group') || ''; } catch {}
  if (!groups[sel]) sel = GROUP_ORDER.find(g => groups[g]);
  html += `<h2 class="sec">臨床狀況（護理師打電話說…）</h2><div class="chips" id="grp">${GROUP_ORDER.filter(g => groups[g]).map(g => `<button data-g="${esc(g)}" class="${g === sel ? 'on' : ''}">${esc(g)}<span class="n">${groups[g].length}</span></button>`).join('')}</div><div class="grid" id="sym-grid"></div>`;
  const byCh = {};
  DATA.entries.filter(e => e.type === 'diagnosis').forEach(e => { (byCh[e.flow] ||= []).push(e); });
  html += `<h2 class="sec">臨床可能診斷（直接給處置與醫囑）</h2><div class="dxlist">`;
  DATA.flows.forEach(f => { const list = byCh[f.id]; if (!list) return; html += `<details class="dx"><summary><span class="badge dx">Ch${esc(f.chapter)}</span> ${esc(f.title)}<span class="n">${list.length}</span></summary><div class="list">${list.map(e => `<button data-flow="${e.flow}" data-start="${esc(e.start)}" data-label="${esc(e.label)}"><span class="t">${esc(e.label)}</span><span class="k">›</span></button>`).join('')}</div></details>`; });
  html += `</div><p class="center small muted" style="margin-top:20px"><a href="#/about" data-go="/about">關於本 App・免責聲明</a></p>`;
  main.innerHTML = html;
  const grid = $('#sym-grid');
  const showGroup = (g) => { grid.innerHTML = (groups[g] || []).map(e => `<button data-flow="${e.flow}" data-start="${esc(e.start)}" data-label="${esc(e.label)}">${esc(e.label)}<span class="g">Ch${e.chapter} ${esc(e.flowTitle)}</span></button>`).join(''); grid.querySelectorAll('button[data-flow]').forEach(b => b.onclick = () => startFlow(b.dataset.flow, b.dataset.start, b.dataset.label)); main.querySelectorAll('#grp button').forEach(b => b.classList.toggle('on', b.dataset.g === g)); try { localStorage.setItem('oncall.group', g); } catch {} };
  showGroup(sel);
  main.querySelectorAll('#grp button').forEach(b => b.onclick = () => showGroup(b.dataset.g));
  main.querySelectorAll('.dxlist button[data-flow]').forEach(b => b.onclick = () => startFlow(b.dataset.flow, b.dataset.start, b.dataset.label));
  main.querySelectorAll('button[data-r]').forEach(b => b.onclick = () => { const r = recent[+b.dataset.r]; startFlow(r.flow, r.start, r.label); });
  main.querySelectorAll('a[data-go]').forEach(a => a.onclick = (e) => { e.preventDefault(); go(a.dataset.go); });
  const q = $('#home-q');
  q.oninput = () => { const box = $('#home-hits'); const v = q.value.trim(); const hits = v ? search(v).slice(0, 8) : []; box._hits = hits; box.innerHTML = v ? renderHits(hits, v) : ''; bindHits(box); };
  q.onkeydown = (ev) => { if (ev.key === 'Enter') { go('/search?q=' + encodeURIComponent(q.value.trim())); } };
}
const RECENT_KEY = 'oncall.recent.v1';
function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
function pushRecent(item) { const r = getRecent().filter(x => !(x.flow === item.flow && x.start === item.start)); r.unshift(item); try { localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 8))); } catch {} }

// ---------- search ----------
function norm(s) { return String(s || '').toLowerCase().replace(/[\s　,，、/／()（）]/g, ''); }
function search(qraw) {
  const q = norm(qraw); if (!q) return [];
  const terms = qraw.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  DATA.entries.forEach(e => {
    const hay = norm([e.label, e.flowTitle, ...(e.keywords || [])].join(' '));
    const score = terms.every(t => hay.includes(norm(t))) ? (norm(e.label).includes(q) ? 100 : 80) : 0;
    if (score) hits.push({ kind: 'entry', score, e, title: e.label, sub: `${e.type === 'symptom' ? '情境' : '診斷'} · Ch${e.chapter} ${e.flowTitle}`, action: () => startFlow(e.flow, e.start, e.label) });
  });
  DATA.flows.forEach(f => Object.entries(f.nodes).forEach(([nid, n]) => {
    if (n.type !== 'result') return;
    const hay = norm([n.title, n.summary, ...(n.orders || []).map(o => o.drug)].join(' '));
    if (terms.every(t => hay.includes(norm(t)))) {
      const direct = !n._needsVars, e0 = (f.entries || [])[0];
      hits.push({ kind: 'result', score: (norm(n.title).includes(q) ? 70 : 50) - (direct ? 0 : 5), title: n.title, sub: `處置 · Ch${f.chapter} ${f.title}${direct ? '' : '（需先回答幾個問題）'}`, action: () => direct ? startFlow(f.id, nid, n.title) : startFlow(f.id, e0.start, e0.label) });
    }
  }));
  DATA.chapters.forEach(c => {
    (c.toc || []).forEach(h => { if (terms.every(t => norm(h.title).includes(norm(t)))) hits.push({ kind: 'toc', score: 45, title: h.title, sub: `章節 · ${c.title}`, action: () => go(`/ch/${c.id}?h=${h.id}`) }); });
    const lines = c.text.split('\n'); let count = 0;
    for (const ln of lines) {
      if (count >= 3) break;
      const l = ln.toLowerCase();
      if (terms.every(t => l.includes(t) || norm(l).includes(norm(t)))) {
        count++;
        hits.push({ kind: 'text', score: 20, title: c.title, sub: ln.slice(0, 160), action: () => go(`/ch/${c.id}?q=${encodeURIComponent(terms[0])}`) });
      }
    }
  });
  return hits.sort((a, b) => b.score - a.score);
}
function renderHits(hits, q) {
  if (!hits.length) return `<div class="empty">找不到「${esc(q)}」</div>`;
  return hits.map((h, i) => `<div class="hit" data-i="${i}"><div class="h">${hl(esc(h.title), q)}</div><div class="s">${hl(esc(h.sub), q)}</div></div>`).join('');
}
function hl(s, q) { const t = q.split(/\s+/).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); if (!t.length) return s; return s.replace(new RegExp('(' + t.join('|') + ')', 'gi'), '<span class="hl">$1</span>'); }
function bindHits(container) { const q = container._q || ''; container.querySelectorAll('.hit').forEach(el => el.onclick = () => container._hits[+el.dataset.i].action()); }
function renderSearch(parts, params) {
  setTitle('搜尋');
  const q = params.q || '';
  main.innerHTML = `<div class="search"><span class="muted">🔍</span><input id="q" type="search" value="${esc(q)}" placeholder="情境、診斷、藥物、檢驗值…" enterkeyhint="search" autocomplete="off"></div><div id="hits"></div>`;
  const inp = $('#q'), box = $('#hits');
  const run = () => { const v = inp.value.trim(); const hits = v ? search(v) : []; box._hits = hits; box.innerHTML = v ? renderHits(hits.slice(0, 60), v) : `<div class="empty">輸入關鍵字，同時搜尋情境入口、處置結果與全書內文</div>`; bindHits(box); };
  inp.oninput = run; run(); if (!q) inp.focus();
}

// ---------- flow engine ----------
function startFlow(flowId, nodeId, label) {
  const f = DATA.flowById[flowId]; if (!f) return;
  if (label) pushRecent({ flow: flowId, start: nodeId, label });
  state.flowRun = { flow: f, hist: [{ node: nodeId, vars: {}, label: label || f.title }], multi: {} };
  go(`/flow/${flowId}/${nodeId}`);
}
function flowBack() { const r = state.flowRun; if (r.hist.length > 1) { r.hist.pop(); go(`/flow/${r.flow.id}/${r.hist[r.hist.length - 1].node}`); } }
function flowGoto(nodeId, answerLabel, setVars) {
  const r = state.flowRun; const cur = r.hist[r.hist.length - 1];
  cur.answer = answerLabel;
  r.hist.push({ node: nodeId, vars: { ...cur.vars, ...(setVars || {}) }, label: null });
  go(`/flow/${r.flow.id}/${nodeId}`);
}
function pickBranch(branches, vars) {
  for (const b of branches || []) { if ('else' in b) return b.else; if (truthy(b.if, vars)) return b.next; }
  return null;
}
function renderFlow(parts) {
  const [, flowId, nodeId] = parts;
  const f = DATA.flowById[flowId]; if (!f) { go('/home'); return; }
  if (!state.flowRun || state.flowRun.flow.id !== flowId) state.flowRun = { flow: f, hist: [{ node: nodeId, vars: {}, label: f.title }], multi: {} };
  const r = state.flowRun;
  // sync hist with URL (browser back)
  const idx = r.hist.findIndex(h => h.node === nodeId);
  if (idx >= 0) r.hist = r.hist.slice(0, idx + 1); else r.hist.push({ node: nodeId, vars: { ...r.hist[r.hist.length - 1].vars }, label: null });
  const cur = r.hist[r.hist.length - 1];
  const node = f.nodes[nodeId]; if (!node) { main.innerHTML = `<div class="empty">找不到節點 ${esc(nodeId)}</div>`; return; }
  setTitle(`Ch${f.chapter} ${f.title}`);
  const vars = { ...ptVars(), ...cur.vars };
  let html = ''; let prev;
  if (r.hist.length > 1) {
    html += `<div class="crumbs">` + r.hist.slice(0, -1).map((h, i) => `<button data-i="${i}">${esc(short(f.nodes[h.node]?.title || h.label || ''))}${h.answer ? ` → <b>${esc(short(h.answer))}</b>` : ''}</button>`).join('') + `</div>`;
  } else html += `<div class="crumbs"><button disabled><b>${esc(cur.label || f.title)}</b></button></div>`;
  html += `<div class="card">`;
  if (node.type === 'choice') {
    html += `<div class="q">${md(node.title)}</div>${node.help ? `<div class="help">${md(node.help)}</div>` : ''}<div class="opts">`;
    node.options.forEach((o, i) => { if (truthy(o.cond, vars)) html += `<button data-o="${i}">${md(tpl(o.label, vars))}</button>`; });
    html += `</div>`;
  } else if (node.type === 'multi') {
    const sel = r.multi[nodeId] || (r.multi[nodeId] = new Set());
    html += `<div class="q">${md(node.title)}</div><div class="help">${node.help ? md(node.help) + '　' : ''}可複選，選完按「繼續」</div><div class="opts">`;
    node.options.forEach((o, i) => { html += `<button data-m="${i}" class="${sel.has(i) ? 'sel' : ''}"><span class="chk">${sel.has(i) ? '✓' : ''}</span><span>${md(tpl(o.label, vars))}</span></button>`; });
    html += `</div><div style="height:10px"></div><button class="btn" id="multi-go">繼續${sel.size ? `（已選 ${sel.size}）` : '（都沒有）'}</button>`;
  } else if (node.type === 'number') {
    prev = cur.vars[node.var];
    html += `<div class="q">${md(node.title)}</div>${node.help ? `<div class="help">${md(node.help)}</div>` : ''}
      <div class="numrow"><input id="num" type="number" inputmode="decimal" step="${node.step || 'any'}" value="${prev ?? ''}" placeholder="—"><span class="unit">${esc(node.unit || '')}</span></div>`;
    if (node.quick && node.quick.length) html += `<div class="quick">${node.quick.map(v => `<button data-q="${v}">${v}</button>`).join('')}</div>`;
    html += `<button class="btn" id="num-go">下一步</button>`;
  } else if (node.type === 'info') {
    html += `<div class="q">${md(node.title)}</div><ul class="plain info-body">${(node.body || []).map(b => `<li>${md(tpl(b, vars))}</li>`).join('')}</ul><div style="height:12px"></div><button class="btn" id="info-go">${esc(node.button || '下一步')}</button>`;
  } else if (node.type === 'result') {
    html += renderResult(node, vars, f);
  }
  html += `</div>`;
  if (node.type === 'result' && node.next && node.next.length) {
    html += `<h2 class="sec">後續／相關</h2><div class="res-next">` + node.next.map((n, i) => `<button class="btn sec" data-n="${i}">${esc(n.label)}</button>`).join('') + `</div>`;
  }
  html += `<div class="kbd-space"></div>`;
  main.innerHTML = html;
  main.querySelectorAll('.crumbs button[data-i]').forEach(b => b.onclick = () => { r.hist = r.hist.slice(0, +b.dataset.i + 1); go(`/flow/${f.id}/${r.hist[r.hist.length - 1].node}`); });
  main.querySelectorAll('button[data-o]').forEach(b => b.onclick = () => { const o = node.options[+b.dataset.o]; flowGoto(o.next, o.label, o.set); });
  main.querySelectorAll('button[data-m]').forEach(b => b.onclick = () => { const i = +b.dataset.m; const sel = r.multi[nodeId]; sel.has(i) ? sel.delete(i) : sel.add(i); renderFlow(parts); });
  const mg = $('#multi-go'); if (mg) mg.onclick = () => {
    const sel = r.multi[nodeId]; const set = {}; const labels = [];
    node.options.forEach((o, i) => { Object.entries(o.set || {}).forEach(([k]) => { if (!(k in set)) set[k] = false; }); if (sel.has(i)) { Object.assign(set, o.set || {}); labels.push(o.label); } });
    const v2 = { ...vars, ...set };
    const next = typeof node.next === 'string' ? node.next : pickBranch(node.branches, v2);
    if (!next) { toast('沒有符合的分支'); return; }
    flowGoto(next, labels.length ? labels.join('、') : '都沒有', set);
  };
  const ng = $('#num-go'); if (ng) {
    const inp = $('#num');
    const submit = () => { const val = parseFloat(inp.value); if (isNaN(val)) { inp.focus(); toast('請輸入數值'); return; } const set = { [node.var]: val }; const next = pickBranch(node.branches, { ...vars, ...set }); if (!next) { toast('沒有符合的分支'); return; } flowGoto(next, `${val} ${node.unit || ''}`.trim(), set); };
    ng.onclick = submit; inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    main.querySelectorAll('button[data-q]').forEach(b => b.onclick = () => { inp.value = b.dataset.q; submit(); });
    if (prev === undefined) setTimeout(() => inp.focus(), 50);
  }
  const ig = $('#info-go'); if (ig) ig.onclick = () => flowGoto(node.next, null, null);
  main.querySelectorAll('button[data-n]').forEach(b => b.onclick = () => { const n = node.next[+b.dataset.n]; flowGoto(n.next, n.label, n.set); });
  bindResult(node, vars, f);
}
function short(s) { s = String(s).replace(/\*\*/g, ''); return s.length > 22 ? s.slice(0, 21) + '…' : s; }

// ---------- result rendering & orders ----------
function orderLine(o, vars) {
  const drug = tpl(o.drug, vars), dose = tpl(o.dose, vars), route = tpl(o.route, vars), freq = tpl(o.freq, vars);
  return { drug, dose, route, freq, with: o.with ? tpl(o.with, vars) : '', note: o.note ? tpl(o.note, vars) : '', alt: o.alt ? tpl(o.alt, vars) : '' };
}
function ordersText(node, vars) {
  const v = ptVars();
  const lines = (node.orders || []).filter(o => truthy(o.cond, vars)).map(o => { const l = orderLine(o, vars); return `${l.drug} ${l.dose} ${l.route} ${l.freq}${l.with ? `\n  + ${l.with}` : ''}${l.note ? `\n  （${l.note}）` : ''}`; });
  return `【${node.title.replace(/\*\*/g, '')}】\n病人：${v.wt} kg${patient.age ? `、${v.age} 歲` : ''}${patient.cr ? `、Cr ${v.cr}（CrCl ≈ ${v.crcl}）` : ''}\n` + lines.join('\n');
}
function renderResult(node, vars, f) {
  const v = ptVars();
  let html = `<div class="res-head ${esc(node.urgency || 'green')}"><span class="badge ${esc(node.urgency || 'green')}">${{ red: '立刻到床邊・叫人', orange: '30 分鐘內處理', green: '可觀察／交班' }[node.urgency] || ''}</span><h2>${md(node.title)}</h2></div>`;
  if (node.summary) html += `<div class="summary">${md(tpl(node.summary, vars))}</div>`;
  if (node.steps && node.steps.length) html += `<div class="sec-title">現在就做</div><ol class="steps">${node.steps.map(s => `<li>${md(tpl(s, vars))}</li>`).join('')}</ol>`;
  const orders = (node.orders || []).filter(o => truthy(o.cond, vars));
  if (orders.length) {
    html += `<div class="sec-title">醫囑（${v.wt} kg${patient.cr ? `・CrCl ${v.crcl}` : ''}）<button class="btn sm sec" id="copy-orders">複製全部</button></div><div class="orders">`;
    orders.forEach(o => { const l = orderLine(o, vars); html += `<div class="order"><div class="line">${esc(l.drug)} <span class="dose">${esc(l.dose)}</span> ${esc(l.route)} ${esc(l.freq)}</div>${l.with ? `<div class="with">＋ ${esc(l.with)}</div>` : ''}${l.note ? `<div class="note">${md(l.note)}</div>` : ''}${l.alt ? `<div class="alt">替代：${esc(l.alt)}</div>` : ''}</div>`; });
    html += `</div><div class="calc-note">劑量依病人參數自動換算（${v._default ? '<b>目前為預設 60 kg</b>，點右上角修改' : `體重 ${v.wt} kg、Cr ${v.cr}`}）；仍請依仿單、腎肝功能與院內規範確認。</div>`;
  }
  if (node.watch && node.watch.length) html += `<div class="sec-title">監測／注意</div><ul class="plain">${node.watch.map(s => `<li>${md(tpl(s, vars))}</li>`).join('')}</ul>`;
  if (node.ddx && node.ddx.length) html += `<div class="sec-title">別漏掉</div><ul class="plain">${node.ddx.map(s => `<li>${md(tpl(s, vars))}</li>`).join('')}</ul>`;
  if (node.call && node.call.length) html += `<div class="sec-title" style="color:var(--phone)">何時聯絡後線</div><ul class="plain">${node.call.map(s => `<li>${md(tpl(s, vars))}</li>`).join('')}</ul>`;
  if (node.refs && node.refs.length) html += `<div class="sec-title">指南原文</div><div class="refs">${node.refs.map((r, i) => `<button data-ref="${i}">Ch${esc(r.ch)} › ${esc(r.q)}</button>`).join('')}</div>`;
  return html;
}
function bindResult(node, vars, f) {
  const cp = $('#copy-orders'); if (cp) cp.onclick = () => copyText(ordersText(node, vars));
  main.querySelectorAll('button[data-ref]').forEach(b => b.onclick = () => { const r = node.refs[+b.dataset.ref]; go(`/ch/${r.ch}?q=${encodeURIComponent(r.q)}`); });
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('已複製醫囑'); }
  catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('已複製醫囑'); } catch { toast('無法複製'); } ta.remove(); }
}

// ---------- chapters ----------
function renderChapters() {
  setTitle('章節');
  const parts = [['頭部問題', ['01', '02', '03', '04', '05']], ['胸部問題', ['06', '07']], ['腹部問題', ['08', '09']], ['水與尿', ['10', '11', '12', '13']], ['皮膚、軟組織與四肢', ['14', '15', '16']], ['生命徵象變化', ['17', '18', '19', '20', '21']], ['症狀治療', ['22', '23', '24', '25', '26', '27']], ['檢驗異常', ['28', '29', '30', '31', '32', '33', '34', '35', '36']], ['管路與急救', ['37', '38']], ['附錄', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']], ['前言・修訂對照', ['00_front']]];
  let html = '';
  parts.forEach(([g, ids]) => { html += `<h2 class="sec">${g}</h2><div class="list">`; ids.forEach(id => { const c = DATA.chapterById[id]; if (c) html += `<button data-ch="${id}"><span class="t">${esc(c.title)}</span><span class="k">›</span></button>`; }); html += `</div>`; });
  main.innerHTML = html;
  main.querySelectorAll('button[data-ch]').forEach(b => b.onclick = () => go('/ch/' + b.dataset.ch));
}
function renderChapter(parts, params) {
  const c = DATA.chapterById[parts[1]]; if (!c) { go('/chapters'); return; }
  setTitle(c.title);
  const toc = (c.toc || []).filter(h => h.level >= 2 && h.level <= 3);
  let html = `<details class="toc-box card" ${params.h || params.q ? '' : 'open'}><summary>本章目錄</summary><div class="toc">${toc.map(h => `<button class="l${h.level}" data-h="${h.id}">${esc(h.title)}</button>`).join('')}</div></details>`;
  html += `<div class="card reader">${c.html}</div>`;
  main.innerHTML = html;
  main.querySelectorAll('.toc button').forEach(b => b.onclick = () => { const el = document.getElementById(b.dataset.h); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } });
  const jumpTo = (el) => { if (!el) return; setTimeout(() => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }, 30); };
  if (params.h) jumpTo(document.getElementById(params.h));
  else if (params.q) {
    const q = params.q.toLowerCase(); const reader = main.querySelector('.reader');
    const walker = document.createTreeWalker(reader, NodeFilter.SHOW_TEXT); let found = null; let n;
    while ((n = walker.nextNode())) { if (n.nodeValue.toLowerCase().includes(q)) { found = n; break; } }
    if (found) { const i = found.nodeValue.toLowerCase().indexOf(q); const m = document.createElement('mark'); const after = found.splitText(i); after.splitText(q.length); m.appendChild(after.cloneNode(true)); after.parentNode.replaceChild(m, after); jumpTo(m); }
    else { const h = (c.toc || []).find(x => norm(x.title).includes(norm(params.q))); if (h) jumpTo(document.getElementById(h.id)); }
  }
}

// ---------- calculators ----------
const CALCS = [
  { id: 'crcl', name: 'CrCl（Cockcroft-Gault）／IBW', fields: [['age', '年齡', 'y'], ['wt', '體重', 'kg'], ['ht', '身高（選填）', 'cm'], ['cr', 'Cr', 'mg/dL'], ['sex', '性別', 'sex']],
    calc: (v) => { const crcl = ((140 - v.age) * v.wt) / (72 * v.cr) * (v.sex === 'F' ? 0.85 : 1); const ibw = v.ht ? (v.sex === 'F' ? 45.5 : 50) + 0.91 * (v.ht - 152.4) : null; const abw = ibw && v.wt > 1.2 * ibw ? ibw + 0.4 * (v.wt - ibw) : null; return [`CrCl ≈ <b>${r(crcl)}</b> mL/min`, ibw ? `IBW ${r(ibw, 1)} kg${abw ? `，肥胖校正體重 ${r(abw, 1)} kg（藥物劑量用）` : ''}` : '', `分級：${crcl >= 90 ? '≥ 90' : crcl >= 60 ? '60–89' : crcl >= 30 ? '30–59（多數抗生素開始減量）' : crcl >= 15 ? '15–29' : '< 15（透析／依 HD 劑量）'}`, 'AKI 時 Cr 不穩定，公式高估；第一劑（loading）不減量。']; } },
  { id: 'na', name: '矯正鈉（高血糖）／自由水缺乏／3% NaCl', fields: [['na', '測得 Na', 'mEq/L'], ['glu', '血糖', 'mg/dL'], ['wt', '體重', 'kg'], ['sex', '性別', 'sex'], ['age', '年齡', 'y']],
    calc: (v) => { const corr = v.na + 1.6 * Math.max(0, (v.glu - 100)) / 100; const corr24 = v.na + 2.4 * Math.max(0, (v.glu - 100)) / 100; const tbw = v.wt * (v.sex === 'F' ? (v.age >= 65 ? 0.45 : 0.5) : (v.age >= 65 ? 0.5 : 0.6)); const fwd = v.na > 140 ? tbw * (v.na / 140 - 1) : 0; const d5 = (0 - v.na) / (tbw + 1); const hs = (513 - v.na) / (tbw + 1); return [`矯正 Na（×1.6）≈ <b>${r(corr, 1)}</b>；（×2.4）≈ ${r(corr24, 1)} mEq/L`, `TBW ≈ ${r(tbw, 1)} L`, v.na > 145 ? `自由水缺乏 ≈ <b>${r(fwd, 1)} L</b>；1 L D5W 約降 Na ${r(-d5, 1)}；慢性每日降 ≤ 10（急性可 1 mEq/L/hr）` : '', v.na < 135 ? `1 L 3% NaCl 約升 Na ${r(hs, 1)}；150 mL bolus 約升 ${r(hs * 0.15, 1)}（目標 1 小時 4–6，每日 ≤ 8，高風險 ≤ 6）` : '']; } },
  { id: 'ca', name: '矯正鈣（白蛋白）', fields: [['ca', '總鈣', 'mg/dL'], ['alb', '白蛋白', 'g/dL']], calc: (v) => [`矯正 Ca ≈ <b>${r(v.ca + 0.8 * (4 - v.alb), 2)}</b> mg/dL`, '有疑慮驗游離鈣（iCa 正常 1.1–1.3 mmol/L）'] },
  { id: 'ag', name: '陰離子間隙／Delta ratio／Winter', fields: [['na', 'Na', 'mEq/L'], ['cl', 'Cl', 'mEq/L'], ['hco3', 'HCO₃', 'mEq/L'], ['alb', '白蛋白', 'g/dL'], ['pco2', 'PaCO₂（選填）', 'mmHg']],
    calc: (v) => { const ag = v.na - v.cl - v.hco3; const exp = v.alb ? 2.5 * v.alb : 12; const dag = ag - exp; const dr = dag / (24 - v.hco3); const win = 1.5 * v.hco3 + 8; return [`AG = <b>${r(ag)}</b>（預期 ≈ ${r(exp)}，albumin 校正）`, dag > 2 ? `ΔAG/ΔHCO₃ = ${r(dr, 2)} → ${dr < 1 ? '合併正常 AG 酸中毒' : dr > 2 ? '合併代謝性鹼中毒' : '單純高 AG 酸中毒'}` : '', `Winter：預期 PaCO₂ ${r(win - 2)}–${r(win + 2)}${v.pco2 ? `（實測 ${v.pco2}：${v.pco2 > win + 2 ? '合併呼吸性酸中毒' : v.pco2 < win - 2 ? '合併呼吸性鹼中毒' : '代償適當'}）` : ''}`]; } },
  { id: 'osm', name: '血漿滲透壓／滲透壓間隙', fields: [['na', 'Na', 'mEq/L'], ['glu', '血糖', 'mg/dL'], ['bun', 'BUN', 'mg/dL'], ['etoh', '酒精（選填）', 'mg/dL'], ['meas', '測得 Osm（選填）', 'mOsm/kg']],
    calc: (v) => { const calc = 2 * v.na + v.glu / 18 + v.bun / 2.8 + (v.etoh || 0) / 4.6; return [`計算 Osm ≈ <b>${r(calc)}</b> mOsm/kg`, `有效 Osm ≈ ${r(2 * v.na + v.glu / 18)}（HHS > 320）`, v.meas ? `滲透壓間隙 = ${r(v.meas - calc)}（> 10 想醇類中毒）` : '']; } },
  { id: 'map', name: 'MAP／Shock index', fields: [['sbp', 'SBP', 'mmHg'], ['dbp', 'DBP', 'mmHg'], ['hr', 'HR', '/min']], calc: (v) => [`MAP ≈ <b>${r((v.sbp + 2 * v.dbp) / 3)}</b> mmHg（目標 ≥ 65）`, v.hr ? `Shock index = ${r(v.hr / v.sbp, 2)}（> 0.9 警訊）` : ''] },
  { id: 'qtc', name: 'QTc（Bazett／Fridericia）', fields: [['qt', 'QT', 'ms'], ['hr', 'HR', '/min']], calc: (v) => { const rr = 60 / v.hr; return [`Bazett QTc = <b>${r(v.qt / Math.sqrt(rr))}</b> ms`, `Fridericia QTc = ${r(v.qt / Math.cbrt(rr))} ms（HR > 100 或 < 60 時較準）`, '正常 < 450（男）／< 460（女）；> 500 TdP 風險'] } },
  { id: 'aa', name: 'A–a gradient／P/F', fields: [['fio2', 'FiO₂（0.21–1）', ''], ['pao2', 'PaO₂', 'mmHg'], ['paco2', 'PaCO₂', 'mmHg'], ['age', '年齡', 'y']], calc: (v) => { const pao2a = v.fio2 * 713 - v.paco2 / 0.8; const aa = pao2a - v.pao2; return [`PAO₂ ≈ ${r(pao2a)}；A–a ≈ <b>${r(aa)}</b>（正常 ≈ ${r(4 + v.age / 4)}）`, `P/F = ${r(v.pao2 / v.fio2)}（< 300 輕、< 200 中、< 100 重 ARDS）`] } },
  { id: 'drip', name: '滴速換算（mcg/kg/min ↔ mL/hr）', fields: [['dose', '劑量', 'mcg/kg/min'], ['wt', '體重', 'kg'], ['mg', '藥量', 'mg'], ['ml', '總體積', 'mL']], calc: (v) => { const conc = v.mg * 1000 / v.ml; const mlhr = v.dose * v.wt * 60 / conc; return [`濃度 ${r(conc, 1)} mcg/mL`, `${v.dose} mcg/kg/min × ${v.wt} kg = <b>${r(mlhr, 1)} mL/hr</b>`, `反推：1 mL/hr = ${r(conc / 60 / v.wt, 3)} mcg/kg/min`] } },
  { id: 'dripmin', name: '滴速換算（mcg/min 或 mg/hr → mL/hr）', fields: [['dose', '劑量', 'mcg/min'], ['mg', '藥量', 'mg'], ['ml', '總體積', 'mL']], calc: (v) => { const conc = v.mg * 1000 / v.ml; return [`濃度 ${r(conc, 1)} mcg/mL`, `${v.dose} mcg/min = <b>${r(v.dose * 60 / conc, 1)} mL/hr</b>`, `若劑量單位是 mg/hr：${v.dose} mg/hr = ${r(v.dose * 1000 / conc, 1)} mL/hr`] } },
  { id: 'fena', name: 'FENa／FEUrea', fields: [['una', '尿 Na', 'mEq/L'], ['pna', '血 Na', 'mEq/L'], ['ucr', '尿 Cr', 'mg/dL'], ['pcr', '血 Cr', 'mg/dL'], ['uun', '尿 urea N（選填）', 'mg/dL'], ['bun', 'BUN（選填）', 'mg/dL']], calc: (v) => [`FENa = <b>${r(100 * v.una * v.pcr / (v.pna * v.ucr), 2)}%</b>（< 1% 腎前；> 2% ATN；利尿劑下不準）`, v.uun && v.bun ? `FEUrea = ${r(100 * v.uun * v.pcr / (v.bun * v.ucr), 1)}%（≤ 35% 腎前；> 50% ATN）` : ''] },
  { id: 'k', name: '低血鉀補充量估算', fields: [['k', '血鉀', 'mEq/L'], ['wt', '體重', 'kg']], calc: (v) => { const d = Math.max(0, 4 - v.k); return [`總體缺乏約 <b>${r(d * 200)}–${r(d * 400)} mEq</b>（每降 1 ≈ 缺 200–400）`, '口服 20–40 mEq q4–6h；周邊 ≤ 10 mEq/hr、CVC ≤ 20 mEq/hr；先補 Mg'] } },
  { id: 'insulin', name: '住院胰島素起始劑量', fields: [['wt', '體重', 'kg']], calc: (v) => [`TDD 0.3–0.5 U/kg ≈ <b>${r(v.wt * 0.3)}–${r(v.wt * 0.5)} U/日</b>`, `基礎 50% ≈ ${r(v.wt * 0.15)}–${r(v.wt * 0.25)} U；餐前分 3 次各 ${r(v.wt * 0.05)}–${r(v.wt * 0.08)} U`, '老年、腎功能差、瘦者用低端；DKA 滴注 0.1 U/kg/hr ≈ ' + r(v.wt * 0.1, 1) + ' U/hr'] },
  { id: 'heparin', name: 'Heparin 體重劑量（VTE／ACS）', fields: [['wt', '體重', 'kg']], calc: (v) => [`VTE：bolus 80 U/kg = <b>${r(v.wt * 80)} U</b>，維持 18 U/kg/hr = ${r(v.wt * 18)} U/hr（25,000 U/250 mL → ${r(v.wt * 18 / 100, 1)} mL/hr）`, `ACS：bolus 60 U/kg = ${Math.min(4000, r(v.wt * 60))} U（max 4,000），維持 12 U/kg/hr = ${Math.min(1000, r(v.wt * 12))} U/hr（max 1,000）`, 'aPTT 6 小時後調整（VTE 1.5–2.5×；ACS 1.5–2×）'] },
];
function r(x, d = 0) { if (!isFinite(x)) return '—'; const m = Math.pow(10, d); return String(Math.round(x * m) / m); }
function renderCalc(parts) {
  setTitle('計算');
  const id = parts[1];
  if (!id) { main.innerHTML = `<div class="list">${CALCS.map(c => `<button data-c="${c.id}"><span class="t">${esc(c.name)}</span><span class="k">›</span></button>`).join('')}</div>`; main.querySelectorAll('button[data-c]').forEach(b => b.onclick = () => go('/calc/' + b.dataset.c)); return; }
  const c = CALCS.find(x => x.id === id); if (!c) { go('/calc'); return; }
  const pv = ptVars(); const defaults = { wt: patient.wt || '', age: patient.age || '', cr: patient.cr || '', sex: patient.sex || 'M' };
  let html = `<div class="card"><h2 style="margin:0 0 10px;font-size:18px">${esc(c.name)}</h2>`;
  c.fields.forEach(([k, label, unit]) => {
    if (unit === 'sex') html += `<div class="field"><label>${label}</label><div class="seg" data-k="${k}"><button data-v="M" class="${defaults.sex === 'M' ? 'on' : ''}">男</button><button data-v="F" class="${defaults.sex === 'F' ? 'on' : ''}">女</button></div></div>`;
    else html += `<div class="field"><label>${label}</label><input type="number" inputmode="decimal" step="any" data-k="${k}" value="${defaults[k] ?? ''}"><span class="u">${unit}</span></div>`;
  });
  html += `<div id="calc-out" class="derived" style="display:none"></div></div>`;
  main.innerHTML = html;
  const vals = { sex: defaults.sex };
  const run = () => { main.querySelectorAll('input[data-k]').forEach(i => vals[i.dataset.k] = parseFloat(i.value)); const need = c.fields.filter(f => f[2] !== 'sex' && !/選填/.test(f[1])).map(f => f[0]); const out = $('#calc-out'); if (need.some(k => isNaN(vals[k]))) { out.style.display = 'none'; return; } out.style.display = ''; out.innerHTML = c.calc(vals).filter(Boolean).map(s => `<div>${s}</div>`).join(''); };
  main.querySelectorAll('input[data-k]').forEach(i => i.oninput = run);
  main.querySelectorAll('.seg button').forEach(b => b.onclick = () => { vals.sex = b.dataset.v; b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); run(); });
  run();
}

// ---------- patient sheet ----------
function openPatientSheet() {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><h2>病人參數（劑量換算用）</h2>
    <div class="field"><label>體重</label><input id="p-wt" type="number" inputmode="decimal" step="0.5" value="${patient.wt ?? ''}" placeholder="60"><span class="u">kg</span></div>
    <div class="field"><label>年齡</label><input id="p-age" type="number" inputmode="numeric" value="${patient.age ?? ''}" placeholder="65"><span class="u">歲</span></div>
    <div class="field"><label>性別</label><div class="seg" id="p-sex"><button data-v="M" class="${patient.sex !== 'F' ? 'on' : ''}">男</button><button data-v="F" class="${patient.sex === 'F' ? 'on' : ''}">女</button></div><span class="u"></span></div>
    <div class="field"><label>Creatinine</label><input id="p-cr" type="number" inputmode="decimal" step="0.1" value="${patient.cr ?? ''}" placeholder="1.0"><span class="u">mg/dL</span></div>
    <div class="derived" id="p-derived"></div>
    <div class="row2"><button class="btn sec" id="p-clear">清除（換病人）</button><button class="btn" id="p-save">儲存</button></div>
    <p class="small muted" style="margin:10px 0 0">只存在這支手機上；換病人記得清除。未填時以 60 kg、65 歲、Cr 1.0 估算並標示。</p></div>`;
  document.body.appendChild(bg);
  let sex = patient.sex || 'M';
  const upd = () => { const wt = parseFloat($('#p-wt', bg).value) || 60, age = parseFloat($('#p-age', bg).value) || 65, cr = parseFloat($('#p-cr', bg).value) || 1; let crcl = ((140 - age) * wt) / (72 * cr) * (sex === 'F' ? 0.85 : 1); $('#p-derived', bg).innerHTML = `CrCl（Cockcroft-Gault）≈ <b>${r(crcl)}</b> mL/min　·　bolus 建議 ${wt >= 40 ? 500 : 250} mL`; };
  bg.querySelectorAll('input').forEach(i => i.oninput = upd);
  bg.querySelectorAll('#p-sex button').forEach(b => b.onclick = () => { sex = b.dataset.v; bg.querySelectorAll('#p-sex button').forEach(x => x.classList.toggle('on', x === b)); upd(); });
  upd();
  const close = () => bg.remove();
  bg.onclick = (e) => { if (e.target === bg) close(); };
  $('#p-save', bg).onclick = () => { patient.wt = parseFloat($('#p-wt', bg).value) || null; patient.age = parseFloat($('#p-age', bg).value) || null; patient.cr = parseFloat($('#p-cr', bg).value) || null; patient.sex = sex; savePatient(); close(); route(); toast('已更新病人參數'); };
  $('#p-clear', bg).onclick = () => { patient.wt = patient.age = patient.cr = null; patient.sex = 'M'; savePatient(); close(); route(); toast('已清除'); };
  setTimeout(() => $('#p-wt', bg).focus(), 50);
}

// ---------- about ----------
function renderAbout() {
  setTitle('關於');
  main.innerHTML = `<div class="card reader"><h2>值班速查 2026</h2><p>內容來自《住院醫師值班速查指南（2026 改寫版）》：以《臨床工作入門指南（2022）》架構為藍本，依 AHA 2025 ACLS、ESC 2023/2024、SSC 2021 等指引改寫，並以 Pocket Medicine 9e（2026）逐章交叉核對。</p>
  <p><b>使用方式</b>：「情境」頁選護理師講的狀況或你想到的診斷 → 回答 1–4 個會改變處置的問題 → 得到「現在就做」、可複製的醫囑、監測與何時叫人。右上角輸入體重／年齡／Cr，醫囑劑量自動換算。「章節」可讀全書原文，「搜尋」可查任何藥名或檢驗值。</p>
  <p><b>免責聲明</b>：本 App 為個人值班提示卡，不是治療準則；所有劑量請依病人狀況、各院藥品仿單、藥劑部與院內規範再確認。ACLS 依 AHA 2025；美國專用藥不列為主線。</p>
  <p><b>離線</b>：首次開啟後全部內容（含圖片）會存在手機上，之後無網路也可用。更新版本時開啟一次 App 即自動更新。</p>
  <p class="small muted">版本 ${esc(window.APP_VERSION || '')}・原始圖片來源 DermNetNZ／Radiopaedia（CC BY-NC，僅個人使用）。</p></div>`;
}

// ---------- boot ----------
async function boot() {
  renderChip();
  main.innerHTML = `<div class="empty">載入中…</div>`;
  try { await loadData(); } catch (e) { main.innerHTML = `<div class="empty">資料載入失敗：${esc(e.message)}<br>請確認網路後重新整理。</div>`; return; }
  if (!MEM && !location.hash) location.hash = '#/home';
  route();
  if (!MEM && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => { reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('已更新到新版本，重新開啟生效'); }); }); }).catch(() => {});
  }
}
boot();
})();
