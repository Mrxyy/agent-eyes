import { defineConfig } from 'vite';

const rewriteWebpackResolvePlugin = () => ({
  name: 'rewrite-webpack-resolve',
  renderChunk(code, chunk) {
    const webpackEntry = chunk.fileName.endsWith('.mjs')
      ? '../../webpack/dist/index.mjs'
      : '../../webpack/dist/index.umd.js';

    return {
      code: code
        .replace(
          /require\.resolve\((['"])@code-inspector\/webpack\1\)/g,
          `require.resolve("${webpackEntry}")`
        )
        .replace(
          /import\.meta\.resolve\(\s*(['"])@code-inspector\/webpack\1\s*\)/g,
          `import.meta.resolve("${webpackEntry}")`
        ),
      map: null,
    };
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/index.ts'],
      formats: ['cjs', 'es'],
      fileName: '[name]',
      name: 'TurbopackCodeInspectorPlugin',
    },
    minify: true,
    emptyOutDir: false,
    rollupOptions: {
      external: [
        '@code-inspector/core',
        '@code-inspector/webpack',
        'path',
        'fs',
        'url',
      ],
      output: [
        {
          format: 'cjs',
          entryFileNames: 'index.js',
          paths: {
            '@code-inspector/core': '../../core/dist/index.js',
            '@code-inspector/webpack': '../../webpack/dist/index.umd.js',
          },
        },
        {
          format: 'es',
          entryFileNames: 'index.mjs',
          paths: {
            '@code-inspector/core': '../../core/dist/index.mjs',
            '@code-inspector/webpack': '../../webpack/dist/index.mjs',
          },
        },
      ],
      plugins: [rewriteWebpackResolvePlugin()],
    },
    target: ['node8', 'es2015'],
  },
});
