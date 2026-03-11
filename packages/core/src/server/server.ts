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

export function createServer(
  callback: (port: number) => any,
  options?: CodeOptions,
  record?: RecordInfo
) {
  const server = http.createServer((req: any, res: any) => {
    void (async () => {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Private-Network': 'true',
      };

      const url = new URL(req.url || '/', 'http://127.0.0.1');

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
          process.env.CODE_INSPECTOR_ACP_COMMAND || 'codex-acp';
        const acpConfig = options?.agent?.acp || {
          command: defaultAcpCommand,
          args: [],
          persistSession: true,
          authMethodId: process.env.CODE_INSPECTOR_ACP_AUTH_METHOD_ID,
        };
        if (!acpConfig?.command) {
          res.writeHead(400, corsHeaders);
          res.end(
            'ACP agent is not configured. Please set options.agent.acp.command (e.g. codex-acp / claude-code-acp) or set env CODE_INSPECTOR_ACP_COMMAND.'
          );
          return;
        }

        // Read JSON body
        let raw = '';
        await new Promise<void>((resolve, reject) => {
          req.on('data', (chunk: Buffer) => {
            raw += chunk.toString('utf-8');
            if (raw.length > 1024 * 1024 * 2) {
              reject(new Error('payload too large'));
              req.destroy();
            }
          });
          req.on('end', () => resolve());
          req.on('error', reject);
        });

        let body: any = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          res.writeHead(400, corsHeaders);
          res.end('invalid json');
          return;
        }

        const userRequirement: string =
          body.requirement || body.prompt || body.message || '';
        const contextFromClient: string =
          body.contextPrompt || body.context || '';
        const modelId: string =
          body.model || process.env.CODE_INSPECTOR_ACP_MODEL || undefined;
        const modeId: string = body.mode || body.modeId || undefined;

        if (!userRequirement) {
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

        const prompt = [
          generatedContext,
          file ? `\n待修改文件：${file}` : '',
          snippet ? `\n\n文件片段（含行号）：\n${snippet}` : '',
          `\n\n用户需求：\n${userRequirement}\n`,
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
            for await (const part of result.fullStream) {
              switch (part.type) {
                case 'text-delta':
                  writeSse({ type: 'text-delta', delta: part.text });
                  break;
                case 'reasoning-delta':
                  writeSse({ type: 'reasoning-delta', delta: part.delta });
                  break;
                case 'tool-call':
                  writeSse({
                    type: 'tool-call',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    args: part.args,
                  });
                  break;
                case 'tool-result':
                  writeSse({
                    type: 'tool-result',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    result: part.result,
                  });
                  break;
                case 'error':
                  writeSse({ type: 'error', message: String(part.error) });
                  break;
                default:
                  break;
              }
              try {
                (res as any).flush?.();
              } catch {
                // ignore
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
