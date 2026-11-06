/** 畫一條點陣帶。液態變形（沿面法線被噪聲推出拉入）放在這裡，
   因為帶子本來就沒有「正確形狀」，推歪了還是帶子；球推歪了就不是球。 */

import {
  NU, NV, FRAME_STRIDE, RIBBON_DOT, buildRibbonPoints, createFrameBuffer, ribbonFrames,
} from "./halo-ribbon-geometry.js";
import {
  luminance, halftoneScale, lightVector, resetBuckets, pushDot, flushBuckets,
} from "./halo-shading.js";
import { magnetAt, rippleAt, RIPPLE_PUSH, RIPPLE_GLOW } from "./halo-forces.js";

const LIQUID_SCALE = 1.5;       // 噪聲的空間頻率，愈大形變愈碎
const LIQUID_SPEED = 0.22;      // 形變演進速度
const LIQUID_AMP = 0.042;       // 沿法線最多推多遠，佔特徵半徑比例。
                                // 超過點間距的一半，帶子就被推散成一把點了

const WAVE_GLOW = 0.55;
const WAVE_SHARP = 3;

const BACK_FACE = 0.42;         // 背面留多少光。全黑會讓帶子翻面時整段消失
const DEPTH_MIN = 0.66;         // 遠端的點縮到多小

/** 邊緣化開：v 是跨寬度座標，±1 是帶緣。1 - v² 讓點在帶緣縮到 0，
   帶子就沒有一條銳利的邊，跟球的 RIM 是同一件事。 */
function edgeFade(v) {
  const k = 1 - v * v;
  return k > 0 ? Math.pow(k, 0.65) : 0;
}

export function createRibbon() {
  return { points: buildRibbonPoints(), frames: createFrameBuffer() };
}

export function drawRibbon(ctx, ribbon, buckets, palettes, place, env) {
  const { cx, cy, r, opacity, roll } = place;
  const { w, h, time, flags, ripples, pointer, noise3 } = env;
  const { iu, du, v } = ribbon.points;

  const soft = !!flags.fade;
  const liquid = !!flags.liquid;
  const light = lightVector(flags.chrome ? time : null, 0, noise3);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const dotBase = RIBBON_DOT * r;
  const slack = dotBase * 2 + (liquid ? LIQUID_AMP * r : 0) + RIPPLE_PUSH * r;

  // 中心線只跟 u 有關，先一次算完 NU 組，下面每個點就只剩線性組合
  ribbonFrames(time, ribbon.frames);
  resetBuckets(buckets);

  for (let i = 0; i < iu.length; i += 1) {
    const vv = v[i];
    const fade = edgeFade(vv);
    if (fade <= 0) continue;

    const at = iu[i] * FRAME_STRIDE;
    const step = du[i];

    let px = ribbon.frames[at] + ribbon.frames[at + 3] * step + ribbon.frames[at + 6] * vv;
    let py = ribbon.frames[at + 1] + ribbon.frames[at + 4] * step + ribbon.frames[at + 7] * vv;
    let pz = ribbon.frames[at + 2] + ribbon.frames[at + 5] * step + ribbon.frames[at + 8] * vv;

    // 先用還沒形變的位置粗篩。帶子大半在畫面外，篩掉的點連噪聲都不用算。
    let sx = cx + (px * cosR - py * sinR) * r;
    if (sx < -slack || sx > w + slack) continue;
    let sy = cy - (px * sinR + py * cosR) * r;
    if (sy < -slack || sy > h + slack) continue;

    const fx = ribbon.frames[at + 9];
    const fy = ribbon.frames[at + 10];
    const fz = ribbon.frames[at + 11];

    if (liquid) {
      // 噪聲在世界座標取樣，所以帶子是流過這片形變場，不是帶著形變一起走
      const n = noise3(
        px * LIQUID_SCALE,
        py * LIQUID_SCALE + time * LIQUID_SPEED,
        pz * LIQUID_SCALE,
      );
      const push = LIQUID_AMP * n;
      px += fx * push; py += fy * push; pz += fz * push;
      sx = cx + (px * cosR - py * sinR) * r;
      sy = cy - (px * sinR + py * cosR) * r;
    }

    let dot = dotBase * (DEPTH_MIN + (1 - DEPTH_MIN) * (pz * 0.5 + 0.5));
    let glow = 0;

    if (flags.wave) {
      const band = Math.sin(3.1 * px + 2.4 * py - time * 1.3)
                 + Math.sin(2.2 * pz - 4.1 * px + time * 0.79);
      const strength = Math.pow(Math.max(0, band * 0.5), WAVE_SHARP);
      glow += strength * WAVE_GLOW;
      dot *= 1 + strength * 0.3;
    }

    if (pointer) {
      const push = magnetAt(pointer, sx, sy, r * 0.5);
      sx += push.x;
      sy += push.y;
    }

    if (ripples.length) {
      const wave = rippleAt(ripples, sx, sy, env.elapsed, r * 0.5);
      if (wave.glow > 0) {
        sx += wave.nx * wave.push;
        sy += wave.ny * wave.push;
        dot *= 1 + wave.glow * 0.35;
        glow += wave.glow * RIPPLE_GLOW;
      }
    }

    // 法線也要跟著 roll 轉，不然帶子轉了、光沒跟著轉，明暗會對不上形狀
    const nx = fx * cosR - fy * sinR;
    const ny = fx * sinR + fy * cosR;
    const facing = nx * light.x + ny * light.y + fz * light.z;
    const shade = facing >= 0 ? facing : -facing * BACK_FACE;

    const lum = luminance(shade, glow);
    dot *= halftoneScale(lum, soft) * (soft ? fade : 1);

    pushDot(buckets, lum, sx, sy, dot);
  }

  flushBuckets(ctx, buckets, soft ? palettes.soft : palettes.flat, opacity);
}

export const RIBBON_CAPACITY = NU * NV;
