import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'FeishuBot',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // 兜底外置所有 node:* —— 实际上当前源码已经没有静态 node 引用，
      // 唯一可能出现的 node:fs/promises / node:path 是经由 new Function 隐藏的
      // 动态 import，rollup 不会去 resolve。这条 external 留作保险。
      external: [/^node:/],
    },
    sourcemap: true,
    minify: false,
    // es2022 同时被 Node 18+、现代浏览器、Service Worker、Cloudflare Workers、Bun 支持
    target: 'es2022',
  },
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['tests/**', 'examples/**'],
      rollupTypes: true,
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
