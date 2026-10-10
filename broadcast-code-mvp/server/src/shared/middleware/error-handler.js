// 全局错误处理 —— 错误处理分层：1001/1002/1003 业务错误 → 对应状态码；未知错误 → 500/2000 不暴露细节
import { ApiError } from '../errors.js';
import { fail } from '../envelope.js';

// 未匹配路由（Express 5：不用通配符路由，K1——用 app.use 兜底）
export function notFoundHandler(req, res) {
  fail(res, 404, 1002, `Route not found: ${req.method} ${req.originalUrl}`);
}

// 全局异常捕获（必须 4 参签名）
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    fail(res, err.httpStatus, err.code, err.message);
    return;
  }
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    fail(res, 400, 1001, 'Malformed request body');
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  fail(res, 500, 2000, 'Internal server error');
}
