/** 相機本身的操作（09-30 Jimmy 的想法，看過 demo 後定案）。
 *
 * 選完位置（Q4）不開鉻銀面板，改成相機拉近、直接在相機螢幕上修圖。
 *   - 貼片直接在螢幕上拖（1:1 拖、按旁邊細調、兩指轉和縮放，跟面板裡一樣）
 *   - 機身下面的按鍵：↺ 左轉、↻ 右轉、↩ 回復上一步（10-06 Jimmy 從「還原」改過來）；修好按螢幕下方的「修圖完成」進下一題
 *   - 沒挑自拍的人不拉近，直接下一題
 * 答完最後一題，換成「按下快門」的畫面（保留上一題），按了機身上面的快門才出結果。
 *   純粹是拍照的儀式感：快門 → 黑幕 → 出片。
 * 機身圖 ccd_back_v6.webp（tools/body_v6.py），快門是切出來的另一張圖、按鍵圖示是網頁畫的。
 * 三顆鍵一直按得下去，但只有修貼片時有作用、圖示亮（data-live）；沒作用時按下去電源燈閃一下橘燈
 *   （10-02 Jimmy：按了完全沒反應有點無趣。真的相機按到不能用的鍵也是這樣提示）。
 * 按鍵、快門的手感（按下、停一下、回彈）在 press.js；快門分兩段：手指碰到是半按（對焦框變綠），
 *   放開才拍、有「喀擦」聲。電源燈在按快門後閃幾下。
 * 換機身圖的話，按鍵位置（index.html 的 --x、camedit.css 的 top）和快門位置要重新對。
 *
 * 10-06 Jimmy 的兩個回饋：
 *   - 螢幕左下角的「+ADD」膠囊（照 Q2 的 LOADED 暫存槽做）：點一個造型就多貼一枚，自己拖到想要的地方。
 *     右下角一直有垃圾桶，多加的拖過去丟掉（點它＝丟掉選到的那枚）。丟錯了按機身的 ↩ 救回來。
 *   - 說明下面的「換成原本照片的背景／換回 SPOTIME 場景」：去背效果不好、或想留原本場景的人用。
 */
import { pressable, replayClass, primeSound, playClick } from "./press.js";
import { createIdleSpot } from "./idlespot.js";

const ZOOM_MS = 420;
const PRESS_MS = 160;            // 快門按到底停多久才彈回來（回彈本身 260ms，在 camedit.css）
const NOPE_MS = 560;             // 橘燈閃兩下的時間，跟 camedit.css 的 cam-led-nope 一樣長
const BUSY_MS = 960;             // 電源燈閃的時間，跟 camedit.css 的 cam-led-busy（240ms × 4）一樣長
const HINT = "直接在螢幕上拖貼片，兩指可以轉、縮放；機身按鍵 ⟲⟳ 轉角度、↩\uFE0E 回到上一步。左下角可以多貼幾枚，不要的拖進右下角垃圾桶。";
const BG_LABEL = Object.freeze({ scene: "換成原本照片的背景", photo: "換回 SPOTIME 場景" });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param els { quiz, lcd, keys, shutter, hint, hintText, ok, add, bin, bg }
 * @param selfie createSelfieFlow() 回傳的物件（用 editOn）
 * @param {ReadonlyArray<{shape:string, src:string, label:string, hidden?:boolean}>} shapes 「+ADD」膠囊裡的造型；hidden＝隱藏款，往左滑才看得到
 */
