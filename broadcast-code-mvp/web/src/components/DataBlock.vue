<template>
  <div class="db">
    <div class="panel-head db-head">
      <span class="bc-kicker">Key Data <i>/</i> <IconDatabase :size="16" /></span>
      <span class="bc-mono db-live" :class="{ 'is-on': store.clockState === 'replaying' }">live</span>
    </div>

    <template v-if="store.play">
      <!-- S-09 大数字：本回合 importance -->
      <div class="db-stat">
        <span class="bc-stat__num bc-stat__num--signal db-num">{{ importancePct }}</span>
        <span class="bc-stat__cap">importance · 本回合关键度</span>
      </div>

      <!-- S-02 点阵热图：射手轨迹密度 10×10 -->
      <div class="db-heat">
        <svg viewBox="0 0 100 100" class="db-dots" role="img" aria-label="射手移动热区点阵">
          <circle
            v-for="(v, i) in heat" :key="i"
            :cx="(i % 10) * 10 + 5" :cy="Math.floor(i / 10) * 10 + 5"
            :r="v > 0 ? 1.6 + v * 2.6 : 1.2"
            :fill="v > 0.66 ? 'var(--bc-signal)' : 'var(--bc-line)'"
            :opacity="v > 0 ? 0.4 + v * 0.6 : 0.6"
          />
        </svg>
        <span class="bc-mono db-heat-cap">shooter movement · 10×10</span>
      </div>

      <!-- 关键数据行：AC-07 三指标随帧联动 -->
      <table class="bc-table db-table">
        <tbody>
          <tr><td>投篮难度</td><td data-num>{{ pct(store.live.difficulty) }}</td></tr>
          <tr><td>防守引力</td><td data-num>{{ pct(store.live.gravity) }}</td></tr>
          <tr><td>关键时刻</td><td data-num>{{ pct(store.live.clutch) }}</td></tr>
          <tr><td>空间增益</td><td data-num>{{ store.live.spacing.toFixed(0) }} ft²</td></tr>
          <tr><td>防守崩塌</td><td data-num>{{ features.defenseCollapseMs ?? '--' }} ms</td></tr>
          <tr><td>无球跑动</td><td data-num>{{ pct(features.offBallMovement ?? 0) }}</td></tr>
          <tr><td>传球次数</td><td data-num>{{ features.passCount ?? '--' }}</td></tr>
        </tbody>
      </table>
    </template>

    <div v-else class="db-empty bc-mono">-- awaiting possession</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import IconDatabase from './icons/IconDatabase.vue'
import { store } from '../lib/store.js'
import { heatmapBins } from '../lib/metrics.js'

const features = computed(() => store.play?.features ?? {})
const importancePct = computed(() => Math.round((store.play?.importance?.total ?? 0) * 100))
const heat = computed(() => heatmapBins(store.play?.frames, store.play?.actors?.shooter))

const pct = v => `${Math.round((v || 0) * 100)}%`
</script>

<style scoped>
.db { border-top: 1px solid var(--bc-line); display: flex; flex-direction: column; }
.db-head { border-bottom: none; padding-bottom: 0; }
.db-live { color: var(--bc-muted); font-size: 10px; }
.db-live.is-on { color: var(--bc-signal); }

.db-stat { padding: var(--bc-s2) var(--bc-s4) 0; }
.db-num { font-size: 64px; }

.db-heat { display: flex; align-items: center; gap: var(--bc-s3); padding: var(--bc-s3) var(--bc-s4); }
.db-dots { width: 160px; height: 160px; flex: 0 0 160px; }
.db-heat-cap { color: var(--bc-muted); font-size: 10px; writing-mode: vertical-rl; }

.db-table td { padding: var(--bc-s1) var(--bc-s4); font-size: 13px; }
.db-table td[data-num] { text-align: right; color: var(--bc-chalk); }
.db-table td:first-child { color: var(--bc-muted); }

.db-empty { color: var(--bc-muted); padding: var(--bc-s6) var(--bc-s4); }
</style>
