/**
 * FORMIST GYM 会員マイページ API（Google Apps Script）
 *
 * Googleスプレッドシートにデータを保存し、LINEのIDトークンで本人確認をします。
 *  - 会員：自分の記録だけを読める（書き込みは不可）
 *  - トレーナー：「Trainers」シートに登録されたLINEアカウントだけが、全員分の閲覧・入力ができる
 *
 * 設定手順は mypage/README.md を見てください。
 * スクリプトプロパティ LINE_CHANNEL_ID に、LIFFアプリを作った LINEログインチャネルの「チャネルID」を入れます。
 */

const TZ = 'Asia/Tokyo';
const SHEETS = {
  Members: ['id', 'name', 'lineUserId', 'course', 'plan', 'planStart', 'expiry', 'goalWeight', 'createdAt'],
  Trainers: ['lineUserId', 'name'],
  Pending: ['lineUserId', 'displayName', 'requestedAt'],
  Menus: ['memberId', 'date', 'items', 'note', 'counted', 'updatedAt'],
  Body: ['memberId', 'date', 'weight', 'bodyFat'],
  Messages: ['id', 'memberId', 'date', 'text', 'from'],
  Milestones: ['id', 'memberId', 'title', 'done', 'doneDate', 'order'],
};
const COURSES = ['ダイエット', '蹴り技習得', 'ストレス発散'];
const PLANS = ['都度払い', '5回券', '10回券', '月4回コース', '月8回コース'];
const DEFAULT_MILESTONES = {
  'ダイエット': ['正しい構えとステップ', 'ワンツーをきれいに打てる', 'ミット打ち 3分×3R 完走', '体重 −3kg', '目標体重を達成'],
  '蹴り技習得': ['構えとステップ', 'ローキック', 'ミドルキック', 'ハイキック', 'パンチからキックのコンビネーション'],
  'ストレス発散': ['基本の構え', 'ワンツー', 'フック・アッパー', 'ミット打ち 3分×5R 完走', '自分だけのコンビネーション'],
};

/* ===================== 初期設定 ===================== */

/** 最初に1回だけ実行：必要なシートと見出し行を作ります（何度実行しても大丈夫です） */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach((name) => {
    const cols = SHEETS[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(cols);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
    // 日付やIDが勝手に変換されないよう、すべて書式なしテキストにする
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });
  const first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
}

/* ===================== 入口 ===================== */

function doGet() {
  return ContentService.createTextOutput('FORMIST mypage API is running.');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = verifyIdToken(req.idToken);
    out = { ok: true, data: route(String(req.action || ''), req.payload || {}, user) };
  } catch (err) {
    const known = err && err.code;
    if (!known) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: known || 'server', message: known ? err.message : 'サーバーでエラーが発生しました。時間をおいてお試しください。' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function apiError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/* ===================== 本人確認（LINE IDトークン） ===================== */

function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') throw apiError('auth', 'LINEでログインしてから開いてください。');
  const channelId = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ID');
  if (!channelId) throw apiError('setup', 'スクリプトプロパティ LINE_CHANNEL_ID が設定されていません。');

  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  // LINEのサーバーで署名・有効期限・発行先チャネルを検証する
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw apiError('auth', 'ログインの有効期限が切れました。もう一度開き直してください。');
  const p = JSON.parse(res.getContentText());
  if (!p.sub) throw apiError('auth', 'ログイン情報を確認できませんでした。');
  const user = { userId: p.sub, name: p.name || '' };
  const ttl = Math.max(0, Math.min(600, Math.floor((p.exp * 1000 - Date.now()) / 1000) - 30));
  if (ttl > 0) cache.put(key, JSON.stringify(user), ttl);
  return user;
}

/* ===================== シート操作 ===================== */

function table(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw apiError('setup', 'シート「' + name + '」がありません。Apps Script で setup を実行してください。');
  const cols = SHEETS[name];
  const last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
  const rows = values.map((v, i) => {
    const o = { _row: i + 2 };
    cols.forEach((c, j) => { o[c] = normalize(v[j]); });
    return o;
  });
  return {
    rows,
    insert(obj) { sh.appendRow(cols.map((c) => cell(obj[c]))); },
    update(row, obj) { sh.getRange(row._row, 1, 1, cols.length).setValues([cols.map((c) => cell(c in obj ? obj[c] : row[c]))]); },
    /** 複数行を削除するときは下の行から消す */
    removeRows(list) { list.map((r) => r._row).sort((a, b) => b - a).forEach((n) => sh.deleteRow(n)); },
  };
}

function normalize(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}

/** 数式として解釈されないようにして書き込む */
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

const bool = (v) => v === true || String(v).toUpperCase() === 'TRUE';
const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? '' : Number(v));
const nowStr = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
const todayStr = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const newId = (prefix) => prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10);

/* ===================== 入力チェック ===================== */

function reqDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) throw apiError('invalid', '日付の形式が正しくありません。');
  return String(s);
}
function optDate(s) { return s ? reqDate(s) : ''; }
function optNum(v, min, max, label) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!isFinite(n) || n < min || n > max) throw apiError('invalid', label + 'の値が正しくありません。');
  return Math.round(n * 10) / 10;
}
function text(v, max, label, required) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (required && !s) throw apiError('invalid', label + 'を入力してください。');
  if (s.length > max) throw apiError('invalid', label + 'は' + max + '文字以内にしてください。');
  return s;
}
function oneOf(v, list, label) {
  if (list.indexOf(v) < 0) throw apiError('invalid', label + 'の値が正しくありません。');
  return v;
}

/* ===================== データの組み立て ===================== */

function bundle(memberId) {
  const m = table('Members').rows.find((r) => r.id === memberId);
  if (!m) throw apiError('not_found', '会員が見つかりません。');
  const of = (name) => table(name).rows.filter((r) => r.memberId === memberId);
  return {
    member: {
      id: m.id, name: m.name, course: m.course, plan: m.plan, planStart: m.planStart,
      expiry: m.expiry, goalWeight: num(m.goalWeight), createdAt: m.createdAt, linked: !!m.lineUserId,
    },
    menus: of('Menus').map((r) => ({ date: r.date, items: String(r.items).split('\n').filter(Boolean), note: r.note, counted: bool(r.counted) })),
    body: of('Body').map((r) => ({ date: r.date, weight: num(r.weight), fat: num(r.bodyFat) })),
    messages: of('Messages').map((r) => ({ id: r.id, date: r.date, text: r.text, from: r.from })),
    milestones: of('Milestones').sort((a, b) => Number(a.order) - Number(b.order))
      .map((r) => ({ id: r.id, title: r.title, done: bool(r.done), doneDate: r.doneDate })),
  };
}

function summaries() {
  const t = todayStr();
  const last = {};
  table('Menus').rows.forEach((r) => {
    if (r.date <= t && (!last[r.memberId] || r.date > last[r.memberId])) last[r.memberId] = r.date;
  });
  return table('Members').rows.map((m) => ({
    id: m.id, name: m.name, course: m.course, plan: m.plan, linked: !!m.lineUserId, lastLesson: last[m.id] || '',
  }));
}

function pendingList() {
  return table('Pending').rows.map((r) => ({ lineUserId: r.lineUserId, displayName: r.displayName, requestedAt: r.requestedAt }));
}

function createMember(p) {
  const m = {
    id: newId('M'), name: p.name, lineUserId: p.lineUserId || '', course: p.course || COURSES[0], plan: p.plan || PLANS[0],
    planStart: p.planStart || '', expiry: p.expiry || '', goalWeight: p.goalWeight === undefined ? '' : p.goalWeight, createdAt: nowStr(),
  };
  table('Members').insert(m);
  const ms = table('Milestones');
  (DEFAULT_MILESTONES[m.course] || []).forEach((title, i) => ms.insert({ id: newId('S'), memberId: m.id, title, done: false, doneDate: '', order: i }));
  return m;
}

function findMember(id) {
  const m = table('Members').rows.find((r) => r.id === id);
  if (!m) throw apiError('not_found', '会員が見つかりません。');
  return m;
}

/* ===================== ルーティング ===================== */

function route(action, p, user) {
  const trainer = table('Trainers').rows.find((r) => r.lineUserId === user.userId);

  if (action === 'init') {
    if (trainer) return { role: 'trainer', me: { name: trainer.name || user.name }, members: summaries(), pending: pendingList() };
    const member = table('Members').rows.find((r) => r.lineUserId && r.lineUserId === user.userId);
    if (member) return { role: 'member', me: { name: member.name }, bundle: bundle(member.id) };
    registerPending(user);
    return { role: 'pending', me: { name: user.name } };
  }

  // ここから下はトレーナーのみ
  if (!trainer) throw apiError('forbidden', 'この操作はトレーナーのみ可能です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return trainerAction(action, p, trainer.name || user.name);
  } finally {
    lock.releaseLock();
  }
}

function registerPending(user) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const t = table('Pending');
    const ex = t.rows.find((r) => r.lineUserId === user.userId);
    const row = { lineUserId: user.userId, displayName: text(user.name, 60, '名前'), requestedAt: nowStr() };
    if (ex) t.update(ex, row); else t.insert(row);
  } finally {
    lock.releaseLock();
  }
}

