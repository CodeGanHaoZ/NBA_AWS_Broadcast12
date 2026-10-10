/**
 * API 客户端 — typed fetch wrapper（契约：docs/api/openapi.yaml v1.0.1）
 * 统一响应壳 { code, data, message }；code=0 成功。
 * 错误映射为中文用户可读信息；网络失败单独一类。
 */

export class ApiError extends Error {
  constructor(code, message, httpStatus) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

const CODE_MESSAGES = {
  1001: '请求参数非法，请刷新后重试',
  1002: '回放数据不存在，可能已被移除',
  1003: '数据损坏，分析管线拒绝加载',
  2000: '分析服务器内部错误，请稍后重试'
}

async function request(path, { timeout = 8000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  let res
  try {
    res = await fetch(path, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    throw new ApiError(-1, err.name === 'AbortError'
      ? '分析服务器响应超时，请检查服务后重试'
      : '无法连接分析服务器（localhost:3000），请确认后端已启动', 0)
  } finally {
    clearTimeout(timer)
  }

  let body = null
  try { body = await res.json() } catch { /* 非 JSON 响应按服务器错误处理 */ }

  if (!res.ok) {
    // 代理层 5xx（后端未启动/网关错误）归一为连接失败，给可操作的提示
    if (!body) {
      throw new ApiError(-1, '无法连接分析服务器（localhost:3000），请确认后端已启动', res.status)
    }
    const code = typeof body.code === 'number' ? body.code : 2000
    throw new ApiError(code, CODE_MESSAGES[code] || body.message || '服务器错误', res.status)
  }
  if (!body || body.code !== 0) {
    const code = body && typeof body.code === 'number' ? body.code : 2000
    throw new ApiError(code, CODE_MESSAGES[code] || '数据响应异常', res.status)
  }
  return body.data
}

export const api = {
  health: () => request('/health'),
  listGames: () => request('/api/v1/games'),
  getGame: (gameId) => request(`/api/v1/games/${encodeURIComponent(gameId)}`),
  listPlays: (gameId, top = 12) =>
    request(`/api/v1/games/${encodeURIComponent(gameId)}/plays?top=${top}`),
  getPlay: (gameId, playId) =>
    request(`/api/v1/games/${encodeURIComponent(gameId)}/plays/${encodeURIComponent(playId)}`, { timeout: 12000 }),
  getFlags: () => request('/api/v1/meta/flags')
}
