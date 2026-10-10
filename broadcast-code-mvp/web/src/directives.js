/**
 * 视频分析工作台 · 全局指令
 *  - v-reveal : 滚动进入视口时渐入（opacity + 8px 上移），匹配 design-tokens.css 的 .bc-reveal 原语
 *  - v-countup: KPI / 数字类文本从旧值缓动到新值（easeOutCubic），仅动数字、保留前后缀与 <em> 单位
 * 动效纪律：仅 opacity / transform，遵循 --bc-ease / prefers-reduced-motion 降级。
 */

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 向上查找最近的滚动容器（overflow 为 auto/scroll/overlay 的祖先），用作 IntersectionObserver 的 root */
function findScrollRoot(el) {
  let n = el.parentElement
  while (n && n !== document.body && n !== document.documentElement) {
    const s = getComputedStyle(n)
    const ov = s.overflowY || s.overflow
    if (/auto|scroll|overlay/.test(ov)) return n
    n = n.parentElement
  }
  return null
}

/** 触发全局重置：回到顶部后，未在视口内的元素重新武装入场动效（再次滚入视口时重放） */
export function resetReveals() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vb:reveal-reset'))
}

export const reveal = {
  mounted(el, binding) {
    el.classList.add('bc-reveal')
    if (binding.value) el.style.transitionDelay = (binding.value | 0) + 'ms'
    if (reduceMotion()) { el.classList.add('is-in'); return }

    const root = findScrollRoot(el)
    let done = false
    let io = null
    try {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            el.__revealVisible = e.isIntersecting
            if (e.isIntersecting) {
              el.classList.add('is-in')
              done = true
            }
          }
        },
        { root, threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
      )
      io.observe(el)
    } catch (_) {
      el.classList.add('is-in')
    }
    // 兜底：2.5s 后无论如何显示，避免任何情况下内容不可见
    el.__revealFallback = setTimeout(() => {
      if (!done) el.classList.add('is-in')
    }, 2500)
    // 重置：仅清掉当前不在视口内的元素（首屏可见内容保持，避免闪烁）
    el.__revealOnReset = () => {
      if (!el.__revealVisible) el.classList.remove('is-in')
    }
    window.addEventListener('vb:reveal-reset', el.__revealOnReset)
    el.__revealIO = io
  },
  unmounted(el) {
    clearTimeout(el.__revealFallback)
    window.removeEventListener('vb:reveal-reset', el.__revealOnReset)
    if (el.__revealIO) el.__revealIO.disconnect()
  }
}

export const countup = {
  mounted(el) {
    animate(el)
  },
  updated(el) {
    animate(el)
  }
}

function animate(el) {
  if (reduceMotion()) return
  const text = el.textContent || ''
  const m = text.match(/-?\d+(?:\.\d+)?/)
  if (!m) return
  const target = parseFloat(m[0])
  const decimals = (m[0].split('.')[1] || '').length
  const prefix = text.slice(0, m.index)
  const suffix = text.slice(m.index + m[0].length)
  const prev = Number.isNaN(parseFloat(el.__cu)) ? 0 : parseFloat(el.__cu)
  el.__cu = target

  const dur = 720
  const start = performance.now()
  if (el.__cuRAF) cancelAnimationFrame(el.__cuRAF)
  const tick = (now) => {
    const k = Math.min(1, (now - start) / dur)
    const e = 1 - Math.pow(1 - k, 3) // easeOutCubic
    const v = prev + (target - prev) * e
    el.textContent = prefix + v.toFixed(decimals) + suffix
    if (k < 1) el.__cuRAF = requestAnimationFrame(tick)
  }
  el.__cuRAF = requestAnimationFrame(tick)
}
