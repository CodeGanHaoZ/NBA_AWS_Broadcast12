/**
 * 目标追踪层
 * A. MultiTracker —— 检测框数据关联（模型通道）：预测位置 + 贪心最近邻 + ID 生命周期
 * B. nccTrack     —— 归一化互相关模板匹配（算法兜底通道）：人工点选少量锚点后逐帧跟随
 * 全部纯 JS，无外部依赖。
 */

const CLS_PERSON = 0
const CLS_BALL = 32

export class MultiTracker {
  /**
   * @param {{maxAge?:number, gatePerson?:number, gateBall?:number}} opts
   * gate 单位为像素，按视频宽度动态缩放（见 scaleGate）
   */
  constructor(opts = {}) {
    this.tracks = []
    this.nextId = 1
    this.maxAge = opts.maxAge ?? 8
    this.gatePerson = opts.gatePerson ?? 0.10
    this.gateBall = opts.gateBall ?? 0.16
    this.frameW = 1280
  }

  /** 按视频宽度缩放匹配门限 */
  scaleGate(w) {
    this.frameW = w
  }

  #gate(cls) {
    return (cls === CLS_BALL ? this.gateBall : this.gatePerson) * this.frameW
  }

  /**
   * 推进一步
   * @param {number} t 时间戳 ms
   * @param {Array<{x:number,y:number,w:number,h:number,score:number,cls:number}>} dets 图像像素坐标
   * @returns {Array<object>} 当前确认的轨迹
   */
  update(t, dets) {
    const used = new Uint8Array(dets.length)
    // 先按类别建代价矩阵，贪心匹配
    for (const cls of [CLS_PERSON, CLS_BALL]) {
      const items = []
      for (let i = 0; i < dets.length; i++) if (dets[i].cls === cls) items.push(i)
      const live = this.tracks.filter(tr => tr.cls === cls && tr.sinceUpdate <= this.maxAge)
      const pairs = []
      for (const tr of live) {
        const px = tr.cx + tr.vx * ((t - tr.t) / 1000)
        const py = tr.cy + tr.vy * ((t - tr.t) / 1000)
        for (const di of items) {
          if (used[di]) continue
          const d = dets[di]
          const dcx = d.x + d.w / 2, dcy = d.y + d.h / 2
          const dd = Math.hypot(px - dcx, py - dcy)
          const g = this.#gate(cls)
          if (dd > g) continue
          // 代价：距离归一 + 尺度差异
          const scalePen = Math.abs(d.w - tr.w) / Math.max(d.w, tr.w, 1)
          pairs.push({ tr, di, cost: dd / g + scalePen * 0.35 })
        }
      }
      pairs.sort((a, b) => a.cost - b.cost)
      for (const p of pairs) {
        if (used[p.di] || p.tr.sinceUpdate === 0) continue
        used[p.di] = 1
        this.#applyDetection(p.tr, dets[p.di], t)
      }
    }
    // 未匹配的轨迹老化
    for (const tr of this.tracks) {
      if (tr.t !== t) tr.sinceUpdate++
    }
    // 新目标
    for (let i = 0; i < dets.length; i++) {
      if (used[i]) continue
      const d = dets[i]
      this.tracks.push({
        id: `${d.cls === CLS_BALL ? 'B' : 'P'}${this.nextId++}`,
        cls: d.cls,
        cx: d.x + d.w / 2,
        cy: d.y + d.h / 2,
        vx: 0, vy: 0,
        w: d.w, h: d.h,
        score: d.score,
        hits: 1,
        sinceUpdate: 0,
        t,
        path: [{ t, x: d.x + d.w / 2, y: d.y + d.h / 2 }]
      })
    }
    // 淘汰长期丢失
    this.tracks = this.tracks.filter(tr => tr.sinceUpdate <= this.maxAge)
    return this.tracks.filter(tr => tr.hits >= 2)
  }

  #applyDetection(tr, d, t) {
    const nx = d.x + d.w / 2, ny = d.y + d.h / 2
    const dt = Math.max(1, t - tr.t) / 1000
    const nvx = (nx - tr.cx) / dt, nvy = (ny - tr.cy) / dt
    // 指数平滑，抑制抖动
    tr.vx = tr.vx * 0.45 + nvx * 0.55
    tr.vy = tr.vy * 0.45 + nvy * 0.55
    tr.cx = nx; tr.cy = ny
    tr.w = tr.w * 0.6 + d.w * 0.4
    tr.h = tr.h * 0.6 + d.h * 0.4
    tr.score = d.score
    tr.hits++
    tr.sinceUpdate = 0
    tr.t = t
    tr.path.push({ t, x: nx, y: ny })
  }
}

/**
 * 归一化互相关模板匹配（算法兜底）
 * 在 cur 图中、以 (cx,cy) 为中心、半径 search 的窗口内，寻找与 prev 图中
 * 以 (cx,cy) 为中心、半径 radius 的模板最相似的偏移。
 * @param {Uint8Array} prev 上一帧灰度（宽 w 高 h）
 * @param {Uint8Array} cur  当前帧灰度（同尺寸）
 * @param {number} w
 * @param {number} h
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius 模板半径（像素）
 * @param {number} search 搜索半径（像素）
 * @returns {{x:number,y:number,score:number}}
 */
export function nccTrack(prev, cur, w, h, cx, cy, radius = 10, search = 14) {
  const r = radius
  const tpl = new Float32Array((2 * r + 1) * (2 * r + 1))
  let tplMean = 0, tplCount = 0
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(cx) + dx, y = Math.round(cy) + dy
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const v = prev[y * w + x]
      tpl[(dy + r) * (2 * r + 1) + (dx + r)] = v
      tplMean += v; tplCount++
    }
  }
  if (tplCount === 0) return { x: cx, y: cy, score: 0 }
  tplMean /= tplCount
  let tplVar = 0
  for (let i = 0; i < tpl.length; i++) { const d = tpl[i] - tplMean; tplVar += d * d }
  const tplNorm = Math.sqrt(tplVar)
  if (tplNorm < 1e-6) return { x: cx, y: cy, score: 0 }

  let best = { x: cx, y: cy, score: -1 }
  for (let sy = -search; sy <= search; sy += 2) {
    for (let sx = -search; sx <= search; sx += 2) {
      const ox = Math.round(cx) + sx, oy = Math.round(cy) + sy
      if (ox - r < 0 || oy - r < 0 || ox + r >= w || oy + r >= h) continue
      let mean = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) mean += cur[(oy + dy) * w + (ox + dx)]
      }
      mean /= (2 * r + 1) * (2 * r + 1)
      let num = 0, den = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ti = (dy + r) * (2 * r + 1) + (dx + r)
          const cv = cur[(oy + dy) * w + (ox + dx)] - mean
          num += tpl[ti] * cv
          den += cv * cv
        }
      }
      const score = den < 1e-6 ? -1 : num / (tplNorm * Math.sqrt(den))
      if (score > best.score) best = { x: ox, y: oy, score }
    }
  }
  // 小于 0.35 视为跟丢，原地保留
  if (best.score < 0.35) return { x: cx, y: cy, score: Math.max(0, best.score) }
  return best
}

/** ImageData -> 灰度 Uint8Array（可降采样倍率 k） */
export function toGray(img, k = 1) {
  const w = Math.floor(img.width / k), h = Math.floor(img.height / k)
  const out = new Uint8Array(w * h)
  const d = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y * k) * img.width + x * k) * 4
      out[y * w + x] = (d[si] * 0.299 + d[si + 1] * 0.587 + d[si + 2] * 0.114) | 0
    }
  }
  return { gray: out, w, h }
}
