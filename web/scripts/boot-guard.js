/* 讀取畫面卡住時的安全網。這支必須是「普通腳本」不能是 module：
   用 file:// 開網頁時 Chrome 會擋掉所有 module，只有普通腳本還跑得動，
   而那正是最需要跳出訊息告訴使用者的情況。 */
(function () {
  "use strict";

  /* 兩段式。12 秒只是網路慢，訊息要讓訪客願意再等，讀取動畫繼續轉；
     30 秒才當成真的卡住。09-29 以前 12 秒就寫「代表伺服器沒開著」——
     那是寫給自己開站時看的，訪客看了只會以為網站壞了。 */
  var SLOW_MS = 12000;
  var TIMEOUT_MS = 30000;
  var root = document.documentElement;

  root.dataset.boot = "pending";

  /** 這支掛在 <head>，file:// 的判斷會在 DOM 還沒建好時就跑完，
      所以訊息要等文件解析完才寫得進去。 */
  function whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function stop(message) {
    if (root.dataset.boot === "done") return;
    root.dataset.boot = "failed";
    whenReady(function () {
      var hint = document.querySelector("#loader-hint");
      var blocks = document.querySelector(".loader__blocks");
      if (hint) hint.textContent = message;
      if (blocks) blocks.remove();
    });
  }

  if (location.protocol === "file:") {
    stop("請用「開啟測驗網頁.command」開啟，直接開檔案瀏覽器會擋掉程式");
    return;
  }

  setTimeout(function () {
    if (root.dataset.boot !== "pending") return;
    whenReady(function () {
      var hint = document.querySelector("#loader-hint");
      if (hint && root.dataset.boot === "pending") hint.textContent = "網路有點慢，再等一下下";
    });
  }, SLOW_MS);

  setTimeout(function () {
    if (root.dataset.boot !== "pending") return;
    stop("還是載不出來，重新整理試試看");
  }, TIMEOUT_MS);
})();
