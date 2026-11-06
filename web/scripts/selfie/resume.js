/** 「換個答案再測一次」要重新整理頁面，自拍會跟著不見（09-30 盲測：得重新上傳一次）。
 *
 * 10-02 第三次回饋（Jimmy 手機上按「沿用剛才的自拍」還是跳出選照片畫面）：
 *   以前存的是原照片，沿用時要重新辨識。重新整理後辨識工具（約 10 MB）得整包重新下載，
 *   手機網路一卡就失敗，失敗就退回選照片畫面。
 *   現在改存「做好的成品」：去背好的人物層＋四個位置的貼點＋使用者調過的位置。
 *   沿用時不用辨識、不用下載，直接放回去。
 *
 * 存成 ArrayBuffer 不存 Blob：Safari 無痕（和一些 App 內建瀏覽器）的 IndexedDB 不收 Blob，會整筆寫入失敗。
 * 存在哪：人物層是一張 1080 寬的透明 PNG，常常超過 sessionStorage 的 5 MB 上限，所以放 IndexedDB；
 *   sessionStorage 只記「這個分頁存的是哪一筆」。別的分頁、上次開網頁留下的會在開網頁時清掉，
 *   照片只留在使用者自己的瀏覽器，不會上傳。
 *   存不進去（無痕、App 內建瀏覽器擋 IndexedDB）就照舊重新上傳。 */
const DB_NAME = "spotime-selfie";
const STORE = "kept";
const TAB_KEY = "spotime:selfie-kept";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("這個瀏覽器沒有 IndexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 開一個交易做一件事，等交易真的寫完才 resolve */
async function run(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function tabId() {
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

function setTabId(id) {
  try {
    if (id) sessionStorage.setItem(TAB_KEY, id);
    else sessionStorage.removeItem(TAB_KEY);
  } catch { /* sessionStorage 不能用：就當沒存，重新上傳 */ }
}

/** 這個分頁有沒有存過做好的自拍（同步，開場畫面決定要不要出現「沿用剛才的自拍」） */
export function hasKeptSelfie() {
  return Boolean(tabId());
}

const packBlob = async (blob) => (blob ? { type: blob.type, bytes: await blob.arrayBuffer() } : null);
const unpackBlob = (packed, fallback) => (packed?.bytes instanceof ArrayBuffer
  ? new Blob([packed.bytes], { type: packed.type || fallback })
  : null);

/**
 * 存起來。舊的那筆一起清掉（一個分頁只留一筆）。
 * 10-06 起多存原照裁好的背景（backdrop）、兩種背景各自的貼點（looks）、選了哪一種（bg）。
 * @param {{ person: Blob, backdrop: Blob|null, looks: object, bg: string }} record
 */
export async function keepSelfie({ person, backdrop = null, ...rest }) {
  const record = { ...rest, person: await packBlob(person), backdrop: await packBlob(backdrop) };
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await run("readwrite", (store) => {
      store.clear();
      return store.put(record, id);
    });
    setTabId(id);
  } catch (error) {
    setTabId(null);
    console.warn("自拍暫存不進去，重新測驗要再上傳一次", error);
  }
}

/** 讀回這個分頁存的那筆（person 換回 Blob）。沒有或讀不出來回 null。 */
export async function takeSelfie() {
  const id = tabId();
  if (!id) return null;
  try {
    const record = await run("readonly", (store) => store.get(id));
    const person = unpackBlob(record?.person, "image/png");
    if (!person || !(record.looks?.scene?.auto ?? record.auto)) return null;
    return { ...record, person, backdrop: unpackBlob(record.backdrop, "image/jpeg") };
  } catch (error) {
    console.warn("暫存的自拍讀不出來", error);
    return null;
  }
}

/** 丟掉（選「換一張自拍照」、或暫存壞掉） */
export async function dropSelfie() {
  setTabId(null);
  try {
    await run("readwrite", (store) => store.clear());
  } catch { /* 清不掉也沒關係，下次開網頁會再清 */ }
}

/** 開網頁時呼叫：不是這個分頁存的（別的分頁、上次開網頁留下的）都清掉 */
export async function sweepSelfies() {
  const keep = tabId();
  try {
    await run("readwrite", (store) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (cursor.key !== keep) cursor.delete();
        cursor.continue();
      };
      return req;
    });
  } catch { /* 沒有 IndexedDB 就沒東西要清 */ }
}
