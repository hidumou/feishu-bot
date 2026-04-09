import { describe, expect, it } from 'vitest';

import {
  buildImage,
  buildInteractive,
  buildPost,
  buildShareChat,
  buildText,
} from '../src/messages/index.js';

describe('buildText', () => {
  it('builds a plain text message', () => {
    expect(buildText('hello')).toEqual({
      msg_type: 'text',
      content: { text: 'hello' },
    });
  });

  it('appends <at user_id="all"> when atAll=true', () => {
    const msg = buildText('hi', { atAll: true });
    expect(msg.msg_type).toBe('text');
    expect(msg.content.text).toContain('<at user_id="all">所有人</at>');
    expect(msg.content.text.startsWith('hi')).toBe(true);
  });

  it('appends <at user_id="xxx"> for every atUserIds entry', () => {
    const msg = buildText('hi', { atUserIds: ['ou_1', 'ou_2'] });
    expect(msg.content.text).toContain('<at user_id="ou_1"></at>');
    expect(msg.content.text).toContain('<at user_id="ou_2"></at>');
  });

  it('supports combining atUserIds and atAll', () => {
    const msg = buildText('hi', { atUserIds: ['ou_1'], atAll: true });
    expect(msg.content.text).toContain('<at user_id="ou_1"></at>');
    expect(msg.content.text).toContain('<at user_id="all">所有人</at>');
  });

  it('empty atUserIds array does not inject any at tag', () => {
    const msg = buildText('hi', { atUserIds: [] });
    expect(msg.content.text).toBe('hi');
  });
});

describe('buildPost', () => {
  it('wraps PostContent into { msg_type: post, content: { post } }', () => {
    const post = {
      zh_cn: {
        title: '标题',
        content: [
          [
            { tag: 'text' as const, text: '正文' },
            { tag: 'a' as const, text: '链接', href: 'https://example.com' },
          ],
        ],
      },
    };
    expect(buildPost(post)).toEqual({
      msg_type: 'post',
      content: { post },
    });
  });

  it('supports multiple locales', () => {
    const msg = buildPost({
      zh_cn: { content: [[{ tag: 'text', text: '中' }]] },
      en_us: { content: [[{ tag: 'text', text: 'en' }]] },
    });
    expect(msg.content.post.zh_cn?.content[0][0]).toEqual({
      tag: 'text',
      text: '中',
    });
    expect(msg.content.post.en_us?.content[0][0]).toEqual({
      tag: 'text',
      text: 'en',
    });
  });
});

describe('buildImage', () => {
  it('wraps image_key', () => {
    expect(buildImage('img_abc')).toEqual({
      msg_type: 'image',
      content: { image_key: 'img_abc' },
    });
  });
});

describe('buildShareChat', () => {
  it('wraps share_chat_id', () => {
    expect(buildShareChat('oc_xxx')).toEqual({
      msg_type: 'share_chat',
      content: { share_chat_id: 'oc_xxx' },
    });
  });
});

describe('buildInteractive', () => {
  it('passes card schema 2.0 through unchanged', () => {
    const card = {
      schema: '2.0',
      header: { title: { tag: 'plain_text', content: 'Title' } },
      body: { elements: [] },
    };
    const msg = buildInteractive(card);
    expect(msg).toEqual({ msg_type: 'interactive', card });
    // 引用透传（而非深拷贝）
    expect(msg.card).toBe(card);
  });

  it('passes legacy card format through unchanged', () => {
    const card = {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: '标题' },
      },
      elements: [],
    };
    expect(buildInteractive(card)).toEqual({ msg_type: 'interactive', card });
  });
});
