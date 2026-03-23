import { defineConfig } from 'vite';
import { builtinModules } from 'module';

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
      // Bundle workspace packages into a single output as much as possible.
      // Keep Node.js builtins external for runtime compatibility.
      external(id) {
        return nodeBuiltins.has(id);
      },
    },
    target: ['node18', 'es2020'],
  },
});
