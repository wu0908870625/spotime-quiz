import { test } from "node:test";
import assert from "node:assert/strict";
import { placeBackdrop } from "../web/scripts/selfie/backdrop.js";

const frame = { width: 1000, height: 1250 };
const face = (x, y) => ({ center: { x, y } });

/** 照片四邊都要蓋滿框：左上不進框、右下不退出框 */
function covers(place, w, h) {
  assert.ok(place.x <= 1e-9 && place.y <= 1e-9, "左上角跑進框裡");
  assert.ok(place.x + w * place.scale >= frame.width - 1e-9, "右邊露白");
  assert.ok(place.y + h * place.scale >= frame.height - 1e-9, "下面露白");
}

test("直的照片：蓋滿，臉放在框高 44% 附近", () => {
  const place = placeBackdrop([face(540, 900)], 1080, 1920, frame);
  covers(place, 1080, 1920);
  const faceY = 900 * place.scale + place.y;
  assert.ok(Math.abs(faceY - 0.44 * frame.height) < 1, `臉在 ${faceY}`);
});

test("橫的照片：臉在右邊，裁切跟著臉走", () => {
  const place = placeBackdrop([face(1200, 500)], 1920, 1080, frame);
  covers(place, 1920, 1080);
  const faceX = 1200 * place.scale + place.x;
  assert.ok(Math.abs(faceX - frame.width / 2) < 1, `臉在 ${faceX}`);
});

test("臉貼著照片邊緣：夾住，不留白", () => {
  const place = placeBackdrop([face(20, 30)], 1280, 1280, frame);
  covers(place, 1280, 1280);
  assert.equal(place.y, 0);
  assert.equal(place.x, 0);
});

test("合照：以所有臉的中心對齊", () => {
  const place = placeBackdrop([face(300, 600), face(900, 600)], 1200, 1600, frame);
  covers(place, 1200, 1600);
  assert.ok(Math.abs(600 * place.scale + place.x - frame.width / 2) < 1);
});

test("沒有臉：置中", () => {
  const place = placeBackdrop([], 1000, 2000, frame);
  covers(place, 1000, 2000);
});
