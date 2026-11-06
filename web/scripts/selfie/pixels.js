/** 照片品質的量測：亮度、清晰度、臉被擋住多少、背景雜不雜、脖子露出多少。
   吃的都是一維陣列（灰階、分類遮罩、信心值），不碰 canvas，node 也能測。

   分類遮罩的編號是 selfie_multiclass_256x256 的類別： */
export const CLASS = Object.freeze({
  background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, other: 5,
});

/** RGBA → 灰階（Rec.601），順便縮小，量測不需要原尺寸 */
export function toGray(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 1) {
    out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return out;
}

function clampBox(box, w, h) {
  return {
    x0: Math.max(0, Math.floor(box.x0)), y0: Math.max(0, Math.floor(box.y0)),
    x1: Math.min(w, Math.ceil(box.x1)), y1: Math.min(h, Math.ceil(box.y1)),
  };
}

/** 框內的平均亮度，0～255 */
export function meanIn(gray, w, h, box) {
  const b = clampBox(box, w, h);
  let sum = 0;
  let n = 0;
  for (let y = b.y0; y < b.y1; y += 1) {
    for (let x = b.x0; x < b.x1; x += 1) { sum += gray[y * w + x]; n += 1; }
  }
  return n ? sum / n : 0;
}

/**
 * 清晰度：拉普拉斯的變異數。越糊越低。
 * 取樣間距 step 讓不同解析度的臉量出來可以比較——呼叫端傳「臉寬 / 160」。
 */
export function sharpnessIn(gray, w, h, box, step = 1) {
  const b = clampBox(box, w, h);
  const s = Math.max(1, Math.round(step));
  const at = (x, y) => gray[y * w + x];
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = b.y0 + s; y < b.y1 - s; y += s) {
    for (let x = b.x0 + s; x < b.x1 - s; x += s) {
      const v = 4 * at(x, y) - at(x - s, y) - at(x + s, y) - at(x, y - s) - at(x, y + s);
      sum += v; sq += v * v; n += 1;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}

/** 射線法：點在不在多邊形裡 */
export function inPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y)
      && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 多邊形往中心縮一圈。臉的外框邊緣本來就會混到頭髮和脖子，不算遮擋。 */
export function shrink(poly, k) {
  const cx = poly.reduce((n, p) => n + p.x, 0) / poly.length;
  const cy = poly.reduce((n, p) => n + p.y, 0) / poly.length;
  return poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}

/**
 * 臉裡面有多少比例「不是臉」——被手（身體皮膚）、衣服、或背景擋住。
 * 頭髮（瀏海）和配件（眼鏡）不算，那是正常的自拍。
 */
export function occlusion(cat, w, h, poly, stride = 2) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const b = clampBox({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, w, h);
  let bad = 0;
  let n = 0;
  for (let y = b.y0; y < b.y1; y += stride) {
    for (let x = b.x0; x < b.x1; x += stride) {
      if (!inPolygon({ x, y }, poly)) continue;
      const c = cat[y * w + x];
      n += 1;
      if (c === CLASS.bodySkin || c === CLASS.clothes || c === CLASS.background) bad += 1;
    }
  }
  return n ? bad / n : 0;
}

/**
 * 背景雜不雜：去背時「分不清是人還是背景」的像素，佔人物面積的比例。
 * 背景單純時邊緣很俐落，這個值很低；背景跟頭髮衣服顏色接近時會飆高。
 */
export function edgeUncertainty(personConf, stride = 2) {
  let unsure = 0;
  let person = 0;
  for (let i = 0; i < personConf.length; i += stride) {
    const c = personConf[i];
    if (c > 0.5) person += 1;
    if (c > 0.12 && c < 0.88) unsure += 1;
  }
  return person ? unsure / person : 1;
}

