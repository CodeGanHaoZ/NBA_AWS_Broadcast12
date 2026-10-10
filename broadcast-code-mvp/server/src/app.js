// 入口 —— 只装配：启动流程（加载→校验→索引→解说预计算→监听）+ 中间件 + 路由，零业务逻辑
// 启动顺序（SPEC §6 / dataset-contract §6）：任何一步失败立即退出，损坏数据永不进内存
import express from 'express';
import { config } from './config.js';
import { loadDataset } from './shared/dataset-loader.js';
import { buildStore } from './shared/store.js';
import { corsMiddleware } from './shared/middleware/cors.js';
import { requestLog } from './shared/middleware/request-log.js';
import { notFoundHandler, errorHandler } from './shared/middleware/error-handler.js';
import { createGamesRepository } from './games/games.repository.js';
import { createGamesService } from './games/games.service.js';
import { createGamesController } from './games/games.controller.js';
import { createGamesRouter } from './games/games.routes.js';
import { createMetaRouter, healthHandler } from './meta/meta.routes.js';
import { narrate } from './narration/narration.service.js';

function bootstrap() {
  // 1. 加载 data/games/*.json（缺失则先跑生成器）→ 2. V01-V12 校验（失败拒启，退出码 1）
  const games = loadDataset();
  // 3. 内存索引
  const store = buildStore(games);
  // 4. narration 预计算挂到每个 play（引擎为纯函数，与生成器产物一致；保证 analyze/narrate 启动时预计算）
  for (const game of games) {
    for (const play of game.plays) {
      play.narration = narrate(play, game);
    }
  }

  // 5. 装配 Express（分层：routes → controller → service → repository → store）
  const repository = createGamesRepository(store);
  const service = createGamesService(repository);
  const controller = createGamesController(service);

  const app = express();
  app.disable('x-powered-by');
  app.use(corsMiddleware(config.corsOrigins));
  app.use(requestLog);
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', healthHandler(store));
  app.use('/api/v1', createGamesRouter(controller));
  app.use('/api/v1', createMetaRouter());

  app.use(notFoundHandler); // K1：SPA/通配兜底用 app.use，不用 '*' 路由
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[server] broadcast-code-mvp listening on http://localhost:${config.port} (${store.count()} games indexed)`);
  });
  return app;
}

bootstrap();
