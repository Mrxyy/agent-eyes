import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5678';
const AGENT_EYES_PACKAGE_NAME = '@agent-eyes/agent-eyes';
const RECORD_FILE_RELATIVE_PATH = '.code-inspector/record.json';

const agentEyesRuleSection = `## Agent Eyes Workflow

For tasks that depend on selected/visual targets (for example: "this element", DOM path, breadcrumb, or ambiguous UI references):

1. First verify that \`${AGENT_EYES_PACKAGE_NAME}\` is installed in this project.
2. Resolve Agent Eyes base URL from \`${RECORD_FILE_RELATIVE_PATH}\` for current project first; fallback to \`${DEFAULT_BASE_URL}\`.
3. Before precise UI edits, request \`GET {baseUrl}/context/selected\`.
4. If the response contains \`data: null\`, continue with default workflow and skip selected-context injection only.
5. Do not block or force selection as a prerequisite.

Prefer multi-selection fields when available:

- \`activeSelectionId\`
- \`selections\` / \`contexts\`
- \`data.active\` and \`data.selections\`

If only single-selection fields exist, use \`filePath\`, \`line\`, \`column\`, \`elementName\`, \`dom\`, and \`domPath\`.

If \`${AGENT_EYES_PACKAGE_NAME}\` is missing:

- \`pnpm add -D ${AGENT_EYES_PACKAGE_NAME}\`
- \`yarn add -D ${AGENT_EYES_PACKAGE_NAME}\`
- \`npm i -D ${AGENT_EYES_PACKAGE_NAME}\`

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
      pluginInstalled: !!deps[AGENT_EYES_PACKAGE_NAME],
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
    content,
  };
}

function readProjectPortFromRecord(rootDir: string): number | undefined {
  const recordFilePath = path.join(rootDir, RECORD_FILE_RELATIVE_PATH);
  if (!fs.existsSync(recordFilePath)) {
    return undefined;
  }
  try {
    const content = JSON.parse(fs.readFileSync(recordFilePath, 'utf-8'));
    const record = content?.[rootDir];
    const port = Number(record?.port);
    if (Number.isFinite(port) && port > 0) {
      return port;
    }
  } catch {
    // ignore parse errors and fallback to env/default
  }
  return undefined;
}

function resolveAgentEyesBaseUrl({
  baseUrl,
  projectRoot,
}: {
  baseUrl?: string;
  projectRoot?: string;
}) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  if (baseUrl) {
    return { baseUrl, rootDir, source: 'input' as const };
  }

  const envBaseUrl =
    process.env.AGENT_EYES_BASE_URL || process.env.CODE_INSPECTOR_BASE_URL;
  if (envBaseUrl) {
    return { baseUrl: envBaseUrl, rootDir, source: 'env' as const };
  }

  const port = readProjectPortFromRecord(rootDir);
  if (port) {
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      rootDir,
      source: 'record' as const,
      port,
    };
  }

  return { baseUrl: DEFAULT_BASE_URL, rootDir, source: 'default' as const };
}

async function getSelectedContext(baseUrl: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/context/selected`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return response.json();
}

function normalizeSelectedContextPayload(payload: any) {
  const topSelections = Array.isArray(payload?.selections) ? payload.selections : [];
  const topContexts = Array.isArray(payload?.contexts) ? payload.contexts : [];
  const dataSelections = Array.isArray(payload?.data?.selections)
    ? payload.data.selections
    : [];
  const dataContexts = Array.isArray(payload?.data?.contexts)
    ? payload.data.contexts
    : [];
  const contexts =
    topContexts.length > 0
      ? topContexts
      : topSelections.length > 0
      ? topSelections
      : dataContexts.length > 0
      ? dataContexts
      : dataSelections.length > 0
      ? dataSelections
      : payload?.data?.filePath
      ? [payload.data]
      : [];
  const activeSelectionId = String(
    payload?.activeSelectionId ||
      payload?.data?.activeSelectionId ||
      payload?.active?.id ||
      payload?.data?.active?.id ||
      ''
  );
  const active =
    payload?.active ||
    payload?.data?.active ||
    contexts.find((item: any) => item?.id && item.id === activeSelectionId) ||
    payload?.data ||
    contexts[0] ||
    null;

  return {
    ...payload,
    data: payload?.data ?? active,
    active,
    activeSelectionId: activeSelectionId || active?.id || '',
    contexts,
    selections: contexts,
  };
}

