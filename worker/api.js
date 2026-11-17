/** /api：網站跟 Apps Script 中間的一層。
 *
 * 10-05 Codex 審查指出 Apps Script 網址是公開的，任何人寫個迴圈就能狂送作答，
 * 灌爆試算表、吃光 Google 的免費額度。所以網頁不再直接打 Google，改打同網域的 /api：
 *
 *   1. 同一個 IP 每分鐘有上限（PER_MINUTE），超過回 429。計數放在 Durable Object
 *      （objects.js 的 Gate），同一個 IP 不管分到哪台機器都算在一起。
 *   2. 格式不對、內容太大，在這裡就擋掉，不浪費 Google 的額度。
 *   3. 轉給 Apps Script 時補上通行碼 PROXY_TOKEN；Code.gs 設了通行碼之後，
 *      繞過這層直接打舊網址的請求一律不收。
 *   4. Google 回 5xx 或連線斷掉，這裡自動再送一次（等太久的作答例外，見 sendWithRetry）。
 *   5. 統計表全站共用一份、存 30 秒（objects.js 的 Stats）。實測 20 個人同時去問
 *      Google，有一成超過 15 秒才回；共用之後同時只有一個請求在問。
 *   6. 流量漏斗（10-06）：{ type:"event", steps } 只在這裡加總（objects.js 的 Funnel），
 *      不轉給 Google。作答／email 那兩筆也可能帶 steps，一樣在這裡拿掉、加總。
 *
 * Apps Script 網址與通行碼都是 wrangler secret，不寫進任何檔案。
 */
import { createCounter, createStatsCache } from "./counter.js";
import { addSteps, cleanSteps, FUNNEL_BUCKET, taipeiDay } from "./funnel.js";

const MAX_BODY = 4096;
const TIMEOUT_MS = 25000;
const DEFAULT_RETRY_DELAY_MS = 800;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const STATS_TTL_MS = 30000;

/** 每個 IP 每 60 秒的上限。學校、電信業者常常很多人共用一個 IP，所以給寬一點：
   正常人一輪測驗只送 1 筆作答、1 筆 email、讀 1 次統計表。 */
const PER_MINUTE = { answer: 20, signup: 5, read: 60, event: 30 };
const WRITE_TYPES = ["answer", "signup"];

/** 沒綁 Durable Object 時（本機測試）用的替身 */
let localCounter = createCounter();
let localStats = null;
let localFunnel = {};
/** 漏斗的限流只在這台機器上數：要擋的只是亂灌，不值得為每筆再問一次 Durable Object
   （免費方案 Durable Object 一天也是 10 萬次） */
let eventCounter = createCounter();
let readCounter = createCounter();

/** 測試用：清掉替身的狀態 */
export function resetMemory() {
  localCounter = createCounter();
  localStats = null;
  localFunnel = {};
  eventCounter = createCounter();
  readCounter = createCounter();
}

/** 測試用：本機替身記到的漏斗數字 */
export function localFunnelTable() {
  return localFunnel;
}

export async function handleApi(request, env, ctx, fetcher = fetch) {
  if (!env.APPS_SCRIPT_URL) return reply(503, { error: "backend not configured" });
  if (request.method === "GET") return readStats(request, env, fetcher);
  if (request.method === "POST") return write(request, env, ctx, fetcher);
  return reply(405, { error: "method not allowed" });
}

async function readStats(request, env, fetcher) {
  const url = new URL(request.url);
  if (url.searchParams.get("all") !== "1") return reply(400, { error: "only ?all=1" });
  // 讀統計表的限流只在這台機器上數（10-06）：讀到的是 Stats 存著的那份，打不到 Google，
  // 要擋的只是亂灌。每筆都問 Gate 的話，每個訪客多用一次 Durable Object 額度（免費一天 10 萬次）
  if (!readCounter.hit(ip(request), PER_MINUTE.read)) return tooMany();

  const data = await statsTable(env, fetcher);
  if (!data) return reply(502, { error: "upstream failed" });
  return reply(200, data, { "Cache-Control": "public, max-age=30" });
}

function statsTable(env, fetcher) {
  if (env.STATS) return env.STATS.get(env.STATS.idFromName("all")).table();
  localStats ??= createStatsCache(() => fetchStats(env, fetcher), STATS_TTL_MS);
  return localStats.get();
}

