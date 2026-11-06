/** 心情題選完的特效：只出現一下，播完就消失，不留在畫面上、也不進結果圖。
 *
 * 09-30 Jimmy 定案：osd（相機系統字）。正式網址預設就是它；其他四種留著，
 * 網址加 ?moodfx=pop 之類還看得到，?moodfx=none 關掉。
 *
 * 09-30 Jimmy 看完「蓋章」：章後面用不到，不要留著。要只閃一下的特效，一次給多種讓他挑。
 * 用網址參數切換（?moodfx=pop｜osd｜burst｜float｜weather）；
 * 挑定之前正式網址不帶參數＝沒有特效（動畫 demo 要先給他看才上）。
 *   pop      一個大 emoji 在相機螢幕正中間彈出來、停一下、縮掉（像傳貼圖）
 *   osd      相機螢幕跳出一行「MOOD ▸ HAPPY」的系統字，閃兩下就收（像相機切模式）
 *   burst    emoji 從按下的按鈕往四周噴開（像按讚）
 *   float    emoji 從按鈕一路飄上相機螢幕
 *   weather  相機螢幕裡下一陣「天氣」：開心飄蕃茄、無聊閃星星、暗戀冒愛心、難過下雨
 * 換題只等 HOLD_MS（看得到特效開始就換），特效自己在背景播完。樣式在 styles/moodfx.css。
 */
import { PICK_BEAT_MS } from "./config.js";

const MOODS = Object.freeze({
  happy: { emoji: "🍅", label: "HAPPY" },   // 10-12 雲朵款取消，☁️ 換 🍅
  bored: { emoji: "⭐", label: "BORED" },
  crush: { emoji: "🩷", label: "CRUSH" },
  blue: { emoji: "💧", label: "BLUE" },
});
const KINDS = Object.freeze(["pop", "osd", "burst", "float", "weather"]);
const COUNT = Object.freeze({ float: 9, weather: 14, burst: 12 });
const LIFE_MS = Object.freeze({ pop: 900, osd: 1000, burst: 800, float: 1900, weather: 2300 });
const DEFAULT_KIND = "osd";
const HOLD_MS = 260;                 // 換題前等多久：跟其他題的 PICK_BEAT 差不多
const WEATHER = Object.freeze({ happy: "drift", bored: "twinkle", crush: "rise", blue: "rain" });

const rand = (a, b) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function moodKind() {
  const kind = new URLSearchParams(location.search).get("moodfx");
  if (kind === "none") return null;
  return KINDS.includes(kind) ? kind : DEFAULT_KIND;
}

function particle(host, cls, text, vars = {}) {
  const el = document.createElement("i");
  el.className = `moodfx ${cls}`;
  el.textContent = text;
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  el.setAttribute("aria-hidden", "true");
  host.append(el);
  return el;
}

/** 從按鈕的位置飄到相機螢幕上面：粒子掛在 body，用視窗座標 */
function float(lcd, m, btn) {
  const from = btn.getBoundingClientRect();
  const to = lcd.getBoundingClientRect();
  return Array.from({ length: COUNT.float }, (_, i) => particle(document.body, "moodfx--float", m.emoji, {
    "--x0": `${from.left + rand(0.2, 0.8) * from.width}px`,
    "--y0": `${from.top + from.height / 2}px`,
    "--x1": `${to.left + rand(0.1, 0.9) * to.width}px`,
    "--y1": `${to.top + rand(0.05, 0.5) * to.height}px`,
    "--s": rand(0.9, 1.6).toFixed(2),
    "--d": `${i * 70}ms`,
  }));
}

function burst(lcd, m, btn) {
  const r = btn.getBoundingClientRect();
  return Array.from({ length: COUNT.burst }, (_, i) => {
    const a = (i / COUNT.burst) * Math.PI * 2 + rand(-0.2, 0.2);
    const d = rand(50, 110);
    return particle(document.body, "moodfx--burst", m.emoji, {
      "--x0": `${r.left + r.width * 0.82}px`,
      "--y0": `${r.top + r.height / 2}px`,
      "--dx": `${Math.cos(a) * d}px`,
      "--dy": `${Math.sin(a) * d}px`,
      "--s": rand(0.8, 1.3).toFixed(2),
    });
  });
}

/** 螢幕裡下天氣：粒子掛在 lcd 裡面，用百分比 */
function weather(lcd, m, btn, mood) {
  return Array.from({ length: COUNT.weather }, (_, i) => particle(lcd, `moodfx--${WEATHER[mood]}`, m.emoji, {
    "--x": `${rand(4, 96)}%`,
    "--y": `${rand(8, 88)}%`,
    "--s": rand(0.7, 1.5).toFixed(2),
    "--d": `${Math.round(rand(0, 600))}ms`,
    "--i": i,
  }));
}

function pop(lcd, m) {
  return [particle(lcd, "moodfx--pop", m.emoji)];
}

function osd(lcd, m) {
  const el = particle(lcd, "moodfx--osd", "");
  const k = document.createElement("span");
  k.textContent = "MOOD ▸";
  const v = document.createElement("b");
  v.textContent = `${m.label} ${m.emoji}`;
  el.append(k, v);
  return [el];
}

const PLAY = Object.freeze({ pop, osd, burst, float, weather });

/**
 * @param {HTMLElement} lcd 相機螢幕
 * @returns {{ play(mood:string, btn:HTMLElement): Promise<void>, clear(): void }}
 */
export function createMoodFx(lcd, kind = moodKind()) {
  let live = [];

  function clear() {
    live.forEach((el) => el.remove());
    live = [];
  }

  async function play(mood, btn) {
    const m = MOODS[mood];
    if (kind && m && !reduced()) {
      clear();
      const els = PLAY[kind](lcd, m, btn, mood);
      live = els;
      navigator.vibrate?.(8);
      setTimeout(() => {
        els.forEach((el) => el.remove());
        live = live.filter((el) => !els.includes(el));
      }, LIFE_MS[kind]);
    }
    await wait(kind ? HOLD_MS : PICK_BEAT_MS);   // 沒開特效就跟其他題一樣只停一拍
  }

  return { play, clear };
}
