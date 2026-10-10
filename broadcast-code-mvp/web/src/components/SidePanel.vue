<template>
  <aside class="sp" aria-label="解说与数据面板">
    <div class="panel-head">
      <span class="bc-kicker">Commentary <i>/</i> AI</span>
      <span class="bc-mono sp-tone" v-if="tone">{{ tone }}</span>
    </div>
    <CommentaryFeed />
    <PipelineStrip />
    <DataBlock />
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import CommentaryFeed from './CommentaryFeed.vue'
import PipelineStrip from './PipelineStrip.vue'
import DataBlock from './DataBlock.vue'
import { typewriter } from '../lib/store.js'

const tone = computed(() => {
  const cur = typewriter.sentences.find(s => s.status === 'typing')
  return cur?.cue?.tone || ''
})
</script>

<style scoped>
.sp {
  display: flex;
  flex-direction: column;
  background: var(--bc-bg);
  overflow: hidden;
}
.sp-tone { color: var(--bc-signal); font-size: 10px; }
</style>
