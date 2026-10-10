// 控制器 —— 参数校验 → 调 service → 组装响应；零业务逻辑
// Express 5 规范（K2/K4）：一律 res.status(n).json()；req.query 只读（K3）
import { ok } from '../shared/envelope.js';
import { BadRequestError } from '../shared/errors.js';

// top 参数校验：整数 1..50，默认 10（openapi.yaml）；非法 → 1001
function parseTop(raw) {
  if (raw === undefined) return 10;
  if (!/^\d+$/.test(String(raw))) throw new BadRequestError(`Invalid top: ${raw}`);
  const n = Number(raw);
  if (n < 1 || n > 50) throw new BadRequestError(`Invalid top: ${raw}, expected 1..50`);
  return n;
}

export function createGamesController(service) {
  return {
    listGames(req, res) {
      ok(res, service.listGames());
    },
    getGame(req, res) {
      ok(res, service.getGameDetail(req.params.gameId));
    },
    listPlays(req, res) {
      const top = parseTop(req.query.top);
      ok(res, service.listPlays(req.params.gameId, top));
    },
    getPlay(req, res) {
      ok(res, service.getPlay(req.params.gameId, req.params.playId));
    },
  };
}
