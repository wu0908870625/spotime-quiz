/** 手勢和彈簧的數學（09-30 專家報告，照 apple-design 的做法）。
 *
 * 彈簧用 Apple 的兩個參數：damping（阻尼比，1＝不回彈，越小越彈）和 response（秒，越小越快）。
 * 好處是隨時可以改目標：從「畫面上目前的值和速度」接著走，連點、半路抓住都不會跳。
 */
const MAX_DT = 1 / 30;            // 分頁切走再回來，不要一步跳太遠
const STEP = 1 / 240;             // 積分步長，參數再硬也不會爆掉

/** 往 target 走一段時間 dt（秒）。回傳新的 { x, v }，不改原本的。 */
export function springStep({ x, v }, target, { damping = 1, response = 0.4 }, dt) {
  const k = (2 * Math.PI / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  let px = x;
  let pv = v;
  for (let t = 0; t < Math.min(dt, MAX_DT); t += STEP) {
    const h = Math.min(STEP, dt - t);
    pv += (-k * (px - target) - c * pv) * h;
    px += pv * h;
  }
  return { x: px, v: pv };
}

export function isSettled({ x, v }, target, eps) {
  return Math.abs(x - target) < eps && Math.abs(v) < eps * 10;
}

/** 超過邊界時越拉越緊（iOS 捲到底的回彈）。overshoot 與 dimension 同單位。 */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** 範圍內照走，範圍外套 rubberband */
export function softClamp(value, lo, hi, dimension) {
  if (value < lo) return lo - rubberband(lo - value, dimension);
  if (value > hi) return hi + rubberband(value - hi, dimension);
  return value;
}

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** 放手之後慣性會滑多遠（Apple 範例程式的公式）。velocity 單位 /秒，回傳同單位的距離 */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** 記最近幾筆位置，放手時算速度（單位 /秒）。只看最後 100ms，停住再放手就是 0。 */
export function createVelocity(windowMs = 100) {
  let samples = [];
  return {
    add(x, y, t) {
      samples = [...samples.filter((s) => t - s.t <= windowMs), { x, y, t }];
    },
    read(now) {
      const recent = samples.filter((s) => now - s.t <= windowMs);
      if (recent.length < 2) return { x: 0, y: 0 };
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = (b.t - a.t) / 1000;
      return dt > 0 ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt } : { x: 0, y: 0 };
    },
    reset() { samples = []; },
  };
}

/**
 * 一個會自己跑的彈簧：set() 改目標，從目前的值和速度接著走。
 * 每一格呼叫 onFrame(value)，停下來時呼叫 onRest(value)。
 */
export function createSpring(initial, config, { onFrame, onRest = () => {}, eps = 0.5 } = {}) {
  let state = { x: initial, v: 0 };
  let target = initial;
  let raf = 0;
  let last = 0;

  function tick(now) {
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    state = springStep(state, target, config, dt);
    if (isSettled(state, target, eps)) {
      state = { x: target, v: 0 };
      raf = 0;
      onFrame(state.x);
      onRest(state.x);
      return;
    }
    onFrame(state.x);
    raf = requestAnimationFrame(tick);
  }

  return {
    set(next, velocity = null) {
      target = next;
      if (velocity !== null) state = { ...state, v: velocity };
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    },
    jump(value) {
      cancelAnimationFrame(raf);
      raf = 0;
      state = { x: value, v: 0 };
      target = value;
      onFrame(value);
    },
    value: () => state.x,
  };
}
