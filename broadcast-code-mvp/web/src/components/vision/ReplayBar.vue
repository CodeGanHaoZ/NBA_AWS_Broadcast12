<script setup>
/** 回放控制条：播放/速度/进度 + 本回合结论描述 */
import { computed } from 'vue'
import { S, durationMs, toggle, setSpeed, curNarration } from '../../lib/store.js'

const speeds = [0.5, 1, 2]
const progressText = computed(() => {
  const d = durationMs.value || 1
  return `${(S.t / 1000).toFixed(1)}s / ${(d / 1000).toFixed(1)}s`
})
const desc = computed(() => curNarration.value?.text || S.analysis?.possessions?.[S.activePos]?.summary || '')
</script>

<template>
  <div class="vb-replay">
    <div class="vb-ctl">
      <button @click="toggle()" :aria-label="S.playing ? '暂停' : '播放'">
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
          <path v-if="!S.playing" d="M0 0 L10 6 L0 12 Z" fill="currentColor" />
          <g v-else fill="currentColor"><rect x="0" y="0" width="3" height="12" /><rect x="7" y="0" width="3" height="12" /></g>
        </svg>
      </button>
      <button v-for="sp in speeds" :key="sp" :class="{ 'is-on': S.speed === sp }" @click="setSpeed(sp)">{{ sp }}x</button>
    </div>
    <span class="vb-time">{{ progressText }}</span>
    <span v-if="S.playing" class="vb-live"><i class="bc-live-dot"></i>回放中</span>
    <span class="vb-chip">回放分析</span>
    <span class="vb-desc"><b>{{ S.analysis?.possessions?.[S.activePos]?.label || '—' }}</b> · {{ desc }}</span>
  </div>
</template>
