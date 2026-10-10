<template>
  <!-- S-08 编号管线紧凑横向版：实时点亮 4 步 -->
  <div class="ps" aria-label="AI 管线状态">
    <div
      v-for="(s, i) in steps" :key="s.key"
      class="ps-step"
      :class="stepClass(i)"
    >
      <span class="bc-display ps-num">{{ s.num }}</span>
      <span class="bc-mono ps-key">{{ s.key }}</span>
      <span v-if="stepClass(i) === 'is-active'" class="bc-live-dot ps-dot" aria-hidden="true"></span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store, typewriter } from '../lib/store.js'

const steps = [
  { num: '01', key: 'input' },
  { num: '02', key: 'analyze' },
  { num: '03', key: 'visualize' },
  { num: '04', key: 'narrate' }
]

/** 当前进度：0=未开始 1=input 2=analyze 3=visualize 4=narrate 5=全部完成 */
const progress = computed(() => {
  switch (store.clockState) {
    case 'loading': return 2
    case 'replaying': {
      const started = typewriter.sentences.some(s => s.status !== 'queued')
      return started ? 4 : 3
    }
    case 'paused': return 3
    case 'settled': return 5
    default: return store.stage === 'ready' ? 1 : 0
  }
})

function stepClass(i) {
  const stepNo = i + 1
  if (progress.value > stepNo) return 'is-done'
  if (progress.value === stepNo) return 'is-active'
  return 'is-wait'
}
</script>

<style scoped>
.ps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--bc-line);
}
.ps-step {
  display: flex;
  align-items: baseline;
  gap: var(--bc-s1);
  min-width: 0;
  overflow: hidden;
  padding: var(--bc-s2) var(--bc-s2);
  border-right: 1px solid var(--bc-line);
  transition: opacity var(--bc-dur) var(--bc-ease);
}
.ps-step:last-child { border-right: none; }
.ps-num { font-size: 16px; line-height: 1; }
.ps-key { font-size: 9px; letter-spacing: .04em; white-space: nowrap; }
.ps-dot { align-self: center; margin-left: auto; }

.is-done .ps-num, .is-done .ps-key { color: var(--bc-chalk); }
.is-active .ps-num, .is-active .ps-key { color: var(--bc-signal); }
.is-wait { opacity: .3; }
.is-wait .ps-num, .is-wait .ps-key { color: var(--bc-muted); }

@media (prefers-reduced-motion: reduce) {
  .ps-step { transition: none; }
}
</style>
