<script setup>
/**
 * 转播画面舞台（移植自参考工程 app 的 #stage 模块）
 *  - feed 画布：场馆看台 + 透视木地板 + 球场线 + 篮筐（单应变换 court2video，静态背景，只画一次）
 *  - overlay 画布：名牌 / 指标 / 战术（Telestrator）/ 胜率 四图层，随 bT（主时钟桥）逐帧重绘
 *  - 图层开关（1-4 快捷键）、球员悬停数据卡、点击选中（联动阵容与战术板「当前选中」）
 *  - 下三分之一解说条：进入 triggerT 窗口时点亮，证据芯片可点击回跳
 * 动效纪律：只动 canvas 内容与 opacity/transform；遵循 prefers-reduced-motion。
 */
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { S, durationMs } from '../../lib/store.js'
import {
  TRACKS, PLAYERS, P_BY_ID, M_BY_ID, MATCHUP, RIM, ATK_TEAM, TEAM_COLOR, EV_LABEL,
  DURATION, getPos, dist, clamp, lerp, wpValue, fmtGameClock, bT, BS, selectPid,
} from '../../lib/broadcast/model.js'

/* ------------------------------------------------------------ 实拍回放层（处理完成视频 · 与时间轴联动） */
const FEED_SRC = '/media/processed-feed.mp4'
const vidEl = ref(null)
const feedError = ref(false)
let vidReady = false

/** 视频从动于母钟 bT：漂移 > 0.18s 才校正，避免频繁 seek 卡顿 */
function vidSync(force = false) {
  const v = vidEl.value
  if (!v || !vidReady || !v.duration) return
  const target = Math.min(bT.value, Math.max(0, v.duration - 0.05))
  if (force || Math.abs(v.currentTime - target) > 0.18) {
    try { v.currentTime = Math.max(0, target) } catch (_) { /* seeking 中 */ }
  }
}
watch(bT, () => vidSync())
watch(() => S.playing, (on) => {
  const v = vidEl.value
  if (!v || !vidReady) return
  if (on) { vidSync(true); v.play().catch(() => {}) }
  else v.pause()
})
function onFeedReady() {
  const v = vidEl.value
  if (!v) return
  vidReady = true
  vidSync(true)
  if (S.playing) v.play().catch(() => {})
}

/** 信号监视面板：电平表条数（错峰跳动动效） */
const VU_BARS = 18

/* ------------------------------------------------------------ 画布与机位 */
const CANVAS_W = 1600, CANVAS_H = 900
const COURT_W = 15.24, COURT_H = 14.33

/** 4 点对应求解 3×3 单应矩阵（球场平面 → 画面像素） */
function solveHomography(src, dst) {
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  const n = 8
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]
    const pv = A[c][c] || 1e-9
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / pv
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]
      b[r] -= f * b[c]
    }
  }
  const h = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k]
    h[r] = s / (A[r][r] || 1e-9)
  }
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}
function applyH(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8] || 1e-9
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]
}

/** 转播机位：近端底线宽、远端中线窄 —— 与真实半场机位同构 */
const H_COURT2VIDEO = solveHomography(
  [[0, 0], [COURT_W, 0], [COURT_W, COURT_H], [0, COURT_H]],
  [[150, 790], [1450, 790], [1130, 235], [470, 235]]
)
const court2video = (x, y) => applyH(H_COURT2VIDEO, x, y)
/** 深度缩放：近处大、远处小（名牌/圆点尺寸） */
const depthScale = (y) => lerp(1.0, 0.68, clamp(y / COURT_H, 0, 1))
const easeOut = (k) => 1 - Math.pow(1 - k, 3)

/* ------------------------------------------------------------ 球场几何（米制） */
function arcPoints(cx, cy, r, a0, a1, n = 48) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * Math.PI / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}
const COURT_LINES = [
  { w: 1.6, pts: [[0, 0], [COURT_W, 0], [COURT_W, COURT_H], [0, COURT_H], [0, 0]] },
  { w: 1.6, pts: [[5.18, 0], [5.18, 5.79], [10.06, 5.79], [10.06, 0]] },
  { w: 1.3, pts: arcPoints(7.62, 5.79, 1.8, 0, 180) },
  { w: 1.3, pts: arcPoints(7.62, 1.575, 1.25, 0, 180) },
  { w: 1.6, pts: arcPoints(RIM[0], RIM[1], 7.24, 22.2, 157.8, 72) },
  { w: 1.6, pts: [[0.92, 0], [0.92, 4.31]] },
  { w: 1.6, pts: [[14.32, 0], [14.32, 4.31]] },
  { w: 1.2, pts: [[6.72, 1.2], [8.52, 1.2]] },
  { w: 1.2, pts: arcPoints(7.62, 14.33, 1.8, 180, 360) },
  { w: 1.2, pts: [[0, 14.33], [COURT_W, 14.33]] },
]

