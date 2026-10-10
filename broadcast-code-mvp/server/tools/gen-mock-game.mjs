// Mock 深度数据集生成器 —— dataset-contract §4 行为规格
// CLI：node tools/gen-mock-game.mjs --game g001 [--seed 20261010] [--out path] | --all
// 退出码：0 成功；1 参数非法；2 生成结果未过自检（§6 校验全量跑一遍，不过则不写盘）
// PRNG 消费顺序（§4.2-3，改动即破坏确定性）：① 时长抖动 → ② 路径控制点 → ③ 防守反应 → ④ 噪声（帧序×球员序）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, round1, round2 } from './lib/prng.mjs';
import { GAME_DEFS, COURT } from './lib/rosters.mjs';
import { ARCHETYPES } from './lib/archetypes.mjs';
import { simulateDefense, buildBallTimeline, buildFrames } from './lib/simulate.mjs';
import { measureFeatures, computeImportance } from './lib/features.mjs';
import { narrate } from '../src/narration/narration.service.js';
import { validateGame, reportValidation } from '../src/shared/dataset-validator.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SEED = 20261010; // CI 与本地必须使用同一默认（§4.1）

function parseArgs(argv) {
  const args = { seed: DEFAULT_SEED, game: null, all: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--game') args.game = argv[++i];
    else if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--out') args.out = argv[++i];
    else return null;
  }
  if (!args.all && !args.game) return null;
  if (args.all && (args.game || args.out)) return null;
  if (!Number.isInteger(args.seed)) return null;
  return args;
}

