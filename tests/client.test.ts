import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeishuBot } from '../src/client.js';
import { FeishuApiError, FeishuConfigError } from '../src/errors.js';
import type {
  CachedToken,
  TokenStorage,
} from '../src/token-manager.js';

const WEBHOOK =
  'https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-0000-0000-000000000000';

const ENV_KEYS = [
  'FEISHU_BOT_WEBHOOK',
  'FEISHU_BOT_SECRET',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = savedEnv[k];
    }
  }
});

/** 构造一个简单的 JSON mock fetch，返回固定 body */
function jsonMock(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

/** 从 mockFetch 的第 n 次调用中取出 JSON body */
function getJsonBody(mockFetch: ReturnType<typeof vi.fn>, callIndex = 0): any {
  const call = mockFetch.mock.calls[callIndex];
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('FeishuBot constructor', () => {
  it('does not throw when webhook is missing', () => {
    expect(() => new FeishuBot({})).not.toThrow();
  });

  it('does not throw when all config is missing', () => {
    expect(() => new FeishuBot()).not.toThrow();
  });

  it('reads webhook from env when options not provided', async () => {
    process.env.FEISHU_BOT_WEBHOOK = 'https://env.example/hook';
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({ fetch: mockFetch as unknown as typeof fetch });
    await bot.sendText('hi');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://env.example/hook');
  });

  it('explicit option overrides env', async () => {
    process.env.FEISHU_BOT_WEBHOOK = 'https://env.example/hook';
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendText('hi');
    expect(mockFetch.mock.calls[0][0]).toBe(WEBHOOK);
  });
});

describe('FeishuBot.send (text)', () => {
  it('throws FeishuConfigError when webhook missing', async () => {
    const bot = new FeishuBot({});
    await expect(bot.sendText('hi')).rejects.toBeInstanceOf(FeishuConfigError);
  });

  it('POSTs JSON body to webhook', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendText('hello');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toMatch(/application\/json/);

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      msg_type: 'text',
      content: { text: 'hello' },
    });
  });

  it('does NOT include timestamp/sign when no secret configured', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendText('hi');

    const body = getJsonBody(mockFetch);
    expect(body.timestamp).toBeUndefined();
    expect(body.sign).toBeUndefined();
  });

  it('includes timestamp and sign when secret configured', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      secret: 'test-secret',
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendText('hi');

    const body = getJsonBody(mockFetch);
    expect(body.timestamp).toBeDefined();
    expect(body.timestamp).toMatch(/^\d+$/);
    expect(body.sign).toBeDefined();
    expect(typeof body.sign).toBe('string');
    expect((body.sign as string).length).toBeGreaterThan(0);
    // base64 字符集
    expect(body.sign).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('throws FeishuApiError when API returns code !== 0 (and preserves code)', async () => {
    const mockFetch = jsonMock({ code: 19021, msg: 'sign fail' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });

    const err = await bot.sendText('hi').catch((e) => e);
    expect(err).toBeInstanceOf(FeishuApiError);
    expect((err as FeishuApiError).code).toBe(19021);
    expect((err as FeishuApiError).message).toContain('sign fail');
  });

  it('sendText with atAll injects <at user_id="all"> in body', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendText('attention', { atAll: true });
    const body = getJsonBody(mockFetch);
    expect(body.content.text).toContain('<at user_id="all">所有人</at>');
  });
});

describe('FeishuBot.sendPost / sendShareChat / sendInteractive', () => {
  it('sendPost posts msg_type=post with nested content.post', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendPost({
      zh_cn: { title: 't', content: [[{ tag: 'text', text: 'x' }]] },
    });
    const body = getJsonBody(mockFetch);
    expect(body.msg_type).toBe('post');
    expect(body.content.post.zh_cn.title).toBe('t');
  });

  it('sendShareChat posts msg_type=share_chat with share_chat_id', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendShareChat('oc_xxx');
    const body = getJsonBody(mockFetch);
    expect(body).toMatchObject({
      msg_type: 'share_chat',
      content: { share_chat_id: 'oc_xxx' },
    });
  });

  it('sendInteractive posts msg_type=interactive with card', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    const card = { schema: '2.0', body: { elements: [] } };
    await bot.sendInteractive(card);
    const body = getJsonBody(mockFetch);
    expect(body).toMatchObject({ msg_type: 'interactive', card });
  });
});

