// 唯一随机源 —— dataset-contract §4.2 逐字实现的 mulberry32；禁止 Math.random()/Date.now()
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (lo, v, hi) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v) => clamp(0, v, 1);
export const round1 = (v) => Math.round(v * 10) / 10;
export const round2 = (v) => Math.round(v * 100) / 100;
export const round3 = (v) => Math.round(v * 1000) / 1000;
export const round100 = (v) => Math.round(v / 100) * 100;
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
