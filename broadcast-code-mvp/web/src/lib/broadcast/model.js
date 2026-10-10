/**
 * 转播台模型层 —— 从参考工程 app/app.js 抽出的纯计算部分。
 * 职责：球场几何 / 位置索引与补帧 / 胜率插值 / 时间格式化 / 战术板坐标 / 转播 UI 状态。
 * 不渲染任何东西（渲染在 components/broadcast/*.vue）。
 */
import { reactive, computed } from 'vue'
import { TRACKS } from './tracks.js'
import { S, durationMs } from '../store.js'

export { TRACKS }

/* ---------------------------------------------------------------- 常量 */

export const META = TRACKS.meta
export const DURATION = META.duration            // 12.0s —— 转播时间轴长度
export const COURT_W = META.court.width          // 15.24 m
export const COURT_H = META.court.height         // 14.33 m
export const RIM = META.court.rim || [7.62, 1.575]

/** 队色：与参考工程一致（HOU 火箭红 / DAL 独行侠蓝）+ 视频中文队名 */
export const TEAM_COLOR = { HOU: '#CE1141', DAL: '#0B6FD1' }
export const TEAM_CN = { HOU: '休斯顿火箭', DAL: '达拉斯独行侠' }
export const ATK_TEAM = 'DAL'

/** 防守对位映射：防守人 → 他对位的进攻球员（T4 引力场代理计算用） */
export const MATCHUP = { p77: 'p4', p21: 'p28', p11: 'p5', p95: 'p9', p55: 'p10' }

export const EV_LABEL = {
  screen: '掩护', drive: '突破', help: '协防收缩',
  pass: '分球', shot: '出手', result: '结果',
}

/** 战术板四块（T1/T2/T3/T4），名称与说明照搬参考工程 */
export const BOARDS = {
  T1: { name: 'T1 实时跟随', cap: '俯视战术板与主时钟同帧推进——把转播机位里看不清的站位关系，压平成教练视角。' },
  T2: { name: 'T2 跑位复盘', cap: '选中球员在本次回合内的移动路径逐段生长，配套事件打点。轨迹源自视频检测。' },
  T3: { name: 'T3 投篮时机拆解', cap: '出手前 3.4 秒窗口内，射手与最近防守人的距离曲线——回答「这个时机对不对」。' },
  T4: { name: 'T4 引力场', cap: '箭头 = 防守人实际位置 − 贴身理论位。箭头越长，说明他被引力拽得越远，空档就在被拽开的那一侧。' },
}

/* ---------------------------------------------------------------- 球员 / 指标 */

/** 契约对齐：video.players 主键是 id，metrics.players 主键是 pid —— 内部统一成 pid */
export const PLAYERS = TRACKS.video.players.map(p => ({ ...p, pid: p.pid || p.id }))
export const METRICS = TRACKS.metrics.players
export const M_BY_ID = Object.fromEntries(METRICS.map(m => [m.pid, m]))
export const P_BY_ID = Object.fromEntries(PLAYERS.map(p => [p.pid, p]))
export const TEAMS = TRACKS.metrics.teams || []

/* ---------------------------------------------------------------- 位置索引 */

/** pid → [{t,x,y}]（球场米制坐标），二分 + lerp 补帧 */
const POS = {}
TRACKS.frames.forEach(f => f.objects.forEach(o => {
  (POS[o.pid] = POS[o.pid] || []).push({ t: f.t, x: o.court[0], y: o.court[1] })
}))
export { POS }

export function getPos(pid, t) {
  const arr = POS[pid]
  if (!arr) return null
  if (t <= arr[0].t) return [arr[0].x, arr[0].y]
  const last = arr[arr.length - 1]
  if (t >= last.t) return [last.x, last.y]
  let lo = 0, hi = arr.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid].t <= t) lo = mid; else hi = mid }
  const a = arr[lo], b = arr[hi]
  const k = (t - a.t) / (b.t - a.t || 1)
  return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k]
}

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, k) => a + (b - a) * k

/* ---------------------------------------------------------------- 胜率 */

