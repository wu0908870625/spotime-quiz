/** 流量漏斗：每個人走到哪一步（10-06 Jimmy：「改成看得到誰中途離開」）。
 *
 * 只記「這一步有人走到」，不記是誰：沒有 cookie、沒有編號，送出去的只有步驟名稱。
 * 同一個分頁每一步只算一次（重新測一次會 reload，用 sessionStorage 記住算過的）。
 *
 * 為了少打 /api（Cloudflare 免費方案一天 10 萬次，見 backend/README.md 的流量段落）：
 *   - 讀取畫面結束時送一次（進站、讀取完成）
 *   - 作答與 email 那兩筆本來就要送，把累積的步驟一起帶上（drain）
 *   - 剩下的等使用者離開頁面（切走、關掉）時用 sendBeacon 一次送
 * 計數在 worker/objects.js 的 Funnel，每小時寫進試算表「流量漏斗」分頁。
 */
import { API_ENDPOINT } from "./config.js";

/** 順序就是試算表欄位的順序。改這裡要一起改 worker/api.js 與 backend/Code.gs 的 FUNNEL_STEPS */
export const FUNNEL_STEPS = Object.freeze([
  "open",      // 網頁程式開始跑
  "ready",     // 讀取畫面結束
  "start",     // 開場題選了（自拍或範例照）
  "selfie",    // 開場選「用自拍」
  "q1", "q2", "q3", "q4", "q5",
  "result",    // 看到結果頁
  "share",     // 按「發到 IG 限時動態」
  "signup",    // email 送出成功
]);

const SEEN_KEY = "spotime.funnel";

function loadSeen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();   // 無痕模式讀不到：只在這次載入內去重
  }
}

let seen = loadSeen();
let pending = [];

/** 記一步。同一個分頁同一步只記一次。 */
export function track(step) {
  if (!FUNNEL_STEPS.includes(step) || seen.has(step)) return;
  seen = new Set([...seen, step]);
  pending = [...pending, step];
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch { /* 存不進去就算了，頂多重整時多算一次 */ }
}

/** 拿走還沒送的步驟，給作答／email 那筆一起帶上 */
export function drain() {
  const out = pending;
  pending = [];
  return out;
}

/** 現在就把累積的步驟送出去。離開頁面時也能送到（sendBeacon） */
export function flush() {
  if (!API_ENDPOINT || !pending.length) return;
  const body = JSON.stringify({ type: "event", steps: drain() });
  try {
    if (navigator.sendBeacon?.(API_ENDPOINT, new Blob([body], { type: "text/plain;charset=utf-8" }))) return;
  } catch { /* 有些內建瀏覽器不給用，改走 fetch */ }
  fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** 離開頁面時送出。iOS 關掉分頁不一定有 pagehide，切到背景的 visibilitychange 比較可靠，兩個都掛 */
export function startFunnel() {
  track("open");
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush);
}

/** 測試用：清掉這次載入的狀態 */
export function resetFunnel() {
  seen = new Set();
  pending = [];
}
