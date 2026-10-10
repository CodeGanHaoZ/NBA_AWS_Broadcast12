<script setup>
/**
 * 战术板 ×4（T1 实时跟随 / T2 跑位复盘 / T3 投篮时机拆解 / T4 引力场）
 * 逻辑照搬参考工程 app.js 的 renderBoardTabs / renderBoard / renderTimingBoard / renderBoardSide。
 * 球场底图与叠加层用 SVG 字符串注入，球员圆点交给 Vue 渲染以便点击选中（并有更大字号，便于手机上点）。
 */
import { computed, ref } from 'vue'
import {
  TRACKS, PLAYERS, M_BY_ID, POS, MATCHUP, RIM, ATK_TEAM, TEAM_COLOR, EV_LABEL,
  BOARDS, BV, bx, by, getPos, dist, clamp, courtPaths, bT, BS, selectPid,
} from '../../lib/broadcast/model.js'

const TRACKS_EVENTS = TRACKS.events
const stageEl = ref(null)

/* ---------------- T1 / T2 / T4：球场 + 叠加层 ---------------- */

/** HUD 角标：四角 L 形信号橙描边 */
function corners() {
  const s = 5, o = 2.2, col = 'rgba(249,83,12,.65)', w = 0.5
  const W = BV.w, H = BV.h
  return `<path d="M${o} ${o + s} L${o} ${o} L${o + s} ${o}" fill="none" stroke="${col}" stroke-width="${w}"></path>
    <path d="M${W - o - s} ${o} L${W - o} ${o} L${W - o} ${o + s}" fill="none" stroke="${col}" stroke-width="${w}"></path>
    <path d="M${W - o} ${H - o - s} L${W - o} ${H - o} L${W - o - s} ${H - o}" fill="none" stroke="${col}" stroke-width="${w}"></path>
    <path d="M${o + s} ${H - o} L${o} ${H - o} L${o} ${H - o - s}" fill="none" stroke="${col}" stroke-width="${w}"></path>`
}

/** 科技感淡网格（渐变透明底上的坐标参考） */
function techGrid() {
  const step = 10, out = []
  for (let x = step; x < BV.w; x += step) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${BV.h}" stroke="rgba(245,242,236,.045)" stroke-width="0.18"></line>`)
  for (let y = step; y < BV.h; y += step) out.push(`<line x1="0" y1="${y}" x2="${BV.w}" y2="${y}" stroke="rgba(245,242,236,.045)" stroke-width="0.18"></line>`)
  return out.join('')
}

function boardDefs() {
  return `<defs>
    <radialGradient id="bcBgGrad" cx="50%" cy="38%" r="80%">
      <stop offset="0%" stop-color="#0F2742" stop-opacity="0.95"></stop>
      <stop offset="60%" stop-color="#0A1C30" stop-opacity="0.55"></stop>
      <stop offset="100%" stop-color="#0A1C30" stop-opacity="0"></stop>
    </radialGradient>
    <linearGradient id="bcAreaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F9530C" stop-opacity="0.45"></stop>
      <stop offset="100%" stop-color="#F9530C" stop-opacity="0"></stop>
    </linearGradient>
  </defs>`
}

function courtBase() {
  const lines = courtPaths(bx, by)
    .map(l => `<path d="${l.d}" fill="none" stroke="${l.stroke}" stroke-width="${l.main ? 0.28 : 0.2}" stroke-linejoin="round"></path>`)
    .join('')
  return `${boardDefs()}
    <rect x="0" y="0" width="${BV.w}" height="${BV.h}" fill="url(#bcBgGrad)"></rect>
    ${techGrid()}${lines}${corners()}`
}

