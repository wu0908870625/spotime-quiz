/** 結果頁：出片 → 分享鈕與 LINE 好友鈕滑上來 → 打字機講稀有度（等後端，不擋前面）。 */
import { RESULT_TITLE } from "./config.js";
import { comboKey as keyOf, comboLabel, verdict } from "./rarity.js";
import { renderResult } from "./render.js";
import { createSaver } from "./save.js";
import { createStoryShare } from "./igstory.js";
import { createLineOa } from "./line-oa.js";
import { renderStory } from "./story.js";
import { readContext } from "./context.js";
import { track } from "./funnel.js";
import { logAnswer } from "./stats.js";

const TYPE_SPEED_MS = 70;
const AFTER_PAPER_MS = 820;

export function createResult({ manifest, els, onRestart }) {
  const saver = createSaver({
    overlay: els.saveover,
    overlayImg: els.saveoverImg,
    closeBtn: els.saveoverClose,
    behind: els.page,
  });
  createLineOa({ link: els.lineOa });

  const visit = readContext();

  // 按鈕的監聽只掛一次。掛在 show() 裡的話，再測一次就會存兩張圖。
  // 9:16 的限動圖在背景畫，按下去時還沒好就等它一下。
  let current = null;
  let shown = null;              // 目前結果頁的答案，自拍流程要用
  const igShare = createStoryShare(els.igGuide, saver, els.igStory.querySelector(".btn__label"));
  async function share() {
    if (!current) return;
    try {
      await igShare.start(await current);
    } catch (error) {
      console.error("限動圖畫不出來", error);
    }
  }
  // 10-02 評估報告第 3 條（Jimmy 同意）：用範例臉的人把陌生人的臉發到自己限動，意願很低。
  // 第一次按發限動先問一次要不要換成自己的臉；只問一次，選「直接發」就照常叫出分享面板。
  let askedFace = false;
  // 10-02 盲測第 2 點：從這裡進去換自拍，修完回到結果頁還要自己再找 IG 鈕。
  // 分享面板只能在「按下去的那一下」叫，新的限動圖又要畫一秒多，所以沒辦法修完直接跳面板；
  // 改成修完自動捲回 IG 鈕、字換成「換好了」、輕輕跳一下，下一步一眼就看得到
  let shareNext = false;
  const igLabel = els.igStory.querySelector(".btn__label");
  const NUDGE_LABEL = "換好了！發到 IG 限時動態";
  const SHARE_LABEL = igLabel.textContent;
  const unNudge = () => {
    if (!els.igStory.classList.contains("is-nudge")) return;
    els.igStory.classList.remove("is-nudge");
    igLabel.textContent = SHARE_LABEL;
  };
  const toggleAsk = (on) => {
    els.faceAsk.box.hidden = !on;
    els.igStory.hidden = on;           // 兩顆主要按鈕不要同時出現
    // 10-06 盲測：提示卡出現在畫面底下，只露一行字，看起來像按了沒反應。捲到整張卡看得到
    if (on) els.faceAsk.box.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  els.igStory.addEventListener("click", () => {
    track("share");
    unNudge();
    if (!askedFace && !els.selfieOpen.hidden) {
      askedFace = true;
      toggleAsk(true);
      return;
    }
    share();
  });
  els.faceAsk.yes.addEventListener("click", () => {
    toggleAsk(false);
    shareNext = true;
    els.selfieOpen.click();            // 跟相紙上「換成我的自拍」同一個入口
  });
  els.faceAsk.no.addEventListener("click", () => {
    toggleAsk(false);
    share();                           // 分享面板要在點擊當下叫，這裡就是那一下
  });
  els.restart.addEventListener("click", onRestart);

  /**
   * @param selfie 開場挑了自拍的話是 { custom, position }（脖子被擋住時 position 可能跟答案不同）
   */
  /** @param print ?demo=print 的出片動畫（printfx.js createPrint），null＝一般的相紙滑出 */
  async function show(answers, selfie = null, print = null, timing = {}) {
    const comboKey = keyOf(answers);
    shown = Object.freeze({ ...answers, position: selfie?.position ?? answers.position });
    const caption = comboLabel(shown);

    // 只先畫網頁上要看的 4:5 合照，畫完馬上換畫面。
    const photo = await renderResult(manifest, shown, undefined, selfie?.custom ?? null);
    const url = photo.toDataURL("image/jpeg", 0.92);
    if (print) await print.eject(url, caption).catch((error) => console.error("出片動畫出錯", error));
    present(photo, caption, { story: false, url });

    // 11-17 Jimmy：「XX% 的人跟你有相同選擇」拿掉，只留英文短句，所以不用再等後端的統計表
    const { tag } = verdict(null, comboKey, Date.now(), answers.mood);

    els.quiz.classList.add("is-off");
    els.result.classList.add("is-on");
    scrollTo({ top: 0 });
    if (print) {
      print.land(els.paper).catch((error) => console.error("出片動畫出錯", error));
    } else {
      els.paper.classList.add("is-out");
    }
    els.tag.textContent = "";
    els.tag.classList.remove("is-on");

    // 存下來的 9:16 整張畫面比較大，等相紙開始出片後才在背景畫
    current = storyOf(photo, caption);

    track("result");
    logAnswer(comboKey, answers, visit, timing.seconds ?? null);

    await sleep(AFTER_PAPER_MS);
    // 分享鈕和 LINE 鈕先出來，不必等稀有度
    els.actions.classList.add("is-on");
    // 結果頁是成果展示：已經用自拍的人位置在作答時就校正好了，不再放調整鈕。
    // 只有用預設合照的人，才留「換成我的自拍」
    els.selfieOpen.hidden = Boolean(selfie);

    // 大標題固定，會變的是英文短句——它是「蓋章」的那一下
    await type(els.title, RESULT_TITLE);
    els.title.classList.add("is-typed");
    els.tag.textContent = tag;
    els.tag.classList.add("is-on");
  }

  /** 換上新的合照。story:false 的話 9:16 由呼叫端自己決定什麼時候畫。 */
  function present(photo, caption, { story = true, url = null } = {}) {
    els.paperImg.src = url ?? photo.toDataURL("image/jpeg", 0.92);
    els.paperCaption.textContent = caption;
    igShare.reset();
    if (story) current = storyOf(photo, caption);
  }

  /** 自拍流程按下「就用這張」：人物層與貼點換成使用者的，位置可能被改成臉頰。 */
  async function applySelfie(custom, position) {
    if (!shown) return;
    shown = Object.freeze({ ...shown, position });
    const caption = comboLabel(shown);
    const photo = await renderResult(manifest, shown, undefined, custom);
    present(photo, caption);
    // 相紙重新出片一次，看得出來換了
    els.paper.classList.remove("is-out");
    void els.paper.offsetWidth;
    els.paper.classList.add("is-out");
    els.selfieOpen.hidden = true;
    if (shareNext) {
      shareNext = false;
      await current;                   // 限動圖畫好了才叫人按，不然按下去還要等
      igLabel.textContent = NUDGE_LABEL;
      els.igStory.classList.add("is-nudge");
      els.igStory.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return { show, applySelfie, answers: () => shown };
}

function storyOf(photo, caption) {
  return nextFrame().then(() => renderStory(photo, caption)).then(async (story) => {
    const dataUrl = story.toDataURL("image/jpeg", 0.92);
    let file = null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      file = new File([blob], "spotime.jpg", { type: "image/jpeg" });
    } catch (error) {
      console.warn("圖檔轉不出來，分享改用長按儲存", error);
    }
    return { canvas: story, dataUrl, file };
  });
}

async function type(el, text) {
  el.textContent = "";
  for (const ch of text) {
    el.textContent += ch;
    await sleep(TYPE_SPEED_MS);
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
