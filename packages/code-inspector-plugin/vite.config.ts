import { defineConfig } from 'vite';
import { builtinModules } from 'module';

const workspacePackages = [
  '@code-inspector/core',
  '@code-inspector/vite',
  '@code-inspector/webpack',
  '@code-inspector/esbuild',
  '@code-inspector/turbopack',
  '@code-inspector/mako',
];

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
]);

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/index.ts'],
      formats: ['cjs', 'es'],
      fileName: '[name]',
      name: 'CodeInspectorPlugin',
    },
    minify: true,
    emptyOutDir: false,
    rollupOptions: {
      external(id) {
        return (
          nodeBuiltins.has(id) || workspacePackages.includes(id) || id === 'chalk'
        );
      },
      output: [
        {
          format: 'cjs',
          entryFileNames: 'index.js',
          paths: {
            '@code-inspector/core': './core/dist/index.js',
            '@code-inspector/vite': './vite/dist/index.js',
            '@code-inspector/webpack': './webpack/dist/index.umd.js',
            '@code-inspector/esbuild': './esbuild/dist/index.js',
            '@code-inspector/turbopack': './turbopack/dist/index.js',
            '@code-inspector/mako': './mako/dist/index.js',
          },
        },
        {
          format: 'es',
          entryFileNames: 'index.mjs',
          paths: {
            '@code-inspector/core': './core/dist/index.mjs',
            '@code-inspector/vite': './vite/dist/index.mjs',
            '@code-inspector/webpack': './webpack/dist/index.mjs',
            '@code-inspector/esbuild': './esbuild/dist/index.mjs',
            '@code-inspector/turbopack': './turbopack/dist/index.mjs',
            '@code-inspector/mako': './mako/dist/index.mjs',
          },
        },
      ],
    },
    target: ['node18', 'es2020'],
  },
});
