/** 明暗、配色、批次填色。點陣球（halo-sphere.js）與點陣帶（halo-ribbon.js）共用。

   除了兩個端點顏色以外，這裡最重要的是 halftone：Guideline 的點點圖不是
   「同樣大小的點換顏色」，是「點的大小跟著明暗變」——背光側的點小到化掉，
   球的輪廓因此不完整。Jimmy 指出的「邊邊做暗部或透明處理」就是這件事。 */

/** 受光面與背光面的顏色。桃紅直接畫在點上，不疊色——銀底夠亮，疊色只會髒。 */
const LIT = [255, 133, 196];
const DARK = [48, 56, 68];

const ALPHA_MAX = 0.88;
const ALPHA_MIN_SOFT = 0.03;   // 化開模式：暗部幾乎不存在
const ALPHA_MIN_FLAT = 0.26;   // 舊的均勻模式，留著當對照組

const AMBIENT = 0.05;
const GAMMA = 0.88;

/** 把亮度分成幾階。同一階的點併成一條 path 一次填色，
   不然三千多個點各自 fillStyle，光是改狀態就把主執行緒吃掉。 */
export const SHADE_STEPS = 14;

/** 暗處的點縮到 (1 - HALFTONE)。0 就是所有點一樣大。 */
const HALFTONE = 0.62;

/** 小於這個像素半徑畫了也看不到，直接跳過省一次 arc()。 */
const MIN_VISIBLE_DOT = 0.12;

const CHROME_SPEED = 0.06;     // 光源漂移速度，噪聲取樣用
const CHROME_SWING = 0.85;     // 高光橫向擺幅

/** 兩組配色：soft 是化開版，flat 是舊的均勻版。
   demo 頁靠切換這兩組讓人直接看出差別。 */
export function buildPalettes() {
  return { soft: palette(ALPHA_MIN_SOFT, true), flat: palette(ALPHA_MIN_FLAT, false) };
}

function palette(alphaMin, soft) {
  const out = [];
  for (let i = 0; i < SHADE_STEPS; i += 1) {
    const s = i / (SHADE_STEPS - 1);
    const r = Math.round(DARK[0] + (LIT[0] - DARK[0]) * s);
    const g = Math.round(DARK[1] + (LIT[1] - DARK[1]) * s);
    const b = Math.round(DARK[2] + (LIT[2] - DARK[2]) * s);
    // 化開模式的 alpha 走 s²：暗的那半要掉得比顏色快，才會真的化掉而不是變一片灰點
    const curve = soft ? s * s : s;
    const a = alphaMin + (ALPHA_MAX - alphaMin) * curve;
    out.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
  }
  return out;
}

/** 每階一組座標緩衝區。這裡刻意用可變陣列逐幀覆寫：一秒 60 次、每次上千個點，
   配新陣列的 GC 成本會直接吃掉幀，是少數該讓步的熱路徑。 */
export function createBuckets(capacity) {
  return Array.from({ length: SHADE_STEPS }, () => ({
    xyr: new Float32Array(capacity * 3),
    n: 0,
  }));
}

export function resetBuckets(buckets) {
  for (const bucket of buckets) bucket.n = 0;
}

export function pushDot(buckets, lum, x, y, radius) {
  if (radius < MIN_VISIBLE_DOT) return;
  const step = Math.min(SHADE_STEPS - 1, Math.max(0, Math.round(lum * (SHADE_STEPS - 1))));
  const bucket = buckets[step];
  const at = bucket.n * 3;
  if (at + 2 >= bucket.xyr.length) return;      // 滿了就丟，畫面上看不出來
  bucket.xyr[at] = x;
  bucket.xyr[at + 1] = y;
  bucket.xyr[at + 2] = radius;
  bucket.n += 1;
}

export function flushBuckets(ctx, buckets, palette, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;
  for (let s = 0; s < buckets.length; s += 1) {
    const bucket = buckets[s];
    if (!bucket.n) continue;
    ctx.beginPath();
    for (let k = 0; k < bucket.n; k += 1) {
      const at = k * 3;
      const x = bucket.xyr[at];
      const y = bucket.xyr[at + 1];
      const radius = bucket.xyr[at + 2];
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fillStyle = palette[s];
    ctx.fill();
  }
  ctx.restore();
}

/** 表面亮度 → 0–1 的明暗值。glow 是波帶／點擊擾動額外加的光。 */
export function luminance(shade, glow) {
  const base = Math.pow(AMBIENT + (1 - AMBIENT) * Math.max(0, shade), GAMMA);
  return Math.min(1, base + glow);
}

/** 點的大小跟著明暗走。關掉化開模式時一律原尺寸。 */
export function halftoneScale(lum, soft) {
  return soft ? 1 - HALFTONE + HALFTONE * lum : 1;
}

/** 光源方向。time 為 null 就是固定光（跟靜態 PNG 同一個方向）；
   給了時間就沿噪聲路徑漂移，高光在表面上游走。 */
export function lightVector(time, roll, noise3) {
  let x = -0.34;
  let y = 0.52;
  const z = 0.78;
  if (time !== null) {
    x = noise3(time * CHROME_SPEED, 11.3, 0) * CHROME_SWING;
    y = 0.42 + noise3(0, time * CHROME_SPEED * 0.9, 7.1) * 0.28;
  }
  const len = Math.hypot(x, y, z);
  const nx = x / len;
  const ny = y / len;
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  return { x: nx * cos - ny * sin, y: nx * sin + ny * cos, z: z / len };
}
