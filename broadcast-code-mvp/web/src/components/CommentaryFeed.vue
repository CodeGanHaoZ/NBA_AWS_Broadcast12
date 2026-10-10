<template>
  <div class="cf" ref="scrollEl">
    <!-- 语气氛围行（§7.5）：excited=run detected；clutch=pill -->
    <div v-if="activeTone === 'excited'" class="bc-mono cf-run">● run detected</div>
    <div v-if="activeTone === 'clutch'" class="cf-clutch-pill">
      <span class="bc-pill cf-pill"><IconFlame :size="16" /> Clutch</span>
    </div>

    <!-- 空态引导 -->
    <p v-if="!sentences.length && store.stage !== 'loading'" class="cf-empty">
      选择一个回合，听 AI 拆解
    </p>

    <ol class="cf-list">
      <li
        v-for="(s, i) in sentences" :key="i"
        class="cf-line"
        :class="[`cf-line--${s.cue.tone || 'calm'}`, `is-${s.status}`]"
        :data-event-id="s.cue.t0"
        @click="onPick(s)"
      >
        <template v-if="s.status !== 'queued'">
          <span class="cf-ts" :class="{ 'cf-ts--clutch': s.cue.tone === 'clutch' }">{{ stampOf(s.cue.t0) }}</span>
          <p class="cf-text">
            <span
              v-for="(c, j) in s.chars.slice(0, s.typed)" :key="j"
              :class="{ 'cf-hl': c.hl }"
            >{{ c.ch }}</span><span
              v-if="s.status === 'typing'"
              class="bc-caret"
              :class="caretClass(s.cue.tone)"
              aria-hidden="true"
            >▍</span>
          </p>
        </template>
        <template v-else>
          <span class="cf-ts cf-ts--queued">{{ stampOf(s.cue.t0) }}</span>
          <p class="cf-text cf-queued bc-mono">排队中</p>
        </template>
      </li>
    </ol>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import IconFlame from './icons/IconFlame.vue'
import { store, typewriter, seekTo } from '../lib/store.js'
import { parseClock } from '../lib/metrics.js'

const sentences = computed(() => typewriter.sentences.slice(-8)) // 历史句上限 8
const scrollEl = ref(null)

const activeTone = computed(() => {
  const cur = typewriter.sentences.find(s => s.status === 'typing')
  return cur?.cue?.tone || ''
})

function caretClass(tone) {
  if (tone === 'clutch') return 'bc-caret--clutch'
  if (tone === 'excited') return 'bc-caret--excited'
  return ''
}

/** 句首时间戳：节内时钟 = 回合开始 clock − 句 t0 */
function stampOf(t0) {
  const base = parseClock(store.play?.clock || '0:00')
  const sec = Math.max(0, base - t0 / 1000)
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 句-事件双向索引：点击历史句跳转对应事件帧 */
function onPick(s) {
  seekTo(s.cue.t0)
}

// 打字推进时保持「活跃句」在视野内（容器内滚动，不动版面）
watch(
  () => typewriter.sentences.map(s => s.typed).join(',') + '|' + typewriter.sentences.map(s => s.status).join(','),
  async () => {
    await nextTick()
    const el = scrollEl.value
    if (!el) return
    const active = el.querySelector('.cf-line.is-typing')
    if (active) {
      const top = active.offsetTop - el.offsetTop
      const bottom = top + active.offsetHeight
      if (top < el.scrollTop) el.scrollTop = top
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
    }
  }
)
</script>

<style scoped>
.cf {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--bc-s3) var(--bc-s4);
  scrollbar-width: thin;
  scrollbar-color: var(--bc-line) transparent;
}
.cf-run { color: var(--bc-muted); margin-bottom: var(--bc-s2); }
.cf-clutch-pill { margin-bottom: var(--bc-s2); }
.cf-pill { display: inline-flex; align-items: center; gap: var(--bc-s1); }

.cf-empty { color: var(--bc-muted); font-size: 14px; padding: var(--bc-s4) 0; }

.cf-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--bc-s3); }
.cf-line { cursor: pointer; transition: opacity var(--bc-dur-fast) var(--bc-ease); }

/* 三档语气排版（§7.5：只动字号/字重/节奏/橙占比） */
.cf-text { margin: 0; color: var(--commentary-text); font-size: 15px; line-height: 1.7; font-weight: 400; }
.cf-line--excited .cf-text { font-size: 17px; font-weight: 500; }
.cf-line--clutch .cf-text { font-size: 20px; font-weight: 500; }

.cf-ts {
  font-family: var(--bc-font-mono);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: .08em;
  color: var(--commentary-highlight);
  display: block;
  line-height: 1.5;
}
.cf-ts--clutch { font-size: 13px; }
.cf-ts--clutch::before { content: '▍'; margin-right: 2px; }
.cf-ts--queued { color: var(--bc-muted); font-weight: 400; }

.cf-hl { color: var(--commentary-highlight); font-weight: 700; }

.cf-line.is-history { opacity: .6; }
.cf-line.is-history .cf-text { font-size: 14px; }
.cf-line.is-history .cf-hl { color: var(--commentary-text); font-weight: 500; }
.cf-queued { color: var(--bc-muted); font-size: 11px; letter-spacing: .14em; }

@media (prefers-reduced-motion: reduce) {
  .cf-line { transition: none; }
}
</style>
