/** 限流計數與統計表快取的邏輯本體。
   線上跑在 Durable Object 裡（objects.js），本機測試直接用。 */

const WINDOW_MS = 60000;
const MAX_KEYS = 5000;

/** 每把 key 最近 60 秒內最多 max 次 */
export function createCounter() {
  const hits = new Map();
  return {
    hit(key, max, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
      const ok = recent.length < max;
      hits.set(key, ok ? [...recent, now] : recent);
      if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value);   // 不要無限長大
      return ok;
    },
  };
}

/** 存 ttlMs 的快取：同時來的請求共用同一次 load；load 失敗時先給舊的，沒有舊的回 null */
export function createStatsCache(load, ttlMs) {
  let data = null;
  let at = 0;
  let pending = null;
  return {
    async get(now = Date.now()) {
      if (data && now - at < ttlMs) return data;
      pending ??= load().finally(() => { pending = null; });
      const fresh = await pending;
      if (fresh) {
        data = fresh;
        at = Date.now();
      }
      return data;
    },
  };
}
