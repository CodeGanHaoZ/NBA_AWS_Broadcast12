/**
 * 实时指标 — AC-07：投篮难度/引力/关键度随播放头逐帧更新。
 * 公式逐字对齐 dataset-contract.md §2.4，输入为当前插值帧实测值（不是编的值）。
 */

const clamp01 = v => Math.max(0, Math.min(1, v))

/** 引力：持球人 2ft 内防守人数 n0、6ft 内 n1 */
export function gravityAt(frame, handlerId, isStar) {
  if (!frame || !handlerId) return 0
  const h = frame.players.find(p => p.id === handlerId)
  if (!h) return 0
  let n0 = 0, n1 = 0
  for (const p of frame.players) {
    if (p.role !== 'defender' && p.role !== 'help') continue
    const d = Math.hypot(p.x - h.x, p.y - h.y)
    if (d <= 2) n0++
    if (d <= 6) n1++
  }
  return clamp01(0.5 * n0 + 0.25 * (n1 - n0) + 0.5 * (isStar ? 1 : 0))
}

/** 投篮难度：射手到进攻篮筐距离 + 最近防守人距离（逐帧实测） */
export function shotDifficultyAt(frame, shooterId, hoopFt) {
  if (!frame || !shooterId) return 0
  const s = frame.players.find(p => p.id === shooterId)
  if (!s) return 0
  const distFt = Math.hypot(s.x - hoopFt[0], s.y - hoopFt[1])
  let defDistFt = 99
  for (const p of frame.players) {
    if (p.role !== 'defender' && p.role !== 'help') continue
    defDistFt = Math.min(defDistFt, Math.hypot(p.x - s.x, p.y - s.y))
  }
  const dShot = clamp01((distFt - 2) / 26)
  const dDef = 1 - clamp01(defDistFt / 8)
  return clamp01(0.55 * dShot + 0.45 * dDef)
}

/** 空间增益：射手为圆心、最近防守人距离为半径的圆面积 ft² */
export function spacingAt(frame, shooterId) {
  if (!frame || !shooterId) return 0
  const s = frame.players.find(p => p.id === shooterId)
  if (!s) return 0
  let r = 99
  for (const p of frame.players) {
    if (p.role !== 'defender' && p.role !== 'help') continue
    r = Math.min(r, Math.hypot(p.x - s.x, p.y - s.y))
  }
  return Math.round(Math.PI * r * r * 10) / 10
}

/** 关键度：随播放头推进的节内剩余时间衰减（margin 静态，fClock 逐帧） */
export function clutchAt(play, tMs) {
  if (!play) return 0
  const clockSec = parseClock(play.clock)
  const secLeft = Math.max(0, clockSec - tMs / 1000)
  const fClock = clamp01((180 - secLeft) / 180)
  const margin = Math.abs((play.scoreBefore?.home ?? 0) - (play.scoreBefore?.away ?? 0))
  const fMargin = 1 - clamp01(Math.abs(margin) / 12)
  return clamp01(0.6 * fClock + 0.4 * fMargin)
}

/** 'MM:SS.s' → 秒 */
export function parseClock(clock) {
  if (typeof clock !== 'string') return 0
  const m = clock.match(/^(\d+):(\d+(?:\.\d+)?)$/)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

/** 10×10 点阵热图：射手全程轨迹密度分箱（S-02 数据块） */
export function heatmapBins(frames, shooterId) {
  const bins = new Array(100).fill(0)
  if (!frames || !shooterId) return bins
  for (const f of frames) {
    const p = f.players.find(pl => pl.id === shooterId)
    if (!p) continue
    const bx = Math.min(9, Math.max(0, Math.floor(p.x / 9.4)))
    const by = Math.min(9, Math.max(0, Math.floor(p.y / 5)))
    bins[by * 10 + bx]++
  }
  const max = Math.max(1, ...bins)
  return bins.map(v => v / max)
}
