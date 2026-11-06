/** 自拍面板可以用手指往下滑掉（09-30 專家報告 A3，Jimmy 放行、要看過效果再定案）。
 *
 * 只從面板最上面的握把開始算，面板內容本身照常捲動，也不會跟拖貼片打架。
 * 手指往下 1:1 跟著走、往上拉越拉越緊；放手時看慣性會滑到哪：
 * 超過面板高度 1/3 就關掉，沿著往下的路徑出去，並接著手指的速度；不夠就彈回來。
 */
import { createSpring, createVelocity, project, rubberband } from "../physics.js";

const DISMISS_RATIO = 1 / 3;
const OPEN = Object.freeze({ damping: 0.8, response: 0.3 });     // Apple 抽屜的參數
const CLOSE = Object.freeze({ damping: 1, response: 0.3 });

/**
 * @param {HTMLElement} panel 會被移動的面板
 * @param {HTMLElement} handle 握把
 * @param {HTMLElement} backdrop 後面的暗色遮罩，拉下去時跟著變淡
 * @param {() => void} onDismiss 滑掉了
 */
export function createSheetDrag(panel, handle, backdrop, onDismiss) {
  let drag = null;
  const velocity = createVelocity();
  const spring = createSpring(0, OPEN, { onFrame: place, eps: 0.5 });

  function place(y) {
    panel.style.transform = y ? `translateY(${y}px)` : "";
    backdrop.style.setProperty("--sheet-dim", String(1 - Math.min(1, Math.max(0, y) / panel.offsetHeight)));
  }

  function down(e) {
    if (e.button > 0) return;
    handle.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, y0: e.clientY, from: spring.value() };
    spring.jump(drag.from);              // 半路抓住正在彈的面板
    velocity.reset();
    panel.classList.add("is-grabbed");
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const raw = drag.from + (e.clientY - drag.y0);
    const y = raw < 0 ? -rubberband(-raw, panel.offsetHeight) : raw;
    velocity.add(0, y, e.timeStamp);
    spring.jump(y);
  }

  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    panel.classList.remove("is-grabbed");
    const v = velocity.read(e.timeStamp).y;
    const y = spring.value();
    const h = panel.offsetHeight;
    if (y + project(v) > h * DISMISS_RATIO && y > 8) {
      closeFrom(v, h);
      return;
    }
    spring.set(0, v);
  }

  function closeFrom(v, h) {
    const out = createSpring(spring.value(), CLOSE, {
      onFrame: place,
      eps: 2,
      onRest: () => {
        onDismiss();
        reset();
      },
    });
    out.set(h + 40, Math.max(v, 600));
  }

  function reset() {
    spring.jump(0);
    place(0);
  }

  handle.addEventListener("pointerdown", down);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
  return { reset };
}
