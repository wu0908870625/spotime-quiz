/** 把三層圖層壓成一張可以存下來的結果圖。
   素材與網頁同網域，所以 canvas 不會被污染，toBlob 可以用。 */
import { url } from "./layers.js";
import { relightLayer } from "./selfie/relight.js";

const OUTPUT_WIDTH = 1080;
const ASPECT = 0.8;
const GRAIN = 9;                 // 顆粒振幅，對齊 Python 端的質感
const LOGO_WIDTH_RATIO = 0.30;
const LOGO_BOTTOM_RATIO = 0.045;
const LOGO_ALPHA = 0.92;
const SHADOW = { blur: 0.16, x: 0.07, y: 0.10, alpha: 0.45 };   // 比例基準是貼片寬度，不是畫面寬度

const cache = new Map();

function loadImage(src) {
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載不進來：${src}`));
    img.src = src;
  });
  cache.set(src, p);
  return p;
}

/** x、y 是 0～1 的框座標，size 是貼片寬佔框寬的比例，roll 是角度（逆時針為正）。 */
export function drawSticker(ctx, img, { x, y, size, roll }, frameW) {
  const w = size * frameW;
  const h = w * (img.naturalHeight / img.naturalWidth);
  ctx.save();
  ctx.translate(x * frameW, y * (frameW / ASPECT));
  ctx.rotate((-roll * Math.PI) / 180);
  ctx.shadowColor = `rgba(0,0,0,${SHADOW.alpha})`;
  ctx.shadowBlur = SHADOW.blur * w;
  ctx.shadowOffsetX = SHADOW.x * w;
  ctx.shadowOffsetY = SHADOW.y * w;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function addGrain(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (Math.random() - 0.5) * GRAIN * 2;
    px[i] += n;
    px[i + 1] += n;
    px[i + 2] += n;
  }
  ctx.putImageData(data, 0, 0);
}

/** 場景合照內建的兩個人（W、M）在這個位置的貼點 */
export function builtinSpots(manifest, position) {
  return ["W", "M"].map((who) => {
    const pts = manifest.points[who];
    const spot = pts.at[position];
    const [x, y] = spot.xy;
    return { x, y, size: pts.size, roll: spot.roll };
  });
}

export function stickerImage(manifest, shape) {
  return loadImage(url(manifest.stickers[shape].src));
}

/** 四種造型的貼片圖，key 是造型。加貼片（10-06）時一張照片上會有不同造型 */
export async function stickerImages(manifest) {
  const entries = await Promise.all(Object.keys(manifest.stickers).map(async (shape) => [shape, await stickerImage(manifest, shape)]));
  return Object.freeze(Object.fromEntries(entries));
}

/** 底圖＋人物層，還沒貼貼片。自拍的拖曳預覽會重複用這一張。
   backdrop：保留原本背景的自拍（selfie/backdrop.js），整張照片當底圖，不換場景、不疊人物層 */
export async function renderBase(manifest, sceneKey, width, person = null, backdrop = null) {
  const scene = manifest.scenes[sceneKey];
  if (!scene) throw new Error(`沒有這個場景：${sceneKey}`);
  const height = Math.round(width / ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (backdrop) {
    ctx.drawImage(backdrop, 0, 0, width, height);
    return canvas;
  }
  ctx.drawImage(await loadImage(url(scene.plate)), 0, 0, width, height);
  // 內建合照的人物層已經離線打過光；自拍的在這裡依場景打（selfie/relight.js）
  const layer = person
    ? relightLayer(person, sceneKey, scene.lighting)
    : (scene.person ? await loadImage(url(scene.person)) : null);
  if (layer) ctx.drawImage(layer, 0, 0, width, height);
  return canvas;
}

/**
 * 回傳一張畫好的 canvas。結果圖只印 Logo，不印帳號與網址。
 * @param {{person:HTMLCanvasElement, backdrop?:HTMLCanvasElement, spots:Array}|null} custom 使用者的自拍：
 *   人物層換成他的去背照（或 backdrop＝保留原本背景的整張照片），貼點換成從他臉上算出來的位置
 */
export async function renderResult(manifest, answers, width = OUTPUT_WIDTH, custom = null) {
  const { scene: sceneKey, shape, position } = answers;
  const canvas = await renderBase(manifest, sceneKey, width, custom?.person ?? null, custom?.backdrop ?? null);
  const ctx = canvas.getContext("2d");
  const height = canvas.height;

  // 自己多加的貼片帶著自己的造型（spot.shape），其他的照答案
  const images = await stickerImages(manifest);
  for (const spot of custom?.spots ?? builtinSpots(manifest, position)) {
    drawSticker(ctx, images[spot.shape] ?? images[shape], spot, width);
  }

  addGrain(ctx, width, height);

  const logo = await loadImage(url(manifest.logo.wordmark));
  const lw = width * LOGO_WIDTH_RATIO;
  const lh = lw * (logo.naturalHeight / logo.naturalWidth);
  ctx.save();
  ctx.globalAlpha = LOGO_ALPHA;
  // 背景什麼顏色都有，加一層柔陰影確保白字讀得到
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = width * 0.014;
  ctx.drawImage(logo, (width - lw) / 2, height - lh - height * LOGO_BOTTOM_RATIO, lw, lh);
  ctx.restore();

  return canvas;
}

export function toBlob(canvas, type = "image/jpeg", quality = 0.94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("圖片轉檔失敗"))), type, quality);
  });
}
