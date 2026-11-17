/**
 * SPOTIME QUIZ 的後端。一支 Apps Script Web App 同時做三件事：
 *
 *   GET  ?combo=star-concert-cheek        → { total, same }   結果頁算稀有度用
 *   POST { type:"answer", combo, shape, scene, position, familiarity, mood, seconds, device, app, source }
 *                                         → 記一筆作答
 *   POST { type:"signup", email, 同上欄位 } → 記一筆 email
 *   POST { type:"funnel", site, days:{ "2026/10/06": { open: 120, ... } } }
 *                                         → 流量漏斗：每天一列，有就蓋過去（10-06，第 10 版；10-07 第 11 版修重複列）
 *                                           只有 Cloudflare 每小時送一次，網頁不會直接送
 *
 * 為什麼 POST 的 Content-Type 一定要是 text/plain：
 * Apps Script 的 Web App 不會回應瀏覽器的 CORS 預檢（OPTIONS）請求。
 * 只要前端送 application/json，瀏覽器就會先發預檢、然後失敗。
 * 送 text/plain 屬於「簡單請求」，不會觸發預檢，內容照樣是 JSON 字串。
 * 前端 signup.js / stats.js 已經照這個規則寫，改這裡之前先看那兩支。
 *
 * 10-05 起網頁改打 Cloudflare 的 /api（worker/api.js），由它限流後再轉來這裡，
 * 每筆都帶通行碼 token。指令碼屬性設了 PROXY_TOKEN 之後，沒帶對的請求一律不收，
 * 繞過限流直接打這支網址就沒用了。屬性沒設＝不檢查（舊版網頁直接打這裡也還能用）。
 * 設定位置：Apps Script 左側齒輪「專案設定」→ 最下面「指令碼屬性」。
 */

const SHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';   // 試算表網址 /d/ 後面那一段
/* 分頁是用名字找的。09-29 Jimmy 在試算表裡改過分頁名稱，這裡要跟著改，
   不然找不到分頁就會自己再開一個同舊名的新分頁，資料寫到那裡去。 */
const TAB_SIGNUP = 'Email訂閱名單';
const TAB_ANSWER = '作答結果';
const TAB_FUNNEL = '流量漏斗';
/* 10-05 起稀有度直接數「作答結果」，不再寫「組合統計」分頁（見 readCounts_）。
   那個分頁改成試算表公式，自己會跟著作答結果更新，這支程式不碰它。 */

/* 每一題各佔一欄，再加裝置、App、流量來源。
   10-06 Jimmy 要「照題目順序排」：Q1 心情 → Q2 造型 → Q3 場景 → Q4 位置 → Q5 熟悉度，
   後面才是組合、作答秒數與裝置來源。舊資料已經一次搬好欄位（scratchpad 有備份），
   以後要加欄位，一樣要連舊資料一起搬，不然新舊列會對不上。
   心情與作答秒數只進作答分頁、不進 email 名單——「最近有點難過」算敏感資料，不跟個人綁在一起。 */
const VISIT_HEADER = ['裝置', 'App', '流量來源'];
const SIGNUP_HEADER = ['時間', 'email', '造型', '場景', '位置', '熟悉度', '組合', '表單'].concat(VISIT_HEADER);
const ANSWER_HEADER = ['時間', '心情', '造型', '場景', '位置', '熟悉度', '組合', '作答秒數'].concat(VISIT_HEADER);
/* 作答結果裡造型、場景、位置在第幾欄（從 1 算），數稀有度用 */
const ANSWER_SHAPE_COL = ANSWER_HEADER.indexOf('造型') + 1;

/** 只收得下這些值。後端網址是公開的，亂送的字串不能直接寫進試算表。
   左邊是前端送來的代號，右邊是測驗上實際看到的選項文字，試算表裡寫右邊。
   要跟 web/scripts/config.js 的 QUESTIONS 對齊。 */
