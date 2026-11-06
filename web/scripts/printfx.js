/** 結果頁出場 demo（?demo=print，第三版）。
 *
 * 09-30 Jimmy 看完拍貼機版：前面是相機拍照，突然冒出一個出片口很突兀；黑色的縫也不像挖空的。
 * 所以改成「相機自己吐出相片」（像 Instax／拍立得那種會印相片的相機），不另外畫出片口：
 *   1. 按快門：相機螢幕定格、黑掉再亮回來，同一格震動（shutter）。
 *   2. 相機往下退，相紙從機身上緣後面一段一段被推出來（推 4 段，推一下停一下）。
 *      相紙一開始整張藏在機身後面，機身本身就是出片口，所以不用畫洞（eject）。
 *   3. 相紙推完：相機往下掉出畫面，相紙飛到結果頁的位置放大、落定（land，FLIP 動畫）。
 *   任何一次點擊都直接跳到最後的樣子。
 */
import { createSpring } from "./physics.js";

const BLACK_MS = 300;             // 跟 CSS 的 lcd-blackout 一樣長
const DROP_MS = 420;              // 相機往下退，讓出上面的空間
const STOPS = Object.freeze([0.26, 0.5, 0.74, 1]);   // 相紙露出來的比例
const PUSH_MS = 160;
const PAUSE_MS = 130;
const PAPER_OF_CAMERA = 0.78;     // 吐出來的相紙寬＝機身寬的幾成（要比機身窄才藏得住）
const LAND = Object.freeze({ damping: 0.86, response: 0.5 });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t) => 1 - (1 - t) ** 3;
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function tween(ms, onFrame, isStopped) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = (now) => {
      if (isStopped()) { resolve(); return; }
      const t = Math.min(1, (now - t0) / ms);
      onFrame(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/**
 * @param els { quiz, lcd, camera }
 */
export function createPrint(els) {
  let skipped = false;
  let clone = null;
  let black = Promise.resolve();
  const skip = () => { skipped = true; };

  /** 步驟 1：一按快門就黑，不等結果圖畫好 */
  function shutter() {
    black = blackout();
    return black;
  }

  async function blackout() {
    if (reduced()) return;
    document.addEventListener("pointerdown", skip, true);
    navigator.vibrate?.(15);
    els.lcd.classList.add("is-blackout");
    await wait(BLACK_MS);
    els.lcd.classList.remove("is-blackout");
  }

  /** 步驟 2：相機退下去，相紙從機身上緣後面推出來 */
  async function eject(url, caption) {
    await black;
    if (reduced() || skipped) return;
    const cam = els.camera;
    const w = cam.offsetWidth * PAPER_OF_CAMERA;
    clone = document.createElement("figure");
    clone.className = "paper eject";
    clone.style.width = `${w}px`;
    clone.style.left = `${(cam.offsetWidth - w) / 2}px`;
    const img = new Image();
    img.className = "paper__img";
    img.src = url;
    const cap = document.createElement("figcaption");
    cap.className = "paper__caption";
    cap.textContent = caption;
    clone.append(img, cap);
    clone.setAttribute("aria-hidden", "true");
    cam.prepend(clone);                      // 排在機身圖前面＝畫在機身後面
    await img.decode().catch(() => {});
    const h = clone.offsetHeight;
    const top = cam.getBoundingClientRect().top;
    const room = Math.max(0, h + 16 - top);  // 相機要往下退多少，上面才放得下整張相紙
    let y = 0;
    let lift = 0;
    const draw = () => {
      cam.style.translate = `0 ${y}px`;       // 不用 transform：相機待機晃動（camera.css cam-float）在用
      clone.style.transform = `translateY(${-lift}px)`;
    };
    els.quiz.classList.add("is-printing");
    await tween(DROP_MS, (t) => { y = room * easeOut(t); draw(); }, () => skipped);
    for (const stop of STOPS) {
      if (skipped) break;
      const from = lift;
      await tween(PUSH_MS, (t) => { lift = from + (h * stop - from) * easeOut(t); draw(); }, () => skipped);
      if (skipped) break;
      await wait(PAUSE_MS);
    }
    lift = h;
    draw();
    // 換成掛在 body 上的替身：結果頁一接手，測驗區就被收掉（display: none），留在裡面會量不到位置
    const from = clone.getBoundingClientRect();
    const fly = clone.cloneNode(true);
    fly.classList.add("eject--flying");
    Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, transform: "none" });
    document.body.append(fly);
    clone.remove();
    clone = fly;
  }

  /** 步驟 3：結果頁已經排好，相紙從相機上飛到結果頁的相紙位置 */
  async function land(paper) {
    document.removeEventListener("pointerdown", skip, true);
    paper.style.transform = "none";
    if (!clone || reduced()) { clone?.remove(); return; }
    const fly = clone;
    clone = null;
    const from = fly.getBoundingClientRect();
    paper.style.visibility = "hidden";
    await frame();
    const to = paper.getBoundingClientRect();
    const k = to.width / from.width;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    await new Promise((resolve) => {
      const done = () => { fly.remove(); paper.style.visibility = ""; resolve(); };
      if (skipped) { done(); return; }
      createSpring(0, LAND, {
        eps: 0.002,
        onFrame: (p) => {
          const s = 1 + (k - 1) * p;
          fly.style.transform = `translate(${dx * p}px, ${dy * p}px) scale(${s}) rotate(${-2 * (1 - p)}deg)`;
          if (skipped) done();
        },
        onRest: done,
      }).set(1);
    });
  }

  return { shutter, eject, land };
}
