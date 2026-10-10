/**
 * 打字机引擎 — 由 replayClock 驱动的字队列（K10：不自起定时器）。
 * 节奏（UIUX §7.2/§7.5）：calm 38ms/字、excited 27ms/字、clutch 45ms/字；
 * 逗号 +60ms、句号 +120ms（clutch 句号 ×2）；句毕驻留 400ms 沉为历史句。
 * 高亮词：indexOf 定位，打字到位逐字染橙。
 * prefers-reduced-motion：整句直出。
 */

import { reactive } from 'vue'

const BASE_MS = { calm: 38, excited: 27, clutch: 45 }
const DWELL_MS = 400

function buildChars(text, highlights) {
  const chars = [...text].map(ch => ({ ch, hl: false }))
  for (const word of highlights || []) {
    if (!word) continue
    let from = 0
    const idx = text.indexOf(word, from)
    if (idx === -1) continue
    let u = 0, pos = -1
    // 以码元为单位定位（indexOf 是码元索引，需映射到 chars 下标）
    for (let i = 0; i < chars.length; i++) {
      pos += chars[i].ch.length
      if (pos === idx) { u = i; break }
    }
    const wordChars = [...word].length
    for (let i = u; i < Math.min(chars.length, u + wordChars); i++) chars[i].hl = true
    from = idx + word.length
  }
  return chars
}

function charDelay(char, tone) {
  const base = BASE_MS[tone] || BASE_MS.calm
  if (char === '。' || char === '！' || char === '？') return base + 120 * (tone === 'clutch' ? 2 : 1)
  if (char === '，' || char === '、') return base + 60
  if (char === '—') return base + 60
  return base
}

export function createTypewriter(reducedMotion = false) {
  /** sentences: reactive 数组，元素 { cue, chars, typed, status } */
  const sentences = reactive([])
  let activeIdx = -1
  let elapsed = 0   // 当前句已累积墙钟 ms（暂停时冻结）

  function finishSentence(s) {
    s.typed = s.chars.length
    s.status = 'history'
  }

  return {
    sentences,

    /** 装载新回合解说（打断旧的） */
    load(cues) {
      sentences.splice(0, sentences.length)
      for (const cue of cues || []) {
        sentences.push({
          cue,
          chars: buildChars(cue.text || '', cue.highlights),
          typed: 0,
          status: 'queued'   // queued | typing | history
        })
      }
      activeIdx = -1
      elapsed = 0
    },

    /**
     * 由时钟驱动的推进：playT=播放时间 ms，wallDt=本帧墙钟增量（暂停为 0）
     */
    update(playT, wallDt) {
      if (sentences.length === 0) return

      // 启动到点的新句（t0 锚定 overlay，AC-04）
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i]
        if (s.status === 'queued' && playT >= s.cue.t0) {
          // 前一句未打完则立刻定格（可打断性）
          if (activeIdx >= 0 && sentences[activeIdx].status === 'typing') {
            finishSentence(sentences[activeIdx])
          }
          s.status = 'typing'
          activeIdx = i
          elapsed = 0
          if (reducedMotion) { s.typed = s.chars.length }
        }
      }

      const cur = activeIdx >= 0 ? sentences[activeIdx] : null
      if (!cur || cur.status !== 'typing') return
      if (cur.typed >= cur.chars.length) {
        // 驻留 400ms 后沉底
        elapsed += wallDt
        if (elapsed >= DWELL_MS) finishSentence(cur)
        return
      }
      elapsed += wallDt
      let guard = 0
      while (cur.typed < cur.chars.length && guard++ < 8) {
        const need = charDelay(cur.chars[cur.typed].ch, cur.cue.tone)
        if (elapsed < need) break
        elapsed -= need
        cur.typed++
      }
    },

    /** seek 后确定性重建：t0 之前的句子整句呈现，当前句重打 */
    resync(playT) {
      activeIdx = -1
      elapsed = 0
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i]
        if (playT > s.cue.t1) {
          s.typed = s.chars.length
          s.status = 'history'
        } else if (playT >= s.cue.t0) {
          s.typed = 0
          s.status = 'typing'
          activeIdx = i
        } else {
          s.typed = 0
          s.status = 'queued'
        }
      }
    },

    clear() {
      sentences.splice(0, sentences.length)
      activeIdx = -1
      elapsed = 0
    }
  }
}
