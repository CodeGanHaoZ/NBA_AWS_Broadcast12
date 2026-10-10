<script setup>
/** 洞察双栏：解说（先有现实，后有词）| 结构化证据（可回溯指标） */
import { computed } from 'vue'
import { S, curNarration, evidence } from '../../lib/store.js'

const narr = computed(() => curNarration.value)
const evs = computed(() => evidence.value || [])

function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)
}
</script>

<template>
  <div class="vb-insight">
    <section>
      <div class="panel-head">
        <span class="slash"><i></i>COMMENTARY</span>
        <h3>解说</h3>
        <span class="r">实时生成 · 逐帧推进</span>
      </div>
      <div class="vb-narr" style="margin-top:12px">
        <p v-if="narr">{{ narr.text }}<span class="bc-caret">|</span></p>
        <p v-else style="color:var(--bc-muted)">等待回放推进……</p>
        <small v-if="narr">锚点 {{ (narr.t / 1000).toFixed(1) }}s · 语气 {{ narr.tone }} · 引用 {{ (narr.refs || []).length }} 个事件</small>
      </div>
    </section>

    <section>
      <div class="panel-head">
        <span class="slash"><i></i>METRICS</span>
        <h3>证据</h3>
        <span class="r">结构化指标 · {{ evs.length }} 项</span>
      </div>
      <div class="vb-ev-grid" style="margin-top:12px">
        <div v-for="e in evs" :key="e.key" class="vb-ev-cell">
          <span>{{ e.label }}</span>
          <b>{{ fmt(e.value) }}</b>
          <em>{{ e.unit }}</em>
          <em v-if="e.delta !== null && e.delta !== undefined" :style="{ color: e.delta >= 0 ? 'var(--bc-signal)' : '#4C9EE8' }">
            {{ e.delta >= 0 ? '+' : '' }}{{ fmt(e.delta) }}
          </em>
        </div>
      </div>
    </section>
  </div>
</template>
