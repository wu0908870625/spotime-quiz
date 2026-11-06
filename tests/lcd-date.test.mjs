import test from "node:test";
import assert from "node:assert/strict";
import { lcdDate } from "../web/scripts/lcd-date.js";

test("印訪客當天的日期，年月日都補零", () => {
  assert.equal(lcdDate(new Date(2026, 8, 29)), "'26 09 29");
  assert.equal(lcdDate(new Date(2027, 0, 5)), "'27 01 05");
});
