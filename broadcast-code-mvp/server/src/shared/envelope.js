// 统一响应壳 {code, data, message}（SPEC §5 / openapi.yaml Envelope）
export function ok(res, data, httpStatus = 200) {
  res.status(httpStatus).json({ code: 0, data, message: '' });
}

export function fail(res, httpStatus, code, message) {
  res.status(httpStatus).json({ code, data: null, message });
}
