/** 依場景替自拍的人物層打光（09-30 Jimmy 選方案：依場景固定調色）。
 *
 * 預設合照在 tools/scene_light.py 離線打過光，自拍沒有，所以亮背景前面的人偏暗、
 * 演唱會前面的人又太亮，像剪紙貼上去。這支是同一套做法搬到瀏覽器，參數也是同一組
 * （tools/scenes.py → export_web.py 寫進 layers.json 的 lighting）：
 *   環境色  暗部往場景主色偏，亮部幾乎不動（用乘的，黑色不會被拉灰）
 *   曝光    整體亮一點或暗一點
 *   輪廓光  沿著人的邊緣加一圈場景色的光，上半身強、往下淡掉
 * 人物層外面那圈白光（alpha 低）不算人，不打輪廓光。
 * 全部是對 typed array 的純計算，測試直接吃這支（tests/relight.test.mjs）。
 */
import { boxMean } from "./matte.js";

const LUMA = Object.freeze([0.299, 0.587, 0.114]);
const SOLID = Object.freeze({ lo: 0.6, hi: 0.9 });   // alpha 在這之上才算人（白光最多 0.5）
const RIM_FADE_TO = 0.25;                           // 輪廓光到最底下剩幾成（跟 scene_light.py 一樣）
/* 自拍比預設合照更需要拉：室內自拍大多偏黃偏亮，合照是棚拍過的。
   同一組參數在自拍上幾乎看不出來（09-30 實測），所以環境色跟曝光的「偏離量」放大。 */
const SELFIE_BOOST = Object.freeze({ ambient: 2, exposure: 2 });

function smoothstep(lo, hi, v) {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/**
 * 環境色換成「每個色版乘多少」：只改色偏不改亮度。
 * scene_light.py 是往環境色混（lerp），深色衣服會被拉灰、整個人像蒙一層霧，
 * 自拍的衣服常常是黑的，所以這裡改用乘的：黑的還是黑的。
 */
export function ambientHue(ambient) {
  const mean = (ambient[0] + ambient[1] + ambient[2]) / 3;
  return ambient.map((v) => v / mean);
}

/** 每個像素「確定是人」的程度 0–1 */
function solidOf(rgba, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = smoothstep(SOLID.lo, SOLID.hi, rgba[i * 4 + 3] / 255);
  return out;
}

/**
 * 輪廓光遮罩：人裡面、靠近邊緣的那一圈。
 * 周圍方框裡人的比例越低＝越靠邊；方框本身就把邊緣柔化掉，不用再模糊一次。
 */
export function rimMask(solid, w, h, r) {
  const around = boxMean(solid, w, h, r);
  const out = new Float32Array(solid.length);
  for (let i = 0; i < solid.length; i += 1) {
    out[i] = solid[i] * Math.min(1, Math.max(0, (1 - around[i]) * 2));
  }
  return out;
}

/**
 * @param rgba 人物層像素（Uint8ClampedArray，RGBA，不會被改）
 * @param light { ambient:[r,g,b], ambient_mix, rim:[r,g,b], rim_mix, rim_width, exposure }
 * @returns 新的一份 RGBA，alpha 不變
 */
export function relightPixels(rgba, w, h, light) {
  const n = w * h;
  const out = new Uint8ClampedArray(rgba);
  const solid = solidOf(rgba, n);
  const r = Math.max(1, Math.round(w * light.rim_width));
  const rim = rimMask(solid, w, h, r);
  const exposure = 1 + ((light.exposure ?? 1) - 1) * SELFIE_BOOST.exposure;
  const ambientMix = light.ambient_mix * SELFIE_BOOST.ambient;
  const hue = ambientHue(light.ambient);
  for (let y = 0; y < h; y += 1) {
    const fade = 1 - (1 - RIM_FADE_TO) * (h > 1 ? y / (h - 1) : 0);
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (rgba[i * 4 + 3] === 0) continue;
      const p = i * 4;
      const luma = rgba[p] * LUMA[0] + rgba[p + 1] * LUMA[1] + rgba[p + 2] * LUMA[2];
      const tint = (1 - luma / 255) * ambientMix * solid[i];
      const glow = rim[i] * fade * light.rim_mix;
      for (let c = 0; c < 3; c += 1) {
        const lit = rgba[p + c] * (1 + (hue[c] - 1) * tint) * exposure;
        out[p + c] = Math.round(255 - (255 - lit) * (1 - glow * (light.rim[c] / 255)));
      }
    }
  }
  return out;
}

/** 同一張人物層、同一個場景只算一次 */
const cache = new WeakMap();

/**
 * @param {HTMLCanvasElement} layer selfie/cutout.js personLayer() 的結果
 * @param light layers.json 場景的 lighting；沒有就原樣回傳
 * @returns {HTMLCanvasElement}
 */
export function relightLayer(layer, sceneKey, light) {
  if (!light) return layer;
  const done = cache.get(layer) ?? new Map();
  if (done.has(sceneKey)) return done.get(sceneKey);
  const { width: w, height: h } = layer;
  const src = layer.getContext("2d").getImageData(0, 0, w, h);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d").putImageData(new ImageData(relightPixels(src.data, w, h, light), w, h), 0, 0);
  cache.set(layer, new Map(done).set(sceneKey, out));
  return out;
}
