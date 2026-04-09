# @minitool/feishu-bot

[![npm version](https://img.shields.io/npm/v/@minitool/feishu-bot.svg?logo=npm)](https://www.npmjs.com/package/@minitool/feishu-bot)
[![npm downloads](https://img.shields.io/npm/dm/@minitool/feishu-bot.svg)](https://www.npmjs.com/package/@minitool/feishu-bot)
[![GitHub release](https://img.shields.io/github/v/release/hidumou/feishu-bot.svg?logo=github)](https://github.com/hidumou/feishu-bot/releases)
[![License](https://img.shields.io/npm/l/@minitool/feishu-bot.svg)](./LICENSE)

> 轻量、零依赖、同构的飞书自定义机器人 SDK。

## 特性

- **5 种消息类型** — `text` / `post` / `image` / `share_chat` / `interactive`
- **透明图片上传** — 传 `Blob` / `Buffer` / 文件路径，自动走 `im/v1/images` 获取 `image_key` 再发送
- **自动签名** — HMAC-SHA256，基于 WebCrypto，传入 `secret` 即自动注入 `timestamp` + `sign`
- **Token 管理** — `tenant_access_token` 自动缓存、刷新、并发去重；可选注入 `TokenStorage` 适配器做跨进程/跨重启持久化
- **同构** — 同一份产物可在 Node 18+ / 浏览器 / Service Worker / Chrome MV3 扩展 / Cloudflare Workers / Deno / Bun 直接运行
- **零运行时依赖** — 仅使用运行时内置的 `fetch` / `FormData` / `Blob` / `crypto.subtle`

## 安装

```bash
pnpm add @minitool/feishu-bot
```

## 快速开始

```ts
import { FeishuBot } from '@minitool/feishu-bot';

const bot = new FeishuBot({
  webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
  secret: 'your-secret', // 可选
});

await bot.sendText('Hello 飞书！');
```

所有配置也可以通过环境变量注入（构造时不传参即从 env 读取）：

```ts
const bot = new FeishuBot(); // 读取 FEISHU_BOT_WEBHOOK、FEISHU_BOT_SECRET 等
```

## 配置

| 字段 | 环境变量 | 必需 | 说明 |
|---|---|---|---|
| `webhook` | `FEISHU_BOT_WEBHOOK` | ✅ | 机器人 webhook URL |
| `secret` | `FEISHU_BOT_SECRET` | 可选 | 签名校验密钥 |
| `appId` | `FEISHU_APP_ID` | 图片上传时必需 | 自建应用 App ID |
| `appSecret` | `FEISHU_APP_SECRET` | 图片上传时必需 | 自建应用 App Secret |
| `tokenStorage` | — | 可选 | `TokenStorage` 适配器，用于 token 跨重启持久化 |
| `fetch` | — | 可选 | 自定义 fetch 实现 |
| `timeout` | — | 可选 | 请求超时毫秒数，默认 `10000` |
| `baseUrl` | — | 可选 | 飞书 API 基础 URL，默认 `https://open.feishu.cn` |

## 发送消息

### text

```ts
await bot.sendText('部署完成');
await bot.sendText('请注意', { atAll: true });
await bot.sendText('请看', { atUserIds: ['ou_xxxxx'] });
```

### post 富文本

```ts
await bot.sendPost({
  zh_cn: {
    title: '发布通知',
    content: [
      [
        { tag: 'text', text: '版本 v1.2.0 已上线，' },
        { tag: 'a', text: '查看详情', href: 'https://example.com/release' },
      ],
    ],
  },
});
```

### image

```ts
// 已有 image_key → 直发
await bot.sendImage('img_v2_041b28e3-xxx');

// 本地路径 → 自动上传（仅 Node）
await bot.sendImage('./screenshot.png');

// Blob → 自动上传（浏览器 / SW / Node 均可）
const resp = await fetch('https://example.com/banner.png');
await bot.sendImage(await resp.blob());

// Buffer / Uint8Array → 自动上传
await bot.sendImage(Buffer.from([...]));
```

> 图片上传需要 `appId` + `appSecret`（飞书 `im/v1/images` 接口要求 `tenant_access_token`）。
> 浏览器 / SW 环境仅支持 `Blob` / `File` / `Uint8Array`，传字符串路径会抛错。

### share_chat

```ts
await bot.sendShareChat('oc_xxxxxxx');
```

### interactive 卡片

```ts
await bot.sendInteractive({
  schema: '2.0',
  header: {
    title: { tag: 'plain_text', content: '构建完成' },
    template: 'green',
  },
  body: {
    elements: [
      { tag: 'markdown', content: '**提交人**: @xxx\n**分支**: main' },
    ],
  },
});
```

## 浏览器 / Service Worker / 扩展

同一个 bundle 开箱即用，不同环境的差异：

| 能力 | Node | 浏览器 | MV3 SW |
|---|:---:|:---:|:---:|
| 消息发送 | ✅ | ⚠️ CORS | ✅ |
| 图片上传（Blob / Uint8Array） | ✅ | ⚠️ CORS | ✅ |
| 图片上传（文件路径） | ✅ | ❌ | ❌ |

> 浏览器主线程会被 CORS 拦截；**MV3 SW 不受 CORS 限制**，只需在 `manifest.json` 声明 `host_permissions`。

### Chrome MV3 扩展示例

```ts
// background.ts
import { FeishuBot, type TokenStorage } from '@minitool/feishu-bot';

// MV3 SW 空闲 ~30s 就会被杀，注入 storage 让 token 跨重启存活
const tokenStorage: TokenStorage = {
  async get() {
    const { t } = await chrome.storage.session.get('t');
    return t ?? null;
  },
  async set(value) {
    await chrome.storage.session.set({ t: value });
  },
};

const bot = new FeishuBot({
  webhook: '...',
  secret: '...',
  tokenStorage,
});

await bot.sendText('hello from extension');
```

```json
// manifest.json 必备字段
{
  "background": { "service_worker": "background.js", "type": "module" },
  "host_permissions": ["https://open.feishu.cn/*"],
  "permissions": ["storage"]
}
```

> 完整示例见 [`examples/extension-sw.ts`](./examples/extension-sw.ts)。

## API

### `new FeishuBot(options?)`

| 方法 | 说明 |
|---|---|
| `send(payload)` | 原子发送，接受 `MessagePayload` |
| `sendText(text, opts?)` | 文本消息，支持 `{ atAll, atUserIds }` |
| `sendPost(post)` | 富文本消息 |
| `sendImage(input)` | 图片：`string` / `Buffer` / `Uint8Array` / `Blob` / `File` |
| `sendShareChat(id)` | 分享群名片 |
| `sendInteractive(card)` | 卡片消息 |
| `uploadImage(file)` | 仅上传图片，返回 `image_key` |

所有方法返回 `Promise<FeishuApiResponse>`，飞书返回 `code !== 0` 时抛 `FeishuApiError`。

### 错误类型

| 类 | 场景 |
|---|---|
| `FeishuConfigError` | 缺少 `webhook` / `appId` / `appSecret` 等配置 |
| `FeishuApiError` | 飞书 API 返回错误（含 `.code` 和 `.response`） |

```ts
import { FeishuConfigError, FeishuApiError } from '@minitool/feishu-bot';

try {
  await bot.sendText('hi');
} catch (err) {
  if (err instanceof FeishuApiError) {
    console.error(`code=${err.code}`, err.message);
  }
}
```

### 其他导出

| 导出 | 用途 |
|---|---|
| `buildText` / `buildPost` / `buildImage` / `buildShareChat` / `buildInteractive` | 独立消息构造器 |
| `genSign(timestamp, secret)` | 签名工具（返回 `Promise<string>`）|
| `TokenManager` / `TokenStorage` / `CachedToken` | token 管理底层组件与类型 |
| `ImageUploader` / `ImageSource` | 图片上传底层组件与类型 |

## 许可

MIT
