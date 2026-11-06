/** 兩種外力：游標磁吸、點擊擾動。兩者都在「螢幕座標」上作用，
   所以球和帶可以共用，不用管各自的 3D 座標系。 */

const MAGNET_RADIUS = 0.55;     // 吸附半徑，佔特徵半徑比例
const MAGNET_PUSH = 0.10;

export const RIPPLE_MS = 1200;
const RIPPLE_SPEED = 1.15;      // 波前每秒掃過的距離，單位是特徵半徑
const RIPPLE_WIDTH = 0.16;
export const RIPPLE_PUSH = 0.085;
export const RIPPLE_GLOW = 0.42;  // 只有位移太隱晦，波前要順便提亮才看得到
export const MAX_RIPPLES = 4;

/** 指標附近的點被往外推，離開就彈回去。 */
export function magnetAt(pointer, sx, sy, radius) {
  const dx = sx - pointer.x;
  const dy = sy - pointer.y;
  const dist = Math.hypot(dx, dy);
  const reach = MAGNET_RADIUS * radius;
  if (dist > reach || dist < 1e-3) return { x: 0, y: 0 };
  const falloff = 1 - dist / reach;
  const push = falloff * falloff * MAGNET_PUSH * radius;
  return { x: (dx / dist) * push, y: (dy / dist) * push };
}

/** 一圈往外跑的波，經過的點被往外推一下、順便亮一下再回位。
   高斯形的波前，所以只有波前附近會動，其他地方保持原樣。 */
export function rippleAt(ripples, sx, sy, elapsed, radius) {
  let ax = 0;
  let ay = 0;
  let push = 0;
  let glow = 0;
  for (const ripple of ripples) {
    const age = (elapsed - ripple.at) / RIPPLE_MS;
    if (age < 0 || age > 1) continue;
    const dx = sx - ripple.x;
    const dy = sy - ripple.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) continue;
    const front = RIPPLE_SPEED * radius * age;
    const band = (dist - front) / (RIPPLE_WIDTH * radius);
    const wave = Math.exp(-band * band);
    if (wave < 0.01) continue;
    const decay = (1 - age) * (1 - age);
    const strength = wave * decay;
    ax += (dx / dist) * strength;
    ay += (dy / dist) * strength;
    push += strength * RIPPLE_PUSH * radius;
    glow = Math.max(glow, strength);
  }
  if (glow === 0) return { nx: 0, ny: 0, push: 0, glow: 0 };
  const len = Math.hypot(ax, ay) || 1;
  return { nx: ax / len, ny: ay / len, push, glow };
}
