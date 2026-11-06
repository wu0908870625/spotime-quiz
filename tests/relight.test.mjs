import { test } from "node:test";
import assert from "node:assert/strict";
import { relightPixels, rimMask } from "../web/scripts/selfie/relight.js";

const LIGHT = Object.freeze({
  ambient: [88, 58, 132], ambient_mix: 0.22,
  rim: [206, 132, 255], rim_mix: 0.85, rim_width: 0.1, exposure: 0.93,
});

/** w×h 的人物層：中間一塊方形是人（alpha 255），四周透明 */
function block(w, h, rgb, pad) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      const inside = x >= pad && x < w - pad && y >= pad && y < h - pad;
      px.set([...rgb, inside ? 255 : 0], p);
    }
  }
  return px;
}

test("不改輸入、alpha 不變", () => {
  const src = block(20, 20, [120, 100, 90], 4);
  const copy = new Uint8ClampedArray(src);
  const out = relightPixels(src, 20, 20, LIGHT);
  assert.deepEqual(src, copy);
  for (let i = 3; i < out.length; i += 4) assert.equal(out[i], src[i]);
});

test("中間的暗部往環境色偏、整體照曝光變暗", () => {
  const w = 40;
  const out = relightPixels(block(w, w, [40, 40, 40], 2), w, w, { ...LIGHT, rim_mix: 0 });
  const p = (20 * w + 20) * 4;
  assert.ok(out[p + 2] > out[p + 1], "藍紫色環境光：B 要比 G 高");
  const black = relightPixels(block(w, w, [0, 0, 0], 2), w, w, { ...LIGHT, rim_mix: 0 });
  assert.deepEqual([...black.slice(p, p + 3)], [0, 0, 0], "黑色不能被環境色拉灰");
  const flat = relightPixels(block(w, w, [200, 200, 200], 2), w, w, { ...LIGHT, ambient_mix: 0, rim_mix: 0 });
  assert.equal(flat[p], Math.round(200 * (1 - 0.07 * 2)), "自拍的曝光偏離量放大兩倍");
});

test("輪廓光打在邊緣、不打在正中間", () => {
  const w = 60;
  const src = block(w, w, [100, 100, 100], 5);
  const out = relightPixels(src, w, w, { ...LIGHT, ambient_mix: 0, exposure: 1 });
  const at = (x, y) => out[(y * w + x) * 4];
  assert.ok(at(6, 30) > at(30, 30) + 10, "左邊緣要比中間亮");
  assert.equal(at(30, 30), 100);
});

test("透明的地方（白光外圈以外）不動", () => {
  const src = block(20, 20, [255, 255, 255], 4);
  const out = relightPixels(src, 20, 20, LIGHT);
  assert.deepEqual(out.slice(0, 4), src.slice(0, 4));
});

test("半透明的白光不算人：沒有環境色也沒有輪廓光，只吃曝光", () => {
  const w = 30;
  const src = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < w * w; i += 1) src.set([255, 255, 255, 128], i * 4);
  const out = relightPixels(src, w, w, LIGHT);
  const p = (15 * w + 15) * 4;
  assert.equal(out[p], Math.round(255 * (1 - 0.07 * 2)));
  assert.equal(out[p], out[p + 2]);
});

test("rimMask：全是人的大塊中間是 0", () => {
  const w = 30;
  const solid = new Float32Array(w * w).fill(1);
  const m = rimMask(solid, w, w, 3);
  assert.equal(m[15 * w + 15], 0);
});
