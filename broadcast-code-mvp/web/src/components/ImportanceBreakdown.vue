<template>
  <div class="ib">
    <div class="ib-sep bc-mono">importance breakdown</div>
    <div
      v-for="(row, i) in rows" :key="row.key"
      class="ib-row"
      :style="{ '--i': i }"
      @mouseenter="hint = row.key"
      @mouseleave="hint = ''"
    >
      <span class="ib-label">{{ row.key }}</span>
      <span class="ib-track">
        <span class="ib-fill" :class="{ 'is-max': row.isMax }" :style="{ width: (row.value * 100).toFixed(1) + '%' }"></span>
      </span>
      <span class="ib-val">{{ row.value.toFixed(2) }}</span>
      <span class="ib-wt">×{{ row.weight.toFixed(2) }}</span>
    </div>
    <div class="ib-hint" :class="{ 'is-on': !!hint }">{{ hintText }}&nbsp;</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  breakdown: { type: Object, required: true }
})

const META = [
  { key: 'CLU', field: 'clutch', weight: 0.30, hint: '关键时刻 —— 第四节 & 分差≤5，剩余时间越少越高' },
  { key: 'DIF', field: 'difficulty', weight: 0.25, hint: '出手难度 —— 投篮距离越远、防守人越近越高' },
  { key: 'RAR', field: 'rarity', weight: 0.20, hint: '稀有度 —— 绝杀 > 压哨 > 扣篮 > 追身三分 > 普通' },
  { key: 'MOM', field: 'momentum', weight: 0.15, hint: '势头 —— 连续得分的延续或打断（run length）' },
  { key: 'STR', field: 'star', weight: 0.10, hint: '主角参与 —— 名单内 star 球员的参与度' }
]

const hint = ref('')

const rows = computed(() => {
  const bd = props.breakdown || {}
  const present = META.filter(m => typeof bd[m.field] === 'number')
  if (!present.length) return []
  const maxV = Math.max(...present.map(m => bd[m.field]))
  // 子分缺失时该行整行不渲染；最高子分项唯一橙条（并列时取表内靠前者，与后端 reason 映射一致）
  const firstMax = present.findIndex(m => bd[m.field] === maxV)
  return present.map((m, i) => ({
    ...m,
    value: bd[m.field],
    isMax: i === firstMax
  }))
})

const hintText = computed(() => META.find(m => m.key === hint.value)?.hint || '')
</script>

<style scoped>
.ib { margin-top: var(--bc-s3); }
.ib-sep {
  color: var(--bc-muted);
  font-size: 10px;
  border-top: 1px solid var(--bc-line);
  padding-top: var(--bc-s2);
  margin-bottom: var(--bc-s2);
}
.ib-row {
  display: grid;
  grid-template-columns: 32px 1fr 34px 34px;
  align-items: center;
  gap: var(--bc-s2);
  padding: 2px var(--bc-s1);
  border-radius: var(--bc-radius-card);
  animation: ib-in 200ms var(--bc-ease) both;
  animation-delay: calc(var(--i) * 60ms);
}
@keyframes ib-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
.ib-row:hover { background: var(--bc-surface-2); }
.ib-label { font-family: var(--bc-font-mono); font-size: 10px; color: var(--bc-muted); letter-spacing: .1em; }
.ib-track { height: 3px; background: var(--bc-line); position: relative; }
.ib-fill {
  position: absolute; inset: 0 auto 0 0;
  background: var(--bc-chalk);
  transition: width 200ms var(--bc-ease);
}
.ib-fill.is-max { background: var(--bc-signal); }
.ib-val { font-family: var(--bc-font-mono); font-size: 11px; color: var(--bc-chalk); text-align: right; }
.ib-wt { font-family: var(--bc-font-mono); font-size: 10px; color: var(--bc-muted); text-align: right; }
.ib-hint {
  font-size: 11px;
  color: var(--bc-muted);
  opacity: 0;
  transition: opacity var(--bc-dur-fast) var(--bc-ease);
  margin-top: var(--bc-s1);
  line-height: 1.5;
}
.ib-hint.is-on { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .ib-row { animation: none; }
  .ib-fill, .ib-hint { transition: none; }
}
</style>
