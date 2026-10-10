// 内存索引 —— 启动时一次性构建，请求路径纯读取（SPEC §6）
// 结构：gamesById: Map<gameId, { game, summary, detail, playsSorted, playsById }>
export function buildStore(games) {
  const gamesById = new Map();

  for (const game of games) {
    const summary = {
      id: game.id,
      label: game.label,
      date: game.date,
      home: { abbr: game.home.abbr, name: game.home.name },
      away: { abbr: game.away.abbr, name: game.away.name },
      possessionCount: game.plays.length,
    };
    const detail = {
      id: game.id,
      label: game.label,
      date: game.date,
      venue: game.venue,
      home: game.home,
      away: game.away,
      quarters: game.quarters,
      score: game.score,
      court: game.court,
    };
    // plays 入库已按 importance.total 降序（validator V10 保证），此处防御性再排一次
    const playsSorted = [...game.plays].sort((a, b) => b.importance.total - a.importance.total);
    const playsById = new Map(game.plays.map((p) => [p.id, p]));
    gamesById.set(game.id, { game, summary, detail, playsSorted, playsById });
  }

  return {
    gamesById,
    listSummaries: () => [...gamesById.values()].map((v) => v.summary),
    count: () => gamesById.size,
  };
}
