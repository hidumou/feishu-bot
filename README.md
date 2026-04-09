# @minitool/feishu-bot

> 轻量、零运行时依赖、TypeScript 优先的飞书自定义机器人 SDK。

- ✅ 支持全部 5 种消息类型：`text` / `post` / `image` / `share_chat` / `interactive`
- ✅ 透明处理图片上传：`sendImage('./local.png')` 自动走 `im/v1/images` 接口取 `image_key` 再发送
- ✅ 自动注入签名（HMAC-SHA256）
- ✅ `tenant_access_token` 自动缓存与刷新
- ✅ 仅依赖 Node 18+ 内置 `fetch` / `FormData` / `Blob` / `node:crypto` / `node:fs/promises`，零运行时依赖
- ✅ 构造期不抛错，便于「先 new 再注入配置」

## 安装

```bash
pnpm add @minitool/feishu-bot
# 或
npm install @minitool/feishu-bot
```

要求 Node.js ≥ 18。

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

// 2. 本地文件路径 → 自动上传再发（需要 appId/appSecret）
await bot.sendImage('./screenshot.png');

// 3. Buffer / Uint8Array → 自动上传再发
import { readFile } from 'node:fs/promises';
const buf = await readFile('./screenshot.png');
await bot.sendImage(buf);

// 也可以只拿 image_key，稍后自己复用
const imageKey = await bot.uploadImage('./screenshot.png');
await bot.sendImage(imageKey);
```

> ⚠️ 图片上传需要自建应用的 App ID / App Secret，因为飞书 `im/v1/images` 接口要求 `tenant_access_token` 授权。

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
| `sendImage(input)` | 图片：`string`（`img_` 前缀→直发 / 其它→路径上传）、`Buffer`、`Uint8Array` |
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

## 频控与限制

飞书官方规则（每个机器人独立计数）：

- `100` 次/分钟
- `5` 次/秒
- body 大小 `≤ 20KB`

SDK 不做内置限流；请在调用方按需排队或节流。

## Roadmap

下面是计划在 v0.2 加入的特性（当前版本已评估但延后）：

- **更细粒度的错误类型**：在 `FeishuApiError` 之上拆分 `FeishuNetworkError` / `FeishuTimeoutError` / `FeishuHttpError` 子类（或在当前类上加 `kind` 字段），便于调用方区分超时、网络抖动、HTTP 状态码错误与业务 code。
- **图片上传自定义元数据**：`uploadImage` / `sendImage` 支持 `{ filename, contentType }` 选项，用于 Buffer/Uint8Array 入参时指定文件名与 MIME。

## 许可

MIT © hidumou
