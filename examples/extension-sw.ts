/**
 * @minitool/feishu-bot 在 Chrome MV3 扩展 background Service Worker 中的完整示例
 *
 * 这个文件本身不能用 Node 直接跑 —— 它演示的是「打包成扩展 SW 后的运行形态」。
 * 把这个文件作为扩展项目的入口（比如用 @crxjs/vite-plugin / wxt / webpack 打包成 background.js），
 * 然后按下方的 manifest.json 示例配置即可。
 *
 * ============================================================================
 * 1) manifest.json 必备字段
 * ============================================================================
 *
 * {
 *   "manifest_version": 3,
 *   "name": "My Feishu Notifier",
 *   "version": "1.0.0",
 *   "background": {
 *     "service_worker": "background.js",
 *     "type": "module"
 *   },
 *   "host_permissions": [
 *     "https://open.feishu.cn/*"
 *   ],
 *   "permissions": [
 *     "storage"
 *   ],
 *   "action": {
 *     "default_title": "Send to Feishu"
 *   }
 * }
 *
 * 关键点：
 * - host_permissions 必须包含 https://open.feishu.cn/*，否则 SW 里 fetch 会被拦截
 * - permissions 要有 "storage"，因为我们用 chrome.storage.session 持久化 token
 * - background.type 必须是 "module"，因为 SDK 是 ESM
 *
 * ============================================================================
 * 2) 为什么需要 TokenStorage
 * ============================================================================
 *
 * MV3 background SW 不是常驻进程：约 30 秒空闲就会被浏览器杀掉。
 * 内存里的 tenant_access_token 缓存会丢失，导致每次冷启动都要重新调用
 * /auth/v3/tenant_access_token/internal，浪费飞书 OpenAPI 频次。
 *
 * 注入 chrome.storage.session 适配器后，token 在 SW 重启之间存活
 * （直到浏览器关闭），冷启动也能复用。
 */

import {
  FeishuBot,
  FeishuApiError,
  FeishuConfigError,
  type CachedToken,
  type TokenStorage,
} from '../src/index.js';

// ============================================================================
// 3) chrome.storage.session 适配器
// ============================================================================

/**
 * 让 chrome 类型在不引入 @types/chrome 的前提下也能编译。
 * 真实扩展项目里建议安装 @types/chrome 获得完整类型。
 */
declare const chrome: {
  storage: {
    session: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  runtime: {
    onInstalled: { addListener(cb: () => void): void };
  };
  action: {
    onClicked: { addListener(cb: () => void): void };
  };
};

const TOKEN_KEY = 'feishuToken';

const tokenStorage: TokenStorage = {
  async get(): Promise<CachedToken | null> {
    const result = await chrome.storage.session.get(TOKEN_KEY);
    const value = result[TOKEN_KEY];
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as CachedToken).token === 'string' &&
      typeof (value as CachedToken).expiresAt === 'number'
    ) {
      return value as CachedToken;
    }
    return null;
  },
  async set(value: CachedToken): Promise<void> {
    await chrome.storage.session.set({ [TOKEN_KEY]: value });
  },
};

// ============================================================================
// 4) 创建 bot 实例
// ============================================================================
//
// ⚠️ 这里硬编码 webhook / secret / appId / appSecret 是为了示例简洁。
// 生产代码里建议从打包时的 env 注入（Vite 的 import.meta.env、webpack 的
// DefinePlugin），不要把秘钥提交到代码仓库。
// ============================================================================

const bot = new FeishuBot({
  webhook:
    'https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-0000-0000-000000000000',
  secret: 'your-bot-signing-secret', // 启用了「签名校验」时填
  appId: 'cli_xxxxxxxxxxxxxxxx', // 仅图片上传需要
  appSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  tokenStorage, // ← 关键：让 token 跨 SW 重启复用
});

// ============================================================================
// 5) 发送文本消息
// ============================================================================

async function sendDeployNotification(): Promise<void> {
  await bot.sendText('🚀 部署完成 from extension SW', { atAll: true });
}

// ============================================================================
// 6) 发送图片消息
// ============================================================================
//
// SW 没有文件系统，图片源只能是 Blob / File / Uint8Array。
// 三种典型来源：
// ============================================================================

/** A) 从远程 URL 拉一个 Blob 直接发 */
async function sendRemoteImage(url: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch image: HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  await bot.sendImage(blob);
}

/** B) 从 OffscreenCanvas 截图发送（需要先在 popup/content-script 渲染好） */
async function sendCanvasSnapshot(canvas: OffscreenCanvas): Promise<void> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  await bot.sendImage(blob);
}

/** C) 从消息通道收到的 ArrayBuffer / Uint8Array */
async function sendBytes(bytes: Uint8Array): Promise<void> {
  await bot.sendImage(bytes);
}

// ============================================================================
// 7) 卡片消息（支持 schema 2.0）
// ============================================================================

async function sendBuildCard(): Promise<void> {
  await bot.sendInteractive({
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: '✅ 构建完成' },
      template: 'green',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: '**来源**: Chrome 扩展\n**触发**: 用户点击工具栏按钮',
        },
      ],
    },
  });
}

// ============================================================================
// 8) 错误处理：包一层统一捕获
// ============================================================================

async function safeSend(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    if (err instanceof FeishuConfigError) {
      // 配置缺失：webhook / secret / appId / appSecret
      console.error('[FeishuConfigError]', err.message);
    } else if (err instanceof FeishuApiError) {
      // 业务错误：飞书返回的 code 与完整 response
      console.error(`[FeishuApiError] code=${err.code}:`, err.message);
      console.error('response:', err.response);
    } else {
      console.error('[Unknown error]', err);
    }
  }
}

// ============================================================================
// 9) 注册扩展事件
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  void safeSend(async () => {
    await bot.sendText('🎉 扩展已安装，feishu-bot 工作正常');
  });
});

chrome.action.onClicked.addListener(() => {
  void safeSend(async () => {
    await sendDeployNotification();
    await sendBuildCard();
    await sendRemoteImage('https://example.com/banner.png');
  });
});

// 防止 tree-shaking 把未使用的 helper 删掉（扩展项目里通常 import 即可）
export { sendDeployNotification, sendRemoteImage, sendCanvasSnapshot, sendBytes, sendBuildCard };
