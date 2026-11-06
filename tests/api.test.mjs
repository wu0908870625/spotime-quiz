import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi, resetMemory } from "../worker/api.js";

beforeEach(() => resetMemory());

const SCRIPT = "https://script.google.test/exec";

/** 假的 Apps Script：記下收到什麼，照 reply 回應 */
function fakeScript(reply = () => new Response(null, { status: 302 })) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return reply(calls.length);
  };
  return { calls, fetcher };
}

function env(extra = {}) {
  return { APPS_SCRIPT_URL: SCRIPT, PROXY_TOKEN: "t0ken", ...extra };
}

const ctx = { waitUntil: () => {} };

function post(body, ip = "1.1.1.1") {
  return new Request("https://quiz.test/api", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "CF-Connecting-IP": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ANSWER = { type: "answer", shape: "star", scene: "concert", position: "cheek" };

test("作答轉給 Apps Script，並補上通行碼", async () => {
  const s = fakeScript();
  const res = await handleApi(post(ANSWER), env(), ctx, s.fetcher);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, SCRIPT);
  const sent = JSON.parse(s.calls[0].init.body);
  assert.equal(sent.token, "t0ken");
  assert.equal(sent.shape, "star");
});

test("前端自己帶的 token 會被蓋掉", async () => {
  const s = fakeScript();
  await handleApi(post({ ...ANSWER, token: "guess" }), env(), ctx, s.fetcher);
  assert.equal(JSON.parse(s.calls[0].init.body).token, "t0ken");
});

test("email 格式不對直接擋，不打後端", async () => {
  const s = fakeScript();
  const res = await handleApi(post({ ...ANSWER, type: "signup", email: "abc" }), env(), ctx, s.fetcher);
  assert.equal(res.status, 400);
  assert.equal(s.calls.length, 0);
});

test("不是 JSON、不認得的 type、太大的內容都擋掉", async () => {
  const s = fakeScript();
  assert.equal((await handleApi(post("{oops"), env(), ctx, s.fetcher)).status, 400);
  assert.equal((await handleApi(post({ type: "drop" }), env(), ctx, s.fetcher)).status, 400);
  const big = { ...ANSWER, pad: "x".repeat(5000) };
  assert.equal((await handleApi(post(big), env(), ctx, s.fetcher)).status, 413);
  assert.equal(s.calls.length, 0);
});

test("後端第一次失敗會自動再送一次", async () => {
  const s = fakeScript((n) => (n === 1 ? new Response("boom", { status: 500 }) : new Response(null, { status: 302 })));
  const res = await handleApi(post(ANSWER), env({ RETRY_DELAY_MS: 0 }), ctx, s.fetcher);
  assert.equal(res.status, 200);
  assert.equal(s.calls.length, 2);
});

test("連線直接斷掉也會再送一次", async () => {
  let n = 0;
  const fetcher = async () => {
    n += 1;
    if (n === 1) throw new TypeError("network");
    return new Response(null, { status: 302 });
  };
  const res = await handleApi(post(ANSWER), env({ RETRY_DELAY_MS: 0 }), ctx, fetcher);
  assert.equal(res.status, 200);
  assert.equal(n, 2);
});

test("兩次都失敗回 502", async () => {
  const s = fakeScript(() => new Response("boom", { status: 500 }));
  const res = await handleApi(post(ANSWER), env({ RETRY_DELAY_MS: 0 }), ctx, s.fetcher);
  assert.equal(res.status, 502);
  assert.equal(s.calls.length, 2);
});

test("後端回 JSON 錯誤（例如 bad answer）不重送，回 400", async () => {
  const s = fakeScript(() => Response.json({ ok: false, error: "bad answer" }));
  const res = await handleApi(post(ANSWER), env({ RETRY_DELAY_MS: 0 }), ctx, s.fetcher);
  assert.equal(res.status, 400);
  assert.equal(s.calls.length, 1);
});

test("讀統計表：只放行 ?all=1，帶通行碼去問", async () => {
  const s = fakeScript(() => Response.json({ total: 3, counts: { a: 3 } }));
  const ok = await handleApi(new Request("https://quiz.test/api?all=1"), env(), ctx, s.fetcher);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { total: 3, counts: { a: 3 } });
  const asked = new URL(s.calls[0].url);
  assert.equal(asked.searchParams.get("all"), "1");
  assert.equal(asked.searchParams.get("token"), "t0ken");

  const bad = await handleApi(new Request("https://quiz.test/api?combo=x"), env(), ctx, s.fetcher);
  assert.equal(bad.status, 400);
});

test("還沒設定後端網址回 503", async () => {
  const s = fakeScript();
  const res = await handleApi(post(ANSWER), env({ APPS_SCRIPT_URL: "" }), ctx, s.fetcher);
  assert.equal(res.status, 503);
});

