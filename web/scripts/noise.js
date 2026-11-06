/** 3D simplex noise。背景球的變形要「看起來沒有規律」，
   用正弦波疊出來的會被眼睛抓到週期，噪聲不會。

   這是 Ken Perlin simplex noise 的標準實作（Stefan Gustavson 整理的版本），
   演算法本身不是這裡發明的，照抄就對了，不要自己改梯度表。 */

const GRAD = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const F3 = 1 / 3;
const G3 = 1 / 6;

/** 固定亂數種子，這樣每次重整看到的變形都一樣，比對改動時才有基準。 */
function buildPermutation(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;

  let state = seed >>> 0;
  for (let i = 255; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;   // 線性同餘，夠用
    const j = state % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }

  // 接成 512 長，取值時就不用每次做 & 255
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
}

/**
 * @param {number} [seed]
 * @returns {(x: number, y: number, z: number) => number} 值域大約 -1 到 1
 */
export function createNoise3(seed = 20261201) {
  const { perm, permMod12 } = buildPermutation(seed);

  return function noise3(x, y, z) {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const g0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
    const g1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
    const g2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
    const g3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;

    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      t0 *= t0;
      n += t0 * t0 * (GRAD[g0] * x0 + GRAD[g0 + 1] * y0 + GRAD[g0 + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      t1 *= t1;
      n += t1 * t1 * (GRAD[g1] * x1 + GRAD[g1 + 1] * y1 + GRAD[g1 + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      t2 *= t2;
      n += t2 * t2 * (GRAD[g2] * x2 + GRAD[g2 + 1] * y2 + GRAD[g2 + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      t3 *= t3;
      n += t3 * t3 * (GRAD[g3] * x3 + GRAD[g3 + 1] * y3 + GRAD[g3 + 2] * z3);
    }
    return 32 * n;
  };
}
