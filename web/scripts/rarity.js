/** 把「同組合有多少人」換成結果頁上的那兩行字。純函式，不碰 DOM、不打 API。 */
import {
  IMAGE_QUESTIONS,
  RARITY_LINES,
  RARITY_RARE_MAX,
  RARITY_TAGLINES,
} from "./config.js";

export const TOTAL_COMBOS = IMAGE_QUESTIONS.reduce((n, q) => n * q.options.length, 1);

/** 真實資料少於這個數就改用估計值。幾十筆算出來的百分比只是雜訊。 */
const MIN_SAMPLE = 300;

/**
 * 樣本不足時的估計值設定。
 * 同一個組合永遠落在同一個「基準值」附近，只在時段之間小幅漂移，
 * 所以重複測驗的人不會看到 1% 一下變 12%。
 */
const ESTIMATE = Object.freeze({
  min: 0.012,          // 估計值的下限
  max: 0.16,           // 上限。再高就不是好聽的數字了
  driftRatio: 0.12,    // 每個時段相對漂移 ±12%（是相對不是絕對，小數字才不會暴衝）
  bucketHours: 3,      // 換一次漂移的時距
});

/**
 * FNV-1a 加一段 avalanche。不是密碼學用途，但那段 avalanche 不能省：
 * 純 FNV-1a 只改最後一個字元時，差異集中在低位，除以 2^32 之後幾乎看不出來
 * （"key@101" 跟 "key@102" 會算出幾乎一樣的比例，時段漂移就等於沒有）。
 */
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad);
  h ^= h >>> 15;
  h = Math.imul(h, 0x735a2d97);
  h ^= h >>> 15;
  return h >>> 0;
}

/** hash 轉 0~1 的小數 */
function unit(text) {
  return hash32(text) / 0x100000000;
}

/**
 * 樣本不夠時用的估計比例。
 * 基準值只跟組合有關 → 同一組合永遠差不多、兩個人同時測會看到同一個數字；
 * 漂移只跟時段有關 → 數字看起來像活的，不像寫死的。
 * @param {string} comboKey
 * @param {number} nowMs
 * @returns {number} 0~1 的比例
 */
export function estimateRatio(comboKey, nowMs = Date.now()) {
  const base = ESTIMATE.min + unit(comboKey) * (ESTIMATE.max - ESTIMATE.min);
  const bucket = Math.floor(nowMs / (ESTIMATE.bucketHours * 3600_000));
  const drift = (unit(`${comboKey}@${bucket}`) - 0.5) * 2 * ESTIMATE.driftRatio;
  const ratio = base * (1 + drift);
  return Math.min(ESTIMATE.max, Math.max(ESTIMATE.min, ratio));
}

/** 一律一位小數：1.6% / 3.0% / 18.4%。
   10-02 盲測：以前 10% 以上取整數，同一個人重測一次看到「11%」又看到「3.0%」，像兩套系統；
   數字轉輪（fx.js spinLine）的位數也跟著跳，統一後轉輪永遠是「數字.數字」 */
export function percent(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 英文短句不綁稀有度，只避開上一次出現過的那句，重測才有新鮮感。 */
const LAST_TAGLINE_KEY = "spotime.lastTagline";

function readLastTagline() {
  try {
    return sessionStorage.getItem(LAST_TAGLINE_KEY);
  } catch {
    return null;   // 無痕模式讀不到，不影響功能
  }
}

function rememberTagline(tag) {
  try {
    sessionStorage.setItem(LAST_TAGLINE_KEY, tag);
  } catch {
    /* 存不進去就算了，頂多下一次可能重複 */
  }
}

export function pickTagline(pool = RARITY_TAGLINES.any) {
  if (pool.length === 0) return "";
  const last = readLastTagline();
  const choices = pool.length > 1 ? pool.filter((t) => t !== last) : pool;
  const tag = choices[Math.floor(Math.random() * choices.length)];
  rememberTagline(tag);
  return tag;
}

/**
 * @param {{total:number, same:number}|null} stats 後端資料，沒有就傳 null
 * @param {string} comboKey 估計值要靠它才穩定
 * @param {string} [mood] 只決定英文短句用哪一組，數字不看它
 * @returns {{ratio:number, line:string, tag:string, estimated:boolean}}
 */
export function verdict(stats, comboKey, nowMs = Date.now(), mood = null) {
  const enough = Boolean(stats)
    && Number.isFinite(stats.total)
    && Number.isFinite(stats.same)
    && stats.total >= MIN_SAMPLE
    && stats.same >= 0;

  // 真實比例要把「現在這個人」算進去：後端回的是他送出作答之前的數字。
  // 不加的話，第一個選某組合的人會看到「只有 0.0% 的人跟你選擇一樣」。
  const ratio = enough
    ? Math.min(1, (stats.same + 1) / (stats.total + 1))
    : estimateRatio(comboKey, nowMs);

  const say = ratio <= RARITY_RARE_MAX ? RARITY_LINES.rare : RARITY_LINES.normal;
  return {
    ratio,
    line: say(percent(ratio)),
    tag: pickTagline(RARITY_TAGLINES[mood] ?? RARITY_TAGLINES.any),
    estimated: !enough,
  };
}

/** 相紙上印的組合代號，例如 STAR · CONCERT · CHEEK。字由 config 決定。 */
export function comboLabel(answers) {
  return IMAGE_QUESTIONS
    .map((q) => q.options.find((o) => o.value === answers[q.key])?.code)
    .filter(Boolean)
    .join(" · ");
}

/** 統計用的組合鍵。照 QUESTIONS 的順序組，不靠物件的插入順序——
   使用者按上一題再重選時，插入順序會跟題序不一樣。 */
export function comboKey(answers) {
  return IMAGE_QUESTIONS.map((q) => answers[q.key] ?? "?").join("-");
}