/** 問 Google 要整張統計表；問不到回 null */
export async function fetchStats(env, fetcher) {
  const target = new URL(env.APPS_SCRIPT_URL);
  target.searchParams.set("all", "1");
  if (env.PROXY_TOKEN) target.searchParams.set("token", env.PROXY_TOKEN);
  try {
    const res = await fetcher(target, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (error) {
    console.error("讀統計表失敗", error);
    return null;
  }
}

async function write(request, env, ctx, fetcher) {
  const text = await request.text();
  if (text.length > MAX_BODY) return reply(413, { error: "too large" });

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: "bad json" });
  }
  if (body?.type === "event") return countEvent(request, env, ctx, body.steps);
  if (!body || !WRITE_TYPES.includes(body.type)) return reply(400, { error: "unknown type" });
  if (body.type === "signup" && !EMAIL_RE.test(String(body.email ?? "").trim())) {
    return reply(400, { error: "bad email" });
  }
  if (!(await allowed(env, body.type, request))) return tooMany();

  const { steps, ...fields } = body;
  countSteps(env, ctx, steps);
  // 前端自己帶的 token 一律蓋掉，通行碼只能從這裡來
  const forward = JSON.stringify({ ...fields, token: env.PROXY_TOKEN ?? "" });
  const sending = sendWithRetry(env, forward, body.type, fetcher);
  // 使用者關掉分頁時請求也要送完
  ctx.waitUntil?.(sending.catch(() => {}));
  const result = await sending;
  if (result.ok) return reply(200, { ok: true });
  return reply(result.status, { error: result.error });
}

/**
 * 5xx 或連線失敗就再送一次；後端明說資料不對（JSON 有 error）就不重送。
 * 等太久（timeout）比較麻煩：Google 可能其實已經寫進去、只是還沒回。
 * email 重送沒關係（後端會去重複），作答重送可能多記一筆，所以作答不重送。
 */
async function sendWithRetry(env, body, type, fetcher) {
  const delay = Number(env.RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS);
  let last = { ok: false, status: 502, error: "upstream failed" };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(delay);
    try {
      const res = await fetcher(env.APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        // Apps Script 先把資料寫進試算表才回 302，拿到 302 就算成功（09-29 實測）
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 302 || res.status === 303) return { ok: true };
      if (res.status >= 500) {
        last = { ok: false, status: 502, error: `upstream ${res.status}` };
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (data.error) return { ok: false, status: 400, error: data.error };
      return { ok: true };
    } catch (error) {
      console.error("轉給 Apps Script 失敗", error);
      last = { ok: false, status: 502, error: "upstream failed" };
      if (error?.name === "TimeoutError" && type === "answer") return last;
    }
  }
  return last;
}

function ip(request) {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

function countEvent(request, env, ctx, steps) {
  if (!eventCounter.hit(ip(request), PER_MINUTE.event)) return tooMany();
  if (!cleanSteps(steps).length) return reply(400, { error: "no steps" });
  countSteps(env, ctx, steps);
  return new Response(null, { status: 204 });
}

/** 加進今天（台北時間）的漏斗。不等它做完：記不到只是少一格數字，不能拖慢作答 */
function countSteps(env, ctx, raw) {
  const steps = cleanSteps(raw);
  if (!steps.length) return;
  const day = taipeiDay();
  if (!env.FUNNEL) {
    localFunnel = addSteps(localFunnel, day, steps);
    return;
  }
  const job = env.FUNNEL.get(env.FUNNEL.idFromName(FUNNEL_BUCKET)).add(day, steps)
    .catch((error) => console.error("流量漏斗記不到", error));
  ctx.waitUntil?.(job);
}

async function allowed(env, kind, request) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!env.GATE) return localCounter.hit(`${kind}:${ip}`, PER_MINUTE[kind]);
  try {
    return await env.GATE.get(env.GATE.idFromName(ip)).hit(kind, PER_MINUTE[kind]);
  } catch (error) {
    // 計數員掛掉時寧可放行，不要讓正常使用者送不出去
    console.error("限流計數失敗，先放行", error);
    return true;
  }
}

function tooMany() {
  return reply(429, { error: "too many requests" }, { "Retry-After": "60" });
}

function reply(status, data, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
