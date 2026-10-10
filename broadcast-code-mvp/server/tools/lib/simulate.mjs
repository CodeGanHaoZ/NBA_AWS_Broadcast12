// 轨迹模拟 —— dataset-contract §4.3 阶段 C：贝塞尔分段插值 + 防守跟随规则 + 球权时间线
// 内部规范方向：进攻右篮筐 (90,25) ft；g002 在输出阶段做 x 镜像（§1）
import { clamp, dist } from './prng.mjs';

export const HOOP = [90, 25];
export const MAX_STEP = 2.1; // ft/帧，V07 上限 2.6 减去噪声最坏 0.424 的安全余量

// ---- 三次贝塞尔轨迹 ----
function cubicAt(p0, p1, p2, p3, u) {
  const v = 1 - u;
  const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

// 单球员轨迹：起点 + 贝塞尔分段序列；每段 moveTo 固定消耗 4 次 PRNG（2 控制点 × 2 坐标，±2.0ft）
export class Track {
  constructor(x, y) {
    this.start = [x, y];
    this.segs = [];
  }
  get end() {
    return this.segs.length ? this.segs[this.segs.length - 1].p3 : this.start;
  }
  // jit: () => [-2, 2] 均匀抖动（PRNG 流②）
  moveTo(x, y, t0, t1, jit) {
    const p0 = this.end;
    const p1 = [p0[0] + (x - p0[0]) / 3 + jit(), p0[1] + (y - p0[1]) / 3 + jit()];
    const p2 = [p0[0] + (2 * (x - p0[0])) / 3 + jit(), p0[1] + (2 * (y - p0[1])) / 3 + jit()];
    this.segs.push({ t0, t1, p0, p1, p2, p3: [x, y] });
    return this;
  }
  at(t) {
    let prev = this.start;
    for (const s of this.segs) {
      if (t < s.t0) return prev;
      if (t <= s.t1) return cubicAt(s.p0, s.p1, s.p2, s.p3, (t - s.t0) / (s.t1 - s.t0));
      prev = s.p3;
    }
    return prev;
  }
  // 当前速率 ft/s（用于角色判定 cutter）
  speedAt(t) {
    const a = this.at(t);
    const b = this.at(t + 100);
    return dist(a, b) * 10;
  }
}

function shrinkTowardHoop(pos, ft) {
  const d = dist(pos, HOOP);
  if (d < 1e-6) return [...pos];
  const k = ft / d;
  return [pos[0] + (HOOP[0] - pos[0]) * k, pos[1] + (HOOP[1] - pos[1]) * k];
}

// ---- 防守模拟（§4.3 防守跟随规则逐字）----
// 人盯人基线：防守人位置 = 责任对象位置朝己方篮筐收缩 1.5ft；反应延迟 200ms（+流③ jitter）
// helps/switches/gravity 由剧本 plan 声明；追踪限速 MAX_STEP
export function simulateDefense(plan, delayJitters) {
  const { D, tracks, defenseSlots, switches, helps, gravity } = plan;
  const frameCount = D / 100;
  // assign[defKey] = offSlotKey；switches 在指定时刻交换
  const assign = {};
  defenseSlots.forEach((defKey, i) => { assign[defKey] = plan.defAssignments[i]; });
  const positions = {};
  defenseSlots.forEach((defKey) => { positions[defKey] = []; });

  const targetFor = (defKey, t) => {
    const delay = 200 + delayJitters[defenseSlots.indexOf(defKey)];
    const offSlot = assign[defKey];
    const raw = tracks[offSlot].at(Math.max(0, t - delay));
    let desired = shrinkTowardHoop(raw, 1.5);
    let helping = false;
    for (const h of helps) {
      if (h.slot === offSlot && t >= h.from && t <= h.to) {
        const anchor = shrinkTowardHoop(tracks[h.target].at(Math.max(0, t - delay)), 2.0);
        desired = [
          desired[0] + (anchor[0] - desired[0]) * h.strength,
          desired[1] + (anchor[1] - desired[1]) * h.strength,
        ];
        helping = true;
      }
    }
    if (gravity && gravity.helpDefKey === defKey && t >= gravity.fromMs) {
      const k = clamp(0, (t - gravity.fromMs) / 600, 1) * 0.7;
      const anchor = shrinkTowardHoop(tracks[gravity.holderSlot].at(Math.max(0, t - delay)), 2.0);
      desired = [
        desired[0] + (anchor[0] - desired[0]) * k,
        desired[1] + (anchor[1] - desired[1]) * k,
      ];
      helping = true;
    }
    return { desired, helping };
  };

  for (let j = 0; j < frameCount; j++) {
    const t = j * 100;
    for (const sw of switches) {
      // switches 以"当时盯防 slotA/slotB 的防守人互换责任对象"表达
      if (t === sw.t) {
        const defA = defenseSlots.find((k) => assign[k] === sw.slotA);
        const defB = defenseSlots.find((k) => assign[k] === sw.slotB);
        if (defA && defB) {
          assign[defA] = sw.slotB;
          assign[defB] = sw.slotA;
        }
      }
    }
    for (const defKey of defenseSlots) {
      const { desired, helping } = targetFor(defKey, t);
      const prev = j === 0 ? desired : positions[defKey][j - 1].pos;
      const d = dist(prev, desired);
      const pos = d <= MAX_STEP || j === 0
        ? desired
        : [prev[0] + ((desired[0] - prev[0]) / d) * MAX_STEP, prev[1] + ((desired[1] - prev[1]) / d) * MAX_STEP];
      positions[defKey].push({ pos, role: helping ? 'help' : 'defender', offSlot: assign[defKey] });
    }
  }
  return positions; // { defKey: [{pos, role, offSlot}] } 按帧
}

// ---- 球权时间线 ----
// segments: hold{slot,t0,t1} / pass{from,to,t0,t1?} / shot{slot,t0,t1,result,style}
export function buildBallTimeline(segments, tracks) {
  const out = [];
  for (const seg of segments) {
    if (seg.kind === 'pass') {
      // 球直线飞行速率 25 ft/s；receive 落到帧界（§4.4）；choreo 已预算 t1 则直接使用
      let t1 = seg.t1 ?? seg.t0 + 200;
      if (seg.t1 == null) {
        const from = tracks[seg.from].at(seg.t0);
        for (let iter = 0; iter < 2; iter++) {
          const to = tracks[seg.to].at(t1);
          t1 = Math.ceil((seg.t0 + (dist(from, to) / 25) * 1000) / 100) * 100;
        }
      }
      out.push({ ...seg, t1, trackFrom: (t) => tracks[seg.from].at(t), trackTo: (t) => tracks[seg.to].at(t) });
    } else if (seg.kind === 'hold') {
      out.push({ ...seg, trackAt: (t) => tracks[seg.slot].at(t) });
    } else if (seg.kind === 'shot') {
      out.push({ ...seg, release: tracks[seg.slot].at(seg.t0) });
    } else {
      out.push(seg);
    }
  }
  return out;
}

export function ballAt(timeline, t) {
  for (const seg of timeline) {
    if (t < seg.t0) break;
    if (seg.kind === 'hold' && t <= seg.t1) {
      const p = seg.trackAt(t);
      return { x: p[0], y: p[1], z: 3.2, holder: seg.slot };
    }
    if (seg.kind === 'pass' && t <= seg.t1) {
      const u = (t - seg.t0) / Math.max(1, seg.t1 - seg.t0);
      const a = seg.trackFrom(seg.t0);
      const b = seg.trackTo(seg.t1);
      return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: 3.2, holder: null };
    }
    if (seg.kind === 'shot') {
      return shotBallAt(seg, t);
    }
  }
  const last = timeline[timeline.length - 1];
  return shotBallAt(last, Math.max(last.t1 ?? 0, 0), true);
}