/* ------------------------------------------------------------ One Euro 平滑 */
class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.18, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff
    this.xPrev = null; this.dxPrev = 0
  }
  alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt) }
  filter(x, dt) {
    if (this.xPrev === null) { this.xPrev = x; return x }
    if (dt <= 0) dt = 1 / 60
    const dx = (x - this.xPrev) / dt
    const aD = this.alpha(this.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = this.alpha(cutoff, dt)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat; this.dxPrev = dxHat
    return xHat
  }
}
const FILTERS = {}
PLAYERS.forEach(p => { FILTERS[p.pid] = { x: new OneEuro(1.6, 0.22), y: new OneEuro(1.6, 0.22) } })
function resetFilters() { PLAYERS.forEach(p => { FILTERS[p.pid] = { x: new OneEuro(1.6, 0.22), y: new OneEuro(1.6, 0.22) } }) }
let lastBt = 0
function smoothPos(pid, t, dt) {
  const raw = getPos(pid, t); if (!raw) return null
  const f = FILTERS[pid]
  return [f.x.filter(raw[0], dt), f.y.filter(raw[1], dt)]
}
let SMOOTH = {}
const screenOf = (pid) => { const c = SMOOTH[pid]; return c ? court2video(c[0], c[1]) : null }
const smoothOf = (pid) => SMOOTH[pid] || getPos(pid, bT.value)

/* ------------------------------------------------------------ 图层注册表 */
const LAYERS = [
  { id: 'nametag', name: '名牌', desc: '球员名字浮在他该在的位置' },
  { id: 'metrics', name: '指标', desc: 'xFG% / 引力 / DPS' },
  { id: 'tactic', name: '战术', desc: 'Telestrator 标注：箭头 · 色块 · 圈选' },
  { id: 'winprob', name: '胜率', desc: '实时胜率影响力' },
]
const layers = reactive({ nametag: true, metrics: true, tactic: true, winprob: true })
/** TopNav 的「实时叠加」总开关：关掉时全部图层隐藏，只留转播画面 */
const layerOn = (id) => layers[id] && S.overlayOn

/* ------------------------------------------------------------ 占位碰撞管理 */
let PLACED = []
const rectsOverlap = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])
function reserve(r) { for (let i = 0; i < PLACED.length; i++) if (rectsOverlap(r, PLACED[i])) return false; PLACED.push(r); return true }
function tryReserve(r) { for (let i = 0; i < PLACED.length; i++) if (rectsOverlap(r, PLACED[i])) return false; return reserve(r) }
const setFont = (ctx, size, family, weight) => { ctx.font = `${weight || ''} ${size}px ${family}`.trim() }

/* ------------------------------------------------------------ feed：静态背景 */
const feedEl = ref(null), ovEl = ref(null), stageEl = ref(null)
let feedCtx = null, ov = null

