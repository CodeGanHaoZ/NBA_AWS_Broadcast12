// 请求日志中间件 —— 每个端点必备（方法 路径 状态码 耗时）
export function requestLog(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}
