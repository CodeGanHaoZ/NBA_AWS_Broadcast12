<template>
  <svg ref="root" class="cb" viewBox="0 0 940 500" preserveAspectRatio="xMidYMid meet" role="img"
    :aria-label="`战术板重演：${play.label}`">
    <defs>
      <marker id="cb-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M1 1l8 4-8 4" fill="none" stroke="var(--bc-signal)" stroke-width="1.6" />
      </marker>
    </defs>

    <!-- L0 球场透视线（帧内 chalk 14%） -->
    <g fill="none" stroke="var(--court-line-frame)" stroke-width="1.5">
      <rect x="10" y="10" width="920" height="480" />
      <line x1="470" y1="10" x2="470" y2="490" />
      <circle cx="470" cy="250" r="60" />
      <circle cx="470" cy="250" r="8" />
      <rect x="10" y="170" width="190" height="160" />
      <rect x="740" y="170" width="190" height="160" />
      <path d="M10 30 L220 30 A237.5 237.5 0 0 1 220 470 L10 470" />
      <path d="M930 30 L720 30 A237.5 237.5 0 0 0 720 470 L930 470" />
      <circle cx="40" cy="250" r="15" />
      <circle cx="900" cy="250" r="15" />
      <line x1="24" y1="250" x2="40" y2="250" stroke-width="4" />
      <line x1="916" y1="250" x2="900" y2="250" stroke-width="4" />
    </g>

    <!-- zone 色块层 -->
    <g v-if="overlayOn" ref="zoneEls">
      <g v-for="(o, i) in zones" :key="'z' + i" :data-t0="o.t0" :data-t1="o.t1" display="none">
        <polygon :points="o.svgPoints" fill="var(--bc-signal)" :opacity="o.opacity" />
        <text :x="o.labelX" :y="o.labelY" class="cb-label cb-label--zone">{{ o.label }}</text>
      </g>
    </g>

    <!-- arrow 层（传球 solid / 跑位 dashed） -->
    <g v-if="overlayOn" ref="arrowEls">
      <line v-for="(o, i) in arrows" :key="'a' + i"
        :x1="o.x1" :y1="o.y1" :x2="o.x2" :y2="o.y2"
        :class="['cb-arrow', { 'bc-dash-run': o.style === 'dashed' }]"
        marker-end="url(#cb-ah)" display="none"
        :data-t0="o.t0" :data-t1="o.t1" />
    </g>

    <!-- 球员骨架层（ref 直写 transform，不走响应式） -->
    <g ref="playerLayer">
      <g v-for="(p, i) in roster" :key="p.id" :ref="el => (playerEls[i] = el)" class="cb-player">
        <line class="cb-body" x1="0" y1="0" x2="0" y2="-14" />
        <line class="cb-arms" x1="-7" y1="-9" x2="7" y2="-9" />
        <line class="cb-leg" x1="0" y1="0" x2="-5" y2="7" />
        <line class="cb-leg" x1="0" y1="0" x2="5" y2="7" />
        <circle class="cb-head" cx="0" cy="-18" r="4" />
      </g>
    </g>

    <!-- 球（地面阴影 + 按 z 抬升） -->
    <g ref="ballEl">
      <ellipse class="cb-ball-shadow" rx="4.5" ry="1.8" />
      <circle class="cb-ball" r="3.2" />
    </g>

    <!-- Telestrator 橙环层（S-03，跟随球员逐帧） -->
    <g v-if="overlayOn" ref="ringEls">
      <g v-for="(o, i) in rings" :key="'r' + i" display="none" :data-t0="o.t0" :data-t1="o.t1"
        class="cb-ring" :class="{ 'cb-ring--clutch': clutchActive }">
        <circle class="cb-ring-c" :r="o.r" />
        <line class="cb-ring-x" x1="0" :y1="-o.r - 6" x2="0" :y2="-o.r + 4" />
        <line class="cb-ring-x" x1="0" :y1="o.r - 4" x2="0" :y2="o.r + 6" />
        <line class="cb-ring-x" :x1="-o.r - 6" y1="0" :x2="-o.r + 4" y2="0" />
        <line class="cb-ring-x" :x1="o.r - 4" y1="0" :x2="o.r + 6" y2="0" />
        <text v-if="o.label" class="cb-label" :y="-o.r - 10">{{ o.label }}</text>
      </g>
    </g>

    <!-- L4 终结结果弹出（Anton +N） -->
    <text v-if="overlayOn && resultText" ref="resultEl" class="cb-result" display="none">{{ resultText }}</text>
  </svg>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clock, store } from '../lib/store.js'