function drawFeed() {
  const ctx = feedCtx
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  /* 观众席 / 场馆底 */
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  g.addColorStop(0, '#07070C'); g.addColorStop(0.42, '#0D1230'); g.addColorStop(1, '#12183A')
  ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  /* 看台点阵（模拟观众，场馆感） */
  ctx.save()
  for (let i = 0; i < 460; i++) {
    const x = (i * 137.5) % CANVAS_W
    const y = 20 + ((i * 61.7) % 190)
    ctx.globalAlpha = 0.05 + ((i * 13) % 7) * 0.012
    ctx.fillStyle = i % 5 === 0 ? '#F9530C' : '#F5F2EC'
    ctx.fillRect(x, y, 3, 2)
  }
  ctx.restore()

  /* 球场地板（透视梯形） */
  const corners = [[0, 0], [COURT_W, 0], [COURT_W, COURT_H], [0, COURT_H]].map(p => court2video(p[0], p[1]))
  ctx.beginPath()
  corners.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))
  ctx.closePath()
  const fg = ctx.createLinearGradient(0, 235, 0, 800)
  fg.addColorStop(0, '#241812'); fg.addColorStop(1, '#4A2A16')
  ctx.fillStyle = fg; ctx.fill()
  ctx.save(); ctx.clip()

  /* 木纹 */
  ctx.globalAlpha = 0.06; ctx.strokeStyle = '#F5F2EC'; ctx.lineWidth = 1
  for (let i = 1; i < 14; i++) {
    const y = i / 14 * COURT_H
    const a = court2video(0, y), b = court2video(COURT_W, y)
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
  }
  ctx.globalAlpha = 1; ctx.restore()

  /* 场地线 */
  ctx.strokeStyle = 'rgba(245,242,236,0.72)'
  ctx.lineCap = 'round'
  COURT_LINES.forEach(line => {
    ctx.lineWidth = line.w
    ctx.beginPath()
    line.pts.forEach((p, i) => {
      const s = court2video(p[0], p[1])
      i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])
    })
    ctx.stroke()
  })

  /* 篮筐 + 篮板 */
  const rim = court2video(RIM[0], RIM[1])
  ctx.strokeStyle = '#F9530C'; ctx.lineWidth = 3.4
  ctx.beginPath(); ctx.arc(rim[0], rim[1], 9, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(245,242,236,0.9)'; ctx.lineWidth = 4
  const bb1 = court2video(6.72, 1.2), bb2 = court2video(8.52, 1.2)
  ctx.beginPath(); ctx.moveTo(bb1[0], bb1[1]); ctx.lineTo(bb2[0], bb2[1]); ctx.stroke()

  /* 场馆暗角 */
  const vg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H * 0.62, 220, CANVAS_W / 2, CANVAS_H * 0.62, 900)
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.62)')
  ctx.fillStyle = vg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
}

/* ------------------------------------------------------------ 图层 1：名牌 */
let HIT = []
let UI_SCALE = 1, NARROW = false

