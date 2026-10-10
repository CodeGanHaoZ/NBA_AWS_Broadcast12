/**
 * 视频分析工作台状态中枢
 * 单一回放时钟（rAF 驱动），所有面板消费同一 t，保证战术板/时间轴/解说逐帧一致。
 */
import { reactive, computed } from 'vue'
import { analyzeSynthetic } from './vision/pipeline.js'
import { analyzeVideo } from './vision/analyzer.js'

export const S = reactive({
  view: 'analysis',          // analysis | dashboard
  overlayOn: true,
  stage: 'idle',             // idle | imported | analyzing | ready | error
  analysis: null,
  activePos: 0,              // 当前回合索引
  t: 0,                      // 回放时间 ms
  playing: false,
  speed: 1,
  progress: { phase: '', message: '', value: 0 },
  error: null,
  engine: null,              // { mode, label, inferMs }
  sourceName: '',
  anchorMode: false,
  selectedPlayer: null,      // 战术台被点选的球员 id（null = 未选）
  activeFactor: null,        // 因素图 / 战术台联动的焦点因素 id（null = 未选）
  toast: ''
})

let rafId = null
let lastTs = 0

/* ---------------- 派生 ---------------- */

export const frames = computed(() => S.analysis?.frames || [])
export const events = computed(() => S.analysis?.events || [])
export const factors = computed(() => S.analysis?.factors || [])
export const evidence = computed(() => S.analysis?.evidence || [])
export const narration = computed(() => S.analysis?.narration || [])
export const metrics = computed(() => S.analysis?.metrics || null)
export const durationMs = computed(() => {
  const f = frames.value
  return f.length ? f[f.length - 1].t : 0
})

/** 当前回合（含其时间范围与事件） */
export const activePossession = computed(() => {
  const ps = S.analysis?.possessions || []
  return ps[S.activePos] || ps[0] || null
})

/** 当前 t 所属回合索引（自动跟随） */
export const possessionAtT = computed(() => {
  const ps = S.analysis?.possessions || []
  for (let i = 0; i < ps.length; i++) {
    if (S.t >= ps[i].t0 && S.t <= ps[i].t1) return i
  }
  return ps.length ? ps.length - 1 : 0
})

/** 相邻两帧线性插值（渲染帧，球场英尺） */
export const curFrame = computed(() => {
  const f = frames.value
  if (!f.length) return null
  if (S.t <= f[0].t) return f[0]
  const last = f[f.length - 1]
  if (S.t >= last.t) return last
  const step = f.length > 1 ? f[1].t - f[0].t : 100
  const i = Math.min(f.length - 2, Math.max(0, Math.floor(S.t / step)))
  const a = f[i], b = f[i + 1]
  if (!a || !b) return a || last
  const k = (S.t - a.t) / (b.t - a.t || 1)
  const lerp = (u, v) => u + (v - u) * k
  return {
    t: S.t,
    ball: { x: lerp(a.ball.x, b.ball.x), y: lerp(a.ball.y, b.ball.y), z: lerp(a.ball.z, b.ball.z) },
    players: a.players.map((pa, idx) => {
      const pb = b.players[idx] || pa
      return { ...pa, x: lerp(pa.x, pb.x), y: lerp(pa.y, pb.y) }
    })
  }
})

/** 当前时刻附近的事件（±600ms） */
export const curEvents = computed(() => {
  return events.value.filter(e => Math.abs(e.t - S.t) <= 600)
})

/** 已发生的事件（时间轴着色用） */
export const pastEvents = computed(() => events.value.filter(e => e.t <= S.t))

/** 当前解说（最后一条 t <= S.t） */
export const curNarration = computed(() => {
  const ns = narration.value.filter(n => n.t <= S.t)
  return ns.length ? ns[ns.length - 1] : narration.value[0] || null
})

/* ---------------- 时钟 ---------------- */

function tick(ts) {
  if (!lastTs) lastTs = ts
  const dt = ts - lastTs
  lastTs = ts
  if (S.playing) {
    S.t += dt * S.speed
    const d = durationMs.value
    if (S.t >= d) { S.t = 0; /* 循环播放：回起点继续 */ }
    const pi = possessionAtT.value
    if (S.analysis?.possessions?.length && pi !== S.activePos) {
      // 仅在手动未锁定时跟随；此处保持与播放头一致
      S.activePos = pi
    }
  }
  rafId = requestAnimationFrame(tick)
}

export function startClock() {
  if (rafId) cancelAnimationFrame(rafId)
  lastTs = 0
  rafId = requestAnimationFrame(tick)
}