function extraMarkup(kind, t) {
  let extra = ''

  /* T2：选中球员的路径逐段生长 + 事件打点（轨迹源自视频检测） */
  if (kind === 'T2') {
    const pid = BS.selected
    const arr = POS[pid] || []
    const path = arr.filter(p => p.t <= t + 0.001)
    if (path.length) {
      const d = path.map((p, i) => `${i ? 'L' : 'M'}${bx(p.x).toFixed(2)} ${by(p.y).toFixed(2)}`).join(' ')
      extra += `<path d="${d}" fill="none" stroke="var(--bc-signal)" stroke-width="0.75" stroke-linecap="round"></path>`
      extra += path.map((p, i) => i % 4 === 0
        ? `<circle cx="${bx(p.x).toFixed(2)}" cy="${by(p.y).toFixed(2)}" r="0.55" fill="rgba(249,83,12,.55)"></circle>` : '').join('')
    }
    TRACKS_EVENTS.filter(e => e.actor === pid && e.t <= t).forEach(e => {
      const p = getPos(pid, e.t)
      if (!p) return
      extra += `<g><rect x="${(bx(p[0]) - 1.5).toFixed(2)}" y="${(by(p[1]) - 1.5).toFixed(2)}" width="3" height="3"
        fill="none" stroke="var(--bc-key-yellow)" stroke-width="0.4"></rect>
        <text x="${bx(p[0]).toFixed(2)}" y="${(by(p[1]) - 2.4).toFixed(2)}" text-anchor="middle"
        font-family="var(--bc-font-mono)" font-size="2" fill="var(--bc-key-yellow)">${EV_LABEL[e.type]}</text></g>`
    })
  }

  /* T4：引力场矢量（防守人实际位置 − 贴身理论位）+ 空档脉冲 */
  if (kind === 'T4') {
    Object.entries(MATCHUP).forEach(([defPid, offPid]) => {
      const d = getPos(defPid, t), o = getPos(offPid, t)
      if (!d || !o) return
      const toRim = [RIM[0] - o[0], RIM[1] - o[1]]
      const len = Math.hypot(toRim[0], toRim[1]) || 1
      const theo = [o[0] + (toRim[0] / len) * 1.2, o[1] + (toRim[1] / len) * 1.2]
      const gap = dist(d, theo)
      if (gap < 0.5) return
      const col = gap >= 2.0 ? 'var(--bc-signal)' : 'rgba(142,142,150,.75)'
      const ax = bx(theo[0]), ay = by(theo[1]), dx = bx(d[0]), dy = by(d[1])
      const ang = Math.atan2(dy - ay, dx - ax)
      const hs = 1.7
      extra += `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${dx.toFixed(2)}" y2="${dy.toFixed(2)}"
        stroke="${col}" stroke-width="${gap >= 2 ? 0.6 : 0.35}" stroke-dasharray="${gap >= 2 ? '' : '1 1'}"></line>
        <path d="M${dx.toFixed(2)} ${dy.toFixed(2)} L${(dx - hs * Math.cos(ang - 0.45)).toFixed(2)} ${(dy - hs * Math.sin(ang - 0.45)).toFixed(2)}
          L${(dx - hs * Math.cos(ang + 0.45)).toFixed(2)} ${(dy - hs * Math.sin(ang + 0.45)).toFixed(2)} Z" fill="${col}"></path>
        <circle cx="${ax.toFixed(2)}" cy="${ay.toFixed(2)}" r="0.7" fill="none" stroke="${col}" stroke-width="0.3"></circle>
        <text x="${((ax + dx) / 2).toFixed(2)}" y="${((ay + dy) / 2 - 0.6).toFixed(2)}" text-anchor="middle"
          font-family="var(--bc-font-mono)" font-size="1.7" fill="${col}">${gap.toFixed(1)}m</text>`
    })
    const sh = getPos('p10', t), df = getPos('p55', t)
    if (sh && df) {
      const gap = dist(sh, df)
      const r = gap * 6.56
      extra += `<circle cx="${bx(sh[0]).toFixed(2)}" cy="${by(sh[1]).toFixed(2)}" r="${r.toFixed(2)}"
        fill="rgba(249,83,12,.12)" stroke="rgba(249,83,12,.5)" stroke-width="0.3" stroke-dasharray="1.2 1"></circle>
        <text x="${bx(sh[0]).toFixed(2)}" y="${(by(sh[1]) + r + 2.4).toFixed(2)}" text-anchor="middle"
        font-family="var(--bc-font-mono)" font-size="1.9" fill="var(--bc-signal)">空档 ${gap.toFixed(2)}m</text>`
    }
  }

  return extra
}

