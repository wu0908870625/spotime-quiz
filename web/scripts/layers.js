/** 讀取 tools/export_web.py 產生的圖層清單，並在進場時把圖先載好。 */
const MANIFEST_URL = "assets/layers.json";
const BASE = "assets/";

const REQUIRED = ["frame", "order", "scenes", "stickers", "points", "camera"];

function validate(manifest) {
  for (const key of REQUIRED) {
    if (!(key in manifest)) throw new Error(`layers.json 缺少 ${key}`);
  }
  for (const key of manifest.order) {
    const scene = manifest.scenes[key];
    if (!scene?.plate) throw new Error(`場景 ${key} 沒有背景圖`);
  }
  for (const who of ["W", "M"]) {
    const at = manifest.points[who]?.at;
    if (!at) throw new Error(`貼點缺少 ${who}`);
    for (const [name, spot] of Object.entries(at)) {
      // 角度是每個位置各一個值，缺了會整枚貼片轉錯方向，所以在這裡就擋掉
      if (!Array.isArray(spot?.xy) || typeof spot?.roll !== "number") {
        throw new Error(`貼點 ${who}.${name} 缺少 xy 或 roll`);
      }
    }
  }
  return manifest;
}

export async function loadManifest() {
  const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`讀不到圖層清單（HTTP ${res.status}）`);
  return validate(await res.json());
}

export function url(path) {
  return BASE + path;
}

/** 單張圖的載入上限。沒有這道保險的話，只要有一個請求卡住不回
   （例如預覽伺服器在載到一半時被關掉），整個讀取畫面就會永遠轉下去。 */
const IMAGE_TIMEOUT_MS = 8000;

/** 每張圖只載一次：同一個網址第二次問就拿同一個 promise。載失敗或逾時也算「好了」，
   讓畫面照樣往下走（img 自己會再試著顯示）。 */
const loading = new Map();
const loaded = new Set();

function preloadOne(path) {
  if (loading.has(path)) return loading.get(path);
  const job = new Promise((resolve) => {
    const img = new Image();
    const done = () => { loaded.add(path); resolve(path); };
    const timer = setTimeout(done, IMAGE_TIMEOUT_MS);
    img.onload = img.onerror = () => { clearTimeout(timer); done(); };
    img.src = url(path);
  });
  loading.set(path, job);
  return job;
}

/** 這張圖載好了沒（同步問，給「已經有了就馬上換」用） */
export function isLoaded(path) {
  return loaded.has(path);
}

/** 等這張圖載好；還沒開始載就現在開始 */
export function whenLoaded(path) {
  return preloadOne(path);
}

/** 背景先載，不等。一張接一張，才不會跟使用者眼前要用的圖搶頻寬。 */
export async function warm(paths) {
  for (const path of paths.filter(Boolean)) await preloadOne(path);
}

/** 讀取畫面只等開場用得到的圖：待機合照、題目的四枚貼片、logo（約 290 KB）。
   10-06 以前是連四個場景一起等（約 1.5 MB）；場景要到第 3 題才用到，
   改成讀取畫面結束後在背景載（scenePlates / scenePersons + warm）。
   萬一使用者答得比背景載還快，preview.js 會等背景和人物都到了才一起換上，不會只出現一半。 */
export function preload(manifest) {
  const all = [
    manifest.idle?.person,
    ...Object.values(manifest.stickers).filter((s) => !s.hidden).map((s) => s.src),   // 隱藏款到修圖才用得到，不讓讀取畫面等它
    manifest.logo?.wordmark,
  ].filter(Boolean);
  return Promise.all(all.map(preloadOne));
}

export function scenePlates(manifest) {
  return manifest.order.map((k) => manifest.scenes[k].plate);
}

/** 內建合照在各場景打好光的人物層。用自拍的人用不到，所以分開載（每張約 150 KB）。 */
export function scenePersons(manifest) {
  return manifest.order.map((k) => manifest.scenes[k].person);
}
