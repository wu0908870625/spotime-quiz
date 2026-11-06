/** Worker 入口。只有 /api 會進到這裡（wrangler.jsonc 的 run_worker_first），
   其他網址照舊由 Cloudflare 直接送 web/ 裡的靜態檔。 */
import { handleApi } from "./api.js";
import { FUNNEL_BUCKET, recentDays, syncFunnel } from "./funnel.js";

export { Funnel, Gate, Stats } from "./objects.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api") return handleApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  },

  /** 每小時一次（wrangler.jsonc 的 triggers）：把最近幾天的流量漏斗寫進試算表 */
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const days = await env.FUNNEL.get(env.FUNNEL.idFromName(FUNNEL_BUCKET)).table(recentDays());
      await syncFunnel(env, days);
    })());
  },
};
