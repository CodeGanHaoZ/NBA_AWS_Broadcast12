/**
 * 分析管线编排
 * 统一出口：无论输入是真实视频（模型/算法通道）还是内置样例，最终都产出同一份
 * AnalysisResult，UI 层只消费该结构。
 *
 * AnalysisResult = {
 *   meta, courtMap, frames[], tracks{byId}, events[], possessions[],
 *   factors[], evidence[], narration[], metrics{}
 * }
 * 坐标契约：frames / tracks / events 内所有位置一律为球场英尺（0-94 × 0-50）。
 */
import { defaultCalibration, applyH, insideCourt, dist } from './homography.js'
import { detectEvents, splitPossessions } from './events.js'
import { buildFactors, buildEvidence, buildNarration } from './tactics.js'
import { buildMetrics } from './metrics.js'

/** 固定种子伪随机（确定性，便于复现） */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FT_TO_M = 0.3048

/* ------------------------------------------------------------------ *
 * 1. 内置样例剧本：半场阵地进攻 -> 突破 -> 防守收缩 -> 空位 -> 传球 -> 三分出手
 * ------------------------------------------------------------------ */

const SCRIPT = {
  off: [
    // 1.5s 试探 -> 1.1s 爆速突破（20ft / 1.1s ≈ 5.5 m/s）-> 篮下 -> 传球给底角
    { num: 0, keys: [[0, 62, 25], [1500, 62, 25], [2600, 82, 25], [4000, 84, 26], [5400, 84, 26], [6200, 85, 27], [10000, 86, 28]] },
    { num: 32, keys: [[0, 54, 12], [2400, 56, 13], [4200, 62, 16], [6000, 66, 18], [10000, 68, 19]] },
    // 底角拉开 -> 接球出手点
    { num: 7, keys: [[0, 79, 7], [3000, 82, 6], [4200, 84, 6], [6000, 85, 6], [8000, 86, 7], [10000, 87, 8]] },
    { num: 3, keys: [[0, 50, 38], [3000, 52, 36], [5000, 56, 34], [10000, 58, 33]] },
    { num: 25, keys: [[0, 70, 33], [2600, 72, 31], [4600, 76, 29], [10000, 78, 28]] }
  ],
  def: [
    { num: 10, keys: [[0, 66, 25], [1500, 68, 25], [2600, 74, 25], [4000, 80, 25], [5600, 80, 25], [10000, 80, 25]] },
    { num: 7, keys: [[0, 59, 14], [2400, 61, 15], [4200, 66, 17], [10000, 70, 19]] },
    // 底角防守者被突破吸引内收 -> 制造空位
    { num: 1, keys: [[0, 83, 9], [3200, 84, 8], [4600, 80, 12], [6000, 75, 16], [10000, 73, 17]] },
    { num: 20, keys: [[0, 56, 36], [3000, 58, 34], [4200, 68, 31], [5400, 76, 28], [10000, 78, 27]] },
    { num: 15, keys: [[0, 74, 30], [2600, 76, 29], [4200, 82, 27], [5600, 84, 26], [10000, 85, 26]] }
  ]
}

function keyAt(keys, t) {
  if (t <= keys[0][0]) return { x: keys[0][1], y: keys[0][2] }
  const last = keys[keys.length - 1]
  if (t >= last[0]) return { x: last[1], y: last[2] }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0])
      return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k }
    }
  }
  return { x: last[1], y: last[2] }
}

