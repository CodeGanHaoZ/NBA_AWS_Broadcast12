// archetype 注册表 —— dataset-contract §5.4 定义表（rarity / 时长区间 / tags / 事件序列→overlay 映射）
import { isoStepback, buzzerBeater } from './choreo/iso.mjs';
import { pnrLayup, pnrMidrange, hornsDunk } from './choreo/pnr.mjs';
import { flareThree, elevatorThree, postKickout } from './choreo/offball.mjs';
import { fastBreakThree, fastBreakDunk } from './choreo/transition.mjs';

export const ARCHETYPES = Object.freeze({
  iso_stepback_deep_three: { rarity: 0.85, durationRange: [10000, 13000], tags: ['deep_three'], choreo: isoStepback },
  horns_dunk: { rarity: 0.8, durationRange: [10000, 12000], tags: ['dunk', 'alley_oop'], choreo: hornsDunk },
  offball_flare_three: { rarity: 0.6, durationRange: [11000, 14000], tags: ['catch_shoot'], choreo: flareThree },
  pick_and_roll_layup: { rarity: 0.4, durationRange: [10000, 12000], tags: ['pick_roll'], choreo: pnrLayup },
  fast_break_three: { rarity: 0.65, durationRange: [10000, 11000], tags: ['transition'], choreo: fastBreakThree },
  elevator_three: { rarity: 0.75, durationRange: [12000, 14000], tags: ['elevator'], choreo: elevatorThree },
  buzzer_beater_deep_three: { rarity: 1.0, durationRange: [10000, 12000], tags: ['buzzer', 'clutch'], choreo: buzzerBeater },
  pick_and_roll_midrange: { rarity: 0.45, durationRange: [10000, 12000], tags: ['pick_roll', 'clutch'], choreo: pnrMidrange },
  post_up_kickout_three: { rarity: 0.55, durationRange: [11000, 13000], tags: ['post_up'], choreo: postKickout },
  fast_break_dunk: { rarity: 0.6, durationRange: [10000, 11000], tags: ['transition', 'dunk'], choreo: fastBreakDunk },
});
