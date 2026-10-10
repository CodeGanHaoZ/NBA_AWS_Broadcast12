// 特性开关 + 健康检查 —— openapi.yaml /api/v1/meta/flags 与 /health
// video 备路 MVP 恒关闭（dataset-contract §2.3 video 字段恒为关闭态）；tts 可选增强默认开
import { Router } from 'express';
import { ok } from '../shared/envelope.js';

export function createMetaRouter() {
  const router = Router();
  router.get('/meta/flags', (req, res) => {
    ok(res, { video: false, tts: true });
  });
  return router;
}

export function healthHandler(store) {
  return (req, res) => {
    res.status(200).json({ status: 'ok', games: store.count() });
  };
}
