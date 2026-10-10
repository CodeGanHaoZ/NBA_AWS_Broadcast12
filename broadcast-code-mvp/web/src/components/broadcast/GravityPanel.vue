<script setup>
/**
 * 球员引力 GRAVITY
 * 结构照搬参考工程：皮革纹理卡头 + 大数字 + 迷你柱（该球员各次出手的 xFG）+ FG% / 3P% / xFG 三宫格。
 */
import { computed, ref, watch, onUnmounted } from 'vue'
import { selectedMetric } from '../../lib/broadcast/model.js'

const m = computed(() => selectedMetric.value)

/** 大数字：组件内 watch 驱动的滚动计数（v-countup 指令的 updated 钩子在纯文本变化时不可靠，rAF 会把旧值盖回 DOM） */
const gravEl = ref(null)
const gravText = ref('—')
let gravRAF = 0

watch(m, (nv) => {
  cancelAnimationFrame(gravRAF)
  const target = nv?.gravity
  if (target === null || target === undefined || Number.isNaN(parseFloat(target))) {
    gravText.value = '—'
    return
  }
  const t = parseFloat(target)
  const decimals = (String(target).split('.')[1] || '').length
  const prev = parseFloat(gravText.value)
  const from = Number.isNaN(prev) ? 0 : prev
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gravText.value = t.toFixed(decimals)
    return
  }
  const dur = 720, start = performance.now()
  const tick = (now) => {
    const k = Math.min(1, (now - start) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    gravText.value = (from + (t - from) * e).toFixed(decimals)
    if (k < 1) gravRAF = requestAnimationFrame(tick)
  }
  gravRAF = requestAnimationFrame(tick)
}, { immediate: true })

onUnmounted(() => cancelAnimationFrame(gravRAF))

/** 迷你柱：用该球员真实出手的 xFG 序列，不虚构趋势 */
const spark = computed(() => {
  const shots = m.value?.shots || []
  const w = 260 / Math.max(shots.length, 1)
  return shots.map((s, i) => {
    const v = Math.min(1, Math.max(0, s.xfg || 0))
    const h = v * 22
    return {
      x: (i * w + 2).toFixed(1),
      y: (24 - h).toFixed(1),
      w: Math.max(0.5, w - 4).toFixed(1),
      h: h.toFixed(1),
      fill: s.made ? 'var(--bc-signal)' : 'var(--bc-line)',
    }
  })
})
</script>

<template>
  <div class="panel">
    <div class="leather">
      <h3>球员引力 GRAVITY</h3><span class="r">F6 · LIVE</span>
    </div>

    <div class="bignum">
      <span class="v num" ref="gravEl">{{ gravText }}</span>
      <div class="meta">
        <div class="k">GRAVITY INDEX</div>
        <div class="sub">#{{ m?.number }} {{ m?.name }} · {{ m?.team }}</div>
      </div>
    </div>

    <svg class="spark" viewBox="0 0 260 26" preserveAspectRatio="none" aria-hidden="true">
      <rect v-for="(r, i) in spark" :key="i" :x="r.x" :y="r.y" :width="r.w" :height="r.h" :fill="r.fill"></rect>
    </svg>

    <div class="stat3">
      <div class="cell">
        <div class="k">FG%</div>
        <div class="v">{{ m ? m.fg.pct.toFixed(1) : '—' }}</div>
        <div class="d">{{ m ? `${m.fg.made} / ${m.fg.att}` : '' }}</div>
      </div>
      <div class="cell">
        <div class="k">3P%</div>
        <div class="v">{{ m && m.tp.pct !== null ? m.tp.pct.toFixed(1) : '—' }}</div>
        <div class="d">{{ m && m.tp.att ? `${m.tp.made} / ${m.tp.att}` : '无出手' }}</div>
      </div>
      <div class="cell">
        <div class="k">xFG 均值</div>
        <div class="v">{{ m ? m.xfgAvg.toFixed(2) : '—' }}</div>
        <div class="d">投篮质量</div>
      </div>
    </div>
  </div>
</template>
