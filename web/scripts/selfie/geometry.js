/** 自拍照的幾何計算：臉的角度、大小、貼片位置、把人放進 1000×1250 的合照框。
   純函式，不碰 DOM，node --test 就能測。

   座標一律是「原圖像素」，最後才用 placePerson() 算出的比例換到合照框。
   MediaPipe 的 478 點索引：https://github.com/google-ai-edge/mediapipe
   （face_mesh 的 canonical 編號，iris 另外 10 點在 468～477）。
   「左／右」指的是照片上的左右，不是本人的左右。 */

export const LM = Object.freeze({
  edgeL: 234, edgeR: 454,      // 臉最寬處的兩側
  top: 10, chin: 152, nose: 1,
  eyeL: 33, eyeR: 263,         // 外眼角
  lidL: 145, lidR: 374,        // 下眼瞼
  cheekL: 50, cheekR: 280,
  templeL: 21, templeR: 251,   // 太陽穴、靠近髮際
  browL: 70, browR: 300,       // 眉尾上緣
  jawL: 172, jawR: 397,
  eyeInL: 133, eyeInR: 362,    // 內眼角
  mouthL: 61, mouthR: 291,
});

/** 臉的外框，算遮擋比例用 */
export const FACE_OVAL = Object.freeze([
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
]);

/* 貼片大小＝臉寬的幾成。現有合照是臉寬約 250px、貼片約 31px（≈0.124）；
   自拍的臉通常比合照裡的人大，貼片跟著變大就容易壓到衣服、頭髮，
   所以刻意比合照小一點（09-29 Jimmy 回報太大，0.13 → 0.105）。
   同一天晚上人物整個縮小（臉寬 31% → 22%），貼片跟著變小；盲測回報縮到限動大小像一顆痣，
   拉回 0.15（≈ 框寬 3.3%，跟預設合照的 3.1% 差不多） */
const STICKER_OF_FACE = 0.15;

/* 貼片本身的裝飾角度（照片左半邊的臉用這個，右半邊鏡像）。
   跟現有合照一樣帶一點歪，看起來才像手貼的，不是機器蓋章。 */
const TILT = Object.freeze({ cheek: 18, under_eye: -14, forehead_side: -28, neck: -10 });

/* 放進合照框時，臉要佔多寬、臉中心放在多高。
   09-29 晚 Jimmy 回報人物蓋掉六成以上的畫面，看不到場景：
   臉寬 31% → 22%（面積約剩一半），臉也放低一點，上方多留天空和場景。 */
export const PLACE = Object.freeze({
  oneFace: 0.22,        // 一個人：臉寬佔框寬
  twoFaces: 0.42,       // 兩個人：兩張臉的總寬佔框寬
  perExtraFace: 0.12,   // 三個人以上：每多一個人，總寬再多佔這麼多（不然臉會被縮得比兩人合照小很多）
  maxGroup: 0.66,       // 照上面兩條算出來的總寬，最多到這麼寬
  // 10-02 Jimmy（三人合照人物太小）：臉擠在一起時，三張臉的外框總寬才佔一半，每張臉只剩框寬 11–14%，
  // 是一個人時（22%）的一半。多人時每張臉平均至少要這麼寬；為了這條可以超過 maxGroup，
  // 但總寬不超過 maxSpan（兩邊至少還看得到一點場景）
  minGroupFace: 0.18,
  maxSpan: 0.9,
  faceY: 0.44,          // 臉中心的高度（框高的比例）
  maxFaceY: 0.66,       // 為了讓身體接到底邊，臉最多往下移到這裡（橫式近拍要移比較多）
});

const px = (lm, i, w, h) => ({ x: lm[i].x * w, y: lm[i].y * h });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** MediaPipe 的 4×4 轉換矩陣（column-major）→ 左右轉、上下抬、歪頭，單位度。 */
export function eulerFromMatrix(data) {
  const r = (i, j) => data[j * 4 + i];
  const deg = (v) => (v * 180) / Math.PI;
  return {
    yaw: deg(Math.atan2(-r(2, 0), Math.hypot(r(0, 0), r(1, 0)))),
    pitch: deg(Math.atan2(r(2, 1), r(2, 2))),
    roll: deg(Math.atan2(r(1, 0), r(0, 0))),
  };
}

/**
 * 一張臉的基本量。
 * @param {Array<{x:number,y:number}>} lm 0～1 的正規化座標
 * @param {number[]|null} matrix facialTransformationMatrixes[i].data
 */