function layerNametag(ctx, t) {
  const fMul = NARROW ? 3.6 : 1
  const dMul = NARROW ? 2.4 : 1
  const MAXTAG = NARROW ? 4 : 99
  const sel = BS.selected

  const order = [...PLAYERS].sort((a, b) => {
    if (a.pid === sel) return -1
    if (b.pid === sel) return 1
    return (SMOOTH[a.pid]?.[1] ?? 0) - (SMOOTH[b.pid]?.[1] ?? 0)
  })

  let tagged = 0
  order.forEach(p => {
    const pos = SMOOTH[p.pid]; if (!pos) return
    const s = court2video(pos[0], pos[1])
    const k = depthScale(pos[1])
    const r = 24 * k * dMul
    const isAtk = p.team === ATK_TEAM

    ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2)
    ctx.fillStyle = TEAM_COLOR[p.team]; ctx.fill()
    ctx.lineWidth = 2.8 * dMul
    ctx.strokeStyle = BS.selected === p.pid ? '#F9530C' : 'rgba(245,242,236,.85)'
    ctx.stroke()
    if (BS.selected === p.pid) {
      const pp = (performance.now() / 1400) % 1
      ctx.beginPath(); ctx.arc(s[0], s[1], r * (1 + pp * 0.9), 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(249,83,12,${((1 - pp) * 0.55).toFixed(3)})`
      ctx.lineWidth = 2 * dMul; ctx.stroke()
    }

    ctx.fillStyle = '#F5F2EC'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    setFont(ctx, 21 * k * dMul, 'Anton, Arial Narrow, sans-serif')
    ctx.fillText(String(p.number), s[0], s[1] + 0.5 * dMul)

    reserve([s[0] - r - 2, s[1] - r - 2, s[0] + r + 2, s[1] + r + 2])

    if (tagged >= MAXTAG && p.pid !== sel) return
    const label = `#${p.number} ${p.name}`
    setFont(ctx, 15 * Math.max(k, 0.78) * fMul, '"JetBrains Mono", monospace')
    const tw = ctx.measureText(label).width
    const pw = tw + 22 * fMul, ph = 24 * Math.max(k, 0.86) * fMul
    const px = s[0] - pw / 2
    let py = s[1] + r + 4
    if (!tryReserve([px, py, px + pw, py + ph])) {
      py = s[1] - r - 4 - ph
      if (!tryReserve([px, py, px + pw, py + ph])) return
    }
    tagged++

    ctx.fillStyle = 'rgba(11,11,12,.86)'
    ctx.fillRect(px, py, pw, ph)
    ctx.fillStyle = isAtk ? '#F9530C' : 'rgba(142,142,150,.9)'
    ctx.fillRect(px, py, 2 * fMul, ph)
    ctx.fillStyle = BS.selected === p.pid ? '#F9530C' : '#F5F2EC'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(label, px + 11 * fMul, py + ph / 2 + 0.5)
  })
}

/* ------------------------------------------------------------ 图层 2：指标 */
function layerMetrics(ctx) {
  const fMul = NARROW ? 2.6 : 1
  PLAYERS.forEach(p => {
    const m = M_BY_ID[p.pid]; if (!m) return
    const pos = SMOOTH[p.pid]; if (!pos) return
    const s = court2video(pos[0], pos[1])
    const k = depthScale(pos[1])
    const isFocus = BS.selected === p.pid || hovered.value === p.pid
    if (NARROW && !isFocus) return
    if (!isFocus && m.gravity < 60) return

    const rows = []
    if (m.gravity >= 22) rows.push(['GRAV', String(m.gravity)])
    rows.push(['xFG', m.xfgAvg.toFixed(2)])
    if (p.team !== ATK_TEAM && m.dpsAvg >= 0.3) rows.push(['DPS', m.dpsAvg.toFixed(2)])

    const lh = 14 * Math.max(k, 0.8) * fMul, w = 62 * Math.max(k, 0.8) * fMul
    const bh = rows.length * lh + 6 * fMul
    const bx = s[0] + 28 * k * fMul, by = s[1] - bh - 6
    if (!reserve([bx - 2, by - 2, bx + w + 2, by + bh + 2])) return
    ctx.fillStyle = 'rgba(11,11,12,.82)'
    ctx.fillRect(bx, by, w, bh)
    ctx.strokeStyle = 'rgba(249,83,12,.55)'; ctx.lineWidth = 1
    ctx.strokeRect(bx + .5, by + .5, w - 1, bh - 1)
    rows.forEach((r, i) => {
      setFont(ctx, 8.5 * Math.max(k, 0.8) * fMul, '"JetBrains Mono", monospace')
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillStyle = '#8E8E96'
      ctx.fillText(r[0], bx + 5 * fMul, by + 3 + lh * i + lh / 2)
      ctx.fillStyle = r[0] === 'GRAV' ? '#F9530C' : '#F5F2EC'
      ctx.textAlign = 'right'
      ctx.fillText(r[1], bx + w - 5 * fMul, by + 3 + lh * i + lh / 2)
    })
  })
}

/* ------------------------------------------------------------ Telestrator 基础件 */
function arrow(ctx, a, b, color, width, dash) {
  ctx.save()
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width
  ctx.lineCap = 'round'
  if (dash) ctx.setLineDash(dash)
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
  ctx.setLineDash([])
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const hs = 9 + width
  ctx.beginPath()
  ctx.moveTo(b[0], b[1])
  ctx.lineTo(b[0] - hs * Math.cos(ang - 0.4), b[1] - hs * Math.sin(ang - 0.4))
  ctx.lineTo(b[0] - hs * Math.cos(ang + 0.4), b[1] - hs * Math.sin(ang + 0.4))
  ctx.closePath(); ctx.fill()
  ctx.restore()
}
function ring(ctx, p, r, color, width, label, sub) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = width
  ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  ctx.moveTo(p[0] - r - 8, p[1]); ctx.lineTo(p[0] - r - 2, p[1])
  ctx.moveTo(p[0] + r + 2, p[1]); ctx.lineTo(p[0] + r + 8, p[1])
  ctx.moveTo(p[0], p[1] - r - 8); ctx.lineTo(p[0], p[1] - r - 2)
  ctx.moveTo(p[0], p[1] + r + 2); ctx.lineTo(p[0], p[1] + r + 8)
  ctx.stroke()
  ctx.globalAlpha = 1
  if (label) {
    setFont(ctx, 11, '"JetBrains Mono", monospace')
    const tw = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(11,11,12,.9)'
    ctx.fillRect(p[0] + r + 10, p[1] - 20, tw + 12, 17)
    ctx.fillStyle = color
    ctx.fillRect(p[0] + r + 10, p[1] - 20, 2, 17)
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(label, p[0] + r + 17, p[1] - 11)
    if (sub) {
      setFont(ctx, 9.5, '"JetBrains Mono", monospace')
      ctx.fillStyle = 'rgba(142,142,150,1)'
      ctx.fillText(sub, p[0] + r + 17, p[1] + 4)
    }
  }
  ctx.restore()
}
function dashedBox(ctx, pts, color) {
  ctx.save()
  ctx.setLineDash([7, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1.6
  ctx.beginPath()
  pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))
  ctx.closePath(); ctx.stroke()
  ctx.setLineDash([])
  pts.forEach(p => { ctx.fillStyle = '#F5F2EC'; ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6) })
  ctx.restore()
}

