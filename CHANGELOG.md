# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-04-09

### Added

- **同构（isomorphic）支持** 🎉 同一份产物 `dist/index.js` 可在 Node 18+、现代浏览器、Service Worker、Chrome MV3 扩展 background SW、Cloudflare Workers、Deno、Bun 等运行时直接运行
- `ImageSource` 新增 `Blob` / `File` 支持，浏览器与 SW 推荐用法：`bot.sendImage(await fetch(url).then(r => r.blob()))`
- `TokenStorage` 适配器接口与 `CachedToken` 公开类型：可注入 `chrome.storage.session`、Redis、KV 等外部存储，让 `tenant_access_token` 在跨进程/跨重启（如 MV3 SW 被杀）时复用，避免冷启动消耗频次
- `package.json` exports map 新增 `browser` / `worker` 条件，并增加顶层 `browser` 字段
- README 新增「在浏览器 / Service Worker / 浏览器扩展 (MV3) 中使用」专章，含完整 MV3 manifest 与 `chrome.storage.session` 适配器示例
- 测试覆盖 +7：`sendImage(Blob)` 字节级 round-trip、`sendImage(File)` 文件名保留、`tokenStorage` 透传到 `TokenManager`、storage 命中跳过网络、stale 时回退网络、storage.get 抛错降级、storage.set 失败不抛

### Changed

- 签名实现从 `node:crypto` 切换到 WebCrypto (`crypto.subtle`)，彻底移除 `node:crypto` 依赖；Node 18+ / 浏览器 / SW 都走同一条路径
- `image-uploader` 中 `node:fs/promises` / `node:path` 的引用通过 `new Function('return import(...)')` 隐藏，避免被浏览器/扩展打包器静态分析为不可解析依赖；文件路径分支仍然只在 Node 可用，浏览器/SW 中传 string 路径会抛 `FeishuConfigError`
- 构建 `target` 从 `node18` 改为 `es2022`

### Breaking

- `genSign(timestamp, secret)` 现在返回 `Promise<string>`（之前是同步 `string`）。原因：WebCrypto API 仅提供异步接口。使用 `FeishuBot` 高层方法（`sendText` / `sendImage` 等）的用户**不受影响**；直接 import 并调用 `genSign` 的用户需要加 `await`

## [0.1.0] - 2026-04-09

### Added

- 初始版本 🎉
- `FeishuBot` 主类，支持自动签名与延迟配置校验
- 5 种消息类型：`text` / `post` / `image` / `share_chat` / `interactive`
- `sendImage` 智能识别 `image_key` 前缀、本地路径、`Buffer`、`Uint8Array`
- 透明的图片上传：内置 `TokenManager`（`tenant_access_token` 缓存 + 并发去重）与 `ImageUploader`
- 独立的消息构造器：`buildText` / `buildPost` / `buildImage` / `buildShareChat` / `buildInteractive`
- 完整 TypeScript 类型定义，ES Module + CommonJS 双格式输出
- 错误体系：`FeishuBotError` / `FeishuConfigError` / `FeishuApiError`
- 零运行时依赖（仅使用 Node 18+ 内置能力）