/* ---------------- T3：投篮时机拆解（距离曲线） ---------------- */

function timingMarkup(t) {
  const shotT = 9.2, win = 3.4
  const t0 = shotT - win
  const samples = []
  for (let s = t0; s <= shotT + 0.4; s += 0.1) {
    const a = getPos('p10', s), b = getPos('p55', s)
    if (a && b) samples.push({ t: s, d: dist(a, b) })
  }
  if (!samples.length) return courtBase()

  const W = BV.w, H = BV.h
  const PAD = { l: 10, r: 6, t: 12, b: 14 }
  const minD = 0.5, maxD = 4.2
  const px = v => PAD.l + ((v - t0) / (win + 0.4)) * (W - PAD.l - PAD.r)
  const py = d => H - PAD.b - ((clamp(d, minD, maxD) - minD) / (maxD - minD)) * (H - PAD.t - PAD.b)

  const dPath = samples.map((s, i) => `${i ? 'L' : 'M'}${px(s.t).toFixed(2)} ${py(s.d).toFixed(2)}`).join(' ')
  const last = samples[samples.length - 1], first = samples[0]
  const area = `${dPath} L${px(last.t).toFixed(2)} ${H - PAD.b} L${px(first.t).toFixed(2)} ${H - PAD.b} Z`
  const thr = py(2.0)

  let grid = ''
  ;[1, 2, 3, 4].forEach(v => {
    grid += `<line x1="${PAD.l}" y1="${py(v).toFixed(2)}" x2="${W - PAD.r}" y2="${py(v).toFixed(2)}"
      stroke="rgba(245,242,236,.08)" stroke-width="0.25"></line>
      <text x="${PAD.l - 2}" y="${(py(v) + 0.8).toFixed(2)}" text-anchor="end"
      font-family="var(--bc-font-mono)" font-size="2.4" fill="var(--bc-muted)">${v}m</text>`
  })
  ;[1, 2, 3].forEach(s => {
    const vx = px(t0 + s)
    grid += `<line x1="${vx.toFixed(2)}" y1="${PAD.t}" x2="${vx.toFixed(2)}" y2="${H - PAD.b}" stroke="rgba(245,242,236,.05)" stroke-width="0.2"></line>`
  })

  const curT = clamp(t, t0, shotT + 0.4)
  const a0 = getPos('p10', curT), b0 = getPos('p55', curT)
  const curD = a0 && b0 ? dist(a0, b0) : 0

  return `${boardDefs()}
    <rect width="${W}" height="${H}" fill="url(#bcBgGrad)"></rect>
    ${grid}${corners()}
    <line x1="${PAD.l}" y1="${thr.toFixed(2)}" x2="${W - PAD.r}" y2="${thr.toFixed(2)}"
      stroke="var(--bc-key-yellow)" stroke-width="0.35" stroke-dasharray="1.4 1"></line>
    <rect x="${(W - PAD.r - 21).toFixed(2)}" y="${(thr - 4.4).toFixed(2)}" width="21" height="3.4"
      fill="rgba(11,11,12,.72)" stroke="rgba(250,200,60,.35)" stroke-width="0.15"></rect>
    <text x="${(W - PAD.r - 1.4).toFixed(2)}" y="${(thr - 1.9).toFixed(2)}" text-anchor="end"
      font-family="var(--bc-font-mono)" font-size="2.2" fill="var(--bc-key-yellow)">OPEN 阈值 2.0m</text>
    <path d="${area}" fill="url(#bcAreaGrad)"></path>
    <path d="${dPath}" fill="none" stroke="var(--bc-signal)" stroke-width="1.7" opacity="0.22" stroke-linecap="round"></path>
    <path d="${dPath}" fill="none" stroke="var(--bc-signal)" stroke-width="0.7" stroke-linecap="round"></path>
    ${samples.map(s => `<circle cx="${px(s.t).toFixed(2)}" cy="${py(s.d).toFixed(2)}" r="0.4" fill="var(--bc-signal)" opacity="0.7"></circle>`).join('')}
    <line x1="${px(shotT)}" y1="${PAD.t - 3}" x2="${px(shotT)}" y2="${H - PAD.b}" stroke="var(--bc-chalk)" stroke-width="0.4" stroke-dasharray="1 1"></line>
    <path d="M${px(shotT).toFixed(2)} ${(PAD.t - 4.3).toFixed(2)} l1.3 1.3 l-1.3 1.3 l-1.3 -1.3 Z" fill="var(--bc-chalk)"></path>
    <rect x="${(px(shotT) - 14).toFixed(2)}" y="${(PAD.t - 8.4).toFixed(2)}" width="28" height="3.6"
      fill="rgba(11,11,12,.72)" stroke="rgba(245,242,236,.25)" stroke-width="0.15"></rect>
    <text x="${px(shotT).toFixed(2)}" y="${(PAD.t - 5.6).toFixed(2)}" text-anchor="middle"
      font-family="var(--bc-font-mono)" font-size="2.3" fill="var(--bc-chalk)">SHOT 09.2s · xFG 0.52</text>
    <line x1="${px(curT)}" y1="${PAD.t}" x2="${px(curT)}" y2="${H - PAD.b}" stroke="var(--bc-key-cyan)" stroke-width="0.45"></line>
    <path d="M${px(curT).toFixed(2)} ${(PAD.t - 1.6).toFixed(2)} v3.2 M${(px(curT) - 1.6).toFixed(2)} ${PAD.t} h3.2"
      stroke="var(--bc-key-cyan)" stroke-width="0.3" fill="none"></path>
    <circle cx="${px(curT)}" cy="${py(curD)}" r="1.1" fill="var(--bc-key-cyan)"></circle>
    <circle cx="${px(curT)}" cy="${py(curD)}" r="2" fill="none" stroke="var(--bc-key-cyan)" stroke-width="0.3" opacity="0.55"></circle>
    <text x="${(px(curT) + 1.4).toFixed(2)}" y="${(py(curD) - 1.4).toFixed(2)}"
      font-family="var(--bc-font-mono)" font-size="2.6" fill="var(--bc-key-cyan)">${curD.toFixed(2)}m</text>
    <text x="${PAD.l}" y="${H - 3}" font-family="var(--bc-font-mono)" font-size="2.4" fill="var(--bc-muted)">出手前 3.4s 窗口 · 最近防守人距离</text>`
}