/* ------------------------------------------------------------ 图层 3：战术标注（时间窗） */
function layerTactic(ctx, t) {
  const P = (pid, tt) => {
    if (tt === undefined) return screenOf(pid)
    const p = getPos(pid, tt); return p ? court2video(p[0], p[1]) : null
  }
  const C = (pid) => smoothOf(pid)

  /* ① 2.9-6.2s：高位掩护 —— 圈出掩护人 + 追防被挂住的箭头 */
  if (t >= 2.9 && t <= 6.2) {
    const a = easeOut(clamp((t - 2.9) / 0.5, 0, 1))
    ctx.globalAlpha = a
    const scr = P('p28')
    if (scr) ring(ctx, scr, 22 + 3 * Math.sin(t * 6), '#F5C518', 2, 'SCREEN 42°', '掩护落位')
    const onBallDef = P('p77')
    if (onBallDef) {
      const theo = P('p4')
      if (theo) arrow(ctx, [theo[0] + 46, theo[1] - 30], onBallDef, '#E23B3B', 2, [6, 4])
    }
    ctx.globalAlpha = 1
  }

  /* ② 3.4-7.2s：突破箭头 + 速度读数 */
  if (t >= 3.4 && t <= 7.2) {
    const drive = P('p4')
    if (drive) {
      const rimP = court2video(RIM[0], RIM[1])
      arrow(ctx, drive, [lerp(drive[0], rimP[0], 0.72), lerp(drive[1], rimP[1], 0.72)], '#F9530C', 3.4)
      setFont(ctx, 11, '"JetBrains Mono", monospace')
      ctx.fillStyle = '#F9530C'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      const g = clamp((t - 3.4) / (7.2 - 3.4), 0, 1)
      ctx.fillText(`DRIVE ${(4.8 * (1 - 0.35 * g)).toFixed(1)} m/s`, drive[0] + 16, drive[1] - 14)
    }
  }

  /* ③ 5.9-8.0s：弱侧收缩 —— 虚线框禁区 + 协防箭头 */
  if (t >= 5.9 && t <= 8.0) {
    const box = [[5.18, 0], [10.06, 0], [10.06, 5.79], [5.18, 5.79]].map(p => court2video(p[0], p[1]))
    const pulse = 0.55 + 0.45 * Math.sin(t * 5)
    ctx.globalAlpha = 0.35 + 0.45 * pulse
    dashedBox(ctx, box, '#F9530C')
    ctx.globalAlpha = 1
    ;['p95', 'p21'].forEach((pid) => {
      const d = P(pid); const t0 = P(pid, 5.9)
      if (d && t0) arrow(ctx, t0, d, 'rgba(226,59,59,.9)', 2.4, [5, 4])
    })
    const c = court2video(7.62, 4.4)
    setFont(ctx, 11, '"JetBrains Mono", monospace')
    ctx.fillStyle = '#F9530C'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('HELP ×2', c[0], c[1])
  }

  /* ④ 7.0-8.4s：转移球线路 */
  if (t >= 7.0 && t <= 8.4) {
    const from = P('p4', 7.0), to = P('p10')
    if (from && to) arrow(ctx, from, to, 'rgba(57,194,215,.95)', 2.2, [8, 5])
  }

  /* ⑤ 9.0-11.0s：出手圈选 + 最近防守人距离 */
  if (t >= 9.0 && t <= 11.0) {
    const sh = P('p10'), def = P('p55')
    if (sh) {
      const open = dist(C('p10'), C('p55'))
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 6)
      ctx.beginPath(); ctx.arc(sh[0], sh[1], 74, 0, Math.PI * 2)
      ctx.fillStyle = '#F9530C'; ctx.fill()
      ctx.globalAlpha = 1
      ring(ctx, sh, 30, '#F9530C', 2.4, 'SHOT xFG 0.52', `空档 ${open.toFixed(2)} m`)
      if (def) {
        arrow(ctx, sh, def, 'rgba(226,59,59,.9)', 1.6, [4, 4])
        const mid = [(sh[0] + def[0]) / 2, (sh[1] + def[1]) / 2]
        setFont(ctx, 10, '"JetBrains Mono", monospace')
        ctx.fillStyle = '#E23B3B'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(`${open.toFixed(2)}m`, mid[0], mid[1] - 10)
      }
    }
  }

  /* ⑥ 引力场矢量（对位失位箭头） */
  const gAlpha = t >= 9.0 ? 0.95 : 0.4
  Object.entries(MATCHUP).forEach(([defPid, offPid]) => {
    const d = C(defPid), o = C(offPid)
    if (!d || !o) return
    const toRim = [RIM[0] - o[0], RIM[1] - o[1]]
    const len = Math.hypot(toRim[0], toRim[1]) || 1
    const theo = [o[0] + toRim[0] / len * 1.2, o[1] + toRim[1] / len * 1.2]
    const gap = dist(d, theo)
    if (gap < 0.9) return
    ctx.globalAlpha = gAlpha * clamp(gap / 2.4, 0.25, 1)
    arrow(ctx, court2video(theo[0], theo[1]), court2video(d[0], d[1]),
      gap >= 2.0 ? '#F9530C' : 'rgba(142,142,150,.85)', 1.8)
    ctx.globalAlpha = 1
  })
}

