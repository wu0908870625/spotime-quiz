import { test } from "node:test";
import assert from "node:assert/strict";
import { boxMean, decontaminate, guidedFilter, pruneSpikes, solidify } from "../web/scripts/selfie/matte.js";

const W = 40;
const H = 8;

test("boxMean：均勻的圖平均後不變，邊界也一樣", () => {
  const out = boxMean(new Float32Array(W * H).fill(0.3), W, H, 3);
  for (const v of out) assert.ok(Math.abs(v - 0.3) < 1e-6);
});

test("boxMean：跟暴力算的一樣", () => {
  const src = Float32Array.from({ length: W * H }, (_, i) => (i * 37) % 11);
  const r = 2;
  const out = boxMean(src, W, H, r);
  for (const [x, y] of [[0, 0], [5, 3], [39, 7], [20, 0]]) {
    let sum = 0;
    let n = 0;
    for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      sum += src[yy * W + xx];
      n += 1;
    }
    assert.ok(Math.abs(out[y * W + x] - sum / n) < 1e-4);
  }
});

test("guidedFilter：糊掉的遮罩會貼齊照片裡的邊", () => {
  // 照片：x < 30 是人（亮）、右邊是背景（暗）；遮罩糊成 12px 的斜坡，還往背景溢出 3px（模型常見的樣子）
  const w = 60;
  const guide = new Float32Array(w * H);
  const mask = new Float32Array(w * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < w; x += 1) {
    guide[y * w + x] = x < 30 ? 0.8 : 0.2;
    mask[y * w + x] = Math.min(1, Math.max(0, (39 - x) / 12));
  }
  const out = guidedFilter(guide, mask, w, H, 12, 1e-3);
  const at = (x) => out[4 * w + x];
  const was = (x) => mask[4 * w + x];
  // 之後會過 cutout.js 的軟門檻（0.5～0.85）：邊外要掉到 0.5 以下、邊內要到 0.85 以上
  assert.ok(was(31) > 0.5 && at(31) < 0.5, `邊外一格（背景）：${was(31)} → ${at(31)}`);
  assert.ok(was(29) < 0.85 && at(29) > 0.85, `邊內一格（人）：${was(29)} → ${at(29)}`);
});

test("decontaminate：半透明的邊換成人的顏色，實心的不動，不改原本的陣列", () => {
  const rgba = new Uint8ClampedArray(W * H * 4);
  const alpha = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = y * W + x;
    const person = x < 20;
    rgba.set(person ? [200, 150, 120, 255] : [20, 20, 30, 255], i * 4);
    alpha[i] = person ? 1 : x < 24 ? 0.4 : 0;
  }
  const copy = new Uint8ClampedArray(rgba);
  const out = decontaminate(rgba, alpha, W, H, 5);
  assert.deepEqual(rgba, copy);
  const px = (x) => Array.from(out.slice((4 * W + x) * 4, (4 * W + x) * 4 + 3));
  assert.deepEqual(px(10), [200, 150, 120]);
  const edge = px(21);
  assert.ok(edge[0] > 150, `邊緣要偏人的顏色：${edge}`);
  assert.deepEqual(px(30), [20, 20, 30]);        // 全透明的不用管
});

test("solidify：人裡面沒把握的一塊補成實心，外面的背景不動", () => {
  const w = 60;
  const conf = new Float32Array(w * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < w; x += 1) {
    conf[y * w + x] = x < 30 ? (x >= 12 && x < 16 ? 0.55 : 1) : 0;   // 人裡面有一塊糊掉的手臂
  }
  const out = solidify(conf, w, H, 6);
  assert.ok(out[4 * w + 14] > 0.95, `手臂要變實心：${out[4 * w + 14]}`);
  assert.equal(out[4 * w + 45], 0);
  assert.ok(out[4 * w + 33] < 0.3, `邊外面不能長出來：${out[4 * w + 33]}`);
});

test("頭頂細條：比 2r 細的一條剪掉，頭本身和額頭以下的細手指留著", () => {
  const w = 60;
  const h = 60;
  const at = (x, y) => y * w + x;
  const conf = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const head = (x - 30) ** 2 + (y - 35) ** 2 < 15 ** 2;
      const fin = x >= 29 && x <= 31 && y >= 5 && y < 25;        // 頭頂上 3 格寬的細條
      const finger = x >= 50 && x <= 51 && y >= 40 && y < 55;    // 額頭以下的細東西
      conf[at(x, y)] = head || fin || finger ? 1 : 0;
    }
  }
  const out = pruneSpikes(conf, w, h, 3, 25);
  assert.equal(out[at(30, 10)], 0, "細條剪掉");
  assert.equal(out[at(30, 35)], 1, "頭還在");
  assert.equal(out[at(30, 22)], 1, "頭頂的弧還在");
  assert.equal(out[at(50, 45)], 1, "額頭以下不動");
  assert.equal(conf[at(30, 10)], 1, "不改原本那份");
});
