/** 會滾動的數字。舊的往上滑走、新的從下滑入，中點換字。

   單純把 textContent 換掉沒有人會注意到倒數在減少，而**剩幾題**是使用者
   願不願意做完的直接變數，值得讓它動一下。 */

const SWAP_AT_MS = 170;          // 對應 motion.css @keyframes roll 的 45–55%
const CLEAR_AT_MS = 380;

/**
 * @param {HTMLElement | null} el 要滾動的元素（<b>）
 * @param {string} text 新的內容
 */
export function rollTo(el, text) {
  if (!el) return;
  if (el.textContent === text) return;

  el.classList.remove("is-rolling");
  void el.offsetWidth;
  el.classList.add("is-rolling");
  setTimeout(() => { el.textContent = text; }, SWAP_AT_MS);
  setTimeout(() => el.classList.remove("is-rolling"), CLEAR_AT_MS);
}