const LABELS = {
  shape: { heart: '愛心', star: '星星', teardrop: '水滴', tomato: '蕃茄' },   // 10-08 雲朵款取消改蕃茄
  scene: { concert: '演唱會', baseball: '棒球場', photobooth: '拍貼機', campus: '校園活動' },
  position: { cheek: '臉頰', under_eye: '眼下', forehead_side: '額角', neck: '脖子' },
  familiarity: { daily: '出門必貼', events: '活動節慶才貼', curious: '想試怕駕馭不來', new: '沒聽過' },
  mood: { happy: '開心', bored: '無聊', crush: '在想某個人', blue: '難過' },
};
const DEVICES = ['手機', '平板', '電腦'];
const MAX_TEXT = 40;
const MAX_SECONDS = 3600;   // 超過一小時多半是開著分頁去做別的事，不算
const TIME_FORMAT = 'yyyy/MM/dd HH:mm';   // 作答結果的時間欄。不設的話整點 0:00 會只顯示日期

/* 流量漏斗：每一步有幾個人走到（web/scripts/funnel.js 記、worker/funnel.js 加總）。
   左邊是代號，順序要跟那兩支的 FUNNEL_STEPS 一樣；右邊是試算表表頭。 */
const FUNNEL_STEPS = [
  ['open', '進站'], ['ready', '讀取完成'], ['start', '開始作答'], ['selfie', '選自拍'],
  ['q1', 'Q1 心情'], ['q2', 'Q2 造型'], ['q3', 'Q3 場景'], ['q4', 'Q4 位置'], ['q5', 'Q5 熟悉度'],
  ['result', '看到結果'], ['share', '按 IG 限動'], ['signup', '留 email'], ['line', '按 LINE 好友'],
];
const FUNNEL_HEADER = ['日期', '站別'].concat(FUNNEL_STEPS.map(function (s) { return s[1]; })).concat(['更新時間']);
const FUNNEL_SITES = ['正式站', '測試站'];
const MAX_COUNT = 10000000;

/* 10-05 拿掉了鎖。以前每筆作答都要排隊改「組合統計」的數字，人一多就卡在鎖上，
   等太久的那筆會整個失敗。現在作答只「加一列」（appendRow 本身不會互相蓋掉），
   稀有度要用的數字改成讀的時候自己數，所以不用排隊。

   email 防重複：寫進去之後在快取記一筆「這個 email 剛寫過」，自動重送進來
   看到快取就不再寫，連試算表都不用讀。沒有鎖，極少數情況還是可能多一列，匯出名單時去重即可。 */
const SIGNUP_SEEN_SECONDS = 120;   // 夠蓋過網頁與 /api 的自動重送就好

/** 在 Apps Script 編輯器裡按執行，確認兩個分頁會被建出來、權限也授權過了。

   放在檔案最前面是有原因的：編輯器的「要執行的函式」下拉選單，預設會選
   這個檔案裡第一個定義的函式。setup 擺第一個，打開專案按「執行」就是它，
   不必再去動那個下拉選單。 */
function setup() {
  Logger.log('訂閱：' + ensureHeader_(TAB_SIGNUP, SIGNUP_HEADER));
  Logger.log('作答：' + ensureHeader_(TAB_ANSWER, ANSWER_HEADER));
  tab_(TAB_ANSWER, ANSWER_HEADER).getRange('A2:A').setNumberFormat(TIME_FORMAT);
  Logger.log('漏斗：' + funnelTab_().getName());
  Logger.log('三個分頁都在了');
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (!authorized_(params.token)) return json({ error: 'forbidden' });
    const counts = readCounts_();
    const total = Object.keys(counts).reduce(function (n, k) { return n + counts[k]; }, 0);
    // ?all=1：整張表一次給（網頁一進站就在背景抓，見 web/scripts/stats.js）
    if (params.all) return json({ total: total, counts: counts });
    const combo = params.combo || '';
    if (!combo) return json({ error: 'missing combo' });
    return json({ total: total, same: counts[combo] || 0 });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!authorized_(body.token)) return json({ error: 'forbidden' });
    if (body.type === 'signup') return json(saveSignup_(body));
    if (body.type === 'answer') return json(saveAnswer_(body));
    if (body.type === 'funnel') return json(saveFunnel_(body));
    return json({ error: 'unknown type' });
  } catch (err) {
    return json({ error: String(err) });
  }
}

/* ---------- 寫入 ---------- */

