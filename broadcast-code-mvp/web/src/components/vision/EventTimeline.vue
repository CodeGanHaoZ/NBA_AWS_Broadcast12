<script setup>
/** 现实时间轴：事件刻度 + 播放头 + 当前回合焦点范围，可点选定位
 *  标签上下交错排布，避免密集事件重叠。 */
import { computed, ref } from 'vue'
import { S, events, durationMs, seek, activePossession, pause } from '../../lib/store.js'

const trackEl = ref(null)

const pct = t => (durationMs.value ? (t / durationMs.value) * 100 : 0)

const marks = computed(() => events.value.map((e, i) => ({ ...e, left: pct(e.t), row: i % 2 })))

const focus = computed(() => {
  const p = activePossession.value
  if (!p) return null
  return { left: pct(p.t0), width: Math.max(1, pct(p.t1) - pct(p.t0)) }
})

const ticks = computed(() => {
  const d = durationMs.value || 1
  const n = 5
  return Array.from({ length: n + 1 }, (_, i) => ({ left: (i / n) * 100, label: ((d * i) / n / 1000).toFixed(1) + 's' }))
})

function onClick(ev) {
  const el = trackEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const k = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
  pause()
  seek(k * durationMs.value)
}

function toEvent(e) { pause(); seek(e.t) }
</script>

<template>
  <div class="vb-axis">
    <div class="vb-axis__head">
      <span class="bc-kicker">现实时间轴 <i>/</i> 事件时间轴</span>
      <span class="vb-axis__range">{{ events.length }} 个事件 · 跨度 {{ ((durationMs || 0) / 1000).toFixed(1) }}s</span>
    </div>
    <div class="vb-axis__track" ref="trackEl" @click="onClick">
      <div class="vb-axis__line"></div>
      <div class="vb-axis__fill" :style="{ width: pct(S.t) + '%' }"></div>
      <div v-if="focus" class="vb-axis__focus" :style="{ left: focus.left + '%', width: focus.width + '%' }"></div>
      <div class="vb-axis__play" :style="{ left: pct(S.t) + '%' }"></div>
      <span v-for="(tk, i) in ticks" :key="'t' + i" class="vb-axis__label" :style="{ left: tk.left + '%' }">{{ tk.label }}</span>
      <div v-for="e in marks" :key="e.id" class="vb-ev" :data-kind="e.type"
           :class="{ 'is-on': Math.abs(e.t - S.t) <= 600, 'row-top': e.row === 1 }"
           :style="{ left: e.left + '%' }" @click.stop="toEvent(e)">
        <b class="vb-ev__lbl">{{ e.label }}</b>
        <i></i>
      </div>
    </div>
  </div>
</template>
