import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { FeishuApiError } from './errors.js';
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

/** 支持的图片源：文件路径字符串 / Buffer / Uint8Array */
export type ImageSource = string | Buffer | Uint8Array;

/**
 * 图片上传器：调用 im/v1/images 接口，返回 image_key。
 * - string: 作为文件路径用 fs/promises.readFile 读成 Buffer
 * - Buffer/Uint8Array: 直接作为 Blob 数据
 * 用 globalThis 的 FormData + Blob（Node 18+ 内置），不依赖 form-data 包。
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
    if (typeof file === 'string') {
      const buf = await readFile(file);
      return { bytes: new Uint8Array(buf), filename: basename(file) };
    }
    if (file instanceof Uint8Array) {
      // Buffer extends Uint8Array
      return { bytes: file, filename: 'image' };
    }
    throw new FeishuApiError(
      'Unsupported image source type. Expected string path, Buffer, or Uint8Array.',
      -1,
      null,
    );
  }
}
