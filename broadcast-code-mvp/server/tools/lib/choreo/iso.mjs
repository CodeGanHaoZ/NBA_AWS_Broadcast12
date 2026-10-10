// 单打家族战术编排 —— iso_stepback_deep_three / buzzer_beater_deep_three
// 时间轴以 D 的分数表达并落帧界（§4.4）；moveTo 固定消耗 PRNG 流②（每段 4 次）
import { Track } from '../simulate.mjs';

// ctx: { D, T, jit, actors:{S,H,C|null,others[]}, result }；others = 进攻方除 S/H 外球员（roster 序）
export function isoStepback(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, others } = actors; // iso：H === S，others 4 人全部拉开弱侧
  const shotT = T(0.62); // 提前出手点，为 finish/analysis 字幕留出演示窗口

  const s = new Track(62, 25);
  s.moveTo(65, 28, T(0.05), T(0.25), jit)
    .moveTo(61, 23, T(0.25), T(0.42), jit)
    .moveTo(63, 26, T(0.42), T(0.52), jit)
    .moveTo(56, 25, T(0.52), T(0.6), jit); // 后撤步

  const starts = [[68, 12], [68, 38], [80, 6], [80, 44]];
  const spots = [[38, 10], [40, 40], [30, 7], [30, 43]]; // 清空弱侧
  const wTracks = others.map((w, i) => new Track(...starts[i]).moveTo(...spots[i], T(0.02), T(0.25), jit));

  const tracks = { S: s, W0: wTracks[0], W1: wTracks[1], W2: wTracks[2], W3: wTracks[3] };
  const slotPlayers = { S, W0: others[0], W1: others[1], W2: others[2], W3: others[3] };

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'S', t0: 0, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 1300, result, style: 'parabola' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2400, points: [[28, 4], [52, 4], [52, 46], [28, 46]], opacity: 0.15, label: 'iso 拉开' },
      { type: 'arrow', t: T(0.52), window: 1600, from: s.at(T(0.52)), to: s.at(T(0.6)), style: 'dashed' },
      { type: 'ring', t: shotT, window: 2000, slot: 'S', r: 2.5, label: '{dist}ft' },
    ],
    switches: [], helps: [],
    gravity: { holderSlot: 'S', fromMs: 1600, helpSlot: 'W2' }, // star 持球 >1.5s → help 收缩（§4.3 gravity 规则）
    tacticStartMs: 0,
    primaryHandlerSlot: 'S',
    D,
  };
}

export function buzzerBeater(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, H, others } = actors; // H = 发球人（assister），others 3 人拉开
  const passT = T(0.1);
  const shotT = T(0.64);

  const s = new Track(55, 8);
  s.moveTo(58, 12, T(0.05), T(0.16), jit) // 接球落位
    .moveTo(63, 18, T(0.22), T(0.4), jit)
    .moveTo(59, 24, T(0.4), T(0.54), jit)
    .moveTo(54, 25, T(0.54), T(0.62), jit); // 运球摆脱
  const h = new Track(30, 25);
  h.moveTo(34, 25, T(0.02), T(0.1), jit);
  const wStarts = [[35, 40], [28, 15], [45, 35]];
  const wSpots = [[42, 42], [36, 10], [50, 38]];
  const wTracks = others.map((w, i) => new Track(...wStarts[i]).moveTo(...wSpots[i], T(0.1), T(0.4), jit));

  const tracks = { S: s, H: h, W0: wTracks[0], W1: wTracks[1], W2: wTracks[2] };
  const slotPlayers = { S, H, W0: others[0], W1: others[1], W2: others[2] };
  const receiveT = passWindow(tracks, 'H', 'S', passT);

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'H', t0: 0, t1: passT },
      { kind: 'pass', from: 'H', to: 'S', t0: passT, t1: receiveT },
      { kind: 'hold', slot: 'S', t0: receiveT, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 1300, result, style: 'parabola' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2200, points: [[28, 4], [68, 4], [68, 46], [28, 46]], opacity: 0.15, label: '压哨回合' },
      { type: 'arrow', t: passT, window: 1400, from: h.at(passT), to: s.at(receiveT), style: 'solid' },
      { type: 'arrow', t: T(0.54), window: 1800, from: s.at(T(0.54)), to: s.at(T(0.62)), style: 'dashed' },
      { type: 'ring', t: shotT, window: 2200, slot: 'S', r: 2.5, label: '{dist}ft' },
    ],
    switches: [], helps: [],
    gravity: { holderSlot: 'S', fromMs: receiveT + 1500, helpSlot: 'W0' },
    tacticStartMs: passT,
    primaryHandlerSlot: 'S',
    D,
  };
}

// 传球落点时间：25 ft/s 直线飞行，向上取帧界（§4.3/§4.4）
export function passWindow(tracks, fromSlot, toSlot, t0) {
  const from = tracks[fromSlot].at(t0);
  let t1 = t0 + 200;
  for (let i = 0; i < 2; i++) {
    const to = tracks[toSlot].at(t1);
    t1 = Math.ceil((t0 + (Math.hypot(from[0] - to[0], from[1] - to[1]) / 25) * 1000) / 100) * 100;
  }
  return t1;
}
