/** 金屬反光跟著游標走。

   掃光自己會慢慢飄（CSS 的 sheen-drift），這裡再疊一層「板子跟著你轉」的錯覺：
   游標往右，高光就往左偏一點，像真的在轉動一塊金屬板。

   只在有游標的裝置上做。手機沒有 hover，硬要用陀螺儀在 iOS 要跳權限對話框，
   為了背景的一點高光去要權限不划算。 */

/** 高光最多偏移多少（px）。再大就不像反光，像有東西在飄。 */
const RANGE_X = 26;
const RANGE_Y = 12;

const IDLE = { x: 0, y: 0 };

/**
 * @param {HTMLElement | null} el 掃光層
 * @returns {{destroy: () => void}}
 */
export function createSheen(el) {
  const noop = { destroy() {} };
  if (!el) return noop;

  const fine = window.matchMedia?.("(hover: hover)").matches ?? false;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (!fine || still) return noop;

  let target = IDLE;
  let queued = false;

  function apply() {
    queued = false;
    el.style.setProperty("--sheen-x", `${target.x.toFixed(1)}px`);
    el.style.setProperty("--sheen-y", `${target.y.toFixed(1)}px`);
  }

  /** 每幀最多寫一次樣式。pointermove 一秒可以觸發上百次，直接寫會一直觸發重繪。 */
  function schedule(next) {
    target = next;
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  function onMove(event) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    schedule({
      x: (0.5 - event.clientX / w) * 2 * RANGE_X,
      y: (0.5 - event.clientY / h) * 2 * RANGE_Y,
    });
  }

  function onLeave() {
    schedule(IDLE);
  }

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave, { passive: true });

  return {
    destroy() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    },
  };
}
