import type { PostContent, PostMessage } from '../types.js';

/**
 * 构造富文本（post）消息。
 *
 * 用户构造 PostContent（支持 zh_cn/en_us/ja_jp 三语言），每个语言下是 `content: PostTag[][]` 的二维数组：
 * 外层是段落（行），内层是行内的标签（text/a/at/img）。
 *
 * 示例：
 *   buildPost({
 *     zh_cn: {
 *       title: "标题",
 *       content: [
 *         [{ tag: "text", text: "第一段: " }, { tag: "a", text: "点这里", href: "https://..." }],
 *         [{ tag: "img", image_key: "img_xxx" }],
 *       ],
 *     },
 *   });
 */
export function buildPost(post: PostContent): PostMessage {
  return {
    msg_type: 'post',
    content: { post },
  };
}
