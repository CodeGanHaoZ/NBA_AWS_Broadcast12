<template>
  <!-- F7 视频 overlay 备路：仅 ?flags=video 下挂载；不得影响主线 -->
  <div class="vo">
    <template v-if="hasVideo">
      <video ref="videoEl" class="vo-video" :src="play.video.src" muted playsinline
        @play="clock.play()" @pause="clock.pause()"></video>
      <svg class="vo-svg" viewBox="0 0 940 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g ref="dotEl">
          <circle r="6" fill="none" stroke="var(--bc-signal)" stroke-width="2" />
        </g>
      </svg>
    </template>
    <div v-else class="vo-empty">
      <p class="bc-mono vo-tag">video overlay / standby</p>
      <p class="vo-msg">素材未提供</p>
      <p class="vo-sub">该回合未附带视频素材（video.available=false），主线战术板不受影响。</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { clock } from '../lib/store.js'
import { sampleFrame } from '../lib/court.js'

const props = defineProps({ play: { type: Object, required: true } })

const hasVideo = computed(() => !!props.play.video?.available && !!props.play.video?.src)
const videoEl = ref(null)
const dotEl = ref(null)

// K9：禁 timeupdate（~4Hz 抖动），rAF 读 currentTime 同步 overlay
let off = null
onMounted(() => {
  if (!hasVideo.value) return
  const offset = props.play.video.offsetMs || 0
  off = clock.onFrame(() => {
    const v = videoEl.value
    if (!v || !dotEl.value) return
    const t = v.currentTime * 1000 - offset
    const f = sampleFrame(props.play.frames, Math.max(0, t))
    if (f) dotEl.value.setAttribute('transform', `translate(${f.ball.x * 10} ${f.ball.y * 10})`)
  })
})
onBeforeUnmount(() => { if (off) off() })
</script>

<style scoped>
.vo { position: relative; width: 100%; height: 100%; background: var(--frame-bg); }
.vo-video { width: 100%; height: 100%; object-fit: cover; display: block; }
.vo-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: var(--z-overlay); pointer-events: none; }
.vo-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bc-s2);
  border: 1px dashed var(--bc-line);
  margin: var(--bc-s4);
}
.vo-tag { color: var(--bc-muted); }
.vo-msg { color: var(--bc-chalk); font-size: 17px; margin: 0; }
.vo-sub { color: var(--bc-muted); font-size: 12px; margin: 0; }
</style>
