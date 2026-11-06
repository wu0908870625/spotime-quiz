/** 拖貼片用到的純計算：合法範圍、雙指。不碰畫面，測試直接吃這支。 */
import { clamp } from "../physics.js";

const ASPECT = 0.8;                 // 框的寬高比（寬 / 高），跟 render.js 一樣
const EDGE_MARGIN = 0.018;          // 貼片離照片邊緣至少留這麼多（框寬為 1）
export const SIZE_RANGE = Object.freeze({ min: 0.7, max: 1.4 });   // 雙指縮放：自動大小的幾倍

/**
 * 貼片中心可以放的範圍：照片往內縮一個貼片半徑，整片一定留在照片裡、不會被裁掉。
 * 轉了角度的貼片外框會變大，所以取寬、高裡比較長的那邊當半徑。
 * @param ratio 貼片圖的高 / 寬
 */
export function spotBounds(spot, ratio) {
  const rx = (spot.size / 2) * Math.max(1, ratio) + EDGE_MARGIN;
  const ry = rx * ASPECT;
  return { x: [rx, 1 - rx], y: [ry, 1 - ry] };
}

export function clampSpot(spot, ratio) {
  const b = spotBounds(spot, ratio);
  return { ...spot, x: clamp(spot.x, ...b.x), y: clamp(spot.y, ...b.y) };
}

/**
 * 修圖畫面左下角的「+ADD」膠囊蓋在照片上（10-12）：貼片中心放到膠囊底下，手指就點不到它了，
 * 存圖時卻還在。這種時候把貼片推到膠囊正上方，下緣剛好碰到膠囊頂。
 * @param box 膠囊在框座標的 { left, right, top }（框寬、框高都是 1）；沒有膠囊傳 null
 */
export function clearOf(spot, ratio, box) {
  if (!box || spot.x < box.left || spot.x > box.right || spot.y < box.top) return spot;
  const half = (spot.size / 2) * ratio * ASPECT;
  return { ...spot, y: Math.max(spotBounds(spot, ratio).y[0], box.top - half) };
}

/** 兩根手指的中點、距離、角度（度，螢幕座標，順時針為正） */
export function pinchOf(a, b) {
  return {
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/** 兩次量到的角度差，換成 -180～180，手指轉過 180 度那條線也不會突然跳一圈 */
export function angleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

/**
 * 雙指：中點移多少、貼片就移多少；轉多少、貼片就轉多少；張開多少、貼片就放大多少。
 * roll 是逆時針為正，螢幕角度是順時針為正，所以要減。
 * @param start 兩指剛放上去時的 { pinch, spot, base }；base 是自動算的大小
 * @param now 目前的 pinchOf()
 * @param rect 預覽在螢幕上的大小（CSS px）
 */
export function applyPinch(start, now, rect) {
  const k = start.pinch.dist > 0 ? now.dist / start.pinch.dist : 1;
  return {
    ...start.spot,
    x: start.spot.x + (now.mid.x - start.pinch.mid.x) / rect.width,
    y: start.spot.y + (now.mid.y - start.pinch.mid.y) / rect.height,
    roll: start.spot.roll - angleDelta(start.pinch.angle, now.angle),
    size: clamp(start.spot.size * k, start.base * SIZE_RANGE.min, start.base * SIZE_RANGE.max),
  };
}
