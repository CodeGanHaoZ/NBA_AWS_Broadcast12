// 无球家族战术编排 —— offball_flare_three / elevator_three / post_up_kickout_three
import { Track } from '../simulate.mjs';
import { passWindow } from './iso.mjs';

// offball_flare_three：弱侧掩护(ring) → flare 跑位(arrow:dashed) → 传球(arrow:solid) → 空位三分(ring+zone)
export function flareThree(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, H, C, others } = actors;
  const wings = others.filter((p) => p.id !== C.id);
  const passT = T(0.58);
  const shotT = T(0.68);

  const s = new Track(78, 30);
  s.moveTo(72, 42, T(0.35), T(0.55), jit); // flare 到底角侧翼
  const c = new Track(74, 25);
  c.moveTo(75, 28, T(0.24), T(0.32), jit); // flare 掩护
  const h = new Track(60, 25);
  h.moveTo(62, 24, T(0.4), T(0.55), jit);
  const wStarts = [[80, 6], [45, 40]];
  const wSpots = [[82, 8], [42, 38]];
  const wTracks = wings.map((w, i) => new Track(...wStarts[i]).moveTo(...wSpots[i], T(0.1), T(0.3), jit));

  const tracks = { S: s, H: h, C: c, W0: wTracks[0], W1: wTracks[1] };
  const slotPlayers = { S, H, C, W0: wings[0], W1: wings[1] };
  const receiveT = passWindow(tracks, 'H', 'S', passT);

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'H', t0: 0, t1: passT },
      { kind: 'pass', from: 'H', to: 'S', t0: passT, t1: receiveT },
      { kind: 'hold', slot: 'S', t0: receiveT, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 1100, result, style: 'parabola' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2200, points: [[56, 6], [86, 6], [86, 30], [56, 30]], opacity: 0.15, label: '战术落位' },
      { type: 'ring', t: T(0.32), window: 1800, slot: 'C', r: 1.8, label: '掩护' },
      { type: 'arrow', t: T(0.38), window: 1800, from: s.at(T(0.35)), to: s.at(T(0.55)), style: 'dashed' },
      { type: 'arrow', t: passT, window: 1400, from: h.at(passT), to: s.at(receiveT), style: 'solid' },
      { type: 'ring', t: shotT, window: 2000, slot: 'S', r: 2.5, label: '空位三分' },
      { type: 'zone', t: shotT, window: 2000, points: [[66, 36], [78, 36], [78, 47], [66, 47]], opacity: 0.15, label: '空档 +{sg}ft²' },
    ],
    switches: [],
    helps: [{ slot: 'S', target: 'C', from: T(0.32), to: T(0.66), strength: 0.8 }], // S 的防守人挂在掩护上（覆盖接球时刻）
    gravity: null,
    tacticStartMs: T(0.32),
    primaryHandlerSlot: 'H',
    D,
  };
}

// elevator_three：双掩护就位(ring×2) → 穿越(arrow:dashed) → 关门 → 三分(ring)
export function elevatorThree(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, H, C, others } = actors;
  const rest = others.filter((p) => p.id !== C.id);
  const C2 = rest[0]; // 第二掩护人
  const W = rest[1];
  const passT = T(0.54);
  const shotT = T(0.66);

  const s = new Track(74, 25);
  s.moveTo(62, 25, T(0.35), T(0.52), jit); // 穿越电梯门兜出
  const c = new Track(68, 28);
  c.moveTo(69, 27, T(0.26), T(0.34), jit); // 关门（左）
  const c2 = new Track(68, 22);
  c2.moveTo(69, 23, T(0.26), T(0.34), jit); // 关门（右）
  const h = new Track(52, 25); // 持球人远离接球点，避免其防守人站到射手身旁
  const w = new Track(82, 6);

  const tracks = { S: s, H: h, C: c, C2: c2, W0: w };
  const slotPlayers = { S, H, C, C2, W0: W };
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
      { type: 'zone', t: 0, window: 2200, points: [[56, 16], [80, 16], [80, 34], [56, 34]], opacity: 0.15, label: '电梯门就位' },
      { type: 'ring', t: T(0.32), window: 2000, slot: 'C', r: 1.8, label: '双掩护' },
      { type: 'ring', t: T(0.32), window: 2000, slot: 'C2', r: 1.8, label: '双掩护' },
      { type: 'arrow', t: T(0.38), window: 1800, from: s.at(T(0.35)), to: s.at(T(0.52)), style: 'dashed' },
      { type: 'ring', t: shotT, window: 2000, slot: 'S', r: 2.5, label: '电梯门三分' },
    ],
    switches: [],
    helps: [{ slot: 'S', target: 'C', from: T(0.34), to: T(0.6), strength: 0.75 }], // S 的防守人被门夹住（覆盖接球时刻）
    gravity: null,
    tacticStartMs: T(0.32),
    primaryHandlerSlot: 'H',
    D,
  };
}

