import { test } from "node:test";
import assert from "node:assert/strict";
import { appOf, deviceOf, sourceOf } from "../web/scripts/context.js";
import { answerPayload } from "../web/scripts/stats.js";

const IPHONE_IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";
const THREADS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Barcelona 350.0 Instagram";
const ANDROID_LINE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 Line/14.1.0";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";

test("裝置", () => {
  assert.equal(deviceOf(IPHONE_IG), "手機");
  assert.equal(deviceOf(ANDROID_LINE), "手機");
  assert.equal(deviceOf(MAC), "電腦");
  assert.equal(deviceOf(MAC, 5), "平板");                 // iPadOS 偽裝成 Mac
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/128.0 Safari/537.36"), "平板");
});

test("App：Threads 要先於 Instagram 判斷", () => {
  assert.equal(appOf(IPHONE_IG), "Instagram");
  assert.equal(appOf(THREADS), "Threads");
  assert.equal(appOf(ANDROID_LINE), "LINE");
  assert.equal(appOf(MAC), "瀏覽器");
});

test("流量來源：utm 優先，其次外站 referrer，自己站內不算", () => {
  assert.equal(sourceOf("?utm_source=IG_Story", "https://l.instagram.com/", "quiz.spotime.tw"), "ig_story");
  assert.equal(sourceOf("", "https://www.google.com/search", "quiz.spotime.tw"), "google.com");
  assert.equal(sourceOf("", "https://quiz.spotime.tw/?a", "quiz.spotime.tw"), "直接");
  assert.equal(sourceOf("", "", "quiz.spotime.tw"), "直接");
  assert.equal(sourceOf(`?utm_source=${"x".repeat(99)}`, "", "h").length, 40);
});

test("作答欄位：三題各一欄、熟悉度，加上裝置來源；心情不在裡面（email 也用這組欄位）", () => {
  const body = answerPayload("star-baseball-cheek",
    { mood: "blue", shape: "star", scene: "baseball", position: "cheek", familiarity: "daily" },
    { device: "手機", app: "Instagram", source: "ig_story" });
  assert.deepEqual(body, {
    type: "answer", combo: "star-baseball-cheek", shape: "star", scene: "baseball",
    position: "cheek", familiarity: "daily", device: "手機", app: "Instagram", source: "ig_story",
  });
  assert.equal("mood" in body, false);
});