/* ------------------------------------------------------------ 图层 4：胜率卡 */
function layerWinProb(ctx, t) {
  const wp = TRACKS.metrics.winProbability
  const cur = wpValue(t)
  const x0 = 24, y0 = 52, w = 236, h = 62
  ctx.save()
  ctx.fillStyle = 'rgba(11,11,12,.72)'
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = 'rgba(42,42,46,1)'; ctx.lineWidth = 1
  ctx.strokeRect(x0 + .5, y0 + .5, w - 1, h - 1)
  setFont(ctx, 9, '"JetBrains Mono", monospace')
  ctx.fillStyle = '#8E8E96'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('WIN PROB · HOU', x0 + 8, y0 + 7)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#F9530C'
  setFont(ctx, 17, 'Anton, Arial Narrow, sans-serif')
  ctx.fillText((cur * 100).toFixed(1) + '%', x0 + w - 8, y0 + 4)

  const gy0 = y0 + 36, gh = 20
  ctx.beginPath()
  wp.forEach((p, i) => {
    const px = x0 + 8 + (p.t / DURATION) * (w - 16)
    const py = gy0 + gh - (p.home - 0.45) / 0.16 * gh
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
  })
  ctx.strokeStyle = '#39C2D7'; ctx.lineWidth = 1.6; ctx.stroke()
  const cxp = x0 + 8 + (t / DURATION) * (w - 16)
  const cyp = gy0 + gh - (cur - 0.45) / 0.16 * gh
  ctx.beginPath(); ctx.arc(cxp, cyp, 3.4, 0, Math.PI * 2)
  ctx.fillStyle = '#F9530C'; ctx.fill()
  ctx.restore()
}

/* ------------------------------------------------------------ overlay 主绘制 */
function reservedBands() {
  const sr = stageEl.value?.getBoundingClientRect()
  if (!sr || !sr.height) return []
  const k = CANVAS_H / sr.height
  const bands = []
  ;[metaEl.value, commEl.value].forEach(el => {
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.height) return
    bands.push([0, (r.top - sr.top) * k - 6, CANVAS_W, (r.bottom - sr.top) * k + 6])
  })
  return bands
}

function drawOverlay(t) {
  ov.clearRect(0, 0, CANVAS_W, CANVAS_H)

  const cssW = ovEl.value?.clientWidth || CANVAS_W
  UI_SCALE = clamp(880 / cssW, 1, 2.4)
  NARROW = cssW < 640
  void UI_SCALE

  const dt = clamp(Math.abs(t - lastBt) || 1 / 60, 1 / 120, 0.12)
  SMOOTH = {}
  PLAYERS.forEach(p => { const v = smoothPos(p.pid, t, dt); if (v) SMOOTH[p.pid] = v })
  lastBt = t

  HIT = []
  PLAYERS.forEach(p => {
    const pos = SMOOTH[p.pid]; if (!pos) return
    const s = court2video(pos[0], pos[1])
    HIT.push({ pid: p.pid, x: s[0], y: s[1], r: 34 * depthScale(pos[1]) * (NARROW ? 2 : 1) })
  })

  PLACED = []
  reservedBands().forEach(reserve)
  if (layerOn('winprob') && !NARROW) reserve([18, 46, 24 + 236 + 6, 52 + 62 + 6])

  if (layerOn('tactic')) layerTactic(ov, t)
  if (layerOn('nametag')) layerNametag(ov, t)
  if (layerOn('metrics')) layerMetrics(ov)
  if (layerOn('winprob') && !NARROW) layerWinProb(ov, t)
}

