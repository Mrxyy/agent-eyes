<div align="center">
<p style="font-size: 16px;">
  <code><del>"Please change the blue button at top-left, submit button on the right panel, and collapse button in the sidebar to our brand color. Make hover a bit lighter, keep text unchanged."</del></code> 👉 change to brand color, make hover slightly lighter
</p>
<h2>Agent Eyes 👀</h2>
<p><strong>Give your AI Agent a pair of eyes so it can see exactly what you mean.</strong></p>

</div>

<hr />

**Language / 语言**: [简体中文](./README.zh-CN.md) | English

```bash
npx skills add https://github.com/Mrxyy/agents-eyes
```

## Project Links

- **GitHub**: https://github.com/Mrxyy/agents-eyes
- **NPM package (plugin)**: `@agent-eyes/agent-eyes`
- **NPM package (MCP)**: `@agent-eyes/agent-eyes-mcp`

## Why Agent Eyes?

Agent Eyes turns long, ambiguous UI descriptions into precise, executable context for agents.

When you select an element on the page, Agent Eyes automatically captures source file path, line/column, component hierarchy, DOM structure, class names, and text content. It converts “this one right here” into structured context your agent can directly consume.

![Agent Eyes](./demo.gif)

## Key Features

### Pixel-accurate context

After selecting an element, Agent Eyes builds complete context automatically:

- **Source location**: exact file path, line, and column
- **Multi-selection context**: select multiple targets and generate combined context
- **Component hierarchy**: resolve the full path from React Fiber tree (e.g. `App > Layout > Sidebar > Button`)
- **DOM metadata**: tag name, className, text content
- **One-click handoff**: auto-inject context into agent chat without copy/paste

### Built-in AI chat panel

Talk to your coding agent directly in browser after selecting target elements:

- Supports ACP protocol (Claude Code, Codex, and other mainstream agents)
- SSE streaming output for real-time thinking/actions
- Supports image paste and file upload for richer context
- Operation timeline to track reads/searches/edits step by step

### Multi-agent integration: Skill + MCP

![Agent Eyes Skill](./skills-demo.gif)

Agent Eyes provides both in-browser chat and external integrations:

- **Codex Skill**: reusable workflow to check plugin, fetch selected context, then edit
- **MCP Server**: expose selected context and `AGENTS.md` rule tooling via standard MCP
- **Unified goal**: whether built-in panel, skill, or MCP, agents should always get accurate page context before editing

### React enhancement: Fiber breadcrumb

This is a **React-specific enhancement**. In React apps, Agent Eyes inspects Fiber internals to recover component hierarchy closer to real source structure:

- Auto-detects component names (`displayName`, `forwardRef`, `memo`, etc.)
- Traces full component chain upward from selected element

In non-React apps, Agent Eyes still works, but falls back to DOM + compile-time injected metadata rather than Fiber.

### Jump to IDE (classic capability)

Click an element to open your editor at the exact source location. This classic code-inspector capability remains fully supported.

## Support Matrix

**Bundlers**: webpack / vite / rspack / rsbuild / esbuild / turbopack / farm / mako

**Web frameworks**: Vue 2 / Vue 3 / Nuxt / React / Next.js / UmiJS / Preact / Solid / Qwik / Svelte / Astro

