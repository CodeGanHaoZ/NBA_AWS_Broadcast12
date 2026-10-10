<template>
  <!-- S-08 编号管线大图（主区空态） -->
  <div class="es">
    <ol class="es-pipe">
      <li v-for="(s, i) in steps" :key="s.key" class="es-step" :style="{ '--i': i }">
        <span class="bc-display es-num">{{ s.num }}</span>
        <span class="bc-mono es-key">{{ s.key }}</span>
        <span class="es-desc">{{ s.desc }}</span>
      </li>
    </ol>
    <p class="es-guide">选择一个回合，听 AI 拆解每一次跑位与空档</p>
    <p class="bc-mono es-hint">← 从左栏回合列表开始 · ↑↓ 移动 · Enter 播放</p>
  </div>
</template>

<script setup>
const steps = [
  { num: '01', key: 'input', desc: '读取深度赛场追踪数据，94×50 英尺全场坐标逐帧还原' },
  { num: '02', key: 'analyze', desc: '五维加权识别关键回合：关键时刻 / 难度 / 稀有度 / 势头 / 球星' },
  { num: '03', key: 'visualize', desc: '箭头、色块、球员标注四层叠加，战术板逐帧重演' },
  { num: '04', key: 'narrate', desc: '规则引擎生成解说，与标注消费同一事件序列逐秒同步' }
]
</script>

<style scoped>
.es {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bc-s6);
  padding: var(--bc-s8);
  text-align: center;
}
.es-pipe {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 0;
  width: 100%;
  max-width: 760px;
  counter-reset: pipe;
}
.es-step {
  border-top: 1px solid var(--bc-line);
  padding: var(--bc-s4) var(--bc-s3);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--bc-s1);
  text-align: left;
  animation: es-in .4s var(--bc-ease) both;
  animation-delay: calc(var(--i) * 90ms);
}
@keyframes es-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.es-num { font-size: 48px; color: var(--bc-surface-2); -webkit-text-stroke: 1px var(--bc-line); line-height: 1; }
.es-step:first-child .es-num { color: var(--bc-signal); -webkit-text-stroke: 0; }
.es-key { color: var(--bc-signal); font-size: 12px; }
.es-step:not(:first-child) .es-key { color: var(--bc-chalk); }
.es-desc { font-size: 12px; color: var(--bc-muted); line-height: 1.6; }
.es-guide { font-size: 17px; color: var(--bc-chalk); margin: 0; }
.es-hint { color: var(--bc-muted); }
@media (max-width: 1024px) {
  .es-pipe { grid-template-columns: repeat(2, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .es-step { animation: none; }
}
</style>
