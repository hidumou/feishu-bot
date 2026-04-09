import { FeishuApiError, FeishuConfigError } from './errors.js';
import { postJson } from './http.js';
import type { TenantAccessTokenResponse } from './types.js';

const DEFAULT_BASE_URL = 'https://open.feishu.cn';
const TENANT_TOKEN_PATH = '/open-apis/auth/v3/tenant_access_token/internal';

/** 剩余有效时间小于 30 分钟就刷新 */
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * 缓存的 token 结构。是 TokenStorage 适配器读写的数据形状。
 * 公开导出，便于 SW / 浏览器扩展实现自己的存储适配器。
 */
export interface CachedToken {
  /** tenant_access_token 字符串 */
  token: string;
  /** Unix 毫秒时间戳；过期时间 = 获取时刻 + expire 秒 * 1000 */
  expiresAt: number;
}

/**
 * 跨进程/跨重启的 token 持久化适配器。
 *
 * 默认 TokenManager 只在内存里缓存 token，进程退出或 SW 被杀就丢失。
 * 注入 TokenStorage 后可以让 token 在 chrome.storage.session、Redis、
 * 文件等外部介质里活下来，避免每次冷启动都消耗一次 OpenAPI 频次。
 *
 * 实现要求：
 * - get(): 没有缓存或读失败时返回 null（内部会兜底回退到网络刷新）
 * - set(value): 写失败不应抛出（TokenManager 会吞掉异常，避免影响主流程）
 *
 * 典型实现示例（Chrome MV3 扩展 SW）：
 *   const storage: TokenStorage = {
 *     async get() {
 *       const { feishuToken } = await chrome.storage.session.get('feishuToken');
 *       return feishuToken ?? null;
 *     },
 *     async set(value) {
 *       await chrome.storage.session.set({ feishuToken: value });
 *     },
 *   };
 */
export interface TokenStorage {
  /** 读取缓存的 token；不存在或读失败返回 null */
  get(): Promise<CachedToken | null>;
  /** 写入新的 token */
  set(value: CachedToken): Promise<void>;
}

export interface TokenManagerOptions {
  appId: string;
  appSecret: string;
  fetch?: typeof fetch;
  timeout?: number;
  baseUrl?: string;
  /** 可选的持久化适配器；不传则只在内存里缓存 */
  storage?: TokenStorage;
}

/**
 * tenant_access_token 缓存与自动刷新。
 *
 * 三层缓存查找顺序：
 *   1. 内存（最快）
 *   2. 注入的 TokenStorage（跨进程/跨 SW 重启）
 *   3. 网络获取
 *
 * 并发去重：多次 getToken() 在 in-flight 期间共享同一个 Promise，避免重复请求。
 */
export class TokenManager {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly timeout?: number;
  private readonly baseUrl: string;
  private readonly storage?: TokenStorage;

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
    this.storage = options.storage;
  }

  /**
   * 获取有效 token。优先内存缓存；过期/即将过期时尝试 storage，最后回退到网络。
   */
  async getToken(): Promise<string> {
    if (this.isFresh(this.cached)) {
      return this.cached!.token;
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.refreshToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private isFresh(entry: CachedToken | null): boolean {
    if (!entry) return false;
    return entry.expiresAt - Date.now() > REFRESH_THRESHOLD_MS;
  }

  /**
   * 刷新流程：先尝试 storage（若注入），不可用则走网络。
   * storage 异常一律视为「miss」，回退到网络，避免单点故障阻塞主流程。
   */
  private async refreshToken(): Promise<string> {
    if (this.storage) {
      try {
        const stored = await this.storage.get();
        if (this.isFresh(stored)) {
          this.cached = stored;
          return stored!.token;
        }
      } catch {
        // 读失败不抛，继续走网络
      }
    }
    return this.fetchToken();
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

    if (this.storage) {
      try {
        await this.storage.set(this.cached);
      } catch {
        // 写失败不抛，下一次冷启动会重新拉取
      }
    }

    return this.cached.token;
  }
}