// §5.5 投篮抛物线：z(τ) = 3.2 + v0·τ − 16.1·τ²，v0 由 z(T)=10.0 反解；扣篮 z 峰值 ≤10.5
function shotBallAt(seg, t, freeze = false) {
  const T = (seg.t1 - seg.t0) / 1000;
  const release = seg.release;
  const target = seg.result === 'made' ? HOOP : [HOOP[0] + 0.55, HOOP[1] + 0.4];
  if (freeze || t >= seg.t1) {
    const dt = Math.min(200, Math.max(0, t - seg.t1));
    if (seg.result === 'made') {
      const z = dt === 0 ? 10.0 : dt === 100 ? 6.5 : 3.2;
      return { x: target[0], y: target[1], z, holder: null };
    }
    const bounce = dt === 100 ? [1.3, 0.9, 7.2] : dt >= 200 ? [2.4, 1.5, 4.1] : [0, 0, 10.0];
    return { x: target[0] + bounce[0], y: target[1] + bounce[1], z: bounce[2], holder: null };
  }
  const tau = (t - seg.t0) / 1000;
  const u = (t - seg.t0) / Math.max(1, seg.t1 - seg.t0);
  const x = release[0] + (target[0] - release[0]) * u;
  const y = release[1] + (target[1] - release[1]) * u;
  if (seg.style === 'drive') {
    return { x, y, z: 3.2 + (10.0 - 3.2) * u, holder: null };
  }
  const v0 = (10.0 - 3.2 + 16.1 * T * T) / T;
  return { x, y, z: 3.2 + v0 * tau - 16.1 * tau * tau, holder: null };
}

