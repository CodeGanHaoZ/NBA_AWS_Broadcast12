<template>
  <section class="cs" aria-label="战术板主区">
    <div class="panel-head">
      <span class="bc-kicker">Court <i>/</i> Overlay</span>
      <span class="bc-mono cs-mode">{{ store.videoMode ? 'video standby' : 'skeleton 10fps' }}</span>
    </div>

    <div class="cs-frame" :class="{ 'is-loading': store.stage === 'loading' }">
      <!-- L2 加载层：navy + scanline + mono 状态行 -->
      <template v-if="store.stage === 'loading'">
        <div class="bc-scanline" aria-hidden="true"></div>
        <p class="bc-mono cs-loading-line">analyzing possession<span class="cs-ellipsis">…</span></p>
      </template>

      <!-- L1 空态 / boot：编号管线大图 -->
      <EmptyState v-else-if="store.stage === 'empty' || store.stage === 'boot'" />

      <!-- L3 错误层 -->
      <ErrorCard v-else-if="store.stage === 'error'" :error="store.error" @retry="retryStage" />

      <!-- Populated -->
      <template v-else-if="store.stage === 'ready' && store.play">
        <VideoOverlay v-if="store.videoMode" :key="'v' + store.play.id" :play="store.play" />
        <CourtBoard
          v-else
          :key="store.play.id"
          :play="store.play"
          :overlay-on="store.overlayOn"
          :clutch-active="clutchActive"
        />
      </template>
    </div>

    <div class="cs-status bc-mono" aria-live="polite">
      <template v-if="store.play">
        possession {{ store.play.id }} · Q{{ store.play.quarter }} {{ store.play.clock }} · overlay
        <em class="cs-run" :class="runClass">{{ runText }}</em>
        <em v-if="clutchActive" class="cs-clutch">CLUTCH</em>
      </template>
      <template v-else-if="store.stage === 'loading'">pipeline analyzing · stand by</template>
      <template v-else>no possession selected</template>
    </div>

    <ControlBar />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import EmptyState from './EmptyState.vue'
import ErrorCard from './ErrorCard.vue'
import CourtBoard from './CourtBoard.vue'
import VideoOverlay from './VideoOverlay.vue'
import ControlBar from './ControlBar.vue'
import { store, retryStage, typewriter } from '../lib/store.js'

// clutch 档联动：当前打字句 tone === clutch（UIUX §7.5 主区联动）
const clutchActive = computed(() => {
  const cur = typewriter.sentences.find(s => s.status === 'typing')
  return cur?.cue?.tone === 'clutch'
})

const runText = computed(() => {
  switch (store.clockState) {
    case 'replaying': return 'running'
    case 'paused': return 'paused'
    case 'settled': return 'settled'
    case 'loading': return 'loading'
    default: return 'idle'
  }
})
const runClass = computed(() => ({
  'cs-run--on': store.clockState === 'replaying',
  'cs-run--settled': store.clockState === 'settled'
}))
</script>

<style scoped>
.cs {
  display: flex;
  flex-direction: column;
  background: var(--bc-bg);
  overflow: hidden;
}
.cs-mode { color: var(--bc-muted); }

/* S-10 骨骼帧：navy 底 16:9 + 1px line 描边 */
.cs-frame {
  position: relative;
  margin: var(--bc-s4) var(--bc-s4) 0;
  aspect-ratio: 16 / 9;
  background: var(--frame-bg);
  border: 1px solid var(--bc-line);
  border-radius: var(--bc-radius-card);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.cs-frame.is-loading { align-items: center; justify-content: center; }
.cs-loading-line { color: var(--bc-muted); }
.cs-ellipsis { animation: cs-dot 1.2s steps(3) infinite; }
@keyframes cs-dot { 0% { opacity: .2; } 100% { opacity: 1; } }

.cs-status {
  padding: var(--bc-s2) var(--bc-s4);
  color: var(--bc-muted);
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: var(--bc-s2);
}
.cs-run { font-style: normal; color: var(--bc-chalk); }
.cs-run::before { content: '●'; margin-right: var(--bc-s1); color: var(--bc-line); }
.cs-run--on { color: var(--bc-signal); }
.cs-run--on::before { color: var(--bc-signal); }
.cs-run--settled::before { color: var(--bc-chalk); }
.cs-clutch {
  font-style: normal;
  color: var(--bc-signal);
  font-weight: 700;
  border: 1px solid var(--bc-signal);
  padding: 0 var(--bc-s1);
  margin-left: var(--bc-s2);
}

@media (prefers-reduced-motion: reduce) {
  .cs-ellipsis { animation: none; }
}
</style>