export function describeFace(lm, matrix, w, h) {
  const p = (i) => px(lm, i, w, h);
  const xs = lm.map((q) => q.x * w);
  const ys = lm.map((q) => q.y * h);
  const box = {
    x0: Math.min(...xs), x1: Math.max(...xs),
    y0: Math.min(...ys), y1: Math.max(...ys),
  };
  const eyeL = p(LM.eyeL);
  const eyeR = p(LM.eyeR);
  const nose = p(LM.nose);
  const angles = matrix ? eulerFromMatrix(matrix) : { yaw: 0, pitch: 0, roll: 0 };
  return {
    lm,
    box,
    center: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 },
    width: dist(p(LM.edgeL), p(LM.edgeR)),
    height: dist(p(LM.top), p(LM.chin)),
    // 照片上的傾斜角：兩眼連線，順時針為正
    tilt: (Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) * 180) / Math.PI,
    yaw: angles.yaw,
    pitch: angles.pitch,
    // 臉轉向哪邊，露出比較多的那半邊就貼那邊
    side: dist(nose, p(LM.edgeL)) >= dist(nose, p(LM.edgeR)) ? "L" : "R",
  };
}

/** 臉上三個位置的理想點（原圖像素）。脖子要看遮罩，另外在 pixels.js 找。 */
export function faceSpot(face, position, w, h) {
  const p = (i) => px(face.lm, i, w, h);
  const L = face.side === "L";
  switch (position) {
    case "cheek":
      return lerp(p(L ? LM.cheekL : LM.cheekR), p(LM.nose), 0.08);
    case "under_eye":
      return lerp(p(L ? LM.lidL : LM.lidR), p(L ? LM.cheekL : LM.cheekR), 0.26);
    case "forehead_side":
      // 眉尾往太陽穴走一小段：再往外就是頭髮了
      return lerp(p(L ? LM.browL : LM.browR), p(L ? LM.templeL : LM.templeR), 0.35);
    default:
      return null;
  }
}

/* 臉上的位置被頭髮蓋住時，在理想點附近找替代位置的範圍（臉寬／臉高的比例）。
   往下多找一點：額角被瀏海蓋住時，最自然的替代是眼尾旁邊。 */
const SEARCH = Object.freeze({ x: 0.2, up: 0.12, down: 0.22, step: 0.04 });

/**
 * 臉上三個位置的搜尋範圍：理想點、附近的候選點，以及不能貼的地方（眼睛、嘴巴）。
 * 候選點沿著臉的方向排（臉歪了也跟著歪），交給 pixels.findFaceSpot() 挑。
 */
export function faceSearch(face, position, w, h) {
  const ideal = faceSpot(face, position, w, h);
  if (!ideal) return null;
  const p = (i) => px(face.lm, i, w, h);
  const top = p(LM.top);
  const chin = p(LM.chin);
  const len = dist(chin, top) || 1;
  const down = { x: (chin.x - top.x) / len, y: (chin.y - top.y) / len };
  const across = { x: -down.y, y: down.x };
  const candidates = [ideal];
  for (let v = -SEARCH.up; v <= SEARCH.down + 1e-9; v += SEARCH.step) {
    for (let u = -SEARCH.x; u <= SEARCH.x + 1e-9; u += SEARCH.step) {
      candidates.push({
        x: ideal.x + across.x * u * face.width + down.x * v * face.height,
        y: ideal.y + across.y * u * face.width + down.y * v * face.height,
      });
    }
  }
  // 眼睛、嘴巴是橢圓：沿著兩個角的連線是長軸
  const zone = (a, b, long, short) => {
    const pa = p(a);
    const pb = p(b);
    const span = dist(pa, pb);
    return {
      ...lerp(pa, pb, 0.5),
      a: span * long,
      b: span * short,
      angle: Math.atan2(pb.y - pa.y, pb.x - pa.x),
    };
  };
  const avoid = [
    zone(LM.eyeL, LM.eyeInL, 0.55, 0.28),
    zone(LM.eyeR, LM.eyeInR, 0.55, 0.28),
    zone(LM.mouthL, LM.mouthR, 0.6, 0.35),
  ];
  return { ideal, candidates, avoid };
}

/** 脖子的理想點與搜尋方向：從下巴往「臉的下方」延伸。 */
export function neckFrame(face, w, h) {
  const p = (i) => px(face.lm, i, w, h);
  const chin = p(LM.chin);
  const top = p(LM.top);
  const len = dist(chin, top) || 1;
  const down = { x: (chin.x - top.x) / len, y: (chin.y - top.y) / len };
  const across = { x: -down.y, y: down.x };            // 往照片右邊
  const sign = face.side === "L" ? -1 : 1;
  const at = (t, s) => ({
    x: chin.x + down.x * t * face.height + across.x * s * face.width,
    y: chin.y + down.y * t * face.height + across.y * s * face.width,
  });
  // 理想點在臉轉向的那一側；mirror 是另一側的同一個位置，另一側露比較多時就用它
  return { chin, at, ideal: at(0.24, 0.1 * sign), mirror: at(0.24, -0.1 * sign), sign };
}

