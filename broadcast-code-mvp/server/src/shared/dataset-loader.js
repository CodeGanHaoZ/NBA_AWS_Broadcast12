// 数据集加载 —— SPEC §6：JSON 文件 + 启动全量内存索引；启动流程：
// data/games/*.json 缺失 → 先跑 tools/gen-mock-game.mjs 生成 → 读盘 → V01-V12 校验（失败拒启，退出码 1）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../config.js';
import { validateGame, reportValidation } from './dataset-validator.js';

// 数据文件缺失时运行生成器（同步，启动早期允许阻塞）
function ensureDataset() {
  const missing = ['g001.json', 'g002.json'].filter(
    (name) => !fs.existsSync(path.join(config.dataDir, name)),
  );
  if (missing.length === 0) return;
  console.log(`[dataset-loader] missing ${missing.join(', ')}, running generator...`);
  execFileSync(process.execPath, [config.generatorPath, '--all'], { stdio: 'inherit' });
}

// 读盘 + 校验；失败打印明细并退出码 1（损坏数据永不进内存）
export function loadDataset() {
  ensureDataset();
  const files = fs.readdirSync(config.dataDir).filter((f) => /^g\d{3}\.json$/.test(f)).sort();
  if (files.length < 2) {
    console.error(`[dataset-loader] expected >=2 game files in ${config.dataDir}, got ${files.length}`);
    process.exit(1);
  }
  const games = [];
  const allErrors = [];
  for (const name of files) {
    const filePath = path.join(config.dataDir, name);
    let game;
    try {
      game = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`[dataset-loader] ${filePath} :: invalid JSON :: ${e.message}`);
      process.exit(1);
    }
    allErrors.push(...validateGame(game, filePath));
    games.push(game);
  }
  if (!reportValidation(allErrors)) {
    console.error(`[dataset-loader] validation failed with ${allErrors.length} error(s), refusing to start`);
    process.exit(1);
  }
  console.log(`[dataset-loader] loaded ${games.length} games, validation V01-V12 passed`);
  return games;
}