/* ---------------- 组装 ---------------- */

const isTiming = computed(() => BS.board === 'T3')

const markup = computed(() => {
  const t = bT.value
  if (BS.board === 'T3') return timingMarkup(t)
  return courtBase() + extraMarkup(BS.board, t)
})

/** 球员圆点（比参考工程放大：进攻 r3.2 / 防守 r2.9，号码 2.9） */
const dots = computed(() => {
  const t = bT.value
  return PLAYERS.map(p => {
    const pos = getPos(p.pid, t)
    if (!pos) return null
    const atk = p.team === ATK_TEAM
    return {
      pid: p.pid,
      num: p.number,
      cx: bx(pos[0]).toFixed(2),
      cy: by(pos[1]).toFixed(2),
      r: atk ? 3.2 : 2.9,
      fill: TEAM_COLOR[p.team],
      stroke: BS.selected === p.pid ? 'var(--bc-signal)' : 'rgba(245,242,236,.8)',
      sw: BS.selected === p.pid ? 0.85 : 0.4,
      numFill: '#F5F2EC',
    }
  }).filter(Boolean)
})

const ball = computed(() => {
  const pos = getPos('ball', bT.value)
  if (!pos) return null
  return { cx: bx(pos[0]).toFixed(2), cy: by(pos[1]).toFixed(2) }
})

