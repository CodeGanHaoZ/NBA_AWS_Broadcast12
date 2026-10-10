// metrics.js
// 比赛量化指标构建（ES Module，无外部依赖，原生 JavaScript + JSDoc）
// 离线铁律：零 emoji、零 https:// 外链、零 Math.random；所有计算 deterministic。
// 坐标契约：位置为球场英尺，速度为 m/s；tracks.totalDist 已由 pipeline 换算为米。

/** 保留 1 位小数 */
function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * Andrew monotone chain 凸包面积（鞋带公式）。
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
 * 构建比赛量化指标。
 * - playerLoad：球员跑动负荷（距离转米）
 * - speedCurve：每 500ms 攻防平均速率
 * - spaceControl：每 500ms 攻防凸包覆盖面积
 * - eventCount：各类型事件计数
 * - possessionSplit：进攻/防守占有秒数估算
 *
 * @param {frame[]} frames
 * @param {tracks} tracks
 * @param {events} events
 * @returns {metrics}
 */
export function buildMetrics(frames, tracks, events) {
  const metrics = {
    playerLoad: [],
    speedCurve: [],
    spaceControl: [],
    eventCount: {},
    possessionSplit: { offenseSec: 0, defenseSec: 0 },
  };

  // playerLoad
  if (tracks && tracks.byId) {
    for (const id in tracks.byId) {
      const tr = tracks.byId[id];
      metrics.playerLoad.push({
        id: tr.id,
        num: tr.num,
        team: tr.team,
        dist: round1(tr.totalDist || 0), // 已是米
        maxSpeed: round1(tr.maxSpeed || 0),
        avgSpeed: round1(tr.avgSpeed || 0),
      });
    }
  }

  // speedCurve & spaceControl：按 500ms 时间窗聚合
  const WIN = 500;
  if (frames && frames.length) {
    const tMin = frames[0].t;
    const buckets = {};
    for (const f of frames) {
      const w = Math.floor((f.t - tMin) / WIN);
      (buckets[w] = buckets[w] || []).push(f);
    }
    const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    for (const k of keys) {
      const group = buckets[k];
      const tCenter = Math.round(tMin + k * WIN + WIN / 2);
      let offSum = 0;
      let offN = 0;
      let defSum = 0;
      let defN = 0;
      const offPts = [];
      const defPts = [];
      for (const f of group) {
        for (const p of f.players) {
          if (p.team === 'off') {
            offSum += p.speed || 0;
            offN++;
            offPts.push([p.x, p.y]);
          } else if (p.team === 'def') {
            defSum += p.speed || 0;
            defN++;
            defPts.push([p.x, p.y]);
          }
        }
      }
      metrics.speedCurve.push({
        t: tCenter,
        offenseSpeed: round1(offN ? offSum / offN : 0),
        defenseSpeed: round1(defN ? defSum / defN : 0),
      });
      metrics.spaceControl.push({
        t: tCenter,
        offenseArea: round1(convexHullArea(offPts)),
        defenseArea: round1(convexHullArea(defPts)),
      });
    }
  }

  // eventCount
  for (const e of events || []) {
    metrics.eventCount[e.type] = (metrics.eventCount[e.type] || 0) + 1;
  }

  // possessionSplit：以“离球最近的 off 球员”判定持球方，累计占有毫秒
  if (frames && frames.length) {
    let offenseMs = 0;
    let defenseMs = 0;
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
      const ownerTeam = best ? 'off' : 'def';
      if (prev !== null) {
        const dt = f.t - prev;
        if (ownerTeam === 'off') offenseMs += dt;
        else defenseMs += dt;
      }
      prev = f.t;
    }
    metrics.possessionSplit = {
      offenseSec: round1(offenseMs / 1000),
      defenseSec: round1(defenseMs / 1000),
    };
  }

  return metrics;
}
