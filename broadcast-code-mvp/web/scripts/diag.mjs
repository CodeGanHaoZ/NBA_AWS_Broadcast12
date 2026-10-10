import { analyzeSynthetic } from '../src/lib/vision/pipeline.js'

const r = analyzeSynthetic()
const speeds = []
for (const f of r.frames) for (const p of f.players) speeds.push(p.speed || 0)

const trackMax = Object.values(r.tracks.byId).map(t => t.maxSpeed || 0)
console.log('frames           :', r.frames.length)
console.log('max player speed :', Math.max(...speeds).toFixed(3), 'm/s')
console.log('max track speed  :', Math.max(...trackMax).toFixed(3), 'm/s')
console.log('events           :', r.events.map(e => `${e.type}@${e.t}`).join(' | ') || '(none)')
console.log('possessions      :', r.possessions.length)
console.log('factors          :', r.factors.map(f => `${f.title}${f.value}${f.unit}`).join(' | '))
console.log('evidence count   :', r.evidence.length)
const spd = r.evidence.find(e => String(e.label).includes('最高'))
console.log('evidence 最高速度:', spd ? `${spd.value} ${spd.unit}` : 'n/a')
const cnt = r.evidence.filter(e => String(e.label).includes('突破') || String(e.label).includes('传球'))
console.log('evidence 突破/传球:', cnt.map(e => `${e.label}=${e.value}`).join(', '))

// 突破窗口内的逐帧速度（1500-2700ms）
const win = r.frames.filter(f => f.t >= 1400 && f.t <= 2800)
console.log('breakout window speeds:',
  win.map(f => `${f.t}:${(f.players.find(p => p.num === 1 && p.team === 'off')?.speed || 0).toFixed(2)}`).join(' '))