function saveSignup_(body) {
  const email = String(body.email || '').trim();
  if (!isEmail_(email)) return { ok: false, error: 'bad email' };

  const cache = CacheService.getScriptCache();
  const seenKey = 'signup:' + email.toLowerCase();
  if (cache.get(seenKey)) return { ok: true };       // 剛寫過（多半是網頁自動重送）

  const sheet = tab_(TAB_SIGNUP, SIGNUP_HEADER);
  // 同一個 email 重複填就不再多一列，只當作成功。
  const known = sheet.getLastRow() > 1
    ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().map(function (r) {
        return String(r[0]).toLowerCase();
      })
    : [];
  if (known.indexOf(email.toLowerCase()) === -1) {
    const d = detail_(body) || EMPTY_DETAIL;
    sheet.appendRow([new Date(), safe_(email), d.shape, d.scene, d.position, d.familiarity, d.label, 'quiz']
      .concat(d.visit));
  }
  // 寫成功才記。先記再寫的話，寫失敗之後的自動重送會被當成重複跳過，這個 email 就掉了
  cache.put(seenKey, '1', SIGNUP_SEEN_SECONDS);
  return { ok: true };
}

/** 把三題答案、熟悉度、裝置、來源整理好（都是中文，給人看）。任何一題不在清單裡就整筆不收。 */
function detail_(body) {
  const shape = labelOf_('shape', body.shape);
  const scene = labelOf_('scene', body.scene);
  const position = labelOf_('position', body.position);
  if (!shape || !scene || !position) return null;
  const device = DEVICES.indexOf(String(body.device)) === -1 ? '未知' : String(body.device);
  return {
    shape: shape,
    scene: scene,
    position: position,
    label: [shape, scene, position].join(' × '),
    // 熟悉度是後來加的題目，舊版網頁沒送就留白，不因此整筆不收
    familiarity: labelOf_('familiarity', body.familiarity) || '',
    visit: [device, text_(body.app), text_(body.source)],
  };
}

/** email 那列沒有作答資料時（理論上不會發生）的空白欄 */
const EMPTY_DETAIL = { shape: '', scene: '', position: '', familiarity: '', label: '', visit: ['', '', ''] };

/** 網頁送來的作答秒數。不是 0～MAX_SECONDS 的整數就留白（舊版網頁不會送）。 */
function secondsOf_(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SECONDS ? n : '';
}

function labelOf_(question, value) {
  const table = LABELS[question];
  const id = String(value || '');
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null;
}

/** 開頭是 = + - @ 的字串（前面有空白也算），試算表會當成公式執行（例如網址帶
   ?utm_source==HYPERLINK(...)），前面補一個單引號讓它只是文字。 */
function text_(value) {
  return safe_(String(value || '').replace(/[\r\n\t]/g, ' ').slice(0, MAX_TEXT));
}

function safe_(text) {
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
}

function saveAnswer_(body) {
  const d = detail_(body);
  if (!d) return { ok: false, error: 'bad answer' };
  // 時間只記到整點：送 email 那列的時間精確到秒，作答這列如果也精確到秒，
  // 兩邊一對就知道誰填了什麼心情（10-05 Codex 指出）。記到小時就對不起來了。
  tab_(TAB_ANSWER, ANSWER_HEADER).appendRow([hourOf_(new Date()), labelOf_('mood', body.mood) || '',
    d.shape, d.scene, d.position, d.familiarity, d.label, secondsOf_(body.seconds)].concat(d.visit));
  CacheService.getScriptCache().remove('counts');
  return { ok: true };
}

function hourOf_(date) {
  return new Date(Math.floor(date.getTime() / 3600000) * 3600000);
}

/** 流量漏斗：一天一個站一列。每小時送來的是「到目前為止的總數」，所以找到同一天就整列蓋掉。
   兩個站（正式／測試）可能同一分鐘送來，這裡要排隊，不然會各自新增一列同一天。 */