/* ---------------- 动作 ---------------- */

export function play() { if (S.t >= durationMs.value) S.t = 0; S.playing = true }
export function pause() { S.playing = false }
export function toggle() { S.playing ? pause() : play() }
export function setSpeed(v) { S.speed = v }
export function seek(t) { S.t = Math.max(0, Math.min(durationMs.value, t)) }

export function selectPossession(i) {
  S.activePos = i
  const p = S.analysis?.possessions?.[i]
  if (p) { S.t = p.t0; S.playing = false }
}

export function setAnalysis(result, engineInfo) {
  S.analysis = result
  S.stage = 'ready'
  S.activePos = 0
  S.t = result.possessions?.[0]?.t0 ?? 0
  S.playing = true
  S.error = null
  S.selectedPlayer = null
  S.activeFactor = null
  S.engine = engineInfo || { mode: result.meta?.engine, label: result.meta?.engineLabel }
  S.sourceName = result.meta?.sourceName || ''
  startClock()
}

export function showToast(msg) {
  S.toast = msg
  setTimeout(() => { if (S.toast === msg) S.toast = '' }, 3200)
}

/** 载入内置样例（无需视频，用于快速演示与自测） */
export function loadSynthetic(opts = {}) {
  try {
    S.stage = 'analyzing'
    S.progress = { phase: 'synthetic', message: '生成内置样例回合', value: 0.4 }
    const result = analyzeSynthetic(opts)
    setAnalysis(result, { mode: 'synthetic', label: '内置样例轨迹 · 确定性生成器' })
    return result
  } catch (e) {
    S.stage = 'error'
    S.error = String(e?.message || e)
    return null
  }
}

/** 分析真实视频 */
export async function analyzeFile(file, opts = {}) {
  S.stage = 'analyzing'
  S.error = null
  S.progress = { phase: 'open', message: '打开视频', value: 0 }
  try {
    const result = await analyzeVideo(file, opts, p => {
      S.progress = { phase: p.phase, message: p.message, value: p.progress }
    })
    S.sourceName = result.meta.sourceName
    setAnalysis(result, { mode: result.meta.engine, label: result.meta.engineLabel, inferMs: result.meta.inferMs })
    return result
  } catch (e) {
    S.stage = 'error'
    S.error = String(e?.message || e)
    return null
  }
}

export function setView(v) { S.view = v; S.selectedPlayer = null; S.activeFactor = null }
export function toggleOverlay() { S.overlayOn = !S.overlayOn }

/** 点选球员（再次点击同一球员取消选择） */
export function selectPlayer(id) { S.selectedPlayer = S.selectedPlayer === id ? null : id }
export function clearPlayer() { S.selectedPlayer = null }

/** 点选因素（战术台/因素图联动）：再次点击同一因素取消 */
export function selectFactor(id) { S.activeFactor = S.activeFactor === id ? null : id }
export function clearFactor() { S.activeFactor = null }

/** 当前选中因素对象（含 type，供战术台叠加联动高亮） */
export const activeFactorInfo = computed(() => {
  const id = S.activeFactor
  if (!id) return null
  return (S.analysis?.factors || []).find(f => f.id === id) || null
})

/** 当前选中球员的明细（跑动/速度/参与事件），供战术台详情卡消费 */
export const selectedPlayerInfo = computed(() => {
  const id = S.selectedPlayer
  if (!id || !S.analysis) return null
  const tr = S.analysis.tracks?.byId?.[id] || null
  const load = (S.analysis.metrics?.playerLoad || []).find(p => p.id === id) || null
  const evs = (S.analysis.events || []).filter(e => (e.players || []).includes(id))
  const frame = curFrame.value
  const pl = frame?.players?.find(p => p.id === id) || null
  return {
    id,
    num: tr?.num ?? pl?.num ?? 0,
    team: tr?.team ?? pl?.team ?? 'off',
    dist: load?.dist ?? (tr ? Math.round((tr.totalDist || 0) * 10) / 10 : 0),
    maxSpeed: load?.maxSpeed ?? Math.round((tr?.maxSpeed || 0) * 10) / 10,
    avgSpeed: load?.avgSpeed ?? Math.round((tr?.avgSpeed || 0) * 10) / 10,
    curSpeed: pl ? Math.round((pl.speed || 0) * 10) / 10 : 0,
    events: evs.map(e => ({ id: e.id, type: e.type, label: e.label, t: e.t }))
  }
})
