/** Email 收集。頁面不寫折扣誘因，只說會寄什麼。 */
import { API_ENDPOINT } from "./config.js";
import { createEmailMemory, sessionStore } from "./email-memory.js";
import { drain, track } from "./funnel.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 等這麼久還沒失敗，就當作送到了。
   09-29 實測：Apps Script 程式本身 1～2 秒就跑完、資料已經寫進試算表，
   但 Google 要再拖 9～27 秒才把回應交回來。斷網、網址錯這類真的失敗，
   幾百毫秒內就會丟錯，不會拖到這裡。請求用 keepalive，畫面先說收到也不會被砍掉。 */
export const SENT_AFTER_MS = 4000;

/** 第一次沒送到，隔多久自動再送一次 */
export const RETRY_AFTER_MS = 1500;

class SendError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** 斷線（沒有狀態碼）或後端 5xx 才重送；格式錯、送太多次（429）重送也沒用 */
export function retryable(error) {
  return error?.status === undefined || error.status >= 500;
}

/** 瀏覽器拿到跨網域轉址時是 opaqueredirect（狀態碼看不到）；Node 測試時是真的 302。 */
export function landed(res) {
  return res.type === "opaqueredirect" || res.status === 302 || res.status === 303;
}

export function createSignup({ form, input, status, onSubmitted }) {
  /** 跟 email 一起送的欄位：組合、三題答案、裝置、來源。由 use() 換進來。 */
  let fields = {};
  const memory = createEmailMemory(sessionStore());
  input.value = memory.load().email;
  input.addEventListener("input", () => {
    memory.saveDraft(input.value.trim());
    // 10-06 盲測：改成正確的 email 之後，紅字還一直掛著。一開始改就收掉
    if (status.dataset.tone === "error") say("");
  });

  function say(text, tone = "") {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  /** 格式錯了輸入框抖一下（動畫只在 ?demo=fx 有，見 motion.css） */
  function shake() {
    const row = form.querySelector(".signup__row");
    row.classList.remove("is-shake");
    void row.offsetWidth;
    row.classList.add("is-shake");
  }

  function submitButton() {
    return form.querySelector("button[type=submit]");
  }

  /**
   * 10-05 起送到同網域的 /api（worker/api.js），它等 Apps Script 寫完才回 JSON，
   * 自己也會重送一次；這裡再補一次是為了手機訊號不穩、請求根本沒出去的情況。
   * 後端重複的 email 不會多一列，所以重送不怕重複。
   *
   * Content-Type 留 text/plain、redirect: "manual" 是 09-29 直接打 Apps Script 時
   * 的寫法（Apps Script 不回 CORS 預檢、轉址那頁偶爾 404）。改走 /api 後用不到了，
   * 但萬一 API_ENDPOINT 又改回 Google 網址，這兩個設定還是對的，所以留著。
   * 格式錯誤的 email 前端已經先擋掉，後端的同一條檢查只是保險。
   */
  async function sendOnce(email, steps) {
    const request = fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // steps：還沒送的漏斗步驟順便帶上（funnel.js），/api 收下來就拿掉，不會進 email 名單
      body: JSON.stringify({ ...fields, type: "signup", email, steps }),
      redirect: "manual",
      keepalive: true,
    });
    const res = await Promise.race([request, wait(SENT_AFTER_MS)]);
    if (!res) {
      request.catch((error) => console.error("email 背景送出失敗", error));
      return;
    }
    if (landed(res)) return;
    if (!res.ok) throw new SendError(`HTTP ${res.status}`, res.status);
    const data = await res.json().catch(() => ({}));
    if (data.error) throw new SendError(data.error, 400);
  }

  async function send(email) {
    if (!API_ENDPOINT) {
      console.warn("API_ENDPOINT 還沒設定，這筆 email 沒有真的送出去", { email, ...fields });
      return;
    }
    const steps = drain();
    try {
      await sendOnce(email, steps);
    } catch (error) {
      if (!retryable(error)) throw error;
      console.warn("email 第一次沒送到，再送一次", error);
      await wait(RETRY_AFTER_MS);
      await sendOnce(email, steps);
    }
  }

  // 監聽只掛一次。掛在 show() 裡的話，再測一次就會變成送兩筆。
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      say("這個 email 好像不太對，再檢查一下？", "error");
      shake();
      input.focus();
      return;
    }
    say("送出中…");
    submitButton().disabled = true;
    try {
      await send(email);
      memory.markSent(email);
      track("signup");
      form.classList.add("is-done");
      say("收到了，之後有新消息會寄給你。", "ok");
      onSubmitted?.(email);
    } catch (error) {
      console.error("email 送出失敗", error);
      say(error.status === 429 ? "送太多次了，等一分鐘再試。" : "送出失敗，等一下再試一次。", "error");
      submitButton().disabled = false;
    }
  });

  /** 換一組答案時呼叫，表單回到可以再填一次的狀態。
     @param {object} next stats.js 的 answerPayload()，type 會被蓋成 signup */
  function use(next) {
    fields = { ...next };
    // 同一個分頁已經送過（再測一次）：直接顯示收到了，不用再填、也不重送
    if (memory.load().sent) {
      form.classList.add("is-done");
      say("你的 email 已經收到了，不用再填一次。", "ok");
      return;
    }
    form.classList.remove("is-done");
    submitButton().disabled = false;
    say("");
  }

  return { use };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