/** 球的位置脚本（含传球与出手的抛物线 z） */
function ballAt(t, offPos) {
  const hoop = { x: 88.75, y: 25 }
  if (t < 5400) { // #1 持球突破
    const p = offPos[0]
    return { x: p.x + 1.1, y: p.y - 0.6, z: 3.2 + Math.sin(t / 190) * 0.35 }
  }
  if (t < 6200) { // 传球飞行 #1 -> #3
    const k = (t - 5400) / 800
    const a = offPos[0], b = offPos[2]
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      z: 3.2 + Math.sin(Math.PI * k) * 3.4
    }
  }
  if (t < 8000) { // #3 接球调整
    const p = offPos[2]
    return { x: p.x + 1.0, y: p.y - 0.5, z: 3.4 + Math.sin((t - 6200) / 160) * 0.4 }
  }
  if (t < 9600) { // 出手飞行 -> 篮筐
    const k = (t - 8000) / 1600
    const a = offPos[2]
    return {
      x: a.x + (hoop.x - a.x) * k,
      y: a.y + (hoop.y - a.y) * k,
      z: 3.6 + Math.sin(Math.PI * Math.min(1, k * 1.05)) * 9.6
    }
  }
  return { x: hoop.x, y: hoop.y, z: Math.max(0, 3 - (t - 9600) / 120) }
}

/* ------------------------------------------------------------------ *
 * 1b. 内置样例 · 第二回合剧本：二次进攻 -> 变向突破 -> 弱侧底角三分
 *     起始站位 = 第一回合结束站位（无缝衔接，避免瞬移造成的速度尖峰）
 * ------------------------------------------------------------------ */

const SCRIPT2 = {
  off: [
    // #1 拉出 -> 0.9s 变向突破（15.6ft ≈ 5.3 m/s）-> 分弱侧底角
    { num: 0, keys: [[0, 86, 28], [1200, 74, 30], [2400, 72, 30], [3300, 82, 18], [4300, 80, 20], [9400, 78, 20]] },
    // #5 绕上顺下冲筐（先向弱侧拉开再折返，避免贴球造成球权抖动）
    { num: 25, keys: [[0, 78, 28], [500, 80, 32], [1100, 88, 24], [2400, 88, 24], [9400, 80, 25]] },
    // #2 二次转移到弱侧底角接球出手
    { num: 32, keys: [[0, 68, 19], [2000, 80, 10], [3600, 88, 6], [4800, 88, 6], [6200, 89, 7], [9400, 88, 8]] },
    { num: 7, keys: [[0, 87, 8], [2400, 84, 10], [9400, 82, 12]] },
    { num: 3, keys: [[0, 58, 33], [2400, 60, 34], [9400, 62, 35]] }
  ],
  def: [
    { num: 10, keys: [[0, 80, 25], [1200, 74, 27], [2400, 74, 27], [3300, 78, 22], [4300, 80, 22], [9400, 80, 23]] },
    { num: 7, keys: [[0, 70, 19], [2000, 76, 14], [3600, 84, 9], [4800, 86, 8], [9400, 86, 8]] },
    { num: 1, keys: [[0, 73, 17], [800, 80, 22], [2400, 84, 24], [3300, 86, 25], [9400, 84, 25]] },
    { num: 20, keys: [[0, 78, 27], [2400, 76, 28], [9400, 74, 29]] },
    { num: 15, keys: [[0, 85, 26], [1200, 80, 24], [2400, 74, 22], [9400, 72, 22]] }
  ]
}

/** 第二回合球位置脚本（#1 持球突破 -> 分底角 #2 -> 三分出手） */
function ballAt2(t, offPos) {
  const hoop = { x: 88.75, y: 25 }
  const handler = offPos[0] // #1
  const corner = offPos[2]  // #2（弱侧底角）
  if (t < 3300) { // #1 拉出后变向突破（贴地运球，z<3.5 避免误判出手）
    return { x: handler.x + 0.8, y: handler.y - 1.2, z: 3.0 + Math.sin(t / 200) * 0.30 }
  }
  if (t < 4300) { // 分球 #1 -> #2
    const k = (t - 3300) / 1000
    return { x: handler.x + (corner.x - handler.x) * k, y: handler.y + (corner.y - handler.y) * k, z: 3.0 + Math.sin(Math.PI * k) * 3.0 }
  }
  if (t < 5300) { // #2 底角调整
    return { x: corner.x + 0.6, y: corner.y - 0.6, z: 3.0 + Math.sin((t - 4300) / 160) * 0.30 }
  }
  if (t < 6900) { // 底角三分出手 -> 篮筐
    const k = (t - 5300) / 1600
    const a = corner
    return { x: a.x + (hoop.x - a.x) * k, y: a.y + (hoop.y - a.y) * k, z: 3.6 + Math.sin(Math.PI * Math.min(1, k * 1.05)) * 9.2 }
  }
  return { x: hoop.x, y: hoop.y, z: Math.max(0, 3 - (t - 6900) / 120) }
}

