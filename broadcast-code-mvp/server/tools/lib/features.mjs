// 特征测量与 importance —— dataset-contract §2.4 / §3 公式逐字实现
// 全部从生成轨迹实测（distFt/defDistFt/n0/n1/移动距离/失位），不是编的值（§4.3 阶段 D）
import { clamp, clamp01, round1, round3, round100 } from './prng.mjs';

// §2.4 Features 七项
export function measureFeatures(ctx) {
  const {
    frames, tracks, hoop, shooterId, shooterStar, offenseSide,
    shotT0, receiveT, passCount, tacticStartMs,
    defSim, defIdByKey, offIdBySlot, primaryHandlerSlot,
    clockSec, scoreBefore,
  } = ctx;

  const shotFrame = frames[shotT0 / 100];
  const shooterAtShot = shotFrame.players.find((p) => p.id === shooterId);
  const defendersAtShot = shotFrame.players.filter((p) => p.team !== offenseSide);
  const distFt = round1(Math.hypot(hoop[0] - shooterAtShot.x, hoop[1] - shooterAtShot.y));
  const defDistFt = Math.min(...defendersAtShot.map((d) => Math.hypot(d.x - shooterAtShot.x, d.y - shooterAtShot.y)));

  // shotDifficulty = clamp01(0.55·dShot + 0.45·dDef)
  const dShot = clamp01((distFt - 2) / 26);
  const dDef = 1 - clamp01(defDistFt / 8);
  const shotDifficulty = round3(clamp01(0.55 * dShot + 0.45 * dDef));

  // gravity：n0=2ft 内防守人数，n1=6ft 内
  const n1 = defendersAtShot.filter((d) => Math.hypot(d.x - shooterAtShot.x, d.y - shooterAtShot.y) <= 6).length;
  const n0 = defendersAtShot.filter((d) => Math.hypot(d.x - shooterAtShot.x, d.y - shooterAtShot.y) <= 2).length;
  const gravity = round3(clamp01(0.5 * n0 + 0.25 * (n1 - n0) + 0.5 * (shooterStar ? 1 : 0)));

  // clutchScore = clamp01(0.6·fClock + 0.4·fMargin)
  const fClock = clamp01((180 - clockSec) / 180);
  const margin = Math.abs(scoreBefore.home - scoreBefore.away);
  const fMargin = 1 - clamp01(margin / 12);
  const clutchScore = round3(clamp01(0.6 * fClock + 0.4 * fMargin));

  // spacingGain：接球时刻接球人（=射手）最近防守距离为半径的圆面积，上限 600
  const sgFrame = frames[receiveT / 100] ?? shotFrame;
  const receiver = sgFrame.players.find((p) => p.id === shooterId);
  const r = Math.min(
    ...sgFrame.players.filter((p) => p.team !== offenseSide).map((d) => Math.hypot(d.x - receiver.x, d.y - receiver.y)),
  );
  const spacingGain = round1(Math.min(Math.PI * r * r, 600));

  const defenseCollapseMs = measureCollapse(frames, defSim, defIdByKey, offIdBySlot, tacticStartMs);

  // offBallMovement：无球 4 人总移动距离 ÷ 120（从轨迹采样，噪声不计入）
  const offSlots = Object.keys(tracks).filter((s) => s !== primaryHandlerSlot);
  let totalDist = 0;
  for (const slot of offSlots) {
    for (let t = 100; t < frames.length * 100; t += 100) {
      const a = tracks[slot].at(t - 100);
      const b = tracks[slot].at(t);
      totalDist += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  const offBallMovement = round3(clamp01(totalDist / 120));

  return { shotDifficulty, gravity, clutchScore, spacingGain, defenseCollapseMs, offBallMovement, passCount };
}

// §4.3 失位判定：某防守人与责任对象距离 >6ft 且持续 ≥300ms → collapseMs = 失位时刻 − 战术发起时刻
function measureCollapse(frames, defSim, defIdByKey, offIdBySlot, tacticStartMs) {
  let first = null;
  for (const [defKey, arr] of Object.entries(defSim)) {
    const defId = defIdByKey[defKey];
    let streak = 0;
    for (let j = 0; j < frames.length; j++) {
      const defP = frames[j].players.find((p) => p.id === defId);
      const offP = frames[j].players.find((p) => p.id === offIdBySlot[arr[j].offSlot]);
      if (defP && offP && Math.hypot(defP.x - offP.x, defP.y - offP.y) > 6) {
        streak += 1;
        if (streak >= 3) {
          const t = (j - 2) * 100;
          if (first === null || t < first) first = t;
          break;
        }
      } else {
        streak = 0;
      }
    }
  }
  if (first === null) return 0;
  return clamp(0, round100(first - tacticStartMs), 5000);
}

// §3 importance 五维加权（子分 round3，total 由已取整子分求和后 round3——与 validator V10 重算口径一致）
export function computeImportance(features, rarity, shooterStar) {
  const breakdown = {
    clutch: round3(features.clutchScore),
    difficulty: round3(features.shotDifficulty),
    rarity: round3(rarity),
    momentum: round3(clamp01(0.5 * features.offBallMovement + 0.5 * clamp01(features.passCount / 6))),
    star: shooterStar ? 1.0 : 0.3,
  };
  const total = round3(
    0.3 * breakdown.clutch + 0.25 * breakdown.difficulty + 0.2 * breakdown.rarity
    + 0.15 * breakdown.momentum + 0.1 * breakdown.star,
  );
  return { total, breakdown };
}
