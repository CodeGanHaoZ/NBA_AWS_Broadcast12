<script setup>
/** 回合列表：按事件切分的 possession，点击定位到该回合起点 */
import { S, selectPossession } from '../../lib/store.js'
const emit = defineEmits(['import'])
</script>

<template>
  <section class="bc-card" id="poss-anchor" style="padding:16px">
    <div class="panel-head">
      <span class="slash"><i></i>POSSESSIONS</span>
      <h3>回合库</h3>
      <span class="r">{{ (S.analysis?.possessions || []).length }} 回合 · 点击定位</span>
    </div>
    <div class="vb-poss">
      <button v-for="(p, i) in (S.analysis?.possessions || [])" :key="p.id"
              class="vb-poss__item" :class="{ 'is-on': i === S.activePos }"
              @click="selectPossession(i)">
        <i></i>
        <span>
          <b>{{ p.label }}</b>
          <small>{{ p.events?.length || 0 }} 个事件 · {{ ((p.t1 - p.t0) / 1000).toFixed(1) }}s</small>
        </span>
      </button>
      <button class="vb-poss__add" @click="emit('import')">+ 分析新回合</button>
    </div>
  </section>
</template>
