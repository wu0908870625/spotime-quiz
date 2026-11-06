/** 這一位訪客是從哪裡、用什麼裝置進來的。跟著作答與 email 一起送進試算表，
   之後才算得出「手機 vs 電腦」「IG 限動 vs LINE」各佔多少。

   純函式，參數都可以換掉，測試時不必真的開瀏覽器。 */

/** App 內建瀏覽器的 UA 特徵。順序有差：Threads 的 UA 裡也有 Instagram，要先比。 */
const APPS = Object.freeze([
  ["Threads", /Barcelona/i],
  ["Instagram", /Instagram/i],
  ["Facebook", /FBAN|FBAV|FB_IAB/i],
  ["LINE", /\bLine\//i],
  ["Messenger", /Messenger/i],
  ["TikTok", /musical_ly|BytedanceWebview|TikTok/i],
]);

const MAX_LEN = 40;

/** @returns {"手機"|"平板"|"電腦"} */
export function deviceOf(ua, touchPoints = 0, coarse = false) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "平板";
  if (/Macintosh/.test(ua) && touchPoints > 1) return "平板";          // iPadOS 會假裝是 Mac
  if (/iPhone|iPod|Android.*Mobile|Mobile Safari|Windows Phone/i.test(ua)) return "手機";
  return coarse ? "手機" : "電腦";
}

/** @returns {string} App 名稱；一般瀏覽器回「瀏覽器」 */
export function appOf(ua) {
  const hit = APPS.find(([, re]) => re.test(ua));
  return hit ? hit[0] : "瀏覽器";
}

/**
 * 流量來源。網址有 ?utm_source= 就用它（IG 限動連結要自己帶上），
 * 沒有就看是從哪個網域點過來的，都沒有才算「直接」。
 */
export function sourceOf(search, referrer, ownHost) {
  const utm = new URLSearchParams(search).get("utm_source");
  if (utm) return clip(utm.trim().toLowerCase());
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host && host !== ownHost) return clip(host);
  } catch {
    /* 沒有 referrer 或格式不對，當成直接進站 */
  }
  return "直接";
}

function clip(text) {
  return text.slice(0, MAX_LEN);
}

/** 讀一次當下瀏覽器的狀態。進站時算一次就好，換題不會變。 */
export function readContext(win = globalThis) {
  const ua = win.navigator?.userAgent ?? "";
  const coarse = typeof win.matchMedia === "function"
    && win.matchMedia("(pointer: coarse)").matches;
  return Object.freeze({
    device: deviceOf(ua, win.navigator?.maxTouchPoints ?? 0, coarse),
    app: appOf(ua),
    source: sourceOf(win.location?.search ?? "", win.document?.referrer ?? "", win.location?.hostname ?? ""),
  });
}
