/** 發到 IG 限動（結果頁唯一的分享鈕）。
 *
 * 09-30 Jimmy 在 iPhone 上實測：系統分享面板裡沒有「IG 限動」可以直接點。
 * 網頁沒辦法把圖直接塞進 IG 限動——IG 的限動分享只開放給 App（要寫進系統剪貼簿的專用格式），
 * 所以改走兩步，兩步一開始就都列在畫面最上面，做到哪一步亮哪一步：
 *   1. 叫出分享面板 →「儲存影像」存進相簿（做完打勾）
 *   2. 點「打開 IG 限動」直接開 IG 的限動相機，左下角第一張就是剛存的圖
 * 手機不支援分享面板的話，退回長按存圖的畫面（上面也有「打開 IG 限動」）。
 * 電腦沒有 IG 限動可發：直接下載，引導條改說要用手機發。
 * 09-30 Jimmy：存圖和發 IG 兩顆按下去一樣，所以只留這一顆。
 * 09-30 盲測：引導條一直蓋在照片上半部（臉）。到第 2 步後幾秒自己收起來，
 *   收起來之後主按鈕改成「打開 IG 限動」，找不到引導條也點得到；換了新照片就換回來。
 */
import { isAndroid } from "./save.js";

const STORY_URL = "instagram://story-camera";
const FALLBACK_MS = 1600;           // 按了之後還停在這頁，多半是沒裝 IG 或內建瀏覽器擋掉
const AUTO_HIDE_MS = 7000;          // 第 2 步亮了之後，引導條停多久自己收
// 10-02 評估報告第 2 條（Jimmy 同意）：沒標註的話品牌收不到這則限動，朋友也找不到入口。
// 帳號是 IG 上實際在用的 @spotimelab（09-21 實看），不是早期稿上的 @spotime
const TAG = "@spotimelab";
const LABEL = Object.freeze({ share: "發到 IG 限時動態", open: "打開 IG 限時動態" });   // 10-02 Jimmy 在文案總表改的（C162／C163）

const TEXT = Object.freeze({
  save: "在跳出來的清單點「儲存影像」，把圖存進相簿",
  // 10-07：安卓的分享清單沒有「儲存影像」，但 Instagram 會列出「限時動態」可以直接發
  saveAndroid: "在跳出來的清單點 Instagram 的「限時動態」；想先存起來就選相簿 App",
  saved: "圖片已經存進相簿",
  post: `打開 IG 限時動態，左下角第一張就是剛存的圖，記得標註 ${TAG}`,
  stuck: `沒跳過去的話：自己打開 Instagram → 限時動態，從相簿選剛存的圖，記得標註 ${TAG}`,
  downloaded: "圖已經下載到電腦",
  desktop: `IG 限時動態要用手機發：把圖傳到手機，或用手機打開這一頁再按一次（記得標註 ${TAG}）`,
});

/**
 * @param els { guide, saveText, postText, open, close }
 * @param saver createSaver() 回傳的物件
 * @param label 主按鈕上的字（存好圖之後改成「打開 IG 限動」）
 */
export function createStoryShare(els, saver, label) {
  let timer = 0;
  let hideTimer = 0;
  let saved = false;
  const steps = els.guide.querySelectorAll(".igguide__step");

  /** @param at 目前在第幾步（1 或 2）；第 1 步之前的打勾 */
  function say({ at, save, post, showOpen = false }) {
    els.saveText.textContent = save;
    els.postText.textContent = post;
    steps.forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle("is-now", n === at);
      li.classList.toggle("is-done", n < at);
    });
    els.open.hidden = !showOpen;
    els.guide.classList.remove("is-leaving");
    els.guide.hidden = false;
    clearTimeout(hideTimer);
    if (at === 2) hideTimer = setTimeout(hide, AUTO_HIDE_MS);
  }

  /** 引導條收起來之後才換主按鈕的字，不然畫面上會同時有兩顆「打開 IG 限動」 */
  function markSaved(on) {
    saved = on;
    if (!on) label.textContent = LABEL.share;
  }

  function hide() {
    clearTimeout(timer);
    clearTimeout(hideTimer);
    if (els.guide.hidden) return;
    els.guide.classList.add("is-leaving");       // 收起來的動畫在 CSS；沒有動畫的話 animationend 不會來
    const done = () => {
      els.guide.hidden = true;
      els.guide.classList.remove("is-leaving");
      if (saved) label.textContent = LABEL.open;
    };
    if (getComputedStyle(els.guide).animationName === "none") { done(); return; }
    const end = (e) => {
      if (e.target !== els.guide) return;          // 打勾的動畫也會冒上來
      els.guide.removeEventListener("animationend", end);
      done();
    };
    els.guide.addEventListener("animationend", end);
  }

  /** 跳去 IG 之後還停在這頁的話，改說要自己打開 IG */
  function watchJump() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.visibilityState === "visible") say({ at: 2, save: TEXT.saved, post: TEXT.stuck, showOpen: true });
    }, FALLBACK_MS);
  }

  els.close.addEventListener("click", hide);
  els.open.addEventListener("click", watchJump);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !els.open.hidden) hide();   // 已經跳去 IG 了
  });

  /** 按下「發到 IG 限動」。file 要事先轉好（分享面板只能在按下去的當下叫） */
  async function start({ canvas, dataUrl, file }) {
    if (saved) {
      watchJump();
      window.location.href = STORY_URL;
      return;
    }
    if (saver.canShare(file)) {
      say({ at: 1, save: isAndroid() ? TEXT.saveAndroid : TEXT.save, post: TEXT.post });
      const result = await saver.share(file);
      if (result === "shared") {
        markSaved(true);
        say({ at: 2, save: TEXT.saved, post: TEXT.post, showOpen: true });
      }
      else if (result === "cancelled") hide();
      else {
        hide();
        saver.showOverlay(dataUrl);
      }
      return;
    }
    hide();
    const result = await saver.save(canvas, dataUrl, file);
    if (result === "downloaded") say({ at: 2, save: TEXT.downloaded, post: TEXT.desktop });
  }

  /** 結果頁換了新照片：存過的是舊圖，按鈕換回「發到 IG 限動」 */
  function reset() {
    markSaved(false);
    hide();
  }

  return { start, reset, url: STORY_URL };
}
