// tactics.js
// 战术因素链 / 结构化证据 / 解说生成（ES Module，无外部依赖，原生 JavaScript + JSDoc）
// 离线铁律：零 emoji、零 https:// 外链、零 Math.random；所有计算 deterministic。
// 坐标契约：位置为球场英尺，速度为 m/s（tracks.maxSpeed/avgSpeed 已由 pipeline 换算为 m/s）。

/** 保留 1 位小数 */
function round1(v) {
  return Math.round(v * 10) / 10;
}
/** 保留 2 位小数 */
function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * 各事件类型 -> 因素标题/单位映射
 */
const FACTOR_META = {
  DRIVE: { title: '突破', unit: 'm/s' },
  DEF_COLLAPSE: { title: '协防', unit: 'ft' },
  SPACE_OPEN: { title: '空位', unit: 'ft' },
  PASS: { title: '传球', unit: 'ft' },
  SHOT: { title: '出手', unit: 'ft' },
};

/**
 * Andrew monotone chain 凸包面积（鞋带公式），用于空间占有率估算。
 * @param {number[][]} points [[x,y],...]
 * @returns {number} 面积（ft²），点数不足时返回 0
 */
function convexHullArea(points) {
  if (!points || points.length < 3) return 0;
  const pts = points.slice().sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length;
    area += hull[i][0] * hull[j][1] - hull[j][0] * hull[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * 为单个事件构造 1-3 条中文证据键值。
 * @param {event} e
 * @returns {object[]} evidences [{k,v}]
 */
function buildFactorEvidences(e) {
  switch (e.type) {
    case 'DRIVE':
      return [
        { k: '突破速度', v: `${round1(e.magnitude)} m/s` },
        { k: '触发帧', v: `${e.t} ms` },
      ];
    case 'DEF_COLLAPSE':
      return [{ k: '收缩幅度', v: `${round1(e.magnitude)} ft` }];
    case 'SPACE_OPEN':
      return [{ k: '空位距离', v: `${round1(e.magnitude)} ft` }];
    case 'PASS':
      return [{ k: '传球距离', v: `${round1(e.magnitude)} ft` }];
    case 'SHOT':
      return [{ k: '出手距离', v: `${round1(e.magnitude)} ft` }];
    default:
      return [{ k: '相关事件', v: e.label || e.type }];
  }
}

/**
 * 构建因果因素链：把每个关键事件转换为一个 factor，按 order 排序。
 * 若关键事件不足 3 个，则补充合理默认骨架 factor，保证至少 3 个。
 *
 * @param {events} events
 * @param {tracks} tracks
 * @param {frame[]} frames
 * @returns {factor[]}
 */
export function buildFactors(events, tracks, frames) {
  const factors = [];
  let order = 1;
  const sorted = [...(events || [])].sort((a, b) => a.t - b.t);

  for (const e of sorted) {
    const meta = FACTOR_META[e.type];
    if (!meta) continue;
    factors.push({
      id: `f${order}`,
      order: order,
      type: e.type,
      title: meta.title,
      value: round1(e.magnitude),
      unit: meta.unit,
      conf: round2(e.conf),
      t: e.t,
      evidences: buildFactorEvidences(e),
    });
    order++;
  }

  // 至少 3 个 factor：不足则补基础因果骨架
  if (factors.length < 3) {
    const baseT = frames && frames.length ? frames[0].t : 0;
    const pads = [
      { type: 'BASE', title: '进攻发起', conf: 0.6 },
      { type: 'BASE', title: '节奏控制', conf: 0.6 },
      { type: 'BASE', title: '终结效率', conf: 0.6 },
    ];
    for (const p of pads) {
      if (factors.length >= 3) break;
      factors.push({
        id: `f${order}`,
        order: order,
        type: p.type,
        title: p.title,
        value: 0,
        unit: '',
        conf: round2(p.conf),
        t: baseT,
        evidences: [{ k: '样本', v: '基线' }],
      });
      order++;
    }
  }

  return factors;
}

/**
 * 构造 13 项结构化指标证据（中文 label），每项含 value / unit / delta / conf。
 * 缺失项 delta 填 null，conf 由数据置信在 0.5-0.95 间给出。
 *
 * @param {events} events
 * @param {tracks} tracks
 * @param {frame[]} frames
 * @param {object} [meta] 附加元信息（可选，预留）
 * @returns {evidence[]}
 */
export function buildEvidence(events, tracks, frames, meta) {
  const ev = [];
  const push = (key, label, value, unit, delta, conf) =>
    ev.push({ key, label, value, unit, delta: delta === undefined ? null : delta, conf: round2(conf) });

  const frameSpan =
    frames && frames.length >= 2 ? (frames[frames.length - 1].t - frames[0].t) / 1000 : 0;
  push('dur', '回合时长', round1(frameSpan), 's', null, 0.9);

  let offSum = 0;
  let offN = 0;
  let maxInst = 0;
  if (tracks && tracks.byId) {
    for (const id in tracks.byId) {
      const tr = tracks.byId[id];
      if (tr.team === 'off') {
        offSum += (tr.avgSpeed || 0); // 已是 m/s
        offN++;
      }
      const ms = (tr.maxSpeed || 0); // 已是 m/s
      if (ms > maxInst) maxInst = ms;
    }
  }
  push('avgOff', '平均进攻速度', round1(offN ? offSum / offN : 0), 'm/s', null, 0.85);
  push('maxSpd', '最高瞬时速度', round1(maxInst), 'm/s', null, 0.85);

  const counts = {};
  for (const e of events || []) counts[e.type] = (counts[e.type] || 0) + 1;
  push('drives', '突破次数', counts.DRIVE || 0, '次', null, 0.8);
  push('passes', '传球次数', counts.PASS || 0, '次', null, 0.8);

  const shots = (events || []).filter((e) => e.type === 'SHOT');
  const shotDist = shots.length ? shots.reduce((s, e) => s + e.magnitude, 0) / shots.length : 0;
  push('shotDist', '出手距离', round1(shotDist), 'ft', null, 0.8);

  const spaces = (events || []).filter((e) => e.type === 'SPACE_OPEN');
  const avgSpace = spaces.length ? spaces.reduce((s, e) => s + e.magnitude, 0) / spaces.length : 0;
  push('avgSpace', '平均空位距离', round1(avgSpace), 'ft', null, 0.8);

  const defc = (events || []).filter((e) => e.type === 'DEF_COLLAPSE');
  const maxDef = defc.length ? Math.max(...defc.map((e) => e.magnitude)) : 0;
  push('maxDef', '最大防守收缩', round1(maxDef), 'ft', null, 0.8);

  let distSum = 0;
  let distN = 0;
  if (tracks && tracks.byId) {
    for (const id in tracks.byId) {
      distSum += tracks.byId[id].totalDist || 0;
      distN++;
    }
  }
  push('avgRun', '球员平均跑动', round1(distN ? distSum / distN : 0), 'ft', null, 0.75);

  // 球权转换次数：扫描 frames，统计 off 持球人切换次数
  let possChanges = 0;
  if (frames && frames.length) {
    let prev = null;
    for (const f of frames) {
      let best = null;
      let bd = Infinity;
      for (const p of f.players) {
        if (p.team !== 'off') continue;
        const d = Math.sqrt((p.x - f.ball.x) ** 2 + (p.y - f.ball.y) ** 2);
        if (d < bd) {
          bd = d;
          best = p.id;
        }
      }
      if (best !== null) {
        if (prev !== null && best !== prev) possChanges++;
        prev = best;
      }
    }
  }
  push('possChg', '球权转换次数', possChanges, '次', null, 0.7);

  push('helpCnt', '协防触发次数', counts.DEF_COLLAPSE || 0, '次', null, 0.8);

  // 进攻空间占有率 %：用末帧两队凸包面积比值
  let offArea = 0;
  let defArea = 0;
  if (frames && frames.length) {
    const last = frames[frames.length - 1];
    const offPts = [];
    const defPts = [];
    for (const p of last.players) {
      if (p.team === 'off') offPts.push([p.x, p.y]);
      else if (p.team === 'def') defPts.push([p.x, p.y]);
    }
    offArea = convexHullArea(offPts);
    defArea = convexHullArea(defPts);
  }
  const occ = offArea + defArea > 0 ? (offArea / (offArea + defArea)) * 100 : 0;
  push('offOcc', '进攻空间占有率', round1(occ), '%', null, 0.7);

  // 战术复杂度指数 0-100：基于各事件类型加权
  const complexity = Math.min(
    100,
    (counts.DRIVE || 0) * 8 +
      (counts.PASS || 0) * 6 +
      (counts.CUT || 0) * 5 +
      (counts.SPACE_OPEN || 0) * 4 +
      (counts.DEF_COLLAPSE || 0) * 7 +
      (counts.SHOT || 0) * 10
  );
  push('complex', '战术复杂度指数', complexity, '0-100', null, 0.7);

  return ev;
}

/**
 * 为每个关键 factor 生成一条中文篮球解说。
 * tone 依据 conf / magnitude 选 calm / excited / clutch；refs 填相关 event id。至少 3 条。
 *
 * @param {events} events
 * @param {factor[]} factors
 * @param {object} [meta]
 * @returns {narrationItem[]}
 */
export function buildNarration(events, factors, meta) {
  const items = [];
  const key = (factors || []).filter((f) => f.type !== 'BASE');
  const ordered = key.length ? key : factors || [];

  for (const f of ordered) {
    let text = '';
    let tone = 'calm';
    const mag = f.value;
    const ref = (events || []).find((e) => e.type === f.type && Math.abs(e.t - f.t) < 1);
    const refs = ref ? [ref.id] : [];

    switch (f.type) {
      case 'DRIVE':
        text = `突破启动，速度 ${mag} m/s 撕裂防线`;
        tone = mag >= 6 ? 'excited' : 'calm';
        break;
      case 'DEF_COLLAPSE':
        text = `防守收缩 ${mag} ft，内线压力骤增`;
        tone = mag >= 4 ? 'excited' : 'calm';
        break;
      case 'SPACE_OPEN':
        text = `进攻端拉开 ${mag} ft 空位，机会出现`;
        tone = 'calm';
        break;
      case 'PASS':
        text = `一记 ${mag} ft 转移球，破解防守`;
        tone = 'calm';
        break;
      case 'SHOT':
        text = `在 ${mag} ft 处出手，关键一投`;
        tone = mag <= 6 ? 'clutch' : 'excited';
        break;
      case 'CUT':
        text = `无球切入，制造杀机`;
        tone = 'excited';
        break;
      default:
        text = `战术节点：${f.title}`;
        tone = 'calm';
    }
    if (f.conf >= 0.9 && tone === 'calm') tone = 'excited';
    items.push({ t: f.t, text, tone, refs });
  }

  // 至少 3 条：不足则补通用解说
  if (items.length < 3) {
    const baseT = factors && factors.length ? factors[0].t : 0;
    const extra = [
      { text: '比赛开始，双方展开试探', tone: 'calm' },
      { text: '进攻节奏逐步提速', tone: 'calm' },
      { text: '防守强度提升，进入相持', tone: 'calm' },
    ];
    for (const ex of extra) {
      if (items.length >= 3) break;
      items.push({ t: baseT, text: ex.text, tone: ex.tone, refs: [] });
    }
  }

  return items;
}
