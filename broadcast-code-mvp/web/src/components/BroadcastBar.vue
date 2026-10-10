<template>
  <header class="bb">
    <div class="bb-inner">
      <div class="bb-brand">
        <span class="bb-live-dot bc-live-dot" aria-hidden="true"></span>
        <span class="bc-display bb-word">Broadcast Code</span>
        <span class="bc-kicker bb-sub"><i>/</i> AI Court Agent</span>
      </div>

      <div class="bb-score" v-if="store.game">
        <span class="bc-mono bb-abbr">{{ store.game.away?.abbr }}</span>
        <span class="bc-display bb-num">{{ store.game.score?.away ?? '--' }}</span>
        <span class="bc-mono bb-colon">:</span>
        <span class="bc-display bb-num bb-num--home">{{ store.game.score?.home ?? '--' }}</span>
        <span class="bc-mono bb-abbr">{{ store.game.home?.abbr }}</span>
        <span class="bc-mono bb-q">Q{{ store.play?.quarter ?? lastQ }} · {{ store.play?.clock ?? '--:--.-' }}</span>
      </div>
      <div class="bb-score" v-else>
        <span class="bc-mono bb-abbr">AWAY</span>
        <span class="bc-display bb-num">--</span>
        <span class="bc-mono bb-colon">:</span>
        <span class="bc-display bb-num">--</span>
        <span class="bc-mono bb-abbr">HOME</span>
      </div>

      <div class="bb-right">
        <!-- S-05 模式 pill + 场次切换 -->
        <div class="bb-games" role="group" aria-label="数据集切换">
          <button
            v-for="g in store.games" :key="g.id"
            class="bc-pill bc-pill--ghost bb-game"
            :class="{ 'is-on': g.id === store.gameId }"
            @click="selectGame(g.id)"
          >{{ g.away?.abbr }}-{{ g.home?.abbr }}</button>
        </div>
        <span class="bc-pill">Replay</span>
        <span class="bc-mono bb-ai">
          <span class="bc-live-dot" :class="{ 'is-idle': aiState === 'idle' }" aria-hidden="true"></span>
          AI {{ aiState }}
        </span>
      </div>
    </div>
    <!-- S-06 皮革纹理 4px 细条 -->
    <div class="bc-leather bb-leather" aria-hidden="true"></div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { store, selectGame } from '../lib/store.js'

const lastQ = computed(() => {
  const qs = store.game?.quarters
  return qs && qs.length ? qs[qs.length - 1].q : '-'
})

const aiState = computed(() => {
  switch (store.clockState) {
    case 'loading': return 'analyzing'
    case 'replaying': return 'narrating'
    case 'paused': return 'paused'
    case 'settled': return 'settled'
    default: return 'idle'
  }
})
</script>

<style scoped>
.bb {
  position: relative;
  z-index: var(--z-topbar);
  background: rgba(11, 11, 12, .82);
  backdrop-filter: blur(8px);   /* 范式白名单：仅顶栏一处 */
  border-bottom: 1px solid var(--bc-line);
}
.bb-inner {
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  gap: var(--bc-s6);
  padding: 0 var(--bc-s6);
}
.bb-brand { display: flex; align-items: center; gap: var(--bc-s3); min-width: 0; }
.bb-word { font-size: 22px; color: var(--bc-chalk); white-space: nowrap; }
.bb-sub { white-space: nowrap; }

.bb-score {
  display: flex;
  align-items: baseline;
  gap: var(--bc-s2);
  margin: 0 auto;
  padding: var(--bc-s1) var(--bc-s4);
  border: 1px solid var(--bc-line);
  border-radius: var(--bc-radius-card);
  background: var(--bc-surface);
}
.bb-num { font-size: 28px; line-height: 1; color: var(--bc-chalk); }
.bb-num--home { color: var(--bc-signal); }
.bb-abbr { color: var(--bc-muted); font-size: 11px; }
.bb-colon { color: var(--bc-muted); }
.bb-q { color: var(--bc-chalk); margin-left: var(--bc-s3); font-size: 11px; }

.bb-right { display: flex; align-items: center; gap: var(--bc-s4); }
.bb-games { display: flex; gap: var(--bc-s2); }
.bb-game { cursor: pointer; font-size: 11px; padding: 3px 10px; }
.bb-game.is-on { border-color: var(--bc-signal); color: var(--bc-signal); }
.bb-ai { display: inline-flex; align-items: center; gap: var(--bc-s2); color: var(--bc-muted); }
.bb-ai .bc-live-dot.is-idle { background: var(--bc-muted); animation: none; }

.bb-leather { height: 4px; }

@media (max-width: 1440px) {
  .bb-word { font-size: 19px; }
  .bb-inner { gap: var(--bc-s4); padding: 0 var(--bc-s4); }
}
</style>
