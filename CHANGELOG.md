# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
