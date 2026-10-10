/**
 * 曲线平滑工具（Catmull-Rom -> 三次贝塞尔）
 * 用于把离散采样点（轨迹拖尾 / 速度曲线）渲染成平滑曲线，避免折线锯齿与生硬拐点。
 * 纯函数、无依赖、确定性。
 */

/**
 * 把点序列转成平滑的 SVG path d。
 * @param {Array<[number,number]>} pts 点数组 [[x,y],...]
 * @param {number} [tension] 张力，0~1，越大越平滑（默认 0.5）
 * @param {boolean} [close] 是否闭合
 * @returns {string} SVG path d；点数 < 2 时返回空串
 */
export function catmullRomPath(pts, tension = 0.5, close = false) {
  if (!pts || pts.length < 2) return ''
  const n = pts.length
  const t = tension
  const at = (i) => (close ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])

  let d = `M ${round(pts[0][0])} ${round(pts[0][1])}`
  const last = close ? n - 1 : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1x = p1[0] + ((p2[0] - p0[0]) * t) / 3
    const c1y = p1[1] + ((p2[1] - p0[1]) * t) / 3
    const c2x = p2[0] - ((p3[0] - p1[0]) * t) / 3
    const c2y = p2[1] - ((p3[1] - p1[1]) * t) / 3
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2[0])} ${round(p2[1])}`
  }
  if (close) d += ' Z'
  return d
}

/**
 * 对点序列做滑动平均（去抖动），返回同长度新数组。端点保持不动。
 * @param {Array<[number,number]>} pts
 * @param {number} [win] 窗口半径
 * @returns {Array<[number,number]>}
 */
export function smoothPoints(pts, win = 1) {
  if (!pts || pts.length < 3 || win < 1) return pts || []
  const out = pts.map((p) => [p[0], p[1]])
  for (let i = 1; i < pts.length - 1; i++) {
    let sx = 0
    let sy = 0
    let c = 0
    for (let k = -win; k <= win; k++) {
      const j = i + k
      if (j < 0 || j >= pts.length) continue
      sx += pts[j][0]
      sy += pts[j][1]
      c++
    }
    out[i] = [sx / c, sy / c]
  }
  return out
}

function round(v) {
  return Math.round(v * 100) / 100
}
