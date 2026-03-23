# Bundler Configuration Examples

Use this reference only when plugin installation is done and the user needs bundler/framework config examples.

## Selection Rule
- Prefer loading only the section that matches the current project.
- Detect from config files:
- `vite.config.*` -> Vite
- `webpack.config.*` -> Webpack
- `rspack.config.*` / `rsbuild.config.*` -> Rspack/Rsbuild
- `next.config.*` -> Next.js
- `nuxt.config.*` -> Nuxt

## Vite (`vite.config.ts` / `vite.config.js`)
```ts
import { defineConfig } from 'vite';
import { codeInspectorPlugin } from '@agent-eyes/agent-eyes';

export default defineConfig({
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
      showSwitch: true,
      agent: {
        acp: { command: 'codex-acp' },
      },
    }),
  ],
});
```

## Webpack (`webpack.config.js`)
```js
const { codeInspectorPlugin } = require('@agent-eyes/agent-eyes');

module.exports = {
  plugins: [
    codeInspectorPlugin({
      bundler: 'webpack',
      showSwitch: true,
      agent: {
        acp: { command: 'codex-acp' },
      },
    }),
  ],
};
```

## Rspack / Rsbuild (`rspack.config.js`)
```js
const { codeInspectorPlugin } = require('@agent-eyes/agent-eyes');

module.exports = {
  plugins: [
    codeInspectorPlugin({
      bundler: 'rspack',
      showSwitch: true,
      agent: {
        acp: { command: 'codex-acp' },
      },
    }),
  ],
};
```

## Next.js <= 14 (`next.config.js`, webpack path)
```js
const { codeInspectorPlugin } = require('@agent-eyes/agent-eyes');

module.exports = {
  webpack: (config) => {
    config.plugins.push(
      codeInspectorPlugin({
        bundler: 'webpack',
        showSwitch: true,
        agent: {
          acp: { command: 'codex-acp' },
        },
      })
    );
    return config;
  },
};
```

## Next.js >= 15.3 (`next.config.ts`, turbopack rules)
```ts
import type { NextConfig } from 'next';
import { codeInspectorPlugin } from '@agent-eyes/agent-eyes';

const nextConfig: NextConfig = {
  turbopack: {
    rules: codeInspectorPlugin({
      bundler: 'turbopack',
      showSwitch: true,
      agent: {
        acp: { command: 'codex-acp' },
      },
    }),
  },
};

export default nextConfig;
```

## Nuxt (`nuxt.config.ts`)
```ts
import { codeInspectorPlugin } from '@agent-eyes/agent-eyes';

export default defineNuxtConfig({
  vite: {
    plugins: [
      codeInspectorPlugin({
        bundler: 'vite',
        showSwitch: true,
        agent: {
          acp: { command: 'codex-acp' },
        },
      }),
    ],
  },
});
```
