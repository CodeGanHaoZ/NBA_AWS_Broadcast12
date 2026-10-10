<template>
  <div class="ec" role="alert">
    <p class="bc-mono ec-code">ERR {{ error?.code ?? '----' }}</p>
    <p class="ec-msg">{{ error?.message || '未知错误' }}</p>
    <p class="ec-sub">分析管线中断，战术板未加载。可重试，或切换其他回合/数据集。</p>
    <button class="ghost-btn ec-retry" @click="$emit('retry')">重新分析</button>
  </div>
</template>

<script setup>
defineProps({ error: { type: Object, default: null } })
defineEmits(['retry'])
</script>

<style scoped>
.ec {
  margin: var(--bc-s6);
  padding: var(--bc-s8);
  border: 1px solid var(--bc-key-red);
  border-radius: var(--bc-radius-card);
  background: var(--bc-surface);
  max-width: 480px;
}
.ec-code { color: var(--bc-key-red); }
.ec-msg { color: var(--bc-chalk); font-size: 16px; margin: var(--bc-s2) 0; }
.ec-sub { color: var(--bc-muted); font-size: 13px; margin: 0 0 var(--bc-s4); }
</style>