export function wpValue(t) {
  const wp = TRACKS.metrics.winProbability
  if (!wp?.length) return 0.5
  if (t <= wp[0].t) return wp[0].home
  for (let i = 0; i < wp.length - 1; i++) {
    if (t >= wp[i].t && t <= wp[i + 1].t) {
      const k = (t - wp[i].t) / (wp[i + 1].t - wp[i].t || 1)
      return lerp(wp[i].home, wp[i + 1].home, k)
    }
  }
  return wp[wp.length - 1].home
}

/* ---------------------------------------------------------------- 时间格式 */

/** 比赛时钟：解析自视频记分牌 —— Q2 5:12（片段开头）→ 4:58（回合结束） */
export function fmtGameClock(t) {
  const s = Math.max(0, 312 - (t / DURATION) * 14)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

/** 视频时间：mm:ss.d */
export function fmtVideoTime(t) {
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

/* ---------------------------------------------------------------- 战术板坐标 */

/** 战术板 viewBox 0..100 × 0..94（米制等比） */
export const BV = { w: 100, h: 94 }
export const bx = x => (x / COURT_W) * BV.w
export const by = y => BV.h - (y / COURT_H) * BV.h

/* 投篮热点图 viewBox 300 × 282 */
export const HS = { x0: 8, y0: 274, k: 18.6 }
export const hsX = x => HS.x0 + x * HS.k
export const hsY = y => HS.y0 - y * HS.k

/* ---------------------------------------------------------------- 球场线 */

function arcPoints(cx, cy, r, a0, a1, n = 48) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

export const COURT_LINES = [
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

/** 半场 line → SVG path（走给定投影函数） */
export function courtPaths(px, py, strokeMain = 'rgba(245,242,236,0.26)', strokeThin = 'rgba(245,242,236,0.15)') {
  return COURT_LINES.map(l => {
    const d = l.pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(2)} ${py(p[1]).toFixed(2)}`).join(' ')
    const main = l.w > 1.4
    return { d, main, stroke: main ? strokeMain : strokeThin }
  })
}

/* ---------------------------------------------------------------- 转播 UI 状态 */

export const BS = reactive({
  selected: 'p4',        // 当前选中球员 pid
  board: 'T1',           // 当前战术板
  openEvent: null,       // 时间轴/因果链选中的事件 id
  hotspotScope: 'team',  // team | player
})

export const selectedMetric = computed(() => M_BY_ID[BS.selected] || METRICS[0] || null)
export const selectedPlayer = computed(() => P_BY_ID[BS.selected] || PLAYERS[0] || null)

export function selectPid(pid) { BS.selected = pid }
export function setBoard(k) { if (BOARDS[k]) BS.board = k }
export function setOpenEvent(id) { BS.openEvent = BS.openEvent === id ? null : id }
export function toggleHotspotScope() { BS.hotspotScope = BS.hotspotScope === 'team' ? 'player' : 'team' }

/* ---------------------------------------------------------------- 时钟桥接 */

/** 把工作台回放时钟(0..durationMs) 归一化到转播时间轴(0..DURATION)，保证两条轨同步推进 */
export const bT = computed(() => {
  const d = durationMs.value
  if (!d) return 0
  return clamp((S.t / d) * DURATION, 0, DURATION)
})

/** 转播播放进度 0..1 */
export const bProgress = computed(() => bT.value / DURATION)

/** 由转播时间反推工作台时间(ms)，用于点击时间轴/事件跳转 */
export function seekFromB(localT) {
  const d = durationMs.value
  return d ? (clamp(localT, 0, DURATION) / DURATION) * d : 0
}

/* ---------------------------------------------------------------- 队伍读数 */

export const teamOf = abbr => TEAMS.find(t => t.abbr === abbr) || null

/** 记分：解析自视频记分牌 —— 火箭 44，独行侠 40 → 弗拉格 #32 三分命中后 43 */
export function scoreAt(t) {
  return { home: 44, away: t >= 10.35 ? 43 : 40 }
}

/** 记分条/抽屉头的实时读数 */
export const live = computed(() => {
  const t = bT.value
  const cur = wpValue(t)
  const sc = scoreAt(t)
  return {
    wp: cur,
    wpPct: (cur * 100).toFixed(1) + '%',
    wpBar: Math.round(clamp((cur - 0.48) / 0.12, 0, 1) * 100),
    q: t >= 9.2 ? 'Q2 · 关键球' : 'Q2',
    gameClock: fmtGameClock(t),
    home: sc.home,
    away: sc.away,
  }
})
