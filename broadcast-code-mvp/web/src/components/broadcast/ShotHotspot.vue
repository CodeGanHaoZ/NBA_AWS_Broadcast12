<script setup>
/**
 * 投篮热点图
 * 结构照搬参考工程：标题 + 范围切换（全队 / 当前球员）+ 球场底图 + 出手点（半径 = xFG 难度）
 * + 悬停提示 + 图例 + 两队对比条。
 */
import { computed, ref } from 'vue'
import {
  METRICS, M_BY_ID, BS, hsX, hsY, courtPaths, toggleHotspotScope, teamOf, clamp,
} from '../../lib/broadcast/model.js'

const svgEl = ref(null)
const tip = ref({ show: false, left: 0, top: 0, html: '' })

const scopePid = computed(() => (BS.hotspotScope === 'player' ? BS.selected : null))
const isPlayerScope = computed(() => !!scopePid.value)

const lines = computed(() => courtPaths(hsX, hsY, 'rgba(245,242,236,0.24)', 'rgba(245,242,236,0.15)'))

const shots = computed(() => {
  const out = []
  METRICS.forEach(m => m.shots.forEach(s => {
    if (scopePid.value && m.pid !== scopePid.value) return
    out.push({ ...s, pid: m.pid, number: m.number, name: m.name })
  }))
  return out
})

const dots = computed(() => shots.value.map((s, i) => ({
  i,
  made: s.made,
  cx: hsX(s.court[0]).toFixed(2),
  cy: hsY(s.court[1]).toFixed(2),
  r: (3.4 + s.xfg * 9).toFixed(2),
  fill: s.made ? 'var(--bc-signal)' : 'var(--bc-chalk)',
  fo: s.made ? 0.92 : 0.55,
  stroke: s.made ? 'rgba(249,83,12,.35)' : 'rgba(245,242,236,.2)',
})))

/** 数据指纹：切范围 / 切选中 / 数据变化时重放弹入动画 */
const stamp = computed(() =>
  `${BS.hotspotScope}:${BS.selected}:${shots.value.length}:${shots.value.filter(s => s.made).length}`
)

const scopeText = computed(() => {
  const total = shots.value.length
  const madeN = shots.value.filter(s => s.made).length
  const avgX = total ? shots.value.reduce((a, s) => a + s.xfg, 0) / total : 0
  if (scopePid.value) {
    const m = M_BY_ID[scopePid.value]
    return `#${m.number} ${m.name} · ${total} 次 · ${madeN} 中 · xFG ${avgX.toFixed(2)}`
  }
  return `全队 · ${total} 次 · ${madeN} 中 · xFG ${avgX.toFixed(2)}`
})

const bars = computed(() => {
  const hou = teamOf('HOU'), dal = teamOf('DAL')
  const rows = [
    { k: 'HOU 命中率', v: hou?.fgPct ?? 0, signal: false },
    { k: 'DAL 命中率', v: dal?.fgPct ?? 0, signal: false },
    { k: 'HOU 引力均值', v: hou?.gravityAvg ?? 0, signal: true },
    { k: 'DAL 引力均值', v: dal?.gravityAvg ?? 0, signal: false },
  ]
  return rows.map(r => ({
    ...r,
    text: r.v ? r.v.toFixed(1) : '—',
    w: clamp((r.v / Math.max(100, r.v)) * 100, 3, 100),
  }))
})

function onEnter(d) {
  const s = shots.value[d.i]
  const el = svgEl.value
  if (!s || !el) return
  const r = el.getBoundingClientRect()
  tip.value = {
    show: true,
    left: clamp((hsX(s.court[0]) / 300) * r.width + 12, 0, Math.max(0, r.width - 160)) + 'px',
    top: clamp((hsY(s.court[1]) / 282) * r.height - 34, 0, Math.max(0, r.height - 40)) + 'px',
    html: `#${s.number} ${s.name} · ${s.is3 ? '三分' : '两分'}<br>xFG ${s.xfg.toFixed(2)} · <span style="color:${s.made ? 'var(--bc-signal)' : 'var(--bc-muted)'}">${s.made ? '命中' : '未中'}</span>`,
  }
  BS.selected = s.pid
}
function onLeave() { tip.value.show = false }
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>投篮热点图</h3>
      <span class="r is-click" :title="isPlayerScope ? '切回全队' : '只看当前选中球员'" @click="toggleHotspotScope()">{{ scopeText }}</span>
    </div>

    <div class="hotspot-wrap">
      <svg ref="svgEl" class="hotspot" viewBox="0 0 300 282" role="img" aria-label="投篮热点图">
        <!-- 战术台同款科技感底：径向渐变透明 + 坐标网格 + HUD 角标 -->
        <defs>
          <radialGradient id="hsBg" cx="50%" cy="40%" r="78%">
            <stop offset="0" stop-color="#3D5AA8" stop-opacity=".20" />
            <stop offset=".55" stop-color="#1B2748" stop-opacity=".08" />
            <stop offset="1" stop-color="#0B0B0C" stop-opacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="300" height="282" fill="url(#hsBg)"></rect>
        <g stroke="rgba(245,242,236,.05)" stroke-width="1">
          <line v-for="n in 7" :key="'gx' + n" :x1="n * 37.5" y1="0" :x2="n * 37.5" y2="282"></line>
          <line v-for="n in 7" :key="'gy' + n" x1="0" :y1="n * 40.3" x2="300" :y2="n * 40.3"></line>
        </g>
        <g class="hs-corners" fill="none" stroke="rgba(249,83,12,.75)" stroke-width="1.5" stroke-linecap="square">
          <path d="M7,18 L7,7 L18,7"></path>
          <path d="M282,7 L293,7 L293,18"></path>
          <path d="M293,264 L293,275 L282,275"></path>
          <path d="M18,275 L7,275 L7,264"></path>
        </g>
        <path v-for="(l, i) in lines" :key="'c' + i" :d="l.d" fill="none"
              :stroke="l.stroke" :stroke-width="l.main ? 1.4 : 1"></path>
        <circle v-for="d in dots" :key="'d' + d.i + '-' + stamp" class="hs-dot" :class="{ 'is-made': d.made }"
                :style="{ '--i': d.i }" :cx="d.cx" :cy="d.cy" :r="d.r"
                :fill="d.fill" :fill-opacity="d.fo" :stroke="d.stroke" stroke-width="1"
                style="cursor: pointer" @mouseenter="onEnter(d)" @mouseleave="onLeave"></circle>
      </svg>
      <div class="hs-tip" :class="{ show: tip.show }" :style="{ left: tip.left, top: tip.top }" v-html="tip.html"></div>
    </div>

    <div class="legend">
      <span><i style="background: var(--bc-signal)"></i>命中</span>
      <span><i style="background: var(--bc-chalk)"></i>未中</span>
      <span><i style="background: var(--bc-muted)"></i>点大小 = xFG 难度</span>
    </div>

    <div class="bars" style="margin-top: 12px">
      <div v-for="b in bars" :key="b.k" class="bar-row" :class="{ 'is-signal': b.signal }">
        <span class="k">{{ b.k }}</span>
        <span class="track"><i :style="{ width: b.w + '%' }"></i></span>
        <span class="v">{{ b.text }}</span>
      </div>
    </div>
  </div>
</template>
