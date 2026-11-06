/** 題目流程：畫選項、接作答、推進狀態、同步 LCD。 */
import { PICK_BEAT_MS, QUESTIONS } from "./config.js";
import { rollTo } from "./counter.js";
import { track } from "./funnel.js";
import { answer, back, currentQuestion, INITIAL, isDone } from "./state.js";

/**
 * @param intro 第一題之前的開場問題（要不要用自拍），不算在 Q1～Q3 裡。
 *   { kicker, title, sub, options: [{ label, variant?: "main"|"wide"|"skip", onPick: () => Promise }] }
 *   onPick 結束後（不管有沒有真的選照片）就進 Q1。
 * @param onAnswered 每題答完呼叫，(key, answers, shot) => Promise。shot 是快門動畫跑完的 Promise，
 *   換題不等它（09-30 專家 A1：選完 0.4 秒內就能點下一題），要等快門的呼叫端自己等。
 * @param still (key) => boolean，這題這次畫面不會變（不按快門）。保留原本背景的自拍，場景題就是（10-06）
 * @param onMood 心情題按下去的特效，(value, btn) => Promise|null。
 *   自拍的人選完位置要在這裡校正貼片，校正完才進下一題。
 */
/**
 * @param finale 答完最後一題之後的「按快門」畫面（?demo=shutter）。null＝答完直接出結果。
 *   { kicker, title, sub, arm: () => Promise<boolean>, disarm: () => void }
 *   arm() 在使用者按下快門時 resolve(true)；按「上一題」時 quiz 會呼叫 disarm()，arm() 就 resolve(false)。
 */
/** 選項和小標題的文字用「|」標出可以換行的地方，每一段不拆開（09-30 盲測：Q1 斷成「今天天／氣」）。
   中文每個字之間都能換行，瀏覽器不懂詞，只好自己標。沒有「|」就整句照常。 */
function phrasesOf(label) {
  return label.split("|").map((text) => {
    const span = document.createElement("span");
    span.className = "phrase";
    span.textContent = text;
    return span;
  });
}

