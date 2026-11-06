/** 去背＋白邊：把使用者的照片變成跟場景合照同規格的「人物層」。
 *
 * 模型的遮罩是 256×256 放大上來的，髮絲邊緣一定會糊。所以外面加一圈白光，
 * 貼著人的地方是白的、往外逐漸淡掉融進背景——邊緣的瑕疵被蓋住，
 * 又不會像一圈硬邊貼紙那麼搶眼（09-29 Jimmy 回報硬白邊太明顯，改成漸層）。
 * 09-30 盲測：邊緣糊、肩膀切得怪、透出舊背景色 → 遮罩先貼齊照片輪廓、邊緣去色（matte.js）。
 */
import { decontaminate, guidedFilter, solidify } from "./matte.js";

/* 遮罩信心值的軟門檻：低於 lo 全透明、高於 hi 全不透明，中間漸層。
   邊緣半透明的像素還帶著原本背景的顏色，白邊改成漸層之後會露出一圈灰黑，
   所以門檻比硬白邊時代收緊一點（0.35～0.75 → 0.5～0.85） */
const EDGE = Object.freeze({ lo: 0.5, hi: 0.85 });

/* guided filter：方框半徑是照片長邊的 1%（1280px 的照片≈13px），eps 小＝越貼照片的邊 */
const MATTE = Object.freeze({ radius: 0.01, eps: 1e-3, solidRadius: 3 });   // 補實心看的方框是 guided filter 的 3 倍大

/* 白邊，單位是合照框寬的比例。
   core：緊貼人的一圈實心白，蓋住遮罩邊緣的鋸齒，很細。
   glow：往外淡出的白光，用 canvas 的 shadowBlur 做（Safari 不支援 ctx.filter）。 */
const OUTLINE = Object.freeze({
  core: 0.004,
  coreSteps: 12,
  glowBlur: 0.02,
  glowPasses: 2,             // 疊兩次，貼著人的那一段才夠白，外圈照樣淡掉
  color: "#ffffff",
  glow: "rgba(255, 255, 255, .95)",
  /* 整圈白邊（實心＋光暈）最後以這個透明度疊上去。09-30 Jimmy 回報深色背景（演唱會）
     白邊太搶眼：1 → 0.5。實心那圈要先畫在另一張畫布再整張降透明，
     直接在同一張畫布設 globalAlpha 的話，12 次位移疊起來又會變回全白。 */
  alpha: 0.5,
});

function smooth(v) {
  const t = Math.min(1, Math.max(0, (v - EDGE.lo) / (EDGE.hi - EDGE.lo)));
  return t * t * (3 - 2 * t);
}

function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** 照片只留人，背景變透明 */
function maskPerson(photo, person, w, h) {
  const out = canvasOf(w, h);
  const ctx = out.getContext("2d");
  ctx.drawImage(photo, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = (img.data[i * 4] * 0.299 + img.data[i * 4 + 1] * 0.587 + img.data[i * 4 + 2] * 0.114) / 255;
  }
  const r = Math.max(2, Math.round(Math.max(w, h) * MATTE.radius));
  const refined = solidify(guidedFilter(gray, person, w, h, r, MATTE.eps), w, h, r * MATTE.solidRadius);
  const alpha = refined.map(smooth);
  const rgba = decontaminate(img.data, alpha, w, h, r);
  for (let i = 0; i < alpha.length; i += 1) rgba[i * 4 + 3] = Math.round(alpha[i] * 255);
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return out;
}

/** 同一個剪影塗成單色 */
function silhouette(cut, color) {
  const out = canvasOf(cut.width, cut.height);
  const ctx = out.getContext("2d");
  ctx.drawImage(cut, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

/**
 * @param {HTMLCanvasElement} photo 分析用的那張照片
 * @param {Float32Array} person 每個像素「是人」的信心值，尺寸跟 photo 一樣
 * @param {{scale:number,x:number,y:number}} place geometry.placePerson() 的結果（框座標）
 * @param {{width:number,height:number}} frame 合照框（layers.json 的 frame）
 * @param {number} outW 要輸出的寬度（高度照框的比例）
 * @returns {HTMLCanvasElement} 跟場景的 person/*.webp 同規格：整框大小、透明底
 */
export function personLayer(photo, person, place, frame, outW) {
  const { width: w, height: h } = photo;
  const k = outW / frame.width;
  const outH = Math.round(frame.height * k);
  const cut = maskPerson(photo, person, w, h);
  const white = silhouette(cut, OUTLINE.color);

  const layer = canvasOf(outW, outH);
  const ctx = layer.getContext("2d");
  const s = place.scale * k;
  const dx = place.x * k;
  const dy = place.y * k;

  // 只畫在照片範圍內——人被照片邊緣切到的地方（例如底邊）不該多出一條白線。
  const rim = canvasOf(outW, outH);
  const rctx = rim.getContext("2d");
  rctx.beginPath();
  rctx.rect(dx, dy, w * s, h * s);
  rctx.clip();
  drawGlow(rctx, white, { dx, dy, dw: w * s, dh: h * s }, outW);
  const r = OUTLINE.core * outW;
  for (let i = 0; i < OUTLINE.coreSteps; i += 1) {
    const a = (i / OUTLINE.coreSteps) * Math.PI * 2;
    rctx.drawImage(white, dx + Math.cos(a) * r, dy + Math.sin(a) * r, w * s, h * s);
  }
  ctx.globalAlpha = OUTLINE.alpha;
  ctx.drawImage(rim, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(cut, dx, dy, w * s, h * s);
  return layer;
}

/**
 * 往外淡出的白光。只要陰影、不要剪影本身：把剪影畫在畫布外面，
 * 再用 shadowOffset 把陰影拉回原位，畫布上就只剩模糊的那一圈。
 */
function drawGlow(ctx, white, { dx, dy, dw, dh }, outW) {
  const away = ctx.canvas.width + dw + 100;
  ctx.save();
  ctx.shadowColor = OUTLINE.glow;
  ctx.shadowBlur = OUTLINE.glowBlur * outW;
  ctx.shadowOffsetX = away;
  for (let i = 0; i < OUTLINE.glowPasses; i += 1) ctx.drawImage(white, dx - away, dy, dw, dh);
  ctx.restore();
}
