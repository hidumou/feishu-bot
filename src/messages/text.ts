import type { AtOptions, TextMessage } from '../types.js';

/**
 * 构造 text 消息。
 *
 * @-提醒说明（来自飞书文档）：
 * - @ 所有人：`<at user_id="all">所有人</at>`（仅群里能用，必须机器人所在群支持）
 * - @ 指定用户（需已知 open_id）：`<at user_id="ou_xxx"></at>`
 *
 * 示例：
 *   buildText("hello", { atAll: true })
 *   // => { msg_type: "text", content: { text: "hello <at user_id=\"all\">所有人</at>" } }
 */
export function buildText(text: string, opts: AtOptions = {}): TextMessage {
  const parts: string[] = [];
  if (text) {
    parts.push(text);
  }
  if (opts.atUserIds && opts.atUserIds.length > 0) {
    for (const id of opts.atUserIds) {
      parts.push(`<at user_id="${id}"></at>`);
    }
  }
  if (opts.atAll) {
    parts.push('<at user_id="all">所有人</at>');
  }
  return {
    msg_type: 'text',
    content: {
      text: parts.join(' '),
    },
  };
}
