// 路由 —— 只挂端点，不写逻辑（SPEC §5 端点清单 / openapi.yaml v1.0.1）
import { Router } from 'express';

export function createGamesRouter(controller) {
  const router = Router();
  router.get('/games', controller.listGames);
  router.get('/games/:gameId', controller.getGame);
  router.get('/games/:gameId/plays', controller.listPlays);
  router.get('/games/:gameId/plays/:playId', controller.getPlay);
  return router;
}
