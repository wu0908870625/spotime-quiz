/** 載入 MediaPipe 的兩個模型，在使用者的手機上分析照片。照片不會離開這台裝置。
 *
 * 實際傳輸約 23 MB（wasm 壓縮後 3.3 MB＋臉部 3.7 MB＋去背 16.4 MB），
 * 所以只有打開「換成我的自拍」才開始下載，一般做測驗的人完全不會載到。
 * 全部放在自己的網域（web/vendor、web/assets/models），不依賴 Google 的 CDN。
 */
import { describeFace } from "./geometry.js";

const BUNDLE = new URL("../../vendor/mediapipe/vision_bundle.mjs", import.meta.url).href;
const WASM_DIR = new URL("../../vendor/mediapipe/wasm", import.meta.url).href;
const FACE_MODEL = new URL("../../assets/models/face_landmarker.task", import.meta.url).href;
const SEG_MODEL = new URL("../../assets/models/selfie_multiclass_256x256.tflite", import.meta.url).href;

const MAX_FACES = 5;          // 多偵測一張，才知道「超過四個人」（check.js LIMITS.maxFaces）

/* 下載進度要有分母。串流讀到的是解壓後的位元組，所以用檔案原始大小。 */
const SIZES = Object.freeze({ wasm: 11756954, face: 3758596, seg: 16371837 });
const TOTAL = SIZES.wasm + SIZES.face + SIZES.seg;

let loading = null;
const listeners = new Set();
let received = 0;

/**
 * 只載一次，重複呼叫拿到同一個 Promise。失敗的話清掉，下次再按可以重試。
 * @param {(ratio:number)=>void} [onProgress] 0～1
 */
export function loadVision(onProgress) {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(received / TOTAL);
  }
  if (!loading) {
    received = 0;
    loading = create()
      .catch((error) => {
        loading = null;
        throw error;
      })
      .finally(() => listeners.clear());   // 載完（或失敗）就不再有進度，舊的回呼不用留著
  }
  return loading;
}

function report(bytes) {
  received += bytes;
  const ratio = Math.min(1, received / TOTAL);
  listeners.forEach((fn) => fn(ratio));
}

/** 邊下載邊回報進度，回傳整個檔案 */
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`辨識工具下載失敗（HTTP ${res.status}）：${url}`);
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    report(buf.length);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    report(value.length);
  }
  const out = new Uint8Array(size);
  let at = 0;
  chunks.forEach((c) => { out.set(c, at); at += c.length; });
  return out;
}

const WASM_FILE = "vision_wasm_internal.wasm";

async function create() {
  // wasm 自己抓一次（才算得出進度），再用 blob 網址交給 MediaPipe。
  // 不能指望「第二次走快取」：assets 是 max-age=0，實測兩個模型各自又完整下載一次，
  // 同一個 3.3 MB 抓了三遍（09-29 量到）。
  const [lib, wasm, faceModel, segModel] = await Promise.all([
    import(BUNDLE),
    download(`${WASM_DIR}/${WASM_FILE}`),
    download(FACE_MODEL),
    download(SEG_MODEL),
  ]);
  const { FilesetResolver, FaceLandmarker, ImageSegmenter } = lib;
  const resolved = await FilesetResolver.forVisionTasks(WASM_DIR);
  // 不支援 SIMD 的舊手機會拿到 nosimd 版，那就照 MediaPipe 原本的路徑載
  const fileset = resolved.wasmBinaryPath.endsWith(WASM_FILE)
    ? { ...resolved, wasmBinaryPath: URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })) }
    : resolved;
  // 兩個模型一個一個建（10-02 盲測：同時建偶爾會撞在一起，跳「ModuleFactory not set」→ 顯示下載失敗）。
  // MediaPipe 建模型時會在全域掛一個載入器，兩個同時建的話第二個可能拿到被清掉的那個。慢不到 0.1 秒
  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: faceModel },
    runningMode: "IMAGE",
    numFaces: MAX_FACES,
    outputFacialTransformationMatrixes: true,
  });
  const segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: segModel },
    runningMode: "IMAGE",
    outputCategoryMask: true,
    outputConfidenceMasks: true,
  });
  return { face, segmenter };
}

/* 臉佔滿整張照片的超近自拍，偵測器會找不到（它是為「臉在畫面中間一塊」訓練的）。
   找不到就在四周補灰邊再找一次，座標再換回原圖。 */
const PAD = 0.4;

function detectFaces(face, canvas) {
  const first = face.detect(canvas);
  if (first.faceLandmarks.length) return first;
  const { width: w, height: h } = canvas;
  const px = Math.round(w * PAD);
  const py = Math.round(h * PAD);
  const padded = document.createElement("canvas");
  padded.width = w + px * 2;
  padded.height = h + py * 2;
  const ctx = padded.getContext("2d");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, padded.width, padded.height);
  ctx.drawImage(canvas, px, py);
  const again = face.detect(padded);
  const back = (p) => ({ ...p, x: (p.x * padded.width - px) / w, y: (p.y * padded.height - py) / h });
  return {
    faceLandmarks: again.faceLandmarks.map((lm) => lm.map(back)),
    facialTransformationMatrixes: again.facialTransformationMatrixes,
  };
}

