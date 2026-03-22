import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: ['src/index.ts', 'src/cli.ts'],
      formats: ['es', 'cjs'],
      fileName: '[name]',
      name: 'agentEyesMcp',
    },
    minify: false,
    emptyOutDir: false,
    rollupOptions: {
      external: [
        'fs',
        'path',
        'process',
        /^@modelcontextprotocol\/sdk/,
        'zod',
        'zod/v4',
      ],
    },
    target: ['node18'],
  },
});
