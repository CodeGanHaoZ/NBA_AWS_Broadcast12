// 场次剧本 —— dataset-contract §5.1/§5.2/§5.3 锁定输入（阵容 + 逐回合剧本 + 静态比分）
// clockSec/scoreBefore/result 为剧本静态给定（§7：8 回合相互独立，比分由剧本静态给定）

export const COURT = Object.freeze({
  widthFt: 94,
  heightFt: 50,
  viewBox: '0 0 940 500',
  leftHoop: [40, 250],
  rightHoop: [900, 250],
  threePtRadius: 237.5,
  cornerThreeInset: 30,
});

const DAL = {
  teamId: 'dal', name: '达拉斯独行侠', abbr: 'DAL', color: '#00538C',
  players: [
    { id: 'dal-77', name: 'Luka Doncic', number: 77, star: true },
    { id: 'dal-11', name: 'Kyrie Irving', number: 11, star: true },
    { id: 'dal-25', name: 'P.J. Washington', number: 25, star: false },
    { id: 'dal-21', name: 'Daniel Gafford', number: 21, star: false },
    { id: 'dal-31', name: 'Klay Thompson', number: 31, star: false },
  ],
};
const HOU = {
  teamId: 'hou', name: '休斯顿火箭', abbr: 'HOU', color: '#CE1141',
  players: [
    { id: 'hou-15', name: 'Alperen Sengun', number: 15, star: true },
    { id: 'hou-4', name: 'Jalen Green', number: 4, star: false },
    { id: 'hou-5', name: 'Fred VanVleet', number: 5, star: false },
    { id: 'hou-9', name: 'Dillon Brooks', number: 9, star: false },
    { id: 'hou-10', name: 'Jabari Smith Jr.', number: 10, star: false },
  ],
};
const GSW = {
  teamId: 'gsw', name: '金州勇士', abbr: 'GSW', color: '#1D428A',
  players: [
    { id: 'gsw-30', name: 'Stephen Curry', number: 30, star: true },
    { id: 'gsw-23', name: 'Draymond Green', number: 23, star: false },
    { id: 'gsw-22', name: 'Andrew Wiggins', number: 22, star: false },
    { id: 'gsw-8', name: 'Buddy Hield', number: 8, star: false },
    { id: 'gsw-32', name: 'Trayce Jackson-Davis', number: 32, star: false },
  ],
};
const LAL = {
  teamId: 'lal', name: '洛杉矶湖人', abbr: 'LAL', color: '#552583',
  players: [
    { id: 'lal-23', name: 'LeBron James', number: 23, star: true },
    { id: 'lal-3', name: 'Anthony Davis', number: 3, star: true },
    { id: 'lal-15', name: 'Austin Reaves', number: 15, star: false },
    { id: 'lal-1', name: "D'Angelo Russell", number: 1, star: false },
    { id: 'lal-12', name: 'Taurean Prince', number: 12, star: false },
  ],
};

// g001 剧本（§5.2，playIndex 0..7；含 2 clutch）
const SCRIPT_G001 = [
  { label: '东契奇后撤步三分', archetype: 'iso_stepback_deep_three', shooter: 'dal-77', defender: 'hou-9', screener: null, assister: null, result: 'made', clockSec: 512.0, scoreBefore: { home: 57, away: 53 } },
  { label: '加福德空接炸扣', archetype: 'horns_dunk', shooter: 'dal-21', defender: 'hou-15', screener: 'dal-25', assister: 'dal-11', result: 'made', clockSec: 435.0, scoreBefore: { home: 59, away: 55 } },
  { label: '汤普森绕掩护三分', archetype: 'offball_flare_three', shooter: 'dal-31', defender: 'hou-10', screener: 'dal-21', assister: 'dal-77', result: 'missed', clockSec: 363.0, scoreBefore: { home: 61, away: 58 } },
  { label: '欧文挡拆突破上篮', archetype: 'pick_and_roll_layup', shooter: 'dal-11', defender: 'hou-5', screener: 'dal-21', assister: null, result: 'made', clockSec: 287.0, scoreBefore: { home: 64, away: 60 } },
  { label: '华盛顿追身三分', archetype: 'fast_break_three', shooter: 'dal-25', defender: 'hou-4', screener: null, assister: 'dal-77', result: 'missed', clockSec: 238.0, scoreBefore: { home: 66, away: 63 } },
  { label: '汤普森电梯门三分', archetype: 'elevator_three', shooter: 'dal-31', defender: 'hou-10', screener: 'dal-21', assister: 'dal-11', result: 'missed', clockSec: 161.0, scoreBefore: { home: 69, away: 66 } },
  { label: '东契奇压哨超远三分', archetype: 'buzzer_beater_deep_three', shooter: 'dal-77', defender: 'hou-9', screener: null, assister: 'dal-11', result: 'made', clockSec: 2.4, scoreBefore: { home: 85, away: 80 } },
  { label: '东契奇关键中投', archetype: 'pick_and_roll_midrange', shooter: 'dal-77', defender: 'hou-15', screener: 'dal-21', assister: null, result: 'made', clockSec: 28.0, scoreBefore: { home: 82, away: 80 } },
];

