// 解说规则表 —— narration-rules.md §2.2 全量 18 条逐字落码，按 priority 降序排列。
// 扫描语义：按 slot 过滤后按 priority 降序、同优先级按书写顺序，取首条命中。
// when 条件全部 AND；可省略的键 = 不检查；any: [subWhen...] 表示任一子条件命中即命中。

export const COMMENTARY_RULES = Object.freeze([
  // ---- finish ----
  { id: 'finish_buzzer_clutch', slot: 'finish', priority: 100,
    when: { tags: ['buzzer'], result: 'made' },
    template: 'finish_buzzer_01', tone: 'clutch' },
  { id: 'finish_clutch_star', slot: 'finish', priority: 95,
    when: { clutch: true, star: true, result: 'made' },
    template: 'finish_clutch_01', tone: 'clutch' },
  { id: 'finish_deep_three', slot: 'finish', priority: 85,
    when: { tags: ['deep_three'], result: 'made' },
    template: 'finish_deep_01', tone: 'excited' },
  { id: 'finish_tough_shot', slot: 'finish', priority: 80,
    when: { minDifficulty: 0.75, result: 'made' },
    template: 'finish_tough_01', tone: 'excited' },
  { id: 'finish_dunk', slot: 'finish', priority: 70,
    when: { tags: ['dunk'], result: 'made' },
    template: 'finish_dunk_01', tone: 'excited' },
  { id: 'finish_miss', slot: 'finish', priority: 60,
    when: { result: 'missed' },
    template: 'finish_miss_01', tone: 'calm' },
  { id: 'finish_fallback', slot: 'finish', priority: 0,
    when: {}, template: 'finish_generic_01', tone: 'calm' },

  // ---- action ----
  { id: 'action_gravity_collapse', slot: 'action', priority: 90,
    when: { minGravity: 0.7, minCollapseMs: 800 },
    template: 'action_gravity_01', tone: 'excited' },
  { id: 'action_screen_roll', slot: 'action', priority: 75,
    when: { tags: ['pick_roll'] },
    template: 'action_screen_01', tone: 'calm' },
  { id: 'action_offball_screen', slot: 'action', priority: 70,
    when: { any: [{ tags: ['catch_shoot'] }, { tags: ['elevator'] }] },
    template: 'action_offball_01', tone: 'calm' },
  { id: 'action_transition', slot: 'action', priority: 65,
    when: { tags: ['transition'] },
    template: 'action_transition_01', tone: 'excited' },
  { id: 'action_ball_movement', slot: 'action', priority: 55,
    when: { minPassCount: 3 },
    template: 'action_passing_01', tone: 'calm' },
  { id: 'action_fallback', slot: 'action', priority: 0,
    when: {}, template: 'action_generic_01', tone: 'calm' },

  // ---- setup ----
  { id: 'setup_clutch_context', slot: 'setup', priority: 90,
    when: { clutch: true },
    template: 'setup_clutch_01', tone: 'clutch' },
  { id: 'setup_star_iso', slot: 'setup', priority: 80,
    when: { any: [{ tags: ['iso'] }, { star: true, maxPassCount: 0 }] },
    template: 'setup_iso_01', tone: 'calm' },
  { id: 'setup_fallback', slot: 'setup', priority: 0,
    when: {}, template: 'setup_generic_01', tone: 'calm' },

  // ---- analysis ----
  { id: 'analysis_spacing', slot: 'analysis', priority: 70,
    when: { minSpacingGain: 150 },
    template: 'analysis_spacing_01', tone: 'calm' },
  { id: 'analysis_fallback', slot: 'analysis', priority: 0,
    when: {}, template: 'analysis_generic_01', tone: 'calm' },
]);

// 条件匹配：facts 由 narration.service 从 PlayContext 推导
function matchWhen(when, facts) {
  if (!when) return true;
  if (Array.isArray(when.any)) {
    return when.any.some((sub) => matchWhen(sub, facts));
  }
  if (when.tags && !when.tags.every((t) => facts.tags.includes(t))) return false;
  if (when.clutch !== undefined && facts.clutch !== when.clutch) return false;
  if (when.result !== undefined && facts.result !== when.result) return false;
  if (when.star !== undefined && facts.star !== when.star) return false;
  if (when.minImportance != null && !(facts.importance >= when.minImportance)) return false;
  if (when.minDifficulty != null && !(facts.shotDifficulty >= when.minDifficulty)) return false;
  if (when.minGravity != null && !(facts.gravity >= when.minGravity)) return false;
  if (when.minCollapseMs != null && !(facts.defenseCollapseMs >= when.minCollapseMs)) return false;
  if (when.minPassCount != null && !(facts.passCount >= when.minPassCount)) return false;
  if (when.maxPassCount != null && !(facts.passCount <= when.maxPassCount)) return false;
  if (when.minSpacingGain != null && !(facts.spacingGain >= when.minSpacingGain)) return false;
  if (when.maxClockSec != null && !(facts.clockSec <= when.maxClockSec)) return false;
  return true;
}

// 规则匹配：slot 内按 priority 降序、同优先级按书写顺序，取首条命中。
// excludeIds：同一回合内已命中过的规则 id 不再重复命中（保证两句 action 文案不同）。
export function matchRule(slot, facts, rules = COMMENTARY_RULES, excludeIds = new Set()) {
  const candidates = rules
    .filter((r) => r.slot === slot && !excludeIds.has(r.id))
    .sort((a, b) => b.priority - a.priority);
  for (const rule of candidates) {
    if (matchWhen(rule.when, facts)) return rule;
  }
  return null;
}
