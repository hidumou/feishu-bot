/**
 * 生成飞书自定义机器人签名（同构实现，使用 WebCrypto）。
 *
 * 算法（来自飞书官方文档，反直觉之处：HMAC 的 key 是 stringToSign 本身，data 是空字符串）：
 *   stringToSign = `${timestamp}\n${secret}`
 *   sign         = Base64(HmacSHA256(key = stringToSign, data = ''))
 *
 * 仅依赖 globalThis.crypto.subtle，因此在以下环境均可运行：
 *   - Node 18+（原生 WebCrypto）
 *   - 浏览器主线程
 *   - Service Worker / 浏览器扩展 Service Worker
 *   - Cloudflare Workers / Deno / Bun
 *
 * ⚠️ 破坏性变更（v0.1 → v0.2）：返回 Promise，而非同步字符串。
 *
 * @param timestamp  Unix 秒时间戳（飞书要求 ±1 小时窗口）
 * @param secret     机器人「安全设置 → 签名校验」得到的 secret
 */
export async function genSign(
  timestamp: number | string,
  secret: string,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'WebCrypto (globalThis.crypto.subtle) is not available. ' +
        'Use Node.js >= 18, a modern browser, or a Service Worker context.',
    );
  }

  const stringToSign = `${timestamp}\n${secret}`;
  const keyData = new TextEncoder().encode(stringToSign);

  const cryptoKey = await subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await subtle.sign('HMAC', cryptoKey, new Uint8Array(0));

  return bytesToBase64(new Uint8Array(signature));
}

/**
 * 获取当前 Unix 秒时间戳。
 */
export function currentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Uint8Array → base64。
 * 不依赖 Node Buffer，浏览器/SW/Node 18+ 都有 btoa。
 */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}
