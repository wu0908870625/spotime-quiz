// 稀有度門檻：真實樣本 ≥ 300 才用真實比例，否則用依組合固定的估計值。
// 跑法：node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { comboKey, comboLabel, estimateRatio, TOTAL_COMBOS, verdict } from "../web/scripts/rarity.js";
import { RARITY_TAGLINES } from "../web/scripts/config.js";

const KEY = "star-baseball-cheek";
const NOW = Date.UTC(2026, 8, 29, 4);

test("299 筆：還是估計值，跟真實比例無關", () => {
  const v = verdict({ total: 299, same: 150 }, KEY, NOW);
  assert.equal(v.estimated, true);
  assert.equal(v.ratio, estimateRatio(KEY, NOW));
});

test("剛好 300 筆：換成真實比例", () => {
  // 比例把自己算進去：(5 + 1) / (299 + 1)
  const v = verdict({ total: 299 + 1, same: 5 }, KEY, NOW);
  assert.equal(v.estimated, false);
  assert.equal(v.ratio, 6 / 301);
  assert.equal(v.line, "只有 2.0% 的人跟你選擇一樣。");     // 1.99% 四捨五入
});

test("真實比例超過 3% 用一般句型、一律一位小數", () => {
  assert.equal(verdict({ total: 4199, same: 209 }, KEY, NOW).line, "5.0% 的人跟你有相同選擇。");
  assert.equal(verdict({ total: 4199, same: 1049 }, KEY, NOW).line, "25.0% 的人跟你有相同選擇。");
});

test("真實資料可以超過估計值上限 16%（估計值才有上限）", () => {
  assert.equal(verdict({ total: 999, same: 399 }, KEY, NOW).ratio, 0.4);
});

test("這個組合還沒人選過：顯示他自己那一份，不會出現 0.0%", () => {
  const v = verdict({ total: 499, same: 0 }, KEY, NOW);
  assert.equal(v.estimated, false);
  assert.equal(v.ratio, 1 / 500);
  assert.equal(v.line, "只有 0.2% 的人跟你選擇一樣。");
});

test("後端壞掉或回傳怪東西：退回估計值", () => {
  for (const bad of [null, {}, { total: "x", same: 1 }, { total: NaN, same: 1 }]) {
    assert.equal(verdict(bad, KEY, NOW).estimated, true);
  }
});

test("心情、熟悉度不進組合：組合鍵與代號只看造型／場景／位置", () => {
  const a = { mood: "blue", shape: "star", scene: "concert", position: "cheek", familiarity: "daily" };
  assert.equal(comboKey(a), "star-concert-cheek");
  assert.equal(comboLabel(a), "STAR · CONCERT · CHEEK");
  assert.equal(TOTAL_COMBOS, 64);
});

test("心情只換英文短句，比例一模一樣", () => {
  const stats = { total: 4199, same: 84 };
  const sad = verdict(stats, KEY, NOW, "blue");
  const happy = verdict(stats, KEY, NOW, "happy");
  assert.equal(sad.ratio, happy.ratio);
  assert.equal(sad.line, happy.line);
  assert.ok(RARITY_TAGLINES.blue.includes(sad.tag));
  assert.ok(RARITY_TAGLINES.happy.includes(happy.tag));
});
