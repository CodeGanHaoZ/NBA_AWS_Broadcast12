// events.js
// 纯逻辑篮球比赛事件检测引擎（ES Module，无外部依赖，原生 JavaScript + JSDoc）
// 离线铁律：零 emoji、零 https:// 外链、零 Math.random；所有计算 deterministic。

// 单应标定后坐标契约：位置一律为球场英尺(0-94 x 0-50)，速度一律为 m/s。
// pipeline 在生成帧时已经把位移换算为 m/s 存入 player.speed，本模块不得再次乘 FT_TO_M。
const HOOP_LEFT = { x: 0, y: 25 }; // 左篮筐（球场 0-94 x 0-50）
const HOOP_RIGHT = { x: 94, y: 25 }; // 右篮筐

/**
 * 两点欧氏距离
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number}
 */
function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 在给定帧中找出离球最近的进攻(off)球员，作为持球人
 * @param {frame} frame
 * @returns {object|null}
 */
function findPossessor(frame) {
  let best = null;
  let bestD = Infinity;
  for (const p of frame.players) {
    if (p.team !== 'off') continue;
    const d = dist(p.x, p.y, frame.ball.x, frame.ball.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * 数值区间裁剪
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 保留 1 位小数 */
function round1(v) {
  return Math.round(v * 10) / 10;
}
/** 保留 2 位小数 */
function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * 基于真实几何计算检测比赛事件。
 * 覆盖 DRIVE / SPACE_OPEN / DEF_COLLAPSE / PASS / SHOT / CUT 六类。
 * 所有事件通过“上升沿 / 持续帧 / 冷却”去抖，保证同一输入确定性输出。
 *
 * @param {frame[]} frames 约 10fps 采样的帧序列
 * @param {tracks} tracks 轨迹数据（本函数仅占位，未来可扩展）
 * @returns {events} 检测出的事件数组
 */
export function detectEvents(frames, tracks) {
  const events = [];
  let seq = 0;
  const nextId = () => `e${seq++}`;

  if (!frames || frames.length === 0) return events;

  // 跨帧状态
  let prevPossessor = null; // { id, speedMS }
  let prevOwnerId = null; // 上一帧持球 off 球员 id
  let prevDefAvgDist = null; // 上一帧防守者到球平均距离
  let defCollapseCd = -Infinity; // 防守收缩冷却
  let passCd = -Infinity; // 传球冷却
  let shotCd = -Infinity; // 出手冷却
  const openCounter = {}; // 空位持续帧计数
  const openActive = {}; // 空位 episode 是否已触发
  let driveActive = false; // 突破状态
  const cutActive = {}; // 切入状态（按球员）

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const t = f.t;

    // 持球人
    const poss = findPossessor(f);
    const possId = poss ? poss.id : null;
    // player.speed 已是 m/s（pipeline 已换算），勿再乘 FT_TO_M
    const possSpeedMS = poss ? poss.speed : 0;

    // ---- DRIVE（突破启动）----
    const DRIVE_THRESH = 4.0; // m/s
    if (poss && possSpeedMS > DRIVE_THRESH) {
      // 上升沿：上帧未突破，本帧跃升过阈
      if (!driveActive && prevPossessor && prevPossessor.speedMS <= DRIVE_THRESH) {
        events.push({
          id: nextId(),
          t,
          type: 'DRIVE',
          label: '突破启动',
          detail: `持球人 ${possId} 以 ${possSpeedMS.toFixed(1)} m/s 发起突破`,
          players: [possId],
          magnitude: round1(possSpeedMS),
          conf: round2(clamp(0.6 + ((possSpeedMS - 4) / 8) * 0.35, 0.6, 0.95)),
        });
        driveActive = true;
      }
    } else {
      driveActive = false;
    }
    prevPossessor = { id: possId, speedMS: possSpeedMS };

    // ---- SPACE_OPEN（空位形成）----
    const SPACE_THRESH = 6; // ft
    const SPACE_FRAMES = 3; // 需持续帧数
    for (const p of f.players) {
      if (p.team !== 'off') continue;
      let nd = Infinity;
      for (const q of f.players) {
        if (q.team !== 'def') continue;
        const d = dist(p.x, p.y, q.x, q.y);
        if (d < nd) nd = d;
      }
      if (nd > SPACE_THRESH) {
        openCounter[p.id] = (openCounter[p.id] || 0) + 1;
        if (!openActive[p.id] && openCounter[p.id] >= SPACE_FRAMES) {
          openActive[p.id] = true;
          events.push({
            id: nextId(),
            t,
            type: 'SPACE_OPEN',
            label: '空位形成',
            detail: `进攻球员 ${p.id} 获得 ${nd.toFixed(1)} ft 空位`,
            players: [p.id],
            magnitude: round1(nd),
            conf: round2(clamp(0.7 + ((nd - 6) / 10) * 0.25, 0.7, 0.95)),
          });
        }
      } else {
        openCounter[p.id] = 0;
        openActive[p.id] = false;
      }
    }

    // ---- DEF_COLLAPSE（防守收缩）----
    let defSum = 0;
    let defN = 0;
    for (const p of f.players) {
      if (p.team !== 'def') continue;
      defSum += dist(p.x, p.y, f.ball.x, f.ball.y);
      defN++;
    }
    const defAvg = defN > 0 ? defSum / defN : null;
    if (defAvg !== null && prevDefAvgDist !== null && defN >= 2) {
      const drop = prevDefAvgDist - defAvg; // 距离下降幅度
      if (drop > 2 && t - defCollapseCd > 1000) {
        events.push({
          id: nextId(),
          t,
          type: 'DEF_COLLAPSE',
          label: '防守收缩',
          detail: `${defN} 名防守者向持球人聚合，平均距离下降 ${drop.toFixed(1)} ft`,
          players: f.players.filter((p) => p.team === 'def').map((p) => p.id),
          magnitude: round1(drop),
          conf: round2(clamp(0.65 + (drop / 10) * 0.3, 0.65, 0.95)),
        });
        defCollapseCd = t;
      }
    }
    prevDefAvgDist = defAvg;

    // ---- PASS（传球）----
    // 主判定：持球权归属转移（球权从一名进攻球员切换到另一名）。
    // 注：样例与真实视频中传球/运球球的 z 通常 >= 3.0，故不再用 z<3.0 卡阈值；
    // 改为“球权转移”为主（限定中低空 z<7.0 以排除高空出手飞行段）、“球坐标突跳”为辅。
    let passEmitted = false;
    if (
      prevOwnerId !== null &&
      possId !== null &&
      possId !== prevOwnerId &&
      f.ball.z < 7.0 &&
      t - passCd > 500
    ) {
      // 球权归属转移
      const prevP = f.players.find((p) => p.id === prevOwnerId);
      const curP = f.players.find((p) => p.id === possId);
      const passDist = prevP && curP ? dist(prevP.x, prevP.y, curP.x, curP.y) : 0;
      events.push({
        id: nextId(),
        t,
        type: 'PASS',
        label: '传球',
        detail: `球权由 ${prevOwnerId} 转移至 ${possId}，传球距离 ${passDist.toFixed(1)} ft`,
        players: [prevOwnerId, possId],
        magnitude: round1(passDist),
        conf: round2(clamp(0.7 + (passDist > 10 ? 0.1 : 0), 0.7, 0.95)),
      });
      passEmitted = true;
    } else if (i > 0 && t - passCd > 500) {
      // 球坐标突跳
      const pf = frames[i - 1];
      const jump = dist(f.ball.x, f.ball.y, pf.ball.x, pf.ball.y);
      if (jump > 4 && f.ball.z < 7.0) {
        events.push({
          id: nextId(),
          t,
          type: 'PASS',
          label: '传球',
          detail: `球位移突跳 ${jump.toFixed(1)} ft，判定为传球`,
          players: possId ? [possId] : [],
          magnitude: round1(jump),
          conf: round2(0.7),
        });
        passEmitted = true;
      }
    }
    if (passEmitted) passCd = t;
    prevOwnerId = possId;

    // ---- SHOT（出手）----
    if (f.ball.z > 3.5) {
      const dL = dist(f.ball.x, f.ball.y, HOOP_LEFT.x, HOOP_LEFT.y);
      const dR = dist(f.ball.x, f.ball.y, HOOP_RIGHT.x, HOOP_RIGHT.y);
      const dHoop = Math.min(dL, dR);
      if (dHoop < 8 && t - shotCd > 1500) {
        events.push({
          id: nextId(),
          t,
          type: 'SHOT',
          label: '出手',
          detail: `在距篮筐 ${dHoop.toFixed(1)} ft 处出手`,
          players: possId ? [possId] : [],
          magnitude: round1(dHoop),
          conf: round2(0.85),
        });
        shotCd = t;
      }
    }

    // ---- CUT（无球切入）----
    const CUT_THRESH = 3.5; // m/s
    for (const p of f.players) {
      if (p.team !== 'off') continue;
      if (p.id === possId) continue; // 非持球
      const spMS = p.speed; // player.speed 已是 m/s
      if (spMS > CUT_THRESH) {
        if (!cutActive[p.id]) {
          cutActive[p.id] = true;
          events.push({
            id: nextId(),
            t,
            type: 'CUT',
            label: '无球切入',
            detail: `无球球员 ${p.id} 以 ${spMS.toFixed(1)} m/s 切入`,
            players: [p.id],
            magnitude: round1(spMS),
            conf: round2(clamp(0.6 + ((spMS - 3.5) / 5) * 0.3, 0.6, 0.95)),
          });
        }
      } else {
        cutActive[p.id] = false;
      }
    }
  }

  return events;
}

/**
 * 将帧序列按 SHOT / TURNOVER / 失球或每约 8s 切分为若干回合。
 * 至少产出 1 个回合；label 形如 "Sample Possession 01"。
 * score = 该回合事件数*10 + 突破次数*5（用于排序/重要性）。
 *
 * @param {frame[]} frames
 * @param {events} events
 * @returns {possession[]}
 */
export function splitPossessions(frames, events) {
  const result = [];
  if (!frames || frames.length === 0) return result;

  const sorted = [...(events || [])].sort((a, b) => a.t - b.t);

  // 切分时间点：SHOT / TURNOVER 处切；相邻事件间隔 > 8s 处切
  const cutSet = new Set();
  for (const e of sorted) {
    if (e.type === 'SHOT' || e.type === 'TURNOVER') cutSet.add(e.t);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].t - sorted[i - 1].t > 8000) cutSet.add(sorted[i - 1].t);
  }

  const t0All = frames[0].t;
  const t1All = frames[frames.length - 1].t;

  if (sorted.length === 0) {
    result.push(makePossession(1, t0All, t1All, [], '整段进攻样本，暂无事件标注'));
    return result;
  }

  const boundaries = [t0All, ...[...cutSet].sort((a, b) => a - b), t1All + 1];
  let n = 0;
  for (let b = 0; b < boundaries.length - 1; b++) {
    const segStart = boundaries[b];
    const segEnd = boundaries[b + 1];
    const segEvents = sorted.filter((e) => e.t >= segStart && e.t < segEnd);
    if (segEvents.length === 0 && b < boundaries.length - 2) continue; // 跳过中间空段
    n++;
    const t0 = segEvents.length ? segEvents[0].t : segStart;
    const t1 = segEvents.length ? segEvents[segEvents.length - 1].t : segEnd;
    const drives = segEvents.filter((e) => e.type === 'DRIVE').length;
    const score = segEvents.length * 10 + drives * 5;
    const summary = `本回合共 ${segEvents.length} 个关键事件，含 ${drives} 次突破`;
    result.push(makePossession(n, t0, t1, segEvents.map((e) => e.id), summary, score));
  }

  if (result.length === 0) {
    result.push(makePossession(1, t0All, t1All, [], '整段进攻样本'));
  }
  return result;
}

/**
 * 构造单个回合对象
 * @param {number} n 序号
 * @param {number} t0
 * @param {number} t1
 * @param {string[]} evIds
 * @param {string} summary
 * @param {number} [score]
 * @returns {possession}
 */
function makePossession(n, t0, t1, evIds, summary, score) {
  return {
    id: `pos${n}`,
    label: `独行侠回合 ${String(n).padStart(2, '0')}`,
    t0,
    t1,
    events: evIds,
    summary,
    score: score === undefined ? evIds.length * 10 : score,
  };
}
