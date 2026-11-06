import { test } from "node:test";
import assert from "node:assert/strict";
import { secondsSince } from "../web/scripts/quiz.js";

test("作答秒數：四捨五入到秒", () => {
  assert.equal(secondsSince(1000, 43600), 43);
  assert.equal(secondsSince(1000, 1400), 0);
});

test("還沒開始或時間倒退就不給數字", () => {
  assert.equal(secondsSince(0, 5000), null);
  assert.equal(secondsSince(9000, 5000), null);
});