/** 以 pt 為中心、半徑 r 的圓裡，有多少比例是指定的類別 */
export function classFraction(cat, w, h, pt, r, classes) {
  const N = 6;
  let hit = 0;
  let n = 0;
  for (let i = -N; i <= N; i += 1) {
    for (let j = -N; j <= N; j += 1) {
      if (i * i + j * j > N * N) continue;
      const x = Math.round(pt.x + (i / N) * r);
      const y = Math.round(pt.y + (j / N) * r);
      n += 1;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (classes.includes(cat[y * w + x])) hit += 1;
    }
  }
  return hit / n;
}

/* 貼片範圍內至少要有這麼多是露出來的皮膚，才算貼得上去 */
export const SKIN_MIN = 0.8;

/* 脖子的挑法：不是「離理想點最近」，是「四周露出最多皮膚」的那一塊。
   只看貼片本身的範圍不夠——貼在脖子和衣領的交界，貼片底下剛好都是皮膚，
   但旁邊緊貼著衣服，肉眼看起來就是貼在領口上（09-29 Jimmy 實測回報）。 */
const NECK = Object.freeze({
  room: 2.4,        // 在貼片半徑幾倍的範圍裡量「四周露出多少皮膚」
  near: 0.025,      // 每離理想點一個貼片半徑，扣這麼多分；只是用來在差不多的位置之間挑
});

/**
 * 脖子上找一塊露出來的皮膚。
 * 在下巴以下、左右各三成臉寬的範圍裡（再遠就是肩膀了），找四周皮膚最多的位置；
 * 左右兩側一視同仁，哪邊露比較多就貼哪邊。
 * 高領、頭髮、刺青（模型常把刺青判成衣服）都會被當成不能貼的地方。都找不到回 null，讓畫面問使用者要不要換位置。
 *
 * @param frame geometry.neckFrame() 的結果
 */
export function findNeck(cat, w, h, frame, r) {
  const skin = [CLASS.bodySkin];
  const ideals = [frame.ideal, frame.mirror ?? frame.ideal];
  const candidates = [...ideals];
  for (let t = 0.1; t <= 0.5; t += 0.04) {
    for (let s = -0.3; s <= 0.3; s += 0.05) candidates.push(frame.at(t, s));
  }
  let best = null;
  let bestScore = -Infinity;
  for (const pt of candidates) {
    if (classFraction(cat, w, h, pt, r, skin) < SKIN_MIN) continue;
    const room = classFraction(cat, w, h, pt, r * NECK.room, skin);
    const d = Math.min(...ideals.map((q) => Math.hypot(pt.x - q.x, pt.y - q.y))) / r;
    const score = room - NECK.near * d;
    if (score > bestScore) { bestScore = score; best = pt; }
  }
  return best;
}

/* 臉上的位置怎麼挑：貼片底下要是臉的皮膚，四周也要留一圈皮膚——
   只看貼片本身，會貼在瀏海或鬢角的邊上，看起來就是貼在頭髮上（09-29 Jimmy 實測回報）。 */
const FACE = Object.freeze({
  room: 2,          // 在貼片半徑幾倍的範圍裡量「四周露出多少皮膚」
  near: 0.05,       // 每離理想點一個貼片半徑扣的分。比脖子重：臉上的位置差一點就變成別的位置
});

/**
 * 臉頰／眼下／額角被頭髮、眼鏡蓋住時，在附近找一塊露出來的臉。
 * 理想點本身就夠乾淨的話，因為距離扣分最少，還是會選它。
 * @param search geometry.faceSearch() 的結果
 * @returns {{x,y}|null} 附近都是頭髮就回 null
 */
export function findFaceSpot(cat, w, h, search, r) {
  const skin = [CLASS.faceSkin];
  let best = null;
  let bestScore = -Infinity;
  for (const pt of search.candidates) {
    if (search.avoid.some((z) => inZone(pt, z, r))) continue;
    if (classFraction(cat, w, h, pt, r, skin) < SKIN_MIN) continue;
    const room = classFraction(cat, w, h, pt, r * FACE.room, skin);
    const d = Math.hypot(pt.x - search.ideal.x, pt.y - search.ideal.y) / r;
    const score = room - FACE.near * d;
    if (score > bestScore) { bestScore = score; best = pt; }
  }
  return best;
}

