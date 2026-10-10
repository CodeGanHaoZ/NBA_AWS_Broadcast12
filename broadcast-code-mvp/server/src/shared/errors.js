// 统一错误类型 —— SPEC §5 错误码：1001 参数非法 / 1002 资源不存在 / 1003 数据损坏 / 2000 内部错误
export class ApiError extends Error {
  constructor(httpStatus, code, message) {
    super(message);
    this.name = this.constructor.name;
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Invalid parameter') {
    super(400, 1001, message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, 1002, message);
  }
}

export class DataCorruptError extends ApiError {
  constructor(message = 'Dataset corrupted') {
    super(500, 1003, message);
  }
}

export class InternalError extends ApiError {
  constructor(message = 'Internal server error') {
    super(500, 2000, message);
  }
}