import { sampleFrame, headingOf, roleColor, ballHandler } from '../lib/court.js'
import { resultOf } from '../lib/result.js'

const props = defineProps({
  play: { type: Object, required: true },
  overlayOn: { type: Boolean, default: true },
  clutchActive: { type: Boolean, default: false }
})

const root = ref(null)
const playerLayer = ref(null)
const ballEl = ref(null)
const playerEls = ref([])
const ringEls = ref(null)
const arrowEls = ref(null)
const zoneEls = ref(null)
const resultEl = ref(null)

const roster = computed(() => props.play.frames?.[0]?.players ?? [])

// ---- overlay 静态描述（ft → SVG 单位 ×10；坐标已是绝对球场坐标，镜像安全） ----
const overlays = computed(() => props.play.overlays ?? [])
const arrows = computed(() => overlays.value
  .filter(o => o.type === 'arrow' && o.from && o.to)
  .map(o => ({ ...o, x1: o.from[0] * 10, y1: o.from[1] * 10, x2: o.to[0] * 10, y2: o.to[1] * 10 })))
const rings = computed(() => overlays.value
  .filter(o => o.type === 'ring' && o.playerId)
  .map(o => ({ ...o, r: (o.r || 2) * 10 })))
const zones = computed(() => overlays.value
  .filter(o => o.type === 'zone' && o.points?.length >= 3)
  .map(o => {
    const pts = o.points.map(p => [p[0] * 10, p[1] * 10])
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
    return { ...o, svgPoints: pts.map(p => p.join(',')).join(' '), labelX: cx, labelY: cy }
  }))

// 终结点（t0 最大的 ring）+ 结果分推导
const finishRing = computed(() => {
  const rs = rings.value
  if (!rs.length) return null
  return rs.reduce((a, b) => (b.t0 > a.t0 ? b : a))
})
const resultText = computed(() => resultOf(props.play))

// ---- rAF 渲染循环（挂在 replayClock 上，K8/K10）----
let offFrame = null
let headings = []

function setDisplay(el, on) {
  if (!el) return
  const want = on ? 'inline' : 'none'
  if (el.getAttribute('display') !== want) el.setAttribute('display', want)
}

