/**
 * 所有飞书机器人相关错误的基类。
 */
export class FeishuBotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeishuBotError';
    // 保证原型链正确，便于 instanceof 检测
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 配置相关错误：如未提供 webhook、secret、appId、appSecret 等。
 * 构造 FeishuBot 实例时不会抛；延迟到 send/upload 调用时才抛。
 */
export class FeishuConfigError extends FeishuBotError {
  constructor(message: string) {
    super(message);
    this.name = 'FeishuConfigError';
  }
}

/**
 * 调用飞书 OpenAPI 或 webhook 后，返回 code !== 0 或 HTTP 非 2xx 时抛出。
 */
export class FeishuApiError extends FeishuBotError {
  public readonly code: number;
  public readonly response: unknown;

  constructor(message: string, code: number, response: unknown) {
    super(message);
    this.name = 'FeishuApiError';
    this.code = code;
    this.response = response;
  }
}
