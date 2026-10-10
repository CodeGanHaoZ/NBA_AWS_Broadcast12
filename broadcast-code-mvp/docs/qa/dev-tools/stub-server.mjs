// 临时联调桩（仅前端自检用，交付前删除）——生成契约形状的演示数据
// 形状对齐 docs/api/openapi.yaml v1.0.1 + dataset-contract.md
import http from 'node:http'

const COURT = { widthFt: 94, heightFt: 50, viewBox: '0 0 940 500', leftHoop: [40, 250], rightHoop: [900, 250], threePtRadius: 237.5, cornerThreeInset: 30 }

const ROSTERS = {
  g001: {
    home: { teamId: 'dal', name: '达拉斯独行侠', abbr: 'DAL', color: '#CE1141', players: [
      { id: 'dal-77', name: 'Luka Doncic', number: 77, star: true },
      { id: 'dal-11', name: 'Kyrie Irving', number: 11, star: true },
      { id: 'dal-25', name: 'P.J. Washington', number: 25, star: false },
      { id: 'dal-21', name: 'Daniel Gafford', number: 21, star: false },
      { id: 'dal-31', name: 'Klay Thompson', number: 31, star: false } ] },
    away: { teamId: 'hou', name: '休斯顿火箭', abbr: 'HOU', color: '#00538C', players: [
      { id: 'hou-15', name: 'Alperen Sengun', number: 15, star: true },
      { id: 'hou-4', name: 'Jalen Green', number: 4, star: false },
      { id: 'hou-5', name: 'Fred VanVleet', number: 5, star: false },
      { id: 'hou-9', name: 'Dillon Brooks', number: 9, star: false },
      { id: 'hou-10', name: 'Jabari Smith Jr.', number: 10, star: false } ] }
  },
  g002: {
    home: { teamId: 'gsw', name: '金州勇士', abbr: 'GSW', color: '#1D428A', players: [
      { id: 'gsw-30', name: 'Stephen Curry', number: 30, star: true },
      { id: 'gsw-23', name: 'Draymond Green', number: 23, star: false },
      { id: 'gsw-22', name: 'Andrew Wiggins', number: 22, star: false },
      { id: 'gsw-8', name: 'Buddy Hield', number: 8, star: false },
      { id: 'gsw-32', name: 'Trayce Jackson-Davis', number: 32, star: false } ] },
    away: { teamId: 'lal', name: '洛杉矶湖人', abbr: 'LAL', color: '#552583', players: [
      { id: 'lal-23', name: 'LeBron James', number: 23, star: true },
      { id: 'lal-3', name: 'Anthony Davis', number: 3, star: true },
      { id: 'lal-15', name: 'Austin Reaves', number: 15, star: false },
      { id: 'lal-1', name: "D'Angelo Russell", number: 1, star: false },
      { id: 'lal-12', name: 'Taurean Prince', number: 12, star: false } ] }
  }
}

const PLAY_DEFS = [
  { idx: 0, label: '东契奇后撤步三分', tags: ['deep_three'], total: 0.91, tone: 'clutch' },
  { idx: 1, label: '加福德空接扣篮', tags: ['dunk', 'alley_oop'], total: 0.74, tone: 'excited' },
  { idx: 2, label: '汤普森绕掩护三分', tags: ['catch_shoot'], total: 0.62, tone: 'calm' },
  { idx: 3, label: '欧文挡拆突破上篮', tags: ['pick_roll'], total: 0.55, tone: 'calm' },
  { idx: 4, label: '华盛顿追身三分', tags: ['transition'], total: 0.49, tone: 'excited' },
  { idx: 5, label: '电梯门战术三分', tags: ['elevator'], total: 0.44, tone: 'calm' },
  { idx: 6, label: '东契奇压哨超远三分', tags: ['buzzer', 'clutch'], total: 0.98, tone: 'clutch' },
  { idx: 7, label: '东契奇急停中投反超', tags: ['pick_roll', 'clutch'], total: 0.83, tone: 'clutch' }
]

function mirror(gameId, x) { return gameId === 'g002' ? Math.round((94 - x) * 100) / 100 : x }

