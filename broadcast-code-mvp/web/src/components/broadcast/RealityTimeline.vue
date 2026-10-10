<script setup>
/**
 * 现实时间轴
 * 结构照搬参考工程：斜杠标签 POS 07 / HOU + 标题 + 提示 / 道具道（回合带 · 事件打点 · 胜率曲线 · 播放头 · 游标）
 * + 下方事件芯片行。时间轴刻度用归一化比例，与工作台主时钟同源推进。
 */
import { computed, ref } from 'vue'
import {
  TRACKS, DURATION, EV_LABEL, fmtGameClock,
  bProgress, bT, wpValue, seekFromB, BS,
} from '../../lib/broadcast/model.js'
import { pause, seek } from '../../lib/store.js'

const railEl = ref(null)
const events = TRACKS.events
const wp = TRACKS.metrics.winProbability
const POS = TRACKS.possessions[0]

const frac = t => (t / DURATION)

/** 胜率 → y 映射（曲线与游标共用，值域自适应） */
const wpY = (() => {
  const vals = wp.map(p => p.home)
  const lo = Math.min(...vals) - 0.02, hi = Math.max(...vals) + 0.02
  return v => 42 - ((v - lo) / (hi - lo || 1)) * 34
})()

/** 胜率曲线（viewBox 0 0 1000 44） */
const wpPath = computed(() => {
  const pts = wp.map(p => [frac(p.t) * 1000, wpY(p.home)])
  return {
    line: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
    pts,
  }
})
const areaPath = computed(() => `${wpPath.value.line} L1000 44 L0 44 Z`)

/** 当前胜率游标 */
const cursor = computed(() => {
  const cur = wpValue(bT.value)
  return { cx: (bProgress.value * 1000).toFixed(1), cy: wpY(cur).toFixed(1) }
})

/** 距播放头最近的事件（±0.7s 内视为激活），与参考工程同规则 */
const activeId = computed(() => {
  let best = null, bestD = 1e9
  events.forEach(e => { const d = Math.abs(e.t - bT.value); if (d < bestD) { bestD = d; best = e } })
  return bestD < 0.7 ? best?.id : null
})

function jump(ev, id) {
  pause()
  seek(seekFromB(ev.t))
  BS.openEvent = id
}

function onRail(ev) {
  const el = railEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const k = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
  pause()
  seek(seekFromB(k * DURATION))
}
</script>

<template>
  <section class="tl-card">
    <div class="tl-head">
      <span class="slash"><i></i>POS 07 / {{ POS?.team || '—' }}</span>
      <h3>现实时间轴</h3>
      <span class="hint">点击打点跳转 ｜ 空格播放暂停 ｜ ←→ 逐帧</span>
    </div>

    <div class="tl-rail" ref="railEl" @click="onRail">
      <span class="tl-lane-label" style="top: 5px">POSSESSION</span>
      <div class="tl-poss"></div>

      <div class="tl-events">
        <button v-for="e in events" :key="e.id" class="tl-ev"
                :class="{ made: e.result === 'made', active: activeId === e.id }"
                :style="{ left: (frac(e.t) * 100) + '%' }"
                :title="`${fmtGameClock(e.t)} · ${EV_LABEL[e.type]} · ${e.label}`"
                @click.stop="jump(e, e.id)">
          <span class="tick"></span>
          <span class="dot"></span>
          <span class="ts">{{ fmtGameClock(e.t) }} {{ EV_LABEL[e.type] }}</span>
        </button>
      </div>

      <svg class="tl-wp" viewBox="0 0 1000 44" preserveAspectRatio="none" aria-label="胜率曲线">
        <path :d="areaPath" fill="rgba(57,194,215,.10)"></path>
        <path :d="wpPath.line" fill="none" stroke="var(--bc-key-cyan)" stroke-width="1.6" vector-effect="non-scaling-stroke"></path>
        <circle v-for="(p, i) in wpPath.pts" :key="'w' + i" :cx="p[0].toFixed(1)" :cy="p[1].toFixed(1)" r="2.6" fill="var(--bc-key-cyan)"></circle>
        <circle class="tl-wp-cur" :cx="cursor.cx" :cy="cursor.cy" r="4" fill="var(--bc-signal)"></circle>
      </svg>

      <span class="tl-lane-label" style="bottom: 3px">WIN PROBABILITY</span>
      <div class="tl-cursor" :style="{ width: (bProgress * 100) + '%' }"></div>
      <div class="tl-playhead" :style="{ left: (bProgress * 100) + '%' }"></div>
    </div>

    <div class="tl-evlist">
      <button v-for="e in events" :key="'c' + e.id" class="tl-chip"
              :class="{ active: BS.openEvent === e.id, live: activeId === e.id }"
              @click="jump(e, e.id)">
        <span class="ts">{{ fmtGameClock(e.t) }}</span>
        <span class="ty">{{ EV_LABEL[e.type] }}</span>
        <span class="lb">{{ e.label }}</span>
      </button>
    </div>
  </section>
</template>
