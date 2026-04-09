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
      external: [
        'node:crypto',
        'node:fs/promises',
        'node:path',
        'node:buffer',
      ],
    },
    sourcemap: true,
    minify: false,
    target: 'node18',
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
