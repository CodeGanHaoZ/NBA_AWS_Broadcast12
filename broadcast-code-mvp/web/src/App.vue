<script setup>
/**
 * Reality5 · 视频分析工作台
 * 形态：上传视频 -> 视觉分析 -> 战术台重演 + 数据看板 + 战术判断
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { S, loadSynthetic, startClock, play } from './lib/store.js'
import { resetReveals } from './directives.js'
import TopNav from './components/vision/TopNav.vue'
import InsightPanel from './components/vision/InsightPanel.vue'
import PossessionPanel from './components/vision/PossessionPanel.vue'
import FactorsPanel from './components/vision/FactorsPanel.vue'
import DashboardPanel from './components/vision/DashboardPanel.vue'
import ImportWizard from './components/vision/ImportWizard.vue'
import ScoreBar from './components/broadcast/ScoreBar.vue'
import PlayBar from './components/broadcast/PlayBar.vue'
import RealityTimeline from './components/broadcast/RealityTimeline.vue'
import GravityPanel from './components/broadcast/GravityPanel.vue'
import ShotHotspot from './components/broadcast/ShotHotspot.vue'
import RosterPanel from './components/broadcast/RosterPanel.vue'
import TacticalBoards from './components/broadcast/TacticalBoards.vue'
import BroadcastStage from './components/broadcast/BroadcastStage.vue'

const showImport = ref(false)
const analyzing = computed(() => S.stage === 'analyzing' && !S.analysis)

/* ---------------- 返回顶部（桌面端滚动在 .vb-main 内，移动端为整页滚动，双源监听） ---------------- */
const mainEl = ref(null)
const showTop = ref(false)
let pendingReset = false
const scrollTopY = () => Math.max(mainEl.value ? mainEl.value.scrollTop : 0, window.scrollY || 0)
function onScroll() {
  showTop.value = scrollTopY() > 420
  // 平滑滚回顶部后，重置未在视口内的入场动效（再次下滚时重放）
  if (pendingReset && scrollTopY() < 60) {
    pendingReset = false
    resetReveals()
  }
}
function backToTop() {
  pendingReset = true
  mainEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
  window.scrollTo({ top: 0, behavior: 'smooth' })
  if (scrollTopY() < 60) { pendingReset = false; resetReveals() }
}

onMounted(() => {
  startClock()
  loadSynthetic()
  play() // 时间轴默认自动播放
  const q = new URLSearchParams(location.search)
  if (q.get('view') === 'dashboard') S.view = 'dashboard'
  if (q.get('wizard') === '1') showImport.value = true
  mainEl.value?.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('scroll', onScroll, { passive: true })
})
onUnmounted(() => {
  mainEl.value?.removeEventListener('scroll', onScroll)
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="bc-root vb-shell vb-bx">
    <TopNav @import="showImport = true" />
    <ScoreBar />

    <div class="vb-body">
      <div class="vb-main" ref="mainEl">
      <Transition name="vb-view" mode="out-in">
        <div v-if="S.view === 'analysis'" key="analysis" class="vb-view">
          <BroadcastStage class="bc-reveal" v-reveal />
          <PlayBar class="bc-reveal" v-reveal />
          <RealityTimeline class="bc-reveal" v-reveal />
          <TacticalBoards class="bc-reveal" v-reveal />
          <InsightPanel class="bc-reveal" v-reveal />
        </div>
        <div v-else key="dashboard" class="vb-view">
          <DashboardPanel class="bc-reveal" v-reveal>
            <template #board>
              <TacticalBoards class="bc-reveal" v-reveal />
            </template>
          </DashboardPanel>
        </div>
      </Transition>
    </div>

      <aside class="vb-rail">
        <PossessionPanel class="bc-reveal" v-reveal />
        <GravityPanel class="bc-reveal" v-reveal />
        <RosterPanel class="bc-reveal" v-reveal />
        <ShotHotspot class="bc-reveal" v-reveal />
        <FactorsPanel class="bc-reveal" v-reveal />
      </aside>
    </div>

    <Transition name="vb-pop">
      <ImportWizard v-if="showImport" @close="showImport = false" />
    </Transition>

    <Transition name="vb-pop">
      <div v-if="analyzing" class="vb-modal">
      <div class="vb-modal__box" style="width:min(520px,100%)">
        <div class="bc-kicker">视觉分析管线 <i>/</i> {{ S.progress.phase }}</div>
        <h2 class="bc-display" style="font-size:24px;margin:14px 0 6px">{{ S.progress.message || '分析中' }}</h2>
        <p style="color:var(--bc-muted);font-size:13px">逐帧解码 · 目标检测 · 数据关联 · 坐标映射</p>
        <div class="vb-progress"><i :style="{ width: Math.round((S.progress.value || 0) * 100) + '%' }"></i></div>
      </div>
      </div>
    </Transition>

    <transition name="fade">
      <div v-if="S.toast" class="vb-toast">{{ S.toast }}</div>
    </transition>

    <!-- 返回顶部 -->
    <Transition name="vb-topbtn">
      <button v-if="showTop" class="vb-backtop" aria-label="返回顶部" title="返回顶部" @click="backToTop">
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>TOP</span>
      </button>
    </Transition>
  </div>
</template>

<style>
.vb-toast {
  position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%);
  background: var(--bc-surface-2); border: 1px solid var(--bc-signal); color: var(--bc-chalk);
  padding: 10px 20px; border-radius: var(--bc-radius-card); z-index: 60;
  font-size: 13px; font-family: var(--bc-font-mono);
}
.fade-enter-active, .fade-leave-active { transition: opacity .25s var(--bc-ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
