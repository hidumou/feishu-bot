import { FeishuApiError } from './errors.js';

export interface RequestOptions {
  /** 自定义 fetch 实现，默认 globalThis.fetch */
  fetch?: typeof fetch;
  /** 请求超时，单位毫秒，默认 10000 */
  timeout?: number;
  /** 额外请求头 */
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT = 10_000;

interface RawResponse {
  status: number;
  statusText: string;
  ok: boolean;
  text: string;
}

function resolveFetch(customFetch?: typeof fetch): typeof fetch {
  const fn = customFetch ?? globalThis.fetch;
  if (typeof fn !== 'function') {
    throw new FeishuApiError(
      'global fetch is not available. Please use Node.js >= 18 or provide a custom fetch.',
      -1,
      null,
    );
  }
  return fn;
}

/**
 * 通用请求执行器：处理 timeout + 错误归一化。
 * 为了让 timeout 覆盖整个 body 读取过程，在 clearTimeout 之前就完成 response.text()。
 * 返回结构化结果，由调用方自行决定是否解析 JSON。
 */
async function request(
  url: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<RawResponse> {
  const fetchImpl = resolveFetch(options.fetch);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    // 关键：在 clearTimeout 之前读取 body，保证慢 body 也能触发 abort。
    const text = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      text,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FeishuApiError(
        `Request timed out after ${timeout}ms: ${url}`,
        -1,
        null,
      );
    }
    if (err instanceof FeishuApiError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new FeishuApiError(`Network error: ${message}`, -1, null);
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonBody<T>(raw: RawResponse): T {
  if (!raw.text) {
    throw new FeishuApiError(
      `Empty response body (HTTP ${raw.status})`,
      -1,
      null,
    );
  }
  try {
    return JSON.parse(raw.text) as T;
  } catch {
    throw new FeishuApiError(
      `Failed to parse JSON response (HTTP ${raw.status}): ${raw.text.slice(0, 200)}`,
      -1,
      raw.text,
    );
  }
}

function throwIfHttpError(raw: RawResponse): void {
  if (!raw.ok) {
    throw new FeishuApiError(
      `HTTP ${raw.status} ${raw.statusText}: ${raw.text.slice(0, 200)}`,
      raw.status,
      raw.text,
    );
  }
}

/**
 * POST JSON 请求，返回已解析的 JSON。HTTP 非 2xx 或解析失败时抛 FeishuApiError。
 * 注意：业务层 code !== 0 的判断由调用方处理（不同接口含义不同）。
 */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const raw = await request(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...options.headers,
      },
      body: JSON.stringify(body),
    },
    options,
  );

  throwIfHttpError(raw);
  return parseJsonBody<T>(raw);
}

/**
 * POST 一个 FormData（multipart/form-data）。用于图片上传。
 * 注意：绝不要手动设置 Content-Type，让 fetch/undici 自动带 boundary。
 */
export async function postForm<T = unknown>(
  url: string,
  form: FormData,
  options: RequestOptions = {},
): Promise<T> {
  const raw = await request(
    url,
    {
      method: 'POST',
      headers: {
        ...options.headers,
      },
      body: form,
    },
    options,
  );

  throwIfHttpError(raw);
  return parseJsonBody<T>(raw);
}
