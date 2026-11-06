/** 存圖。
 *
 * 桌機用 <a download> 直接下載。手機不要用：iOS Safari／Chrome iOS 與部分
 * Android 瀏覽器會忽略 blob URL 上的 download 屬性，檔案會存成 blob 的 UUID、
 * 沒有副檔名，相簿看不到也打不開（2026-09-24 Jimmy 在手機上實際踩到）。
 * 手機一律改成整張圖鋪滿螢幕讓使用者長按儲存——存進去的是相簿，
 * 那本來就是要拿去發限動的地方。
 *
 * 09-30 Jimmy：能直接分享到 IG 限動更好，少一步存圖就少一分阻力。
 * 所以手機上先試系統分享面板（Web Share API，只帶圖檔——iOS 帶了文字或網址，
 * 有些 App 會收不到圖）。選 Instagram 之後可以直接選「限時動態」。
 * 不支援、或分享面板叫不出來，才退回長按存圖。使用者自己按取消就什麼都不做。
 *
 * 10-07 Jimmy 收到回報：安卓手機在 IG 裡打開，存不了圖。安卓 App 的內建瀏覽器（WebView）
 * 沒有分享面板，長按圖片也多半不會跳「下載圖片」，畫面卻寫著 iPhone 才有的「儲存到照片」。
 * 所以存圖畫面的說明照手機分三種寫：iPhone 長按儲存、安卓瀏覽器長按下載、安卓 App 裡請他截圖。
 */
import { toBlob } from "./render.js";

const FILENAME = "spotime-quiz.jpg";

/** 這些殼裡連 download 都不會觸發，只能長按。Barcelona＝Threads */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Barcelona|Line\/|Twitter|KAKAOTALK/i;
const TAG = "@spotimelab";

/** 存圖畫面上的說明和按鈕，照手機分三種 */
const OVERLAY_TEXT = Object.freeze({
  ios: { hint: `長按圖片 →「儲存到照片」，再到 IG 發限時動態，記得標註 ${TAG}`, ig: "存好了，打開 IG 限時動態" },
  android: { hint: `長按圖片 →「下載圖片」，再到 IG 發限時動態，記得標註 ${TAG}`, ig: "存好了，打開 IG 限時動態" },
  androidApp: { hint: `這個 App 存不了圖：同時按「電源鍵＋音量下」截圖，再到 IG 發限時動態，記得標註 ${TAG}`, ig: "截好了，打開 IG 限時動態" },
});

export function isAndroid(ua = navigator.userAgent) {
  return /Android/i.test(ua);
}

/** 安卓 App 裡的內建瀏覽器。WebView 的 UA 會帶「; wv)」，有些 App 拿掉了，再看 App 名字 */
export function isAndroidInApp(ua = navigator.userAgent) {
  return isAndroid(ua) && (/; wv\)/.test(ua) || IN_APP.test(ua));
}

export function overlayText(ua = navigator.userAgent) {
  if (isAndroidInApp(ua)) return OVERLAY_TEXT.androidApp;
  return isAndroid(ua) ? OVERLAY_TEXT.android : OVERLAY_TEXT.ios;
}

/** 手機／平板。用 UA 判斷會漏掉一堆殼，所以同時看指標型態。 */
function isHandheld() {
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return true;
  if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return true;  // iPadOS
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

/** 手機上能不能直接把這個檔案交給分享面板 */
function canShareFile(file) {
  if (!file || !isHandheld()) return false;
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function canDownload() {
  const a = document.createElement("a");
  if (!("download" in a)) return false;
  if (IN_APP.test(navigator.userAgent)) return false;
  return !isHandheld();
}

async function download(blob) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * @param behind 覆蓋層打開時要設成 inert 的頁面本體：底下的字和按鈕不能被點、也不會被讀出來
 */
export function createSaver({ overlay, overlayImg, closeBtn, behind = null }) {
  function hideOverlay() {
    overlay.classList.remove("is-on");
    if (behind) behind.inert = false;
  }

  closeBtn.addEventListener("click", hideOverlay);
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") hideOverlay(); });

  function showOverlay(src) {
    const text = overlayText();
    const hint = overlay.querySelector("p");
    const ig = overlay.querySelector(".saveover__ig");
    if (hint) hint.textContent = text.hint;
    if (ig) ig.textContent = text.ig;
    overlayImg.src = src;
    overlay.classList.add("is-on");
    if (behind) behind.inert = true;
    closeBtn.focus({ preventScroll: true });
  }

  /** @returns {Promise<"shared"|"cancelled"|"failed">} */
  async function share(file) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";      // 使用者自己取消
      console.warn("分享面板叫不出來，改用長按儲存", error);
      return "failed";
    }
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} dataUrl 已經算好的預覽圖
   * @param {File|null} file 已經轉好的圖檔。要事先轉好：分享面板只能在按下去的當下叫，等太久會被瀏覽器擋
   * @returns {Promise<"shared"|"cancelled"|"overlay"|"downloaded">}
   */
  async function save(canvas, dataUrl, file = null) {
    if (canShareFile(file)) {
      const result = await share(file);
      if (result !== "failed") return result;
    }
    if (!canDownload()) {
      showOverlay(dataUrl);
      return "overlay";
    }
    try {
      await download(await toBlob(canvas));
      return "downloaded";
    } catch (error) {
      console.warn("下載失敗，改用長按儲存", error);
      showOverlay(dataUrl);
      return "overlay";
    }
  }

  return { save, share, showOverlay, canShare: canShareFile };
}
