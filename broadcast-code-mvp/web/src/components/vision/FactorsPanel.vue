<script setup>
/** 因素图：关键节点 —— 每个节点是这一回合的一环，带置信度；点击与战术台联动 */
import { computed } from 'vue'
import { S, factors, pause, seek, selectFactor } from '../../lib/store.js'

const list = computed(() => (factors.value || []).slice().sort((a, b) => a.order - b.order))

function jumpTo(f) {
  pause()
  seek(f.t)
  selectFactor(f.id)
}
const isActive = f => S.activeFactor === f.id || (S.activeFactor === null && Math.abs(f.t - S.t) <= 700)
</script>

<template>
  <section class="bc-card" id="factors-anchor" style="padding:20px">
    <div class="panel-head">
      <span class="slash"><i></i>EVIDENCE</span>
      <h3>这球怎么被创造的</h3>
      <span class="r">{{ list.length }} 项 · 点击联动</span>
    </div>

    <div v-if="!list.length" class="vb-empty" style="height:120px">尚无可归因因素</div>

    <div v-for="(f, i) in list" :key="f.id">
      <article class="vb-factor" :class="{ 'is-on': isActive(f) }" @click="jumpTo(f)">
        <div class="vb-factor__top">
          <span class="vb-factor__no">{{ String(f.order).padStart(2, '0') }}</span>
          <span class="vb-factor__title">{{ f.title }}</span>
          <span class="vb-factor__val">{{ (f.value ?? 0).toFixed ? f.value.toFixed(1) : f.value }}{{ f.unit }}</span>
        </div>
        <div class="vb-factor__bar"><i :style="{ width: Math.round((f.conf || 0) * 100) + '%' }"></i></div>
        <div class="vb-factor__meta">
          <span>{{ (f.t / 1000).toFixed(1) }}s</span>
          <span>置信 {{ Math.round((f.conf || 0) * 100) }}%</span>
        </div>
        <div v-if="f.evidences?.length" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
          <span v-for="(ev, k) in f.evidences" :key="k" class="vb-chip" style="font-size:10px;padding:2px 8px">
            {{ ev.k }} {{ ev.v }}
          </span>
        </div>
      </article>
      <div v-if="i < list.length - 1" class="vb-factor__link"></div>
    </div>
  </section>
</template>
