// 解说引擎单测 —— narration-rules.md §9 的 5 条验收锚点逐条实现
// 数据基座：真实生成器产物（缺失时先跑生成器，与启动流程一致）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { narrate } from '../src/narration/narration.service.js';
import { COMMENTARY_RULES, matchRule } from '../src/narration/commentary-rules.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(SERVER_ROOT, 'data', 'games');

function loadAll() {
  const files = ['g001.json', 'g002.json'];
  if (!files.every((f) => fs.existsSync(path.join(DATA_DIR, f)))) {
    execFileSync(process.execPath, [path.join(SERVER_ROOT, 'tools', 'gen-mock-game.mjs'), '--all'], { stdio: 'inherit' });
  }
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
}

const games = loadAll();
const allPlays = games.flatMap((g) => g.plays.map((p) => ({ play: p, game: g })));

// 锚点 1：同优先级规则交换书写顺序 → 产物必须变化（扫描顺序确定性）
test('anchor1: same-priority rules swap changes matched rule', () => {
  const { play, game } = allPlays[0];
  const probeA = { id: 'probe_a', slot: 'setup', priority: 999, when: {}, template: 'setup_generic_01', tone: 'calm' };
  const probeB = { id: 'probe_b', slot: 'setup', priority: 999, when: {}, template: 'setup_clutch_01', tone: 'clutch' };
  const forward = [...COMMENTARY_RULES, probeA, probeB];
  const swapped = [...COMMENTARY_RULES, probeB, probeA];
  assert.equal(matchRule('setup', { tags: [], clutch: false, result: 'made', star: false, importance: 0, shotDifficulty: 0, gravity: 0, defenseCollapseMs: 0, passCount: 0, spacingGain: 0, clockSec: 100 }, forward).id, 'probe_a');
  assert.equal(matchRule('setup', { tags: [], clutch: false, result: 'made', star: false, importance: 0, shotDifficulty: 0, gravity: 0, defenseCollapseMs: 0, passCount: 0, spacingGain: 0, clockSec: 100 }, swapped).id, 'probe_b');
  const outA = narrate(play, game, forward);
  const outB = narrate(play, game, swapped);
  assert.notDeepEqual(outA, outB);
});

// 锚点 2：任意 Play 删除 features → 产物 == §6 L3 固定三句
test('anchor2: missing features yields exactly the L3 three-sentence fallback', () => {
  for (const { play, game } of allPlays) {
    const broken = { ...play, features: undefined };
    const out = narrate(broken, game);
    assert.equal(out.length, 3, `${play.id} L3 sentence count`);
    assert.equal(out[0].t0, 0);
    assert.ok(out[0].t0 < out[1].t0 && out[1].t0 < out[2].t0, 'L3 t0 strictly increasing');
    assert.ok(out.every((n) => n.tone === 'calm'), 'L3 all calm');
    assert.ok(out.every((n) => Array.isArray(n.highlights) && n.highlights.length === 0), 'L3 highlights empty');
    assert.ok(out.every((n) => n.t1 > n.t0 && n.t1 <= play.durationMs), 'L3 t1 within duration');
    assert.ok(!out.some((n) => n.text.includes('{') || n.text.includes('}')), 'L3 no residual braces');
  }
});

// 锚点 3：全部 16 回合 —— 每句（analysis 除外）存在锚点 overlay 使 narration.t0 === anchor.t0
test('anchor3: every non-analysis sentence t0 equals some overlay.t0', () => {
  assert.equal(allPlays.length, 16);
  for (const { play, game } of allPlays) {
    const narration = narrate(play, game);
    const anchorT0s = new Set(play.overlays.map((o) => o.t0));
    for (const n of narration) {
      if (n.slot === 'analysis') continue; // §3 豁免槽位
      assert.ok(anchorT0s.has(n.t0), `${play.id} [${n.slot}] t0=${n.t0} has no anchor overlay`);
    }
  }
});

// 锚点 4：全部 16 回合 —— text 不含 { }；highlights 全部为 text 子串且 ≤3
test('anchor4: text has no residual braces; highlights are substrings and <=3', () => {
  for (const { play, game } of allPlays) {
    for (const n of narrate(play, game)) {
      assert.ok(!n.text.includes('{') && !n.text.includes('}'), `${play.id} residual braces: ${n.text}`);
      assert.ok(n.highlights.length <= 3, `${play.id} highlights >3`);
      for (const h of n.highlights) {
        assert.ok(n.text.includes(h), `${play.id} highlight "${h}" not substring of "${n.text}"`);
      }
    }
  }
});

// 锚点 5：全部 16 回合 —— setup.t0===0，句间 t0 严格递增，t1 ≤ durationMs
test('anchor5: setup.t0===0, t0 strictly increasing, t1<=durationMs', () => {
  for (const { play, game } of allPlays) {
    const narration = narrate(play, game);
    assert.ok(narration.length >= 3, `${play.id} needs >=3 sentences`);
    assert.equal(narration[0].slot, 'setup');
    assert.equal(narration[0].t0, 0, `${play.id} setup.t0 must be 0`);
    for (let i = 1; i < narration.length; i++) {
      assert.ok(narration[i].t0 > narration[i - 1].t0, `${play.id} t0 not strictly increasing at ${i}`);
    }
    for (const n of narration) {
      assert.ok(n.t1 > n.t0 && n.t1 <= play.durationMs, `${play.id} t1=${n.t1} out of bounds`);
    }
  }
});

// 补充：t1 展示时长公式边界（§4 clamp(1600, 40·chars+150·puncts+600, 6000) 与最短驻留 800ms）
test('t1 formula: display window clamped to [1600,6000], min dwell 800ms', () => {
  const { play, game } = allPlays.find(({ play }) => play.narration.some((n) => n.slot === 'analysis'));
  const narration = narrate(play, game);
  for (const n of narration) {
    assert.ok(n.t1 - n.t0 >= 800, `dwell ${n.t1 - n.t0} < 800ms`);
  }
  // 极短句也应 ≥1600ms 展示（无下一个锚点压缩时）
  const analysis = narration[narration.length - 1];
  if (analysis.slot === 'analysis') {
    const chars = analysis.text.length;
    const puncts = (analysis.text.match(/[，。——！？]/g) || []).length;
    const expected = Math.min(6000, Math.max(1600, 40 * chars + 150 * puncts + 600));
    assert.equal(analysis.t1, Math.min(analysis.t0 + expected, play.durationMs));
  }
});