// post_up_kickout_three：低位要球(ring) → 包夹(zone) → 分球(arrow:solid) → 三分(ring)
export function postKickout(ctx) {
  const { D, T, jit, actors, result } = ctx;
  const { S, C, others } = actors; // C = 低位持球人（assister）；others[0] = 喂球人
  const E = others[0];
  const W1 = others[1];
  const W2 = others[2];
  const entryT = T(0.25);
  const kickT = T(0.52);
  const shotT = T(0.64);

  const c = new Track(80, 28);
  c.moveTo(82, 27, T(0.3), T(0.5), jit); // 背身往里坐
  const s = new Track(68, 40);
  s.moveTo(70, 41, T(0.45), T(0.6), jit); // 沿三分线漂移
  const e = new Track(60, 25);
  const w1 = new Track(80, 44);
  const w2 = new Track(45, 15);
  w2.moveTo(42, 12, T(0.2), T(0.4), jit);

  const tracks = { S: s, C: c, E: e, W1: w1, W2: w2 };
  const slotPlayers = { S, C, E, W1, W2 };
  const entryReceiveT = passWindow(tracks, 'E', 'C', entryT);
  const kickReceiveT = passWindow(tracks, 'C', 'S', kickT);

  return {
    tracks, slotPlayers,
    ballSegs: [
      { kind: 'hold', slot: 'E', t0: 0, t1: entryT },
      { kind: 'pass', from: 'E', to: 'C', t0: entryT, t1: entryReceiveT },
      { kind: 'hold', slot: 'C', t0: entryReceiveT, t1: kickT },
      { kind: 'pass', from: 'C', to: 'S', t0: kickT, t1: kickReceiveT },
      { kind: 'hold', slot: 'S', t0: kickReceiveT, t1: shotT },
      { kind: 'shot', slot: 'S', t0: shotT, t1: shotT + 1200, result, style: 'parabola' },
    ],
    overlaySpecs: [
      { type: 'zone', t: 0, window: 2200, points: [[58, 20], [88, 20], [88, 46], [58, 46]], opacity: 0.15, label: '阵地落位' },
      { type: 'ring', t: T(0.2), window: 2000, slot: 'C', r: 2.0, label: '低位要球' },
      { type: 'zone', t: T(0.4), window: 2000, points: [[76, 22], [86, 22], [86, 34], [76, 34]], opacity: 0.15, label: '包夹' },
      { type: 'arrow', t: kickT, window: 1400, from: c.at(kickT), to: s.at(kickReceiveT), style: 'solid' },
      { type: 'ring', t: shotT, window: 2000, slot: 'S', r: 2.5, label: '三分' },
    ],
    switches: [],
    helps: [{ slot: 'S', target: 'C', from: T(0.35), to: T(0.62), strength: 0.7 }], // 射手的防守人上包夹 → 分球出空位
    gravity: null,
    tacticStartMs: T(0.2),
    primaryHandlerSlot: 'E',
    D,
  };
}