function makeFrames(gameId, seedIdx, durMs) {
  const frames = []
  const offIds = gameId === 'g001' ? ['dal-77', 'dal-11', 'dal-25', 'dal-21', 'dal-31'] : ['lal-23', 'lal-3', 'lal-15', 'lal-1', 'lal-12']
  const defIds = gameId === 'g001' ? ['hou-15', 'hou-4', 'hou-5', 'hou-9', 'hou-10'] : ['gsw-30', 'gsw-23', 'gsw-22', 'gsw-8', 'gsw-32']
  const roles = ['handler', 'cutter', 'screener', 'handler', 'cutter', 'defender', 'defender', 'defender', 'help', 'defender']
  const n = durMs / 100
  for (let i = 0; i < n; i++) {
    const t = i * 100
    const k = i / n
    const players = []
    const all = [...offIds.map(id => ({ id, team: 'home' })), ...defIds.map(id => ({ id, team: 'away' }))]
    all.forEach((p, j) => {
      const phase = seedIdx * 1.7 + j * 1.3
      // 进攻方整体向右（g002 镜像向左）推进
      const baseX = 30 + k * 45 + Math.sin(phase + k * 6) * (4 + j)
      const x = mirror(gameId, Math.max(2, Math.min(92, baseX + (j >= 5 ? 6 : 0))))
      const y = Math.max(2, Math.min(48, 25 + Math.cos(phase * 2 + k * 8) * (8 + j * 1.5) + (j >= 5 ? 3 : 0)))
      players.push({ id: p.id, team: p.team, x: Math.round(x * 100) / 100, y: Math.round(y * 100 / 100 * 100) / 100, role: roles[j] })
    })
    const handler = players[0]
    const zBase = k > 0.86 ? 3.2 + (k - 0.86) * 60 : 3.2 // 末段投篮抛物线
    frames.push({
      t,
      ball: { x: handler.x, y: handler.y, z: Math.round(Math.min(11.5, zBase) * 100) / 100 },
      players
    })
  }
  return frames
}

function makePlay(gameId, def, q) {
  const durMs = 12000
  const frames = makeFrames(gameId, def.idx, durMs)
  const mid = frames[Math.floor(frames.length * 0.45)]
  const late = frames[Math.floor(frames.length * 0.8)]
  const fin = frames[frames.length - 1]
  const shooter = gameId === 'g001' ? 'dal-77' : 'lal-23'
  const overlays = [
    { type: 'zone', t0: 0, t1: 2400, points: [[55, 10], [80, 10], [80, 40], [55, 40]].map(p => [mirror(gameId, p[0]), p[1]]), opacity: 0.15, label: '拉开空间' },
    { type: 'ring', t0: 1200, t1: 3000, playerId: gameId === 'g001' ? 'dal-21' : 'lal-3', r: 2.2, label: '掩护' },
    { type: 'arrow', t0: 3200, t1: 5400, from: [mid.players[1].x, mid.players[1].y], to: [late.players[1].x, late.players[1].y], style: 'dashed' },
    { type: 'arrow', t0: 5600, t1: 7400, from: [mid.players[0].x, mid.players[0].y], to: [late.players[0].x, late.players[0].y], style: 'solid' },
    { type: 'ring', t0: 8600, t1: 10800, playerId: shooter, r: 2.6, label: def.tags.includes('deep_three') ? '27.8 ft' : '终结' }
  ]
  const tone3 = def.tone
  const narration = [
    { t0: 0, t1: 2900, tone: 'calm', text: `Q${q} 关键回合，${gameId === 'g001' ? '独行侠' : '湖人'}进攻，东契奇持球组织。`, highlights: ['东契奇'] },
    { t0: 1200, t1: 4400, tone: 'calm', text: '队友上来掩护，【挡拆】后防守开始收缩。', highlights: ['挡拆'] },
    { t0: 5600, t1: 8400, tone: 'excited', text: '球分到弱侧，防线被撕开，【空档】出现了。', highlights: ['空档'] },
    { t0: 8600, t1: 11800, tone: tone3, text: def.tags.includes('buzzer') ? '压哨！超远三分出手——球进灯亮！' : '迎着防守果断出手——【命中】！这一球价值千金。', highlights: ['命中'] }
  ]
  const bd = { clutch: def.tone === 'clutch' ? 0.92 : 0.4, difficulty: 0.61, rarity: def.tags.includes('buzzer') ? 1.0 : 0.6, momentum: 0.44, star: 1.0 }
  return {
    id: `p00${def.idx + 1}`,
    quarter: q,
    clock: q === 3 ? '02:41.0' : '00:32.4',
    label: def.label,
    tags: def.tags,
    importance: { total: def.total, breakdown: bd },
    durationMs: durMs,
    scoreBefore: { home: 78, away: 76 },
    actors: { shooter, defender: gameId === 'g001' ? 'hou-9' : 'gsw-23', assister: null, screener: gameId === 'g001' ? 'dal-21' : 'lal-3' },
    features: { shotDifficulty: 0.61, gravity: 0.78, clutchScore: bd.clutch, spacingGain: 213.6, defenseCollapseMs: 1200, offBallMovement: 0.52, passCount: 3 },
    frames, overlays, narration,
    video: { available: false, src: null, offsetMs: 0 }
  }
}

