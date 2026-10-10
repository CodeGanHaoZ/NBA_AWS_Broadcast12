<script setup>
/**
 * 播放条（时间戳进度）
 * 样式与交互照搬参考工程 app/index.html 的 .playbar：
 * 播放/暂停 + 00:00.4 / 00:12.0 时间戳 + 可拖拽 scrub + 0.25× / 0.5× / 1× / 2× 倍速。
 * 时钟仍走工作台的唯一回放时钟（store.js），因此与战术台/时间轴逐帧一致。
 */
import { computed } from 'vue'
import { S, durationMs, toggle, setSpeed } from '../../lib/store.js'

const speeds = [0.25, 0.5, 1, 2]

function fmt(t) {
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

const cur = computed(() => (S.t / 1000))
const total = computed(() => ((durationMs.value || 0) / 1000))
const nowText = computed(() => fmt(cur.value))
const totalText = computed(() => fmt(total.value))

function onScrub(e) {
  S.playing = false
  S.t = Number(e.target.value) * 1000
}
</script>

<template>
  <div class="playbar">
    <button class="pb-btn" @click="toggle()" :aria-label="S.playing ? '暂停' : '播放'">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <path v-if="!S.playing" d="M2 1.2 12 7 2 12.8z" />
        <g v-else><rect x="1.5" y="1.2" width="4" height="11.6" /><rect x="8.5" y="1.2" width="4" height="11.6" /></g>
      </svg>
    </button>

    <span class="pb-time">{{ nowText }} <em>/ {{ totalText }}</em></span>
    <span v-if="S.playing" class="pb-live"><i class="dot"></i>回放中</span>

    <div class="scrub">
      <input type="range" :min="0" :max="total || 1" step="0.02" :value="cur"
             aria-label="回放进度" @input="onScrub" />
    </div>

    <div class="pb-speed" role="group" aria-label="播放速度">
      <button v-for="sp in speeds" :key="sp"
              :aria-pressed="S.speed === sp" @click="setSpeed(sp)">{{ sp }}×</button>
    </div>
  </div>
</template>
