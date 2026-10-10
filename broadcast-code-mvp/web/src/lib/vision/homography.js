/**
 * 单应矩阵（4 点 DLT）+ 视频像素 <-> 球场英尺 坐标映射
 * 球场平面：0-94 ft（横向）× 0-50 ft（纵向），与 NBA 标准一致。
 * 契约：所有下游坐标一律为 ft，UI 层负责 ×10 转 SVG 单位。
 */

/** 高斯消元解 n 元线性方程组；奇异返回 null */
function solveLinear(A, b) {
  const n = b.length
  const M = A.map((row, i) => row.concat([b[i]]))
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    if (piv !== c) { const tmp = M[piv]; M[piv] = M[c]; M[c] = tmp }
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      if (f === 0) continue
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/**
 * 由 4 组对应点求单应矩阵 H（src -> dst），返回长度 9 的行主序数组
 * @param {number[][]} src 源点 [[x,y],...] 4 个（图像像素）
 * @param {number[][]} dst 目标点 [[x,y],...] 4 个（球场英尺）
 * @returns {number[]|null}
 */
export function computeHomography(src, dst) {
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const sx = src[i][0], sy = src[i][1], dx = dst[i][0], dy = dst[i][1]
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]); b.push(dx)
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]); b.push(dy)
  }
  const h = solveLinear(A, b)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

/** 应用单应矩阵：像素/任意平面坐标 -> 目标平面坐标 */
export function applyH(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8]
  if (Math.abs(d) < 1e-9) return null
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d }
}

/** 3x3 单应求逆 */
export function invertH(H) {
  const a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7], i = H[8]
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det
  ]
}

/**
 * 默认标定：把视频画面矩形映射为一个透视梯形（模拟转播机位），
 * 使「图像四角 -> 球场四角」保持运动方向与比例可读。
 * @param {number} w 视频宽 px
 * @param {number} h 视频高 px
 * @returns {{H:number[], imageQuad:number[][], courtQuad:number[][]}}
 */
export function defaultCalibration(w, h) {
  // 画面四角按转播视角收窄上方（远侧边线），形成合理透视
  const imageQuad = [
    [w * 0.06, h * 0.20],   // 左上 = 球场左底角（远端）
    [w * 0.94, h * 0.20],   // 右上 = 球场右底角（远端）
    [w * 0.99, h * 0.96],   // 右下 = 球场右底角（近端）
    [w * 0.01, h * 0.96]    // 左下 = 球场左底角（近端）
  ]
  const courtQuad = [[0, 0], [94, 0], [94, 50], [0, 50]]
  const H = computeHomography(imageQuad, courtQuad)
  return { H, imageQuad, courtQuad }
}

/** 判断二维点是否落在球场范围（含 12% 容差，用于剔除观众席误检） */
export function insideCourt(p, pad = 0.12) {
  const mx = 94 * pad, my = 50 * pad
  return p && p.x >= -mx && p.x <= 94 + mx && p.y >= -my && p.y <= 50 + my
}

/** 距离（ft） */
export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 最近篮筐（距离 ft） */
export function nearestHoop(p) {
  const L = { x: 5.25, y: 25 }, R = { x: 88.75, y: 25 }
  return dist(p, L) <= dist(p, R) ? { hoop: L, side: 'left' } : { hoop: R, side: 'right' }
}
