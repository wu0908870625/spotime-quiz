/** 「換個答案再測一次」會重新整理頁面，email 欄跟著清空（09-30 盲測）。
 * 把 email 暫存在這個分頁的 sessionStorage：打到一半的留著；已經送出的，下一輪直接顯示「已經收到」，
 * 不用再填、也不會重送一筆。只存 email 本身，不存作答（心情不能跟 email 綁在一起）。
 * 關掉分頁就沒了；存不進去（無痕、被擋）就照舊空白。 */
const KEY = "spotime:email";

/** @param storage 通常是 sessionStorage；測試傳假的進來 */
export function createEmailMemory(storage) {
  function read() {
    try {
      const raw = storage?.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      return typeof data?.email === "string" ? { email: data.email, sent: data.sent === true } : null;
    } catch {
      return null;
    }
  }

  function write(email, sent) {
    try {
      storage?.setItem(KEY, JSON.stringify({ email, sent }));
    } catch (error) {
      console.warn("email 暫存不進去，再測一次要重新填", error);
    }
  }

  return {
    load: () => read() ?? { email: "", sent: false },
    /** 打字時呼叫；已經送出過就不覆蓋（避免改字後以為沒送過） */
    saveDraft: (email) => { if (!read()?.sent) write(email, false); },
    markSent: (email) => write(email, true),
  };
}

export function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
