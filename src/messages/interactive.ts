import type { InteractiveCard, InteractiveMessage } from '../types.js';

/**
 * 构造卡片（interactive）消息。
 *
 * 直接透传 card 结构。支持 card schema 2.0 或旧版 header/elements 格式：
 *
 *   buildInteractive({
 *     schema: "2.0",
 *     header: { title: { tag: "plain_text", content: "标题" } },
 *     body: { elements: [...] },
 *   });
 *
 *   // 或旧版：
 *   buildInteractive({
 *     config: { wide_screen_mode: true },
 *     header: { template: "blue", title: { tag: "plain_text", content: "标题" } },
 *     elements: [...],
 *   });
 */
export function buildInteractive(card: InteractiveCard): InteractiveMessage {
  return {
    msg_type: 'interactive',
    card,
  };
}
