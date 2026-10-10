<template>
  <div class="ctrl" role="toolbar" aria-label="回放控制">
    <button class="ghost-btn" :aria-label="playing ? '暂停（空格）' : '播放（空格）'" :disabled="!ready" @click="clock.toggle()">
      <IconPause v-if="playing" :size="20" />
      <IconPlay v-else :size="20" />
    </button>

    <button
      v-for="s in [0.5, 1, 2]" :key="s"
      class="ghost-btn ctrl-speed"
      :class="{ 'is-active': store.speed === s }"
      :aria-label="`倍速 ${s}x`"
      :disabled="!ready"
      @click="setSpeed(s)"
    ><IconSlowMo v-if="s === 0.5" :size="16" />{{ s }}x</button>

    <span class="ctrl-sep" aria-hidden="true"></span>

    <button class="ghost-btn" aria-label="逐帧后退（,）" :disabled="!ready" @click="clock.stepFrame(-1)">
      <IconFramePrev :size="16" />
    </button>
    <button class="ghost-btn" aria-label="逐帧前进（.）" :disabled="!ready" @click="clock.stepFrame(1)">
      <IconFrameNext :size="16" />
    </button>
    <button class="ghost-btn" aria-label="重播（R）" :disabled="!ready" @click="replay">
      <IconReplay :size="20" /><span class="ctrl-label">重播</span>
    </button>

    <span class="ctrl-sep" aria-hidden="true"></span>

    <button class="ghost-btn" aria-label="上一回合（←）" :disabled="!hasPlay" @click="step(-1)">
      <IconArrowRight :size="16" style="transform: rotate(180deg)" /><span class="ctrl-label">上回合</span>
    </button>
    <button class="ghost-btn" aria-label="下一回合（→）" :disabled="!hasPlay" @click="step(1)">
      <span class="ctrl-label">下回合</span><IconArrowRight :size="16" />
    </button>

    <span class="ctrl-spacer"></span>

    <button
      class="ghost-btn"
      :class="{ 'is-active': store.overlayOn }"
      :aria-pressed="store.overlayOn"
      aria-label="标注层开关"
      :disabled="!ready"
      @click="store.overlayOn = !store.overlayOn"
    ><IconCourt :size="20" /><span class="ctrl-label">overlay {{ store.overlayOn ? 'on' : 'off' }}</span></button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import IconPlay from './icons/IconPlay.vue'
import IconPause from './icons/IconPause.vue'
import IconSlowMo from './icons/IconSlowMo.vue'
import IconFramePrev from './icons/IconFramePrev.vue'
import IconFrameNext from './icons/IconFrameNext.vue'
import IconReplay from './icons/IconReplay.vue'
import IconArrowRight from './icons/IconArrowRight.vue'
import IconCourt from './icons/IconCourt.vue'
import { store, clock, seekTo, setSpeed, stepPlay } from '../lib/store.js'
import { filteredPlays } from '../lib/filters.js'

const ready = computed(() => store.stage === 'ready' && !!store.play)
const hasPlay = computed(() => store.plays.length > 0)
const playing = computed(() => store.clockState === 'replaying')

function replay() {
  seekTo(0)
  clock.play()
}
function step(dir) {
  stepPlay(dir, filteredPlays(store).map(p => p.id))
}
</script>

<style scoped>
.ctrl {
  display: flex;
  align-items: center;
  gap: var(--bc-s2);
  padding: var(--bc-s3) var(--bc-s4);
  border-top: 1px solid var(--bc-line);
  flex-wrap: wrap;
}
.ctrl-speed { min-width: 56px; }
.ctrl-sep { width: 1px; height: 20px; background: var(--bc-line); margin: 0 var(--bc-s1); }
.ctrl-spacer { flex: 1; }
.ctrl-label { font-size: 11px; }
</style>
