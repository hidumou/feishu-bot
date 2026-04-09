# @minitool/feishu-bot

[![npm version](https://img.shields.io/npm/v/@minitool/feishu-bot.svg?logo=npm)](https://www.npmjs.com/package/@minitool/feishu-bot)
[![npm downloads](https://img.shields.io/npm/dm/@minitool/feishu-bot.svg)](https://www.npmjs.com/package/@minitool/feishu-bot)
[![GitHub release](https://img.shields.io/github/v/release/hidumou/feishu-bot.svg?logo=github)](https://github.com/hidumou/feishu-bot/releases)
[![License](https://img.shields.io/npm/l/@minitool/feishu-bot.svg)](./LICENSE)

> 轻量、零运行时依赖、TypeScript 优先、**真正同构**的飞书自定义机器人 SDK。

- ✅ 支持全部 5 种消息类型：`text` / `post` / `image` / `share_chat` / `interactive`
- ✅ 透明处理图片上传：`sendImage(blob)` / `sendImage('./local.png')` 自动走 `im/v1/images` 接口取 `image_key` 再发送
- ✅ 自动注入签名（HMAC-SHA256，基于 WebCrypto）
- ✅ `tenant_access_token` 自动缓存与刷新，可选注入 `TokenStorage` 适配器（适合 MV3 SW 跨重启复用）
- ✅ **同构**：同一个 bundle 在 Node 18+ / 浏览器 / Service Worker / 浏览器扩展 SW (MV3) / Cloudflare Workers / Deno / Bun 都能跑
- ✅ 零运行时依赖，仅使用各运行时内置的 `fetch` / `FormData` / `Blob` / `crypto.subtle`
- ✅ 构造期不抛错，便于「先 new 再注入配置」

## 安装

```bash
pnpm add @minitool/feishu-bot
# 或
npm install @minitool/feishu-bot
```

**运行时要求**：Node.js ≥ 18 / Chrome ≥ 89 / Firefox ≥ 90 / Safari ≥ 15 / Cloudflare Workers / Deno / Bun。
凡是支持 `fetch` + `WebCrypto (crypto.subtle)` + `FormData` + `Blob` 的运行时都能用。

## 快速开始

```ts
import { FeishuBot } from '@minitool/feishu-bot';

// 从参数读
const bot = new FeishuBot({
  webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
  secret: 'your-secret', // 可选，若机器人启用了「签名校验」
});

// 或完全从环境变量读（见下方「配置」小节）
const bot2 = new FeishuBot();

await bot.sendText('Hello 飞书！');
```

## 配置

所有 `FeishuBotOptions` 字段都能通过环境变量提供默认值。**显式参数优先于环境变量**。

| 字段 | 环境变量 | 必需 | 说明 |
|---|---|---|---|
| `webhook` | `FEISHU_BOT_WEBHOOK` | ✅ | 机器人 webhook URL |
| `secret` | `FEISHU_BOT_SECRET` | 可选 | 启用签名校验时必填 |
| `appId` | `FEISHU_APP_ID` | 图片上传必需 | 自建应用 App ID |
| `appSecret` | `FEISHU_APP_SECRET` | 图片上传必需 | 自建应用 App Secret |
| `fetch` | — | 可选 | 注入自定义 fetch，测试用 |
| `timeout` | — | 可选 | 请求超时，单位毫秒，默认 `10000` |
| `baseUrl` | — | 可选 | 飞书开放平台基础 URL，默认 `https://open.feishu.cn` |
| `tokenStorage` | — | 可选 | `TokenStorage` 适配器；用于让 `tenant_access_token` 在跨进程/跨重启时复用，详见下方「浏览器扩展 SW」小节 |

> SDK 本身不引入 `dotenv`。如果你想用 `.env` 文件，可以通过 `node --env-file=.env app.js`（Node 20.6+）或在项目 devDep 里装 `dotenv` 自行预加载。

## 发送消息

### text 文本消息（含 @）

```ts
await bot.sendText('部署完成 ✅');

// @ 所有人（仅群内有效）
await bot.sendText('请注意', { atAll: true });

// @ 指定用户（需要 open_id）
await bot.sendText('请看', { atUserIds: ['ou_xxxxx', 'ou_yyyyy'] });
```

### post 富文本

```ts
await bot.sendPost({
  zh_cn: {
    title: '发布通知',
    content: [
      [
        { tag: 'text', text: '版本 ' },
        { tag: 'text', text: 'v1.2.0' },
        { tag: 'text', text: ' 已上线，查看' },
        { tag: 'a', text: '详情', href: 'https://example.com/release' },
      ],
      [{ tag: 'at', user_id: 'ou_xxx' }],
    ],
  },
});
```

### image 图片消息

`sendImage` 会根据入参类型自动选择行为：

```ts
// 1. 已有 image_key（以 `img_` 开头）→ 直发
await bot.sendImage('img_v2_041b28e3-xxx');

// 2. 本地文件路径 → 自动上传再发（仅 Node，需要 appId/appSecret）
await bot.sendImage('./screenshot.png');

// 3. Buffer / Uint8Array → 自动上传再发（同构）
import { readFile } from 'node:fs/promises';
const buf = await readFile('./screenshot.png');
await bot.sendImage(buf);

// 4. Blob / File → 自动上传再发（浏览器 / SW / 扩展首选）
const resp = await fetch('https://example.com/banner.png');
await bot.sendImage(await resp.blob());

// 也可以只拿 image_key，稍后自己复用
const imageKey = await bot.uploadImage('./screenshot.png');
await bot.sendImage(imageKey);
```

> ⚠️ 图片上传需要自建应用的 App ID / App Secret，因为飞书 `im/v1/images` 接口要求 `tenant_access_token` 授权。
>
> ℹ️ 在浏览器 / SW / 扩展中，**只能用 `Blob` / `File` / `Uint8Array`**——传字符串路径会抛 `FeishuConfigError`。

### share_chat 分享群名片

```ts
await bot.sendShareChat('oc_xxxxxxx');
```

### interactive 卡片

直接透传 card 结构（支持 schema 2.0 或旧版）：

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

## 错误处理

```ts
import { FeishuBot, FeishuConfigError, FeishuApiError } from '@minitool/feishu-bot';

try {
  await bot.sendText('hi');
} catch (err) {
  if (err instanceof FeishuConfigError) {
    // 缺配置：webhook / secret / appId / appSecret
    console.error('配置错误：', err.message);
  } else if (err instanceof FeishuApiError) {
    // 业务错误：包含飞书返回的 code 与完整 response
    console.error(`飞书 API 错误 code=${err.code}:`, err.message);
    console.error('完整响应：', err.response);
  } else {
    throw err;
  }
}
```

## 签名校验

在飞书机器人「安全设置 → 签名校验」开启后，记录下密钥并传给 SDK：

```ts
const bot = new FeishuBot({ webhook: '...', secret: 'xxxx' });
// SDK 会在每次发送时自动附加 timestamp + sign
```

签名算法（见 `src/signer.ts`）：

```
stringToSign = `${timestamp}\n${secret}`
sign         = Base64(HmacSHA256(key = stringToSign, data = ''))
```

注意：这是飞书反直觉的地方 —— HMAC 的 `key` 是 `stringToSign`，`data` 是空字符串。

## API 参考

### `new FeishuBot(options?)`

| 方法 | 说明 |
|---|---|
| `send(payload)` | 原子发送，接受已构造好的 `MessagePayload` |
| `sendText(text, { atUserIds?, atAll? })` | 文本消息 |
| `sendPost(post)` | 富文本 |
| `sendImage(input)` | 图片：`string`（`img_` 前缀→直发 / 其它→路径上传，仅 Node）、`Buffer`、`Uint8Array`、`Blob`、`File` |
| `sendShareChat(shareChatId)` | 分享群名片 |
| `sendInteractive(card)` | 卡片 |
| `uploadImage(file)` | 单独上传图片，返回 `image_key` |

所有方法返回 `Promise<FeishuApiResponse>`；`code !== 0` 时抛 `FeishuApiError`。

### 独立使用消息构造器

如果你只需要构造 payload 而不发送：

```ts
import { buildText, buildPost, buildImage } from '@minitool/feishu-bot';

const payload = buildText('hi', { atAll: true });
// => { msg_type: 'text', content: { text: 'hi <at user_id="all">所有人</at>' } }
```

## 在浏览器 / Service Worker / 浏览器扩展 (MV3) 中使用

本 SDK 是真正同构的 —— 同一个 `dist/index.js` 可以直接在以下环境运行：Node 18+、现代浏览器主线程、Web/Service Worker、Chrome MV3 扩展 background SW、Cloudflare Workers、Deno、Bun。

### 关键差异

| 能力 | Node | 浏览器主线程 | MV3 SW |
|---|:---:|:---:|:---:|
| 文本 / 富文本 / 卡片 / 群名片 | ✅ | ⚠️ CORS¹ | ✅ |
| 图片上传：`Blob` / `File` / `Uint8Array` | ✅ | ⚠️ CORS¹ | ✅ |
| 图片上传：本地文件路径 string | ✅ | ❌ | ❌ |
| `tenant_access_token` 跨重启复用 | 进程内即可 | localStorage 等 | ✅ 推荐 `chrome.storage.session` |

¹ 浏览器主线程直连 `open.feishu.cn` 会被 CORS 拦截。**MV3 SW 不受 CORS 约束**，只要 `manifest.json` 里声明了 `host_permissions` 即可。

### Chrome MV3 扩展示例

`manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0.0",
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "host_permissions": ["https://open.feishu.cn/*"],
  "permissions": ["storage"]
}
```

`background.ts`（用 Vite + `@crxjs/vite-plugin` 或 webpack 打包成 `background.js`）：

```ts
import { FeishuBot, type TokenStorage } from '@minitool/feishu-bot';

// MV3 SW 空闲 ~30s 就会被杀，内存里的 token 会丢。
// 注入 chrome.storage.session 适配器，让 token 在 SW 重启间存活。
const tokenStorage: TokenStorage = {
  async get() {
    const { feishuToken } = await chrome.storage.session.get('feishuToken');
    return feishuToken ?? null;
  },
  async set(value) {
    await chrome.storage.session.set({ feishuToken: value });
  },
};

const bot = new FeishuBot({
  webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
  secret: 'your-secret',          // 可选
  appId: 'cli_xxx',               // 仅图片上传需要
  appSecret: 'xxx',
  tokenStorage,                   // ← 关键
});

// 文本
await bot.sendText('hello from extension');

// 图片：从网络拉一个 Blob 直接发
const resp = await fetch('https://example.com/banner.png');
await bot.sendImage(await resp.blob());

// 或从 OffscreenCanvas
const blob = await offscreenCanvas.convertToBlob();
await bot.sendImage(blob);
```

### `TokenStorage` 接口

```ts
interface CachedToken {
  token: string;
  /** Unix 毫秒时间戳 */
  expiresAt: number;
}

interface TokenStorage {
  /** 没有缓存或读失败时返回 null */
  get(): Promise<CachedToken | null>;
  /** 写入新的 token；写失败不应抛 */
  set(value: CachedToken): Promise<void>;
}
```

`TokenManager` 内部按以下顺序查找：**内存缓存 → `TokenStorage` → 网络**。`storage` 抛任何异常都会被吞掉并降级到下一层，永不阻塞主流程。

> 同样的适配器接口也可以用于 Cloudflare Workers KV、Redis、文件系统、Deno KV 等任何外部存储。

## 频控与限制

飞书官方规则（每个机器人独立计数）：

- `100` 次/分钟
- `5` 次/秒
- body 大小 `≤ 20KB`

SDK 不做内置限流；请在调用方按需排队或节流。

## 发布流程

发布由 `.github/workflows/release.yml` 在 `v*` 标签 push 时统一触发：CI 跑完 typecheck/test/build 后调用 `pnpm publish`，再用 `gh release create` 从 `CHANGELOG.md` 提取本版本的 release notes 创建 GitHub Release。

本地有两种打 tag 方式，二选一：

**A) 用 release-it 自动 bump（推荐）**

```bash
pnpm release          # 交互式
pnpm release --ci     # 非交互，conventional commits 自动决定 minor/patch
```

`release-it` 已经禁用了 `npm.publish` / `github.release`，只负责：跑 typecheck+test → 由 conventional-changelog 决定下一个版本 → 跑 build → 更新 `CHANGELOG.md` → 创建 `chore: release vX.Y.Z` commit → 打 tag → push。push 之后剩下的事情交给 release.yml。

**B) 手动 bump**

```bash
# 1. 改 package.json version
# 2. 在 CHANGELOG.md 顶部新增本版本条目
# 3. 提交并打 tag
git add package.json CHANGELOG.md
git commit -m "chore: release v0.x.0"
git tag v0.x.0
git push origin main v0.x.0
```

不论 A 还是 B，触发点都是「v* tag push」，避免 release-it 与 release.yml 重复 publish 的冲突。

## 许可

MIT © hidumou
