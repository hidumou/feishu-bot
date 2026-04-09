/**
 * @minitool/feishu-bot — 飞书自定义机器人 SDK
 *
 * 支持的消息类型：text / post / image / share_chat / interactive
 * 特色：sendImage 自动处理图片上传，构造期不报错（缺失配置延迟到 send 时抛）。
 *
 * 快速上手：
 *   import { FeishuBot } from '@minitool/feishu-bot';
 *   const bot = new FeishuBot({ webhook: '...', secret: '...' });
 *   await bot.sendText('hello');
 */

// 主类
export { FeishuBot } from './client.js';

// 类型
export type {
  FeishuBotOptions,
  FeishuApiResponse,
  AtOptions,
  MessagePayload,
  SignedPayload,
  TextMessage,
  PostMessage,
  PostContent,
  PostLocale,
  PostTag,
  ImageMessage,
  ShareChatMessage,
  InteractiveMessage,
  InteractiveCard,
  UploadImageResult,
  TenantAccessTokenResponse,
} from './types.js';

// 错误
export {
  FeishuBotError,
  FeishuConfigError,
  FeishuApiError,
} from './errors.js';

// 消息构造器（便于单独使用）
export {
  buildText,
  buildPost,
  buildImage,
  buildShareChat,
  buildInteractive,
} from './messages/index.js';

// 签名工具（便于测试或自行实现 webhook）
export { genSign, currentTimestamp } from './signer.js';

// 底层组件（高级用法）
export {
  TokenManager,
  type TokenStorage,
  type CachedToken,
} from './token-manager.js';
export { ImageUploader, type ImageSource } from './image-uploader.js';