function fmtClock(sec) {
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, '0')}:${ss.toFixed(1).padStart(4, '0')}`;
}

function buildOverlay(spec, plan, features, distFt, D) {
  const t1 = Math.min(spec.t + spec.window, D);
  const label = spec.label
    ?.replace('{dist}', distFt.toFixed(1))
    .replace('{sg}', String(Math.round(features.spacingGain)));
  if (spec.type === 'arrow') {
    return { type: 'arrow', t0: spec.t, t1, from: [round2(spec.from[0]), round2(spec.from[1])], to: [round2(spec.to[0]), round2(spec.to[1])], style: spec.style };
  }
  if (spec.type === 'ring') {
    return { type: 'ring', t0: spec.t, t1, playerId: plan.slotPlayers[spec.slot].id, r: spec.r, label };
  }
  return { type: 'zone', t0: spec.t, t1, points: spec.points.map(([x, y]) => [round2(x), round2(y)]), opacity: spec.opacity, label };
}

// 单回合生成（阶段 A–E）
function buildPlay(gameDef, gameIndex, playIndex, seed) {
  const entry = gameDef.script[playIndex];
  const meta = ARCHETYPES[entry.archetype];
  const prng = mulberry32(seed + gameIndex * 1000 + playIndex); // §4.2-2 种子派生
  // ① 时长抖动
  const [dMin, dMax] = meta.durationRange;
  const D = dMin + Math.floor(prng() * ((dMax - dMin) / 100 + 1)) * 100;
  // 阶段 A：演员指派（剧本锁定 shooter；其余按 roster 序确定）
  const offenseSide = gameDef.home.players.some((p) => p.id === entry.shooter) ? 'home' : 'away';
  const defenseSide = offenseSide === 'home' ? 'away' : 'home';
  const offensePlayers = gameDef[offenseSide].players;
  const defensePlayers = gameDef[defenseSide].players;
  const byId = (id) => offensePlayers.find((p) => p.id === id);
  const S = byId(entry.shooter);
  const H = entry.assister ? byId(entry.assister) : S;
  const C = entry.screener ? byId(entry.screener) : null;
  const others = offensePlayers.filter((p) => p.id !== S.id && p.id !== H.id);
  // ② 路径控制点（choreo 内每段贝塞尔 4 次抽取）
  const jit = () => prng() * 4 - 2; // ±2.0ft 均匀
  const T = (frac) => Math.round((frac * D) / 100) * 100;
  const plan = meta.choreo({ D, T, jit, actors: { S, H, C, others }, result: entry.result });
  // 防守对位：script.defender 盯射手，其余按 roster 序配对
  const guardedBy = { [entry.defender]: S.id };
  const restOff = offensePlayers.filter((p) => p.id !== S.id).map((p) => p.id);
  defensePlayers.filter((p) => p.id !== entry.defender).forEach((dp, i) => { guardedBy[dp.id] = restOff[i]; });
  const slotOfPlayer = {};
  for (const [slot, p] of Object.entries(plan.slotPlayers)) slotOfPlayer[p.id] = slot;
  const defenseSlots = defensePlayers.map((_, i) => `d${i}`);
  const defAssignments = defensePlayers.map((dp) => slotOfPlayer[guardedBy[dp.id]]);
  const gravity = plan.gravity
    ? { holderSlot: plan.gravity.holderSlot, fromMs: plan.gravity.fromMs, helpDefKey: defenseSlots[defAssignments.indexOf(plan.gravity.helpSlot)] }
    : null;
  // ③ 防守反应 jitter（5 名防守人各 1 次，[0,100)ms 附加延迟）
  const delayJitters = defenseSlots.map(() => prng() * 100);
  // 阶段 C：轨迹积分（防守跟随 + 球权事件）
  const defSim = simulateDefense(
    { D, tracks: plan.tracks, defenseSlots, defAssignments, switches: plan.switches, helps: plan.helps, gravity },
    delayJitters,
  );
  const ballTimeline = buildBallTimeline(plan.ballSegs, plan.tracks);
  // ④ 噪声序列（帧序 × 球员序）
  const frames = buildFrames(
    { D, tracks: plan.tracks, slotPlayers: plan.slotPlayers, defensePlayers, offenseSide },
    defSim, ballTimeline, prng, round2,
  );
  // 阶段 D：features 与 importance（全部实测）
  const shotSeg = plan.ballSegs.find((s) => s.kind === 'shot');
  const receives = ballTimeline.filter((s) => s.kind === 'pass' && s.t1 <= shotSeg.t0).map((s) => s.t1);
  const receiveT = receives.length ? Math.max(...receives) : shotSeg.t0;
  const defIdByKey = Object.fromEntries(defenseSlots.map((k, i) => [k, defensePlayers[i].id]));
  const offIdBySlot = Object.fromEntries(Object.entries(plan.slotPlayers).map(([s, p]) => [s, p.id]));
  const features = measureFeatures({
    frames, tracks: plan.tracks, hoop: [90, 25], shooterId: S.id, shooterStar: S.star, offenseSide,
    shotT0: shotSeg.t0, receiveT, passCount: ballTimeline.filter((s) => s.kind === 'pass').length,
    tacticStartMs: plan.tacticStartMs, defSim, defIdByKey, offIdBySlot,
    primaryHandlerSlot: plan.primaryHandlerSlot, clockSec: entry.clockSec, scoreBefore: entry.scoreBefore,
  });
  const importance = computeImportance(features, meta.rarity, S.star);
  // 阶段 E：overlays 派生（t0 = 事件时刻，三向同源）
  const shooterAtShot = frames[shotSeg.t0 / 100].players.find((p) => p.id === S.id);
  const distFt = round1(Math.hypot(90 - shooterAtShot.x, 25 - shooterAtShot.y));
  const overlays = plan.overlaySpecs.map((spec) => buildOverlay(spec, plan, features, distFt, D));

  return {
    id: 'p000', quarter: gameDef.quarter, clock: fmtClock(entry.clockSec), label: entry.label,
    tags: [...meta.tags], archetype: entry.archetype, result: entry.result,
    possession: { offense: offenseSide, hoop: [90.0, 25.0] },
    scoreBefore: entry.scoreBefore,
    actors: { shooter: S.id, defender: entry.defender ?? null, assister: entry.assister ?? null, screener: entry.screener ?? null },
    features, importance, durationMs: D, frames, overlays, narration: [],
    video: { available: false, src: null, offsetMs: 0 },
  };
}

// g002：x 镜像（§1：x' = 94 − x，再 round2），验证前端镜像渲染
function mirrorPlay(play) {
  play.possession.hoop = [4.0, 25.0];
  for (const f of play.frames) {
    f.ball.x = round2(94 - f.ball.x);
    for (const p of f.players) p.x = round2(94 - p.x);
  }
  for (const o of play.overlays) {
    if (o.from) o.from = [round2(94 - o.from[0]), o.from[1]];
    if (o.to) o.to = [round2(94 - o.to[0]), o.to[1]];
    if (o.points) o.points = o.points.map(([x, y]) => [round2(94 - x), y]);
  }
}

function buildGame(gameDef, gameIndex, seed) {
  const plays = gameDef.script.map((_, i) => buildPlay(gameDef, gameIndex, i, seed));
  if (gameDef.mirror) plays.forEach(mirrorPlay);
  // narration：与 overlays 同源派生（narration-rules.md）
  const gameShell = { home: gameDef.home, away: gameDef.away };
  for (const play of plays) play.narration = narrate(play, gameShell);
  // 按 importance.total 降序重排入库并重编号（§2.1/§2.3），并列按 playIndex 稳定
  const sorted = plays
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.importance.total - a.p.importance.total || a.i - b.i);
  sorted.forEach(({ p }, idx) => { p.id = `p${String(idx + 1).padStart(3, '0')}`; });
  const score = gameDef.quarters.reduce(
    (acc, q) => ({ home: acc.home + q.home, away: acc.away + q.away }),
    { home: 0, away: 0 },
  );
  return {
    id: gameDef.id, label: gameDef.label, date: gameDef.date, venue: gameDef.venue,
    home: gameDef.home, away: gameDef.away, quarters: gameDef.quarters, score,
    court: COURT, plays: sorted.map((x) => x.p),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error('usage: node tools/gen-mock-game.mjs (--game g001 [--out path] | --all) [--seed 20261010]');
    process.exit(1);
  }
  const targets = args.all ? GAME_DEFS : GAME_DEFS.filter((g) => g.id === args.game);
  if (targets.length === 0) {
    console.error(`unknown game: ${args.game}`);
    process.exit(1);
  }
  for (const gameDef of targets) {
    const gameIndex = GAME_DEFS.indexOf(gameDef);
    const outPath = args.out ?? path.join(SERVER_ROOT, 'data', 'games', `${gameDef.id}.json`);
    const game = buildGame(gameDef, gameIndex, args.seed);
    // 自检：§6 校验全量跑一遍，不过则不写盘（退出码 2）
    const errors = validateGame(game, outPath);
    if (errors.length > 0) {
      reportValidation(errors);
      console.error(`[gen] ${gameDef.id} self-check failed with ${errors.length} error(s), not written`);
      process.exit(2);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const json = JSON.stringify(game);
    fs.writeFileSync(outPath, json);
    console.log(`[gen] ${gameDef.id} written: ${outPath} (${(json.length / 1024).toFixed(0)}KB, ${game.plays.length} plays, seed=${args.seed})`);
  }
}

main();
