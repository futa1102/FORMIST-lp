/* デモ用のサンプルデータと、サーバー（gas/Code.gs）と同じ動きをする疑似API。
   本番（config.js に LIFF_ID と API_URL を設定）では使われません。保存内容はページを閉じると消えます。 */
(() => {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const addMonths = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1 + n, d)); };
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  let uid = 100;
  const newId = (p) => `${p}${++uid}`;

  const ME = { member: 'U-demo-member', trainer: 'U-demo-trainer', pending: 'U-demo-new' };
  const MILESTONES = {
    'ダイエット': ['正しい構えとステップ', 'ワンツーをきれいに打てる', 'ミット打ち 3分×3R 完走', '体重 −3kg', '目標体重を達成'],
    '蹴り技習得': ['構えとステップ', 'ローキック', 'ミドルキック', 'ハイキック', 'パンチからキックのコンビネーション'],
    'ストレス発散': ['基本の構え', 'ワンツー', 'フック・アッパー', 'ミット打ち 3分×5R 完走', '自分だけのコンビネーション'],
  };
  const MENU_SETS = [
    ['ウォームアップ・ストレッチ', 'シャドー 3分×2R', 'ミット打ち 3分×5R', '体幹トレーニング', 'クールダウン'],
    ['ウォームアップ・ストレッチ', '縄跳び 3分×2R', 'ミドルキックのフォーム確認', 'ミット打ち 3分×4R', 'スクワット 15回×3'],
    ['ウォームアップ・ストレッチ', 'ステップワーク', 'サンドバッグ 3分×3R', 'ミット打ち 3分×3R', 'クールダウン'],
  ];

  const db = { trainers: [{ lineUserId: ME.trainer, name: '坂口 風太' }], members: [], menus: [], body: [], messages: [], milestones: [], pending: [] };

  function addMember(m, doneCount) {
    db.members.push(m);
    (MILESTONES[m.course] || []).forEach((title, i) => db.milestones.push({
      id: newId('S'), memberId: m.id, title, done: i < doneCount, doneDate: i < doneCount ? dayOffset(-100 + i * 24) : '', order: i,
    }));
  }

  // 1人目：田中 美咲（ダイエット・10回券）— 会員として見たときの本人
  addMember({ id: 'M001', name: '田中 美咲', lineUserId: ME.member, course: 'ダイエット', plan: '10回券', planStart: dayOffset(-33), expiry: addMonths(dayOffset(-33), 3), goalWeight: 58, createdAt: dayOffset(-120) }, 3);
  // 2人目：佐藤 健太（蹴り技習得・月4回）
  addMember({ id: 'M002', name: '佐藤 健太', lineUserId: 'U-demo-2', course: '蹴り技習得', plan: '月4回コース', planStart: dayOffset(-60), expiry: '', goalWeight: '', createdAt: dayOffset(-60) }, 2);
  // 3人目：鈴木 由美（ストレス発散・都度払い・LINE未連携）
  addMember({ id: 'M003', name: '鈴木 由美', lineUserId: '', course: 'ストレス発散', plan: '都度払い', planStart: '', expiry: '', goalWeight: '', createdAt: dayOffset(-20) }, 0);

  // 田中さん：週2ペースのレッスンと体組成
  for (let d = -118, k = 0; d <= 0; d += (k % 2 ? 4 : 3), k++) {
    const p = (d + 118) / 118;
    db.menus.push({ memberId: 'M001', date: dayOffset(d), items: MENU_SETS[k % 3], note: '', counted: true });
    db.body.push({ memberId: 'M001', date: dayOffset(d), weight: +(63.8 - 3.6 * p + (rnd() - 0.5) * 0.6).toFixed(1), fat: +(31.6 - 3.4 * p + (rnd() - 0.5) * 0.7).toFixed(1) });
  }
  // デモでは「今日のレッスン」も入れておく
  if (!db.menus.some((m) => m.memberId === 'M001' && m.date === dayOffset(0))) {
    db.menus.push({ memberId: 'M001', date: dayOffset(0), items: MENU_SETS[1], note: '', counted: true });
  }
  const lastMenu = db.menus.filter((m) => m.memberId === 'M001').pop();
  lastMenu.note = '今日は左ミドルを重点的に。腰をしっかり回すのがポイントです！';
  [[-60, '先週より姿勢がぐっと安定してきました。ステップもスムーズです！'],
   [-25, 'ミット3分×3R完走、おめでとうございます！体重も順調に落ちています。'],
   [-4, '体重がついに60kg台前半に！ミットのパンチも重くなってきました。次回はミドルキックを強化していきましょう。水分補給を忘れずに！']]
    .forEach(([d, text]) => db.messages.push({ id: newId('C'), memberId: 'M001', date: `${dayOffset(d)} 21:00`, text, from: '坂口 風太' }));

  // 佐藤さん
  [-26, -19, -12, -5].forEach((d, i) => {
    db.menus.push({ memberId: 'M002', date: dayOffset(d), items: MENU_SETS[(i + 1) % 3], note: '', counted: true });
    db.body.push({ memberId: 'M002', date: dayOffset(d), weight: +(71.2 - i * 0.3).toFixed(1), fat: +(18.4 - i * 0.2).toFixed(1) });
  });
  db.messages.push({ id: newId('C'), memberId: 'M002', date: `${dayOffset(-5)} 20:30`, text: 'ミドルキックの軸足、とても良くなりました！', from: '坂口 風太' });
  // 鈴木さん
  db.menus.push({ memberId: 'M003', date: dayOffset(-6), items: MENU_SETS[0], note: '', counted: true });

  // 承認待ち
  db.pending.push({ lineUserId: 'U-demo-pending', displayName: 'ゆみ', requestedAt: `${dayOffset(-1)} 19:42` });

  /* ----- サーバーと同じ形のデータを返す ----- */
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const err = (code, message) => Object.assign(new Error(message), { code });

  function bundle(memberId) {
    const m = db.members.find((x) => x.id === memberId);
    if (!m) throw err('not_found', '会員が見つかりません');
    const { lineUserId, ...pub } = m;
    return clone({
      member: { ...pub, linked: !!lineUserId },
      menus: db.menus.filter((x) => x.memberId === memberId).map(({ memberId: _, ...r }) => r),
      body: db.body.filter((x) => x.memberId === memberId).map(({ memberId: _, ...r }) => r),
      messages: db.messages.filter((x) => x.memberId === memberId).map(({ memberId: _, ...r }) => r),
      milestones: db.milestones.filter((x) => x.memberId === memberId).sort((a, b) => a.order - b.order).map(({ memberId: _, order, ...r }) => r),
    });
  }

  function summaries() {
    const t = ymd(new Date());
    return clone(db.members.map((m) => ({
      id: m.id, name: m.name, course: m.course, plan: m.plan, linked: !!m.lineUserId,
      lastLesson: db.menus.filter((x) => x.memberId === m.id && x.date <= t).map((x) => x.date).sort().pop() || '',
    })));
  }

  function requireMember(id) {
    const m = db.members.find((x) => x.id === id);
    if (!m) throw err('not_found', '会員が見つかりません');
    return m;
  }

  function createMember(p) {
    const m = { id: newId('M'), name: p.name, lineUserId: p.lineUserId || '', course: p.course || 'ダイエット', plan: p.plan || '都度払い', planStart: p.planStart || '', expiry: p.expiry || '', goalWeight: p.goalWeight || '', createdAt: now() };
    addMember(m, 0);
    return m;
  }

  function handle(action, p, role) {
    return new Promise((resolve, reject) => setTimeout(() => {
      try { resolve(route(action, p || {}, ME[role])); } catch (e) { reject(e); }
    }, 180));
  }

  function route(action, p, userId) {
    const trainer = db.trainers.find((t) => t.lineUserId === userId);
    const member = db.members.find((m) => m.lineUserId && m.lineUserId === userId);
    if (action === 'init') {
      if (trainer) return { role: 'trainer', me: { name: trainer.name }, members: summaries(), pending: clone(db.pending) };
      if (member) return { role: 'member', me: { name: member.name }, bundle: bundle(member.id) };
      return { role: 'pending', me: { name: 'デモ 太郎' } };
    }
    if (!trainer) throw err('forbidden', 'この操作はトレーナーのみ可能です');
    const m = p.memberId && action !== 'linkLine' ? requireMember(p.memberId) : null;
    switch (action) {
      case 'getMember': return { bundle: bundle(m.id) };
      case 'saveMember': {
        if (!p.name) throw err('invalid', 'お名前を入力してください');
        let target;
        if (p.id) { target = requireMember(p.id); Object.assign(target, { name: p.name, course: p.course, plan: p.plan, planStart: p.planStart, expiry: p.expiry, goalWeight: p.goalWeight === '' ? '' : Number(p.goalWeight) }); }
        else target = createMember(p);
        return { bundle: bundle(target.id), members: summaries() };
      }
      case 'saveMenu': {
        const ex = db.menus.find((x) => x.memberId === m.id && x.date === p.date);
        const row = { memberId: m.id, date: p.date, items: p.items, note: p.note, counted: !!p.counted };
        if (ex) Object.assign(ex, row); else db.menus.push(row);
        return { bundle: bundle(m.id), members: summaries() };
      }
      case 'deleteMenu': db.menus = db.menus.filter((x) => !(x.memberId === m.id && x.date === p.date)); return { bundle: bundle(m.id), members: summaries() };
      case 'saveBody': {
        const ex = db.body.find((x) => x.memberId === m.id && x.date === p.date);
        const row = { memberId: m.id, date: p.date, weight: p.weight === '' ? '' : Number(p.weight), fat: p.fat === '' ? '' : Number(p.fat) };
        if (ex) Object.assign(ex, row); else db.body.push(row);
        return { bundle: bundle(m.id) };
      }
      case 'deleteBody': db.body = db.body.filter((x) => !(x.memberId === m.id && x.date === p.date)); return { bundle: bundle(m.id) };
      case 'addMessage':
        if (!p.text) throw err('invalid', 'ひとことを入力してください');
        db.messages.push({ id: newId('C'), memberId: m.id, date: now(), text: p.text, from: trainer.name });
        return { bundle: bundle(m.id) };
      case 'deleteMessage': db.messages = db.messages.filter((x) => !(x.memberId === m.id && x.id === p.id)); return { bundle: bundle(m.id) };
      case 'addMilestone': {
        const order = db.milestones.filter((x) => x.memberId === m.id).length;
        db.milestones.push({ id: newId('S'), memberId: m.id, title: p.title, done: false, doneDate: '', order });
        return { bundle: bundle(m.id) };
      }
      case 'setMilestone': {
        const s = db.milestones.find((x) => x.memberId === m.id && x.id === p.id);
        if (s) { s.done = !!p.done; s.doneDate = p.done ? ymd(new Date()) : ''; }
        return { bundle: bundle(m.id) };
      }
      case 'deleteMilestone': db.milestones = db.milestones.filter((x) => !(x.memberId === m.id && x.id === p.id)); return { bundle: bundle(m.id) };
      case 'linkLine': {
        const pend = db.pending.find((x) => x.lineUserId === p.lineUserId);
        if (!pend) throw err('not_found', '承認待ちの申請が見つかりません');
        if (p.memberId === 'new') createMember({ name: pend.displayName || '新しい会員', lineUserId: pend.lineUserId });
        else {
          const target = requireMember(p.memberId);
          if (target.lineUserId) throw err('invalid', 'この会員はすでに別のLINEと連携しています');
          target.lineUserId = pend.lineUserId;
        }
        db.pending = db.pending.filter((x) => x !== pend);
        return { members: summaries(), pending: clone(db.pending) };
      }
      case 'dismissPending': db.pending = db.pending.filter((x) => x.lineUserId !== p.lineUserId); return { pending: clone(db.pending) };
      case 'unlinkLine': m.lineUserId = ''; return { bundle: bundle(m.id), members: summaries() };
      default: throw err('invalid', `不明な操作です: ${action}`);
    }
  }

  window.FormistDemo = { handle };
})();
