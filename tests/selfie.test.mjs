// 上傳自拍的純函式：放置、檢查規則、遮罩量測。跑法：node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { eulerFromMatrix, PLACE, placePerson, stickerRoll } from "../web/scripts/selfie/geometry.js";
import { isBlocked, LIMITS, review } from "../web/scripts/selfie/check.js";
import {
  bottomCut, CLASS, classFraction, edgeTouch, findFaceSpot, findNeck, inPolygon, occlusion, sharpnessIn,
} from "../web/scripts/selfie/pixels.js";

const FRAME = { width: 1000, height: 1250 };

const face = (cx, cy, w) => ({
  center: { x: cx, y: cy },
  width: w,
  height: w * 1.2,
  box: { x0: cx - w / 2, x1: cx + w / 2, y0: cy - w * 0.6, y1: cy + w * 0.6 },
  tilt: 0,
  side: "L",
});

const good = (over = {}) => ({
  yaw: 2, pitch: 8, widthPx: 400, cropped: false, brightness: 120,
  sharpness: 500, occluded: 0, spot: { x: 1, y: 1 }, spotSkin: 1, ...over,
});
const metrics = (faces, over = {}) => ({
  faceCount: faces.length, faces, clutter: 0.05, faceShare: 0.3, position: "cheek", ...over,
});
const ids = (list) => list.map((i) => i.id);

test("單位矩陣：三個角度都是 0", () => {
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const e = eulerFromMatrix(m);
  for (const v of Object.values(e)) assert.ok(Math.abs(v) < 1e-9);
});

test("放置：一個人、沒被切到 → 臉寬照 PLACE.oneFace、水平置中", () => {
  const f = face(400, 300, 200);
  const p = placePerson([f], 800, 1000, FRAME, { top: false, bottom: false, left: false, right: false });
  assert.ok(Math.abs(p.faceShare - PLACE.oneFace) < 1e-9);
  assert.ok(Math.abs(400 * p.scale + p.x - 500) < 1e-9);
});

test("放置：三個人分得開 → 總寬比兩人合照多一格、四個人再多一格，但不超過上限", () => {
  const none = { top: false, bottom: false, left: false, right: false };
  const three = placePerson([face(220, 300, 200), face(400, 300, 200), face(580, 300, 200)], 800, 1000, FRAME, none);
  assert.ok(Math.abs(three.faceShare - (PLACE.twoFaces + PLACE.perExtraFace)) < 1e-9);
  const many = [100, 250, 400, 550, 700].map((x) => face(x, 300, 100));
  assert.ok(placePerson(many, 800, 1000, FRAME, none).faceShare <= PLACE.maxSpan + 1e-9);
});

test("放置：臉比間距小很多 → 每張臉至少 minGroupFace，不會縮成一個人時的一半", () => {
  const none = { top: false, bottom: false, left: false, right: false };
  const faces = [face(250, 300, 100), face(400, 280, 100), face(550, 260, 100)];
  const p = placePerson(faces, 800, 1000, FRAME, none);
  assert.ok(Math.abs((100 * p.scale) / FRAME.width - PLACE.minGroupFace) < 1e-9);
  assert.ok(p.faceShare <= PLACE.maxSpan + 1e-9);
  const far = placePerson([face(50, 300, 100), face(400, 300, 100), face(750, 300, 100)], 800, 1000, FRAME, none);
  assert.ok(Math.abs(far.faceShare - PLACE.maxSpan) < 1e-9, "離太開：總寬卡在 maxSpan");
});

test("放置：底邊被切到 → 照片底一定接到框底", () => {
  // 橫式近拍：臉下面只剩一點點
  const f = face(640, 400, 450);
  const p = placePerson([f], 1280, 853, FRAME, { top: false, bottom: true, left: true, right: true });
  assert.ok(p.y + 853 * p.scale >= FRAME.height - 1);
  assert.ok(p.x <= 0 && p.x + 1280 * p.scale >= FRAME.width, "左右也被切到，要蓋滿框寬");
});

test("放置：四邊都被切到（臉塞滿照片）→ 照片蓋滿整個框，不會變成一塊方形", () => {
  const f = face(600, 700, 950);
  const all = { top: true, bottom: true, left: true, right: true };
  const p = placePerson([f], 1200, 1500, FRAME, all);
  assert.ok(p.x <= 0 && p.x + 1200 * p.scale >= FRAME.width);
  assert.ok(p.y <= 0 && p.y + 1500 * p.scale >= FRAME.height - 1);
});

test("貼片角度：臉歪的方向相反、左右鏡像", () => {
  const L = { tilt: 10, side: "L" };
  const R = { tilt: 10, side: "R" };
  assert.equal(stickerRoll(L, "cheek"), -10 + 18);
  assert.equal(stickerRoll(R, "cheek"), -10 - 18);
});

