import { test } from "node:test";
import assert from "node:assert/strict";
import { retryable } from "../web/scripts/signup.js";

test("斷線與 5xx 重送；格式錯、429 不重送", () => {
  assert.equal(retryable(new TypeError("Failed to fetch")), true);
  assert.equal(retryable(Object.assign(new Error("x"), { status: 502 })), true);
  assert.equal(retryable(Object.assign(new Error("x"), { status: 400 })), false);
  assert.equal(retryable(Object.assign(new Error("x"), { status: 429 })), false);
});