describe('FeishuBot.sendImage', () => {
  it('sends directly when input starts with "img_" (no upload)', async () => {
    const mockFetch = jsonMock({ code: 0, msg: 'ok' });
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      // 故意不配 appId/appSecret，证明 img_ 分支不会触发上传校验
      fetch: mockFetch as unknown as typeof fetch,
    });
    await bot.sendImage('img_abc123');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      msg_type: 'image',
      content: { image_key: 'img_abc123' },
    });
  });

  it('throws FeishuConfigError when uploading a Buffer without appId/appSecret', async () => {
    const mockFetch = vi.fn();
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await expect(bot.sendImage(buf)).rejects.toBeInstanceOf(FeishuConfigError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws FeishuConfigError when uploading a file path without appId/appSecret', async () => {
    const mockFetch = vi.fn();
    const bot = new FeishuBot({
      webhook: WEBHOOK,
      fetch: mockFetch as unknown as typeof fetch,
    });
    // 路径字符串但不以 img_ 开头 → 走上传分支 → 在凭据校验处抛错
    await expect(bot.sendImage('/tmp/not-exist.png')).rejects.toBeInstanceOf(
      FeishuConfigError,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uploads Buffer then sends webhook when appId/appSecret configured', async () => {
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/auth/v3/tenant_access_token/internal')) {
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            tenant_access_token: 't_12345',
            expire: 7200,
          }),
          { status: 200 },
        );
      }
      if (typeof url === 'string' && url.includes('/open-apis/im/v1/images')) {
        // 校验 multipart 请求
        expect(init?.body).toBeInstanceOf(FormData);
        const form = init!.body as FormData;
        expect(form.get('image_type')).toBe('message');
        expect(form.get('image')).toBeInstanceOf(Blob);
        // 校验 Authorization 头
        const headers = init!.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer t_12345');
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            data: { image_key: 'img_uploaded' },
          }),
          { status: 200 },
        );
      }
      if (url === WEBHOOK) {
        const body = JSON.parse(init!.body as string);
        expect(body).toMatchObject({
          msg_type: 'image',
          content: { image_key: 'img_uploaded' },
        });
        return new Response(JSON.stringify({ code: 0, msg: 'ok' }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const bot = new FeishuBot({
      webhook: WEBHOOK,
      appId: 'cli_app_test',
      appSecret: 'secret_app_test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = await bot.sendImage(png);

    expect(result).toMatchObject({ code: 0 });
    // 3 次调用：获取 token + 上传图片 + 发送 webhook
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(
      urls.some((u) => u.includes('/auth/v3/tenant_access_token/internal')),
    ).toBe(true);
    expect(urls.some((u) => u.includes('/open-apis/im/v1/images'))).toBe(true);
    expect(urls).toContain(WEBHOOK);
  });

  it('uploads a Blob preserving bytes (default filename = "image")', async () => {
    let receivedFilename: string | null = null;
    let receivedBytes: Uint8Array | null = null;

    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/auth/v3/tenant_access_token/internal')
      ) {
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            tenant_access_token: 't_blob',
            expire: 7200,
          }),
          { status: 200 },
        );
      }
      if (typeof url === 'string' && url.includes('/open-apis/im/v1/images')) {
        const form = init!.body as FormData;
        const file = form.get('image') as File | null;
        // 在 Node 18+ / SW / 浏览器里 FormData.get 都返回 File / Blob 实例
        expect(file).toBeInstanceOf(Blob);
        receivedFilename = (file as { name?: string }).name ?? null;
        receivedBytes = new Uint8Array(await (file as Blob).arrayBuffer());
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            data: { image_key: 'img_from_blob' },
          }),
          { status: 200 },
        );
      }
      if (url === WEBHOOK) {
        const body = JSON.parse(init!.body as string);
        expect(body).toMatchObject({
          msg_type: 'image',
          content: { image_key: 'img_from_blob' },
        });
        return new Response(JSON.stringify({ code: 0, msg: 'ok' }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const bot = new FeishuBot({
      webhook: WEBHOOK,
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const inputBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef,
    ]);
    const blob = new Blob([inputBytes], { type: 'image/png' });

    const result = await bot.sendImage(blob);
    expect(result).toMatchObject({ code: 0 });
    // 普通 Blob 没有 .name → 用默认 "image"
    expect(receivedFilename).toBe('image');
    // 字节级一致：证明 Blob → Uint8Array → Blob 的 round-trip 没有损坏
    expect(receivedBytes).toEqual(inputBytes);
  });

  it.skipIf(typeof File === 'undefined')(
    'uploads a File preserving its name (duck-typed via .name)',
    async () => {
      let receivedFilename: string | null = null;

      const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
        if (
          typeof url === 'string' &&
          url.includes('/auth/v3/tenant_access_token/internal')
        ) {
          return new Response(
            JSON.stringify({
              code: 0,
              msg: 'ok',
              tenant_access_token: 't_file',
              expire: 7200,
            }),
            { status: 200 },
          );
        }
        if (
          typeof url === 'string' &&
          url.includes('/open-apis/im/v1/images')
        ) {
          const form = init!.body as FormData;
          const file = form.get('image') as File;
          receivedFilename = file.name;
          return new Response(
            JSON.stringify({
              code: 0,
              msg: 'ok',
              data: { image_key: 'img_from_file' },
            }),
            { status: 200 },
          );
        }
        if (url === WEBHOOK) {
          return new Response(JSON.stringify({ code: 0, msg: 'ok' }), {
            status: 200,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const bot = new FeishuBot({
        webhook: WEBHOOK,
        appId: 'a',
        appSecret: 's',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const file = new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
        'banner.png',
        { type: 'image/png' },
      );
      await bot.sendImage(file);

      expect(receivedFilename).toBe('banner.png');
    },
  );

  it('reuses cached token across sequential uploads (single token request)', async () => {
    let tokenCalls = 0;
    let imageCalls = 0;
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/tenant_access_token/internal')) {
        tokenCalls++;
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            tenant_access_token: 't_cached',
            expire: 7200,
          }),
          { status: 200 },
        );
      }
      if (typeof url === 'string' && url.includes('/im/v1/images')) {
        imageCalls++;
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            data: { image_key: `img_${imageCalls}` },
          }),
          { status: 200 },
        );
      }
      if (url === WEBHOOK) {
        return new Response(JSON.stringify({ code: 0, msg: 'ok' }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const bot = new FeishuBot({
      webhook: WEBHOOK,
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
    });

    await bot.sendImage(Buffer.from([1, 2, 3]));
    await bot.sendImage(Buffer.from([4, 5, 6]));

    expect(tokenCalls).toBe(1); // cached
    expect(imageCalls).toBe(2);
  });
});

