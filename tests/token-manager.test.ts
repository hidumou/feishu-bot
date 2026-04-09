import { describe, expect, it, vi } from 'vitest';

import { FeishuApiError, FeishuConfigError } from '../src/errors.js';
import { TokenManager } from '../src/token-manager.js';

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
