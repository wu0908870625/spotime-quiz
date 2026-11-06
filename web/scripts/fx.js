/** transitions.dev 挑出來的幾個動效（09-30 Jimmy 看過 ?demo=fx，全部留，已上線）。
 *   數字滾動      結果頁「11%」每一位數像轉輪一樣滾到定值（Spinning counter）
 *   換題模糊      題目換下一題時帶一點模糊（Text states swap with blur）
 *   email 抖動／打勾  格式錯了輸入框抖一下；送出成功畫一個勾（Error shake／Success check）
 *   引導條彈出    IG 限動引導條彈進來、打勾（Toast）
 *   照片浮現      自拍分析中，照片從雜訊點慢慢浮出來；「正在看這張照片」字上有一道光（Image generation placeholder／Shimmer text）
 * 大部分只是 CSS（body.fx 底下，motion.css），這支只放要算的：數字轉輪、雜訊點。
 */
const REEL_MS = 1100;
const REEL_STAGGER_MS = 90;
const DOT_GAP = 7;                  // 雜訊點的間距（CSS px）
const RESOLVE_MS = 1500;            // 雜訊點散完一輪

export const fxOn = () => document.body.classList.contains("fx");
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 把句子裡第一個數字換成轉輪。沒有數字、沒開 fx 或減少動態就直接換字。 */
export function spinLine(el, text) {
  const m = text.match(/\d+(?:\.\d+)?/);
  if (!fxOn() || reduced() || !m) {
    el.textContent = text;
    return;
  }
  const num = document.createElement("span");
  num.className = "spin";
  num.setAttribute("aria-hidden", "true");
  let digit = 0;
  for (const ch of m[0]) {
    if (!/\d/.test(ch)) {
      const dot = document.createElement("span");
      dot.className = "spin__dot";
      dot.textContent = ch;
      num.append(dot);
      continue;
    }
    const reel = document.createElement("span");
    reel.className = "spin__reel";
    const strip = document.createElement("span");
    strip.className = "spin__strip";
    // 0～9 排兩輪，停在第二輪：看起來真的轉了一圈多
    strip.append(...Array.from({ length: 20 }, (_, i) => {
      const d = document.createElement("span");
      d.textContent = String(i % 10);
      return d;
    }));
    strip.style.setProperty("--to", String(10 + Number(ch)));
    strip.style.setProperty("--delay", `${digit * REEL_STAGGER_MS}ms`);
    strip.style.setProperty("--dur", `${REEL_MS}ms`);
    reel.append(strip);
    num.append(reel);
    digit += 1;
  }
  el.setAttribute("aria-label", text);
  el.replaceChildren(text.slice(0, m.index), num, text.slice(m.index + m[0].length));
  requestAnimationFrame(() => requestAnimationFrame(() => num.classList.add("is-on")));
}

/**
 * 自拍分析中：照片上蓋一層雜訊點，一顆一顆散掉、照片浮出來，一輪散完再蓋回去重來，
 * 直到分析畫面收起來。
 * @param section 分析中的那個畫面（[data-step=busy]），用 hidden 判斷開關
 * @param thumb 照片外框（.selfie__thumb）
 */
export function watchResolve(section, thumb) {
  if (!section || !thumb) return;
  let raf = 0;
  let canvas = null;

  function start() {
    if (!fxOn() || reduced() || raf) return;
    canvas = document.createElement("canvas");
    canvas.className = "gen-dots";
    thumb.append(canvas);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let dots = [];
    const t0 = performance.now();
    const draw = (now) => {
      const { width, height } = thumb.getBoundingClientRect();
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        dots = [];
        for (let y = DOT_GAP / 2; y < height; y += DOT_GAP) {
          for (let x = DOT_GAP / 2; x < width; x += DOT_GAP) dots.push({ x, y, t: Math.random() });
        }
      }
      const loop = ((now - t0) % (RESOLVE_MS * 2)) / RESOLVE_MS;   // 0→2：散開，再蓋回來
      const p = loop <= 1 ? loop : 2 - loop;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = `rgba(236, 237, 240, ${0.75 * (1 - p)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(60, 62, 70, .55)";
      for (const d of dots) {
        if (d.t < p) continue;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    canvas?.remove();
    canvas = null;
  }

  new MutationObserver(() => (section.hidden ? stop() : start()))
    .observe(section, { attributes: true, attributeFilter: ["hidden"] });
}
