/**
 * @minitool/feishu-bot 使用示例
 *
 * 运行方式（推荐 Node 20.6+）：
 *   node --env-file=../.env --import tsx ./basic.ts
 * 或：
 *   pnpm tsx examples/basic.ts
 *
 * 需要在项目根目录放 .env，内容形如：
 *   FEISHU_BOT_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
 *   FEISHU_BOT_SECRET=xxx           # 可选
 *   FEISHU_APP_ID=cli_xxx           # 图片上传需要
 *   FEISHU_APP_SECRET=xxx           # 图片上传需要
 */

import {
  FeishuBot,
  FeishuApiError,
  FeishuConfigError,
} from '../src/index.js';

async function main(): Promise<void> {
  // 不传参数，全部从 env 读取
  const bot = new FeishuBot();

  // 1. text 消息
  await bot.sendText('Hello 飞书！来自 @minitool/feishu-bot');

  // 2. text + @ 所有人（仅群聊有效）
  await bot.sendText('发布流程开始', { atAll: true });

  // 3. post 富文本
  await bot.sendPost({
    zh_cn: {
      title: '示例富文本',
      content: [
        [
          { tag: 'text', text: '这是一段带链接的文字：' },
          { tag: 'a', text: '飞书开放平台', href: 'https://open.feishu.cn' },
        ],
        [{ tag: 'text', text: '第二行内容' }],
      ],
    },
  });

  // 4. share_chat 分享群名片（需要一个真实的 chat_id）
  // await bot.sendShareChat('oc_xxxxxxxxxxxxxxxxxxxxxxxx');

  // 5. interactive 卡片
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
          content: '**状态**: 成功\n**耗时**: 42s',
        },
      ],
    },
  });

  // 6. image 消息 —— 本地文件路径会自动上传后发送
  //    需要 FEISHU_APP_ID / FEISHU_APP_SECRET
  // await bot.sendImage('./screenshot.png');

  // 7. image 消息 —— 已有 image_key 直发
  // await bot.sendImage('img_v2_041b28e3-xxxxxxxxxxxxxxxxxxxxxxxxxxx');

  // 8. 也可以只上传拿 image_key，稍后复用
  // const imageKey = await bot.uploadImage('./screenshot.png');
  // console.log('got image_key:', imageKey);
  // await bot.sendImage(imageKey);

  console.log('All examples sent successfully.');
}

main().catch((err: unknown) => {
  if (err instanceof FeishuConfigError) {
    console.error('[FeishuConfigError]', err.message);
    process.exit(1);
  }
  if (err instanceof FeishuApiError) {
    console.error(`[FeishuApiError] code=${err.code}:`, err.message);
    console.error('response:', err.response);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