function ensureAgentsRule(rootDir: string) {
  const agentsMeta = getAgentsFileStatus(rootDir);
  let nextContent = '';
  if (!agentsMeta.exists) {
    nextContent = `# Project Agent Rules\n\n${agentEyesRuleSection}\n`;
  } else {
    nextContent = agentsMeta.hasRule
      ? agentsMeta.content.replace(
          /## Agent Eyes Workflow[\s\S]*$/m,
          agentEyesRuleSection.trimEnd()
        )
      : `${agentsMeta.content.trimEnd()}\n\n${agentEyesRuleSection}\n`;
  }
  fs.writeFileSync(agentsMeta.agentsPath, nextContent, 'utf-8');
  return {
    agentsPath: agentsMeta.agentsPath,
    created: !agentsMeta.exists,
    updated: agentsMeta.exists,
  };
}

export function createAgentEyesMcpServer() {
  const server = new McpServer({
    name: 'agent-eyes-mcp',
    version: '0.0.1',
  });

  server.registerTool(
    'get_selected_context',
    {
      description:
        'Get the currently selected Agent Eyes code context from the local service. Use before any precise UI or page code modification.',
      inputSchema: {
        baseUrl: z
          .string()
          .optional()
          .describe(
            'Agent Eyes local service base URL. When omitted, auto-resolve from project record/env/default.'
          ),
        projectRoot: z
          .string()
          .optional()
          .describe(
            'Project root used to resolve .code-inspector/record.json. Defaults to current working directory.'
          ),
      },
    },
    async ({ baseUrl, projectRoot }) => {
      try {
        const resolved = resolveAgentEyesBaseUrl({ baseUrl, projectRoot });
        const payload = await getSelectedContext(resolved.baseUrl);
        const normalized = normalizeSelectedContextPayload(payload);
        const result = {
          ...normalized,
          _meta: {
            resolvedBaseUrl: resolved.baseUrl,
            resolveSource: resolved.source,
            projectRoot: resolved.rootDir,
          },
        };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: String(error instanceof Error ? error.message : error),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'ensure_agents_rule',
    {
      description:
        'Create or update AGENTS.md in the project root with the Agent Eyes workflow rule.',
      inputSchema: {
        projectRoot: z
          .string()
          .optional()
          .describe('Project root directory. Defaults to current working directory.'),
      },
    },
    async ({ projectRoot }) => {
      const rootDir = path.resolve(projectRoot || process.cwd());
      try {
        const packageMeta = readProjectPackageMeta(rootDir);
        const packageManager = detectPackageManager(rootDir);
        const installCommand =
          packageManager === 'pnpm'
            ? `pnpm add -D ${AGENT_EYES_PACKAGE_NAME}`
            : packageManager === 'yarn'
            ? `yarn add -D ${AGENT_EYES_PACKAGE_NAME}`
            : `npm i -D ${AGENT_EYES_PACKAGE_NAME}`;
        const agentsResult = ensureAgentsRule(rootDir);
        const result = {
          rootDir,
          packageJsonPath: packageMeta.packageJsonPath,
          packageExists: packageMeta.packageExists,
          pluginInstalled: packageMeta.pluginInstalled,
          packageManager,
          installCommand,
          ...agentsResult,
        };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: String(error instanceof Error ? error.message : error),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

export async function startAgentEyesMcpServer() {
  const server = createAgentEyesMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
