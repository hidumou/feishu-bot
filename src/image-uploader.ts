import { FeishuApiError, FeishuConfigError } from './errors.js';
import { postForm } from './http.js';
import type { TokenManager } from './token-manager.js';
import type { FeishuApiResponse, UploadImageResult } from './types.js';

const DEFAULT_BASE_URL = 'https://open.feishu.cn';
const UPLOAD_PATH = '/open-apis/im/v1/images';

export interface ImageUploaderOptions {
  tokenManager: TokenManager;
  fetch?: typeof fetch;
  timeout?: number;
  baseUrl?: string;
}

/**
 * 支持的图片源：
 *   - string  : 文件路径（仅 Node 环境，浏览器/SW 会抛错）
 *   - Uint8Array / Buffer : 原始字节
 *   - Blob / File : 浏览器和 SW 推荐的方式（fetch().blob()、canvas.convertToBlob() 等）
 */
export type ImageSource = string | Uint8Array | Blob;

/**
 * 图片上传器：调用 im/v1/images 接口，返回 image_key。
 *
 * 同构设计：
 *   - Blob / Uint8Array 分支在 Node 18+ / 浏览器 / Service Worker 都能跑
 *   - string 路径分支仅在 Node 可用，通过 new Function 隐藏 node:fs/promises 的
 *     静态引用，让浏览器/扩展打包器（Vite/Webpack/esbuild）不会因为找不到模块而报错
 */
export class ImageUploader {
  private readonly tokenManager: TokenManager;
  private readonly fetchImpl?: typeof fetch;
  private readonly timeout?: number;
  private readonly baseUrl: string;

  constructor(options: ImageUploaderOptions) {
    this.tokenManager = options.tokenManager;
    this.fetchImpl = options.fetch;
    this.timeout = options.timeout;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * 上传图片，返回 image_key。
   */
  async uploadImage(file: ImageSource): Promise<string> {
    const { bytes, filename } = await this.resolveSource(file);
    const token = await this.tokenManager.getToken();

    const form = new FormData();
    form.append('image_type', 'message');
    // Blob 构造器的 BlobPart 要求 Uint8Array 必须以 ArrayBuffer（而非 SharedArrayBuffer）为底。
    // 通过 bytes.slice() 得到一份拥有独立 ArrayBuffer 的新 Uint8Array。
    const blob = new Blob([bytes.slice()], {
      type: 'application/octet-stream',
    });
    form.append('image', blob, filename);

    const url = `${this.baseUrl}${UPLOAD_PATH}`;
    const response = await postForm<FeishuApiResponse<UploadImageResult>>(
      url,
      form,
      {
        fetch: this.fetchImpl,
        timeout: this.timeout,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.code !== 0 || !response.data?.image_key) {
      throw new FeishuApiError(
        `Failed to upload image: ${response.msg ?? 'unknown error'}`,
        response.code ?? -1,
        response,
      );
    }

    return response.data.image_key;
  }

  private async resolveSource(
    file: ImageSource,
  ): Promise<{ bytes: Uint8Array; filename: string }> {
    // Blob / File：浏览器和 SW 的主要路径
    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      const buf = await file.arrayBuffer();
      // File extends Blob，有 .name；普通 Blob 没有 .name，用鸭子类型读
      const filename = (file as { name?: string }).name ?? 'image';
      return { bytes: new Uint8Array(buf), filename };
    }
    // Uint8Array / Buffer：Node 和浏览器都能用
    if (file instanceof Uint8Array) {
      return { bytes: file, filename: 'image' };
    }
    // string：文件路径，仅 Node
    if (typeof file === 'string') {
      if (typeof process === 'undefined' || !process.versions?.node) {
        throw new FeishuConfigError(
          'String file path is only supported in Node.js. ' +
            'In browsers or Service Workers, pass a Blob, File, or Uint8Array instead.',
        );
      }
      return loadFromFilePath(file);
    }
    throw new FeishuApiError(
      'Unsupported image source type. Expected string path, Uint8Array, or Blob.',
      -1,
      null,
    );
  }
}

/**
 * 从文件路径读取字节（仅 Node）。
 *
 * 关键技巧：用 `new Function` 包裹 dynamic import 字符串，让 Vite / Webpack / esbuild
 * 等打包器无法静态分析这两个 node:* import，从而不会在浏览器/扩展产物里报「找不到模块」。
 *
 * 这条代码路径在浏览器/SW 中永远不可达（resolveSource 已经在 typeof process 处抛错了），
 * 所以静态引用即使被打入 bundle 也不会被执行。
 */
async function loadFromFilePath(
  filePath: string,
): Promise<{ bytes: Uint8Array; filename: string }> {
  type FsModule = typeof import('node:fs/promises');
  type PathModule = typeof import('node:path');
  const importFs = new Function(
    'return import("node:fs/promises")',
  ) as () => Promise<FsModule>;
  const importPath = new Function(
    'return import("node:path")',
  ) as () => Promise<PathModule>;

  const [fs, pathMod] = await Promise.all([importFs(), importPath()]);
  const buf = await fs.readFile(filePath);
  return {
    bytes: new Uint8Array(buf),
    filename: pathMod.basename(filePath),
  };
}
