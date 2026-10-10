/**
 * 回合筛选逻辑（左栏 chips）：all / clutch / score / turnover
 * tags 语义对齐 dataset-contract §5.4 archetype 表。
 */

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'clutch', label: '关键回合' },
  { key: 'score', label: '得分' },
  { key: 'transition', label: '转换' }
]

const MISS_TAGS = new Set(['miss'])
const SCORE_TAGS = new Set(['deep_three', 'dunk', 'alley_oop', 'catch_shoot', 'pick_roll', 'transition', 'elevator', 'buzzer', 'post_up', 'clutch'])

export function filterDefs() { return FILTERS }

export function matchFilter(play, key) {
  if (key === 'all') return true
  const tags = play.tags || []
  if (key === 'clutch') return tags.includes('clutch') || (play.importance?.total ?? 0) >= 0.6
  if (key === 'score') return tags.some(t => SCORE_TAGS.has(t)) && !tags.some(t => MISS_TAGS.has(t))
  if (key === 'transition') return tags.includes('transition')
  return true
}

export function filteredPlays(store) {
  return store.plays.filter(p => matchFilter(p, store.filter))
}

export function filterCount(store, key) {
  return store.plays.filter(p => matchFilter(p, key)).length
}
