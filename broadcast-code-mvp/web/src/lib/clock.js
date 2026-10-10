/**
 * replayClock — 全应用唯一时钟（K8/K10 铁律）
 * 状态机：idle → loading → replaying ⇄ paused → settled
 * 所有时序（帧渲染 / 标注层 / 打字机 / scrubber / 数据面板）从此时钟派生，
 * 任何组件不得自起 setTimeout / setInterval / rAF 做时序。
 *
 * 输出两种回调：
 *  - onFrame(t, wallDt)  每个 rAF：t=播放时间(ms, 已乘倍速)，wallDt=真实墙钟增量(ms, 暂停时为 0)
 *  - onTick(t)           每跨过 100ms 逻辑帧边界（10fps 离散 UI 更新）
 *  - onState(s)          状态迁移
 */

export const ClockState = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  REPLAYING: 'replaying',
  PAUSED: 'paused',
  SETTLED: 'settled'
})

export function createReplayClock() {
  let state = ClockState.IDLE
  let t = 0                 // 播放时间 ms（播放时间轴，源真相）
  let durationMs = 0
  let speed = 0.5           // 路演默认 0.5x
  let rafId = 0
  let lastNow = 0
  let lastTickBoundary = -1

  const frameSubs = new Set()
  const tickSubs = new Set()
  const stateSubs = new Set()

  function setState(next) {
    if (state === next) return
    state = next
    stateSubs.forEach(fn => fn(state))
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop)
    if (state !== ClockState.REPLAYING) { lastNow = now; return }
    const wallDt = Math.min(now - lastNow, 100) // 防后台标签页大跳
    lastNow = now
    t = Math.min(t + wallDt * speed, durationMs)

    frameSubs.forEach(fn => fn(t, wallDt))

    const boundary = Math.floor(t / 100)
    if (boundary !== lastTickBoundary) {
      lastTickBoundary = boundary
      tickSubs.forEach(fn => fn(t))
    }

    if (t >= durationMs) {
      setState(ClockState.SETTLED)
    }
  }

  return {
    get state() { return state },
    get t() { return t },
    get durationMs() { return durationMs },
    get speed() { return speed },

    onFrame(fn) { frameSubs.add(fn); return () => frameSubs.delete(fn) },
    onTick(fn) { tickSubs.add(fn); return () => tickSubs.delete(fn) },
    onState(fn) { stateSubs.add(fn); return () => stateSubs.delete(fn) },

    /** 进入加载态（选中新回合） */
    load(durMs) {
      durationMs = Math.max(0, durMs | 0)
      t = 0
      lastTickBoundary = -1
      setState(ClockState.LOADING)
    },
    /** 数据就绪，开始重演 */
    start() {
      if (durationMs <= 0) return
      lastNow = performance.now()
      setState(ClockState.REPLAYING)
    },
    play() {
      if (state === ClockState.PAUSED || state === ClockState.SETTLED) {
        if (state === ClockState.SETTLED) { t = 0; lastTickBoundary = -1 }
        lastNow = performance.now()
        setState(ClockState.REPLAYING)
      }
    },
    pause() {
      if (state === ClockState.REPLAYING) setState(ClockState.PAUSED)
    },
    toggle() {
      if (state === ClockState.REPLAYING) this.pause()
      else this.play()
    },
    /** 跳转（事件刻度点击 / 逐帧 / scrubber 拖动） */
    seek(ms) {
      t = Math.max(0, Math.min(ms, durationMs))
      lastTickBoundary = Math.floor(t / 100) - 1 // 强制下一帧重发 tick
      if (state === ClockState.SETTLED && t < durationMs) {
        lastNow = performance.now()
        setState(ClockState.REPLAYING)
      }
      if (state === ClockState.IDLE || state === ClockState.LOADING) return
      // seek 后立即广播一次，保证 scrubber/标注/解说同步
      frameSubs.forEach(fn => fn(t, 0))
      const boundary = Math.floor(t / 100)
      if (boundary !== lastTickBoundary) {
        lastTickBoundary = boundary
        tickSubs.forEach(fn => fn(t))
      }
    },
    stepFrame(dir) {
      if (state === ClockState.REPLAYING) this.pause()
      this.seek(Math.round(t / 100) * 100 + dir * 100)
    },
    setSpeed(s) {
      speed = s
    },
    /** 打断：切回合/切比赛时调用，回到 idle */
    interrupt() {
      t = 0
      durationMs = 0
      lastTickBoundary = -1
      setState(ClockState.IDLE)
    },
    boot() { rafId = requestAnimationFrame(loop) },
    destroy() { cancelAnimationFrame(rafId) }
  }
}
