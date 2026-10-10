// 数据集校验器 —— dataset-contract.md §6 V01–V12 逐条实现
// 任一失败：返回 { file, path, expected, actual } 错误列表；调用方（启动流程/生成器）负责打印并非零退出。
// 设计原则：损坏数据永不进内存（对应错误码 1003 的预防）。

const IMPORTANCE_WEIGHTS = { clutch: 0.3, difficulty: 0.25, rarity: 0.2, momentum: 0.15, star: 0.1 };

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function isInt(v) { return Number.isInteger(v); }
function isStr(v) { return typeof v === 'string' && v.length > 0; }

export function validateGame(game, file) {
  const errors = [];
  const err = (path, expected, actual) => errors.push({ file, path, expected, actual });

  // ---------- 结构类 ----------
  // V01 必填字段存在且类型正确
  if (!isStr(game?.id) || !/^g\d{3}$/.test(game.id)) err('id', 'g\\d{3}', game?.id);
  if (!isStr(game?.label)) err('label', 'non-empty string', game?.label);
  if (!isStr(game?.date) || !/^\d{4}-\d{2}-\d{2}$/.test(game.date)) err('date', 'YYYY-MM-DD', game?.date);
  if (!isStr(game?.venue)) err('venue', 'non-empty string', game?.venue);
  if (!Array.isArray(game?.quarters) || game.quarters.length < 1) err('quarters', '>=1 entries', game?.quarters);
  if (!isInt(game?.score?.home) || !isInt(game?.score?.away)) err('score', '{home:int, away:int}', game?.score);
  if (!isStr(game?.court?.viewBox)) err('court.viewBox', 'string', game?.court?.viewBox);
  if (!Array.isArray(game?.plays) || game.plays.length === 0) err('plays', 'non-empty array', game?.plays);

  const rosterIds = new Set();
  for (const side of ['home', 'away']) {
    const team = game?.[side];
    if (!isStr(team?.teamId) || !isStr(team?.name) || !/^[A-Z]{3}$/.test(team?.abbr ?? '')) {
      err(`${side}`, 'teamId/name/abbr(3 upper)', team && { teamId: team.teamId, abbr: team.abbr });
    }
    // V02 roster 恒 5 人/队
    if (!Array.isArray(team?.players) || team.players.length !== 5) {
      err(`${side}.players`, 'exactly 5', team?.players?.length);
      continue;
    }
    for (const p of team.players) {
      if (!isStr(p.id) || !isStr(p.name) || !isInt(p.number) || typeof p.star !== 'boolean') {
        err(`${side}.players[]`, '{id,name,number:int,star:bool}', p);
      }
      if (rosterIds.has(p.id)) err(`${side}.players[].id`, 'unique', p.id); // V02 全场唯一
      rosterIds.add(p.id);
    }
  }

  // V03 score = Σ quarters
  if (Array.isArray(game?.quarters) && isInt(game?.score?.home)) {
    const sumH = game.quarters.reduce((s, q) => s + (q.home ?? 0), 0);
    const sumA = game.quarters.reduce((s, q) => s + (q.away ?? 0), 0);
    if (sumH !== game.score.home || sumA !== game.score.away) {
      err('score', `Σquarters = ${sumH}-${sumA}`, `${game.score.home}-${game.score.away}`);
    }
  }

  const plays = Array.isArray(game?.plays) ? game.plays : [];
  let clutchCount = 0;
  let starShooterPlays = 0;
  const starIds = new Set(
    [...(game?.home?.players ?? []), ...(game?.away?.players ?? [])].filter((p) => p.star).map((p) => p.id),
  );

  plays.forEach((play, i) => {
    const P = `plays[${i}]`;
    if (!isStr(play?.id)) err(`${P}.id`, 'string', play?.id);
    if (!isInt(play?.quarter)) err(`${P}.quarter`, 'int', play?.quarter);
    if (!isStr(play?.clock)) err(`${P}.clock`, 'MM:SS.s', play?.clock);
    if (!isStr(play?.label)) err(`${P}.label`, 'string', play?.label);
    if (!Array.isArray(play?.tags) || play.tags.length < 1) err(`${P}.tags`, '>=1 tags', play?.tags);
    if (!isInt(play?.scoreBefore?.home) || !isInt(play?.scoreBefore?.away)) {
      err(`${P}.scoreBefore`, '{home:int, away:int}', play?.scoreBefore);
    }
    if (!isStr(play?.actors?.shooter)) err(`${P}.actors.shooter`, 'string', play?.actors?.shooter);
    const offenseSide = play?.possession?.offense;
    if (offenseSide !== 'home' && offenseSide !== 'away') {
      err(`${P}.possession.offense`, 'home|away', offenseSide);
    }
    const defenseSide = offenseSide === 'home' ? 'away' : 'home';

    // features 七项
    for (const k of ['shotDifficulty', 'gravity', 'clutchScore', 'spacingGain', 'offBallMovement']) {
      if (!isNum(play?.features?.[k])) err(`${P}.features.${k}`, 'number', play?.features?.[k]);
    }
    if (!isInt(play?.features?.defenseCollapseMs)) err(`${P}.features.defenseCollapseMs`, 'int', play?.features?.defenseCollapseMs);
    if (!isInt(play?.features?.passCount)) err(`${P}.features.passCount`, 'int', play?.features?.passCount);

    // V04 帧数/步进/durationMs
    const frames = play?.frames;
    if (!Array.isArray(frames) || frames.length < 100 || frames.length > 240) {
      err(`${P}.frames`, 'length 100..240', frames?.length);
    } else {
      if (play.durationMs !== frames.length * 100) err(`${P}.durationMs`, frames.length * 100, play.durationMs);
      frames.forEach((f, j) => {
        if (f.t !== j * 100) err(`${P}.frames[${j}].t`, j * 100, f.t);
        // V05 每帧恒 10 人且 id 全集 == roster 全集；防守方至少 1 个 defender
        if (!Array.isArray(f.players) || f.players.length !== 10) {
          err(`${P}.frames[${j}].players`, 'exactly 10', f.players?.length);
        } else {
          const ids = new Set(f.players.map((p) => p.id));
          if (ids.size !== 10 || ![...ids].every((id) => rosterIds.has(id))) {
            err(`${P}.frames[${j}].players[].id`, 'roster set', [...ids].join(','));
          }
          const defenders = f.players.filter((p) => p.team === defenseSide && p.role === 'defender');
          if (defenders.length < 1) err(`${P}.frames[${j}]`, '>=1 defender on defense', 0);
        }
        // V06 坐标全域 + 球高上限
        if (!isNum(f.ball?.x) || !isNum(f.ball?.y) || !isNum(f.ball?.z) || f.ball.z < 0 || f.ball.z > 16) {
          err(`${P}.frames[${j}].ball`, 'x/y number, 0<=z<=16', f.ball);
        }
        for (const p of f.players ?? []) {
          if (!(p.x >= 0 && p.x <= 94 && p.y >= 0 && p.y <= 50)) {
            err(`${P}.frames[${j}].players(${p.id})`, '0<=x<=94, 0<=y<=50', `${p.x},${p.y}`);
          }
          if (!['handler', 'cutter', 'screener', 'defender', 'help'].includes(p.role)) {
            err(`${P}.frames[${j}].players(${p.id}).role`, 'role enum', p.role);
          }
        }
        // V07 相邻帧单球员位移 <= 2.6 ft
        if (j > 0) {
          const prev = frames[j - 1];
          for (const p of f.players) {
            const q = prev.players.find((r) => r.id === p.id);
            if (q && Math.hypot(p.x - q.x, p.y - q.y) > 2.6) {
              err(`${P}.frames[${j}](${p.id})`, 'step <= 2.6ft', Math.hypot(p.x - q.x, p.y - q.y).toFixed(3));
            }
          }
        }
      });
    }

    // V08 overlays
    const overlays = play?.overlays;
    if (!Array.isArray(overlays) || overlays.length < 3) {
      err(`${P}.overlays`, '>=3', overlays?.length);
    } else {
      overlays.forEach((o, j) => {
        if (!['arrow', 'ring', 'zone'].includes(o.type)) err(`${P}.overlays[${j}].type`, 'arrow|ring|zone', o.type);
        if (!(isInt(o.t0) && isInt(o.t1) && o.t0 >= 0 && o.t0 < o.t1 && o.t1 <= play.durationMs)) {
          err(`${P}.overlays[${j}]`, `0<=t0<t1<=${play.durationMs}`, `${o.t0}-${o.t1}`);
        }
        if (!(o.t1 - o.t0 >= 800 && o.t1 - o.t0 <= 3000)) {
          err(`${P}.overlays[${j}]`, 'window 800..3000', o.t1 - o.t0);
        }
        if (o.type === 'ring' && !rosterIds.has(o.playerId)) err(`${P}.overlays[${j}].playerId`, 'roster id', o.playerId);
      });
    }

    // V09 narration：每句（analysis 槽豁免）存在锚点 overlay 使 t0 恒等；t1<=durationMs；highlights ⊆ text 且 <=3
    const narration = play?.narration;
    if (!Array.isArray(narration) || narration.length < 3) {
      err(`${P}.narration`, '>=3 sentences', narration?.length);
    } else {
      const anchorT0s = new Set((overlays ?? []).map((o) => o.t0));
      narration.forEach((n, j) => {
        if (n.slot !== 'analysis' && !anchorT0s.has(n.t0)) {
          err(`${P}.narration[${j}].t0`, 'equal to some overlay.t0', n.t0);
        }
        if (!(isInt(n.t0) && isInt(n.t1) && n.t0 >= 0 && n.t0 < n.t1 && n.t1 <= play.durationMs)) {
          err(`${P}.narration[${j}]`, `0<=t0<t1<=${play.durationMs}`, `${n.t0}-${n.t1}`);
        }
        if (!['calm', 'excited', 'clutch'].includes(n.tone)) err(`${P}.narration[${j}].tone`, 'tone enum', n.tone);
        if (typeof n.text === 'string' && (n.text.includes('{') || n.text.includes('}'))) {
          err(`${P}.narration[${j}].text`, 'no residual braces', n.text);
        }
        if (!Array.isArray(n.highlights) || n.highlights.length > 3) {
          err(`${P}.narration[${j}].highlights`, '<=3', n.highlights?.length);
        } else if (!n.highlights.every((h) => typeof h === 'string' && n.text.includes(h))) {
          err(`${P}.narration[${j}].highlights`, 'substring of text', n.highlights);
        }
      });
    }

    // V10 importance：子分 [0,1]，total = 加权和 ±0.001
    const b = play?.importance?.breakdown ?? {};
    for (const k of Object.keys(IMPORTANCE_WEIGHTS)) {
      if (!(isNum(b[k]) && b[k] >= 0 && b[k] <= 1)) err(`${P}.importance.breakdown.${k}`, '0..1', b[k]);
    }
    const expectedTotal = Object.entries(IMPORTANCE_WEIGHTS).reduce((s, [k, w]) => s + w * (b[k] ?? 0), 0);
    if (isNum(play?.importance?.total) && Math.abs(play.importance.total - expectedTotal) > 0.001) {
      err(`${P}.importance.total`, expectedTotal.toFixed(3), play.importance.total);
    }

    // V11 clutch 计数与 tags
    if ((play?.tags ?? []).includes('clutch')) clutchCount += 1;
    // V12 shooter 在 roster；star 射手计数
    if (rosterIds.has(play?.actors?.shooter)) {
      if (starIds.has(play.actors.shooter)) starShooterPlays += 1;
    } else {
      err(`${P}.actors.shooter`, 'in roster', play?.actors?.shooter);
    }
  });

  // V10 plays 按 importance.total 降序
  for (let i = 1; i < plays.length; i++) {
    if ((plays[i].importance?.total ?? 0) > (plays[i - 1].importance?.total ?? 0)) {
      err(`plays[${i}].importance.total`, `<= plays[${i - 1}] (${plays[i - 1].importance?.total})`, plays[i].importance?.total);
    }
  }
  // V11 clutch 回合数 == 2
  if (plays.length && clutchCount !== 2) err('plays', 'exactly 2 clutch plays', clutchCount);
  // V12 star 射手至少 3 回合
  if (plays.length && starShooterPlays < 3) err('plays', '>=3 star-shooter plays', starShooterPlays);

  return errors;
}

// 启动门禁：打印 文件路径 + JSON 路径 + 期望/实际；有错误返回 false
export function reportValidation(allErrors) {
  for (const e of allErrors) {
    console.error(`[dataset-validator] ${e.file} :: ${e.path} :: expected ${e.expected}, actual ${JSON.stringify(e.actual)}`);
  }
  return allErrors.length === 0;
}
