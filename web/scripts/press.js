/** 相機按鍵的手感（10-02 Jimmy：按下去回彈太快，不像真的；快門要有「喀擦」感）。
 *
 * 真的按鍵是：手指一碰很快就到底，放開時彈簧慢慢推回來、最後稍微過頭一點。
 * 所以按下用 CSS 的 .is-down（快，見 camedit.css），放開時至少壓滿 MIN_HOLD_MS 才拿掉，
 * 回彈的速度和過衝寫在 CSS 的 transition 裡。手指點得再快，也看得到按鍵沉下去。
 *
 * 快門另外有聲音：用 Web Audio 合成兩下短促的雜訊（反光鏡「喀」、快門簾「擦」），不另外載音檔。
 * iPhone 開靜音時 Web Audio 本來就不出聲，不用另外處理。
 */
const MIN_HOLD_MS = 110;          // 最短壓住多久才放開（點太快的話按鍵還沒沉下去就彈回來）
const CLICK = Object.freeze({     // 快門聲：兩下雜訊，間隔是一般數位相機假快門聲的節奏
  gapMs: 75,
  first: { freq: 2400, ms: 18, gain: 0.32 },
  second: { freq: 4200, ms: 26, gain: 0.26 },
});

/**
 * 讓按鈕有按下去、停一下、再彈回來的手感。
 * @param {HTMLElement} el
 * @param {{ onDown?: (event: PointerEvent) => void }} [opts]
 * @returns {() => void} 拿掉監聽
 */
export function pressable(el, { onDown } = {}) {
  let downAt = 0;
  let timer = 0;

  function down(event) {
    if (event.button > 0) return;
    clearTimeout(timer);
    downAt = performance.now();
    el.classList.add("is-down");
    onDown?.(event);
  }
  function up() {
    if (!el.classList.contains("is-down")) return;
    const left = MIN_HOLD_MS - (performance.now() - downAt);
    timer = setTimeout(() => el.classList.remove("is-down"), Math.max(0, left));
  }

  el.addEventListener("pointerdown", down);
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => el.addEventListener(type, up));
  return () => {
    clearTimeout(timer);
    el.removeEventListener("pointerdown", down);
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => el.removeEventListener(type, up));
  };
}

/** 重新播一次 CSS 動畫：拿掉 class、讓瀏覽器重算一次、再加回去 */
export function replayClass(el, name, ms) {
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
  clearTimeout(el[`_${name}`]);
  el[`_${name}`] = setTimeout(() => el.classList.remove(name), ms);
}

let audio = null;

/** 第一次按的時候才建 AudioContext（瀏覽器規定要在使用者點擊裡建） */
function context() {
  if (audio) return audio;
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audio = new Ctx();
  } catch (error) {
    console.warn("沒有聲音可用，快門改成只有畫面", error);
    return null;
  }
  return audio;
}

/** 在使用者手指碰到時先叫醒聲音（iOS 要在手勢裡 resume，晚一點才播才不會沒聲音） */
export function primeSound() {
  const ctx = context();
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

function burst(ctx, at, { freq, ms, gain }) {
  const length = Math.ceil(ctx.sampleRate * ms / 1000);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;   // 一下就衰減掉，聽起來是「喀」不是「沙」
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = freq;
  band.Q.value = 1.4;
  const amp = ctx.createGain();
  amp.gain.value = gain;
  src.connect(band).connect(amp).connect(ctx.destination);
  src.start(at);
}

/** 快門聲「喀擦」 */
export function playClick() {
  const ctx = context();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    burst(ctx, now, CLICK.first);
    burst(ctx, now + CLICK.gapMs / 1000, CLICK.second);
  } catch (error) {
    console.warn("快門聲播不出來", error);
  }
}
