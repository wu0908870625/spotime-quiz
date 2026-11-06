/** 畫一顆點陣球。幾何在 halo-geometry.js，明暗在 halo-shading.js，
   這裡只負責「把球面上的點投影到畫面、決定它多亮多大」。

   球上不做液態變形——把球推成不規則的塊之後就不是球了，
   那種形變要看 halo-ribbon.js 的帶狀。 */

import { DOT, DOT_MIN_RATIO, TILT } from "./halo-geometry.js";
import {
  luminance, halftoneScale, lightVector, resetBuckets, pushDot, flushBuckets,
} from "./halo-shading.js";
import { magnetAt, rippleAt, RIPPLE_PUSH, RIPPLE_GLOW } from "./halo-forces.js";

const WAVE_GLOW = 0.5;          // 波帶提亮的強度
const WAVE_SHARP = 3;           // 次方愈高，亮帶愈窄

/** 掠射角（tz 小＝靠近球緣）開始化開的門檻。
   球緣的點縮到看不見，輪廓就不是一條清楚的弧——Guideline 的點點球都是這樣收邊的。 */
const RIM = 0.34;

export function drawSphere(ctx, points, buckets, palettes, sphere, env) {
  const { cx, cy, r, opacity, lightRoll } = sphere;
  const { w, h, time, spin, flags, ripples, pointer, noise3 } = env;

  const soft = !!flags.fade;
  const sinT = Math.sin(TILT);
  const cosT = Math.cos(TILT);
  const sinS = Math.sin(spin);
  const cosS = Math.cos(spin);
  const light = lightVector(flags.chrome ? time : null, lightRoll, noise3);
  const dotBase = DOT * r;

  // 只露出角落一塊弧，畫面外的點佔多數。先用還沒被外力推過的位置粗篩，
  // 篩掉的點連光照都不用算——這是這支能跑到 60fps 的主要原因。
  const slack = dotBase * 2 + RIPPLE_PUSH * r;

  resetBuckets(buckets);

  for (let i = 0; i < points.length; i += 4) {
    const sinLat = points[i];
    const ring = points[i + 1];
    const sinLon = points[i + 2];
    const cosLon = points[i + 3];

    // 自轉：經度加上 spin，用和角公式展開，免得在迴圈裡呼叫三角函數
    const x = ring * (sinLon * cosS + cosLon * sinS);
    const y = sinLat;
    const z = ring * (cosLon * cosS - sinLon * sinS);

    const ty = y * cosT - z * sinT;
    const tz = y * sinT + z * cosT;
    if (tz <= 0) continue;                       // 背面的點不畫

    let sx = cx + x * r;
    if (sx < -slack || sx > w + slack) continue;
    let sy = cy - ty * r;
    if (sy < -slack || sy > h + slack) continue;

    let dot = dotBase * (DOT_MIN_RATIO + (1 - DOT_MIN_RATIO) * tz);
    let glow = 0;

    if (flags.wave) {
      // 兩道頻率互質的行進波疊在一起，看起來就不會有週期
      const band = Math.sin(3.4 * x + 2.1 * ty - time * 1.3)
                 + Math.sin(2.0 * z - 4.3 * x + time * 0.81);
      const strength = Math.pow(Math.max(0, band * 0.5), WAVE_SHARP);
      glow += strength * WAVE_GLOW;
      dot *= 1 + strength * 0.25;
    }

    if (pointer) {
      const push = magnetAt(pointer, sx, sy, r);
      sx += push.x;
      sy += push.y;
    }

    if (ripples.length) {
      const wave = rippleAt(ripples, sx, sy, env.elapsed, r);
      if (wave.glow > 0) {
        sx += wave.nx * wave.push;
        sy += wave.ny * wave.push;
        dot *= 1 + wave.glow * 0.35;
        glow += wave.glow * RIPPLE_GLOW;
      }
    }

    const lum = luminance(x * light.x + ty * light.y + tz * light.z, glow);
    dot *= halftoneScale(lum, soft);
    if (soft && tz < RIM) {
      const k = tz / RIM;
      dot *= k * k;
    }

    pushDot(buckets, lum, sx, sy, dot);
  }

  flushBuckets(ctx, buckets, soft ? palettes.soft : palettes.flat, opacity);
}
