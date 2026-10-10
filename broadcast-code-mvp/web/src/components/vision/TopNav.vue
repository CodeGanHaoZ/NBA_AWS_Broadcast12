<script setup>
/** 顶栏：品牌（ALL CITY · 一人亿城 · TEAM 20）+ 视图导航 + 主操作 */
import { S, setView, toggleOverlay } from '../../lib/store.js'
const emit = defineEmits(['import'])

const tabs = [
  { id: 'analysis', label: '比赛现实 · 视频分析' },
  { id: 'dashboard', label: '数据看板' },
  { id: 'factors', label: '因素图' },
  { id: 'possessions', label: '回合库' }
]
function go(id) {
  if (id === 'factors' || id === 'possessions') {
    setView('analysis')
    const anchor = id === 'factors' ? 'factors-anchor' : 'poss-anchor'
    requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return
  }
  setView(id)
}
</script>

<template>
  <header class="vb-top">
    <a class="vb-brand" aria-label="ALL CITY · 一人亿城 · TEAM 20" @click.prevent="go('analysis')" href="#">
      <!-- 内联 SVG：与参考工程同一枚「一城一人」品牌标（柱状 + 信号橙人形） -->
      <svg class="vb-brand__word" viewBox="0 0 380 48" role="img" aria-label="ALL CITY · ONE PERSON · 一人亿城 · TEAM 20">
        <title>ALL CITY · 一人亿城 · TEAM 20</title>
        <g>
          <rect x="0" y="26" width="7" height="18" fill="#2A2A2E" />
          <rect x="10" y="17" width="7" height="27" fill="#3A3A3E" />
          <rect x="20" y="9" width="8" height="35" fill="#F9530C" />
          <circle cx="24" cy="4.5" r="3.5" fill="none" stroke="#F9530C" stroke-width="1.5" />
          <rect x="31" y="21" width="7" height="23" fill="#3A3A3E" />
          <rect x="41" y="28" width="7" height="16" fill="#2A2A2E" />
          <line x1="0" y1="44" x2="48" y2="44" stroke="#8E8E96" stroke-width="1" />
        </g>
        <text x="60" y="29" font-family="Anton,'Arial Narrow',sans-serif" font-size="23" letter-spacing="2" fill="#F5F2EC">ALL CITY</text>
        <text x="61" y="42" font-family="'JetBrains Mono',monospace" font-size="8" letter-spacing="2.4" fill="#8E8E96">ONE PERSON · 一人亿城 · TEAM 20</text>
      </svg>
      <!-- 窄屏只留图形标 -->
      <svg class="vb-brand__mark" viewBox="-3 -3 54 54" role="img" aria-label="ALL CITY">
        <rect x="0" y="26" width="7" height="18" fill="#2A2A2E" />
        <rect x="10" y="17" width="7" height="27" fill="#3A3A3E" />
        <rect x="20" y="9" width="8" height="35" fill="#F9530C" />
        <circle cx="24" cy="4.5" r="3.5" fill="none" stroke="#F9530C" stroke-width="1.5" />
        <rect x="31" y="21" width="7" height="23" fill="#3A3A3E" />
        <rect x="41" y="28" width="7" height="16" fill="#2A2A2E" />
        <line x1="0" y1="44" x2="48" y2="44" stroke="#8E8E96" stroke-width="1" />
      </svg>
    </a>
    <nav class="vb-nav">
      <button v-for="tb in tabs" :key="tb.id"
              :class="{ 'is-on': (S.view === tb.id) || (tb.id === 'factors' && false) }"
              @click="go(tb.id)">{{ tb.label }}</button>
    </nav>
    <div class="vb-top-right">
      <span class="vb-team-chip"><i class="dot"></i>TEAM <b>20</b><span class="lbl">&nbsp;· 一人亿城</span></span>
      <!-- 实时叠加开关：按需求暂时隐藏（功能保留，恢复展示只需取消注释）
      <button class="vb-chip" :class="{ 'vb-chip--signal': S.overlayOn }" style="cursor:pointer;background:none"
              @click="toggleOverlay()">
        {{ S.overlayOn ? '实时叠加 · 开' : '实时叠加 · 关' }}
      </button>
      -->
      <button class="bc-btn bc-btn--primary bc-btn--sm" @click="emit('import')">分析新回合</button>
    </div>
  </header>
</template>
