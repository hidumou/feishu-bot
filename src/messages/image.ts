import type { ImageMessage } from '../types.js';

/**
 * 构造 image 消息。
 *
 * 注意：自定义机器人直发 image 消息只认 image_key（形如 `img_xxx`）。
 * 想要直接发送本地文件，请使用 FeishuBot.sendImage() 或 FeishuBot.uploadImage()。
 */
export function buildImage(imageKey: string): ImageMessage {
  return {
    msg_type: 'image',
    content: {
      image_key: imageKey,
    },
  };
}
