/** 按快門那一步停太久：周圍變暗、只留快門亮（10-02 Jimmy）。
 *
 * 停 IDLE_MS 沒有任何動作（點、滑、按鍵），整頁蓋一層暗幕，快門那一塊挖空留亮，
 * 暗的地方寫一行字指向快門。暗幕不接手指（pointer-events: none），點下去照常會拍或半按，
 * 手一碰就退掉、重新計時。相機會晃、會跟陀螺儀轉，所以亮著的時候每一幀重新對快門的位置。
 * 樣式在 styles/idlespot.css。
 */
const IDLE_MS = 6000;
const TEXT = Object.freeze(["按下快門", "存下你的 SPOTIME"]);   // 10-02 Jimmy 改的字（第二次：拿掉「趕緊」），兩行靠右對著快門
const WAKE = Object.freeze(["pointerdown", "keydown", "wheel", "touchstart", "scroll"]);

/**
 * @param {HTMLElement} target 要留亮的東西（快門）
 * @returns {{ start: () => void, stop: () => void }}
 */
export function createIdleSpot(target) {
  const veil = document.createElement("div");
  veil.className = "idlespot";
  veil.setAttribute("aria-hidden", "true");
  const label = document.createElement("p");
  label.className = "idlespot__text";
  TEXT.forEach((line) => {
    const span = document.createElement("span");
    span.textContent = line;
    label.append(span);
  });
  veil.append(label);
  document.body.append(veil);

  let timer = 0;
  let frame = 0;
  let running = false;

  function place() {
    const box = target.getBoundingClientRect();
    veil.style.setProperty("--spot-x", `${(box.left + box.width / 2).toFixed(1)}px`);
    veil.style.setProperty("--spot-y", `${(box.top + box.height / 2).toFixed(1)}px`);
    veil.style.setProperty("--spot-rx", `${Math.max(box.width * 3.2, 44).toFixed(1)}px`);
    veil.style.setProperty("--spot-ry", `${Math.max(box.height * 0.95, 60).toFixed(1)}px`);
    frame = requestAnimationFrame(place);
  }
  function show() {
    cancelAnimationFrame(frame);
    place();
    veil.classList.add("is-on");
  }
  function hide() {
    cancelAnimationFrame(frame);
    veil.classList.remove("is-on");
  }
  function poke() {
    hide();
    clearTimeout(timer);
    if (running) timer = setTimeout(show, IDLE_MS);
  }

  return {
    start() {
      if (running) return;
      running = true;
      WAKE.forEach((type) => window.addEventListener(type, poke, { capture: true, passive: true }));
      poke();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      WAKE.forEach((type) => window.removeEventListener(type, poke, { capture: true }));
      hide();
    },
  };
}