const GAMES = ['g001', 'g002'].map(id => ({
  id,
  label: id === 'g001' ? '火箭 vs 独行侠 · 第三节' : '湖人 vs 勇士 · 第四节',
  date: id === 'g001' ? '2025-01-16' : '2025-01-25',
  venue: id === 'g001' ? 'American Airlines Center' : 'Chase Center',
  home: ROSTERS[id].home,
  away: ROSTERS[id].away,
  quarters: [{ q: 1, home: 28, away: 24 }, { q: 2, home: 26, away: 27 }, { q: 3, home: 24, away: 25 }],
  score: { home: 102, away: 104 },
  court: COURT,
  plays: PLAY_DEFS.map(d => makePlay(id, d, id === 'g001' ? 3 : 4))
}))

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const parts = u.pathname.split('/').filter(Boolean)
  if (u.pathname === '/health') return send(res, 200, { status: 'ok', games: GAMES.length })
  if (u.pathname === '/api/v1/games')
    return send(res, 200, { code: 0, data: GAMES.map(g => ({ id: g.id, label: g.label, date: g.date, home: { abbr: g.home.abbr, name: g.home.name }, away: { abbr: g.away.abbr, name: g.away.name }, possessionCount: g.plays.length })), message: '' })
  if (parts[0] === 'api' && parts[3] === 'meta' && parts[4] === 'flags')
    return send(res, 200, { code: 0, data: { video: false, tts: true }, message: '' })
  if (parts[2] === 'games' && parts[3]) {
    const g = GAMES.find(x => x.id === parts[3])
    if (!g) return send(res, 404, { code: 1002, data: null, message: 'game not found' })
    if (parts.length === 4) return send(res, 200, { code: 0, data: { ...g, plays: undefined }, message: '' })
    if (parts[4] === 'plays' && !parts[5]) {
      const top = u.searchParams.get('top')
      if (top !== null && !/^\d+$/.test(top)) return send(res, 400, { code: 1001, data: null, message: 'top must be integer' })
      const n = Math.min(Number(top || 10), 50)
      const list = [...g.plays].sort((a, b) => b.importance.total - a.importance.total).slice(0, n)
        .map(p => ({ id: p.id, quarter: p.quarter, clock: p.clock, label: p.label, tags: p.tags, importance: p.importance, durationMs: p.durationMs }))
      return send(res, 200, { code: 0, data: list, message: '' })
    }
    if (parts[4] === 'plays' && parts[5]) {
      const p = g.plays.find(x => x.id === parts[5])
      if (!p) return send(res, 404, { code: 1002, data: null, message: 'play not found' })
      return send(res, 200, { code: 0, data: p, message: '' })
    }
  }
  return send(res, 404, { code: 1002, data: null, message: 'not found' })
}).listen(3000, () => console.log('stub api on :3000'))
