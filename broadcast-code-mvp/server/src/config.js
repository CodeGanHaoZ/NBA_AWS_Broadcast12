// 配置加载 —— 唯一读取环境变量的位置
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = Object.freeze({
  port: Number(process.env.PORT ?? 3000),
  // CORS 显式白名单（SPEC §12：vite dev :5173 / vite preview :4173）；生产禁止通配符
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  serverRoot: path.resolve(__dirname, '..'),
  dataDir: path.resolve(__dirname, '..', 'data', 'games'),
  generatorPath: path.resolve(__dirname, '..', 'tools', 'gen-mock-game.mjs'),
});
