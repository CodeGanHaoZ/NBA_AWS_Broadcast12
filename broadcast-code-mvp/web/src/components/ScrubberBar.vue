<template>
  <footer class="sb" aria-label="时间轴">
    <span class="bc-kicker sb-kicker"><IconTimeline :size="16" /> Timeline</span>

    <span class="bc-mono sb-time">{{ fmt(headMs) }}</span>

    <div
      ref="trackEl"
      class="sb-track"
      role="slider"
      :aria-valuenow="Math.round(headMs)"
      :aria-valuemin="0"
      :aria-valuemax="duration"
      aria-label="回合内进度"
      tabindex="0"
      @pointerdown="onScrub"
      @keydown.left.prevent="clock.stepFrame(-1)"
      @keydown.right.prevent="clock.stepFrame(1)"
    >
      <div class="sb-rail"></div>
      <div ref="fillEl" class="sb-fill"></div>
      <!-- 事件刻度 ▲（可点击跳转） -->
      <button
        v-for="(m, i) in marks" :key="i"
        class="sb-mark"
        :class="{ 'is-passed': headMs >= m.t }"
        :style="{ left: pctOf(m.t) + '%' }"
        :title="`${m.label} · ${fmt(m.t)}`"
        :aria-label="`跳转到 ${m.label} ${fmt(m.t)}`"
        @pointerdown.stop
        @click.stop="jump(m.t)"
      ></button>
      <div ref="headEl" class="sb-head" aria-hidden="true"></div>
    </div>

    <span class="bc-mono sb-time">{{ fmt(duration) }}</span>

    <span class="bc-mono sb-dur" v-if="store.play">{{ store.play.label }}</span>
  </footer>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import IconTimeline from './icons/IconTimeline.vue'
import { store, clock, seekTo } from '../lib/store.js'

const trackEl = ref(null)
const headEl = ref(null)
const fillEl = ref(null)
const headMs = ref(0)

const duration = computed(() => store.play?.durationMs ?? 0)

/** 事件刻度：overlay t0 + 语义标签 */
const marks = computed(() => {
  const ovs = store.play?.overlays ?? []
  const labelOf = o => o.label || (o.type === 'arrow' ? (o.style === 'dashed' ? '跑位' : '传球') : o.type === 'zone' ? '区域' : '标注')
  return [...ovs]
    .sort((a, b) => a.t0 - b.t0)
    .map(o => ({ t: o.t0, label: labelOf(o) }))
})

const pctOf = t => (duration.value ? (t / duration.value) * 100 : 0)

function fmt(ms) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function jump(t) {
  seekTo(t)
}

function onScrub(e) {
  const el = trackEl.value
  if (!el || !duration.value) return
  const move = ev => {
    const r = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))
    seekTo(ratio * duration.value)
  }
  move(e)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// 播放头：ref 直写样式（60fps 不走响应式）；headMs 仅 10fps tick 更新读数
let offFrame = null, offTick = null
onMounted(() => {
  offFrame = clock.onFrame(t => {
    const pct = duration.value ? (t / duration.value) * 100 : 0
    if (headEl.value) headEl.value.style.left = pct + '%'
    if (fillEl.value) fillEl.value.style.width = pct + '%'
  })
  offTick = clock.onTick(t => { headMs.value = t })
})
onBeforeUnmount(() => { offFrame && offFrame(); offTick && offTick() })
</script>

<style scoped>
.sb {
  position: relative;
  z-index: var(--z-workbench);
  height: var(--scrubber-h);
  display: flex;
  align-items: center;
  gap: var(--bc-s4);
  padding: 0 var(--bc-s6);
  border-top: 1px solid var(--bc-line);
  background: var(--bc-bg);
}
.sb-kicker { flex: 0 0 auto; }
.sb-time { color: var(--bc-chalk); font-size: 11px; flex: 0 0 40px; text-align: center; }
.sb-dur { color: var(--bc-muted); font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sb-track {
  position: relative;
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.sb-rail {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: var(--bc-line);
}
.sb-fill {
  position: absolute;
  left: 0;
  height: 2px;
  width: 0;
  background: var(--bc-signal);
}
/* 播放头：8px signal 方块（硬朗语言） */
.sb-head {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  background: var(--bc-signal);
  transform: translate(-50%, -50%);
  left: 0;
}
/* 事件刻度：signal 三角（CSS 三角，非 emoji） */
.sb-mark {
  position: absolute;
  top: calc(50% + 8px);
  width: 0;
  height: 0;
  padding: 0;
  border: none;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 7px solid var(--bc-muted);
  background: transparent;
  transform: translateX(-50%);
  cursor: pointer;
  transition: border-bottom-color var(--bc-dur-fast) var(--bc-ease);
}
.sb-mark:hover, .sb-mark:focus-visible { border-bottom-color: var(--bc-chalk); }
.sb-mark.is-passed { border-bottom-color: var(--bc-signal); }

@media (prefers-reduced-motion: reduce) {
  .sb-mark { transition: none; }
}
</style>
