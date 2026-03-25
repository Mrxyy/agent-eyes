import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/index.ts'],
      formats: ['cjs', 'es'],
      fileName: '[name]',
      name: 'MakoCodeInspectorPlugin',
    },
    minify: true,
    emptyOutDir: false,
    rollupOptions: {
      external: ['@code-inspector/core', 'path', 'fs'],
      output: [
        {
          format: 'cjs',
          entryFileNames: 'index.js',
          paths: {
            '@code-inspector/core': '../../core/dist/index.js',
          },
        },
        {
          format: 'es',
          entryFileNames: 'index.mjs',
          paths: {
            '@code-inspector/core': '../../core/dist/index.mjs',
          },
        },
      ],
    },
    target: ['node8', 'es2015'],
  },
});
