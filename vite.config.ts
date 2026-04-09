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
  ]
});
