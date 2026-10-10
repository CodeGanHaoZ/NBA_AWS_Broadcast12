// 解说模板表 —— narration-rules.md §5.2 逐字落码（13 个模板 + 5 个兜底）
// 槽位语法 {slotName}；渲染后产物 text 不得残留 { }。
// 禁止：emoji、元叙述、占位省略号。

export const TEMPLATES = Object.freeze({
  setup_generic_01: '{team}进攻，{clock}，{player}持球组织。',
  setup_iso_01: '{player}示意拉开，单打{defender}——这是他最舒服的节奏。',
  setup_clutch_01: '{clock}，分差{margin}分，球在{player}手里，全场都站起来了。',
  action_generic_01: '{player}发动战术，{team}开始跑位。',
  action_screen_01: '{screener}上来掩护，{player}借掩护{action}。',
  action_offball_01: '{player}借{screener}的无球掩护兜出来，防守被甩在身后。',
  action_gravity_01: '{player}持球吸引{nDef}人收缩，防线正在崩塌——{collapseMs}毫秒内轮转已经失位。',
  action_transition_01: '攻防转换！{player}全速推进，防守还没落位。',
  action_passing_01: '{team}连续{passCount}次传导，球动了，防守跟着动了。',
  finish_buzzer_01: '压哨！{player}超远三分出手——球进灯亮！',
  finish_clutch_01: '关键球交给{player}，迎着{defender}命中！{team}反超！',
  finish_deep_01: '距离三分线外{distFt}英尺，{player}迎着防守果断出手——命中！',
  finish_tough_01: '防守人指尖都快封到脸上了，{player}这球还是进——难度拉满。',
  finish_dunk_01: '{player}腾空而起，双手重扣！篮筐都在晃。',
  finish_miss_01: '{player}出手弹筐而出，这球差了一点。',
  finish_generic_01: '{player}完成终结，回合结束。',
  analysis_spacing_01: '看数据：这次跑位撕开了{spacingGain}平方英尺的空档，防守沟通完全失败。',
  analysis_generic_01: '这个回合的关键度评分{importance}，{reason}。',
});

// 每个槽位的兜底规则模板 key（§6 L2 句子级降级唯一依据）
export const FALLBACK_TEMPLATE_BY_SLOT = Object.freeze({
  setup: 'setup_generic_01',
  action: 'action_generic_01',
  finish: 'finish_generic_01',
  analysis: 'analysis_generic_01',
});

// 渲染模板：消解 {slot}；返回 null 表示渲染后仍残留花括号（触发 L2）
export function renderTemplate(templateKey, context) {
  const template = TEMPLATES[templateKey];
  if (typeof template !== 'string') return null;
  const text = template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = context[name];
    return value === undefined || value === null ? match : String(value);
  });
  if (text.includes('{') || text.includes('}')) return null;
  return text;
}
