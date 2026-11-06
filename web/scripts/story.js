/** 存下來的那張圖：9:16 的限時動態尺寸，把網頁上的整個畫面一起帶走——
   銀色金屬底、粉紅點點球、拍貼機相紙，相紙裡才是 4:5 的合照。

   09-29 Jimmy 在手機上實測：原本只存 4:5 的合照，丟進 IG 限動之後
   銀底、點點、相紙框全部不見，只剩一張自拍。所以改成直接輸出整個畫面。

   結果圖只印品牌 Logo（在合照裡），不印帳號、網址、稀有度。 */
import { url } from "./layers.js";

export const STORY = Object.freeze({ width: 1080, height: 1920 });

/* 跟 CSS 背景用的是同兩張圖，所以不放進 layers.json */
const BRUSHED_SRC = "bg/brushed.png";
const HALO_SRC = "bg/halo.png";

/* 相紙。IG 限動的安全區是 y 155～1765，相紙放中間、上下各留一大塊
   給使用者自己打字和貼貼圖。 */
const PAPER = Object.freeze({
  width: 900,
  pad: 18,            // 相紙左右上的白邊
  foot: 66,           // 底下那條寫組合代號的白邊
  color: "#fcfcfb",
});

/* 跟 styles/metal.css 的 polished 同一組色標，網頁和存下來的圖要是同一塊金屬 */
const METAL_ANGLE_DEG = 174;
const METAL_STOPS = Object.freeze([
  [0, "#ffffff"], [0.06, "#f4f6f9"], [0.15, "#c8d0dc"], [0.23, "#fdfefe"],
  [0.33, "#aab3c2"], [0.41, "#eef1f5"], [0.50, "#929caf"], [0.57, "#e4e8ef"],
  [0.67, "#b6bfcd"], [0.76, "#fbfcfd"], [0.86, "#a9b2c1"], [0.94, "#eceff4"],
  [1, "#ffffff"],
]);
const BRUSHED_ALPHA = 0.35;

/* 點點球。對齊 styles/base.css 手機版的 .halo--a / .halo--b：
   size 是直徑佔畫面寬度的比例，cx/cy 是球心位置（可以在畫面外）。 */
const HALOS = Object.freeze([
  { size: 1.2, cx: 0.02, cy: 0.98, glow: [0.72, 0.28], alpha: 1 },
  { size: 0.66, cx: 1.0, cy: 0.02, glow: [0.25, 0.75], alpha: 0.8 },
]);
/* 比 CSS 靜態版濃：網頁上的點點球是 halo-shading.js 即時畫的，受光面接近
   純桃紅、背光面化掉。存下來的圖要看起來跟網頁一樣，不是跟減少動態版一樣。 */
const HALO_GRADIENT = Object.freeze([
  [0, "rgba(255, 133, 196, .96)"],
  [0.42, "rgba(255, 133, 196, .78)"],
  [0.72, "rgba(182, 118, 155, .34)"],
  [1, "rgba(48, 56, 68, .04)"],
]);

const CAPTION = Object.freeze({
  font: '500 24px "Inter", "Noto Sans TC", sans-serif',
  color: "#9a9ba0",
  spacing: 0.2,        // em
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載不進來：${src}`));
    img.src = src;
  });
}

/** CSS linear-gradient 的角度換成 canvas 的起訖點（0deg 朝上、順時針）。 */
function cssLinear(ctx, deg, w, h) {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half,
    w / 2 + dx * half, h / 2 + dy * half);
}

function drawMetal(ctx, w, h, brushed) {
  const g = cssLinear(ctx, METAL_ANGLE_DEG, w, h);
  METAL_STOPS.forEach(([at, color]) => g.addColorStop(at, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 髮絲紋只是拿來打散大面積漸層的色帶，不是主角
  ctx.save();
  ctx.globalAlpha = BRUSHED_ALPHA;
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = ctx.createPattern(brushed, "repeat");
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** 點點球：先畫一塊粉紅漸層，再用 halo.png 的透明度當遮罩挖出點陣。 */
function drawHalo(ctx, mask, halo, w, h) {
  const d = Math.round(halo.size * w);
  const layer = document.createElement("canvas");
  layer.width = d;
  layer.height = d;
  const lc = layer.getContext("2d");
  const g = lc.createRadialGradient(d * halo.glow[0], d * halo.glow[1], 0,
    d * halo.glow[0], d * halo.glow[1], d);
  HALO_GRADIENT.forEach(([at, color]) => g.addColorStop(at, color));
  lc.fillStyle = g;
  lc.fillRect(0, 0, d, d);
  lc.globalCompositeOperation = "destination-in";
  lc.drawImage(mask, 0, 0, d, d);

  ctx.save();
  ctx.globalAlpha = halo.alpha;
  ctx.drawImage(layer, halo.cx * w - d / 2, halo.cy * h - d / 2);
  ctx.restore();
}

/** Safari 舊版的 canvas 沒有 letterSpacing，所以字距自己排。 */
function drawSpaced(ctx, text, cx, y) {
  const gap = parseFloat(CAPTION.font.match(/(\d+)px/)[1]) * CAPTION.spacing;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + gap;
  });
}

function drawPaper(ctx, photo, caption, w, h) {
  const innerW = PAPER.width - PAPER.pad * 2;
  const innerH = Math.round(innerW * (photo.height / photo.width));
  const paperH = PAPER.pad + innerH + PAPER.foot;
  const x = (w - PAPER.width) / 2;
  const y = Math.round((h - paperH) / 2);

  ctx.save();
  ctx.shadowColor = "rgba(14, 18, 26, .42)";
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 34;
  ctx.fillStyle = PAPER.color;
  ctx.fillRect(x, y, PAPER.width, paperH);
  ctx.restore();

  ctx.drawImage(photo, x + PAPER.pad, y + PAPER.pad, innerW, innerH);

  ctx.save();
  ctx.font = CAPTION.font;
  ctx.fillStyle = CAPTION.color;
  ctx.textBaseline = "middle";
  drawSpaced(ctx, caption, w / 2, y + PAPER.pad + innerH + PAPER.foot / 2);
  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} photo render.js 畫好的 4:5 合照
 * @param {string} caption 相紙底下的組合代號，例如 STAR · BALLPARK · CHEEK
 */
export async function renderStory(photo, caption) {
  const { width: w, height: h } = STORY;
  const [brushed, mask] = await Promise.all([
    loadImage(url(BRUSHED_SRC)),
    loadImage(url(HALO_SRC)),
    document.fonts?.load(CAPTION.font).catch(() => null),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  drawMetal(ctx, w, h, brushed);
  HALOS.forEach((halo) => drawHalo(ctx, mask, halo, w, h));
  drawPaper(ctx, photo, caption, w, h);
  return canvas;
}
