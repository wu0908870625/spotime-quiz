/** LCD 的換片快門。

   關 140ms、停 40ms、開 220ms。圖在葉片關著的時候換掉，打開時帶一下曝光過衝。
   關比開快是刻意的——真的機械快門就是關得急、開得緩。

   `swap` 由呼叫端提供，只在葉片完全關上之後執行一次。 */

const CLOSE_MS = 140;
const HOLD_MS = 40;
const OPEN_MS = 220;
const FLASH_MS = 260;

/**
 * @param {HTMLElement | null} el   .lcd__shutter
 * @param {{lcd?: HTMLElement | null, frame?: HTMLElement | null, flash?: HTMLElement | null}} parts
 */
export function createShutter(el, parts = {}) {
  const lcd = parts.lcd ?? null;
  const frame = parts.frame ?? null;
  const flash = parts.flash ?? null;

  /** 快門沒建起來也要能換圖，所以退化成「直接換」而不是丟錯誤。 */
  if (!el) {
    return { async fire(swap) { swap(); } };
  }

  let busy = false;

  async function fire(swap) {
    if (busy) { swap(); return; }        // 連點：不排隊，直接換完就好
    busy = true;
    try {
      el.classList.add("is-closing");
      await wait(CLOSE_MS);

      lcd?.classList.add("is-swapping");
      swap();
      await frameTick();                 // 等瀏覽器套用完新圖再解開 transition
      lcd?.classList.remove("is-swapping");

      await wait(HOLD_MS);

      el.classList.remove("is-closing");
      el.classList.add("is-opening");
      pulse(frame, "is-exposing");
      pulse(flash, "is-firing", FLASH_MS);

      await wait(OPEN_MS);
      el.classList.remove("is-opening");
    } finally {
      busy = false;
    }
  }

  return { fire };
}

/** 重新觸發一次性的 class 動畫。移除 → 強制回流 → 加回去。 */
function pulse(node, name, clearAfter = 0) {
  if (!node) return;
  node.classList.remove(name);
  void node.offsetWidth;
  node.classList.add(name);
  if (clearAfter > 0) setTimeout(() => node.classList.remove(name), clearAfter);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function frameTick() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
