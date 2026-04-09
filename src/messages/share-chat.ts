import type { ShareChatMessage } from '../types.js';

/**
 * 构造分享群名片（share_chat）消息。
 *
 * @param shareChatId 群 chat_id（形如 `oc_xxx`）
 */
export function buildShareChat(shareChatId: string): ShareChatMessage {
  return {
    msg_type: 'share_chat',
    content: {
      share_chat_id: shareChatId,
    },
  };
}