test("檢查：一張完美的照片 → 沒有任何提醒", () => {
  assert.deepEqual(review(metrics([good()])), []);
});

test("檢查：找不到臉、超過四個人 → 直接擋下", () => {
  assert.deepEqual(ids(review(metrics([], { faceCount: 0 }))), ["no-face"]);
  const five = review(metrics([good(), good(), good(), good()], { faceCount: 5 }));
  assert.deepEqual(ids(five), ["too-many"]);
  assert.ok(isBlocked(five));
});

test("檢查：三、四個人的合照可以用（10-02 Jimmy）", () => {
  assert.deepEqual(review(metrics([good(), good(), good()])), []);
  assert.deepEqual(review(metrics([good(), good(), good(), good()])), []);
});

test("檢查：側臉的門檻", () => {
  assert.deepEqual(ids(review(metrics([good({ yaw: LIMITS.yawWarn + 1 })]))), ["side-soft"]);
  const side = review(metrics([good({ yaw: -(LIMITS.yawBlock + 1) })]));
  assert.deepEqual(ids(side), ["side"]);
  assert.ok(isBlocked(side));
});

test("檢查：太暗擋下、有點暗只提醒", () => {
  assert.ok(isBlocked(review(metrics([good({ brightness: 20 })]))));
  const dim = review(metrics([good({ brightness: 60 })]));
  assert.deepEqual(ids(dim), ["dim"]);
  assert.equal(isBlocked(dim), false);
});

test("檢查：選脖子但脖子被擋住 → 提醒，可以改貼臉頰", () => {
  const r = review(metrics([good({ spot: null })], { position: "neck" }));
  assert.deepEqual(ids(r), ["neck-hidden"]);
  assert.equal(isBlocked(r), false);
});

test("檢查：兩張臉都糊，提醒只出現一次", () => {
  const r = review(metrics([good({ sharpness: 5 }), good({ sharpness: 5 })]));
  assert.deepEqual(ids(r), ["blur"]);
});

test("檢查：太近、背景雜", () => {
  const r = review(metrics([good()], { faceShare: 0.8, clutter: 0.4 }));
  assert.deepEqual(ids(r), ["too-close", "clutter"]);
});

// ---- 遮罩量測 ----

/** w×h 的分類遮罩，fill(x, y) 決定每一格的類別 */
function grid(w, h, fill) {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) a[y * w + x] = fill(x, y);
  return a;
}

test("多邊形判定", () => {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(inPolygon({ x: 5, y: 5 }, sq), true);
  assert.equal(inPolygon({ x: 15, y: 5 }, sq), false);
});

test("遮擋：臉的右半邊是手（身體皮膚）→ 約一半", () => {
  const cat = grid(100, 100, (x) => (x < 50 ? CLASS.faceSkin : CLASS.bodySkin));
  const sq = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }];
  const r = occlusion(cat, 100, 100, sq, 1);
  assert.ok(r > 0.45 && r < 0.55, `得到 ${r}`);
});

test("清晰度：棋盤格遠比一片灰清楚", () => {
  const w = 40;
  const flat = new Float32Array(w * w).fill(128);
  const checker = Float32Array.from({ length: w * w }, (_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 255 : 0);
  const box = { x0: 0, y0: 0, x1: w, y1: w };
  assert.equal(sharpnessIn(flat, w, w, box), 0);
  assert.ok(sharpnessIn(checker, w, w, box) > 1000);
});

test("邊緣：人只碰到底邊", () => {
  const w = 50;
  const h = 50;
  const conf = Float32Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    return x > 15 && x < 35 && y > 10 ? 1 : 0;
  });
  assert.deepEqual(edgeTouch(conf, w, h), { top: false, bottom: true, left: false, right: false });
});

const mask = (w, h, inside) => Float32Array.from({ length: w * h }, (_, i) => (inside(i % w, Math.floor(i / w)) ? 1 : 0));

test("平切邊：坐在桌子後面，下緣是一條水平線 → 找得到那一列", () => {
  // 三個人並排，肩膀以下被桌子擋在第 70 列
  const conf = mask(100, 100, (x, y) => x > 10 && x < 90 && y > 20 && y <= 70);
  assert.equal(bottomCut(conf, 100, 100), 70);
});

test("平切邊：一般的半身剪影（肩膀圓弧往下接到底邊）→ 沒有", () => {
  const conf = mask(100, 100, (x, y) => Math.abs(x - 50) < 10 + (y - 20) * 0.6 && y > 20 && y < 99 - Math.abs(x - 50) * 0.8);
  assert.equal(bottomCut(conf, 100, 100), null);
});

