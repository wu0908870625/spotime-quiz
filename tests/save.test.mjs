import { test } from "node:test";
import assert from "node:assert/strict";
import { isAndroidInApp, overlayText } from "../web/scripts/save.js";

// 真實的 UA 樣本（10-07 安卓 IG 存不了圖之後補的）
const UA = {
  igAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 350.0.0.42.89 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; zh_TW_#Hant; 640405412)",
  lineAndroid: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Line/14.16.1",
  threadsAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Barcelona 350.0.0.0",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  samsungAndroid: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  igIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; zh_TW; zh-Hant-TW)",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

test("安卓 App 內建瀏覽器都認得出來", () => {
  for (const k of ["igAndroid", "lineAndroid", "threadsAndroid"]) assert.equal(isAndroidInApp(UA[k]), true, k);
});

test("安卓 Chrome／三星瀏覽器、iPhone 不算安卓 App 內建瀏覽器", () => {
  for (const k of ["chromeAndroid", "samsungAndroid", "igIphone", "safari"]) assert.equal(isAndroidInApp(UA[k]), false, k);
});

test("存圖說明照手機分三種", () => {
  assert.match(overlayText(UA.igAndroid).hint, /截圖/);
  assert.match(overlayText(UA.igAndroid).ig, /截好了/);
  assert.match(overlayText(UA.chromeAndroid).hint, /下載圖片/);
  assert.match(overlayText(UA.igIphone).hint, /儲存到照片/);
  assert.match(overlayText(UA.safari).hint, /儲存到照片/);
  for (const ua of Object.values(UA)) assert.match(overlayText(ua).hint, /@spotimelab/);
});