export function createQuiz({ preview, shutter, els, onFinish, intro = null, onAnswered = null, onMood = null, finale = null, still = () => false }) {
  let state = INITIAL;
  let locked = false;
  let previous = null;                 // 回上一題時，那一題原本選的答案
  let startedAt = 0;                   // 第一題出現的時間，算作答花了幾秒（10-06 Jimmy 要的）

  function counterText() {
    return String(Math.max(QUESTIONS.length - state.step, 0));
  }

  function renderOptions(question) {
    els.options.replaceChildren(
      ...question.options.map((option, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option";
        // 回上一題：原本選的那個留一圈框，看得出上次選什麼（09-30 專家 B4）
        if (option.value === previous) btn.classList.add("is-prev");
        btn.style.setProperty("--i", index);   // 進場錯開用，樣式在 motion.css
        btn.replaceChildren(...phrasesOf(option.label));
        btn.addEventListener("click", () => choose(option.value, btn));
        return btn;
      }),
    );
  }

  function renderIntro() {
    els.kicker.textContent = intro.kicker;
    els.title.textContent = intro.title;
    els.sub.replaceChildren(...phrasesOf(intro.sub));
    rollTo(els.count, counterText());
    els.back.hidden = true;
    els.options.replaceChildren(
      ...intro.options.map((option, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        // 09-30 Jimmy：自拍是主要選項（希望每個人先考慮它），略過只用小字；wide＝次要、一樣整排
        btn.className = `option option--${option.variant ?? "main"}`;
        btn.style.setProperty("--i", index);
        btn.textContent = option.label;
        btn.addEventListener("click", () => pickIntro(option, btn));
        return btn;
      }),
    );
  }

  async function pickIntro(option, btn) {
    if (locked) return;
    locked = true;
    btn.classList.add("is-picked");
    for (const el of els.options.children) el.disabled = true;
    let go = true;
    try {
      go = (await option.onPick()) !== false;
    } catch (error) {
      console.error("開場選項出錯，直接開始作答", error);
    }
    if (go) {
      track("start");
      if (option.funnel) track(option.funnel);
    }
    if (!go) {
      // 自拍面板按了 × 或往下滑：不替他選，回到開場題自己再選一次
      btn.classList.remove("is-picked");
      for (const el of els.options.children) el.disabled = false;
      locked = false;
      return;
    }
    await swap(() => {});
    locked = false;
  }

  function renderQuestion() {
    const question = currentQuestion(state);
    if (!question) return;
    if (!startedAt) startedAt = Date.now();
    els.kicker.textContent = `Q${state.step + 1} / ${QUESTIONS.length}`;
    els.title.textContent = question.title;
    els.sub.replaceChildren(...phrasesOf(question.sub));
    rollTo(els.count, counterText());
    els.back.hidden = state.step === 0;
    renderOptions(question);
  }

  function syncPreview() {
    preview.render(state.answers);
  }

  /** 題目區淡出、換字、淡入。回上一題往反方向走（is-back），跟前進的路徑對稱 */
  async function swap(mutate, dir = "next") {
    els.question.classList.toggle("is-back", dir === "back");
    els.question.classList.add("is-swapping");
    await wait(SWAP_MS);
    mutate();
    renderQuestion();
    els.question.classList.remove("is-swapping");
  }

  async function choose(value, btn) {
    if (locked) return;
    locked = true;
    btn.classList.add("is-picked");
    for (const el of els.options.children) el.disabled = true;

    const question = currentQuestion(state);
    state = answer(state, value);
    track(`q${state.step}`);             // 答完第幾題（流量漏斗，funnel.js）
    previous = null;
    let shot = Promise.resolve();
    if (question.affects === "none" || still(question.key)) {
      // 畫面不會變的題目不按快門，不然按下去什麼都沒換，看起來像壞掉
      await wait(PICK_BEAT_MS);
    } else if (question.affects === "mood") {
      // 心情不換圖，一樣不按快門；改放心情特效（moodfx.js），沒開特效就停一下
      await (onMood?.(value, btn) ?? wait(PICK_BEAT_MS));
    } else {
      // 圖在快門葉片關著的時候才換，打開的瞬間才看得到新的一層。
      // 快門自己跑完，換題不等它：看得到粉紅色選到了就換題
      shot = shutter.fire(syncPreview);
      await wait(PICK_BEAT_MS);
    }
    try {
      await onAnswered?.(question.key, state.answers, shot);
    } catch (error) {
      console.error("答題後的步驟出錯，直接往下", error);
    }
    syncPreview();                       // 校正過貼片的話，螢幕要換成新位置
    if (isDone(state)) {
      rollTo(els.count, "0");
      await shot;                        // 最後一題：看到圖疊上去再出結果
      if (finale) {
        await waitShutter();
        return;
      }
      onFinish(state.answers, { seconds: secondsSince(startedAt) });
      return;                            // 結果頁接手，不解鎖
    }
    await swap(() => {});
    locked = false;
  }

  /** 答完了：換成「按快門」畫面，保留上一題。按了快門才出結果 */
  async function waitShutter() {
    await swap(renderFinale);
    locked = false;
    const shoot = await finale.arm();
    if (!shoot) return;                  // 按了上一題：goBack 接手
    locked = true;
    onFinish(state.answers, { seconds: secondsSince(startedAt) });
  }

  function renderFinale() {
    els.kicker.textContent = finale.kicker;
    els.title.textContent = finale.title;
    els.sub.replaceChildren(...phrasesOf(finale.sub));
    els.options.replaceChildren();
    els.back.hidden = false;
    els.question.classList.add("is-finale");
  }

  async function goBack() {
    if (locked || state.step === 0) return;
    locked = true;
    if (isDone(state)) {
      finale?.disarm();
      els.question.classList.remove("is-finale");
    }
    await swap(() => {
      previous = state.answers[QUESTIONS[state.step - 1].key] ?? null;
      state = back(state);
    }, "back");
    syncPreview();
    locked = false;
  }

  function start() {
    els.back.addEventListener("click", goBack);
    if (intro) renderIntro();
    else renderQuestion();
    syncPreview();
  }

  return { start };
}

const SWAP_MS = 110;

/** 從第一題出現到按下最後的快門，幾秒。開場的自拍題不算（拍照、選照片的時間差太多）。 */
export function secondsSince(startedAt, now = Date.now()) {
  if (!startedAt || now < startedAt) return null;
  return Math.round((now - startedAt) / 1000);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