export function createCameraEdit(els, selfie, shapes = []) {
  const keyOf = (name) => els.keys.querySelector(`[data-key="${name}"]`);
  const camera = els.shutter.closest(".camera");
  const armed = () => camera.classList.contains("is-armed");
  const idle = createIdleSpot(els.shutter);          // 停 6 秒沒動作：周圍變暗、只留快門亮

  /** 按到現在沒有作用的鍵：電源燈閃一下橘燈 */
  function nope() {
    navigator.vibrate?.(4);
    replayClass(camera, "is-nope", NOPE_MS);
  }
  for (const key of els.keys.querySelectorAll(".cam-key")) {
    pressable(key, { onDown: () => { if (els.keys.dataset.live !== "on" && !armed()) nope(); } });
  }
  pressable(els.shutter, { onDown: () => { if (!armed()) nope(); } });
  // 按快門那一步：手指碰到相機任何地方，快門都先半按下去、對焦框變綠（順便告訴他快門在哪）
  camera.addEventListener("pointerdown", () => {
    if (!armed()) return;
    primeSound();
    els.shutter.classList.add("is-half");
    els.lcd.classList.add("is-af");
  });
  const releaseHalf = () => {
    els.shutter.classList.remove("is-half");
    els.lcd.classList.remove("is-af");
  };
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => camera.addEventListener(type, releaseHalf));

  // 「+ADD」膠囊的造型鈕。題目的四款排前面、一次看得到；隱藏款（翅膀、四葉草）排在後面，
  // 要把造型鈕那一段往左滑才出來（10-12 Jimmy：當隱藏款，不加提示）
  els.add.querySelector(".add__track")?.remove();
  const track = document.createElement("div");
  track.className = "add__track";
  els.add.append(track);
  for (const { shape, src, label, hidden } of shapes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "add__shape";
    btn.dataset.add = shape;
    if (hidden) btn.dataset.hidden = "";
    btn.setAttribute("aria-label", `多貼一枚${label}`);
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;
    btn.append(img);
    pressable(btn);
    track.append(btn);
  }

  function once(btn) {
    return new Promise((resolve) => btn.addEventListener("click", resolve, { once: true }));
  }

  /** Q4 選完：相機拉近、在螢幕上修圖，按「修圖完成」回來。沒挑自拍直接回來。 */
  async function edit(answers) {
    const canvas = document.createElement("canvas");
    canvas.className = "cam-edit";
    els.lcd.append(canvas);
    let editor = null;
    try {
      editor = await selfie.editOn(canvas, answers, { bin: els.bin, tray: els.add });
    } catch (error) {
      console.error("相機上修圖出錯，直接下一題", error);
    }
    if (!editor) {
      canvas.remove();
      return;
    }
    els.quiz.classList.add("is-zoomed");
    els.keys.dataset.live = "on";
    els.hint.hidden = false;
    els.hintText.textContent = HINT;

    const step = selfie.rotateStep;
    // 回到上一步：沒有上一步了（或換過背景，從那裡重新算），電源燈閃橘燈
    const actions = { ccw: () => editor.rotate(step), cw: () => editor.rotate(-step), undo: () => { if (!editor.undo()) nope(); } };
    const offs = Object.entries(actions).map(([name, act]) => {
      const btn = keyOf(name);
      const on = () => { navigator.vibrate?.(6); act(); };
      btn.addEventListener("click", on);
      return () => btn.removeEventListener("click", on);
    });

    const onAdd = (e) => {
      const shape = e.target.closest("[data-add]")?.dataset.add;
      if (!shape) return;
      if (editor.add(shape)) navigator.vibrate?.(6);
      else nope();                      // 加到上限了
    };
    els.add.addEventListener("click", onAdd);
    els.add.hidden = false;
    track.scrollLeft = 0;               // 每次進修圖都從題目那四款開始，隱藏款藏回右邊
    els.bin.hidden = false;

    const labelBg = () => { els.bg.textContent = BG_LABEL[editor.background()]; };
    const onBg = async () => {
      els.bg.disabled = true;
      try {
        await editor.setBackground(editor.background() === "photo" ? "scene" : "photo");
      } catch (error) {
        console.error("換背景失敗", error);
      } finally {
        labelBg();
        els.bg.disabled = false;
      }
    };
    els.bg.hidden = !selfie.canKeepBackground();
    labelBg();
    els.bg.addEventListener("click", onBg);

    await once(els.ok);
    offs.forEach((off) => off());
    els.add.removeEventListener("click", onAdd);
    els.add.hidden = true;
    els.bin.hidden = true;
    els.bg.removeEventListener("click", onBg);
    els.bg.hidden = true;
    editor.commit();
    canvas.remove();
    els.keys.dataset.live = "off";
    els.hint.hidden = true;
    els.quiz.classList.add("is-unzooming");
    els.quiz.classList.remove("is-zoomed");
    await wait(ZOOM_MS);
    els.quiz.classList.remove("is-unzooming");
  }

  /** 最後的「按快門」畫面：給 quiz.js 的 finale 用 */
  let pending = null;
  // 盲測：有人會直接去按螢幕或機身按鍵，按了沒反應就卡住。所以這一步按相機任何地方都算按快門
  function arm() {
    els.shutter.setAttribute("aria-disabled", "false");
    els.shutter.classList.add("is-ready");
    camera.classList.add("is-armed");
    els.quiz.classList.add("is-closeup");          // 相機拿近，視線落在快門上（10-02 Jimmy）
    return new Promise((resolve) => {
      const off = () => {
        els.shutter.removeEventListener("click", shoot);
        camera.removeEventListener("click", shoot);
        els.shutter.setAttribute("aria-disabled", "true");
        els.shutter.classList.remove("is-ready");
        camera.classList.remove("is-armed");
        idle.stop();
        pending = null;
      };
      const shoot = () => {
        off();
        navigator.vibrate?.(12);
        playClick();
        releaseHalf();
        els.shutter.classList.add("is-pressed");
        camera.classList.add("is-busy", "is-shot");   // is-shot：螢幕玻璃反光退掉，拍下來的是照片（glass.css）
        setTimeout(() => els.shutter.classList.remove("is-pressed"), PRESS_MS);   // 放開，彈回來
        setTimeout(() => camera.classList.remove("is-busy"), BUSY_MS);
        setTimeout(() => resolve(true), 90);        // 看得到快門被壓下去
      };
      els.shutter.addEventListener("click", shoot);
      camera.addEventListener("click", shoot);
      idle.start();
      pending = () => { off(); els.quiz.classList.remove("is-closeup"); resolve(false); };
    });
  }
  function disarm() { pending?.(); }

  return { edit, arm, disarm };
}