export function stickerSize(face) {
  return face.width * STICKER_OF_FACE;
}

/** 貼片角度：跟著臉歪，再加一點裝飾角度（左右鏡像）。render.js 會以 -roll 旋轉。 */
export function stickerRoll(face, position) {
  const tilt = TILT[position] ?? 0;
  return -face.tilt + (face.side === "L" ? tilt : -tilt);
}

/**
 * 算出原圖放進合照框的比例與位移：框內座標 ＝ 原圖座標 × scale ＋ (x, y)。
 *
 * 1. 臉的大小先對齊現有合照（PLACE.oneFace / twoFaces）。
 * 2. 人被照片哪條邊切到（touch），那條邊就一定要推到框外——
 *    這一步可以把臉放得比理想大，因為一條筆直的切邊比臉大更難看。
 * 3. 沒被切到的邊不強求，人本來就是完整的剪影。
 *
 * @param {{top,bottom,left,right}} touch pixels.edgeTouch() 的結果
 */
export function placePerson(faces, imgW, imgH, frame, touch = { bottom: true }) {
  const { width: FW, height: FH } = frame;
  const x0 = Math.min(...faces.map((f) => f.box.x0));
  const x1 = Math.max(...faces.map((f) => f.box.x1));
  const cx = faces.reduce((n, f) => n + f.center.x, 0) / faces.length;
  const cy = faces.reduce((n, f) => n + f.center.y, 0) / faces.length;
  const span = faces.length > 1 ? x1 - x0 : faces[0].width;
  const group = Math.min(PLACE.maxGroup, PLACE.twoFaces + PLACE.perExtraFace * Math.max(0, faces.length - 2));
  const target = (faces.length > 1 ? group : PLACE.oneFace) * FW;

  let scale = target / span;
  if (faces.length > 1) {
    const meanFace = faces.reduce((n, f) => n + f.width, 0) / faces.length;
    scale = Math.min(Math.max(scale, (PLACE.minGroupFace * FW) / meanFace), (PLACE.maxSpan * FW) / span);
  }
  // 左右被切到：照片要比框寬
  if (touch.left || touch.right) scale = Math.max(scale, FW / imgW);
  // 上下都被切到：照片要比框高
  if (touch.top && touch.bottom) scale = Math.max(scale, FH / imgH);

  // 臉中心的高度：底邊被切到就往下移、不夠再放大，直到接到框底；頂邊被切到就要頂到框頂
  let faceY = PLACE.faceY * FH;
  const above = cy;
  const below = imgH - cy;
  if (touch.bottom && faceY + below * scale < FH) {
    faceY = Math.min(PLACE.maxFaceY * FH, FH - below * scale);
    if (faceY + below * scale < FH) scale = (FH - faceY) / below;
  }
  // 頂邊被切到：臉往上移到照片頂端貼齊框頂。上下都被切到時 scale 已經 ≥ 框高/照片高，
  // 所以往上移之後底邊仍然接得到框底。
  if (touch.top) faceY = Math.min(faceY, above * scale);

  const x = clamp(FW / 2 - cx * scale, FW - imgW * scale, 0, touch);
  const y = faceY - cy * scale;
  return {
    scale,
    x,
    y,
    faceShare: (span * scale) / FW,
    reachesBottom: y + imgH * scale >= FH - 1,
  };
}

/**
 * 水平位移。lo 是「右邊切齊框右緣」、hi 是「左邊切齊框左緣」。
 * 照片比框寬（lo < hi）：夾在兩者之間，兩邊都不露切邊。
 * 照片比框窄：只顧被切到的那一邊，都沒被切到就維持置中。
 */
function clamp(v, lo, hi, touch = {}) {
  if (lo <= hi) return Math.min(hi, Math.max(lo, v));
  if (touch.left && !touch.right) return Math.min(v, hi);
  if (touch.right && !touch.left) return Math.max(v, lo);
  return v;
}

/** 原圖座標 → 合照框的正規化座標（render.js 的貼點格式：x 以框寬、y 以框高為 1） */
export function toFrame(pt, place, frame) {
  return {
    x: (pt.x * place.scale + place.x) / frame.width,
    y: (pt.y * place.scale + place.y) / frame.height,
  };
}
