// 业务逻辑层 —— 不碰 req/res；资源不存在抛 NotFoundError（1002）
import { NotFoundError } from '../shared/errors.js';

// 回合摘要投影（openapi PlaySummary：id/quarter/clock/label/tags/importance/durationMs）
function toPlaySummary(play) {
  return {
    id: play.id,
    quarter: play.quarter,
    clock: play.clock,
    label: play.label,
    tags: play.tags,
    importance: play.importance,
    durationMs: play.durationMs,
  };
}

export function createGamesService(repository) {
  return {
    listGames() {
      return repository.findAllSummaries();
    },

    getGameDetail(gameId) {
      const entry = repository.findGameById(gameId);
      if (!entry) throw new NotFoundError(`Game not found: ${gameId}`);
      return entry.detail;
    },

    // 回合列表：importance.total 降序（入库已排好），top 截断
    listPlays(gameId, top) {
      const plays = repository.findPlaysSorted(gameId);
      if (!plays) throw new NotFoundError(`Game not found: ${gameId}`);
      return plays.slice(0, top).map(toPlaySummary);
    },

    // 单回合全量：meta + features + frames + overlays + narration
    getPlay(gameId, playId) {
      if (!repository.findGameById(gameId)) throw new NotFoundError(`Game not found: ${gameId}`);
      const play = repository.findPlayById(gameId, playId);
      if (!play) throw new NotFoundError(`Play not found: ${gameId}/${playId}`);
      return play;
    },
  };
}
