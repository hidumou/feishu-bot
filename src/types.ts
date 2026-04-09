/**
 * 飞书自定义机器人 SDK 的类型定义。
 */

/** SDK 构造配置 */
export interface FeishuBotOptions {
  /** 机器人 webhook URL。默认读 `process.env.FEISHU_BOT_WEBHOOK` */
  webhook?: string;
  /** 签名校验密钥。若设置，会在每次发送时自动附加 timestamp / sign */
  secret?: string;
  /** 应用 App ID，仅图片上传需要。默认读 `process.env.FEISHU_APP_ID` */
  appId?: string;
  /** 应用 App Secret，仅图片上传需要。默认读 `process.env.FEISHU_APP_SECRET` */
  appSecret?: string;
  /** 自定义 fetch 实现，用于测试注入。默认用 globalThis.fetch */
  fetch?: typeof fetch;
  /** 请求超时，单位毫秒。默认 10000 */
  timeout?: number;
  /** 飞书开放平台基础 URL，默认 https://open.feishu.cn */
  baseUrl?: string;
}

/** 飞书 OpenAPI 统一返回结构 */
export interface FeishuApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

// ---------- 消息类型 ----------

/** @-提醒参数 */
export interface AtOptions {
  /** @ 指定用户 open_id 列表 */
  atUserIds?: string[];
  /** @ 所有人 */
  atAll?: boolean;
}

/** 文本消息 */
export interface TextMessage {
  msg_type: 'text';
  content: {
    text: string;
  };
}

/** 富文本消息中的内容标签 */
export type PostTag =
  | { tag: 'text'; text: string; un_escape?: boolean }
  | { tag: 'a'; text: string; href: string }
  | { tag: 'at'; user_id: string; user_name?: string }
  | { tag: 'img'; image_key: string };

/** 富文本单语言内容 */
export interface PostLocale {
  title?: string;
  content: PostTag[][];
}

/** 富文本多语言内容 */
export interface PostContent {
  zh_cn?: PostLocale;
  en_us?: PostLocale;
  ja_jp?: PostLocale;
}

/** 富文本消息 */
export interface PostMessage {
  msg_type: 'post';
  content: {
    post: PostContent;
  };
}

/** 图片消息 */
export interface ImageMessage {
  msg_type: 'image';
  content: {
    image_key: string;
  };
}

/** 分享群名片消息 */
export interface ShareChatMessage {
  msg_type: 'share_chat';
  content: {
    share_chat_id: string;
  };
}

/** 卡片消息（透传 card schema 2.0 或旧版） */
export type InteractiveCard = Record<string, unknown>;

export interface InteractiveMessage {
  msg_type: 'interactive';
  card: InteractiveCard;
}

/** 所有支持的消息类型联合 */
export type MessagePayload =
  | TextMessage
  | PostMessage
  | ImageMessage
  | ShareChatMessage
  | InteractiveMessage;

/** 带签名字段的最终 webhook 请求体 */
export type SignedPayload = MessagePayload & {
  timestamp?: string;
  sign?: string;
};

// ---------- 图片上传相关 ----------

/** 上传图片返回数据 */
export interface UploadImageResult {
  image_key: string;
}

/** 获取 tenant_access_token 的返回 */
export interface TenantAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}
