import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5678';
const AGENT_EYES_PACKAGE_NAME = '@agent-eyes/agent-eyes';
const RECORD_FILE_RELATIVE_PATH = '.code-inspector/record.json';
const PROBE_TIMEOUT_MS = 1500;

const agentEyesRuleSection = `## Agent Eyes Workflow

For tasks that depend on selected/visual targets (for example: "this element", DOM path, breadcrumb, or ambiguous UI references):

1. First verify that \`${AGENT_EYES_PACKAGE_NAME}\` is installed in this project.
2. Resolve Agent Eyes base URL with this exact order:
   a. If the tool call explicitly provides \`baseUrl\`, use it directly.
   b. Otherwise resolve git root from the explicit project path, or from the current workspace path when no project path was provided.
   c. Read only \`<gitRoot>/${RECORD_FILE_RELATIVE_PATH}\`. Do not search other hidden files or other record locations.
   d. Match the current project directory against record keys with longest-prefix project matching, using the same project-directory semantics as \`data-insp-path\`.
   e. Probe the matched project port first with \`GET {baseUrl}/context/selected\`, then probe other ports from the same record file.
   f. If every record port fails, fallback to \`${DEFAULT_BASE_URL}\`.
3. Before precise UI edits, request \`GET {baseUrl}/context/selected\`.
4. If the response contains \`data: null\`, continue with default workflow and skip selected-context injection only.
5. Do not block or force selection as a prerequisite.

Strict rules:

- Do not search for \`.code-inspector/record.json\` with \`find\`, \`rg\`, or other filesystem heuristics.
- Do not scan arbitrary common ports such as \`3000\`, \`5173\`, or \`8080\`.
- Do not infer the project from whichever port responds first. Project matching must happen from the record file entry keys first.

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

function getProjectRoot(fromDir?: string): string {
  try {
    const command = fromDir
      ? `git -C ${JSON.stringify(path.resolve(fromDir))} rev-parse --show-toplevel`
      : 'git rev-parse --show-toplevel';
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
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

function getProjectRecordFilePath(rootDir: string) {
  return path.join(rootDir, RECORD_FILE_RELATIVE_PATH);
}

function isPathInside(targetPath: string, candidateRoot: string) {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(candidateRoot);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(normalizedRoot + path.sep)
  );
}

function resolvePreferredProjectEntry(
  entries: string[],
  projectPath?: string
) {
  if (!projectPath) return '';
  const normalizedProjectPath = path.resolve(projectPath);
  const matches = entries
    .filter((entryRoot) => isPathInside(normalizedProjectPath, entryRoot))
    .sort((a, b) => b.length - a.length);
  return matches[0] || '';
}

function resolveCodeInspectorRoot(projectRoot?: string) {
  const requestedProjectRoot = projectRoot
    ? path.resolve(projectRoot)
    : path.resolve(process.cwd());
  if (projectRoot) {
    const rootDir = getProjectRoot(projectRoot) || requestedProjectRoot;
    return {
      rootDir,
      requestedProjectRoot,
      source: 'project-root' as const,
    };
  }

  const rootDir = getProjectRoot(process.cwd()) || requestedProjectRoot;
  return {
    rootDir,
    requestedProjectRoot,
    source: 'cwd' as const,
  };
}

function readCandidatePorts(rootDir: string, projectRoot?: string) {
  const recordFilePath = getProjectRecordFilePath(rootDir);
  if (!fs.existsSync(recordFilePath)) {
    return {
      recordFilePath,
      preferredProjectRoot: '',
      candidatePorts: [] as number[],
    };
  }

  try {
    const content = JSON.parse(fs.readFileSync(recordFilePath, 'utf-8')) || {};
    const preferredProjectRoot = resolvePreferredProjectEntry(
      Object.keys(content),
      projectRoot
    );
    const ports = Object.entries(content)
      .map(([entryRoot, entry]: [string, any]) => ({
        entryRoot,
        port: Number(entry?.port),
      }))
      .filter((item) => Number.isFinite(item.port) && item.port > 0)
      .sort((a, b) => {
        if (a.entryRoot === preferredProjectRoot) return -1;
        if (b.entryRoot === preferredProjectRoot) return 1;
        return a.port - b.port;
      })
      .map((item) => item.port);

    return {
      recordFilePath,
      preferredProjectRoot,
      candidatePorts: Array.from(new Set(ports)),
    };
  } catch {
    return {
      recordFilePath,
      preferredProjectRoot: '',
      candidatePorts: [] as number[],
    };
  }
}

async function probeBaseUrl(baseUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/context/selected`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAgentEyesBaseUrl({
  baseUrl,
  projectRoot,
}: {
  baseUrl?: string;
  projectRoot?: string;
}) {
  const {
    rootDir,
    requestedProjectRoot,
    source: rootSource,
  } = resolveCodeInspectorRoot(projectRoot);
  if (baseUrl) {
    return {
      baseUrl,
      rootDir,
      requestedProjectRoot,
      source: 'input' as const,
      recordFilePath: getProjectRecordFilePath(rootDir),
      preferredProjectRoot: '',
      candidatePorts: [] as number[],
    };
  }

  const { recordFilePath, preferredProjectRoot, candidatePorts } =
    readCandidatePorts(rootDir, projectRoot);
  for (const port of candidatePorts) {
    const candidateBaseUrl = `http://127.0.0.1:${port}`;
    if (await probeBaseUrl(candidateBaseUrl)) {
      return {
        baseUrl: candidateBaseUrl,
        rootDir,
        requestedProjectRoot,
        source: 'record-probe' as const,
        recordFilePath,
        preferredProjectRoot,
        candidatePorts,
        port,
      };
    }
  }

  return {
    baseUrl: DEFAULT_BASE_URL,
    rootDir,
    requestedProjectRoot,
    recordFilePath,
    preferredProjectRoot,
    candidatePorts,
    source: rootSource === 'project-root' ? ('default-project-root' as const) : ('default' as const),
  };
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
            'Agent Eyes local service base URL. When omitted, resolve from the matched project entry inside <gitRoot>/.code-inspector/record.json, then fallback to http://127.0.0.1:5678.'
          ),
        projectRoot: z
          .string()
          .optional()
          .describe(
            'Project directory used for longest-prefix matching against keys in <gitRoot>/.code-inspector/record.json. When omitted, uses the current workspace path to resolve the git root and match the project entry.'
          ),
      },
    },
    async ({ baseUrl, projectRoot }) => {
      try {
        const resolved = await resolveAgentEyesBaseUrl({ baseUrl, projectRoot });
        const payload = await getSelectedContext(resolved.baseUrl);
        const normalized = normalizeSelectedContextPayload(payload);
        const result = {
          ...normalized,
          _meta: {
            resolvedBaseUrl: resolved.baseUrl,
            resolveSource: resolved.source,
            gitRoot: resolved.rootDir,
            requestedProjectRoot: resolved.requestedProjectRoot,
            recordFilePath: resolved.recordFilePath,
            matchedProjectRoot: resolved.preferredProjectRoot,
            candidatePorts: resolved.candidatePorts,
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
          .describe('Project root directory. Defaults to the current workspace git root.'),
      },
    },
    async ({ projectRoot }) => {
      const rootDir = path.resolve(projectRoot || getProjectRoot() || process.cwd());
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
