/** 稀有度要用的累計數字，以及把這一筆作答記回去。
 *
 * 後端是一支 Apps Script Web App（backend/Code.gs）。沒設定或關掉時一律回 null，
 * rarity.js 會改用「依組合固定的估計值」，結果頁不會壞掉。
 */
import { API_ENDPOINT, PREFETCH_TIMEOUT_MS, STATS_TIMEOUT_MS, USE_LIVE_STATS } from "./config.js";
import { drain } from "./funnel.js";

/** 讀稀有度要兩個都開；記作答只要有後端網址就記（09-29 起拆開）。 */
const canRead = () => Boolean(API_ENDPOINT) && USE_LIVE_STATS;
const canWrite = () => Boolean(API_ENDPOINT);

/**
 * 09-29 起改成「一進站就在背景抓整張組合統計表」。
 * Apps Script 的程式 1～2 秒就跑完，但 Google 要 9～27 秒才把回應送回來，
 * 等到結果頁才問一定來不及。一進站就問，使用者作答的那半分鐘剛好把它等完；
 * 結果頁拿到的是已經在手上的表，只要查自己的組合，不必再等。
 */
let table = null;

export function prefetchStats() {
  if (table || !canRead() || new URLSearchParams(location.search).get("stats")) return;
  table = fetchTable();
}

async function fetchTable() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PREFETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_ENDPOINT}?all=1`, { signal: abort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Number.isFinite(data.total) || !data.counts || typeof data.counts !== "object") {
      throw new Error("回傳格式不對");
    }
    return data;
  } catch (error) {
    console.warn("拿不到組合統計表，稀有度改用估計值", error);
    return null;   // 拿不到或太慢就降級，不要讓結果頁壞掉
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchStats(comboKey) {
  const demo = new URLSearchParams(location.search).get("stats");
  if (demo) return demoStats(demo);      // 驗收用的網址參數永遠優先，不必關掉後端
  if (!canRead()) return null;
  prefetchStats();
  // 表通常早就到了；還沒到的話結果頁最多再等 STATS_TIMEOUT_MS
  const data = await Promise.race([table, wait(STATS_TIMEOUT_MS)]);
  if (!data) return null;
  const same = Number(data.counts[comboKey] ?? 0);
  return { total: data.total, same: Number.isFinite(same) ? same : 0 };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/** 同一個分頁重複測同一個組合只記一次，不然重整就會把自己的組合灌上去。 */
const LOGGED_KEY = "spotime.logged";

function alreadyLogged(comboKey) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(LOGGED_KEY) ?? "[]");
    if (seen.includes(comboKey)) return true;
    sessionStorage.setItem(LOGGED_KEY, JSON.stringify([...seen, comboKey]));
    return false;
  } catch {
    return false;    // 無痕模式讀不到就當作沒記過，頂多多一筆
  }
}

/**
 * 記一筆作答。不 await、也不擋畫面——後端慢或掛掉都不該讓結果頁卡住。
 * Content-Type 用 text/plain 是必要的：Apps Script 不會回應 CORS 預檢，
 * 送 application/json 會先發 OPTIONS 然後整個失敗。
 */
export function logAnswer(comboKey, answers, visit, seconds = null) {
  if (!canWrite() || alreadyLogged(comboKey)) return;
  fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    // 心情只跟匿名的作答一起記，不跟 email 綁在一起（「最近有點難過」算敏感資料）
    // 作答花了幾秒也只放這裡：時間長短不需要跟 email 綁在一起
    // steps：到結果頁為止還沒送的漏斗步驟（funnel.js），/api 收下來就拿掉，不會轉給 Google
    body: JSON.stringify({ ...answerPayload(comboKey, answers, visit), mood: answers.mood ?? "", seconds: seconds ?? "", steps: drain() }),
    keepalive: true,
    redirect: "manual",     // 轉址之前資料就寫進去了，後面那頁不用拿（見 signup.js）
  }).catch((error) => console.warn("作答沒記錄到", error));
}

/** 作答與 email 共用的欄位：三題各一欄、跟造型貼有多熟（email 分眾用），加上裝置與來源。
   心情刻意不放這裡，見 logAnswer()。 */
export function answerPayload(comboKey, answers, visit) {
  return {
    type: "answer",
    combo: comboKey,
    shape: answers.shape,
    scene: answers.scene,
    position: answers.position,
    familiarity: answers.familiarity ?? "",
    device: visit.device,
    app: visit.app,
    source: visit.source,
  };
}

/** 驗收用：?stats=<級距> 直接預覽各種比例下的句子。
   不帶參數就照實問後端；樣本不到 300 時 rarity.js 會自己改用估計值。 */
const DEMO = Object.freeze({
  few: { total: 87, same: 12 },          // 樣本不足 → 一樣會走估計值
  ultra: { total: 4200, same: 21 },      // 0.5%
  rare: { total: 4200, same: 84 },       // 2.0%
  niche: { total: 4200, same: 210 },     // 5.0%
  liked: { total: 4200, same: 500 },     // 12%
  common: { total: 4200, same: 1050 },   // 25%
});

function demoStats(kind) {
  return DEMO[kind] ?? null;
}
