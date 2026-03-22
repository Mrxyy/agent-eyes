<div align="center">
<p style="font-size: 20px;">
  <code><del>“帮我把首页左上角那个蓝色按钮改成品牌主色，hover 再浅一点，文字别动。”</del></code> 👉 改成品牌主色、hover 再浅一点
</p>
<h2>Agent Eyes</h2>
<p><strong>给 AI Agent 一双眼睛，让它看见你指的是哪里</strong></p>

</div>

<hr />

## 为什么需要 Agent Eyes？

Agent Eyes 把冗长、容易歧义的页面描述，变成 Agent 可以直接执行的精确上下文。

当你在页面上选中一个元素时，Agent Eyes 会自动采集源码路径、行列号、组件层级、DOM 结构、className 和文本内容，把“你指的是这里”变成 Agent 可直接消费的结构化上下文。

![code-inspector](https://cdn.jsdelivr.net/gh/zh-lx/static-img/code-inspector/demo.gif)

## 核心特性

### 指哪打哪：精准的上下文感知

选中页面元素后，Agent Eyes 自动构建完整的上下文信息：

- **源码定位**：精确到文件路径、行号、列号
- **组件层级**：基于 React Fiber 树解析从根组件到目标元素的完整路径（如 `App > Layout > Sidebar > Button`）
- **DOM 信息**：标签名、className、文本内容
- **一键传递**：上下文自动注入 AI 对话，无需手动复制粘贴任何信息

### 内置 AI 对话面板

直接在浏览器中与 AI 代理对话，选中元素后输入需求即可：

- 支持 ACP 协议（Claude Code、Codex 等主流 AI 代理）
- SSE 实时流式输出，实时看到 AI 的思考与操作
- 支持粘贴图片和上传文件，为 AI 提供更多参考
- 操作时间线展示：清晰追踪 AI 的每一步读取、搜索、编辑动作

### 多 Agent 接入：Skill 与 MCP

Agent Eyes 不只提供内置对话面板，也提供适配外部 Agent 的两种能力：

- **Codex Skill**：把“先检查插件、再获取当前选中上下文、再执行修改”沉淀成可复用工作流
- **MCP Server**：把当前选中上下文和 `AGENTS.md` 规则能力暴露成标准 MCP 工具
- **统一目标**：不管你用内置 Agent、Skill，还是 MCP，核心都是让 Agent 在改代码前先拿到准确的页面上下文

### React 项目增强：Fiber 面包屑导航

这部分是 **React 项目的增强能力**。在 React 页面中，Agent Eyes 会深入 React Fiber，还原更接近真实代码结构的组件层级关系：

- 自动识别 React 组件名（包括 `displayName`、`forwardRef`、`memo` 等）
- 从目标元素向上追溯完整的组件链路

对于非 React 项目，Agent Eyes 仍然可用，但不会依赖 Fiber，而是回退到基于 DOM 和编译注入信息的定位与层级解析。

### 一键跳转 IDE（经典能力）

点击页面元素，自动打开编辑器并定位到对应源码——这是 code-inspector 的经典能力，依然完整保留。

## 支持范围

**构建工具**：webpack / vite / rspack / rsbuild / esbuild / turbopack / farm / mako

**Web 框架**：Vue 2 / Vue 3 / Nuxt / React / Next.js / UmiJS / Preact / Solid / Qwik / Svelte / Astro

**编辑器**：[支持列表](https://github.com/zh-lx/launch-ide?tab=readme-ov-file#-supported-editors) | [更多](https://inspector.fe-dev.cn/en/guide/ide.html)

## 安装

推荐安装方式：**只下载 `agent-eyes` skill**。  
skill 会先检查项目里是否已安装 `agent-eyes`，如果没有，会继续引导或帮助完成插件安装，然后再读取当前选中的页面上下文。

把内置 skill 链接或复制到你的 Codex skills 目录：

```bash
ln -s /absolute/path/to/packages/code-inspector-plugin/skills/agent-eyes ~/.codex/skills/agent-eyes
```

<details>
  <summary><b>手动安装</b></summary>

如果你不使用 skill，也可以手动安装并配置 `agent-eyes`。

详细配置请参考：[完整配置文档](https://inspector.fe-dev.cn/en/guide/start.html#configuration)

```bash
npm i agent-eyes -D
# or
yarn add agent-eyes -D
# or
pnpm add agent-eyes -D
```

  <details>
    <summary><b>构建工具配置</b></summary>

以下示例统一使用插件配置项来开启 Agent 能力。最小可用配置通常包括：

- `bundler`：声明当前构建工具
- `showSwitch`：在页面上显示开关入口
- `agent`：配置本地 ACP Agent

一个更完整的配置示例：

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
import { codeInspectorPlugin } from 'agent-eyes';

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
const { codeInspectorPlugin } = require('agent-eyes');

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
const { codeInspectorPlugin } = require('agent-eyes');

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

- Next.js (<= 14.x)：

  ```js
  const { codeInspectorPlugin } = require('agent-eyes');

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

- Next.js (>= 15.3.x)：

  ```js
  import type { NextConfig } from 'next';
  import { codeInspectorPlugin } from 'agent-eyes';

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
import { codeInspectorPlugin } from 'agent-eyes';

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

更多构建工具配置请参考 [完整配置文档](https://inspector.fe-dev.cn/en/guide/start.html#configuration)。这些场景同样建议直接在 `codeInspectorPlugin({...})` 中传入 `agent` 配置，而不是通过环境变量单独配置。

</details>

  </details>

</details>

### 使用方式

1. **启动项目**：以开发模式启动你的前端项目，确保 `agent-eyes` 已生效。
2. **选中目标元素**：按下组合键（Mac: `Option + Shift`，Windows: `Alt + Shift`），移动鼠标高亮目标元素并点击选中。
3. **直接定位源码**：如果你只是想快速找到代码，点击后会直接跳转到 IDE 对应位置。
4. **在内置面板中发起修改**：如果你希望 Agent 直接改代码，保持目标元素处于选中状态，在内置对话面板中输入需求，Agent 会自动携带当前上下文执行。
5. **在外部 Agent 中使用上下文**：如果你安装了 `agent-eyes` skill，Agent 会优先检查插件并读取当前选中上下文，再据此执行修改。

推荐工作流是：先选中，再修改。这样 Agent 拿到的是结构化页面上下文，而不是一段容易产生歧义的自然语言描述。

### AI 代理配置

AI 代理仅通过插件配置项启用和配置，不再推荐通过环境变量单独配置。

请在 `codeInspectorPlugin({...})` 中传入 `agent` 配置，例如指定 ACP 命令、模型、模式以及附加 MCP servers。

### Codex Skill

插件内置了一个可复用 skill，帮助 Agent 先检查项目是否安装 `agent-eyes`，并在执行代码修改前请求“当前选中元素上下文”接口。

- Skill 路径：`skills/agent-eyes`
- 核心能力：检查并协助安装插件、请求本地服务上下文接口、归一化字段、拼接为可直接用于下一次 Agent 请求的上下文 Prompt

如果你使用 Codex，优先建议安装这个 skill，而不是手动拼接上下文说明。

<details>
  <summary><b>MCP Server</b></summary>

如果你的 Agent 不使用 skill，或者你更希望通过标准工具协议接入，可以使用独立 MCP：

```bash
pnpm add -D agent-eyes-mcp
```

本地开发阶段，建议直接使用构建产物配置 MCP：

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

它提供两个工具：

- `get_selected_context`：读取当前选中的 Agent Eyes 上下文
- `ensure_agents_rule`：为项目创建或更新 `AGENTS.md` 规则

示例 MCP 配置：

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

注意：

- 本地 workspace 开发阶段，不要直接使用 `npx agent-eyes-mcp`，除非该包已经发布到 npm
- 未发布时请优先使用 `node /absolute/path/to/packages/mcp/dist/cli.js`

</details>

## Acknowledgements

Agent Eyes 基于原项目 [code-inspector](https://github.com/zh-lx/code-inspector) 演进而来，感谢原作者和社区贡献者打下的基础。

## License

[MIT](https://opensource.org/licenses/MIT)