// g002 剧本（§5.3，playIndex 0..7；含 2 clutch；进攻方向左篮筐，输出 x 镜像）
const SCRIPT_G002 = [
  { label: '詹姆斯挡拆强突', archetype: 'pick_and_roll_layup', shooter: 'lal-23', defender: 'gsw-23', screener: 'lal-3', assister: null, result: 'made', clockSec: 540.0, scoreBefore: { home: 79, away: 83 } },
  { label: '希尔德绕掩护三分', archetype: 'offball_flare_three', shooter: 'gsw-8', defender: 'lal-1', screener: 'gsw-32', assister: 'gsw-30', result: 'missed', clockSec: 472.0, scoreBefore: { home: 81, away: 85 } },
  { label: '追梦分球库里三分', archetype: 'post_up_kickout_three', shooter: 'gsw-30', defender: 'lal-15', screener: 'gsw-23', assister: 'gsw-23', result: 'missed', clockSec: 398.0, scoreBefore: { home: 83, away: 87 } },
  { label: '戴维斯转换扣篮', archetype: 'fast_break_dunk', shooter: 'lal-3', defender: 'gsw-22', screener: null, assister: null, result: 'made', clockSec: 341.0, scoreBefore: { home: 85, away: 90 } },
  { label: '库里后撤步三分', archetype: 'iso_stepback_deep_three', shooter: 'gsw-30', defender: 'lal-12', screener: null, assister: null, result: 'missed', clockSec: 265.0, scoreBefore: { home: 88, away: 92 } },
  { label: '杰克逊-戴维斯空接', archetype: 'horns_dunk', shooter: 'gsw-32', defender: 'lal-3', screener: 'gsw-23', assister: 'gsw-30', result: 'made', clockSec: 190.0, scoreBefore: { home: 93, away: 95 } },
  { label: '库里压哨超远三分', archetype: 'buzzer_beater_deep_three', shooter: 'gsw-30', defender: 'lal-15', screener: null, assister: 'gsw-23', result: 'made', clockSec: 1.8, scoreBefore: { home: 107, away: 110 } },
  { label: '詹姆斯关键中投', archetype: 'pick_and_roll_midrange', shooter: 'lal-23', defender: 'gsw-32', screener: 'lal-3', assister: null, result: 'made', clockSec: 26.0, scoreBefore: { home: 105, away: 108 } },
];

export const GAME_DEFS = Object.freeze([
  {
    id: 'g001', label: '火箭 vs 独行侠 · 第三节', date: '2025-01-16',
    venue: 'American Airlines Center', quarter: 3, mirror: false,
    home: DAL, away: HOU,
    quarters: [{ q: 1, home: 30, away: 28 }, { q: 2, home: 27, away: 25 }, { q: 3, home: 31, away: 29 }],
    script: SCRIPT_G001,
  },
  {
    id: 'g002', label: '湖人 vs 勇士 · 第四节', date: '2025-01-25',
    venue: 'Chase Center', quarter: 4, mirror: true,
    home: GSW, away: LAL,
    quarters: [{ q: 1, home: 26, away: 24 }, { q: 2, home: 28, away: 30 }, { q: 3, home: 25, away: 29 }, { q: 4, home: 31, away: 30 }],
    script: SCRIPT_G002,
  },
]);
