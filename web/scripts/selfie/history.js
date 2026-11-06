/** 修圖的「回復上一步」（10-06 Jimmy：機身第三顆鍵從「還原」改成這個）。
 *
 * 每一步存的是那一刻所有貼片的位置（有 id，才認得出是哪一枚被加、被丟）。
 * 拖一次、兩指轉／縮一次、按一下旋轉鍵、多加一枚、丟掉一枚，各算一步。
 */

export const HISTORY_LIMIT = 20;
const EPS = Object.freeze({ x: 0.0005, y: 0.0005, size: 0.0003, roll: 0.5 });

export function createHistory(limit = HISTORY_LIMIT) {
  let stack = [];
  return {
    push(spots) {
      stack = [...stack, spots.map((s) => Object.freeze({ ...s }))].slice(-limit);
    },
    pop() {
      const top = stack.at(-1);
      stack = stack.slice(0, -1);
      return top;
    },
    get size() { return stack.length; },
  };
}

/** 兩個時間點的貼片看起來一不一樣：同一批 id、每一枚的位置角度大小都差不多 */
export function sameSpots(a, b) {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((s) => [s.id, s]));
  return a.every((s) => {
    const t = byId.get(s.id);
    return Boolean(t)
      && ["x", "y", "size"].every((p) => Math.abs(s[p] - t[p]) <= EPS[p])
      && Math.abs(turn(s.roll - t.roll)) <= EPS.roll;
  });
}

/** 角度差收進 -180～180，轉一整圈算沒轉 */
function turn(deg) {
  return ((deg % 360) + 540) % 360 - 180;
}
