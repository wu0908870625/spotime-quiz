/** 點陣球的幾何：球面上怎麼取點、兩顆球擺在畫面的哪裡。
   繪製與動畫在 halo-canvas.js，這裡只管「不會動的那一半」。 */

/* 長度單位一律是「球半徑的倍數」，跟實際像素無關。
   數值沿用 tools/make_halo.py：SPACING 34 / DOT 9.6，在半徑 550 的圖上量出來的比例。 */
export const SPACING = 0.0618;        // 點沿球面的間距
export const DOT = 0.01745;           // 正對鏡頭時的點半徑
export const DOT_MIN_RATIO = 0.30;    // 球緣的點縮到多小（透視壓縮）
export const TILT = (-24 * Math.PI) / 180;

const MOBILE_MAX_WIDTH = 879;

/** 球心要落在畫面外多遠，用半徑的倍數表示。

   09-24 修正：原本抓 bleed 0.32（露出約 18%），但 Jimmy 拿海報比對後確認
   Guideline 露得比這多——真正在做「不完整」這件事的是**邊緣的點會縮小**，
   不是把球藏起來。所以主球的球心直接放在畫面角上（bleed 0，剛好露四分之一），
   靠 halo-sphere.js 的 RIM 收邊去化開，不再靠裁切。 */
const LAYOUT = {
  desktop: {
    a: { corner: "bottom-left", radius: 58, bleed: 0.0, opacity: 0.92, roll: 0 },
    b: { corner: "top-right", radius: 34, bleed: 0.12, opacity: 0.55, roll: 150 },
  },
  mobile: {
    a: { corner: "bottom-left", radius: 54, bleed: 0.06, opacity: 0.70, roll: 0 },
    b: { corner: "top-right", radius: 28, bleed: 0.15, opacity: 0.42, roll: 150 },
  },
};

/** 球面上大致等距的點。每條緯線的點數隨 cos(緯度) 遞減，
   經緯兩個方向的間距都用同一個 SPACING 算，不然疏密會對不上。

   存的是 sin/cos 而不是角度：自轉只是把經度加上一個角，
   用和角公式就能推出來，每幀的迴圈裡就不必再呼叫三角函數。
   @returns {Float32Array} 每點四個值：sinLat, ring(=cosLat), sinLon, cosLon */
export function buildPoints() {
  const out = [];
  const rows = Math.max(3, Math.round(Math.PI / SPACING));
  for (let i = 0; i <= rows; i += 1) {
    const lat = -Math.PI / 2 + (Math.PI * i) / rows;
    const ring = Math.cos(lat);
    if (ring <= 1e-3) continue;
    const count = Math.max(1, Math.round((2 * Math.PI * ring) / SPACING));
    for (let k = 0; k < count; k += 1) {
      const lon = (2 * Math.PI * k) / count;
      out.push(Math.sin(lat), ring, Math.sin(lon), Math.cos(lon));
    }
  }
  return Float32Array.from(out);
}

/** 依畫面尺寸算出兩顆球的球心與半徑（CSS px）。 */
export function placeSpheres(w, h) {
  const vmin = Math.min(w, h) / 100;
  const set = w <= MOBILE_MAX_WIDTH ? LAYOUT.mobile : LAYOUT.desktop;
  return [toSphere(set.a, w, h, vmin), toSphere(set.b, w, h, vmin)];
}

function toSphere(spec, w, h, vmin) {
  const r = spec.radius * vmin;
  const out = spec.bleed * r;                 // 球心退到畫面外的距離
  const [vertical, horizontal] = spec.corner.split("-");
  return {
    cx: horizontal === "left" ? -out : w + out,
    cy: vertical === "top" ? -out : h + out,
    r,
    opacity: spec.opacity,
    // 轉光源而不是轉畫布：受光面朝畫面內側，座標系統維持不變，
    // 點擊擾動才不用再做一次反變換。
    lightRoll: (spec.roll * Math.PI) / 180,
  };
}
