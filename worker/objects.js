/** 三個 Durable Object（第三個 Funnel 在最下面，10-06 加）。Cloudflare 保證同一個名字全世界只有一個在跑，
   所以「同一個 IP 的計數」和「統計表」不會因為請求分到不同機器而各算各的。

   10-05 實測過：Cloudflare 內建的 ratelimits 與每台機器自己數，
   同一個 IP 連打都會分到很多台機器，設每分鐘 5 次、12 次全放行。 */
import { DurableObject } from "cloudflare:workers";
import { createCounter, createStatsCache } from "./counter.js";
import { fetchStats, STATS_TTL_MS } from "./api.js";
import { addSteps, mergeCounts } from "./funnel.js";

/** 一個 IP 一個 Gate（名字＝IP）。記在記憶體就好，被回收時歸零沒關係。 */
export class Gate extends DurableObject {
  counter = createCounter();

  hit(kind, max) {
    return this.counter.hit(kind, max);
  }
}

/** 全站只有一個（名字＝"all"），同時最多派一個請求去問 Google。 */
export class Stats extends DurableObject {
  cache = createStatsCache(() => fetchStats(this.env, fetch), STATS_TTL_MS);

  table() {
    return this.cache.get();
  }
}

/** 流量漏斗的計數（全站一個，名字＝funnel.js 的 FUNNEL_BUCKET）。
   每筆都寫進儲存的話，免費方案一天 10 萬列寫入很快就用完，所以先加在記憶體，
   10 秒後一次存（一天一列）。Durable Object 閒置一分鐘以上才會被收掉，10 秒內存得到。 */
const FUNNEL_FLUSH_MS = 10000;

export class Funnel extends DurableObject {
  pending = {};
  alarmSet = false;

  async add(day, steps) {
    this.pending = addSteps(this.pending, day, steps);
    if (this.alarmSet) return;
    this.alarmSet = true;
    await this.ctx.storage.setAlarm(Date.now() + FUNNEL_FLUSH_MS);
  }

  async alarm() {
    this.alarmSet = false;
    await this.persist();
  }

  async persist() {
    const batch = this.pending;
    this.pending = {};
    for (const [day, counts] of Object.entries(batch)) {
      const stored = (await this.ctx.storage.get(day)) ?? {};
      await this.ctx.storage.put(day, mergeCounts(stored, counts));
    }
  }

  /** 這幾天的數字（還在記憶體裡的先存進去再讀） */
  async table(days) {
    await this.persist();
    const rows = await Promise.all(days.map(async (day) => [day, (await this.ctx.storage.get(day)) ?? {}]));
    return Object.fromEntries(rows);
  }
}
