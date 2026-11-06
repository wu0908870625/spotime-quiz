/** 把狀態畫成 LCD 裡的三層圖。所有位置都用比例，跟螢幕實際尺寸無關。 */
import { url, isLoaded, whenLoaded } from "./layers.js";
import { QUESTIONS } from "./config.js";

const STICKER_SELECTORS = { W: "#sticker-w", M: "#sticker-m" };

/**
 * @returns {{ render(answers), useSelfie(selfie|null) }}
 *   useSelfie：開場挑了自拍之後，螢幕上的人物換成他的去背照、貼片換成從他臉上算的位置。
 *   selfie ＝ { person: 圖片網址, persons: { [scene]: 依場景打好光的網址 }, backdrop: 保留原本背景時的整張照片網址｜null,
 *              spots: { [position]: [{x,y,size,roll,shape?}] } }
 *   backdrop 有值時螢幕一直是那張照片，換場景不換圖（10-06 Jimmy：場景題當普通題目）
 */
export function createPreview(manifest, root) {
  const plate = root.querySelector("#layer-plate");
  const person = root.querySelector("#layer-person");
  const stickers = Object.values(STICKER_SELECTORS).map((sel) => root.querySelector(sel));

  const lcd = root.closest(".lcd") ?? root;
  const tray = lcd.querySelector("#tray");
  const traySticker = lcd.querySelector("#tray-sticker");
  let selfie = null;
  let last = {};

  // 貼片陰影要跟著螢幕大小縮放，所以把螢幕寬度寫成 CSS 變數。
  // 變數寫在 <html> 而不是被觀察的元素上，而且值沒變就不寫——
  // 在 callback 裡改被觀察元素的樣式會觸發 ResizeObserver 無限迴圈，把主執行緒卡死。
  let lastWidth = -1;

  function syncFrameWidth(width) {
    const px = Math.round(width);
    if (px === lastWidth || px <= 0) return;
    lastWidth = px;
    document.documentElement.style.setProperty("--frame-w", `${px}px`);
  }

  new ResizeObserver((entries) => {
    for (const entry of entries) {
      syncFrameWidth(entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
    }
  }).observe(lcd);
  syncFrameWidth(lcd.clientWidth);

  let sceneToken = 0;

  /** 背景和人物要一起換。10-06 起場景圖改在背景載，答太快的話可能還沒到，
     這時先留著上一個畫面，兩張都到了再一起換上，不會出現有背景沒人（或反過來）。 */
  function showScene(key) {
    if (selfie?.backdrop) {
      ++sceneToken;                              // 還在等的場景圖不要蓋上來
      lcd.classList.remove("is-idle");
      setSrc(plate, selfie.backdrop);
      setLayer(person, null);
      return;
    }
    const scene = key ? manifest.scenes[key] : null;
    const personPath = selfie ? null : scene?.person ?? (scene ? null : manifest.idle?.person);
    const waitFor = [scene?.plate, personPath].filter((p) => p && !isLoaded(p));
    const token = ++sceneToken;
    const apply = () => {
      if (token !== sceneToken) return;          // 等的時候又換了別的場景
      lcd.classList.toggle("is-idle", !scene);
      setLayer(plate, scene?.plate);
      if (selfie) setSrc(person, (key && selfie.persons?.[key]) || selfie.person);
      else setLayer(person, personPath);
    };
    if (!waitFor.length) return apply();
    Promise.all(waitFor.map(whenLoaded)).then(apply);
  }

  /** 選好造型但還沒選位置：貼片先停在暫存槽浮著，不要替使用者決定貼哪裡。 */
  function showTray(shape) {
    if (!tray) return;
    if (!shape) { tray.classList.remove("is-on"); return; }
    const next = url(manifest.stickers[shape].src);
    if (traySticker.getAttribute("src") !== next) traySticker.src = next;
    tray.classList.add("is-on");
  }

  /** 內建合照兩個人（W、M）的貼點，或自拍算出來的貼點（一個人的話只有一枚） */
  function spotsAt(position) {
    if (selfie) return selfie.spots[position] ?? [];
    return ["W", "M"].map((who) => {
      const pts = manifest.points[who];
      const spot = pts.at[position];
      return { x: spot.xy[0], y: spot.xy[1], size: pts.size, roll: spot.roll };
    });
  }

  /** 三人以上的自拍（10-02）：頁面上只放了兩枚，不夠就照第一枚多複製幾枚 */
  function ensureStickers(count) {
    while (stickers.length < count) {
      const el = stickers[0].cloneNode(false);
      el.removeAttribute("id");
      el.classList.remove("is-on");
      stickers.at(-1).after(el);
      stickers.push(el);
    }
  }

  function showSticker(shape, position) {
    const spots = shape && position ? spotsAt(position) : [];
    ensureStickers(spots.length);
    stickers.forEach((el, i) => {
      const spot = spots[i];
      if (!spot) { el.classList.remove("is-on"); return; }
      const next = url(manifest.stickers[spot.shape ?? shape].src);   // 自己加的那幾枚有自己的造型
      if (el.getAttribute("src") !== next) el.src = next;
      el.style.width = `${spot.size * 100}%`;
      el.style.setProperty("--size", spot.size);
      el.style.setProperty("--roll", `${-spot.roll}deg`);
      el.style.left = `${spot.x * 100}%`;
      el.style.top = `${spot.y * 100}%`;
      el.classList.add("is-on");
    });
  }

  /** 自拍的人物層是自己產生的圖（blob 網址），不走素材資料夾 */
  function setSrc(el, src) {
    if (el.getAttribute("src") !== src) el.src = src;
    el.classList.add("is-on");
  }

  function setLayer(el, path) {
    if (!path) { el.classList.remove("is-on"); el.removeAttribute("src"); return; }
    const next = url(path);
    if (el.getAttribute("src") !== next) el.src = next;
    el.classList.add("is-on");
  }

  function render(answers) {
    const { scene, shape, position } = answers;
    last = answers;
    showScene(scene);
    showTray(shape && !position ? shape : null);
    showSticker(shape, position);
    root.setAttribute("aria-label", describePreview(answers));
  }

  function useSelfie(next) {
    selfie = next;
    render(last);
  }

  return { render, useSelfie };
}

/** 給螢幕報讀器念的一句話：相機螢幕上現在是什麼。10-06 補圖片描述 */
export function describePreview({ shape, scene, position } = {}) {
  const label = (id, value) => QUESTIONS.find((q) => q.key === id)?.options.find((o) => o.value === value)?.label;
  const parts = [
    label("scene", scene) && `場景：${label("scene", scene)}`,
    label("shape", shape) && `${label("shape", shape)}造型貼`,
    label("position", position) && `貼在${label("position", position)}`,
  ].filter(Boolean);
  return parts.length ? `相機螢幕，${parts.join("，")}` : "相機螢幕";
}
