// 数据访问层 —— 只读内存索引，不含业务逻辑
export function createGamesRepository(store) {
  return {
    findAllSummaries: () => store.listSummaries(),
    findGameById: (gameId) => store.gamesById.get(gameId) ?? null,
    findPlaysSorted: (gameId) => store.gamesById.get(gameId)?.playsSorted ?? null,
    findPlayById: (gameId, playId) => store.gamesById.get(gameId)?.playsById.get(playId) ?? null,
    gameCount: () => store.count(),
  };
}
