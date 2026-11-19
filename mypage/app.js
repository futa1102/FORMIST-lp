/* FORMIST GYM 会員マイページ（LIFF） */
(() => {
  'use strict';

  const CFG = window.FORMIST_CONFIG || {};
  const qs = new URLSearchParams(location.search);
  const DEMO = qs.has('demo') || !CFG.LIFF_ID || !CFG.API_URL;
  let demoRole = ['trainer', 'pending'].includes(qs.get('demo')) ? qs.get('demo') : 'member';
  let idToken = null;

  const app = document.getElementById('app');
  const state = {
    role: null, me: null, bundle: null, members: [], pending: [],
    view: 'home', tab: 'menu', range: '3m',
  };

  /* ---------- 定数 ---------- */
  const COURSES = ['ダイエット', '蹴り技習得', 'ストレス発散'];
  const PLANS = {
    '都度払い': { kind: 'single', total: null },
    '5回券': { kind: 'ticket', total: 5, months: 2 },
    '10回券': { kind: 'ticket', total: 10, months: 3 },
    '月4回コース': { kind: 'monthly', total: 4 },
    '月8回コース': { kind: 'monthly', total: 8 },
  };
  const QUICK = ['ウォームアップ・ストレッチ', 'シャドー 3分×2R', 'ミット打ち 3分×5R', 'サンドバッグ 3分×3R',
    '縄跳び 3分×2R', '体幹トレーニング', 'スクワット 15回×3', 'クールダウン'];
  const TRAINER_IMG = '../images/trainer.jpg';

  /* ---------- ユーティリティ ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  const parseYmd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const md = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const wd = (s) => '日月火水木金土'[parseYmd(s).getDay()];
  const jpDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日（${wd(s)}）`; };
  const jpFull = (s) => { const d = parseYmd(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
  const addMonths = (s, n) => { const d = parseYmd(s); d.setMonth(d.getMonth() + n); return ymd(d); };
  const daysUntil = (s) => Math.round((parseYmd(s) - parseYmd(today())) / 864e5);
  const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt1(Math.abs(n));
  const byDate = (a, b) => a.date.localeCompare(b.date);

  function toast(msg, isErr) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  /* ---------- API ---------- */
  async function api(action, payload = {}) {
    if (DEMO) return window.FormistDemo.handle(action, payload, demoRole);
    let res;
    try {
      // text/plain で送る（Apps Script はプリフライトに対応しないため）
      res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ action, payload, idToken }) });
    } catch (e) {
      throw Object.assign(new Error('通信できませんでした。電波の良いところでもう一度お試しください。'), { code: 'network' });
    }
    const json = await res.json().catch(() => null);
    if (!json) throw Object.assign(new Error('サーバーの応答を読み取れませんでした。'), { code: 'server' });
    if (!json.ok) throw Object.assign(new Error(json.message || 'エラーが発生しました'), { code: json.error });
    return json.data;
  }

  function loadScript(src) {
    return new Promise((ok, ng) => {
      const s = document.createElement('script');
      s.src = src; s.charset = 'utf-8'; s.onload = ok; s.onerror = () => ng(new Error('LINEの読み込みに失敗しました。'));
      document.head.appendChild(s);
    });
  }

  async function liffLogin() {
    await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
    await liff.init({ liffId: CFG.LIFF_ID });
    const relogin = () => { liff.login({ redirectUri: location.href }); return new Promise(() => {}); };
    if (!liff.isLoggedIn()) return relogin();
    const dec = liff.getDecodedIDToken();
    if (!dec || dec.exp * 1000 < Date.now() + 60e3) { liff.logout(); return relogin(); }
    idToken = liff.getIDToken();
  }

  /* ---------- 起動 ---------- */
  async function boot() {
    app.innerHTML = `${DEMO ? demoBar() : ''}<div class="boot"><div class="spinner" aria-hidden="true"></div><p>読み込み中…</p></div>`;
    try {
      if (!DEMO) await liffLogin();
      const d = await api('init');
      state.role = d.role; state.me = d.me || {};
      state.bundle = d.bundle || null; state.members = d.members || []; state.pending = d.pending || [];
      state.view = d.role === 'trainer' ? 'home' : 'member';
      render();
    } catch (e) {
      renderError(e);
    }
  }

  function renderError(e) {
    const auth = e && e.code === 'auth';
    app.innerHTML = `${DEMO ? demoBar() : ''}<div class="boot">
      <h1>${auth ? 'ログインの確認ができませんでした' : '表示できませんでした'}</h1>
      <p>${esc(e && e.message)}</p>
      <button class="btn primary" data-action="${auth && !DEMO ? 'relogin' : 'reload'}">もう一度読み込む</button></div>`;
  }

  function render() {
    let html = DEMO ? demoBar() : '';
    if (state.role === 'pending') html += pendingView();
    else if (state.role === 'member') html += memberView();
    else if (state.view === 'home') html += trainerHome();
    else html += trainerMember();
    app.innerHTML = html;
    afterRender();
  }

  function afterRender() {
    if (state.bundle && document.getElementById('sec-body')) drawCharts();
    const mf = app.querySelector('form[data-form="menu"]');
    if (mf) fillMenuForm(mf, mf.date.value);
  }

  /* ---------- デモ ---------- */
  function demoBar() {
    const b = (r, l) => `<button data-action="demo-role" data-role="${r}" aria-pressed="${demoRole === r}">${l}</button>`;
    return `<div class="demo-bar"><span><b>DEMO</b> サンプルデータで表示中</span>
      <div class="seg">${b('member', '会員')}${b('trainer', 'トレーナー')}${b('pending', '未登録')}</div></div>`;
  }

  /* ---------- 未登録 ---------- */
  function pendingView() {
    return `<header class="top"><img class="logo" src="../images/logo.png" alt="FORMIST GYM"></header>
      <div class="boot" style="min-height:50vh">
        <h1>会員登録の確認中です</h1>
        <p>${esc(state.me.name || '')}${state.me.name ? 'さん、' : ''}アクセスありがとうございます。トレーナーが会員情報と連携すると、ここに記録が表示されます。</p>
        <p class="muted">連携が済んだら、このページを開き直してください。</p>
        ${closeButton()}
      </div>`;
  }

  function closeButton() {
    return !DEMO && window.liff && liff.isInClient && liff.isInClient()
      ? '<div class="foot"><button data-action="close">LINEに戻る</button></div>' : '';
  }

  /* ---------- 会員画面 ---------- */
  function memberView() {
    const m = state.bundle.member;
    return `<header class="top">
        <img class="logo" src="../images/logo.png" alt="FORMIST GYM">
        <div><p class="hello">${greeting()}</p><h1>${esc(m.name)}<small>さん</small></h1></div>
      </header>
      ${memberSections(state.bundle)}
      ${closeButton()}`;
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは';
  }

  function memberSections(b) {
    return menuSection(b) + bodySection(b) + courseSection(b) + messageSection(b);
  }

  function pickMenu(menus) {
    const t = today();
    const s = [...menus].sort(byDate);
    const td = s.find((m) => m.date === t);
    if (td) return { m: td, tag: '<span class="tag today">TODAY</span>' };
    const fut = s.find((m) => m.date > t);
    if (fut) return { m: fut, tag: '<span class="tag">次回のレッスン</span>' };
    const past = s.filter((m) => m.date < t).pop();
    if (past) return { m: past, tag: '<span class="tag">前回のレッスン</span>' };
    return null;
  }

  function menuSection(b) {
    const pick = pickMenu(b.menus);
    let body;
    if (!pick) {
      body = '<p class="empty">レッスンの日にトレーナーがメニューを登録します。</p>';
    } else {
      const { m, tag } = pick;
      body = `<p class="menu-date">${jpDate(m.date)} ${tag}</p>
        <ol class="menu-list">${m.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>
        ${m.note ? `<p class="menu-note">${esc(m.note)}</p>` : ''}`;
    }
    const past = [...b.menus].sort(byDate).reverse().filter((m) => !pick || m.date !== pick.m.date).filter((m) => m.date <= today()).slice(0, 10);
    const hist = past.length ? `<details class="more"><summary>これまでのメニュー</summary><ul class="history">
        ${past.map((m) => `<li><span class="h-date">${md(m.date)}（${wd(m.date)}）</span><div class="h-items">${m.items.map(esc).join(' / ')}</div></li>`).join('')}
      </ul></details>` : '';
    return `<section class="card" id="sec-menu"><div class="sec-title"><h2>今日のメニュー</h2><span class="en">Menu</span></div>${body}${hist}</section>`;
  }

  function rangeStart(r) {
    if (r === 'all') return '0000-00-00';
    return addMonths(today(), r === '1m' ? -1 : -3);
  }

  function seriesOf(b, key) {
    return [...b.body].filter((r) => r[key] !== '' && r[key] != null && !isNaN(r[key])).sort(byDate).map((r) => ({ date: r.date, v: Number(r[key]) }));
  }

  function bodySection(b) {
    const seg = (r, l) => `<button data-action="range" data-range="${r}" aria-pressed="${state.range === r}">${l}</button>`;
    const from = rangeStart(state.range);
    const metric = (key, label, unit, color) => {
      const all = seriesOf(b, key);
      const pts = all.filter((p) => p.date >= from);
      if (!all.length) return `<div class="metric"><div class="metric-head"><h3><i style="background:${color}"></i>${label}</h3></div><p class="empty" style="margin-top:8px">まだ記録がありません</p></div>`;
      const last = all[all.length - 1];
      const delta = pts.length >= 2 ? pts[pts.length - 1].v - pts[0].v : null;
      let goal = '';
      if (key === 'weight' && b.member.goalWeight) {
        const g = Number(b.member.goalWeight), diff = last.v - g;
        goal = `<span class="goal">目標 ${fmt1(g)}kg ${diff > 0.05 ? `まで あと <b>${fmt1(diff)}kg</b>` : '<b>達成！</b>'}</span>`;
      }
      return `<div class="metric">
        <div class="metric-head"><h3><i style="background:${color}"></i>${label}</h3>
          <div class="metric-val"><strong>${fmt1(last.v)}</strong><span class="unit">${unit}</span>
            <span class="delta">${delta == null ? `${md(last.date)} 時点` : `この期間 ${signed(delta)}${unit}`}</span>${goal}</div></div>
        <div class="chart" data-chart="${key}" role="img" aria-label="${label}の推移グラフ"></div></div>`;
    };
    const rows = [...b.body].sort(byDate).reverse().filter((r) => r.date >= from);
    const table = rows.length ? `<details class="more table-view"><summary>数値の一覧</summary><table>
        <thead><tr><th>日付</th><th>体重</th><th>体脂肪率</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${md(r.date)}（${wd(r.date)}）</td><td>${r.weight !== '' && r.weight != null ? fmt1(r.weight) + 'kg' : '—'}</td><td>${r.fat !== '' && r.fat != null ? fmt1(r.fat) + '%' : '—'}</td></tr>`).join('')}</tbody>
      </table></details>` : '';
    return `<section class="card" id="sec-body">
      <div class="sec-title"><h2>体の記録</h2><span class="en">Body</span></div>
      <div class="seg">${seg('1m', '1か月')}${seg('3m', '3か月')}${seg('all', '全期間')}</div>
      ${metric('weight', '体重', 'kg', 'var(--series-weight)')}
      ${metric('fat', '体脂肪率', '%', 'var(--series-fat)')}
      ${table}
    </section>`;
  }

  function progress(member, menus) {
    const plan = PLANS[member.plan] || PLANS['都度払い'];
    const counted = menus.filter((m) => m.counted && m.date <= today());
    const t = today();
    const res = { plan, lifetime: counted.length, total: plan.total, used: 0 };
    if (plan.kind === 'monthly') {
      const ym = t.slice(0, 7);
      res.used = counted.filter((m) => m.date.slice(0, 7) === ym).length;
      const n = parseYmd(t); n.setMonth(n.getMonth() + 1, 1);
      res.label = `${parseYmd(t).getMonth() + 1}月のレッスン`;
      res.meta = [`${n.getMonth() + 1}月1日に回数が更新されます`];
    } else if (plan.kind === 'ticket') {
      res.used = counted.filter((m) => !member.planStart || m.date >= member.planStart).length;
      res.label = `${member.plan}の消化回数`;
      res.meta = [];
      if (member.planStart) res.meta.push(`ご購入日 ${jpFull(member.planStart)}`);
      if (member.expiry) {
        const d = daysUntil(member.expiry);
        res.meta.push(d < 0 ? `<span class="warn">有効期限が切れています（${jpFull(member.expiry)}）</span>`
          : `有効期限 ${jpFull(member.expiry)}（<span class="${d <= 14 ? 'warn' : ''}">あと${d}日</span>）`);
      }
    } else {
      res.label = 'これまでのレッスン';
      res.used = counted.length;
      res.meta = [];
    }
    return res;
  }

  function courseSection(b) {
    const m = b.member;
    const p = progress(m, b.menus);
    let count;
    if (p.total) {
      const rest = Math.max(0, p.total - p.used);
      const cells = Array.from({ length: p.total }, (_, i) => `<span class="${i < p.used ? 'on' : ''}"></span>`).join('');
      count = `<div class="count"><span class="label">${esc(p.label)}</span><strong>${p.used}</strong><span class="of">/ ${p.total}回</span>
        <span class="rest">${rest ? `残り ${rest}回` : (p.plan.kind === 'ticket' ? '使い切りました' : '今月分 完了')}</span></div>
        <div class="bar" role="img" aria-label="${p.total}回中${p.used}回">${cells}</div>`;
    } else {
      count = `<div class="count"><span class="label">${esc(p.label)}</span><strong>${p.used}</strong><span class="of">回</span></div>`;
    }
    const first = [...b.menus].filter((x) => x.counted).sort(byDate)[0];
    const sinceDays = first ? Math.max(0, -daysUntil(first.date)) : 0;
    const stats = `<div class="stats">
        <div><small>累計レッスン</small><b>${p.lifetime}<span>回</span></b></div>
        <div><small>通いはじめて</small><b>${sinceDays}<span>日</span></b></div></div>`;
    const ms = b.milestones || [];
    const done = ms.filter((x) => x.done).length;
    const nextIdx = ms.findIndex((x) => !x.done);
    const steps = ms.length ? `<div class="steps-head"><b>コースのステップ</b><span class="muted">${done} / ${ms.length} クリア</span></div>
      <ol class="steps">${ms.map((x, i) => `<li class="${x.done ? 'done' : i === nextIdx ? 'next' : ''}"><span class="mark" aria-hidden="true"></span>
        <span class="title">${esc(x.title)}</span><span class="when">${x.done ? (x.doneDate ? md(x.doneDate) + ' クリア' : 'クリア') : i === nextIdx ? 'いまここ' : ''}</span>
        <span class="sr-only">${x.done ? '（達成）' : '（未達成）'}</span></li>`).join('')}</ol>` : '';
    return `<section class="card" id="sec-course">
      <div class="sec-title"><h2>コースの進み具合</h2><span class="en">Course</span></div>
      <div class="course-head"><span class="pill">${esc(m.course || 'コース未設定')}コース</span><span class="pill outline">${esc(m.plan || 'プラン未設定')}</span></div>
      ${count}
      ${p.meta.length ? `<div class="course-meta">${p.meta.map((x) => `<p>${x}</p>`).join('')}</div>` : ''}
      ${stats}${steps}
    </section>`;
  }

  function messageSection(b) {
    const msgs = [...b.messages].sort(byDate).reverse();
    let body;
    if (!msgs.length) {
      body = '<p class="empty">トレーナーからのメッセージがここに届きます。</p>';
    } else {
      const [latest, ...older] = msgs;
      body = `<div class="msg"><img src="${TRAINER_IMG}" alt="">
        <div class="bubble"><p>${esc(latest.text)}</p><p class="from">${esc(latest.from || 'トレーナー')}・${jpDate(latest.date)}</p></div></div>
        ${older.length ? `<details class="more"><summary>これまでのひとこと（${older.length}件）</summary><ul class="old-msgs">
          ${older.slice(0, 20).map((x) => `<li><small>${md(x.date)}（${wd(x.date)}）</small><p>${esc(x.text)}</p></li>`).join('')}</ul></details>` : ''}`;
    }
    return `<section class="card" id="sec-msg"><div class="sec-title"><h2>トレーナーからのひとこと</h2><span class="en">Message</span></div>${body}</section>`;
  }

  /* ---------- グラフ（SVG・軸は1本） ---------- */
  function drawCharts() {
    const from = rangeStart(state.range);
    app.querySelectorAll('.chart[data-chart]').forEach((el) => {
      const key = el.dataset.chart;
      const pts = seriesOf(state.bundle, key).filter((p) => p.date >= from);
      const goal = key === 'weight' && state.bundle.member.goalWeight ? Number(state.bundle.member.goalWeight) : null;
      lineChart(el, pts, {
        unit: key === 'weight' ? 'kg' : '%',
        color: key === 'weight' ? 'var(--series-weight)' : 'var(--series-fat)',
        goal, minSpan: key === 'weight' ? 2 : 2,
      });
    });
  }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function lineChart(el, pts, opt) {
    if (!pts.length) { el.innerHTML = '<p class="empty" style="margin-top:20px">この期間の記録はありません</p>'; el.style.height = 'auto'; return; }
    el.style.height = '';
    const W = Math.max(260, el.clientWidth), H = el.clientHeight || 168;
    const M = { t: 12, r: 10, b: 22, l: 34 };
    const xs = pts.map((p) => parseYmd(p.date).getTime());
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
    const vals = pts.map((p) => p.v);
    if (opt.goal != null) vals.push(opt.goal);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(hi - lo, opt.minSpan);
    const mid = (hi + lo) / 2;
    lo = mid - span * 0.6; hi = mid + span * 0.6;
    const step = niceStep((hi - lo) / 3);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (t) => M.l + ((t - x0) / (x1 - x0)) * (W - M.l - M.r);
    const Y = (v) => M.t + ((hi - v) / (hi - lo)) * (H - M.t - M.b);
    const dec = step < 1 ? 1 : 0;

    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      g += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${M.l - 6}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(dec)}</text>`;
    }
    // x軸ラベル：最初・最後（幅があれば中間も）
    const lbl = [0, pts.length - 1];
    if (pts.length > 4 && W > 340) lbl.splice(1, 0, Math.floor((pts.length - 1) / 2));
    [...new Set(lbl)].forEach((i, k, arr) => {
      const anchor = k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle';
      g += `<text class="ax" x="${X(xs[i])}" y="${H - 6}" text-anchor="${pts.length === 1 ? 'middle' : anchor}">${md(pts[i].date)}</text>`;
    });
    if (opt.goal != null) {
      g += `<line class="goal-line" x1="${M.l}" x2="${W - M.r}" y1="${Y(opt.goal)}" y2="${Y(opt.goal)}"/>
        <text class="goal-label" x="${W - M.r}" y="${Y(opt.goal) - 4}" text-anchor="end">目標 ${fmt1(opt.goal)}</text>`;
    }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
    const lx = X(xs[xs.length - 1]), ly = Y(pts[pts.length - 1].v);
    g += `<path class="series" d="${d}" style="stroke:${opt.color}"/>
      <circle cx="${lx}" cy="${ly}" r="4.5" fill="${opt.color}" stroke="var(--card)" stroke-width="2"/>
      <g class="hover" visibility="hidden"><line class="cross" y1="${M.t}" y2="${H - M.b}"/><circle r="5" fill="${opt.color}" stroke="var(--card)" stroke-width="2"/></g>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg><div class="tip" hidden></div>`;

    const svg = el.querySelector('svg'), hov = el.querySelector('.hover'), tip = el.querySelector('.tip');
    const cross = hov.querySelector('line'), dot = hov.querySelector('circle');
    const show = (e) => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      let best = 0;
      xs.forEach((t, i) => { if (Math.abs(X(t) - x) < Math.abs(X(xs[best]) - x)) best = i; });
      const px = X(xs[best]), py = Y(pts[best].v);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      dot.setAttribute('cx', px); dot.setAttribute('cy', py);
      hov.setAttribute('visibility', 'visible');
      tip.innerHTML = `${md(pts[best].date)}（${wd(pts[best].date)}）<br><b>${fmt1(pts[best].v)}</b>${opt.unit}`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const left = Math.min(Math.max(px * (r.width / W), tw / 2), r.width - tw / 2);
      tip.style.left = left + 'px';
      tip.style.top = Math.max(-8, py * (r.height / H) - tip.offsetHeight - 12) + 'px';
    };
    const hide = () => { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.bundle && document.getElementById('sec-body')) drawCharts(); }, 150);
  });

  /* ---------- トレーナー：一覧 ---------- */
  function initial(name) { return esc(String(name || '?').trim().charAt(0)); }

  function trainerHome() {
    const t = today();
    const unlinkedMembers = state.members.filter((m) => !m.linked);
    const pend = state.pending.length ? `<section class="card alert">
        <div class="list-head"><h2>LINE連携の承認待ち</h2><span class="tag">${state.pending.length}件</span></div>
        <p class="hint">マイページを開いた方です。どの会員さんか選んで連携してください。</p>
        ${state.pending.map((p) => `<div class="pending-item">
          <div class="who">${esc(p.displayName || '（名前なし）')}<small>${esc(String(p.requestedAt || '').slice(0, 16))} にアクセス</small></div>
          <div class="row"><select data-link-for="${esc(p.lineUserId)}" aria-label="連携する会員">
            <option value="new">新しい会員として登録</option>
            ${unlinkedMembers.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}（未連携）</option>`).join('')}
          </select><button class="btn primary small" data-action="link" data-uid="${esc(p.lineUserId)}">連携</button></div>
          <button class="btn ghost small" style="justify-self:start" data-action="dismiss" data-uid="${esc(p.lineUserId)}" data-name="${esc(p.displayName)}">この申請を削除</button>
        </div>`).join('')}
      </section>` : '';
    const sorted = [...state.members].sort((a, b) => (b.lastLesson || '').localeCompare(a.lastLesson || '') || a.name.localeCompare(b.name, 'ja'));
    const list = sorted.length ? `<ul class="member-list">${sorted.map((m) => `<li data-name="${esc(m.name)}">
        <button data-action="open" data-id="${esc(m.id)}">
          <span class="avatar" aria-hidden="true">${initial(m.name)}</span>
          <span class="info"><span class="name">${esc(m.name)}</span>${m.linked ? '' : '<span class="unlinked">LINE未連携</span>'}
            <span class="sub" style="display:block">${esc(m.course || '—')}・${esc(m.plan || '—')}${m.lastLesson ? `・${m.lastLesson === t ? '今日' : '最終 ' + md(m.lastLesson)}` : ''}</span></span>
          <span class="chev" aria-hidden="true">›</span></button></li>`).join('')}</ul>`
      : '<p class="empty" style="margin-top:12px">まだ会員がいません。「＋ 会員を追加」から登録してください。</p>';
    return `<header class="top"><img class="logo" src="../images/logo.png" alt="FORMIST GYM">
        <div><p class="hello">トレーナー画面</p><h1>${esc(state.me.name || 'トレーナー')}<small>さん</small></h1></div></header>
      ${pend}
      <section class="card">
        <div class="list-head"><h2>会員 <span class="muted" style="font-size:13px;font-family:inherit">${state.members.length}名</span></h2>
          <button class="btn line small" data-action="new-member">＋ 会員を追加</button></div>
        ${state.members.length > 5 ? '<input class="search" type="search" placeholder="名前で探す" data-role="search" aria-label="会員を名前で探す">' : ''}
        ${list}
      </section>`;
  }

  /* ---------- トレーナー：会員の入力 ---------- */
  function trainerMember() {
    const b = state.bundle;
    if (!b) { // 新規登録
      return `<div class="tbar"><button class="back" data-action="home">‹ 会員一覧</button><span class="who">新しい会員</span></div>
        <section class="card">${memberForm({})}</section>`;
    }
    const tab = (k, l) => `<button role="tab" data-action="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`;
    const panel = (k, html) => `<div class="panel" data-panel="${k}" ${state.tab === k ? '' : 'hidden'}>${html}</div>`;
    return `<div class="tbar"><button class="back" data-action="home">‹ 会員一覧</button><span class="who">${esc(b.member.name)} さん</span></div>
      <section class="card">
        <div class="tabs" role="tablist">${tab('menu', 'メニュー')}${tab('body', '体重')}${tab('msg', 'ひとこと')}${tab('course', 'コース')}</div>
        ${panel('menu', menuForm())}${panel('body', bodyForm(b))}${panel('msg', msgForm(b))}${panel('course', memberForm(b.member) + milestoneEditor(b) + linkEditor(b))}
      </section>
      <p class="preview-label">会員さんにはこう見えます</p>
      ${memberSections(b)}`;
  }

  function menuForm() {
    return `<form class="f" data-form="menu">
      <label>レッスン日<input type="date" name="date" value="${today()}" required></label>
      <label>メニュー（1行に1つ）<textarea name="items" rows="6" placeholder="ウォームアップ・ストレッチ&#10;ミット打ち 3分×5R" required></textarea></label>
      <div class="chips">${QUICK.map((q) => `<button type="button" data-action="chip" data-text="${esc(q)}">＋ ${esc(q)}</button>`).join('')}</div>
      <label>メモ（任意・会員さんにも表示されます）<textarea name="note" rows="2" placeholder="例：今日は左ミドルを重点的に"></textarea></label>
      <label class="check"><input type="checkbox" name="counted" checked> レッスン回数に数える</label>
      <div class="actions"><button class="btn primary" type="submit">保存する</button>
        <button class="btn ghost" type="button" data-action="del-menu" hidden>この日のメニューを削除</button></div>
    </form>`;
  }

  function fillMenuForm(f, date) {
    const ex = state.bundle && state.bundle.menus.find((m) => m.date === date);
    f.items.value = ex ? ex.items.join('\n') : '';
    f.note.value = ex ? ex.note || '' : '';
    f.counted.checked = ex ? !!ex.counted : true;
    f.querySelector('[data-action="del-menu"]').hidden = !ex;
    f.querySelector('[type="submit"]').textContent = ex ? '更新する' : '保存する';
  }

  function bodyForm(b) {
    const recent = [...b.body].sort(byDate).reverse().slice(0, 10);
    return `<form class="f" data-form="body">
        <label>測定日<input type="date" name="date" value="${today()}" required></label>
        <div class="two"><label>体重（kg）<input type="number" name="weight" step="0.1" min="20" max="250" inputmode="decimal" placeholder="60.0"></label>
          <label>体脂肪率（%）<input type="number" name="fat" step="0.1" min="1" max="70" inputmode="decimal" placeholder="25.0"></label></div>
        <p class="hint" style="margin-top:-6px">同じ日付で保存すると上書きされます。</p>
        <div class="actions"><button class="btn primary" type="submit">記録する</button></div>
      </form>
      ${recent.length ? `<ul class="records">${recent.map((r) => `<li><span class="r-main"><span class="r-date">${md(r.date)}</span>
        ${r.weight !== '' && r.weight != null ? fmt1(r.weight) + 'kg' : '—'} ／ ${r.fat !== '' && r.fat != null ? fmt1(r.fat) + '%' : '—'}</span>
        <button class="del" data-action="del-body" data-date="${r.date}" aria-label="${md(r.date)}の記録を削除">×</button></li>`).join('')}</ul>` : ''}`;
  }

  function msgForm(b) {
    const recent = [...b.messages].sort(byDate).reverse().slice(0, 10);
    return `<form class="f" data-form="msg">
        <label>ひとこと<textarea name="text" rows="4" maxlength="500" required placeholder="例：今日のミット、パンチのキレが一段上がっていました！この調子で。"></textarea></label>
        <div class="actions"><button class="btn primary" type="submit">送る</button></div>
      </form>
      ${recent.length ? `<ul class="records">${recent.map((m) => `<li><span class="r-main"><span class="r-date">${md(m.date)}</span>${esc(m.text)}</span>
        <button class="del" data-action="del-msg" data-id="${esc(m.id)}" aria-label="このひとことを削除">×</button></li>`).join('')}</ul>` : ''}`;
  }

  function memberForm(m) {
    const opt = (list, v) => list.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    return `<form class="f" data-form="member">
      <input type="hidden" name="id" value="${esc(m.id || '')}">
      <label>お名前<input name="name" value="${esc(m.name || '')}" required maxlength="40" placeholder="山田 花子"></label>
      <div class="two"><label>コース<select name="course">${opt(COURSES, m.course || COURSES[0])}</select></label>
        <label>プラン<select name="plan">${opt(Object.keys(PLANS), m.plan || '都度払い')}</select></label></div>
      <div class="two"><label>購入日・開始日<input type="date" name="planStart" value="${esc(m.planStart || '')}"></label>
        <label>有効期限<input type="date" name="expiry" value="${esc(m.expiry || '')}"></label></div>
      <label>目標体重（kg・任意）<input type="number" name="goalWeight" step="0.1" min="20" max="250" inputmode="decimal" value="${esc(m.goalWeight ?? '')}"></label>
      <p class="hint" style="margin-top:-6px">回数券は購入日を入れると有効期限が自動で入ります（5回券2か月・10回券3か月）。消化回数は「レッスン回数に数える」にしたメニューから自動で数えます。</p>
      <div class="actions"><button class="btn primary" type="submit">${m.id ? '会員情報を保存' : '登録する'}</button></div>
    </form>`;
  }

  function milestoneEditor(b) {
    return `<h3 class="sub-h">コースのステップ</h3>
      <ul class="ms-edit">${b.milestones.map((x) => `<li><input type="checkbox" data-action="ms-toggle" data-id="${esc(x.id)}" ${x.done ? 'checked' : ''} aria-label="${esc(x.title)}を達成にする">
        <span>${esc(x.title)}${x.done && x.doneDate ? ` <small class="muted">${md(x.doneDate)}</small>` : ''}</span>
        <button class="del" data-action="ms-del" data-id="${esc(x.id)}" aria-label="${esc(x.title)}を削除">×</button></li>`).join('')}</ul>
      <form class="inline-add f" data-form="ms-add" style="display:flex"><input name="title" placeholder="ステップを追加（例：ハイキック）" maxlength="40" required><button class="btn line small" type="submit">追加</button></form>`;
  }

  function linkEditor(b) {
    return `<h3 class="sub-h">LINE連携</h3>
      <div class="link-state">${b.member.linked
        ? '連携済み（この会員さんのLINEで記録が見られます）<button class="btn ghost small" data-action="unlink">連携を解除</button>'
        : '<span>未連携です。会員さんにマイページを開いてもらい、会員一覧の「承認待ち」から連携してください。</span>'}</div>`;
  }

  /* ---------- 保存処理 ---------- */
  function applyRes(r) {
    if (!r) return;
    if (r.bundle !== undefined) state.bundle = r.bundle;
    if (r.members) state.members = r.members;
    if (r.pending) state.pending = r.pending;
  }

  async function run(btn, fn, okMsg) {
    if (btn) btn.disabled = true;
    try {
      const r = await fn();
      applyRes(r);
      render();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      toast(e.message || 'エラーが発生しました', true);
      if (btn) btn.disabled = false;
    }
  }

  const memberId = () => state.bundle && state.bundle.member.id;

  app.addEventListener('submit', (e) => {
    const f = e.target;
    if (!f.dataset.form) return;
    e.preventDefault();
    const btn = f.querySelector('[type="submit"]');
    const v = (n) => (f[n] ? f[n].value.trim() : '');
    switch (f.dataset.form) {
      case 'menu': {
        const items = v('items').split('\n').map((s) => s.replace(/^[\s・\-*•]+/, '').trim()).filter(Boolean);
        if (!items.length) return toast('メニューを1つ以上入力してください', true);
        return run(btn, () => api('saveMenu', { memberId: memberId(), date: v('date'), items, note: v('note'), counted: f.counted.checked }), 'メニューを保存しました');
      }
      case 'body': {
        if (!v('weight') && !v('fat')) return toast('体重か体脂肪率を入力してください', true);
        return run(btn, () => api('saveBody', { memberId: memberId(), date: v('date'), weight: v('weight'), fat: v('fat') }), '記録しました');
      }
      case 'msg':
        return run(btn, () => api('addMessage', { memberId: memberId(), text: v('text') }), 'ひとことを送りました');
      case 'member': {
        const isNew = !v('id');
        const p = { id: v('id'), name: v('name'), course: v('course'), plan: v('plan'), planStart: v('planStart'), expiry: v('expiry'), goalWeight: v('goalWeight') };
        return run(btn, async () => {
          const r = await api('saveMember', p);
          if (isNew) { state.view = 'member'; state.tab = 'menu'; }
          return r;
        }, isNew ? '会員を登録しました' : '会員情報を保存しました');
      }
      case 'ms-add':
        return run(btn, () => api('addMilestone', { memberId: memberId(), title: v('title') }), 'ステップを追加しました');
    }
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    const f = t.form;
    if (f && f.dataset.form === 'menu' && t.name === 'date') fillMenuForm(f, t.value);
    if (f && f.dataset.form === 'member' && (t.name === 'plan' || t.name === 'planStart')) {
      const plan = PLANS[f.plan.value];
      if (plan && plan.kind === 'ticket' && f.planStart.value) f.expiry.value = addMonths(f.planStart.value, plan.months);
      else if (plan && plan.kind !== 'ticket') f.expiry.value = '';
    }
    if (t.dataset.action === 'ms-toggle') {
      run(null, () => api('setMilestone', { memberId: memberId(), id: t.dataset.id, done: t.checked }), t.checked ? 'クリアにしました' : '未クリアに戻しました');
    }
  });

  app.addEventListener('input', (e) => {
    if (e.target.dataset.role !== 'search') return;
    const q = e.target.value.trim();
    app.querySelectorAll('.member-list li').forEach((li) => { li.hidden = q && !li.dataset.name.includes(q); });
  });

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.dataset.action === 'ms-toggle') return;
    const a = el.dataset.action;
    switch (a) {
      case 'reload': return boot();
      case 'relogin': if (window.liff) { liff.logout(); liff.login({ redirectUri: location.href }); } return;
      case 'close': return window.liff && liff.closeWindow();
      case 'demo-role': demoRole = el.dataset.role; state.tab = 'menu'; return boot();
      case 'range': {
        state.range = el.dataset.range;
        const sec = document.getElementById('sec-body');
        sec.outerHTML = bodySection(state.bundle);
        return drawCharts();
      }
      case 'home':
        state.view = 'home'; state.bundle = null; render(); return window.scrollTo(0, 0);
      case 'new-member':
        state.view = 'member'; state.bundle = null; render(); return window.scrollTo(0, 0);
      case 'open':
        el.disabled = true;
        return api('getMember', { memberId: el.dataset.id }).then((r) => {
          state.bundle = r.bundle; state.view = 'member'; state.tab = 'menu'; render(); window.scrollTo(0, 0);
        }).catch((err) => { el.disabled = false; toast(err.message, true); });
      case 'tab':
        state.tab = el.dataset.tab;
        app.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', b === el));
        app.querySelectorAll('.panel').forEach((p) => { p.hidden = p.dataset.panel !== state.tab; });
        return;
      case 'chip': {
        const ta = el.closest('form').items;
        ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + el.dataset.text;
        return ta.focus();
      }
      case 'del-menu': {
        const f = el.closest('form');
        if (!confirm(`${jpDate(f.date.value)}のメニューを削除しますか？`)) return;
        return run(el, () => api('deleteMenu', { memberId: memberId(), date: f.date.value }), '削除しました');
      }
      case 'del-body':
        if (!confirm(`${jpDate(el.dataset.date)}の記録を削除しますか？`)) return;
        return run(el, () => api('deleteBody', { memberId: memberId(), date: el.dataset.date }), '削除しました');
      case 'del-msg':
        if (!confirm('このひとことを削除しますか？')) return;
        return run(el, () => api('deleteMessage', { memberId: memberId(), id: el.dataset.id }), '削除しました');
      case 'ms-del':
        if (!confirm('このステップを削除しますか？')) return;
        return run(el, () => api('deleteMilestone', { memberId: memberId(), id: el.dataset.id }), '削除しました');
      case 'link': {
        const sel = app.querySelector(`select[data-link-for="${CSS.escape(el.dataset.uid)}"]`);
        return run(el, () => api('linkLine', { lineUserId: el.dataset.uid, memberId: sel.value }), '連携しました');
      }
      case 'dismiss':
        if (!confirm(`${el.dataset.name || 'この方'}の申請を削除しますか？（もう一度開くと再び表示されます）`)) return;
        return run(el, () => api('dismissPending', { lineUserId: el.dataset.uid }), '削除しました');
      case 'unlink':
        if (!confirm('LINE連携を解除しますか？解除すると、この会員さんは記録を見られなくなります。')) return;
        return run(el, () => api('unlinkLine', { memberId: memberId() }), '連携を解除しました');
    }
  });

  boot();
})();