/* 10-02 Jimmy：三人自拍只偵測到一個人。偵測器先把整張縮到 128×128 才找臉，
   合照裡後排的臉相對整張照片比較小，縮完只剩幾個像素就漏掉了，只剩最大那張。
   所以整張找完，再切幾塊（四個角＋中間，各佔 60%）放大各找一次，座標換回原圖、跟已經找到的去重。
   第一層 60% 的塊還漏的話（臉寬不到原圖一成），再用 40% 的塊（3×3）找一輪。 */
const TILE_LEVELS = Object.freeze([
  { size: 0.6, origins: [[0, 0], [0.4, 0], [0, 0.4], [0.4, 0.4], [0.2, 0.2]] },
  { size: 0.4, origins: [0, 0.3, 0.6].flatMap((y) => [0, 0.3, 0.6].map((x) => [x, y])) },
]);
const SAME_FACE = 0.5;        // 兩張臉的中心距離小於臉寬的一半＝同一張
const MIN_FACE_RATIO = 0.45;  // 比最大那張臉小這麼多的不算（遠處路人、手機殼上的卡通臉）

/** 一張臉的鼻尖附近當中心、外框寬當大小（只用來去重，正規化座標） */
function roughBox(lm) {
  const xs = lm.map((p) => p.x);
  const ys = lm.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  return { cx: (x0 + x1) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, w: x1 - x0 };
}

function detectInTiles(face, canvas, found) {
  const { width: w, height: h } = canvas;
  const faces = found.faceLandmarks.map((lm, i) => ({ lm, matrix: found.facialTransformationMatrixes?.[i] }));
  for (const level of TILE_LEVELS) addFromTiles(face, canvas, level, faces);
  const widest = Math.max(0, ...faces.map((f) => roughBox(f.lm).w));
  const kept = faces.filter((f) => roughBox(f.lm).w >= widest * MIN_FACE_RATIO);
  return {
    faceLandmarks: kept.map((f) => f.lm),
    facialTransformationMatrixes: kept.map((f) => f.matrix),
  };
}

/** 照 level 切塊各找一次，新找到的臉加進 faces（原地加，faces 是這次分析自己的暫存清單） */
function addFromTiles(face, canvas, level, faces) {
  const { width: w, height: h } = canvas;
  const tw = Math.round(w * level.size);
  const th = Math.round(h * level.size);
  const tile = document.createElement("canvas");
  tile.width = tw;
  tile.height = th;
  const ctx = tile.getContext("2d");
  for (const [ox, oy] of level.origins) {
    if (faces.length >= MAX_FACES) break;
    const sx = Math.round(w * ox);
    const sy = Math.round(h * oy);
    ctx.clearRect(0, 0, tw, th);
    ctx.drawImage(canvas, sx, sy, tw, th, 0, 0, tw, th);
    const got = face.detect(tile);
    got.faceLandmarks.forEach((lm, i) => {
      const back = lm.map((p) => ({ ...p, x: (p.x * tw + sx) / w, y: (p.y * th + sy) / h }));
      const b = roughBox(back);
      const dup = faces.some((f) => {
        const o = roughBox(f.lm);
        return Math.hypot((o.cx - b.cx) * w, (o.cy - b.cy) * h) < SAME_FACE * Math.max(o.w, b.w) * w;
      });
      if (!dup && faces.length < MAX_FACES) faces.push({ lm: back, matrix: got.facialTransformationMatrixes?.[i] });
    });
  }
}

/**
 * @param {HTMLCanvasElement} canvas 已經縮到合理尺寸的照片
 * @returns {{faces, cat:Uint8Array, person:Float32Array, width:number, height:number}}
 */
export async function analyze(canvas) {
  const { face, segmenter } = await loadVision();
  const { width, height } = canvas;

  const found = detectInTiles(face, canvas, detectFaces(face, canvas));
  const faces = found.faceLandmarks.map((lm, i) =>
    describeFace(lm, found.facialTransformationMatrixes?.[i]?.data ?? null, width, height));

  const seg = segmenter.segment(canvas);
  try {
    const cat = seg.categoryMask.getAsUint8Array().slice();
    // 類別 0 是背景，1 減掉它就是「這裡是人」的信心值
    const bg = seg.confidenceMasks[0].getAsFloat32Array();
    const person = new Float32Array(bg.length);
    for (let i = 0; i < bg.length; i += 1) person[i] = 1 - bg[i];
    return {
      faces: faces.sort((a, b) => a.center.x - b.center.x),   // 左到右
      cat,
      person,
      width: seg.categoryMask.width,
      height: seg.categoryMask.height,
    };
  } finally {
    seg.close();
  }
}