test("平切邊：人很小、平的那段太窄 → 不算", () => {
  const conf = mask(100, 100, (x, y) => x > 45 && x < 52 && y > 30 && y <= 70);
  assert.equal(bottomCut(conf, 100, 100), null);
});

test("平切邊：桌線放進合照會推到框底", () => {
  const f = face(400, 300, 120);
  const g = face(560, 320, 120);
  const p = placePerson([f, g], 800, 701, FRAME, { top: false, bottom: true, left: false, right: false });
  assert.ok(p.y + 701 * p.scale >= FRAME.height - 1);
});

test("脖子：理想點被衣服蓋住，會往上找到露出來的皮膚", () => {
  // y < 60 是皮膚，以下是高領
  const cat = grid(100, 100, (x, y) => (y < 60 ? CLASS.bodySkin : CLASS.clothes));
  const frame = {
    ideal: { x: 50, y: 70 },
    sign: 1,
    at: (t, s) => ({ x: 50 + s * 100, y: 40 + t * 100 }),
  };
  const pt = findNeck(cat, 100, 100, frame, 4);
  assert.ok(pt, "應該找得到");
  assert.ok(classFraction(cat, 100, 100, pt, 4, [CLASS.bodySkin]) >= 0.8);
});

test("脖子：整片都是衣服 → null", () => {
  const cat = grid(100, 100, () => CLASS.clothes);
  const frame = { ideal: { x: 50, y: 70 }, sign: 1, at: (t, s) => ({ x: 50 + s * 100, y: 40 + t * 100 }) };
  assert.equal(findNeck(cat, 100, 100, frame, 4), null);
});

test("脖子：理想點那側只剩一條貼著衣領的皮膚、另一側露很多 → 貼到露比較多的那側", () => {
  // 左邊 x 15～55 是一大片脖子；右邊 x 62～72 只有一條，旁邊都是衣服
  const cat = grid(100, 100, (x, y) => (y < 80 && ((x >= 15 && x <= 55) || (x >= 62 && x <= 72))
    ? CLASS.bodySkin : CLASS.clothes));
  const frame = {
    ideal: { x: 67, y: 50 },
    mirror: { x: 33, y: 50 },
    sign: 1,
    at: (t, s) => ({ x: 50 + s * 100, y: 30 + t * 100 }),
  };
  const pt = findNeck(cat, 100, 100, frame, 4);
  assert.ok(pt && pt.x < 55, `應該換到左邊，得到 ${JSON.stringify(pt)}`);
});

test("臉上：理想點被瀏海蓋住 → 在附近找露出來、四周也夠乾淨的臉，不碰眼睛", () => {
  // y < 40 是頭髮（瀏海），以下是臉；眼睛在 (50, 50)
  const cat = grid(100, 100, (x, y) => (y < 40 ? CLASS.hair : CLASS.faceSkin));
  const ideal = { x: 30, y: 35 };
  const candidates = [ideal];
  for (let dy = -6; dy <= 24; dy += 3) for (let dx = -12; dx <= 12; dx += 3) candidates.push({ x: 30 + dx, y: 35 + dy });
  const eye = { x: 45, y: 50, a: 6, b: 6, angle: 0 };
  const pt = findFaceSpot(cat, 100, 100, { ideal, candidates, avoid: [eye] }, 3);
  assert.ok(pt, "應該找得到");
  assert.ok(pt.y >= 40 + 3, `貼片要整個離開頭髮，得到 ${JSON.stringify(pt)}`);
  assert.ok(Math.hypot(pt.x - eye.x, pt.y - eye.y) >= eye.a + 3, "不能貼到眼睛");
});

test("臉上：理想點本身很乾淨 → 就用理想點", () => {
  const cat = grid(100, 100, () => CLASS.faceSkin);
  const ideal = { x: 50, y: 50 };
  const candidates = [ideal, { x: 56, y: 50 }, { x: 50, y: 58 }];
  assert.deepEqual(findFaceSpot(cat, 100, 100, { ideal, candidates, avoid: [] }, 3), ideal);
});

test("臉上：附近全是頭髮 → null（維持理想點並提醒）", () => {
  const cat = grid(100, 100, () => CLASS.hair);
  const ideal = { x: 50, y: 50 };
  assert.equal(findFaceSpot(cat, 100, 100, { ideal, candidates: [ideal], avoid: [] }, 3), null);
});

test("旋轉：角度維持在 -180～180", async () => {
  const { wrapRoll } = await import("../web/scripts/selfie/drag.js");
  assert.equal(wrapRoll(185), -175);
  assert.equal(wrapRoll(-185), 175);
  assert.equal(wrapRoll(-180), 180);
  assert.equal(wrapRoll(30), 30);
});