function render(t, settled) {
  const frames = props.play.frames
  if (!frames || !frames.length) return
  const f = sampleFrame(frames, t)
  if (!f) return
  const handlerId = ballHandler(f)

  // 球员骨架
  f.players.forEach((p, i) => {
    const g = playerEls.value[i]
    if (!g) return
    const h = headingOf(frames, i, t, headings[i] || 0)
    headings[i] = h
    g.setAttribute('transform', `translate(${p.x * 10} ${p.y * 10}) rotate(${(h * 180 / Math.PI + 90).toFixed(1)})`)
    const color = roleColor(p, handlerId)
    if (g.getAttribute('stroke') !== color) g.setAttribute('stroke', color)
  })

  // 球（z 抬升 + 阴影）
  if (ballEl.value) {
    const zUp = f.ball.z * 8
    ballEl.value.setAttribute('transform', `translate(${f.ball.x * 10} ${f.ball.y * 10})`)
    const ball = ballEl.value.querySelector('.cb-ball')
    const shadow = ballEl.value.querySelector('.cb-ball-shadow')
    if (ball) ball.setAttribute('cy', String(-zUp))
    if (shadow) shadow.setAttribute('opacity', String(Math.max(0.15, 0.5 - f.ball.z * 0.03).toFixed(2)))
  }

  if (!props.overlayOn) return

  // ring：t0 亮起，跟随球员；settled 后保留（L1/L4 驻留）
  const ringNodes = ringEls.value ? ringEls.value.children : []
  rings.value.forEach((o, i) => {
    const el = ringNodes[i]
    if (!el) return
    const on = t >= o.t0 && (t <= o.t1 || settled)
    setDisplay(el, on)
    if (!on) return
    const pt = Math.min(t, o.t1)
    const pf = sampleFrame(frames, pt)
    const pp = pf?.players.find(pl => pl.id === o.playerId)
    if (pp) el.setAttribute('transform', `translate(${pp.x * 10} ${pp.y * 10})`)
  })

  // arrow / zone：窗口内可见；settled 后淡出（仅留 ring）
  const arrowNodes = arrowEls.value ? arrowEls.value.children : []
  arrows.value.forEach((o, i) => setDisplay(arrowNodes[i], !settled && t >= o.t0 && t <= o.t1))
  const zoneNodes = zoneEls.value ? zoneEls.value.children : []
  zones.value.forEach((o, i) => setDisplay(zoneNodes[i], !settled && t >= o.t0 && t <= o.t1))

  // 终结结果弹出
  if (resultEl.value && finishRing.value && resultText.value) {
    const on = t >= finishRing.value.t0
    setDisplay(resultEl.value, on)
    if (on) {
      const pf = sampleFrame(frames, Math.min(t, finishRing.value.t1))
      const pp = pf?.players.find(pl => pl.id === finishRing.value.playerId)
      if (pp) {
        resultEl.value.setAttribute('x', String(pp.x * 10 + 18))
        resultEl.value.setAttribute('y', String(pp.y * 10 - 24))
      }
    }
  }
}

let offState = null

onMounted(() => {
  headings = new Array(roster.value.length).fill(0)
  offFrame = clock.onFrame((t) => render(t, clock.state === 'settled'))
  // 状态迁移（pause/settled/seek）时补一帧：frame 订阅仅在 replaying 触发，
  // settled 驻留帧（Telestrator 环+终结点）靠这里落图
  offState = clock.onState(() => render(clock.t, clock.state === 'settled'))
  render(clock.t, clock.state === 'settled')
})
onBeforeUnmount(() => { if (offFrame) offFrame(); if (offState) offState() })

watch(() => props.play.id, () => {
  headings = new Array(roster.value.length).fill(0)
})

// overlay 开关在暂停/settled 下也要立即反映
watch(() => props.overlayOn, () => render(clock.t, clock.state === 'settled'))
</script>

<style scoped>
.cb { width: 100%; height: 100%; display: block; }

.cb-player { fill: none; stroke-width: 2; stroke-linecap: round; }
.cb-head { fill: none; }

.cb-ball { fill: var(--bc-chalk); }
.cb-ball-shadow { fill: var(--bc-bg); }

.cb-arrow {
  stroke: var(--bc-signal);
  stroke-width: 2;
  fill: none;
}

.cb-ring-c {
  fill: none;
  stroke: var(--bc-signal);
  stroke-width: 2;
  transform-box: fill-box;
  transform-origin: center;
  animation: bc-pulse 2.4s var(--bc-ease) infinite;
}
.cb-ring--clutch .cb-ring-c { animation: bc-pulse-clutch 1.6s var(--bc-ease) infinite; }
.cb-ring-x { stroke: var(--bc-signal); stroke-width: 1.5; }

.cb-label {
  fill: var(--bc-signal);
  font-family: var(--bc-font-mono);
  font-size: 12px;
  letter-spacing: .1em;
  text-anchor: middle;
}
.cb-label--zone { fill: var(--bc-chalk); opacity: .85; font-size: 11px; }

.cb-result {
  fill: var(--bc-signal);
  font-family: var(--bc-font-display);
  font-size: 40px;
  letter-spacing: .02em;
  animation: cb-pop .3s var(--bc-ease);
}
@keyframes cb-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .cb-ring-c, .cb-ring--clutch .cb-ring-c, .cb-result { animation: none; }
}
</style>
