/** 點陣帶的幾何。球是「轉」，帶是「流」——液態變形放在帶上才不會把形狀弄壞，
   這是 Jimmy 的判斷：要不規則的形變，就不該挑一個以「規則」為賣點的形狀。

   帶子＝一條 3D 中心曲線 ＋ 沿線扭轉的寬度方向。中心線只跟 u 有關，
   所以每幀先算 NU 組「座標框」，再對 v 展開——三角函數一幀只算 NU 次。 */

import { DOT, SPACING as SPHERE_SPACING } from "./halo-geometry.js";

/** 點間距。取樣數與點半徑都從這個值導出，點半徑沿用球的
   「半徑 ÷ 間距」比，所以顆粒看起來還是同一家的網點。
   帶子取球的 0.65 倍：形變要讀得出來就需要比球更細的取樣，
   但再細下去就變成沙子，那是別人的風格不是 SPOTIME 的。 */
const SPACING = 0.036;

const LEN = 1.0;                // 半長
const HALF_W = 0.42;            // 半寬
const BEND_Y = 0.20;            // 中心線上下彎幅
const BEND_Z = 0.18;            // 中心線前後彎幅
const BEND_Y_SPEED = 0.30;
const BEND_Z_SPEED = 0.22;
const TWIST = 1.5;              // 從一端到另一端總共扭幾弧度。扭太多，露出的一小段就看不出是一條帶
const TWIST_SPEED = 0.17;

export const NU = Math.round((2 * LEN) / SPACING) + 1;      // 沿長度取樣數
export const NV = Math.round((2 * HALF_W) / SPACING) + 1;   // 跨寬度取樣數
export const FRAME_STRIDE = 12; // 每組座標框存 C(3) T(3) W(3) 面法線(3)
export const RIBBON_DOT = (DOT / SPHERE_SPACING) * SPACING; // 點半徑，特徵半徑的倍數

const MOBILE_MAX_WIDTH = 879;

/** 帶子擺在哪。球用 corner + bleed 就夠（圓的，四面一樣），
   帶子不對稱，所以直接寫錨點佔視窗寬高的比例，負值代表在畫面外。
   軸線從左邊緣斜切進來往右上走，露出的是中段一截。 */
const LAYOUT = {
  desktop: { x: -0.09, y: 0.86, radius: 58, roll: 26, opacity: 0.90 },
  mobile: { x: -0.18, y: 0.76, radius: 62, roll: 30, opacity: 0.70 },
};

/** 規則網格會看到摩爾紋，所以每個點沿長寬各偏移不到半格。
   固定種子，每次重整看到的顆粒分佈都一樣。 */
export function buildRibbonPoints(seed = 7311) {
  const stepU = (2 * LEN) / (NU - 1);
  const stepV = 2 / (NV - 1);
  const iu = new Uint16Array(NU * NV);
  const du = new Float32Array(NU * NV);
  const vv = new Float32Array(NU * NV);

  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296 - 0.5;            // -0.5 ~ 0.5
  };

  let at = 0;
  for (let i = 0; i < NU; i += 1) {
    for (let j = 0; j < NV; j += 1) {
      iu[at] = i;
      du[at] = rand() * stepU;
      vv[at] = -1 + j * stepV + rand() * stepV;
      at += 1;
    }
  }
  return { iu, du, v: vv, count: at };
}

export function createFrameBuffer() {
  return new Float32Array(NU * FRAME_STRIDE);
}

/** 逐幀重算 NU 組座標框，寫進 out。分開算是為了讓每點的部分只剩線性組合。 */
export function ribbonFrames(time, out) {
  for (let i = 0; i < NU; i += 1) {
    const u = -1 + (2 * i) / (NU - 1);
    const phaseY = Math.PI * u + time * BEND_Y_SPEED;
    const phaseZ = 1.6 * Math.PI * u - time * BEND_Z_SPEED;

    const cx = u * LEN;
    const cy = BEND_Y * Math.sin(phaseY);
    const cz = BEND_Z * Math.sin(phaseZ);

    // 切線＝中心線對 u 的微分，解析算，不要用差分
    let tx = LEN;
    let ty = BEND_Y * Math.PI * Math.cos(phaseY);
    let tz = BEND_Z * 1.6 * Math.PI * Math.cos(phaseZ);
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl; ty /= tl; tz /= tl;

    // 取一個垂直於切線的基底。up 用 (0,0,1)，跟切線不會平行（tx 恆正）
    const bl = Math.hypot(ty, tx) || 1;
    const bx = ty / bl;
    const by = -tx / bl;
    // 第二個基底＝切線 × 第一個基底（bz 為 0，所以式子可以收掉一項）
    const nx = -tz * by;
    const ny = tz * bx;
    const nz = tx * by - ty * bx;

    // 扭轉：寬度方向在這兩個基底之間旋轉，帶子因此會翻面
    const phi = TWIST * u + time * TWIST_SPEED;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    const wx = bx * cosP + nx * sinP;
    const wy = by * cosP + ny * sinP;
    const wz = nz * sinP;

    // 面法線＝切線 × 寬度方向，兩者都是單位且互相垂直，所以結果也是單位
    const fx = ty * wz - tz * wy;
    const fy = tz * wx - tx * wz;
    const fz = tx * wy - ty * wx;

    const at = i * FRAME_STRIDE;
    out[at] = cx; out[at + 1] = cy; out[at + 2] = cz;
    out[at + 3] = tx; out[at + 4] = ty; out[at + 5] = tz;
    out[at + 6] = wx * HALF_W; out[at + 7] = wy * HALF_W; out[at + 8] = wz * HALF_W;
    out[at + 9] = fx; out[at + 10] = fy; out[at + 11] = fz;
  }
}

export function placeRibbon(w, h) {
  const spec = w <= MOBILE_MAX_WIDTH ? LAYOUT.mobile : LAYOUT.desktop;
  return {
    cx: spec.x * w,
    cy: spec.y * h,
    r: (spec.radius * Math.min(w, h)) / 100,
    opacity: spec.opacity,
    roll: (spec.roll * Math.PI) / 180,
  };
}
