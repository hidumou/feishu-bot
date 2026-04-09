import { createHmac } from 'node:crypto';

/**
 * 生成飞书自定义机器人签名。
 *
 * 算法（来自飞书官方文档，反直觉之处：HMAC 的 key 是 stringToSign 本身，data 是空字符串）：
 *   stringToSign = `${timestamp}\n${secret}`
 *   sign         = Base64(HmacSHA256(key = stringToSign, data = ''))
 *
 * @param timestamp  Unix 秒时间戳（飞书要求 ±1 小时窗口）
 * @param secret     机器人「安全设置 → 签名校验」得到的 secret
 */
export function genSign(timestamp: number | string, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac('sha256', stringToSign).update('').digest('base64');
}

/**
 * 获取当前 Unix 秒时间戳。
 */
export function currentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
