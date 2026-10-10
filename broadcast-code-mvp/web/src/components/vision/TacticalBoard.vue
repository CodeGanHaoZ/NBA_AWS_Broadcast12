<script setup>
/**
 * 战术台：真实球场底图（浅色木地板 + 蓝色油漆区 + 中圈队徽）+ 追踪节点 + 平滑轨迹 + 球轨迹 + 战术叠加
 * 坐标契约：输入一律 ft（0-94 × 0-50），本组件 ×10 转 SVG 单位。
 * 渲染纪律：所有位置由数据驱动，禁止预制动画坐标。
 * 交互：球员节点可点击，右侧弹出个人明细卡（球衣号 / 跑动 / 速度 / 参与事件）。
 */
import { computed } from 'vue'
import {
  S, curFrame, curEvents, durationMs, selectPlayer, clearPlayer, selectedPlayerInfo,
  activeFactorInfo, selectFactor
} from '../../lib/store.js'
import { catmullRomPath, smoothPoints } from '../../lib/smooth.js'

const FT = 10
const W = 940, H = 500
const px = v => v * FT

const frame = computed(() => curFrame.value)
const lives = computed(() => curEvents.value)
const sel = computed(() => selectedPlayerInfo.value)

/** 联动焦点：因素图点选的因素（优先）/ 当前英雄事件类型 */
const activeFactor = computed(() => activeFactorInfo.value)
const focusType = computed(() => activeFactor.value?.type || heroEvent.value?.type || '')

/** 当前事件的主角 id 集合（描边提示） */
const hotIds = computed(() => {
  const s = new Set()
  for (const e of lives.value) for (const id of (e.players || [])) s.add(id)
  return s
})

/** 当前主事件 */
const heroEvent = computed(() => {
  const es = lives.value
  if (!es.length) return null
  return es.slice().sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))[0]
})
const heroFactor = computed(() => {
  if (!heroEvent.value) return null
  return (S.analysis?.factors || []).find(f => f.type === heroEvent.value.type) || null
})

/** 球员轨迹拖尾（最近 2.4s），滑动平均去抖 + Catmull-Rom 平滑 */
function trailOf(id) {
  const tr = S.analysis?.tracks?.byId?.[id]
  if (!tr) return ''
  const t0 = S.t - 2400
  const raw = tr.path.filter(p => p.t >= t0 && p.t <= S.t).map(p => [px(p.x), px(p.y)])
  if (raw.length < 2) return ''
  return catmullRomPath(smoothPoints(raw, 1), 0.6)
}

/** 当前持球人（进攻方且距球 < 3.4ft） */
function isHandler(p) {
  if (!frame.value || p.team !== 'off') return false
  return Math.hypot(p.x - frame.value.ball.x, p.y - frame.value.ball.y) < 3.4
}

/** 球轨迹拖尾（最近 1.8s），平滑 */
const ballTrail = computed(() => {
  const f = S.analysis?.frames || []
  if (!f.length) return ''
  const t0 = S.t - 1800
  const raw = f.filter(x => x.t >= t0 && x.t <= S.t).map(x => [px(x.ball.x), px(x.ball.y)])
  if (raw.length < 2) return ''
  return catmullRomPath(smoothPoints(raw, 1), 0.55)
})

/** 进攻方向：以球最终位置判断 */
const attackRight = computed(() => {
  const f = S.analysis?.frames || []
  if (!f.length) return true
  return f[f.length - 1].ball.x >= 47
})
const attackHoopX = computed(() => (attackRight.value ? 887.5 : 52.5))

/** 突破箭头：持球人 -> 篮筐 */
const driveArrow = computed(() => {
  if (!S.overlayOn || focusType.value !== 'DRIVE') return null
  const f = frame.value
  if (!f) return null
  let best = null, bd = 6
  for (const p of f.players) {
    if (p.team !== 'off') continue
    const d = Math.hypot(p.x - f.ball.x, p.y - f.ball.y)
    if (d < bd) { bd = d; best = p }
  }
  if (!best) return null
  return { from: [px(best.x), px(best.y)], to: [attackHoopX.value, 250] }
})

/** 防守收缩环 */
const collapseRing = computed(() => {
  if (!S.overlayOn || focusType.value !== 'DEF_COLLAPSE') return null
  const f = frame.value
  if (!f) return null
  let best = null, bd = 6
  for (const p of f.players) {
    if (p.team !== 'off') continue
    const d = Math.hypot(p.x - f.ball.x, p.y - f.ball.y)
    if (d < bd) { bd = d; best = p }
  }
  if (!best) return null
  return { cx: px(best.x), cy: px(best.y), r: 34 + (heroEvent.value.magnitude || 0) * 7 }
})

