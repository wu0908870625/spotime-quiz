/** 進場讀取畫面。圖層載完才放行，但至少停留一下，避免閃一下就不見。 */
const MIN_VISIBLE_MS = 900;
const FADE_MS = 420;

/**
 * @param {HTMLElement} el
 * @param {{onFadeStart?: () => void}} [hooks] 開始淡出時呼叫。進場動畫掛在這裡，
 *   等 dismiss() 回來才跑的話，中間會空一拍。
 */
export function createLoader(el, hooks = {}) {
  const shownAt = performance.now();

  async function dismiss() {
    // scripts/boot-guard.js 會盯著這個狀態，逾時才跳錯誤訊息
    document.documentElement.dataset.boot = "done";
    const waited = performance.now() - shownAt;
    if (waited < MIN_VISIBLE_MS) await sleep(MIN_VISIBLE_MS - waited);
    el.classList.add("is-done");
    hooks.onFadeStart?.();
    await sleep(FADE_MS);
    el.remove();
  }

  function fail(message) {
    document.documentElement.dataset.boot = "failed";
    el.querySelector(".loader__hint").textContent = message;
    el.querySelector(".loader__blocks")?.remove();
  }

  return { dismiss, fail };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
