/** 流量漏斗的計數邏輯（10-06）。網頁送來的只有步驟名稱（web/scripts/funnel.js），
   這裡照「台北日期 × 步驟」加總，每小時整包寫進試算表的「流量漏斗」分頁（index.js 的 scheduled）。 */

/** 要跟 web/scripts/funnel.js、backend/Code.gs 的 FUNNEL_STEPS 一樣（tests/funnel.test.mjs 會檢查） */
export const FUNNEL_STEPS = Object.freeze([
  "open", "ready", "start", "selfie", "q1", "q2", "q3", "q4", "q5", "result", "share", "signup",
]);

/** 計數存在哪一個 Durable Object。要整個歸零就換一個名字，舊的那個不會再被讀到。
   10-07 Jimmy：正式曝光前把測試期間的數字清掉，從 "all" 換成這個。 */
export const FUNNEL_BUCKET = "since-2026-10-07";

/** 每小時同步時補送最近幾天。Code.gs 還沒更新、或 Google 掛掉的那幾個小時，之後會自己補上 */
export const SYNC_DAYS = 14;
const DAY_MS = 86400000;
const TAIPEI_OFFSET_MS = 8 * 3600000;

/** 只留認得的步驟、每步一次。不是陣列就當作沒有。 */
export function cleanSteps(raw) {
  if (!Array.isArray(raw)) return [];
  return FUNNEL_STEPS.filter((step) => raw.includes(step));
}

/** 台北的日期，例如 "2026/10/06"（試算表裡就寫這個字串） */
export function taipeiDay(now = Date.now()) {
  return new Date(now + TAIPEI_OFFSET_MS).toISOString().slice(0, 10).replaceAll("-", "/");
}

/** 最近 n 天的台北日期，舊的在前 */
export function recentDays(n = SYNC_DAYS, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => taipeiDay(now - (n - 1 - i) * DAY_MS));
}

/** 回傳新的物件，不改傳進來的 */
export function addSteps(tally, day, steps) {
  const counts = { ...(tally[day] ?? {}) };
  for (const step of steps) counts[step] = (counts[step] ?? 0) + 1;
  return { ...tally, [day]: counts };
}

export function mergeCounts(a = {}, b = {}) {
  const out = { ...a };
  for (const [step, n] of Object.entries(b)) out[step] = (out[step] ?? 0) + n;
  return out;
}

/** 把每天的數字送去 Apps Script。成功回 true。 */
export async function syncFunnel(env, days, fetcher = fetch) {
  const filled = Object.fromEntries(Object.entries(days).filter(([, counts]) => Object.keys(counts).length));
  if (!env.APPS_SCRIPT_URL || !Object.keys(filled).length) return true;
  try {
    const res = await fetcher(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "funnel", token: env.PROXY_TOKEN ?? "", site: env.SITE ?? "正式站", days: filled }),
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
    });
    // Apps Script 寫完才回 302（同 api.js 的說明）
    if (res.status === 302 || res.status === 303) return true;
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error ?? `upstream ${res.status}`);
    return true;
  } catch (error) {
    console.error("流量漏斗寫進試算表失敗，下一個小時再補", error);
    return false;
  }
}
