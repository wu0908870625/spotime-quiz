import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FUNNEL_STEPS as WORKER_STEPS, addSteps, cleanSteps, FUNNEL_BUCKET, recentDays, syncFunnel, taipeiDay } from "../worker/funnel.js";
import { handleApi, localFunnelTable, resetMemory } from "../worker/api.js";

beforeEach(() => resetMemory());

test("三個地方的步驟清單一樣（網頁、Worker、Code.gs）", async () => {
  const web = readFileSync(new URL("../web/scripts/funnel.js", import.meta.url), "utf8");
  const webSteps = [...web.slice(web.indexOf("FUNNEL_STEPS"), web.indexOf("]);")).matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(webSteps, [...WORKER_STEPS]);
  const gs = readFileSync(new URL("../backend/Code.gs", import.meta.url), "utf8");
  const block = gs.slice(gs.indexOf("const FUNNEL_STEPS"), gs.indexOf("];", gs.indexOf("const FUNNEL_STEPS")));
  const gsSteps = [...block.matchAll(/\['([a-z0-9]+)',/g)].map((m) => m[1]);
  assert.deepEqual(gsSteps, [...WORKER_STEPS]);
});

test("台北日期：UTC 16:00 已經是隔天", () => {
  assert.equal(taipeiDay(Date.UTC(2026, 9, 5, 15, 59)), "2026/10/05");
  assert.equal(taipeiDay(Date.UTC(2026, 9, 5, 16, 0)), "2026/10/06");
  const days = recentDays(3, Date.UTC(2026, 9, 5, 16, 0));
  assert.deepEqual(days, ["2026/10/04", "2026/10/05", "2026/10/06"]);
});

test("只收認得的步驟、每步一次", () => {
  assert.deepEqual(cleanSteps(["q1", "q1", "hack", "open"]), ["open", "q1"]);
  assert.deepEqual(cleanSteps("open"), []);
});

test("加總不改到原本的物件", () => {
  const before = Object.freeze({ "2026/10/06": Object.freeze({ open: 1 }) });
  const after = addSteps(before, "2026/10/06", ["open", "q1"]);
  assert.deepEqual(after, { "2026/10/06": { open: 2, q1: 1 } });
  assert.deepEqual(before, { "2026/10/06": { open: 1 } });
});

const ctx = { waitUntil: () => {} };
function post(body, ip = "1.1.1.1") {
  return new Request("https://quiz.test/api", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}
const env = { APPS_SCRIPT_URL: "https://script.google.test/exec", PROXY_TOKEN: "t" };

test("event 只在 /api 加總，不打 Google", async () => {
  const calls = [];
  const res = await handleApi(post({ type: "event", steps: ["open", "ready"] }), env, ctx, async (u) => { calls.push(u); });
  assert.equal(res.status, 204);
  assert.equal(calls.length, 0);
  assert.deepEqual(Object.values(localFunnelTable())[0], { open: 1, ready: 1 });
});

test("event 沒有認得的步驟回 400", async () => {
  const res = await handleApi(post({ type: "event", steps: ["x"] }), env, ctx);
  assert.equal(res.status, 400);
});

test("作答帶的 steps 會被加總，而且不會轉給 Google", async () => {
  let sent = null;
  const fetcher = async (u, init) => { sent = JSON.parse(init.body); return new Response(null, { status: 302 }); };
  const answer = { type: "answer", shape: "star", scene: "concert", position: "cheek", steps: ["q5", "result"] };
  await handleApi(post(answer), env, ctx, fetcher);
  assert.equal("steps" in sent, false);
  assert.deepEqual(Object.values(localFunnelTable())[0], { q5: 1, result: 1 });
});

test("event 同一個 IP 每分鐘 30 筆", async () => {
  const codes = [];
  for (let i = 0; i < 31; i++) codes.push((await handleApi(post({ type: "event", steps: ["open"] }), env, ctx)).status);
  assert.equal(codes.filter((c) => c === 204).length, 30);
  assert.equal(codes.at(-1), 429);
});

test("線上走 Funnel 這個 Durable Object", async () => {
  const got = [];
  const FUNNEL = { idFromName: (n) => n, get: (id) => ({ add: async (day, steps) => { got.push([id, steps]); } }) };
  await handleApi(post({ type: "event", steps: ["open"] }), { ...env, FUNNEL }, ctx);
  assert.deepEqual(got, [[FUNNEL_BUCKET, ["open"]]]);
});

test("每小時同步：空的日子不送、帶站別與通行碼", async () => {
  let body = null;
  const fetcher = async (u, init) => { body = JSON.parse(init.body); return new Response(null, { status: 302 }); };
  const ok = await syncFunnel({ ...env, SITE: "測試站" }, { "2026/10/05": {}, "2026/10/06": { open: 3 } }, fetcher);
  assert.equal(ok, true);
  assert.deepEqual(body, { type: "funnel", token: "t", site: "測試站", days: { "2026/10/06": { open: 3 } } });
});

test("每小時同步：Google 回錯誤就算失敗（下個小時再補）", async () => {
  const ok = await syncFunnel(env, { "2026/10/06": { open: 1 } }, async () => Response.json({ error: "unknown type" }));
  assert.equal(ok, false);
});

test("沒有資料就不打 Google", async () => {
  let called = false;
  await syncFunnel(env, { "2026/10/06": {} }, async () => { called = true; });
  assert.equal(called, false);
});

test("網頁端：同一步只記一次，drain 之後就清空", async () => {
  const web = await import("../web/scripts/funnel.js");
  web.resetFunnel();
  web.track("open"); web.track("open"); web.track("q1"); web.track("nope");
  assert.deepEqual(web.drain(), ["open", "q1"]);
  assert.deepEqual(web.drain(), []);
  web.track("q1");
  assert.deepEqual(web.drain(), []);
});