const t3Side = computed(() => {
  const a = getPos('p10', 9.2), b = getPos('p55', 9.2)
  const open = a && b ? dist(a, b) : 0
  return [
    { k: '投篮质量 xFG', v: '0.52' },
    { k: '出手瞬间空档', v: open.toFixed(2), u: 'm' },
    { k: '引力贡献（#4）', v: '78' },
    { k: '判定', v: '高价值空位', hot: true },
  ]
})

const side = computed(() => {
  const m = M_BY_ID[BS.selected] || {}
  return [
    { k: '球员', v: `#${m.number} ${m.name}`, small: true },
    { k: '球队 / 位置', v: `${m.team} · ${m.role}`, small: true },
    { k: '引力', v: String(m.gravity ?? '—'), hot: true },
    { k: 'FG%', v: m.fg ? m.fg.pct.toFixed(1) : '—', u: '%' },
    { k: 'xFG 均值', v: m.xfgAvg ? m.xfgAvg.toFixed(2) : '—' },
    { k: 'Leverage', v: m.leverageTotal ? m.leverageTotal.toFixed(1) : '—' },
  ]
})

function fullscreen() {
  const el = stageEl.value
  if (!el) return
  if (document.fullscreenElement) document.exitFullscreen?.()
  else el.requestFullscreen?.()
}
</script>

<template>
  <section class="boards">
    <div class="tl-head" style="margin-bottom: 12px">
      <span class="slash"><i></i>TACTICAL BOARD</span>
      <h3>战术板</h3>
      <span class="hint">与主时钟同步 · 双击可全屏</span>
    </div>

    <div class="tabs" role="tablist">
      <button v-for="(v, k) in BOARDS" :key="k" role="tab"
              :aria-selected="BS.board === k" @click="BS.board = k">{{ v.name }}</button>
    </div>

    <div class="boards-grid">
      <div>
        <div class="board-stage" ref="stageEl" @dblclick="fullscreen()">
          <svg :viewBox="`0 0 ${BV.w} ${BV.h}`" role="img" :aria-label="BOARDS[BS.board].name">
            <g v-html="markup" :key="BS.board" class="vb-board-fade"></g>
            <g v-if="!isTiming">
              <g v-for="d in dots" :key="d.pid" style="cursor: pointer" @click="selectPid(d.pid)">
                <circle :cx="d.cx" :cy="d.cy" :r="d.r" :fill="d.fill" :stroke="d.stroke" :stroke-width="d.sw"></circle>
                <text :x="d.cx" :y="(+d.cy + 1.05).toFixed(2)" text-anchor="middle"
                      font-family="var(--bc-font-display)" font-size="2.9" :fill="d.numFill">{{ d.num }}</text>
              </g>
              <circle v-if="ball" :cx="ball.cx" :cy="ball.cy" r="1.4" fill="var(--bc-signal)"
                      stroke="var(--bc-chalk)" stroke-width="0.35"></circle>
            </g>
          </svg>
        </div>
        <div class="board-cap"><p>{{ BOARDS[BS.board].cap }}</p></div>
      </div>

      <aside class="board-side">
        <div class="panel" style="padding: 12px">
          <div class="panel-head">
            <h3>{{ isTiming ? '出手判定' : '当前选中' }}</h3>
            <span class="r">{{ isTiming ? 'EV_05' : BS.board }}</span>
          </div>
          <div v-for="row in (isTiming ? t3Side : side)" :key="row.k" class="kv">
            <span class="k">{{ row.k }}</span>
            <span class="v" :style="{ color: row.hot ? 'var(--bc-signal)' : null, fontSize: row.small ? '15px' : null }">
              {{ row.v }}<span v-if="row.u" class="u">{{ row.u }}</span>
            </span>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
