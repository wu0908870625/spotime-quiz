/** 去背邊緣修整（09-30 盲測：白邊一圈糊糊的、肩膀被切得很怪，換到亮背景更明顯）。
 *
 * 兩個問題、兩步：
 *   1. 遮罩太糊：模型在 256×256 上算，放大回原圖後邊緣是一團。
 *      用 guided filter 拿照片本身的明暗當參考，讓遮罩邊緣貼齊照片裡真正的輪廓。
 *   2. 邊緣帶著原本背景的顏色：半透明的像素是「人＋背景」混出來的，
 *      換到新場景就露出一圈舊背景色。把這些像素的顏色換成附近「確定是人」的像素的平均色。
 * 全部是對 typed array 的純計算，測試直接吃這支（tests/matte.test.mjs）。
 */

/** 每個像素周圍 (2r+1)² 方框的平均（邊界只算框在圖內的部分） */
export function boxMean(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x += 1) sum += src[row + x];
    for (let x = 0; x < w; x += 1) {
      const lo = x - r - 1;
      const hi = x + r;
      if (hi < w && x > 0) sum += src[row + hi];
      if (lo >= 0) sum -= src[row + lo];
      tmp[row + x] = sum / (Math.min(w - 1, hi) - Math.max(0, x - r) + 1);
    }
  }
  for (let x = 0; x < w; x += 1) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y += 1) sum += tmp[y * w + x];
    for (let y = 0; y < h; y += 1) {
      const lo = y - r - 1;
      const hi = y + r;
      if (hi < h && y > 0) sum += tmp[hi * w + x];
      if (lo >= 0) sum -= tmp[lo * w + x];
      out[y * w + x] = sum / (Math.min(h - 1, hi) - Math.max(0, y - r) + 1);
    }
  }
  return out;
}

/**
 * Guided filter（He et al. 2010）：輸出在每個小方框裡是參考圖 I 的線性函數，
 * 所以遮罩的邊會跟著 I 的邊走。eps 越小越貼 I 的邊，越大越接近單純模糊。
 * @param guide 參考圖（灰階 0–1）
 * @param mask 要修的遮罩（0–1）
 */
export function guidedFilter(guide, mask, w, h, r, eps) {
  const n = w * h;
  const ii = new Float32Array(n);
  const ip = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    ii[i] = guide[i] * guide[i];
    ip[i] = guide[i] * mask[i];
  }
  const mI = boxMean(guide, w, h, r);
  const mP = boxMean(mask, w, h, r);
  const mII = boxMean(ii, w, h, r);
  const mIP = boxMean(ip, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const varI = mII[i] - mI[i] * mI[i];
    const cov = mIP[i] - mI[i] * mP[i];
    a[i] = cov / (varI + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = boxMean(a, w, h, r);
  const mB = boxMean(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.min(1, Math.max(0, mA[i] * guide[i] + mB[i]));
  return out;
}

/**
 * 邊緣去色：alpha 沒到 solid 的像素，顏色往附近確定是人的像素平均色靠。
 * 越透明靠得越多（幾乎透明的像素本來就大半是背景色）。會回傳新的一份，不改原本的。
 * @param rgba 照片像素（Uint8ClampedArray，RGBA）
 * @param alpha 每個像素的不透明度（0–1）
 */
export function decontaminate(rgba, alpha, w, h, r, solid = 0.95) {
  const n = w * h;
  const wt = new Float32Array(n);
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i += 1) {
    const k = alpha[i] >= solid ? 1 : 0;
    wt[i] = k;
    for (let c = 0; c < 3; c += 1) ch[c][i] = rgba[i * 4 + c] * k;
  }
  const mW = boxMean(wt, w, h, r);
  const mC = ch.map((plane) => boxMean(plane, w, h, r));
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < n; i += 1) {
    const a = alpha[i];
    if (a >= solid || a <= 0 || mW[i] < 1e-3) continue;
    const keep = a * a;
    for (let c = 0; c < 3; c += 1) {
      const fg = mC[c][i] / mW[i];
      out[i * 4 + c] = Math.round(fg + (rgba[i * 4 + c] - fg) * keep);
    }
  }
  return out;
}

/**
 * 把人輪廓「裡面」變實心（09-30 盲測：伸出去自拍、糊掉的手臂模型沒把握，去背後變半透明、背景透出來）。
 * 看一個大方框裡的平均信心值：周圍大半都是人，就算這一格自己沒把握也當成人；邊緣附近平均值低，不受影響。
 * @param conf guided filter 修過、還沒過軟門檻的信心值
 * @returns 新的一份，每格取 max(自己, 周圍推出來的值)
 */
export function solidify(conf, w, h, r, { lo = 0.6, hi = 0.8 } = {}) {
  const around = boxMean(conf, w, h, r);
  const out = new Float32Array(conf.length);
  for (let i = 0; i < conf.length; i += 1) {
    const t = Math.min(1, Math.max(0, (around[i] - lo) / (hi - lo)));
    out[i] = Math.max(conf[i], t * t * (3 - 2 * t));
  }
  return out;
}

/**
 * 剪掉頭頂上細細的一條（10-02 盲測：男生頭頂上多一條白灰色的殘邊，是原照片的窗框被模型當成人，
 * 跟頭髮黏在一起，換場景也帶著走）。
 * 做法是形態學的「開運算」：先縮再脹，比 2r 還細的東西縮的時候就消失、脹回來也不會長回來；
 * 頭髮整團很寬，縮了再脹回來形狀幾乎不變。
 * 只動 yMax 以上（額頭最上緣再往上）：比 V 手勢、手指這種細的東西都在臉旁邊或下面，不會被剪掉。
 * @param conf 每個像素「是人」的信心值（0–1）
 * @returns 新的一份，被剪掉的地方是 0
 */
export function pruneSpikes(conf, w, h, r, yMax) {
  const rows = Math.max(0, Math.min(h, Math.floor(yMax)));
  if (r < 1 || rows === 0) return Float32Array.from(conf);
  const solid = Float32Array.from(conf, (v) => (v > 0.5 ? 1 : 0));
  const shrunk = boxMean(solid, w, h, r).map((v) => (v > 0.999 ? 1 : 0));
  const opened = boxMean(shrunk, w, h, r);
  const out = Float32Array.from(conf);
  for (let i = 0; i < rows * w; i += 1) {
    if (solid[i] && opened[i] < 1e-6) out[i] = 0;
  }
  return out;
}
