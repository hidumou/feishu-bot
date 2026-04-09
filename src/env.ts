/**
 * 安全读取 process.env。在不存在 process 的环境（如浏览器）里返回 undefined，不会崩溃。
 * SDK 本身不引入 dotenv，调用方可自行用 `node --env-file=.env` 或 `dotenv/config` 预加载。
 */
export function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }
  // 上面已经保证 process.env 存在，无需再用可选链。
  const value = process.env[key];
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}
