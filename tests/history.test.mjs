// 修圖的「回復上一步」（selfie/history.js）。跑法：node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistory, HISTORY_LIMIT, sameSpots } from "../web/scripts/selfie/history.js";

const spot = (id, x = 0.5, extra) => ({ id, x, y: 0.4, roll: 0, size: 0.06, ...(extra ? { extra, shape: "star" } : {}) });

test("後進先出，空了回 undefined", () => {
  const h = createHistory();
  h.push([spot(0, 0.1)]);
  h.push([spot(0, 0.2)]);
  assert.equal(h.size, 2);
  assert.equal(h.pop()[0].x, 0.2);
  assert.equal(h.pop()[0].x, 0.1);
  assert.equal(h.pop(), undefined);
  assert.equal(h.size, 0);
});

test("超過上限丟掉最舊的", () => {
  const h = createHistory(3);
  [1, 2, 3, 4].forEach((n) => h.push([spot(0, n / 10)]));
  assert.equal(h.size, 3);
  assert.deepEqual([h.pop(), h.pop(), h.pop()].map((s) => s[0].x), [0.4, 0.3, 0.2]);
});

test("預設記 20 步", () => {
  assert.equal(HISTORY_LIMIT, 20);
});

test("push 進去的狀態之後被改也不影響（存的是複本）", () => {
  const h = createHistory();
  const state = [spot(0, 0.1)];
  h.push(state);
  state[0].x = 0.9;
  assert.equal(h.pop()[0].x, 0.1);
});

test("sameSpots：差一點點算一樣，角度差 360 度也算一樣", () => {
  assert.ok(sameSpots([spot(0, 0.5)], [spot(0, 0.5002)]));
  assert.ok(sameSpots([{ ...spot(0), roll: 170 }], [{ ...spot(0), roll: -190 }]));
  assert.ok(!sameSpots([spot(0, 0.5)], [spot(0, 0.52)]));
  assert.ok(!sameSpots([{ ...spot(0), roll: 0 }], [{ ...spot(0), roll: 15 }]));
});

test("sameSpots：多一枚、少一枚、換了一枚都不一樣", () => {
  assert.ok(!sameSpots([spot(0)], [spot(0), spot(1, 0.5, true)]));
  assert.ok(!sameSpots([spot(0), spot(1, 0.5, true)], [spot(0)]));
  assert.ok(!sameSpots([spot(0), spot(1, 0.5, true)], [spot(0), spot(2, 0.5, true)]));
});