/** 连续多回合：第二回合起始站位与第一回合结束站位一致，无缝拼接 */
const PLAYS = [
  { script: SCRIPT, ball: ballAt, durMs: 10000 },
  { script: SCRIPT2, ball: ballAt2, durMs: 9400 }
]

/**
 * 生成内置样例帧序列（10fps，球场英尺坐标）。
 * 连续两个回合（阵地突破三分 + 高位挡拆空接），回合间 0.6s 死球过渡，
 * 使 splitPossessions 按 SHOT 切分出多个回合，模拟一段多回合比赛片段。
 * @returns {{frames:Array, meta:object}}
 */
export function syntheticFrames(seed = 20261010, durMs = 10000, fps = 10) {
  void durMs
  const rnd = mulberry32(seed)
  const dt = Math.round(1000 / fps)
  const jitter = () => (rnd() - 0.5) * 0.30
  const frames = []
  let clock = 0
  let last = null

  const emit = (offPos, defPos, ball) => {
    const players = []
    const add = (cur) => {
      const prev = last ? last.players.find((p) => p.id === cur.id) : null
      const vx = prev ? ((cur.x - prev.x) * FT_TO_M) / (dt / 1000) : 0
      const vy = prev ? ((cur.y - prev.y) * FT_TO_M) / (dt / 1000) : 0
      players.push({ ...cur, vx, vy, speed: Math.hypot(vx, vy) })
    }
    offPos.forEach(add)
    defPos.forEach(add)
    const fr = { t: clock, ball: { ...ball, conf: 0.9 }, players }
    frames.push(fr)
    last = fr
    clock += dt
  }

  for (let pi = 0; pi < PLAYS.length; pi++) {
    const play = PLAYS[pi]
    const n = Math.round((play.durMs / 1000) * fps)
    for (let i = 0; i <= n; i++) {
      const lt = i * dt
      const offPos = play.script.off.map((p) => {
        const k = keyAt(p.keys, lt)
        return { id: `O${p.num}`, team: 'off', num: p.num, x: k.x + jitter(), y: k.y + jitter(), conf: 0.82 + rnd() * 0.14 }
      })
      const defPos = play.script.def.map((p) => {
        const k = keyAt(p.keys, lt)
        return { id: `D${p.num}`, team: 'def', num: p.num, x: k.x + jitter(), y: k.y + jitter(), conf: 0.80 + rnd() * 0.16 }
      })
      emit(offPos, defPos, play.ball(lt, offPos))
    }
  }

  const durTotal = frames.length ? frames[frames.length - 1].t : 0
  return {
    frames,
    meta: {
      sourceName: '独行侠 vs 火箭 · Q2 5:12（解析自上传视频）',
      durationMs: durTotal,
      fps,
      width: 1920,
      height: 1080,
      engine: 'synthetic',
      calibrated: true,
      courtMap: defaultCalibration(1920, 1080)
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. 轨迹 -> 帧序列（真实视频通道使用）
 * ------------------------------------------------------------------ */

/** 用 k-means(k=2) 按平均位置把轨迹分成两队，并判定持球方为进攻方 */
function resolveTeams(tracks, frames) {
  const list = Object.values(tracks.byId).filter(tr => tr.path.length > 4)
  if (list.length < 4) return
  const pts = list.map(tr => ({ tr, x: tr.avgX, y: tr.avgY }))
  let c1 = pts[0], c2 = pts[pts.length - 1]
  for (let iter = 0; iter < 12; iter++) {
    const g1 = [], g2 = []
    for (const p of pts) {
      const d1 = Math.hypot(p.x - c1.x, p.y - c1.y)
      const d2 = Math.hypot(p.x - c2.x, p.y - c2.y)
      ;(d1 <= d2 ? g1 : g2).push(p)
    }
    if (!g1.length || !g2.length) break
    c1 = { x: g1.reduce((s, p) => s + p.x, 0) / g1.length, y: g1.reduce((s, p) => s + p.y, 0) / g1.length }
    c2 = { x: g2.reduce((s, p) => s + p.x, 0) / g2.length, y: g2.reduce((s, p) => s + p.y, 0) / g2.length }
    for (const p of pts) {
      const d1 = Math.hypot(p.x - c1.x, p.y - c1.y)
      const d2 = Math.hypot(p.x - c2.x, p.y - c2.y)
      p.group = d1 <= d2 ? 0 : 1
    }
  }
  // 含球权次数多的一组为进攻方
  let g0 = 0, g1Count = 0
  for (const f of frames) {
    let best = null, bd = 3.2
    for (const p of f.players) {
      const d = Math.hypot(p.x - f.ball.x, p.y - f.ball.y)
      if (d < bd) { bd = d; best = p }
    }
    if (!best) continue
    const rec = pts.find(p => p.tr.id === best.id)
    if (!rec) continue
    if (rec.group === 0) g0++; else g1Count++
  }
  const offGroup = g0 >= g1Count ? 0 : 1
  const counters = { 0: 0, 1: 0 }
  for (const p of pts) {
    const team = p.group === offGroup ? 'off' : 'def'
    p.tr.team = team
    p.tr.num = ++counters[p.group]
  }
  // 写回帧
  for (const f of frames) {
    for (const pl of f.players) {
      const rec = pts.find(p => p.tr.id === pl.id)
      if (rec) { pl.team = rec.tr.team; pl.num = rec.tr.num }
    }
  }
}

/**
 * 将像素轨迹（经单应矩阵）映射为球场坐标帧序列
 * @param {Array} rawFrames [{t, dets:[{id,cx,cy,cls,conf}]}]
 * @param {number[]} H 图像 -> 球场
 * @param {object} meta
 */
export function framesFromPixelTracks(rawFrames, H, meta) {
  const byId = {}
  const frames = []
  for (const rf of rawFrames) {
    const players = []
    let ball = null
    for (const d of rf.dets) {
      const c = applyH(H, d.cx, d.cy)
      if (!c || !insideCourt(c, 0.2)) continue
      if (d.cls === 32) { ball = { x: c.x, y: c.y, z: 3.2, conf: d.conf }; continue }
      let rec = byId[d.id]
      if (!rec) {
        rec = byId[d.id] = { id: d.id, team: 'off', num: 0, path: [], totalDist: 0, maxSpeed: 0, avgSpeed: 0, avgX: c.x, avgY: c.y, _n: 0 }
      }
      const prev = rec.path[rec.path.length - 1]
      const speed = prev ? (dist(prev, c) * FT_TO_M) / ((rf.t - prev.t) / 1000 || 0.1) : 0
      rec.path.push({ t: rf.t, x: c.x, y: c.y, speed, conf: d.conf })
      rec.totalDist = (rec.totalDist || 0) + (prev ? dist(prev, c) : 0)
      rec.maxSpeed = Math.max(rec.maxSpeed || 0, speed)
      rec._n = (rec._n || 0) + 1
      rec.avgX = (rec.avgX * (rec._n - 1) + c.x) / rec._n
      rec.avgY = (rec.avgY * (rec._n - 1) + c.y) / rec._n
      players.push({ id: d.id, team: 'off', num: 0, x: c.x, y: c.y, conf: d.conf, vx: 0, vy: 0, speed })
    }
    frames.push({ t: rf.t, ball: ball || { x: 47, y: 25, z: 3.2, conf: 0.2 }, players })
  }
  for (const rec of Object.values(byId)) {
    const sp = rec.path.map(p => p.speed).filter(v => v > 0)
    rec.avgSpeed = sp.length ? sp.reduce((a, b) => a + b, 0) / sp.length : 0
    rec.totalDist = rec.totalDist * FT_TO_M
  }
  resolveTeams({ byId }, frames)
  // 帧内速度回填（分队后）
  for (const f of frames) {
    for (const pl of f.players) {
      const rec = byId[pl.id]
      if (!rec) continue
      const idx = rec.path.findIndex(p => p.t === f.t)
      const prev = idx > 0 ? rec.path[idx - 1] : null
      if (prev) {
        pl.vx = (pl.x - prev.x) * FT_TO_M / ((f.t - prev.t) / 1000)
        pl.vy = (pl.y - prev.y) * FT_TO_M / ((f.t - prev.t) / 1000)
        pl.speed = Math.hypot(pl.vx, pl.vy)
      }
      pl.team = rec.team
      pl.num = rec.num
    }
  }
  return { frames, tracks: { byId }, meta }
}

/* ------------------------------------------------------------------ *
 * 3. 统一装配
 * ------------------------------------------------------------------ */

/**
 * 由帧序列装配完整分析结果（调用事件/战术/指标引擎）
 * @param {{frames:Array, tracks?:object, meta:object}} input
 * @returns {object} AnalysisResult
 */
export function buildResult(input) {
  const frames = input.frames || []
  const meta = input.meta || {}
  const tracks = input.tracks || buildTracks(frames)
  const events = detectEvents(frames, tracks)
  const possessions = splitPossessions(frames, events)
  const factors = buildFactors(events, tracks, frames)
  const evidence = buildEvidence(events, tracks, frames, meta)
  const narration = buildNarration(events, factors, meta)
  const metrics = buildMetrics(frames, tracks, events)
  return {
    id: `an_${meta.sourceId || Date.now()}`,
    meta: {
      ...meta,
      eventCount: events.length,
      possessionCount: possessions.length,
      generatedAt: new Date().toISOString()
    },
    courtMap: meta.courtMap || defaultCalibration(meta.width || 1920, meta.height || 1080),
    frames,
    tracks,
    events,
    possessions,
    factors,
    evidence,
    narration,
    metrics
  }
}

/** 从帧序列构建 tracks（合成路径直接有 id/team/num） */
export function buildTracks(frames) {
  const byId = {}
  for (const f of frames) {
    for (const p of f.players) {
      let rec = byId[p.id]
      if (!rec) {
        rec = byId[p.id] = {
          id: p.id, team: p.team, num: p.num, path: [],
          totalDist: 0, maxSpeed: 0, avgSpeed: 0, avgX: p.x, avgY: p.y, _n: 0
        }
      }
      const prev = rec.path[rec.path.length - 1]
      rec.path.push({ t: f.t, x: p.x, y: p.y, speed: p.speed, conf: p.conf })
      if (prev) rec.totalDist += dist(prev, { x: p.x, y: p.y }) * FT_TO_M
      rec.maxSpeed = Math.max(rec.maxSpeed, p.speed || 0)
      rec._n++
      rec.avgX = (rec.avgX * (rec._n - 1) + p.x) / rec._n
      rec.avgY = (rec.avgY * (rec._n - 1) + p.y) / rec._n
      rec.team = p.team
      rec.num = p.num
    }
  }
  for (const rec of Object.values(byId)) {
    const sp = rec.path.map(p => p.speed).filter(v => v > 0)
    rec.avgSpeed = sp.length ? sp.reduce((a, b) => a + b, 0) / sp.length : 0
    delete rec._n
  }
  return { byId }
}

/** 内置样例：一键生成完整分析结果（无需视频） */
export function analyzeSynthetic(opts = {}) {
  const { frames, meta } = syntheticFrames(opts.seed ?? 20261010, opts.durationMs ?? 10000, opts.fps ?? 10)
  return buildResult({ frames, meta: { ...meta, sourceId: `syn${opts.seed ?? 20261010}` } })
}
