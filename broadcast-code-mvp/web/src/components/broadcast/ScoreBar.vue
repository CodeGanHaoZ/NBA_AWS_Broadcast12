<script setup>
/**
 * 转播记分条 / 电子记分牌
 * 结构照搬参考工程 app/index.html 的 .scorebar：队色条 + 比分 + 实时胜率 + 节次与比赛时钟。
 */
import { live, TEAM_COLOR } from '../../lib/broadcast/model.js'
</script>

<template>
  <div class="scorebar" role="group" aria-label="转播记分条">
    <div class="sb-team">
      <i class="bar" :style="{ background: TEAM_COLOR.HOU }"></i>
      <span class="abbr">HOU</span><span class="cn">休斯顿火箭</span>
    </div>

    <div class="sb-score">
      <span class="n" :key="live.home" :class="{ win: live.home >= live.away }">{{ live.home }}</span>
      <span class="sep">–</span>
      <span class="n" :key="live.away" :class="{ win: live.away > live.home }">{{ live.away }}</span>
    </div>

    <div class="sb-team">
      <i class="bar" :style="{ background: TEAM_COLOR.DAL }"></i>
      <span class="abbr">DAL</span><span class="cn">达拉斯独行侠</span>
    </div>

    <div class="sb-leverage" title="HOU 实时胜率（由分差 + 时间 + 球权推导）">
      <span>WIN PROB</span>
      <span class="tick"><i :style="{ width: live.wpBar + '%' }"></i></span>
      <b style="color: var(--bc-chalk)">{{ live.wpPct }}</b>
    </div>

    <div class="sb-clock">
      <span class="sb-q">{{ live.q }}</span>
      <span>GAME CLOCK <b>{{ live.gameClock }}</b></span>
    </div>
  </div>
</template>