/** 半徑 r 的貼片有沒有碰到橢圓 z（眼睛、嘴巴）。橢圓兩軸各加 r，近似就夠了。 */
export function inZone(pt, z, r) {
  const dx = pt.x - z.x;
  const dy = pt.y - z.y;
  const c = Math.cos(-z.angle);
  const s = Math.sin(-z.angle);
  const u = dx * c - dy * s;
  const v = dx * s + dy * c;
  return (u / (z.a + r)) ** 2 + (v / (z.b + r)) ** 2 < 1;
}

/* 照片邊緣有超過這個比例是人，就算「人被這條邊切到」 */
const TOUCH_MIN = 0.12;

/**
 * 人被照片的哪幾條邊切到。被切到的那一邊，放進合照時一定要延伸到框外，
 * 不然會看到一條筆直的切邊，整個人像一張方形照片貼在場景上。
 * @returns {{top:boolean,bottom:boolean,left:boolean,right:boolean}}
 */
export function edgeTouch(personConf, w, h) {
  const rowFrac = (y) => {
    let n = 0;
    for (let x = 0; x < w; x += 1) if (personConf[y * w + x] > 0.5) n += 1;
    return n / w;
  };
  const colFrac = (x) => {
    let n = 0;
    for (let y = 0; y < h; y += 1) if (personConf[y * w + x] > 0.5) n += 1;
    return n / h;
  };
  return {
    top: rowFrac(0) > TOUCH_MIN,
    bottom: rowFrac(h - 1) > TOUCH_MIN,
    left: colFrac(0) > TOUCH_MIN,
    right: colFrac(w - 1) > TOUCH_MIN,
  };
}

/* 平切邊：人的下緣有這麼多欄停在差不多同一列（框高的 CUT_TOL 以內），就算一條被擋住的直線 */
const CUT_TOL = 0.015;
const CUT_SHARE = 0.3;     // 有人的那些欄裡，至少這麼多停在同一條線上
const CUT_MIN_W = 0.12;    // 而且這條線至少要佔照片寬度這麼多
const CUT_LOW = 0.4;       // 線要在照片下半部附近（上面的平邊不會是桌子）

/**
 * 人的下緣是不是被東西擋出一條水平直線（10-02 Jimmy：三個人坐在桌子後面，桌子去掉後
 * 人的下緣是一條平平的切線，放進場景就整排飄在半空中）。
 * 有的話回傳那一列（照片像素），放置時把它當成照片的底邊，推到框底；沒有回 null。
 * 照片底邊本來就被切到的情況交給 edgeTouch，這裡不管。
 */
export function bottomCut(personConf, w, h) {
  const lows = [];
  for (let x = 0; x < w; x += 1) {
    for (let y = h - 1; y >= 0; y -= 1) {
      if (personConf[y * w + x] > 0.5) {
        lows.push(y);
        break;
      }
    }
  }
  if (lows.length < w * CUT_MIN_W) return null;
  const sorted = [...lows].sort((a, b) => a - b);
  const tol = Math.max(1, Math.round(h * CUT_TOL));
  let best = { count: 0, y: -1 };
  for (let i = 0, j = 0; j < sorted.length; j += 1) {
    while (sorted[j] - sorted[i] > tol) i += 1;
    if (j - i + 1 > best.count) best = { count: j - i + 1, y: sorted[j] };
  }
  const enough = best.count >= Math.max(lows.length * CUT_SHARE, w * CUT_MIN_W);
  const low = best.y >= h * CUT_LOW && best.y < h - 1 - tol;
  return enough && low ? best.y : null;
}
