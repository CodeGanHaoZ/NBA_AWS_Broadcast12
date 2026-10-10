// 挡拆家族战术编排 —— pick_and_roll_layup / pick_and_roll_midrange / horns_dunk
import { Track } from '../simulate.mjs';
import { passWindow } from './iso.mjs';

// pick_and_roll_layup：掩护(ring) → 顺下(arrow:dashed) → 防守夹击(zone) → 上篮(ring)
export function pnrLayup(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, C, others } = actors; // H === S（持球发起）；C = screener
  const wings = others.filter((p) => p.id !== C.id);
  const shotT = T(0.7);

  const s = new Track(60, 25);
  s.moveTo(70, 30, T(0.22), T(0.4), jit) // 借掩护突破
    .moveTo(84, 27, T(0.4), T(0.62), jit)
    .moveTo(88, 25.5, T(0.62), T(0.7), jit);
  const c = new Track(71, 33);
  c.moveTo(63, 27, T(0.14), T(0.22), jit) // 掩护就位
    .moveTo(82, 25, T(0.35), T(0.6), jit); // 顺下
  const wStarts = [[68, 12], [80, 44], [45, 40]];
  const wSpots = [[76, 8], [82, 42], [50, 38]];
  const wTracks = wings.map((w, i) => new Track(...wStarts[i]).moveTo(...wSpots[i], T(0.1), T(0.35), jit));

  const tracks = { S: s, C: c, W0: wTracks[0], W1: wTracks[1], W2: wTracks[2] };
  const slotPlayers = { S, C, W0: wings[0], W1: wings[1], W2: wings[2] };

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'S', t0: 0, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 600, result, style: 'drive' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2200, points: [[44, 6], [72, 6], [72, 44], [44, 44]], opacity: 0.15, label: '战术落位' },
      { type: 'ring', t: T(0.2), window: 1800, slot: 'C', r: 1.8, label: '掩护' },
      { type: 'arrow', t: T(0.38), window: 1600, from: c.at(T(0.35)), to: c.at(T(0.6)), style: 'dashed' },
      { type: 'zone', t: T(0.4), window: 2000, points: [[66, 24], [78, 24], [78, 36], [66, 36]], opacity: 0.15, label: '夹击' },
      { type: 'ring', t: shotT, window: 1600, slot: 'S', r: 2.5, label: '上篮' },
    ],
    switches: [],
    helps: [{ slot: 'C', target: 'S', from: T(0.3), to: T(0.6), strength: 0.55 }], // C 的防守人上夹击
    gravity: null,
    tacticStartMs: T(0.2),
    primaryHandlerSlot: 'S',
    D,
  };
}

// pick_and_roll_midrange：掩护(ring) → 换防(zone) → 急停中投(ring)
export function pnrMidrange(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, C, others } = actors;
  const wings = others.filter((p) => p.id !== C.id);
  const shotT = T(0.6); // 提前出手点，为 analysis 字幕留窗

  const s = new Track(60, 25);
  s.moveTo(66, 29, T(0.22), T(0.38), jit)
    .moveTo(74, 28, T(0.38), T(0.52), jit); // 急停点
  const c = new Track(71, 33);
  c.moveTo(63, 27, T(0.14), T(0.22), jit)
    .moveTo(70, 38, T(0.35), T(0.55), jit); // 外弹
  const wStarts = [[68, 12], [80, 44], [45, 40]];
  const wSpots = [[76, 9], [82, 42], [50, 38]];
  const wTracks = wings.map((w, i) => new Track(...wStarts[i]).moveTo(...wSpots[i], T(0.1), T(0.35), jit));

  const tracks = { S: s, C: c, W0: wTracks[0], W1: wTracks[1], W2: wTracks[2] };
  const slotPlayers = { S, C, W0: wings[0], W1: wings[1], W2: wings[2] };

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'S', t0: 0, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 800, result, style: 'parabola' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2200, points: [[44, 6], [72, 6], [72, 44], [44, 44]], opacity: 0.15, label: '战术落位' },
      { type: 'ring', t: T(0.2), window: 1800, slot: 'C', r: 1.8, label: '掩护' },
      { type: 'zone', t: T(0.32), window: 2000, points: [[62, 22], [72, 22], [72, 34], [62, 34]], opacity: 0.15, label: '换防' },
      { type: 'ring', t: shotT, window: 1800, slot: 'S', r: 2.5, label: '急停中投' },
    ],
    switches: [{ t: T(0.28), slotA: 'S', slotB: 'C' }], // 换防：S/C 的防守人互换责任对象
    helps: [],
    gravity: null,
    tacticStartMs: T(0.2),
    primaryHandlerSlot: 'S',
    D,
  };
}

// horns_dunk：horns 站位(zone) → 掩护(ring) → 空切(arrow:dashed) → 传球(arrow:solid) → 扣篮(ring)
export function hornsDunk(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, H, C, others } = actors; // H = 持球助攻人；S = 空接终结者；C = 掩护人
  const wings = others.filter((p) => p.id !== C.id);
  const passT = T(0.62);
  const shotT = T(0.78);

  const h = new Track(60, 25);
  h.moveTo(68, 31, T(0.2), T(0.38), jit); // 借掩护下球
  const c = new Track(71, 17);
  c.moveTo(63, 27, T(0.12), T(0.22), jit); // 肘区上提掩护
  const s = new Track(71, 33);
  s.moveTo(85, 26, T(0.35), T(0.6), jit) // 空切篮下
    .moveTo(89, 25, T(0.7), T(0.78), jit); // 接球起跳
  const wStarts = [[82, 6], [82, 44]];
  const wTracks = wings.map((w, i) => new Track(...wStarts[i]));

  const tracks = { S: s, H: h, C: c, W0: wTracks[0], W1: wTracks[1] };
  const slotPlayers = { S, H, C, W0: wings[0], W1: wings[1] };
  const receiveT = passWindow(tracks, 'H', 'S', passT);

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'H', t0: 0, t1: passT },
      { kind: 'pass', from: 'H', to: 'S', t0: passT, t1: receiveT },
      { kind: 'hold', slot: 'S', t0: receiveT, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 400, result, style: 'drive' }, // 扣篮 z 峰值 ≤10.5
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2200, points: [[58, 10], [80, 10], [80, 40], [58, 40]], opacity: 0.15, label: 'horns 站位' },
      { type: 'ring', t: T(0.2), window: 1800, slot: 'C', r: 1.8, label: '掩护' },
      { type: 'arrow', t: T(0.38), window: 1600, from: s.at(T(0.35)), to: s.at(T(0.6)), style: 'dashed' },
      { type: 'arrow', t: passT, window: 1400, from: h.at(passT), to: s.at(receiveT), style: 'solid' },
      { type: 'ring', t: shotT, window: 1600, slot: 'S', r: 2.5, label: '空接' },
    ],
    switches: [{ t: T(0.26), slotA: 'H', slotB: 'C' }],
    helps: [],
    gravity: null,
    tacticStartMs: T(0.2),
    primaryHandlerSlot: 'H',
    D,
  };
}
