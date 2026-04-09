import { readEnv } from './env.js';
import { FeishuApiError, FeishuConfigError } from './errors.js';
import { postJson } from './http.js';
import { ImageUploader, type ImageSource } from './image-uploader.js';
import { buildImage } from './messages/image.js';
import { buildInteractive } from './messages/interactive.js';
import { buildPost } from './messages/post.js';
import { buildShareChat } from './messages/share-chat.js';
import { buildText } from './messages/text.js';
import { currentTimestamp, genSign } from './signer.js';
import { TokenManager } from './token-manager.js';
import type {
  AtOptions,
  FeishuApiResponse,
  FeishuBotOptions,
  InteractiveCard,
  MessagePayload,
  PostContent,
  SignedPayload,
} from './types.js';

const DEFAULT_BASE_URL = 'https://open.feishu.cn';

/**
 * 飞书自定义机器人 SDK 主类。
 *
 * 构造期不会报错；缺失配置时延迟到 send/upload 调用时抛出 FeishuConfigError，
 * 便于「先 new 再注入配置」的使用模式。
 *
 * 使用示例：
 *   const bot = new FeishuBot(); // 从 env 读配置
 *   await bot.sendText("hello", { atAll: true });
 *   await bot.sendImage("./banner.png"); // 自动上传得到 image_key 再发送
 */
export class FeishuBot {
  private readonly webhook?: string;
  private readonly secret?: string;
  private readonly appId?: string;
  private readonly appSecret?: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly timeout?: number;
  private readonly baseUrl: string;

  private tokenManager: TokenManager | null = null;
  private imageUploader: ImageUploader | null = null;

  constructor(options: FeishuBotOptions = {}) {
    // 合并优先级：显式参数 > env 变量 > undefined
    this.webhook = options.webhook ?? readEnv('FEISHU_BOT_WEBHOOK');
    this.secret = options.secret ?? readEnv('FEISHU_BOT_SECRET');
    this.appId = options.appId ?? readEnv('FEISHU_APP_ID');
    this.appSecret = options.appSecret ?? readEnv('FEISHU_APP_SECRET');
    this.fetchImpl = options.fetch;
    this.timeout = options.timeout;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  // ---------- 原子发送 ----------

  /**
   * 原子发送：接收已构造好的 payload，负责注入签名并 POST 到 webhook。
   * code !== 0 时抛 FeishuApiError。
   */
  async send<T = unknown>(
    payload: MessagePayload,
  ): Promise<FeishuApiResponse<T>> {
    const webhook = this.ensureWebhook();
    const finalPayload: SignedPayload = { ...payload };

    if (this.secret) {
      const timestamp = currentTimestamp();
      finalPayload.timestamp = String(timestamp);
      finalPayload.sign = genSign(timestamp, this.secret);
    }

    const response = await postJson<FeishuApiResponse<T>>(
      webhook,
      finalPayload,
      {
        fetch: this.fetchImpl,
        timeout: this.timeout,
      },
    );

    // 飞书 webhook 成功时 code=0；其它数值都视为业务错误。
    if (response.code !== 0) {
      throw new FeishuApiError(
        `Feishu webhook error: ${response.msg ?? 'unknown'} (code=${response.code})`,
        response.code,
        response,
      );
    }

    return response;
  }

  // ---------- 高层便捷方法 ----------

  sendText(text: string, opts?: AtOptions): Promise<FeishuApiResponse> {
    return this.send(buildText(text, opts));
  }

  sendPost(post: PostContent): Promise<FeishuApiResponse> {
    return this.send(buildPost(post));
  }

  sendShareChat(shareChatId: string): Promise<FeishuApiResponse> {
    return this.send(buildShareChat(shareChatId));
  }

  sendInteractive(card: InteractiveCard): Promise<FeishuApiResponse> {
    return this.send(buildInteractive(card));
  }

  /**
   * 发送图片。智能识别三种入参：
   *   - string 且以 `img_` 开头 → 直接当 image_key 使用
   *   - string 否则 → 视为本地文件路径，先上传再发送
   *   - Buffer / Uint8Array → 直接上传再发送
   */
  async sendImage(input: ImageSource): Promise<FeishuApiResponse> {
    let imageKey: string;
    if (typeof input === 'string' && input.startsWith('img_')) {
      imageKey = input;
    } else {
      imageKey = await this.uploadImage(input);
    }
    return this.send(buildImage(imageKey));
  }

  /**
   * 暴露底层图片上传，便于调用方复用 image_key。
   * 需要 appId / appSecret 配置。
   */
  async uploadImage(file: ImageSource): Promise<string> {
    const uploader = this.getImageUploader();
    return uploader.uploadImage(file);
  }

  // ---------- 私有：懒初始化 + 校验 ----------

  private ensureWebhook(): string {
    if (!this.webhook) {
      throw new FeishuConfigError(
        'webhook is required. Provide `webhook` in options or set FEISHU_BOT_WEBHOOK env.',
      );
    }
    return this.webhook;
  }

  private ensureAppCredentials(): { appId: string; appSecret: string } {
    if (!this.appId || !this.appSecret) {
      throw new FeishuConfigError(
        'appId and appSecret are required for image upload. Provide them in options or set FEISHU_APP_ID / FEISHU_APP_SECRET env.',
      );
    }
    return { appId: this.appId, appSecret: this.appSecret };
  }

  private getTokenManager(): TokenManager {
    if (!this.tokenManager) {
      const { appId, appSecret } = this.ensureAppCredentials();
      this.tokenManager = new TokenManager({
        appId,
        appSecret,
        fetch: this.fetchImpl,
        timeout: this.timeout,
        baseUrl: this.baseUrl,
      });
    }
    return this.tokenManager;
  }

  private getImageUploader(): ImageUploader {
    if (!this.imageUploader) {
      this.imageUploader = new ImageUploader({
        tokenManager: this.getTokenManager(),
        fetch: this.fetchImpl,
        timeout: this.timeout,
        baseUrl: this.baseUrl,
      });
    }
    return this.imageUploader;
  }
}