/** 空位区域 */
const spaceZones = computed(() => {
  if (!S.overlayOn || focusType.value !== 'SPACE_OPEN') return []
  const f = frame.value
  if (!f) return []
  const out = []
  for (const p of f.players) {
    if (p.team !== 'off') continue
    let nd = 999
    for (const q of f.players) {
      if (q.team !== 'def') continue
      nd = Math.min(nd, Math.hypot(p.x - q.x, p.y - q.y))
    }
    if (nd > 6) out.push({ cx: px(p.x), cy: px(p.y), r: Math.min(96, 16 + nd * 8) })
  }
  return out
})

const clockText = computed(() => {
  const ms = Math.max(0, durationMs.value - S.t)
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`
})

const engineText = computed(() => {
  if (!S.analysis) return 'SAMPLE TRACKING'
  const m = S.engine?.mode
  if (m === 'yolo') return 'AI DETECT · YOLOv8n'
  if (m === 'fallback') return 'NCC TRACKING'
  return 'SAMPLE TRACKING'
})

const heroEventCode = computed(() => {
  const t = heroEvent.value?.type
  if (!t) return ''
  return t === 'SPACE_OPEN' ? 'SPACE' : t === 'DEF_COLLAPSE' ? 'DEFENSIVE COLLAPSE' : t
})

/** 战术台与因素图联动：点击事件条/叠加层，选中对应因素（再次点击取消） */
function pickFactor(type) {
  const list = S.analysis?.factors || []
  const ev = heroEvent.value
  let f = null
  if (ev) f = list.find(x => x.type === type && Math.abs(x.t - ev.t) < 1500) || null
  if (!f) f = list.find(x => x.type === type) || null
  if (f) selectFactor(f.id)
}
/** 焦点落到传球/出手/突破时，强调球轨迹 */
const ballFocus = computed(() => ['PASS', 'SHOT', 'DRIVE'].includes(focusType.value))
</script>

<template>
  <div class="vb-stage">
    <div class="vb-stage__floor vb-floor"></div>

    <svg class="vb-stage__center" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet"
         width="100%" height="100%">
      <defs>
        <linearGradient id="vbWood" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stop-color="#EFD9AE" />
          <stop offset=".45" stop-color="#E6C795" />
          <stop offset="1" stop-color="#D8B57E" />
        </linearGradient>
        <pattern id="vbGrain" width="26" height="18" patternUnits="userSpaceOnUse">
          <line x1="25.5" y1="0" x2="25.5" y2="18" stroke="rgba(150,110,58,.16)" stroke-width="1" />
        </pattern>
        <radialGradient id="vbGlow" cx="50%" cy="46%" r="62%">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22" />
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 木地板 -->
      <rect x="0" y="0" :width="W" :height="H" fill="url(#vbWood)" />
      <rect x="0" y="0" :width="W" :height="H" fill="url(#vbGrain)" />
      <g stroke="rgba(146,106,54,.12)" stroke-width="1">
        <line v-for="y in [100, 200, 300, 400]" :key="`seam${y}`" x1="0" :y1="y" :x2="W" :y2="y" />
      </g>
      <rect x="0" y="0" :width="W" :height="H" fill="url(#vbGlow)" />

      <!-- 蓝色油漆区 -->
      <g fill="#1E63B0">
        <rect x="0" y="170" width="190" height="160" />
        <rect x="750" y="170" width="190" height="160" />
      </g>

      <!-- 中圈队徽 -->
      <g>
        <circle cx="470" cy="250" r="104" fill="#0C2340" />
        <circle cx="470" cy="250" r="104" fill="none" stroke="#EAD9B4" stroke-width="2" stroke-opacity=".5" />
        <circle cx="470" cy="250" r="66" fill="#F4EFE4" />
        <g stroke="#0C2340" stroke-width="2.2" fill="none" stroke-opacity=".85">
          <path d="M 404 250 H 536" />
          <path d="M 470 184 V 316" />
          <path d="M 424 202 A 66 66 0 0 0 424 298" />
          <path d="M 516 202 A 66 66 0 0 1 516 298" />
        </g>
        <circle cx="470" cy="250" r="66" fill="none" stroke="#0C2340" stroke-width="2.2" />
      </g>

      <!-- 场地线 -->
      <g fill="none" stroke="#16243F" stroke-width="2.4" stroke-opacity=".9" stroke-linejoin="round">
        <rect x="1.5" y="1.5" :width="W - 3" :height="H - 3" />
        <line x1="470" y1="0" x2="470" :y2="H" />
        <circle cx="470" cy="250" r="60" stroke="#EAD9B4" stroke-opacity=".9" />
        <rect x="0" y="170" width="190" height="160" />
        <rect x="750" y="170" width="190" height="160" />
        <circle cx="190" cy="250" r="60" />
        <circle cx="750" cy="250" r="60" />
        <path d="M 0 30 L 142 30 A 237.5 237.5 0 0 1 142 470 L 0 470" />
        <path :d="`M ${W} 30 L ${W - 142} 30 A 237.5 237.5 0 0 0 ${W - 142} 470 L ${W} 470`" />
        <line x1="40" y1="220" x2="40" y2="280" />
        <line x1="900" y1="220" x2="900" y2="280" />
        <circle cx="52.5" cy="250" r="9" />
        <circle cx="887.5" cy="250" r="9" />
        <path d="M 52.5 214 A 36 36 0 0 1 52.5 286" />
        <path d="M 887.5 214 A 36 36 0 0 0 887.5 286" />
      </g>

      <text x="470" y="470" text-anchor="middle" font-family="JetBrains Mono, monospace"
            font-size="14" letter-spacing="7" fill="#16243F" fill-opacity=".32">TACTICAL BOARD</text>

      <!-- 战术叠加层（与因素图联动：点击可选中对应因素） -->
      <g v-if="S.overlayOn">
        <g v-for="(z, i) in spaceZones" :key="`sp${i}`" class="vb-hit"
           :class="{ 'is-focus': activeFactor?.type === 'SPACE_OPEN' }"
           @click.stop="pickFactor('SPACE_OPEN')">
          <circle :cx="z.cx" :cy="z.cy" :r="z.r" fill="rgba(30,158,110,.14)" stroke="#12855C" stroke-width="1.6" stroke-dasharray="5 5" />
        </g>
        <circle v-if="collapseRing" :cx="collapseRing.cx" :cy="collapseRing.cy" :r="collapseRing.r"
                fill="rgba(232,89,12,.12)" stroke="#E8590C" stroke-width="1.8" stroke-dasharray="7 6"
                class="bc-dash-run vb-hit" :class="{ 'is-focus': activeFactor?.type === 'DEF_COLLAPSE' }"
                @click.stop="pickFactor('DEF_COLLAPSE')" />
        <g v-if="driveArrow" class="vb-hit" :class="{ 'is-focus': activeFactor?.type === 'DRIVE' }" @click.stop="pickFactor('DRIVE')">
          <line :x1="driveArrow.from[0]" :y1="driveArrow.from[1]" :x2="driveArrow.to[0]" :y2="driveArrow.to[1]"
                stroke="#E8590C" stroke-width="2.6" stroke-dasharray="9 6" class="bc-dash-run" />
          <polygon :points="`${driveArrow.to[0]},${driveArrow.to[1]} ${driveArrow.to[0]-18},${driveArrow.to[1]-9} ${driveArrow.to[0]-18},${driveArrow.to[1]+9}`" fill="#E8590C" />
        </g>
      </g>

      <!-- 球员轨迹拖尾（平滑 · 队伍配色：进攻=独行侠蓝 / 防守=火箭红） -->
      <g fill="none" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
        <path v-for="p in (frame?.players || [])" :key="`tr${p.id}`"
              :d="trailOf(p.id)"
              :stroke="p.team === 'off' ? 'rgba(11,111,209,.55)' : 'rgba(206,17,65,.6)'"
              :stroke-dasharray="p.team === 'off' ? '0' : '5 5'" />
      </g>

      <!-- 球轨迹（平滑 · 焦点在传/投/突时高亮） -->
      <path v-if="S.overlayOn" :d="ballTrail" fill="none" stroke="#F9530C" stroke-width="2.4"
            :stroke-opacity="ballFocus ? 1 : .85" :class="{ 'bc-dash-run': ballFocus }" stroke-linecap="round" />

      <!-- 球员节点：球衣号 + 可点击（进攻=独行侠蓝 / 防守=火箭红） -->
      <g v-for="p in (frame?.players || [])" :key="p.id" class="vb-node"
         :class="{ 'is-sel': S.selectedPlayer === p.id }" @click.stop="selectPlayer(p.id)">
        <circle v-if="S.selectedPlayer === p.id" :cx="px(p.x)" :cy="px(p.y)" r="29"
                fill="none" stroke="#39C2D7" stroke-width="2.8" />
        <circle v-if="isHandler(p)" :cx="px(p.x)" :cy="px(p.y)" r="24"
                fill="none" stroke="#F5C518" stroke-width="2" stroke-opacity=".95" />
        <circle :cx="px(p.x)" :cy="px(p.y)" r="18"
                :fill="p.team === 'off' ? '#0B6FD1' : '#CE1141'"
                stroke="#FFFFFF" stroke-width="2.6" />
        <text :x="px(p.x)" :y="px(p.y) + 5.9" text-anchor="middle"
              font-family="JetBrains Mono, monospace" font-size="16" font-weight="800"
              fill="#FFFFFF">{{ p.num }}</text>
      </g>

      <!-- 球（与两队球衣颜色区分：信号橙） -->
      <g v-if="frame">
        <circle :cx="px(frame.ball.x)" :cy="px(frame.ball.y)" r="8" fill="#F9530C" stroke="#FFFFFF" stroke-width="1.8" />
        <circle :cx="px(frame.ball.x)" :cy="px(frame.ball.y)" :r="13 + frame.ball.z * 0.5" fill="none" stroke="#F9530C" stroke-width="1" stroke-opacity=".55" />
      </g>
    </svg>

    <!-- HUD -->
    <div class="vb-stage__hud">
      <span class="vb-clock">{{ clockText }}</span>
      <span v-if="activeFactor" class="vb-tag vb-tag--link" @click="selectFactor(activeFactor.id)">
        联动 · {{ activeFactor.title }} <i>×</i>
      </span>
      <span class="vb-tag vb-tag--live"><i class="bc-live-dot"></i>{{ engineText }}</span>
    </div>

    <!-- 标注工具栏（预留） -->
    <div class="vb-stage__annot">
      <span class="vb-annot__label">标注工具 · 预留</span>
      <button class="bc-btn bc-btn--ghost bc-btn--sm" disabled>标定</button>
      <button class="bc-btn bc-btn--ghost bc-btn--sm" disabled>锚点</button>
      <button class="bc-btn bc-btn--ghost bc-btn--sm" disabled>图层</button>
    </div>

    <div class="vb-stage__legend">
      <span class="vb-legend"><i class="d-off"></i>进攻</span>
      <span class="vb-legend"><i class="d-def"></i>防守</span>
      <span class="vb-legend"><i class="d-space"></i>空间</span>
    </div>

    <div v-if="heroEvent" class="vb-stage__event vb-hit" :key="heroEvent.id" @click="pickFactor(heroEvent.type)"
         :class="{ 'is-linked': activeFactor?.type === heroEvent.type }">
      <b>{{ heroEventCode }}</b>
      <span>{{ heroEvent.label }} · {{ heroEvent.magnitude?.toFixed ? heroEvent.magnitude.toFixed(1) : heroEvent.magnitude }}{{ heroFactor?.unit || '' }}</span>
      <em class="vb-stage__event-hint">联动因素 ›</em>
    </div>

    <!-- 球员明细卡 -->
    <div v-if="sel" class="vb-player-card" :data-team="sel.team">
      <div class="vb-player-card__head">
        <span class="vb-player-card__num" :data-team="sel.team">{{ sel.num }}</span>
        <div class="vb-player-card__who">
          <b>{{ sel.team === 'off' ? '进攻方' : '防守方' }}</b>
          <small>球衣号 #{{ sel.num }}</small>
        </div>
        <button class="vb-player-card__x" title="关闭" @click.stop="clearPlayer()">×</button>
      </div>
      <div class="vb-player-card__grid">
        <div><span>跑动距离</span><b>{{ sel.dist }}<em>m</em></b></div>
        <div><span>最高速度</span><b>{{ sel.maxSpeed }}<em>m/s</em></b></div>
        <div><span>平均速度</span><b>{{ sel.avgSpeed }}<em>m/s</em></b></div>
        <div><span>参与事件</span><b>{{ sel.events.length }}<em>次</em></b></div>
      </div>
      <div v-if="sel.events.length" class="vb-player-card__evs">
        <span v-for="e in sel.events" :key="e.id" :data-kind="e.type">{{ e.label }} @{{ (e.t / 1000).toFixed(1) }}s</span>
      </div>
      <div v-else class="vb-player-card__evs vb-player-card__evs--empty">本回合暂无关键事件</div>
    </div>
  </div>
</template>
