/**
 * 回合结果推导 — 从可用数据（label / narration 文本）推导得分与命中，
 * 用于 L4 终结点 Anton +N 弹出。推导失败（数据缺失）返回空串，不渲染（AC-05 不中断）。
 */

export function resultOf(play) {
  if (!play) return ''
  const text = [
    play.label || '',
    ...((play.narration || []).map(n => n.text || ''))
  ].join(' ')
  // 未命中：finish_miss 模板语「弹筐而出」
  if (/弹筐而出|未中|打铁|偏出/.test(text)) return ''
  if (/三分|3分/.test(text)) return '+3'
  if (/扣篮|上篮|中投|中距离|两分|空接|补篮|急停/.test(text)) return '+2'
  return ''
}
