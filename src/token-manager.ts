import { FeishuApiError, FeishuConfigError } from './errors.js';
import { postJson } from './http.js';
import type { TenantAccessTokenResponse } from './types.js';

const DEFAULT_BASE_URL = 'https://open.feishu.cn';
const TENANT_TOKEN_PATH = '/open-apis/auth/v3/tenant_access_token/internal';

/** 剩余有效时间小于 30 分钟就刷新 */
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000;

export interface TokenManagerOptions {
  appId: string;
  appSecret: string;
  fetch?: typeof fetch;
  timeout?: number;
  baseUrl?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * tenant_access_token 缓存与自动刷新。
 * 并发去重：多次 getToken() 在 in-flight 期间共享同一个 Promise，避免重复请求。
 */
export class TokenManager {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly timeout?: number;
  private readonly baseUrl: string;

  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;

  constructor(options: TokenManagerOptions) {
    if (!options.appId || !options.appSecret) {
      throw new FeishuConfigError(
        'appId and appSecret are required for TokenManager',
      );
    }
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.fetchImpl = options.fetch;
    this.timeout = options.timeout;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * 获取有效 token。优先使用缓存；过期/即将过期时刷新。
   */
  async getToken(): Promise<string> {
    if (this.isCacheFresh()) {
      return this.cached!.token;
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private isCacheFresh(): boolean {
    if (!this.cached) return false;
    return this.cached.expiresAt - Date.now() > REFRESH_THRESHOLD_MS;
  }

  private async fetchToken(): Promise<string> {
    const url = `${this.baseUrl}${TENANT_TOKEN_PATH}`;
    const body = {
      app_id: this.appId,
      app_secret: this.appSecret,
    };
    const response = await postJson<TenantAccessTokenResponse>(url, body, {
      fetch: this.fetchImpl,
      timeout: this.timeout,
    });

    if (response.code !== 0 || !response.tenant_access_token) {
      throw new FeishuApiError(
        `Failed to fetch tenant_access_token: ${response.msg ?? 'unknown error'}`,
        response.code ?? -1,
        response,
      );
    }

    const expireSeconds = response.expire ?? 7200;
    this.cached = {
      token: response.tenant_access_token,
      expiresAt: Date.now() + expireSeconds * 1000,
    };
    return this.cached.token;
  }
}
