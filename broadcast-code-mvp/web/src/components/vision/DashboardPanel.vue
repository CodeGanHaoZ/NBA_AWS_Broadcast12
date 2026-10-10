<script setup>
/** 数据看板：KPI + 跑动榜 + 事件分布 + 速度曲线（纯 SVG，无图表库） */
import { computed } from 'vue'
import { S, metrics, durationMs, events } from '../../lib/store.js'
import { catmullRomPath, smoothPoints } from '../../lib/smooth.js'

const m = computed(() => metrics.value || {})
const load = computed(() => (m.value.playerLoad || []).slice().sort((a, b) => b.dist - a.dist))
const maxDist = computed(() => Math.max(1, ...load.value.map(p => p.dist)))

const kpi = computed(() => {
  const ev = events.value
  const cnt = t => ev.filter(e => e.type === t).length
  const topSpeed = Math.max(0, ...((m.value.playerLoad || []).map(p => p.maxSpeed || 0)))
  return [
    { label: '回合时长', value: (durationMs.value / 1000).toFixed(1), unit: 's', hot: false },
    { label: '突破次数', value: cnt('DRIVE'), unit: '次', hot: true },
    { label: '传球次数', value: cnt('PASS'), unit: '次', hot: false },
    { label: '最高瞬时速度', value: topSpeed.toFixed(1), unit: 'm/s', hot: true }
  ]
})

const evCounts = computed(() => {
  const c = m.value.eventCount || {}
  const arr = Object.entries(c).map(([k, v]) => ({ k, v }))
  const max = Math.max(1, ...arr.map(a => a.v))
  return arr.map(a => ({ ...a, pct: (a.v / max) * 100 }))
})

/** 速度曲线：双方平均速度随时间 —— Catmull-Rom 平滑（含曲线下方面积填充） */
const speedPath = computed(() => {
  const sc = m.value.speedCurve || []
  if (sc.length < 2) return { off: '', def: '', area: '' }
  const maxV = Math.max(1, ...sc.map(p => Math.max(p.offenseSpeed || 0, p.defenseSpeed || 0)))
  const w = 640, h = 120
  const pt = (key) => sc.map((p, i) => [(i / (sc.length - 1)) * w, h - ((p[key] || 0) / maxV) * (h - 12) - 6])
  const off = catmullRomPath(pt('offenseSpeed'), 0.55)
  const def = catmullRomPath(pt('defenseSpeed'), 0.55)
  const offPts = pt('offenseSpeed')
  const area = off + ` L ${offPts[offPts.length - 1][0]} ${h} L ${offPts[0][0]} ${h} Z`
  return { off, def, area }
})

/** 空间控制曲线（面积）—— 平滑 */
const spacePath = computed(() => {
  const sp = m.value.spaceControl || []
  if (sp.length < 2) return { off: '', def: '' }
  const maxV = Math.max(1, ...sp.map(p => Math.max(p.offenseArea || 0, p.defenseArea || 0)))
  const w = 640, h = 120
  const pt = (key) => sp.map((p, i) => [(i / (sp.length - 1)) * w, h - ((p[key] || 0) / maxV) * (h - 12) - 6])
  return { off: catmullRomPath(pt('offenseArea'), 0.55), def: catmullRomPath(pt('defenseArea'), 0.55) }
})
</script>

<template>
  <div class="vb-dash-wrap">
    <!-- 战术板插槽（由 App.vue 注入 T1-T4 战术板模块） -->
    <slot name="board" />

    <div class="vb-dash" v-reveal>
      <div v-for="(k, i) in kpi" :key="k.label" class="vb-kpi" :class="{ 'is-hot': k.hot }">
        <span>{{ k.label }}</span>
        <b><span class="vb-kpi__n" v-countup>{{ k.value }}</span><em>{{ k.unit }}</em></b>
      </div>
    </div>

    <div class="vb-chart" v-reveal>
      <h4>双方平均移动速度 / m·s⁻¹</h4>
      <svg viewBox="0 0 640 120" width="100%" height="120" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vbArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0B6FD1" stop-opacity=".24" />
            <stop offset="1" stop-color="#0B6FD1" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="114" x2="640" y2="114" stroke="var(--bc-line)" />
        <path :d="speedPath.area" fill="url(#vbArea)" stroke="none" />
        <path :d="speedPath.off" fill="none" stroke="#0B6FD1" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
        <path :d="speedPath.def" fill="none" stroke="#CE1141" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 4" />
      </svg>
      <div style="display:flex;gap:18px;margin-top:8px">
        <span class="vb-legend"><i class="d-off"></i>独行侠（进攻）</span>
        <span class="vb-legend"><i class="d-def"></i>火箭（防守）</span>
      </div>
    </div>

    <div class="vb-dash-2">
      <div class="vb-chart" v-reveal>
        <h4>球员跑动距离 / m</h4>
        <div class="vb-bars">
          <div v-for="p in load" :key="p.id" class="vb-bar" :data-team="p.team">
            <span>{{ p.team === 'off' ? '进' : '防' }} #{{ p.num }}</span>
            <i><em :style="{ width: ((p.dist / maxDist) * 100).toFixed(0) + '%' }"></em></i>
            <b>{{ (p.dist || 0).toFixed(1) }}</b>
          </div>
        </div>
      </div>

      <div class="vb-chart" v-reveal>
        <h4>事件分布</h4>
        <div class="vb-bars">
          <div v-for="e in evCounts" :key="e.k" class="vb-bar">
            <span>{{ e.k }}</span>
            <i><em :style="{ width: e.pct.toFixed(0) + '%' }"></em></i>
            <b>{{ e.v }}</b>
          </div>
        </div>
      </div>
    </div>

    <div class="vb-chart" v-reveal>
      <h4>空间控制 / ft²</h4>
      <svg viewBox="0 0 640 120" width="100%" height="120" preserveAspectRatio="none">
        <line x1="0" y1="114" x2="640" y2="114" stroke="var(--bc-line)" />
        <path :d="spacePath.off" fill="none" stroke="#35C08A" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
        <path :d="spacePath.def" fill="none" stroke="#F5C518" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 4" />
      </svg>
      <div style="display:flex;gap:18px;margin-top:8px">
        <span class="vb-legend"><i style="background:#35C08A"></i>进攻控制区</span>
        <span class="vb-legend"><i style="background:#F5C518"></i>防守控制区</span>
      </div>
    </div>
  </div>
</template>
