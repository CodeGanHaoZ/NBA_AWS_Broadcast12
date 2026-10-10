<template>
  <aside class="rl" aria-label="回合列表">
    <div class="panel-head">
      <span class="bc-kicker">Possessions <i>/</i> Q{{ quarter }}</span>
      <span class="bc-mono rl-count">{{ list.length }}</span>
    </div>

    <div class="rl-chips" role="group" aria-label="回合筛选">
      <button
        v-for="f in filterDefs()" :key="f.key"
        class="bc-pill bc-pill--ghost rl-chip"
        :class="{ 'is-on': store.filter === f.key }"
        @click="setFilter(f.key)"
      >{{ f.label }} <span class="rl-chip-n">{{ filterCount(store, f.key) }}</span></button>
    </div>

    <div class="rl-body" role="listbox" aria-label="按重要度排序的回合">
      <!-- Loading 骨架行 -->
      <template v-if="store.listState === 'loading'">
        <div v-for="i in 3" :key="i" class="rl-skel" aria-hidden="true">
          <span class="rl-skel-line w60"></span>
          <span class="rl-skel-line w90"></span>
        </div>
      </template>

      <!-- 错误 inline -->
      <div v-else-if="store.listState === 'error'" class="rl-error">
        <p class="bc-mono rl-error-code">ERR {{ store.listError?.code }}</p>
        <p class="rl-error-msg">{{ store.listError?.message }}</p>
        <button class="ghost-btn" @click="selectGame(store.gameId || store.games[0]?.id)">重新加载</button>
      </div>

      <!-- 空态 -->
      <div v-else-if="!list.length" class="rl-empty">
        <p class="bc-mono">No possessions</p>
        <p class="rl-empty-sub">本场无可分析回合，或筛选无结果</p>
      </div>

      <!-- 条目流 -->
      <PlayCard
        v-for="(p, i) in list" :key="p.id"
        v-else
        :play="p"
        :selected="store.play?.id === p.id"
        :cursor="store.cursorIdx === i"
        @select="onSelect(p, i)"
      />
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import PlayCard from './PlayCard.vue'
import { store, selectPlay, selectGame } from '../lib/store.js'
import { filterDefs, filteredPlays, filterCount } from '../lib/filters.js'

const list = computed(() => filteredPlays(store))
const quarter = computed(() => store.plays[0]?.quarter ?? '-')

function setFilter(key) {
  store.filter = key
  store.cursorIdx = 0
}

function onSelect(p, i) {
  store.cursorIdx = i
  if (store.play?.id === p.id) {
    // 重演中再点同一回合 = 重播
    selectPlay(p.id)
  } else {
    selectPlay(p.id)
  }
}
</script>

<style scoped>
.rl {
  display: flex;
  flex-direction: column;
  background: var(--bc-bg);
  overflow: hidden;
}
.rl-count { color: var(--bc-muted); }

.rl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bc-s2);
  padding: var(--bc-s3) var(--bc-s4);
  border-bottom: 1px solid var(--bc-line);
}
.rl-chip { cursor: pointer; font-size: 11px; padding: 3px 10px; }
.rl-chip.is-on { border-color: var(--bc-signal); color: var(--bc-signal); }
.rl-chip-n { opacity: .7; margin-left: 2px; }

.rl-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--bc-s2) 0 var(--bc-s4);
  scrollbar-width: thin;
  scrollbar-color: var(--bc-line) transparent;
}

.rl-skel {
  margin: var(--bc-s2) var(--bc-s3);
  padding: var(--bc-s3) var(--bc-s4);
  border: 1px solid var(--bc-line);
  border-radius: var(--bc-radius-card);
  display: flex;
  flex-direction: column;
  gap: var(--bc-s2);
}
.rl-skel-line {
  height: 10px;
  background: var(--bc-surface-2);
  border-radius: 1px;
  animation: rl-skel 1.4s var(--bc-ease) infinite alternate;
}
.rl-skel-line.w60 { width: 60%; }
.rl-skel-line.w90 { width: 90%; }
@keyframes rl-skel { from { opacity: .4; } to { opacity: 1; } }

.rl-error, .rl-empty { padding: var(--bc-s6) var(--bc-s4); text-align: left; }
.rl-error-code { color: var(--bc-key-red); }
.rl-error-msg, .rl-empty-sub { color: var(--bc-muted); font-size: 13px; margin: var(--bc-s2) 0 var(--bc-s4); }
.rl-empty .bc-mono { color: var(--bc-muted); }

/* <1024px：折叠为横向 chip 滚动条 */
@media (max-width: 1024px) {
  .rl { max-height: 132px; }
  .rl-body { display: flex; overflow-x: auto; overflow-y: hidden; padding: var(--bc-s2); }
  .rl-body > * { flex: 0 0 220px; }
}

@media (prefers-reduced-motion: reduce) {
  .rl-skel-line { animation: none; }
}
</style>
