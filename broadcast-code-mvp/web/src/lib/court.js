/**
 * 球场几何与帧数据工具（契约：docs/api/dataset-contract.md §1）
 * 坐标：ft（0-94 × 0-50）→ SVG 单位 ×10，viewBox 0 0 940 500。
 * 镜像纪律：数据已是绝对球场坐标（g002 生成期完成 x 镜像），
 * 本层全部数据驱动，不假设进攻方向。
 */

export const COURT = Object.freeze({
  W: 940, H: 500,
  LEFT_HOOP: [40, 250],
  RIGHT_HOOP: [900, 250],
  THREE_R: 237.5,
  CORNER_INSET: 30
})

export const ft = v => v * 10

/** 判断回合进攻篮筐：取最后一帧球的位置，距哪个篮筐更近（镜像安全） */
export function attackHoop(frames) {
  if (!frames || frames.length === 0) return COURT.RIGHT_HOOP
  const b = frames[frames.length - 1].ball
  const x = ft(b.x), y = ft(b.y)
  const dl = Math.hypot(x - COURT.LEFT_HOOP[0], y - COURT.LEFT_HOOP[1])
  const dr = Math.hypot(x - COURT.RIGHT_HOOP[0], y - COURT.RIGHT_HOOP[1])
  return dl < dr ? COURT.LEFT_HOOP : COURT.RIGHT_HOOP
}

/** 帧插值：t(ms) → 相邻两帧线性插值（10fps 逻辑帧，60fps 渲染帧） */
export function sampleFrame(frames, t) {
  if (!frames || frames.length === 0) return null
  if (t <= 0) return frames[0]
  const last = frames[frames.length - 1]
  if (t >= last.t) return last
  const idx = Math.min(Math.floor(t / 100), frames.length - 2)
  const a = frames[idx], b = frames[idx + 1]
  if (!a || !b || b.t <= a.t) return a || last
  const k = (t - a.t) / (b.t - a.t)
  const lerp = (u, v) => u + (v - u) * k
  return {
    t,
    ball: { x: lerp(a.ball.x, b.ball.x), y: lerp(a.ball.y, b.ball.y), z: lerp(a.ball.z, b.ball.z) },
    players: a.players.map((pa, i) => {
      const pb = b.players[i]
      return { id: pa.id, team: pa.team, role: pa.role, x: lerp(pa.x, pb.x), y: lerp(pa.y, pb.y) }
    })
  }
}

/** 球员朝向（由位移向量估计，用于骨架姿态旋转），无位移时保持上一角度 */
export function headingOf(frames, playerIdx, t, fallback = 0) {
  const prev = sampleFrame(frames, Math.max(0, t - 200))
  const cur = sampleFrame(frames, t)
  if (!prev || !cur) return fallback
  const dx = cur.players[playerIdx].x - prev.players[playerIdx].x
  const dy = cur.players[playerIdx].y - prev.players[playerIdx].y
  if (Math.hypot(dx, dy) < 0.05) return fallback
  return Math.atan2(dy, dx)
}

/** 骨架角色配色（仅数据标注层允许使用关键点三色） */
export function roleColor(player, ballHandlerId) {
  if (player.id === ballHandlerId || player.role === 'handler') return 'var(--skeleton-ball)'
  if (player.role === 'defender' || player.role === 'help') return 'var(--skeleton-defense)'
  return 'var(--skeleton-offball)'
}

/** 当前持球人：球 z 在手部高度且 2ft 内最近的进攻球员 */
export function ballHandler(frame) {
  if (!frame || frame.ball.z > 4.5) return null
  let best = null, bestD = 2.0
  for (const p of frame.players) {
    if (p.role === 'defender' || p.role === 'help') continue
    const d = Math.hypot(p.x - frame.ball.x, p.y - frame.ball.y)
    if (d < bestD) { bestD = d; best = p.id }
  }
  return best
}
