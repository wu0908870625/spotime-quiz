/** 相機跟著手機轉（10-01 Jimmy 的想法，demo：?demo=tilt）。
 *
 * 手機上下左右斜，相機跟著轉一點；機身反光跟著偏。
 * 用的是 deviceorientation 的 gamma（左右斜）和 beta（前後仰）。
 * 方向（10-02 Jimmy：使用者不管怎麼斜都是看著螢幕）：眼睛跟螢幕的角度不變，所以把相機當成
 *   「放在玻璃後面、跟著地面擺正的真東西」——手機往右斜，相機相對螢幕往反方向轉，看得到它的側邊，
 *   跟 iPhone 桌布的視差效果同一個道理。要反過來的話把 DIRECTION 改成 1。
 * 「沒有斜」的基準會慢慢跟著使用者的拿法走：躺著、站著拿都一樣，斜的那一下才轉，停住幾秒會慢慢回正。
 *   - Android：直接有資料。
 *   - iOS 13 以上：要先呼叫 DeviceOrientationEvent.requestPermission()，
 *     而且只能在使用者點一下的當下呼叫，會跳系統的「允許取用動作與方向」。
 *     所以等使用者點畫面時才問（沒問成就下次點再問）；拒絕或沒有陀螺儀就維持待機的緩慢晃動（camera.css 的 cam-float）。
 * 修貼片（相機拉近）時不轉：轉著的話手指拖貼片會對不準。
 */
const MAX_DEG = Object.freeze({ y: 9, x: 9 });   // 最多轉幾度（10-02 Jimmy 第三版：上下左右都回到 9 度）
const GAIN = 0.3;                                // 手機斜 30 度 → 相機轉到 9 度
const DIRECTION = -1;                            // -1＝相機像放在玻璃後面（反向轉）；1＝跟著手機同向轉
const DRIFT = 0.006;                             // 基準每幀往目前角度靠多少（約 3 秒回正一半）
const SMOOTH = 0.12;                             // 每幀往目標靠多少，陀螺儀的抖動會被抹掉

const clamp = (v, m) => Math.max(-m, Math.min(m, v));

/**
 * @param {HTMLElement} camera .camera
 * @returns {{ destroy: () => void }}
 */
export function createTilt(camera) {
  const noop = { destroy() {} };
  if (!camera || typeof DeviceOrientationEvent === "undefined") return noop;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return noop;

  const raw = { beta: 0, gamma: 0 };
  let rest = null;                               // 「沒有斜」的基準，第一筆資料進來時定
  const now = { x: 0, y: 0 };
  let frame = 0;
  let live = false;

  function onOrient(event) {
    if (event.gamma == null) return;
    raw.beta = event.beta ?? 0;
    raw.gamma = event.gamma;
    if (!live) {
      live = true;
      rest = { ...raw };
      camera.classList.add("is-tilt");
      frame = requestAnimationFrame(step);
    }
  }

  // gamma＋：手機右邊往後倒；beta＋：手機上緣往自己這邊倒。
  // CSS rotateY＋＝右邊往後、rotateX＋＝上緣往後。跟著手機同向就是 rotateY＝+gamma、rotateX＝−beta
  function target() {
    return {
      y: clamp(DIRECTION * (raw.gamma - rest.gamma) * GAIN, MAX_DEG.y),
      x: clamp(-DIRECTION * (raw.beta - rest.beta) * GAIN, MAX_DEG.x),
    };
  }

  const quiz = camera.closest(".quiz");

  function step() {
    rest = {
      beta: rest.beta + (raw.beta - rest.beta) * DRIFT,
      gamma: rest.gamma + (raw.gamma - rest.gamma) * DRIFT,
    };
    const editing = quiz?.classList.contains("is-zoomed");     // 修貼片：轉回正面，手指才拖得準
    const aim = editing ? { x: 0, y: 0 } : target();
    now.x += (aim.x - now.x) * SMOOTH;
    now.y += (aim.y - now.y) * SMOOTH;
    camera.style.setProperty("--tilt-x", `${now.x.toFixed(2)}deg`);
    camera.style.setProperty("--tilt-y", `${now.y.toFixed(2)}deg`);
    camera.style.setProperty("--tilt-k", (now.y / MAX_DEG.y).toFixed(3));    // -1–1，給反光用
    camera.style.setProperty("--tilt-kx", (now.x / MAX_DEG.x).toFixed(3));
    frame = requestAnimationFrame(step);
  }

  // iOS 的權限：一定要在使用者真的點下去的當下問。
  // 10-02 Jimmy：新版陀螺儀在手機上不會動。以前只聽第一次 click（once），那一次問失敗
  //   （程式自己觸發的 click、或系統還在開別的視窗）之後就再也不會問了。
  //   改成每次真的點擊／手指放開都試，直到拿到答案（允許或拒絕）才停。
  let asking = false;
  let settled = false;
  const triggers = ["click", "touchend"];
  const stopAsking = () => triggers.forEach((type) => document.removeEventListener(type, ask, true));

  async function ask(event) {
    if (settled || asking || !event.isTrusted) return;
    asking = true;
    try {
      const state = await DeviceOrientationEvent.requestPermission();
      settled = true;
      stopAsking();
      if (state === "granted") window.addEventListener("deviceorientation", onOrient);
      else console.warn("陀螺儀權限被拒絕，相機維持待機晃動", state);
    } catch (error) {
      console.warn("陀螺儀權限這次沒問成，下次點擊再試", error);
    } finally {
      asking = false;
    }
  }

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    triggers.forEach((type) => document.addEventListener(type, ask, true));
  } else {
    window.addEventListener("deviceorientation", onOrient);
  }

  return {
    destroy() {
      cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", onOrient);
      stopAsking();
      camera.classList.remove("is-tilt");
    },
  };
}