// ---- 帧组装（阶段 C 收尾 + 流④ 噪声）----
// 消费顺序（§4.2-3）：噪声 = 帧序 × 球员序（帧内顺序 = 先攻后防各按 number 升序），每球员 x/y 各 1 次抽取 ±0.15ft
export function buildFrames(plan, defSim, ballTimeline, prng, round2fn) {
  const { D, tracks, slotPlayers, defensePlayers, offenseSide } = plan;
  const defenseSide = offenseSide === 'home' ? 'away' : 'home';
  const offEntries = Object.entries(slotPlayers)
    .map(([slot, p]) => ({ slot, p }))
    .sort((a, b) => a.p.number - b.p.number);
  const defEntries = defensePlayers
    .map((p, i) => ({ defKey: `d${i}`, p }))
    .sort((a, b) => a.p.number - b.p.number);

  const frames = [];
  for (let j = 0; j < D / 100; j++) {
    const t = j * 100;
    const ball = ballAt(ballTimeline, t);
    const players = [];
    for (const { slot, p } of offEntries) {
      const pos = tracks[slot].at(t);
      const role = ball.holder === slot
        ? 'handler'
        : tracks[slot].speedAt(t) > 6 ? 'cutter' : 'screener';
      players.push({
        id: p.id, team: offenseSide,
        x: clamp(0.5, pos[0], 93.5), y: clamp(0.5, pos[1], 49.5), role,
      });
    }
    for (const { defKey, p } of defEntries) {
      const d = defSim[defKey][j];
      players.push({
        id: p.id, team: defenseSide,
        x: clamp(0.5, d.pos[0], 93.5), y: clamp(0.5, d.pos[1], 49.5), role: d.role,
      });
    }
    // 流④ 噪声：每帧每球员 ±0.15ft 均匀抖动（消除"机器人感"，不影响事件时刻）
    for (const pl of players) {
      pl.x = round2fn(pl.x + (prng() * 2 - 1) * 0.15);
      pl.y = round2fn(pl.y + (prng() * 2 - 1) * 0.15);
    }
    frames.push({
      t,
      ball: { x: round2fn(ball.x), y: round2fn(ball.y), z: round2fn(Math.max(0, ball.z)) },
      players,
    });
  }
  return frames;
}