/* ------------------------------------------------------------ 主时钟 → 绘制 */
let rafId = 0
function renderLoop() {
  drawOverlay(bT.value)
  rafId = requestAnimationFrame(renderLoop)
}

/* ------------------------------------------------------------ 解说条 */
const commEl = ref(null), metaEl = ref(null)
const liveComm = ref(null)
const commText = computed(() => liveComm.value?.text || '解说准备就绪')
const commLabel = computed(() => {
  if (!liveComm.value) return 'COMMENTARY\nSTANDBY'
  return 'COMMENTARY\n' + (liveComm.value.priority === 'high' ? '★ KEY MOMENT' : 'LIVE')
})
const commChips = computed(() => {
  if (!liveComm.value) return []
  return (liveComm.value.evidenceRef || [])
    .map(id => TRACKS.events.find(e => e.id === id))
    .filter(Boolean)
    .map(e => {
      const d = e.evidence?.[0]
      return {
        id: e.id, t: e.t,
        text: `${fmtGameClock(e.t)} ${EV_LABEL[e.type] || e.type}${d ? ` · ${d.key} ${d.value}${d.unit || ''}` : ''}`,
      }
    })
})
watch(bT, (t) => {
  const items = TRACKS.commentary || []
  const found = items.find(c => t >= c.triggerT && t <= c.triggerT + c.hold) || null
  const key = found ? found.triggerT : null
  if (key !== (liveComm.value ? liveComm.value.triggerT : null)) liveComm.value = found
})
function jumpChip(t) { S.playing = false; S.t = Math.round((t + 0.05) / DURATION * (durationMs.value || 12000)) }

/* ------------------------------------------------------------ 悬停卡 */
const hovered = ref(null)
const hover = reactive({ show: false, x: 0, y: 0, head: null, cells: [] })
function onMove(e) {
  const r = ovEl.value?.getBoundingClientRect()
  if (!r) return
  const cx = (e.clientX - r.left) / r.width * CANVAS_W
  const cy = (e.clientY - r.top) / r.height * CANVAS_H
  let best = null, bd = 1e9
  HIT.forEach(h => {
    const d = Math.hypot(h.x - cx, h.y - cy)
    if (d < Math.max(h.r, 30) && d < bd) { bd = d; best = h }
  })
  if (best) {
    hovered.value = best.pid
    const m = M_BY_ID[best.pid], p = P_BY_ID[best.pid]
    hover.head = {
      num: m.number, name: m.name, color: TEAM_COLOR[m.team],
      sub: `${m.team} · ${m.role}${p?.team === ATK_TEAM ? ' · 进攻方' : ''}`,
    }
    hover.cells = [
      { k: '引力', v: String(m.gravity), hi: true },
      { k: 'FG%', v: m.fg?.pct?.toFixed(1) ?? '—' },
      { k: 'xFG', v: m.xfgAvg?.toFixed(2) ?? '—' },
      { k: 'DPS', v: m.dpsAvg?.toFixed(2) ?? '—' },
    ]
    const sr = stageEl.value.getBoundingClientRect()
    hover.x = clamp(e.clientX - sr.left + 16, 8, sr.width - 210)
    hover.y = clamp(e.clientY - sr.top + 12, 8, sr.height - 150)
    hover.show = true
  } else {
    hovered.value = null
    hover.show = false
  }
}
function onLeave() { hovered.value = null; hover.show = false }
function onClick() { if (hovered.value) selectPid(hovered.value) }