function trainerAction(action, p, trainerName) {
  const mid = () => findMember(String(p.memberId || '')).id;

  switch (action) {
    case 'getMember':
      return { bundle: bundle(mid()) };

    case 'saveMember': {
      const data = {
        name: text(p.name, 40, 'お名前', true),
        course: oneOf(p.course, COURSES, 'コース'),
        plan: oneOf(p.plan, PLANS, 'プラン'),
        planStart: optDate(p.planStart),
        expiry: optDate(p.expiry),
        goalWeight: optNum(p.goalWeight, 20, 250, '目標体重'),
      };
      let id;
      if (p.id) {
        const m = findMember(String(p.id));
        table('Members').update(m, data);
        id = m.id;
      } else {
        id = createMember(data).id;
      }
      return { bundle: bundle(id), members: summaries() };
    }

    case 'saveMenu': {
      const memberId = mid();
      const date = reqDate(p.date);
      const items = (Array.isArray(p.items) ? p.items : []).map((s) => text(s, 80, 'メニュー')).filter(Boolean);
      if (!items.length) throw apiError('invalid', 'メニューを1つ以上入力してください。');
      if (items.length > 20) throw apiError('invalid', 'メニューは20項目までです。');
      const row = { memberId, date, items: items.join('\n'), note: text(p.note, 300, 'メモ'), counted: !!p.counted, updatedAt: nowStr() };
      const t = table('Menus');
      const ex = t.rows.find((r) => r.memberId === memberId && r.date === date);
      if (ex) t.update(ex, row); else t.insert(row);
      return { bundle: bundle(memberId), members: summaries() };
    }

    case 'deleteMenu': {
      const memberId = mid();
      const date = reqDate(p.date);
      const t = table('Menus');
      t.removeRows(t.rows.filter((r) => r.memberId === memberId && r.date === date));
      return { bundle: bundle(memberId), members: summaries() };
    }

    case 'saveBody': {
      const memberId = mid();
      const date = reqDate(p.date);
      const row = { memberId, date, weight: optNum(p.weight, 20, 250, '体重'), bodyFat: optNum(p.fat, 1, 70, '体脂肪率') };
      if (row.weight === '' && row.bodyFat === '') throw apiError('invalid', '体重か体脂肪率を入力してください。');
      const t = table('Body');
      const ex = t.rows.find((r) => r.memberId === memberId && r.date === date);
      if (ex) t.update(ex, row); else t.insert(row);
      return { bundle: bundle(memberId) };
    }

    case 'deleteBody': {
      const memberId = mid();
      const date = reqDate(p.date);
      const t = table('Body');
      t.removeRows(t.rows.filter((r) => r.memberId === memberId && r.date === date));
      return { bundle: bundle(memberId) };
    }

    case 'addMessage': {
      const memberId = mid();
      table('Messages').insert({ id: newId('C'), memberId, date: nowStr(), text: text(p.text, 500, 'ひとこと', true), from: trainerName });
      return { bundle: bundle(memberId) };
    }

    case 'deleteMessage': {
      const memberId = mid();
      const t = table('Messages');
      t.removeRows(t.rows.filter((r) => r.memberId === memberId && r.id === p.id));
      return { bundle: bundle(memberId) };
    }

    case 'addMilestone': {
      const memberId = mid();
      const t = table('Milestones');
      const order = t.rows.filter((r) => r.memberId === memberId).reduce((mx, r) => Math.max(mx, Number(r.order) || 0), -1) + 1;
      t.insert({ id: newId('S'), memberId, title: text(p.title, 40, 'ステップ', true), done: false, doneDate: '', order });
      return { bundle: bundle(memberId) };
    }

    case 'setMilestone': {
      const memberId = mid();
      const t = table('Milestones');
      const ex = t.rows.find((r) => r.memberId === memberId && r.id === p.id);
      if (!ex) throw apiError('not_found', 'ステップが見つかりません。');
      t.update(ex, { done: !!p.done, doneDate: p.done ? todayStr() : '' });
      return { bundle: bundle(memberId) };
    }

    case 'deleteMilestone': {
      const memberId = mid();
      const t = table('Milestones');
      t.removeRows(t.rows.filter((r) => r.memberId === memberId && r.id === p.id));
      return { bundle: bundle(memberId) };
    }

    case 'linkLine': {
      const pt = table('Pending');
      const pend = pt.rows.find((r) => r.lineUserId === p.lineUserId);
      if (!pend) throw apiError('not_found', '承認待ちの申請が見つかりません。');
      const mt = table('Members');
      if (mt.rows.some((r) => r.lineUserId === pend.lineUserId)) throw apiError('invalid', 'このLINEはすでに別の会員と連携しています。');
      if (p.memberId === 'new') {
        createMember({ name: text(pend.displayName, 40, 'お名前') || '新しい会員', lineUserId: pend.lineUserId });
      } else {
        const m = findMember(String(p.memberId || ''));
        if (m.lineUserId) throw apiError('invalid', 'この会員はすでに別のLINEと連携しています。');
        mt.update(m, { lineUserId: pend.lineUserId });
      }
      table('Pending').removeRows([pend]);
      return { members: summaries(), pending: pendingList() };
    }

    case 'dismissPending': {
      const t = table('Pending');
      t.removeRows(t.rows.filter((r) => r.lineUserId === p.lineUserId));
      return { pending: pendingList() };
    }

    case 'unlinkLine': {
      const m = findMember(String(p.memberId || ''));
      table('Members').update(m, { lineUserId: '' });
      return { bundle: bundle(m.id), members: summaries() };
    }

    default:
      throw apiError('invalid', '不明な操作です：' + action);
  }
}
