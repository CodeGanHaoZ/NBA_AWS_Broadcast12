<template>
  <div
    class="pc"
    :class="{ 'is-selected': selected, 'is-cursor': cursor, 'is-clutch': isClutch }"
    role="option"
    :aria-selected="selected"
    tabindex="-1"
    @click="$emit('select')"
  >
    <div class="pc-inner" :class="{ 'bc-marquee': selected }">
      <b v-if="selected" aria-hidden="true"></b><b v-if="selected" aria-hidden="true"></b>
      <b v-if="selected" aria-hidden="true"></b><b v-if="selected" aria-hidden="true"></b>

      <div class="pc-top">
        <span class="bc-mono pc-id">{{ play.id }}</span>
        <span class="pc-dot" :class="{ 'is-key': isKey }" aria-hidden="true"></span>
        <span class="bc-mono pc-clock">Q{{ play.quarter }} {{ play.clock }}</span>
        <span class="pc-score" :class="scoreClass">
          <IconFlame v-if="total >= 0.8" :size="16" class="pc-flame" />
          {{ Math.round(total * 100) }}
        </span>
      </div>
      <div class="pc-label">{{ play.label }}</div>
      <div class="bc-mono pc-tags">{{ tagText }}</div>

      <ImportanceBreakdown v-if="selected && total >= 0.4 && play.importance?.breakdown" :breakdown="play.importance.breakdown" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import IconFlame from './icons/IconFlame.vue'
import ImportanceBreakdown from './ImportanceBreakdown.vue'

const props = defineProps({
  play: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  cursor: { type: Boolean, default: false }
})
defineEmits(['select'])

const total = computed(() => props.play.importance?.total ?? 0)
const isClutch = computed(() => (props.play.tags || []).includes('clutch'))
const isKey = computed(() => total.value >= 0.6)
const scoreClass = computed(() => {
  if (total.value >= 0.8) return 'pc-score--hot'
  if (total.value >= 0.6) return 'pc-score--mid'
  return 'pc-score--low'
})
const tagText = computed(() => (props.play.tags || []).join(' · '))
</script>

<style scoped>
.pc { padding: var(--bc-s1) var(--bc-s3); cursor: pointer; }
.pc-inner {
  position: relative;
  background: var(--bc-surface);
  border: 1px solid var(--bc-line);
  border-radius: var(--bc-radius-card);
  padding: var(--bc-s3) var(--bc-s4);
  transition: background var(--bc-dur-fast) var(--bc-ease), border-color var(--bc-dur-fast) var(--bc-ease);
}
.pc:hover .pc-inner { background: var(--bc-surface-2); border-color: #3A3A40; }
.pc.is-cursor .pc-inner { border-color: var(--bc-muted); }
.pc.is-selected .pc-inner { background: var(--bc-surface-2); }
.pc.is-clutch .pc-inner { border-left: 2px solid var(--bc-signal); }

.pc-top { display: flex; align-items: center; gap: var(--bc-s2); }
.pc-id { color: var(--bc-muted); font-size: 11px; }
.pc-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bc-line); }
.pc-dot.is-key { background: var(--bc-signal); }
.pc-clock { color: var(--bc-chalk); font-size: 11px; }
.pc-score {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--bc-font-display);
  font-size: 22px;
  line-height: 1;
}
.pc-score--hot { color: var(--bc-signal); }
.pc-score--mid { color: var(--bc-chalk); }
.pc-score--low { color: var(--bc-muted); }
.pc-flame { color: var(--bc-signal); }

.pc-label { font-size: 14px; color: var(--bc-chalk); margin-top: 2px; line-height: 1.5; }
.pc-tags { color: var(--bc-muted); font-size: 10px; margin-top: 2px; }

@media (prefers-reduced-motion: reduce) {
  .pc-inner { transition: none; }
}
</style>