describe('FeishuBot tokenStorage plumbing (extension SW use case)', () => {
  it('passes tokenStorage through so a fresh stored token avoids the network', async () => {
    const stored: CachedToken = {
      token: 't_from_storage',
      // 1 小时后过期，远超 30 分钟刷新阈值
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    const storage: TokenStorage = {
      get: vi.fn(async () => stored),
      set: vi.fn(async () => {}),
    };

    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/auth/v3/tenant_access_token/internal')
      ) {
        // 这条路径不应该被触达 —— storage 命中
        throw new Error(
          'Should not call tenant_access_token endpoint when storage has fresh token',
        );
      }
      if (typeof url === 'string' && url.includes('/open-apis/im/v1/images')) {
        // 验证 Authorization 头使用了 storage 里的 token
        const headers = init!.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer t_from_storage');
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            data: { image_key: 'img_via_storage' },
          }),
          { status: 200 },
        );
      }
      if (url === WEBHOOK) {
        return new Response(JSON.stringify({ code: 0, msg: 'ok' }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const bot = new FeishuBot({
      webhook: WEBHOOK,
      appId: 'a',
      appSecret: 's',
      fetch: mockFetch as unknown as typeof fetch,
      tokenStorage: storage,
    });

    const result = await bot.sendImage(new Uint8Array([1, 2, 3]));
    expect(result).toMatchObject({ code: 0 });

    // storage.get 至少被调用过一次（getToken 路径）
    expect(storage.get).toHaveBeenCalled();
    // 没有发起 tenant_access_token 网络请求
    const tokenCalls = mockFetch.mock.calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('/auth/v3/tenant_access_token/'),
    );
    expect(tokenCalls.length).toBe(0);
  });
});
