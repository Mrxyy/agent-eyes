// 启动本地接口，访问时唤起vscode
import http from 'http';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import net from 'net';
import portFinder from 'portfinder';
import { launchIDE } from 'launch-ide';
import { DefaultPort } from '../shared/constant';
import { getIP, getProjectRecord, setProjectRecord, findPort } from '../shared';
import type { PathType, CodeOptions, RecordInfo } from '../shared';
import {
  ProjectRootPath,
  resolveProjectFile,
  isFileUnderProjectRoot,
} from './project-root';

export { ProjectRootPath } from './project-root';
export function getRelativePath(filePath: string): string {
  /* v8 ignore next 5 -- branch depends on git repo presence at module load time */
  if (ProjectRootPath) {
    return filePath.replace(`${ProjectRootPath}/`, '');
  }
  return filePath;
}

// 根据用户配置返回绝对路径或者相对路径
export function getRelativeOrAbsolutePath(
  filePath: string,
  pathType?: PathType
) {
  return pathType === 'relative' ? getRelativePath(filePath) : filePath;
}

const agentEyesRuleSection = `## Agent Eyes Workflow

For any task that may modify UI, DOM structure, styles, component behavior, page content, or selected elements:

1. First verify that \`code-inspector-plugin\` is installed in this project.
2. Before making any code change, request \`GET http://127.0.0.1:5678/context/selected\`.
3. If the response contains \`data: null\`, do not guess the target code.
4. Ask the user to open Agent Eyes, select the target element, and keep the selection panel open.
5. Only after a non-null context is returned may you use that context to locate and modify code precisely.

Use the selected context fields \`filePath\`, \`line\`, \`column\`, \`elementName\`, \`dom\`, and \`domPath\` to anchor the change request.

If \`code-inspector-plugin\` is missing:

- \`pnpm add -D code-inspector-plugin\`
- \`yarn add -D code-inspector-plugin\`
- \`npm i -D code-inspector-plugin\`

Then add the minimal bundler configuration required by the current project before continuing.
`;

function detectPackageManager(rootDir: string) {
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) return 'npm';
  return 'npm';
}

function readProjectPackageMeta(rootDir: string) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {
      packageJsonPath,
      packageExists: false,
      pluginInstalled: false,
    };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {}),
    };
    return {
      packageJsonPath,
      packageExists: true,
      pluginInstalled: !!deps['code-inspector-plugin'],
    };
  } catch {
    return {
      packageJsonPath,
      packageExists: true,
      pluginInstalled: false,
    };
  }
}

function getAgentsFileStatus(rootDir: string) {
  const agentsPath = path.join(rootDir, 'AGENTS.md');
  const exists = fs.existsSync(agentsPath);
  const content = exists ? fs.readFileSync(agentsPath, 'utf-8') : '';
  const hasRule = content.includes('## Agent Eyes Workflow');
  return {
    agentsPath,
    exists,
    hasRule,
  };
}

