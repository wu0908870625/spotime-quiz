/** 背景點陣圖形的 canvas 版本。幾何跟 tools/make_halo.py 出的那張 PNG 同一套
   （見 halo-geometry.js），差別只在這裡每一幀重算，所以圖形可以動。

   兩種造型：
     sphere  點陣球。Guideline 一路在用的那顆。
     ribbon  點陣帶。要不規則形變就用這個，別去推球。

   動態各自開關、互相疊加：
     spin    等速自轉（只對球有效，帶子本來就在流）
     chrome  光源沿噪聲路徑漂移，高光在表面上游走——不動幾何的液態金屬感
     wave    兩道速度不同的行進波交疊掃過，亮度成帶狀流動
     liquid  沿法線被 3D 噪聲推出拉入（只對帶子開放）
     magnet  指標附近的點被推開
     ripple  點一下畫面放一圈擾動波
     fade    邊緣與暗部化開：點的大小跟著明暗縮，掠射角再收一次

   使用者關掉動畫（prefers-reduced-motion）或 canvas 建不起來時就不接手，
   畫面留給 CSS 的靜態 PNG。 */

import { createNoise3 } from "./noise.js";
import { buildPoints, placeSpheres } from "./halo-geometry.js";
import { buildPalettes, createBuckets } from "./halo-shading.js";
import { drawSphere } from "./halo-sphere.js";
import { createRibbon, drawRibbon, RIBBON_CAPACITY } from "./halo-ribbon.js";
import { placeRibbon } from "./halo-ribbon-geometry.js";
import { MAX_RIPPLES, RIPPLE_MS } from "./halo-forces.js";

const SPIN_MS = 150000;         // 自轉一圈。60 秒一圈看得出點在跑，太吵；
                                // 這個速度赤道上的點大約每秒走 20px，只剩「它在轉」
const MAX_DPR = 2;

export const SHAPES = Object.freeze(["sphere", "ribbon", "both"]);

/** 正式站的預設值。demo 頁會整組覆蓋掉。 */
export const DEFAULT_FLAGS = Object.freeze({
  spin: true, chrome: true, wave: true, ripple: true, fade: true,
  // 這兩個 Jimmy 看過 demo 之後決定不用：液態會把球推成四不像，磁吸在手機上沒有游標
  liquid: false, magnet: false,
});

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{reducedMotion?: boolean, shape?: string, flags?: Partial<typeof DEFAULT_FLAGS>}} [options]
 */
export function createHalo(canvas, options = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器沒有 canvas 2d");

  const points = buildPoints();
  const ribbon = createRibbon();
  const palettes = buildPalettes();
  const buckets = createBuckets(Math.max(points.length / 4, RIBBON_CAPACITY));
  const noise3 = createNoise3();

  let spheres = [];
  let ribbonPlace = null;
  let ripples = [];
  let pointer = null;
  let raf = 0;
  let startedAt = 0;
  let paused = false;
  let motion = !(options.reducedMotion ?? prefersReducedMotion());
  let shape = SHAPES.includes(options.shape) ? options.shape : "sphere";
  let flags = { ...DEFAULT_FLAGS, ...options.flags };

  let laidOut = { w: 0, h: 0 };

  function layout() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    laidOut = { w, h };
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spheres = placeSpheres(w, h);
    ribbonPlace = placeRibbon(w, h);
  }

  function draw(elapsed) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // 10-06 Jimmy 在 LINE 裡看到點點被拉成直的橢圓：工具列收起來、畫面變高了，
    // 但沒有觸發 resize，canvas 的像素還是舊的高度，被 CSS 硬拉長。
    // 每幀比一下尺寸，變了就重排（只比兩個數字，不花什麼）。
    if (w !== laidOut.w || h !== laidOut.h) layout();
    ctx.clearRect(0, 0, w, h);

    const on = motion ? flags : { fade: flags.fade };
    const live = ripples.filter((r) => elapsed - r.at < RIPPLE_MS);
    if (live.length !== ripples.length) ripples = live;

    const env = {
      w,
      h,
      elapsed,
      time: elapsed / 1000,
      spin: on.spin ? (elapsed / SPIN_MS) * Math.PI * 2 : 0,
      flags: on,
      ripples: on.ripple ? ripples : [],
      pointer: on.magnet ? pointer : null,
      noise3,
    };

    // 帶子先畫，球疊在上面——兩個都在左下角，球是主角
    if (shape !== "sphere") drawRibbon(ctx, ribbon, buckets, palettes, ribbonPlace, env);
    if (shape !== "ribbon") {
      for (const sphere of spheres) drawSphere(ctx, points, buckets, palettes, sphere, env);
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!startedAt) startedAt = now;
    draw(now - startedAt);
  }

  function start() {
    if (raf || paused) return;
    if (!motion) { draw(0); return; }          // 不動的話畫一張就好
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function restart() {
    stop();
    startedAt = 0;
    ripples = [];
    start();
  }

  function onResize() {
    layout();
    if (!raf) draw(0);
  }

  /** 分頁切走就別再算了。背景分頁的 rAF 本來就會被降到 1–3 fps，
     繼續掛著只是白燒電。 */
  function onVisibility() {
    paused = document.hidden;
    if (paused) stop(); else start();
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** 事件掛在 document 上：canvas 本身是 pointer-events: none，
     不能讓背景擋到選項按鈕。 */
  function onPointerDown(event) {
    if (!motion || !flags.ripple) return;
    const at = performance.now() - startedAt;
    ripples = [...ripples, { ...localPoint(event), at }].slice(-MAX_RIPPLES);
  }

  function onPointerMove(event) {
    pointer = localPoint(event);
  }

  function onPointerLeave() {
    pointer = null;
  }

  layout();
  start();
  window.addEventListener("resize", onResize);
  // 不動的模式沒有每幀檢查，靠這個接住「尺寸變了但沒有 resize 事件」的情況
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  observer?.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerleave", onPointerLeave, { passive: true });

  return {
    destroy() {
      stop();
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    },
    setMotion(on) { motion = on; restart(); },
    setShape(next) { if (SHAPES.includes(next)) { shape = next; restart(); } },
    getShape() { return shape; },
    setFlags(partial) { flags = { ...flags, ...partial }; restart(); },
    getFlags() { return { ...flags }; },
  };
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
