// 解说引擎 —— narration-rules.md §1 流水线逐字实现
// 纯函数：narrate(play, game) → Narration[]，无副作用，任何路径不抛错（§6 三级兜底）。
import { COMMENTARY_RULES, matchRule } from './commentary-rules.js';
import { TEMPLATES, FALLBACK_TEMPLATE_BY_SLOT, renderTemplate } from './templates.js';

const clamp = (lo, v, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
const ceil100 = (v) => Math.ceil(v / 100) * 100;

// §4 展示时长公式（逐字）
function displayMsFor(text) {
  const chars = text.length;
  const puncts = (text.match(/[，。——！？]/g) || []).length;
  return clamp(1600, 40 * chars + 150 * puncts + 600, 6000);
}

// ---- PlayContext 构建（§5.3 槽位来源表）----
function buildRoster(game) {
  const playersById = new Map();
  const teamOf = new Map();
  for (const side of ['home', 'away']) {
    const team = game?.[side];
    for (const p of team?.players ?? []) {
      playersById.set(p.id, p);
      teamOf.set(p.id, team.name);
    }
  }
  return { playersById, teamOf };
}

function clockToSec(clock) {
  const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(clock ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function frameAt(frames, t0) {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  let best = frames[0];
  for (const f of frames) {
    if (Math.abs(f.t - t0) < Math.abs(best.t - t0)) best = f;
  }
  return best;
}

// 在出手帧实测：射手到篮筐距离 distFt、6ft 内防守人数 n1
function measureAtShot(play, finishAnchorT0) {
  const frame = frameAt(play.frames, finishAnchorT0);
  const hoop = play.possession?.hoop;
  const shooterId = play.actors?.shooter;
  if (!frame || !hoop || !shooterId) return { distFt: null, nDef: null };
  const me = frame.players.find((p) => p.id === shooterId);
  if (!me) return { distFt: null, nDef: null };
  const distFt = round1(Math.hypot(hoop[0] - me.x, hoop[1] - me.y));
  const nDef = frame.players.filter(
    (p) => p.team !== me.team && Math.hypot(p.x - me.x, p.y - me.y) <= 6,
  ).length;
  return { distFt, nDef };
}

const ACTION_PHRASES = [
  ['pick_roll', '直杀篮下'],
  ['catch_shoot', '绕到侧翼'],
  ['elevator', '绕到侧翼'],
  ['deep_three', '连续变向'],
  ['transition', '长驱直入'],
];

const REASON_PHRASES = {
  clutch: '胜在关键时刻的价值',
  difficulty: '胜在出手难度',
  rarity: '胜在回合稀有度',
  momentum: '胜在团队联动',
  star: '胜在球星成色',
};

function buildFacts(play, playersById) {
  const tags = Array.isArray(play.tags) ? play.tags : [];
  const f = play.features ?? {};
  const shooter = playersById.get(play.actors?.shooter);
  return {
    tags,
    clutch: tags.includes('clutch'),
    result: play.result === 'missed' ? 'missed' : 'made',
    star: shooter?.star === true,
    importance: play.importance?.total ?? 0,
    shotDifficulty: f.shotDifficulty ?? 0,
    gravity: f.gravity ?? 0,
    defenseCollapseMs: f.defenseCollapseMs ?? 0,
    passCount: f.passCount ?? 0,
    spacingGain: f.spacingGain ?? 0,
    clockSec: clockToSec(play.clock),
  };
}

function buildContext(play, rosterInfo, finishAnchorT0) {
  const { playersById, teamOf } = rosterInfo;
  const f = play.features ?? {};
  const shooter = playersById.get(play.actors?.shooter);
  const defender = playersById.get(play.actors?.defender);
  const screener = playersById.get(play.actors?.screener);
  const breakdown = play.importance?.breakdown ?? {};
  const reasonKey = ['clutch', 'difficulty', 'rarity', 'momentum', 'star']
    .reduce((best, k) => (breakdown[k] > (breakdown[best] ?? -1) ? k : best), 'clutch');
  const tag = (play.tags ?? []).find((t) => ACTION_PHRASES.some(([k]) => k === t));
  const measured = measureAtShot(play, finishAnchorT0);
  return {
    player: shooter?.name ?? '持球球员',
    defender: defender?.name ?? '补防球员',       // §5.3 L1：actors.defender==null → 补防球员
    screener: screener?.name ?? '队友',           // §5.3 L1：null → 队友
    team: teamOf.get(play.actors?.shooter) ?? '进攻方',
    clock: play.clock ?? '00:00.0',
    margin: Math.abs((play.scoreBefore?.home ?? 0) - (play.scoreBefore?.away ?? 0)),
    action: ACTION_PHRASES.find(([k]) => k === tag)?.[1] ?? '完成摆脱',
    nDef: measured.nDef,                          // null → 触发 L2 整句兜底
    collapseMs: f.defenseCollapseMs ?? null,
    passCount: f.passCount ?? null,
    distFt: measured.distFt ?? '超远',            // §5.3 L1：features 缺失 → 超远
    spacingGain: f.spacingGain != null ? Math.round(f.spacingGain) : null,
    importance: (play.importance?.total ?? 0).toFixed(2),
    reason: REASON_PHRASES[reasonKey],
  };
}

// ---- highlights 选取（§7）----
const TACTICAL_NOUNS = ['挡拆', '空切', '掩护', '压哨', '反超', '空档'];

function pickHighlights(text, context, tone) {
  const cap = tone === 'calm' ? 2 : 3;
  const picked = [];
  const push = (s) => {
    if (s && !picked.includes(s) && picked.length < cap && text.includes(s)) picked.push(s);
  };
  // ① 数值度量（含单位词整体高亮），按 text 中出现顺序
  const numerics = [
    typeof context.distFt === 'number' ? `${context.distFt}英尺` : null,
    context.spacingGain != null ? `${context.spacingGain}平方英尺` : null,
    context.collapseMs != null ? `${context.collapseMs}毫秒` : null,
    context.passCount != null ? `${context.passCount}次` : null,
  ].filter((s) => s && text.includes(s));
  numerics.sort((a, b) => text.indexOf(a) - text.indexOf(b)).forEach(push);
  // ② 战术名词，按 text 中出现顺序
  TACTICAL_NOUNS.filter((n) => text.includes(n))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b))
    .forEach(push);
  // ③ 球员姓名，最多 1 个
  push(context.player);
  return picked;
}

// ---- 句子构建：规则匹配 → 渲染 → L2 兜底 → tone 升级（渲染后统一应用）----
function buildSentence(slot, rule, context, importance) {
  let text = renderTemplate(rule.template, context);
  if (text === null) {
    text = renderTemplate(FALLBACK_TEMPLATE_BY_SLOT[slot], context) ?? TEMPLATES.finish_generic_01;
  }
  let tone = rule.tone;
  if (importance >= 0.8 && tone === 'excited') tone = 'clutch'; // §2.2 tone 升级规则
  return { tone, text, highlights: pickHighlights(text, context, tone) };
}

// ---- 锚点选取（§8；finish 锚点先定，action 锚点取其之前的事件，保证 t0 严格递增）----
function selectAnchors(overlays) {
  const sorted = [...overlays].sort((a, b) => a.t0 - b.t0);
  const rings = sorted.filter((o) => o.type === 'ring');
  const finish = rings.length ? rings[rings.length - 1] : sorted[sorted.length - 1];
  const before = sorted.filter((o) => o.t0 < finish.t0);
  const setup = sorted[0];
  const ringBefore = before.find((o) => o.type === 'ring');
  const action1 = ringBefore ?? before.find((o) => o.type === 'arrow') ?? null;
  const action2 = action1
    ? before.find((o) => o.type === 'arrow' && o.style === 'dashed' && o.t0 > action1.t0) ?? null
    : null;
  return { setup, action1, action2, finish };
}

// ---- §6 L3 回合级兜底：features 整体缺失或 overlays 为空 ----
function narrateL3(play, rosterInfo) {
  const D = Number.isFinite(play?.durationMs) && play.durationMs >= 3000 ? play.durationMs : 10000;
  const { playersById, teamOf } = rosterInfo;
  const player = playersById.get(play?.actors?.shooter)?.name ?? '持球球员';
  const team = teamOf.get(play?.actors?.shooter) ?? '进攻方';
  const lastEvent = Array.isArray(play?.overlays) && play.overlays.length
    ? Math.max(...play.overlays.map((o) => o.t0 ?? 0))
    : D - 2000;
  const t0s = [...new Set([0, Math.min(round100Up(D / 2), D - 2000), Math.max(lastEvent, 0)])]
    .filter((t) => t >= 0 && t < D - 100).sort((a, b) => a - b);
  while (t0s.length < 3) t0s.push(Math.min(t0s[t0s.length - 1] + 1000, D - 200));
  const texts = [`${team}进攻，${player}持球。`, `战术展开，${player}寻找机会。`, '回合结束。'];
  return t0s.map((t0, i) => ({ slot: 'l3', t0, tone: 'calm', text: texts[i % texts.length], highlights: [] }));
}

const round100Up = (v) => Math.round(v / 100) * 100;

// ---- 主入口 ----
export function narrate(play, game, rules = COMMENTARY_RULES) {
  const rosterInfo = buildRoster(game);
  try {
    if (!play || !play.features || !Array.isArray(play.overlays) || play.overlays.length === 0) {
      return finalize(narrateL3(play, rosterInfo), play?.durationMs);
    }
    const facts = buildFacts(play, rosterInfo.playersById);
    const anchors = selectAnchors(play.overlays);
    if (!anchors.setup || !anchors.finish) return finalize(narrateL3(play, rosterInfo), play.durationMs);

    const context = buildContext(play, rosterInfo, anchors.finish.t0);
    const D = play.durationMs;
    const used = new Set();
    const sentences = [];
    const push = (slot, anchorT0) => {
      const rule = matchRule(slot, facts, rules, used);
      if (!rule) return;
      used.add(rule.id);
      const s = buildSentence(slot, rule, context, facts.importance);
      sentences.push({ slot, t0: anchorT0, ...s });
    };

    push('setup', anchors.setup.t0);
    if (anchors.action1 && anchors.action1.t0 > anchors.setup.t0) push('action', anchors.action1.t0);
    if (anchors.action2 && anchors.action2.t0 > (anchors.action1?.t0 ?? -1)) push('action', anchors.action2.t0);
    if (anchors.finish.t0 > (sentences[sentences.length - 1]?.t0 ?? -1)) push('finish', anchors.finish.t0);

    // analysis：无 overlay 锚点（§3 豁免槽位），仅当 importance ≥ 0.5 或规则 17 命中（spacingGain ≥ 150）时生成
    if ((facts.importance >= 0.5 || facts.spacingGain >= 150) && sentences.length) {
      const finishT1 = t1Of(sentences[sentences.length - 1], D, D);
      const t0 = ceil100(finishT1 + 400);
      if (t0 + 800 <= D) push('analysis', t0);
    }
    if (sentences.length < 3) return finalize(narrateL3(play, rosterInfo), D);
    return finalize(sentences, D);
  } catch {
    return finalize(narrateL3(play, rosterInfo), play?.durationMs);
  }
}

// §4 t1：t0 = 锚点 overlay.t0 恒等；t1 不越下一个锚点 +400ms，最短驻留 800ms，上限 durationMs
function t1Of(sentence, nextAnchorT0, durationMs) {
  let t1 = Math.min(sentence.t0 + displayMsFor(sentence.text), nextAnchorT0 + 400, durationMs);
  t1 = Math.min(Math.max(t1, sentence.t0 + 800), durationMs);
  return t1;
}

function finalize(sentences, durationMs) {
  const D = Number.isFinite(durationMs) ? durationMs : 10000;
  const out = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const next = sentences[i + 1]?.t0 ?? D;
    const t1 = t1Of(s, next, D);
    if (t1 <= s.t0) continue;
    out.push({ slot: s.slot, t0: s.t0, t1, tone: s.tone, text: s.text, highlights: s.highlights });
  }
  return out;
}