export function createServer(
  callback: (port: number) => any,
  options?: CodeOptions,
  record?: RecordInfo
) {
  let latestSelectedContext: Record<string, any> | null = null;

  const server = http.createServer((req: any, res: any) => {
    void (async () => {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Private-Network': 'true',
      };

      const url = new URL(req.url || '/', 'http://127.0.0.1');

      const readJsonBody = async (maxPayloadBytes: number) => {
        let raw = '';
        await new Promise<void>((resolve, reject) => {
          req.on('data', (chunk: Buffer) => {
            raw += chunk.toString('utf-8');
            if (raw.length > maxPayloadBytes) {
              reject(new Error('payload too large'));
              req.destroy();
            }
          });
          req.on('end', () => resolve());
          req.on('error', reject);
        });

        if (!raw) return {};
        try {
          return JSON.parse(raw);
        } catch {
          throw new Error('invalid json');
        }
      };

      const projectRoot = path.resolve(record?.root || record?.envDir || process.cwd());

      if (url.pathname === '/context/selected') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders);
          res.end();
          return;
        }

        if (req.method === 'DELETE') {
          latestSelectedContext = null;
          res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(
            JSON.stringify({
              success: true,
              data: null,
            })
          );
          return;
        }

        if (req.method === 'POST') {
          const maxPayloadMb = Number(
            process.env.CODE_INSPECTOR_ACP_MAX_PAYLOAD_MB || 2
          );
          const maxPayloadBytes = Number.isFinite(maxPayloadMb)
            ? Math.max(1, maxPayloadMb) * 1024 * 1024
            : 2 * 1024 * 1024;
          let body: any = {};
          try {
            body = await readJsonBody(maxPayloadBytes);
          } catch (e: any) {
            res.writeHead(400, {
              ...corsHeaders,
              'Content-Type': 'application/json; charset=utf-8',
            });
            res.end(
              JSON.stringify({
                success: false,
                message: String(e?.message || e),
              })
            );
            return;
          }

          const filePath = String(
            body.filePath || body.file || body.path || body.element?.path || ''
          );
          const line = Number(body.line || body.element?.line || 0);
          const column = Number(body.column || body.element?.column || 0);
          const elementName = String(
            body.elementName || body.element?.name || body.element?.elementName || ''
          );
          const dom = body.dom || {};
          const domPath = Array.isArray(body.domPath)
            ? body.domPath.map((item: any) => item?.label || item?.name || item).filter(Boolean)
            : [];
          const contextPrompt = String(body.contextPrompt || body.context || '');
          if (!filePath) {
            latestSelectedContext = null;
            res.writeHead(200, {
              ...corsHeaders,
              'Content-Type': 'application/json; charset=utf-8',
            });
            res.end(
              JSON.stringify({
                success: true,
                data: null,
              })
            );
            return;
          }
          latestSelectedContext = {
            filePath,
            line,
            column,
            elementName,
            dom: {
              tagName: String(dom.tagName || ''),
              firstClass: String(dom.firstClass || ''),
              className: String(dom.className || ''),
              textContent: String(dom.textContent || ''),
            },
            domPath,
            contextPrompt,
            updatedAt: Date.now(),
          };

          res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(
            JSON.stringify({
              success: true,
              data: latestSelectedContext,
            })
          );
          return;
        }

        if (req.method === 'GET') {
          res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(
            JSON.stringify({
              success: true,
              data: latestSelectedContext,
              message: latestSelectedContext
                ? ''
                : 'no selected context yet, select an element first',
            })
          );
          return;
        }

        res.writeHead(405, corsHeaders);
        res.end('method not allowed');
        return;
      }

      if (url.pathname === '/agents-md/status') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders);
          res.end();
          return;
        }
        if (req.method !== 'GET') {
          res.writeHead(405, corsHeaders);
          res.end('method not allowed');
          return;
        }
        const packageMeta = readProjectPackageMeta(projectRoot);
        const agentsMeta = getAgentsFileStatus(projectRoot);
        const packageManager = detectPackageManager(projectRoot);
        const installCommand =
          packageManager === 'pnpm'
            ? 'pnpm add -D code-inspector-plugin'
            : packageManager === 'yarn'
            ? 'yarn add -D code-inspector-plugin'
            : 'npm i -D code-inspector-plugin';
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(
          JSON.stringify({
            success: true,
            data: {
              rootDir: projectRoot,
              packageManager,
              installCommand,
              packageJsonPath: packageMeta.packageJsonPath,
              packageExists: packageMeta.packageExists,
              pluginInstalled: packageMeta.pluginInstalled,
              agentsPath: agentsMeta.agentsPath,
              agentsExists: agentsMeta.exists,
              agentsHasRule: agentsMeta.hasRule,
            },
          })
        );
        return;
      }

      if (url.pathname === '/agents-md/setup') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders);
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405, corsHeaders);
          res.end('method not allowed');
          return;
        }
        const agentsMeta = getAgentsFileStatus(projectRoot);
        let nextContent = '';
        if (!agentsMeta.exists) {
          nextContent = `# Project Agent Rules\n\n${agentEyesRuleSection}\n`;
        } else {
          const current = fs.readFileSync(agentsMeta.agentsPath, 'utf-8');
          nextContent = agentsMeta.hasRule
            ? current.replace(
                /## Agent Eyes Workflow[\s\S]*$/m,
                agentEyesRuleSection.trimEnd()
              )
            : `${current.trimEnd()}\n\n${agentEyesRuleSection}\n`;
        }
        fs.writeFileSync(agentsMeta.agentsPath, nextContent, 'utf-8');
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(
          JSON.stringify({
            success: true,
            data: {
              agentsPath: agentsMeta.agentsPath,
              created: !agentsMeta.exists,
              updated: agentsMeta.exists,
            },
          })
        );
        return;
      }

      // Local agent endpoint: POST /agent
      if (url.pathname === '/agent') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders);
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405, corsHeaders);
          res.end('method not allowed');
          return;
        }

        const defaultAcpCommand =
          process.env.CODE_INSPECTOR_ACP_COMMAND ;
        const acpConfig = options?.agent?.acp || {
          command: defaultAcpCommand,
          args: [] as string[],
          persistSession: true,
          authMethodId: process.env.CODE_INSPECTOR_ACP_AUTH_METHOD_ID,
          mcpServers: [],
        };
        if (!acpConfig?.command) {
          res.writeHead(400, corsHeaders);
          res.end(
            'ACP agent is not configured. Please set options.agent.acp.command (e.g. codex-acp / claude-code-acp) or set env CODE_INSPECTOR_ACP_COMMAND.'
          );
          return;
        }

        // Read JSON body
        const maxPayloadMb = Number(
          process.env.CODE_INSPECTOR_ACP_MAX_PAYLOAD_MB || 10
        );
        const maxPayloadBytes = Number.isFinite(maxPayloadMb)
          ? Math.max(1, maxPayloadMb) * 1024 * 1024
          : 10 * 1024 * 1024;
        let body: any = {};
        try {
          body = await readJsonBody(maxPayloadBytes);
        } catch (e: any) {
          res.writeHead(400, corsHeaders);
          res.end(String(e?.message || e));
          return;
        }

        const userRequirementRaw: string =
          body.requirement || body.prompt || body.message || '';
        const contextFromClient: string =
          body.contextPrompt || body.context || '';
        const modelId: string =
          body.model || process.env.CODE_INSPECTOR_ACP_MODEL || undefined;
        const modeId: string = body.mode || body.modeId || undefined;
        const filesFromClient = Array.isArray(body.files) ? body.files : [];
        const userRequirement = String(userRequirementRaw || '').trim();

        if (!userRequirement && filesFromClient.length === 0) {
          res.writeHead(400, corsHeaders);
          res.end('missing requirement/prompt');
          return;
        }

        // Optional file context
        let file = decodeURIComponent(
          body.file ||
            body.path ||
            body.element?.path ||
            body.element?.file ||
            ''
        );
        file = resolveProjectFile(file);

        const line = Number(body.line || body.element?.line || 0);
        const column = Number(body.column || body.element?.column || 0);
        const elementName = String(
          body.elementName || body.element?.name || body.element?.elementName || ''
        );
        const dom = body.dom || {};
        const domPath = Array.isArray(body.domPath) ? body.domPath : [];
        const domPathLabels = domPath
          .map((n: any) => n?.label || n?.name)
          .filter(Boolean);

        const targetDomLabel = [dom.tagName, dom.firstClass]
          .filter(Boolean)
          .join('.');

        let snippet = '';
        try {
          if (file && fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf-8');
            if (line > 0) {
              const lines = content.split(/\r?\n/);
              const start = Math.max(0, line - 1 - 40);
              const end = Math.min(lines.length, line - 1 + 60);
              snippet = lines
                .slice(start, end)
                .map((l, i) => `${start + i + 1}: ${l}`)
                .join('\n');
            } else {
              snippet = content.slice(0, 8000);
            }
          }
        } catch {
          // ignore
        }

        if (
          options?.pathType === 'relative' &&
          file &&
          ProjectRootPath &&
          !isFileUnderProjectRoot(file)
        ) {
          res.writeHead(403, corsHeaders);
          res.end('not allowed to access this file');
          return;
        }

        const generatedContext =
          contextFromClient ||
          `当前选中的元素对应的Dom元素（也就是用户需要修改的地方）为: ${targetDomLabel},className为:${String(
            dom.className || ''
          )},纯文字内容为:${String(dom.textContent || '')}。在代码中开始位置为的第${line}行的${column}列的ReactElement为<${elementName}...,该ReactElement对应的根节点dom元素为 ${domPathLabels[0] || ''
          }。 选中元素与根节点dom之间路径为:${JSON.stringify(domPathLabels)}。`;

        const system = `你是一个本地代码修改 Agent。\n- 目标：根据上下文与用户需求，直接修改项目源码以达成需求。\n- 工具：你可以通过 MCP 工具读取/搜索/写入文件并完成修改（如提供了 filesystem MCP）。\n- 约束：尽量最小改动；修改后保证 TypeScript 编译通过。\n- 输出：用简洁中文说明你改了哪些文件/点。\n`;

        const formatBytes = (bytes: number) => {
          if (!Number.isFinite(bytes) || bytes <= 0) return '';
          if (bytes < 1024) return `${bytes}B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
          return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
        };
        const maxAttachmentChars = 8000;
        const attachmentsContext = filesFromClient
          .map((file: any) => {
            if (!file) return '';
            const name = String(file.name || 'file');
            const type = String(file.type || '');
            const size = Number(file.size || 0);
            const sizeLabel = formatBytes(size);
            const header = `附件：${name}${
              type ? ` (${type}${sizeLabel ? `, ${sizeLabel}` : ''})` : ''
            }`;
            const content =
              typeof file.text === 'string'
                ? file.text
                : typeof file.dataUrl === 'string'
                ? file.dataUrl
                : '';
            if (!content) return header;
            const trimmed =
              content.length > maxAttachmentChars
                ? `${content.slice(0, maxAttachmentChars)}…(已截断)`
                : content;
            return `${header}\n内容：\n${trimmed}`;
          })
          .filter(Boolean)
          .join('\n\n');
        const requirementText = userRequirement || '请参考附件';
        const prompt = [
          generatedContext,
          file ? `\n待修改文件：${file}` : '',
          snippet ? `\n\n文件片段（含行号）：\n${snippet}` : '',
          attachmentsContext ? `\n\n用户附件：\n${attachmentsContext}` : '',
          `\n\n用户需求：\n${requirementText}\n`,
        ]
          .filter(Boolean)
          .join('\n');

        // Lazy import to avoid affecting users who don't use /agent
        let createACPProvider: any;
        let streamText: any;
        try {
          ({ createACPProvider } = await import('@mcpc-tech/acp-ai-provider'));
          ({ streamText } = await import('ai'));
        } catch (e: any) {
          res.writeHead(500, corsHeaders);
          res.end(
            `Failed to load ACP/AI SDK dependencies. Please install 'ai' and '@mcpc-tech/acp-ai-provider'.\n${String(
              e?.message || e
            )}`
          );
          return;
        }

        const cwd = path.resolve(record?.root || record?.envDir || process.cwd());
        const envToList = (env?: Record<string, string>) =>
          Object.entries(env || {}).map(([name, value]) => ({
            name,
            value: String(value),
          }));

        const normalizedMcpServers = (acpConfig.mcpServers || [])
          .map((s: any, i: number) => {
            if (!s) return null;
            if (s.type === 'http' || s.type === 'sse' || s.url) {
              const type = s.type === 'sse' ? 'sse' : 'http';
              return {
                type,
                name: s.name || `mcp-${i + 1}`,
                url: s.url,
                headers: (s.headers || []).map((h: any) => ({
                  name: String(h?.name || ''),
                  value: String(h?.value || ''),
                })),
              };
            }
            return {
              name: s.name || `mcp-${i + 1}`,
              command: s.command,
              args: Array.isArray(s.args) ? s.args.map(String) : [],
              env: envToList(s.env),
            };
          })
          .filter(Boolean);

        const mcpServers = [
          ...normalizedMcpServers,
          ...(process.env.CODE_INSPECTOR_ACP_MCP_FILESYSTEM === 'true'
            ? [
                {
                  name: 'filesystem',
                  command: 'npx',
                  args: ['-y', '@modelcontextprotocol/server-filesystem', cwd],
                  env: [],
                },
              ]
            : []),
        ];

        const provider = createACPProvider({
          command: acpConfig.command,
          args: acpConfig.args || [],
          authMethodId: acpConfig.authMethodId,
          persistSession: !!acpConfig.persistSession,
          env: process.env,
          session: {
            cwd,
            mcpServers,
          },
        });

        const acceptsSse = String(req.headers.accept || '').includes(
          'text/event-stream'
        );
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': acceptsSse
            ? 'text/event-stream; charset=utf-8'
            : 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Transfer-Encoding': 'chunked',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        });
        try {
          res.flushHeaders?.();
        } catch {
          // ignore
        }
        try {
          res.socket?.setNoDelay?.(true);
          res.socket?.setKeepAlive?.(true);
        } catch {
          // ignore
        }
        if (acceptsSse) {
          res.write(':ok\n\n');
        } else {
          res.write('');
        }

        try {
          // Compatibility patch:
          // Some ACP agents may send MCP CallToolResult objects as rawOutput on tool failures:
          // { content: [{ type: "text", text: "..." }], isError: true }
          // The ACP provider's error formatter expects an iterable of ACP ToolCallContent blocks,
          // so we coerce failed tool results into that shape to avoid "toolResult is not iterable".
          const coerceFailedToolResultToBlocks = (toolResult: any) => {
            if (Array.isArray(toolResult)) {
              return toolResult;
            }
            if (typeof toolResult === 'string') {
              return [
                {
                  type: 'content',
                  content: { type: 'text', text: toolResult },
                },
              ];
            }
            if (toolResult && typeof toolResult === 'object') {
              const content = (toolResult as any).content;
              if (Array.isArray(content)) {
                const blocks = content
                  .map((c: any) => {
                    if (!c) return null;
                    if (c.type === 'content') return c;
                    if (typeof c === 'string') {
                      return {
                        type: 'content',
                        content: { type: 'text', text: c },
                      };
                    }
                    if (c.type) {
                      return { type: 'content', content: c };
                    }
                    return null;
                  })
                  .filter(Boolean);
                if (blocks.length > 0) {
                  return blocks;
                }
              }
              const message =
                (toolResult as any).message ||
                (toolResult as any).error ||
                JSON.stringify(toolResult);
              if (typeof message === 'string' && message) {
                return [
                  {
                    type: 'content',
                    content: { type: 'text', text: message },
                  },
                ];
              }
            }
            return toolResult;
          };

          const model = provider.languageModel(modelId, modeId);
          try {
            const anyModel = model as any;
            if (typeof anyModel.parseToolResult === 'function') {
              const originalParseToolResult =
                anyModel.parseToolResult.bind(anyModel);
              anyModel.parseToolResult = (update: any) => {
                const parsed = originalParseToolResult(update);
                if (parsed?.isError) {
                  parsed.toolResult = coerceFailedToolResultToBlocks(
                    parsed.toolResult
                  );
                }
                return parsed;
              };
            }
          } catch {
            // ignore
          }

          const result = streamText({
            model,
            system,
            prompt,
            tools: provider.tools,
          });
          if (acceptsSse) {
            const writeSse = (data: any, event?: string) => {
              if (event) res.write(`event: ${event}\n`);
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            };
            const normalizeStreamPart = (part: any) => {
              if (!part || typeof part !== 'object') {
                if (part === undefined || part === null) return null;
                return { type: 'text', text: String(part) };
              }
              switch (part.type) {
                case 'text':
                case 'reasoning':
                case 'source':
                case 'file':
                case 'start-step':
                case 'finish-step':
                  return part;
                case 'text-delta':
                  return { type: 'text', text: part.text ?? part.delta ?? '' };
                case 'reasoning-delta':
                  return {
                    type: 'reasoning',
                    text: part.delta ?? part.text ?? '',
                    providerMetadata: part.providerMetadata,
                  };
                case 'tool-call':
                  return {
                    type: 'tool-call',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    input:
                      part.input ??
                      part.args ??
                      part.arguments ??
                      part.parameters,
                  };
                case 'tool-call-streaming-start':
                  return {
                    type: 'tool-call-streaming-start',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                  };
                case 'tool-call-delta':
                  return {
                    type: 'tool-call-delta',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    argsTextDelta: part.argsTextDelta ?? part.delta ?? '',
                  };
                case 'tool-result':
                  return {
                    type: 'tool-result',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    input: part.input ?? part.args ?? part.parameters,
                    output: part.output ?? part.result,
                  };
                case 'error':
                  return {
                    type: 'error',
                    message: String(part.error ?? part.message ?? part),
                  };
              }
            };
            for await (const part of result.fullStream) {
              const normalized = normalizeStreamPart(part);
              if (normalized) {
                writeSse(normalized);
                try {
                  (res as any).flush?.();
                } catch {
                  // ignore
                }
              }
            }
            res.write('event: done\ndata: {}\n\n');
          } else {
            for await (const chunk of result.textStream) {
              res.write(chunk);
              try {
                (res as any).flush?.();
              } catch {
                // ignore
              }
            }
          }
          if (acceptsSse) {
            // already sent
          }
          res.end();
        } catch (e: any) {
          res.write(`\n\n[error] ${String(e?.message || e)}\n`);
          res.end();
        } finally {
          try {
            if (!acpConfig.persistSession) {
              await provider.cleanup?.();
            }
          } catch {
            // ignore
          }
        }
        return;
      }

      // Default: inspect request (GET /?file=...&line=...&column=...)
      const params = url.searchParams;
      let file = decodeURIComponent(params.get('file') as string);
      file = resolveProjectFile(file);
      if (
        options?.pathType === 'relative' &&
        file &&
        ProjectRootPath &&
        !isFileUnderProjectRoot(file)
      ) {
        res.writeHead(403, corsHeaders);
        res.end('not allowed to open this file');
        return;
      }
      const line = Number(params.get('line'));
      const column = Number(params.get('column'));
      res.writeHead(200, corsHeaders);
      res.end('ok');
      options?.hooks?.afterInspectRequest?.(options, { file, line, column });
      launchIDE({
        file,
        line,
        column,
        editor: options?.editor,
        method: options?.openIn,
        format: options?.pathFormat,
        rootDir: record?.envDir,
        type: options?.launchType,
      });
    })().catch((e: any) => {
      res.writeHead(500, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Private-Network': 'true',
      });
      res.end(String(e?.message || e));
    });
  });

  // 寻找可用接口
  portFinder.getPort(
    { port: options?.port ?? DefaultPort },
    (err: Error, port: number) => {
      /* v8 ignore next 3 -- error thrown in callback, tested via integration */
      if (err) {
        throw err;
      }
      server.listen(port, () => {
        callback(port);
      });
    }
  );
  return server;
}

/**
 * Check if a port is occupied (in use)
 * @param port - The port number to check
 * @returns Promise<boolean> - true if port is occupied, false if available
 */
async function isPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Create TCP server to test port availability
    const server = net.createServer();
    // Disable default connection listening (only for detecting port)
    server.unref();

    // Port is available - we can bind to it
    server.on('listening', () => {
      server.close(); // Immediately close server, release port
      resolve(false); // Port is NOT occupied
    });

    // Port is occupied - binding failed
    server.on('error', () => {
      resolve(true); // Port IS occupied
    });

    server.listen(port);
  });
}

export async function startServer(options: CodeOptions, record: RecordInfo) {
  const previousPort = getProjectRecord(record)?.port;
  if (previousPort) {
    const isOccupied = await isPortOccupied(previousPort);
    if (isOccupied) {
      // Port is occupied, server is already running
      return;
    }
    // Port is available, need to restart server
    setProjectRecord(record, 'findPort', undefined);
    setProjectRecord(record, 'port', undefined);
  }
  let restartServer = !getProjectRecord(record)?.findPort;

  if (restartServer) {
    const findPort = new Promise<number>((resolve) => {
      // create server
      createServer(
        (port: number) => {
          resolve(port);
          if (options.printServer) {
            const info = [
              chalk.blue('[code-inspector-plugin]'),
              'Server is running on:',
              chalk.green(
                `http://${getIP(options.ip || 'localhost')}:${
                  options.port ?? DefaultPort
                }`
              ),
            ];
            console.log(info.join(' '));
          }
        },
        options,
        record
      );
    });
    // record the server of current project
    setProjectRecord(record, 'findPort', 1);
    const port = await findPort;
    setProjectRecord(record, 'port', port);
  }

  if (!getProjectRecord(record)?.port) {
    const port = await findPort(record);
    setProjectRecord(record, 'port', port);
  }
}
