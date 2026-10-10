// 转换家族战术编排 —— fast_break_three / fast_break_dunk
import { Track } from '../simulate.mjs';
import { passWindow } from './iso.mjs';

// fast_break_three：推进(arrow:solid) → 底角拉开(zone) → 追身三分(ring)
export function fastBreakThree(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, H, others } = actors; // H = 推进人（assister）；S = 底角射手
  const passT = T(0.5);
  const shotT = T(0.68);

  const h = new Track(25, 25);
  h.moveTo(55, 25, T(0.05), T(0.4), jit); // 全速推进
  const s = new Track(30, 20);
  s.moveTo(81, 9, T(0.1), T(0.5), jit); // 冲底角
  const wStarts = [[22, 35], [20, 15], [28, 42]];
  const wSpots = [[45, 32], [40, 14], [50, 42]];
  const wTracks = others.map((w, i) => new Track(...wStarts[i]).moveTo(...wSpots[i], T(0.1), T(0.5), jit));

  const tracks = { S: s, H: h, W0: wTracks[0], W1: wTracks[1], W2: wTracks[2] };
  const slotPlayers = { S, H, W0: others[0], W1: others[1], W2: others[2] };
  const receiveT = passWindow(tracks, 'H', 'S', passT);

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'H', t0: 0, t1: passT },
      { kind: 'pass', from: 'H', to: 'S', t0: passT, t1: receiveT },
      { kind: 'hold', slot: 'S', t0: receiveT, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 900, result, style: 'parabola' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2000, points: [[15, 4], [55, 4], [55, 46], [15, 46]], opacity: 0.15, label: '转换进攻' },
      { type: 'arrow', t: T(0.1), window: 2000, from: h.at(T(0.05)), to: h.at(T(0.4)), style: 'solid' },
      { type: 'zone', t: T(0.45), window: 2200, points: [[74, 3], [90, 3], [90, 16], [74, 16]], opacity: 0.15, label: '底角拉开' },
      { type: 'ring', t: shotT, window: 2000, slot: 'S', r: 2.5, label: '追身三分' },
    ],
    switches: [], helps: [],
    gravity: null,
    tacticStartMs: T(0.1),
    primaryHandlerSlot: 'H',
    D,
  };
}

// fast_break_dunk：抢断/推进(arrow:solid) → 跟进(arrow:dashed) → 终结扣篮(ring)
export function fastBreakDunk(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, others } = actors; // H === S，持球一条龙
  const shotT = T(0.7);

  const s = new Track(28, 25);
  s.moveTo(55, 24, T(0.05), T(0.35), jit)
    .moveTo(84, 25, T(0.35), T(0.6), jit)
    .moveTo(89, 25, T(0.6), T(0.7), jit);
  const wStarts = [[25, 30], [20, 18], [22, 40], [30, 36]];
  const wSpots = [[70, 30], [45, 16], [50, 40], [72, 38]];
  const wEnds = [[T(0.3), T(0.65)], [T(0.1), T(0.45)], [T(0.1), T(0.45)], [T(0.2), T(0.55)]];
  const wTracks = others.map((w, i) => new Track(...wStarts[i]).moveTo(...wSpots[i], ...wEnds[i], jit));

  const tracks = { S: s, W0: wTracks[0], W1: wTracks[1], W2: wTracks[2], W3: wTracks[3] };
  const slotPlayers = { S, W0: others[0], W1: others[1], W2: others[2], W3: others[3] };

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'S', t0: 0, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 400, result, style: 'drive' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2000, points: [[15, 4], [55, 4], [55, 46], [15, 46]], opacity: 0.15, label: '攻防转换' },
      { type: 'arrow', t: T(0.12), window: 2200, from: s.at(T(0.05)), to: s.at(T(0.35)), style: 'solid' },
      { type: 'arrow', t: T(0.35), window: 1600, from: tracks.W0.at(T(0.3)), to: tracks.W0.at(T(0.65)), style: 'dashed' },
      { type: 'ring', t: shotT, window: 1600, slot: 'S', r: 2.5, label: '扣篮' },
    ],
    switches: [], helps: [],
    gravity: null,
    tacticStartMs: T(0.12),
    primaryHandlerSlot: 'S',
    D,
  };
}