**Editors**: [Supported list](https://github.com/zh-lx/launch-ide?tab=readme-ov-file#-supported-editors) | [More docs](https://inspector.fe-dev.cn/en/guide/ide.html)

## Installation

Recommended: **install the `agent-eyes` skill first**.
The skill checks whether `@agent-eyes/agent-eyes` is installed in your project. If missing, it guides (or helps) installation, then reads the currently selected page context.

<details>
  <summary><b>Manual Installation</b></summary>

If you don’t use the skill, you can also install and configure `@agent-eyes/agent-eyes` manually.

See full config docs: [Full configuration](https://inspector.fe-dev.cn/en/guide/start.html#configuration)

```bash
npm i @agent-eyes/agent-eyes -D
# or
yarn add @agent-eyes/agent-eyes -D
# or
pnpm add @agent-eyes/agent-eyes -D
```

  <details>
    <summary><b>Bundler Configuration</b></summary>

The examples below consistently use plugin options to enable Agent features. Minimal config usually includes:

- `bundler`: current bundler name
- `showSwitch`: show the in-page switch
- `agent`: configure local ACP agent

A more complete example:

```js
codeInspectorPlugin({
  bundler: 'vite',
  showSwitch: true,
  agent: {
    acp: {
      command: 'codex-acp',
      args: [],
      persistSession: true,
    },
  },
});
```

<details>
  <summary><b>Vite</b></summary>

```js
// vite.config.js
import { defineConfig } from 'vite';
import { codeInspectorPlugin } from '@agent-eyes/agent-eyes';

export default defineConfig({
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
      showSwitch: true,
      agent: {
        acp: {
          command: 'codex-acp',
        },
      },
    }),
  ],
});
```

</details>

<details>
  <summary><b>Webpack</b></summary>

```js
// webpack.config.js
const { codeInspectorPlugin } = require('@agent-eyes/agent-eyes');

module.exports = () => ({
  plugins: [
    codeInspectorPlugin({
      bundler: 'webpack',
      showSwitch: true,
      agent: {
        acp: {
          command: 'codex-acp',
        },
      },
    }),
  ],
});
```

</details>

<details>
  <summary><b>Rspack / Rsbuild</b></summary>

```js
// rspack.config.js
const { codeInspectorPlugin } = require('@agent-eyes/agent-eyes');

module.exports = {
  plugins: [
    codeInspectorPlugin({
      bundler: 'rspack',
      showSwitch: true,
      agent: {
        acp: {
          command: 'codex-acp',
        },
      },
    }),
  ],
};
```

</details>

<details>
  <summary><b>Next.js</b></summary>

- Next.js (<= 14.x):

  ```js
  const { codeInspectorPlugin } = require('@agent-eyes/agent-eyes');

  const nextConfig = {
    webpack: (config, { dev, isServer }) => {
      config.plugins.push(
        codeInspectorPlugin({
          bundler: 'webpack',
          showSwitch: true,
          agent: {
            acp: {
              command: 'codex-acp',
            },
          },
        })
      );
      return config;
    },
  };

  module.exports = nextConfig;
  ```

- Next.js (>= 15.3.x):

  ```js
  import type { NextConfig } from 'next';
  import { codeInspectorPlugin } from '@agent-eyes/agent-eyes';

  const nextConfig: NextConfig = {
    turbopack: {
      rules: codeInspectorPlugin({
        bundler: 'turbopack',
        showSwitch: true,
        agent: {
          acp: {
            command: 'codex-acp',
          },
        },
      }),
    },
  };

  export default nextConfig;
  ```

</details>

<details>
  <summary><b>Nuxt</b></summary>

```js
// nuxt.config.js
import { codeInspectorPlugin } from '@agent-eyes/agent-eyes';

export default defineNuxtConfig({
  vite: {
    plugins: [
      codeInspectorPlugin({
        bundler: 'vite',
        showSwitch: true,
        agent: {
          acp: {
            command: 'codex-acp',
          },
        },
      }),
    ],
  },
});
```

</details>

<details>
  <summary><b>Esbuild / Farm / UmiJS / Astro</b></summary>

For more bundler examples, see [full configuration docs](https://inspector.fe-dev.cn/en/guide/start.html#configuration).
In these setups, it is also recommended to pass `agent` directly to `codeInspectorPlugin({...})` instead of configuring it separately via env vars.

</details>

  </details>

</details>

### Usage

1. **Start your app** in development mode and make sure `agent-eyes` is enabled.
2. **Select target element** with hotkey (Mac: `Option + Shift`, Windows: `Alt + Shift`), move mouse, and click.
3. **Jump to source directly**: if you only want location, click and it opens IDE immediately.
4. **Edit via built-in panel**: keep selection active, type your request in panel, and agent runs with selected context.
5. **Use context in external agent**: if you installed `agent-eyes` skill, the agent checks plugin and fetches selected context before editing.

Recommended workflow: select first, then ask for edits. This gives your agent structured UI context instead of ambiguous natural language.

### AI Agent Configuration

Enable/configure AI agent only through plugin options. Using standalone env vars is no longer recommended.

Pass `agent` in `codeInspectorPlugin({...})`, for example ACP command, model, mode, and additional MCP servers.

### Codex Skill

The plugin includes a reusable skill that helps the agent verify `@agent-eyes/agent-eyes` installation and request “currently selected element context” before code changes.

- Skill path: `skills/agent-eyes`
- Core capabilities: check/install plugin, call local context API, normalize fields, assemble a directly reusable prompt context

If you use Codex, installing this skill is preferred over manually composing context prompts.

<details>
  <summary><b>MCP Server</b></summary>

If your agent does not use skills, or you prefer standard tool protocol integration, use standalone MCP:

```bash
pnpm add -D @agent-eyes/agent-eyes-mcp
```

During local workspace development, use built artifact path directly:

```json
{
  "mcpServers": {
    "agent-eyes": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/cli.js"]
    }
  }
}
```

It provides two tools:

- `get_selected_context`: read current Agent Eyes selected context
- `ensure_agents_rule`: create or update `AGENTS.md` rule file for the project

Example MCP config:

```json
{
  "mcpServers": {
    "agent-eyes": {
      "command": "npx",
      "args": ["agent-eyes-mcp"]
    }
  }
}
```

Notes:

- During local workspace development, do not use `npx agent-eyes-mcp` unless package is already published to npm
- Before publish, prefer `node /absolute/path/to/packages/mcp/dist/cli.js`

</details>

## Acknowledgements

Agent Eyes evolves from [code-inspector](https://github.com/zh-lx/code-inspector). Thanks to the original author and contributors.

## License

[MIT](https://opensource.org/licenses/MIT)
