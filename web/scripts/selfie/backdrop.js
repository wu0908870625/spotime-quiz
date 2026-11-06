/** 換成原本照片的背景（10-06 Jimmy）：不去背、不換場景，照片本身裁成合照框的比例。
 *
 * 預設還是去背＋換場景，這是給「去背效果不好」或「想留原本場景」的人選的。
 * 裁切跟 cover 一樣：照片一定蓋滿整個框，不留白邊；臉放在跟去背版差不多的高度。
 * 回傳的 place 跟 geometry.placePerson() 同格式，所以貼點直接用 compose.spotsFor() 算。
 */

/* 臉中心放在框高的這個位置（去背版 PLACE.faceY 也是 0.44），裁不到的話就貼齊照片邊緣 */
const FACE_Y = 0.44;

/**
 * 照片放進合照框的比例與位移：框內座標 ＝ 原圖座標 × scale ＋ (x, y)。
 * @param faces analyze() 找到的臉（有 center）
 */
export function placeBackdrop(faces, imgW, imgH, frame) {
  const { width: FW, height: FH } = frame;
  const scale = Math.max(FW / imgW, FH / imgH);
  const cx = faces.length ? faces.reduce((n, f) => n + f.center.x, 0) / faces.length : imgW / 2;
  const cy = faces.length ? faces.reduce((n, f) => n + f.center.y, 0) / faces.length : imgH / 2;
  return Object.freeze({
    scale,
    x: within(FW / 2 - cx * scale, FW - imgW * scale),
    y: within(FACE_Y * FH - cy * scale, FH - imgH * scale),
  });
}

/** 位移夾在 [lo, 0]：照片的左（上）邊不能進到框裡，右（下）邊不能退出框外 */
function within(v, lo) {
  return Math.min(0, Math.max(lo, v));
}

/**
 * @param {HTMLCanvasElement} photo 分析用的那張照片
 * @param place placeBackdrop() 的結果
 * @param {number} outW 輸出寬度，高度照框的比例
 * @returns {HTMLCanvasElement} 整框大小、不透明
 */
export function backdropLayer(photo, place, frame, outW) {
  const k = outW / frame.width;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = Math.round(frame.height * k);
  const ctx = canvas.getContext("2d");
  const s = place.scale * k;
  ctx.drawImage(photo, place.x * k, place.y * k, photo.width * s, photo.height * s);
  return canvas;
}