function saveFunnel_(body) {
  const site = String(body.site || '');
  if (FUNNEL_SITES.indexOf(site) === -1) return { ok: false, error: 'bad site' };
  const days = body.days && typeof body.days === 'object' ? body.days : {};
  const keys = Object.keys(days).filter(function (d) { return /^\d{4}\/\d{2}\/\d{2}$/.test(d); }).sort();
  if (!keys.length) return { ok: false, error: 'no days' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'busy' };
  try {
    const sheet = funnelTab_();
    const last = sheet.getLastRow();
    const found = {};
    const extra = [];   // 同一天同一站多出來的列（10-07 以前的版本會一小時多一列），留第一列、其他刪掉
    if (last > 1) {
      sheet.getRange(2, 1, last - 1, 2).getValues().forEach(function (r, i) {
        const key = dayKey_(r[0]) + '|' + String(r[1]);
        if (found[key]) extra.push(i + 2);
        else found[key] = i + 2;
      });
    }
    const now = new Date();
    keys.forEach(function (day) {
      const counts = days[day] || {};
      const row = [day, site].concat(FUNNEL_STEPS.map(function (s) { return countOf_(counts[s[0]]); })).concat([now]);
      const at = found[day + '|' + site];
      if (at) sheet.getRange(at, 1, 1, row.length).setValues([row]);
      else sheet.appendRow(row);
    });
    extra.reverse().forEach(function (r) { sheet.deleteRow(r); });   // 從下面刪，上面的列號才不會跑掉
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** 日期欄讀回來可能是文字，也可能被試算表自動轉成日期（10-07 實際發生：轉成日期後永遠對不上，
   每小時就多新增一列）。兩種都換成「2026/10/06」再比。 */
function dayKey_(value) {
  return value instanceof Date ? Utilities.formatDate(value, 'Asia/Taipei', 'yyyy/MM/dd') : String(value).trim();
}

/** 日期欄設成純文字，「2026/10/06」才不會被試算表轉成日期、之後對不上 */
function funnelTab_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_FUNNEL);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_FUNNEL);
    sheet.getRange('A:A').setNumberFormat('@');
    sheet.appendRow(FUNNEL_HEADER);
    sheet.setFrozenRows(1);
  }
  // 11-13 加了「按 LINE 好友」一欄。舊分頁的「更新時間」在它現在要放的位置，
  // 直接蓋表頭的話，舊列的更新時間會被讀成 LINE 人數 → 先在「更新時間」前面插一整欄空的，舊列跟著往右挪
  const width = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  if (header.indexOf('按 LINE 好友') === -1) {
    const at = header.indexOf('更新時間');
    if (at !== -1) sheet.insertColumnBefore(at + 1);
    sheet.getRange(1, 1, 1, FUNNEL_HEADER.length).setValues([FUNNEL_HEADER]);
  }
  return sheet;
}

function countOf_(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_COUNT ? n : 0;
}

/* ---------- 讀取 ---------- */

/** 數「作答結果」裡每個組合有幾筆。試算表存的是中文（愛心、演唱會…），
   這裡換回英文代號，跟前端 config.js 的組合鍵一樣。
   每次都整張讀太慢，快取 60 秒；有新作答時會主動清掉。 */
function readCounts_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('counts');
  if (hit) return JSON.parse(hit);

  const sheet = tab_(TAB_ANSWER, ANSWER_HEADER);
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, ANSWER_SHAPE_COL, last - 1, 3).getValues() : [];
  const ids = { shape: idsOf_('shape'), scene: idsOf_('scene'), position: idsOf_('position') };
  const out = {};
  rows.forEach(function (r) {
    const key = [ids.shape[r[0]], ids.scene[r[1]], ids.position[r[2]]];
    if (key.indexOf(undefined) !== -1) return;     // 手動改過、對不上選項的列不算
    const k = key.join('-');
    out[k] = (out[k] || 0) + 1;
  });
  cache.put('counts', JSON.stringify(out), 60);
  return out;
}

/** LABELS 反過來查：中文 → 英文代號 */
function idsOf_(question) {
  const table = LABELS[question];
  const out = {};
  Object.keys(table).forEach(function (id) { out[table[id]] = id; });
  return out;
}

/** 指令碼屬性沒設 PROXY_TOKEN 就不檢查；設了就要一模一樣 */
function authorized_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('PROXY_TOKEN');
  return !expected || String(token || '') === expected;
}

/* ---------- 小工具 ---------- */

function tab_(name, header) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 舊分頁的表頭比較短（09-29 以前沒有答案與裝置欄），補齊就好，資料列不動。
   只在 setup() 跑——每筆寫入都去讀表頭會多一次試算表往返。 */
function ensureHeader_(name, header) {
  const sheet = tab_(name, header);
  const width = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];
  const same = header.every(function (h, i) { return current[i] === h; });
  if (!same) sheet.getRange(1, 1, 1, header.length).setValues([header]);
  return same ? '不用改' : '已補齊';
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
