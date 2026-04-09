import { describe, expect, it, vi } from 'vitest';

import { FeishuApiError, FeishuConfigError } from '../src/errors.js';
import {
  TokenManager,
  type CachedToken,
  type TokenStorage,
} from '../src/token-manager.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TokenManager', () => {
  it('throws FeishuConfigError when appId/appSecret missing', () => {
    expect(
      () =>
        new TokenManager({
          appId: '',
          appSecret: '',
        }),
    ).toThrow(FeishuConfigError);
  });

  it('caches token and reuses it within TTL', async () => {
    let count = 0;
    const mockFetch = vi.fn(async () => {
      count++;
      return jsonResponse({
        code: 0,
        msg: 'ok',
        tenant_access_token: 't_1',
        expire: 7200,
      });
    });
    const tm = new TokenManager({
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const a = await tm.getToken();
    const b = await tm.getToken();
    expect(a).toBe('t_1');
    expect(b).toBe('t_1');
    expect(count).toBe(1);
  });

  it('deduplicates concurrent getToken() calls (single in-flight fetch)', async () => {
    let callCount = 0;
    let releaseInner: (r: Response) => void;
    const innerPromise = new Promise<Response>((resolve) => {
      releaseInner = resolve;
    });

    const mockFetch = vi.fn(async () => {
      callCount++;
      return innerPromise;
    });

    const tm = new TokenManager({
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
    });

    // 启动两次并发请求
    const p1 = tm.getToken();
    const p2 = tm.getToken();

    // 让微任务跑一下，让 fetch 被真正调用
    await Promise.resolve();
    await Promise.resolve();

    expect(callCount).toBe(1);

    // 解锁 mock 返回
    releaseInner!(
      jsonResponse({
        code: 0,
        msg: 'ok',
        tenant_access_token: 't_dup',
        expire: 7200,
      }),
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('t_dup');
    expect(r2).toBe('t_dup');
    expect(callCount).toBe(1);
  });

  it('throws FeishuApiError when API returns code !== 0', async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse({ code: 99991663, msg: 'invalid secret' }),
    );
    const tm = new TokenManager({
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const err = await tm.getToken().catch((e) => e);
    expect(err).toBeInstanceOf(FeishuApiError);
    expect((err as FeishuApiError).code).toBe(99991663);
  });

  it('uses TokenStorage on cold start (no fetch when stored token is fresh)', async () => {
    const stored: CachedToken = {
      token: 't_from_storage',
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 小时后过期，远超 30 分钟阈值
    };
    const storage: TokenStorage = {
      get: vi.fn(async () => stored),
      set: vi.fn(async () => {}),
    };
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        code: 0,
        msg: 'ok',
        tenant_access_token: 't_network',
        expire: 7200,
      }),
    );

    const tm = new TokenManager({
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
      storage,
    });

    const token = await tm.getToken();
    expect(token).toBe('t_from_storage');
    expect(storage.get).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('falls back to network when stored token is stale, then writes back', async () => {
    const stale: CachedToken = {
      token: 't_stale',
      expiresAt: Date.now() + 60 * 1000, // 1 分钟后过期，低于 30 分钟阈值
    };
    const storage: TokenStorage = {
      get: vi.fn(async () => stale),
      set: vi.fn(async () => {}),
    };
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        code: 0,
        msg: 'ok',
        tenant_access_token: 't_fresh',
        expire: 7200,
      }),
    );

    const tm = new TokenManager({
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
      storage,
    });

    const token = await tm.getToken();
    expect(token).toBe('t_fresh');
    expect(storage.get).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(storage.set).toHaveBeenCalledTimes(1);
    const written = (storage.set as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as CachedToken;
    expect(written.token).toBe('t_fresh');
    expect(written.expiresAt).toBeGreaterThan(Date.now() + 30 * 60 * 1000);
  });

  it('falls back to network when storage.get throws', async () => {
    const storage: TokenStorage = {
      get: vi.fn(async () => {
        throw new Error('storage exploded');
      }),
      set: vi.fn(async () => {}),
    };
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        code: 0,
        msg: 'ok',
        tenant_access_token: 't_recovered',
        expire: 7200,
      }),
    );

    const tm = new TokenManager({
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
      storage,
    });

    const token = await tm.getToken();
    expect(token).toBe('t_recovered');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(storage.set).toHaveBeenCalledTimes(1);
  });

  it('does not throw when storage.set fails (write-through is best-effort)', async () => {
    const storage: TokenStorage = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {
        throw new Error('write failed');
      }),
    };
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        code: 0,
        msg: 'ok',
        tenant_access_token: 't_ok',
        expire: 7200,
      }),
    );

    const tm = new TokenManager({
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
      storage,
    });

    await expect(tm.getToken()).resolves.toBe('t_ok');
  });

  it('posts to correct URL with JSON body { app_id, app_secret }', async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        code: 0,
        msg: 'ok',
        tenant_access_token: 't',
        expire: 7200,
      }),
    );

    const tm = new TokenManager({
      appId: 'the-app',
      appSecret: 'the-secret',
      fetch: mockFetch as unknown as typeof fetch,
    });

    await tm.getToken();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    );
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      app_id: 'the-app',
      app_secret: 'the-secret',
    });
  });
});
