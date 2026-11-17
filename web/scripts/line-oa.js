/** 結果頁的「加入 LINE 好友」（11-13 Jimmy；11-17 email 備案拿掉，只留這顆）。
 *
 * 按 LINE 鈕只記一步漏斗（"line"），不攔連結：手機會直接喚起 LINE App，電腦開新分頁顯示 QR code。
 * 按下去當下就送出：電腦版如果開成新視窗、原頁沒切到背景，等 visibilitychange 會漏記。
 * 同一個分頁只記一次（funnel.js 去重），所以試算表上的數字是「按過的人數」，不是按的次數。
 */
import { LINE_OA_URL } from "./config.js";
import { track, flush } from "./funnel.js";

export function createLineOa({ link }) {
  link.href = LINE_OA_URL;
  link.addEventListener("click", () => {
    track("line");
    flush();
  });
}