/* ------------------------------------------------------------ 图层开关 + 快捷键 */
function toggleLayer(id) { layers[id] = !layers[id] }
function onKey(e) {
  const tag = (e.target?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return
  const n = parseInt(e.key, 10)
  if (n >= 1 && n <= LAYERS.length) toggleLayer(LAYERS[n - 1].id)
}

onMounted(() => {
  feedCtx = feedEl.value.getContext('2d')
  ov = ovEl.value.getContext('2d')
  feedEl.value.width = CANVAS_W; feedEl.value.height = CANVAS_H
  ovEl.value.width = CANVAS_W; ovEl.value.height = CANVAS_H
  drawFeed()
  window.addEventListener('keydown', onKey)
  rafId = requestAnimationFrame(renderLoop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <section ref="stageEl" class="bs-split" aria-label="视频分析舞台" :class="{ 'bs-off': !S.overlayOn }">
    <!-- 左：处理完成视频（完整展示 · 与时间轴联动） -->
    <div class="bs-videocol">
      <div class="bs-videobox">
        <video v-if="!feedError" ref="vidEl" class="bs-video" :src="FEED_SRC" muted playsinline preload="auto"
               aria-label="处理完成的实拍回放" @canplay="onFeedReady" @error="feedError = true"></video>
        <div v-else class="bs-video bs-video--off">FEED OFFLINE</div>
        <span class="bs-tag">PROCESSED FEED</span>
        <span class="bs-rec"><i></i>LIVE</span>
      </div>
      <!-- 信号监视面板：填充视频下方剩余高度（参数 + 电平表动效） -->
      <div class="bs-feedmon" v-reveal>
        <div class="fm-head">
          <span class="slash"><i></i>FEED MONITOR · 信号监视</span>
          <span class="fm-sync"><i class="dot"></i>SYNC LOCKED</span>
        </div>
        <div class="fm-grid">
          <div class="fm-cell"><span class="k">SOURCE</span><span class="v">1080P <em>59.94</em></span></div>
          <div class="fm-cell"><span class="k">OUTPUT</span><span class="v">720P <em>30</em></span></div>
          <div class="fm-cell"><span class="k">PIPELINE</span><span class="v">检测·跟踪·投影</span></div>
          <div class="fm-cell"><span class="k">LATENCY</span><span class="v">0.4 <em>s</em></span></div>
        </div>
        <div class="fm-meter" aria-hidden="true">
          <i v-for="n in VU_BARS" :key="n"
             :style="{ animationDelay: (n * 0.13) + 's', animationDuration: (0.8 + (n % 5) * 0.21) + 's' }"></i>
        </div>
      </div>
    </div>

    <!-- 右：战术台（合成球场 + 数据叠加层） -->
    <div class="bs-stage">
      <canvas ref="feedEl" aria-hidden="true"></canvas>
      <canvas ref="ovEl" role="img" aria-label="深度数据叠加层：球员名牌、指标、战术标注"
              @mousemove="onMove" @mouseleave="onLeave" @click="onClick"></canvas>

      <div ref="metaEl" class="bs-meta">
        <span class="bs-tag">TACTICAL OVERLAY</span>
        <div class="bs-layerbar" role="group" aria-label="数据图层开关">
          <button v-for="(l, i) in LAYERS" :key="l.id" class="bs-layerbtn"
                  :aria-pressed="String(layers[l.id])" :title="`${l.desc}（快捷键 ${i + 1}）`"
                  @click.stop="toggleLayer(l.id)">
            <i class="sw"></i>{{ l.name }}
          </button>
        </div>
      </div>

      <div class="bs-hovercard" :class="{ show: hover.show }" :style="{ left: hover.x + 'px', top: hover.y + 'px' }" aria-hidden="true">
        <div v-if="hover.head" class="hc-head">
          <span class="hc-num" :style="{ color: hover.head.color }">{{ hover.head.num }}</span>
          <span><span class="hc-name">{{ hover.head.name }}</span><br><span class="hc-team">{{ hover.head.sub }}</span></span>
        </div>
        <div v-if="hover.head" class="hc-grid">
          <div v-for="c in hover.cells" :key="c.k" class="hc-cell">
            <div class="k">{{ c.k }}</div><div class="v" :class="{ hi: c.hi }">{{ c.v }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 解说条：横跨两栏底部 -->
    <div ref="commEl" class="bs-commentary" :class="{ 'is-live': !!liveComm }">
      <div class="cue" style="white-space:pre-line">{{ commLabel }}</div>
      <div>
        <Transition name="cue-swap" mode="out-in">
          <div class="line" :key="commText">{{ commText }}</div>
        </Transition>
        <div v-if="commChips.length" class="bs-ev-chips">
          <button v-for="c in commChips" :key="c.id" class="bs-ev-chip" @click="jumpChip(c.t)">{{ c.text }}</button>
        </div>
      </div>
    </div>
  </section>
</template>
