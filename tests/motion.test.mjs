// 手勢與彈簧的純函式（physics.js、selfie/gesture.js）。跑法：node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createVelocity, isSettled, project, rubberband, softClamp, springStep,
} from "../web/scripts/physics.js";
import {
  angleDelta, applyPinch, clampSpot, clearOf, pinchOf, SIZE_RANGE, spotBounds,
} from "../web/scripts/selfie/gesture.js";

function runSpring(from, to, cfg, seconds) {
  let st = { x: from, v: 0 };
  let peak = from;
  for (let t = 0; t < seconds; t += 1 / 60) {
    st = springStep(st, to, cfg, 1 / 60);
    peak = Math.max(peak, st.x);
  }
  return { st, peak };
}

test("彈簧：damping 1 不會衝過頭，也會停在目標", () => {
  const { st, peak } = runSpring(0, 100, { damping: 1, response: 0.4 }, 2);
  assert.ok(peak <= 100.01, `衝過頭到 ${peak}`);
  assert.ok(isSettled(st, 100, 0.5));
});

test("彈簧：damping 0.8 會彈過頭一點再回來", () => {
  const { st, peak } = runSpring(0, 100, { damping: 0.8, response: 0.4 }, 2);
  assert.ok(peak > 100.5 && peak < 110, `peak ${peak}`);
  assert.ok(isSettled(st, 100, 0.5));
});

test("彈簧：response 越小越快到", () => {
  const fast = runSpring(0, 100, { damping: 1, response: 0.2 }, 0.2).st.x;
  const slow = runSpring(0, 100, { damping: 1, response: 0.6 }, 0.2).st.x;
  assert.ok(fast > slow);
});

test("彈簧：分頁切走很久再回來，一步也不會跳過頭", () => {
  const st = springStep({ x: 0, v: 0 }, 100, { damping: 1, response: 0.4 }, 5);
  assert.ok(st.x < 100 && Number.isFinite(st.v));
});

test("邊界：範圍內照走，越界越拉越緊但不會停死", () => {
  assert.equal(softClamp(0.5, 0.1, 0.9, 1), 0.5);
  const a = softClamp(1.0, 0.1, 0.9, 1) - 0.9;
  const b = softClamp(1.3, 0.1, 0.9, 1) - 0.9;
  assert.ok(a > 0 && a < 0.1);
  assert.ok(b > a && b < 0.4);
  assert.ok(rubberband(10, 1) < 1 / 0.55 * 0.55 + 1e-9, "拉再遠也不超過 dimension");
});

test("慣性投影：跟速度同號，速度 0 就是 0", () => {
  assert.equal(project(0), 0);
  assert.ok(project(1000) > 0 && project(-1000) < 0);
  assert.ok(project(1000, 0.99) < project(1000, 0.998), "0.99 停得比較快");
});

test("速度：只看最後 100ms，停住再放手就是 0", () => {
  const v = createVelocity();
  v.add(0, 0, 0);
  v.add(50, 0, 50);
  assert.equal(Math.round(v.read(50).x), 1000);
  assert.deepEqual(v.read(400), { x: 0, y: 0 });
});

test("貼片範圍：整片留在照片裡，大貼片範圍比較窄", () => {
  const small = spotBounds({ size: 0.05 }, 1);
  const big = spotBounds({ size: 0.2 }, 1);
  assert.ok(small.x[0] >= 0.025 && small.x[1] <= 0.975);
  assert.ok(big.x[0] > small.x[0] && big.y[1] < small.y[1]);
  const c = clampSpot({ x: 0.99, y: -0.2, size: 0.1, roll: 0 }, 1);
  assert.ok(c.x < 0.95 && c.y > 0.03);
});

test("雙指：角度差跨過 ±180 不會跳一圈", () => {
  assert.equal(angleDelta(170, -170), 20);
  assert.equal(angleDelta(-170, 170), -20);
});

test("雙指：轉、縮放、移動都跟著手指，大小有上下限", () => {
  const rect = { width: 300, height: 375 };
  const start = {
    pinch: pinchOf({ x: 100, y: 100 }, { x: 200, y: 100 }),
    spot: { x: 0.5, y: 0.5, size: 0.1, roll: 0 },
    base: 0.1,
  };
  // 順時針轉 90 度（螢幕座標）＝ roll -90；距離不變；中點不動
  const turned = applyPinch(start, pinchOf({ x: 150, y: 50 }, { x: 150, y: 150 }), rect);
  assert.equal(Math.round(turned.roll), -90);
  assert.equal(+turned.size.toFixed(4), 0.1);
  // 張開三倍：卡在上限
  const wide = applyPinch(start, pinchOf({ x: 0, y: 100 }, { x: 300, y: 100 }), rect);
  assert.equal(+wide.size.toFixed(4), +(0.1 * SIZE_RANGE.max).toFixed(4));
  // 整組往右移 30px
  const moved = applyPinch(start, pinchOf({ x: 130, y: 100 }, { x: 230, y: 100 }), rect);
  assert.equal(+moved.x.toFixed(4), 0.6);
});


test("+ADD 膠囊：貼片中心放在膠囊底下就推到膠囊上面，旁邊的不動", () => {
  const tray = { left: 0.04, right: 0.7, top: 0.88 };
  const under = clearOf({ x: 0.3, y: 0.94, size: 0.1, roll: 0 }, 1, tray);
  const half = (0.1 / 2) * 0.8;                    // 半個貼片高（框高為 1）
  assert.equal(+under.y.toFixed(4), +(0.88 - half).toFixed(4));
  assert.equal(under.x, 0.3);
  const beside = { x: 0.85, y: 0.94, size: 0.1, roll: 0 };
  assert.equal(clearOf(beside, 1, tray), beside);
  const above = { x: 0.3, y: 0.5, size: 0.1, roll: 0 };
  assert.equal(clearOf(above, 1, tray), above);
  assert.equal(clearOf(above, 1, null), above);
});