test("其他方法回 405", async () => {
  const s = fakeScript();
  const res = await handleApi(new Request("https://quiz.test/api", { method: "PUT", body: "x" }), env(), ctx, s.fetcher);
  assert.equal(res.status, 405);
});

test("統計表 30 秒內只問 Google 一次，同時來的請求共用", async () => {
  const s = fakeScript(() => Response.json({ total: 1, counts: {} }));
  const req = () => new Request("https://quiz.test/api?all=1");
  const res = await Promise.all([1, 2, 3].map(() => handleApi(req(), env(), ctx, s.fetcher)));
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200]);
  await handleApi(req(), env(), ctx, s.fetcher);
  assert.equal(s.calls.length, 1);
});

test("Google 掛掉時先給手上舊的統計表", async (t) => {
  let up = true;
  const fetcher = async () => (up ? Response.json({ total: 5, counts: {} }) : new Response("x", { status: 500 }));
  const req = () => new Request("https://quiz.test/api?all=1");
  await handleApi(req(), env(), ctx, fetcher);
  up = false;
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 31000 });
  const res = await handleApi(req(), env(), ctx, fetcher);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).total, 5);
});

test("同一個 IP 每分鐘 20 筆作答，第 21 筆回 429、後端收不到", async () => {
  const s = fakeScript();
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await handleApi(post(ANSWER), env(), ctx, s.fetcher)).status);
  assert.equal(codes.filter((c) => c === 200).length, 20);
  assert.equal(codes.at(-1), 429);
  assert.equal(s.calls.length, 20);
});

test("email 每分鐘 5 筆；換一個 IP 另外算", async () => {
  const s = fakeScript();
  const body = { ...ANSWER, type: "signup", email: "a@b.co" };
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await handleApi(post(body), env(), ctx, s.fetcher)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal((await handleApi(post(body, "2.2.2.2"), env(), ctx, s.fetcher)).status, 200);
});

test("線上用 Durable Object 計數：以 IP 當名字去問", async () => {
  const s = fakeScript();
  const asked = [];
  const GATE = {
    idFromName: (name) => name,
    get: (id) => ({ hit: async (kind, max) => { asked.push([id, kind, max]); return false; } }),
  };
  const res = await handleApi(post(ANSWER, "8.8.8.8"), env({ GATE }), ctx, s.fetcher);
  assert.equal(res.status, 429);
  assert.deepEqual(asked, [["8.8.8.8", "answer", 20]]);
  assert.equal(s.calls.length, 0);
});

test("計數員掛掉時放行", async () => {
  const s = fakeScript();
  const GATE = { idFromName: (n) => n, get: () => ({ hit: async () => { throw new Error("down"); } }) };
  assert.equal((await handleApi(post(ANSWER), env({ GATE }), ctx, s.fetcher)).status, 200);
});

test("作答等太久不重送（Google 可能已經寫進去），email 會重送", async () => {
  let n = 0;
  const fetcher = async () => {
    n += 1;
    throw Object.assign(new Error("slow"), { name: "TimeoutError" });
  };
  await handleApi(post(ANSWER), env({ RETRY_DELAY_MS: 0 }), ctx, fetcher);
  assert.equal(n, 1);
  n = 0;
  await handleApi(post({ ...ANSWER, type: "signup", email: "a@b.co" }), env({ RETRY_DELAY_MS: 0 }), ctx, fetcher);
  assert.equal(n, 2);
});

test("統計表走 Stats 這個 Durable Object", async () => {
  const s = fakeScript();
  const STATS = { idFromName: (n) => n, get: (id) => ({ table: async () => ({ total: 9, counts: {}, id }) }) };
  const res = await handleApi(new Request("https://quiz.test/api?all=1"), env({ STATS }), ctx, s.fetcher);
  assert.deepEqual(await res.json(), { total: 9, counts: {}, id: "all" });
  assert.equal(s.calls.length, 0);
});

test("讀統計表不問 Gate（省 Durable Object 額度），同一台機器每分鐘 60 次", async () => {
  const s = fakeScript(() => Response.json({ total: 1, counts: {} }));
  let asked = 0;
  const GATE = { idFromName: (n) => n, get: () => ({ hit: async () => { asked += 1; return true; } }) };
  const req = () => new Request("https://quiz.test/api?all=1", { headers: { "CF-Connecting-IP": "5.5.5.5" } });
  const codes = [];
  for (let i = 0; i < 61; i++) codes.push((await handleApi(req(), env({ GATE }), ctx, s.fetcher)).status);
  assert.equal(asked, 0);
  assert.equal(codes.at(-2), 200);
  assert.equal(codes.at(-1), 429);
});
