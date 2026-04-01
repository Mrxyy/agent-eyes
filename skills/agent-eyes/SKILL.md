---
name: agent-eyes
description: Verify whether `@agent-eyes/agent-eyes` is installed in the current project, help install it when missing, ensure the project has an `AGENTS.md` rule for context-first edits when needed, and fetch selected-code context only for element-anchored or ambiguous UI changes. Use when tasks involve selected elements, DOM path, or precise UI edits that must be anchored to live selection.
---

# Agent Eyes Skill

## When to Apply
- Apply this skill for UI tasks that need element-anchored precision (for example: “this button”, “当前这个区域”, breadcrumb path, DOM path, selected node).
- Apply this skill when the user refers to “this element”, “当前选中的元素”, “这里”, “这个按钮”, “这个区域”, breadcrumb path, DOM path, or a visual target on the page.
- Apply this skill when the task requires precise code modification and the target should be anchored to a selected element instead of guessed from text alone.
- Apply this skill when the project may not yet have `@agent-eyes/agent-eyes` installed or may not yet have an `AGENTS.md` rule enforcing context-first behavior.
- Do not apply this skill for tasks that can be completed from explicit file paths, code snippets, or clear textual requirements without selected-element context.

## Apply Order
1. If `@agent-eyes/agent-eyes` is missing, install it first.
2. If installation was performed in this run, help the user finish minimal plugin configuration for their bundler.
3. If `AGENTS.md` is missing or lacks the Agent Eyes rule, create or update it.
4. If the task is element-anchored/ambiguous, request `GET /context/selected` before editing code.
5. If the response is `data: null`, the agent MUST continue with the default workflow and skip selected-context injection only.
6. The agent MUST NOT block execution or require element selection as a prerequisite; it may optionally suggest re-selection only when precision risk is high.

## Quick Workflow
1. Check whether `@agent-eyes/agent-eyes` is installed.
2. If missing, help install and provide minimal setup guidance.
3. If installed during this run, actively help configure plugin entry in bundler config files.
4. Verify config looks effective (plugin imported + plugin applied in config).
5. Check whether the project already has `AGENTS.md`.
6. If missing, create it. If present, append or refine the Agent Eyes workflow rule.
7. Resolve service base URL.
8. Request selected-context endpoint only when the target is element-anchored or ambiguous.
9. If no active selection exists, continue normal code analysis/edit flow and treat context as unavailable.
10. Validate and normalize response fields.
11. Build a compact context block for the next agent request.

## Check Plugin Installation
- Detect package manager from lock files:
- `pnpm-lock.yaml` -> use `pnpm`
- `yarn.lock` -> use `yarn`
- `package-lock.json` -> use `npm`
- Check if `@agent-eyes/agent-eyes` exists in dependencies:
- Inspect root `package.json` (`dependencies` and `devDependencies`).
- If not found, install with the detected package manager:
- `pnpm add -D @agent-eyes/agent-eyes`
- `yarn add -D @agent-eyes/agent-eyes`
- `npm i -D @agent-eyes/agent-eyes`
- When replying to users, provide install commands **on demand**:
- Default: only show one command that matches detected package manager.
- If user asks for alternatives, then include `pnpm` / `yarn` / `npm` variants.
- After install, do not stop at package installation:
- Identify the active bundler/framework from project files (`vite.config.*`, `webpack.config.*`, `next.config.*`, `nuxt.config.*`, etc.).
- Help the user update the real config file in-place (or give an exact patch) to include `codeInspectorPlugin(...)`.
- Include minimal `bundler` + `showSwitch` + `agent.acp.command` fields in example config.
- Confirm import + plugin registration both exist after edit.
- If `package.json` cannot be found, ask user to confirm project root before installation.

## Post-Install Configuration Requirement
- Treat "install plugin" as incomplete until configuration is done.
- If auto-edit is allowed, modify the detected config file directly and summarize changes.
- If multiple candidate config files exist, prefer the one used by current scripts in `package.json`.
- If bundler cannot be inferred, ask one short blocking question and provide 2-3 likely file candidates.
- After config, instruct user to start/restart dev server and verify Agent Eyes switch appears.

## Bundler Configuration Examples (On Demand)
- If user asks for "how to configure", provide the example matching their actual bundler/framework.
- Do not dump all examples by default. Return one best-match snippet first, plus alternatives only when requested.
- Load examples from [references/bundler-examples.md](references/bundler-examples.md).
- Prefer reading only the relevant section in that file to keep context small.
- All snippets should include minimal Agent Eyes config:
- `bundler`
- `showSwitch: true`
- `agent.acp.command`

## Ensure AGENTS.md Exists
- Look for `AGENTS.md` in the current project root first.
- If it does not exist, create `AGENTS.md` with the Agent Eyes workflow template from [references/agents-template.md](references/agents-template.md).
- If it exists, preserve user content and append a short Agent Eyes section rather than replacing the whole file.
- The inserted rule must require:
- checking `@agent-eyes/agent-eyes` installation
- fetching `GET /context/selected` before element-anchored/ambiguous UI modification
- when `data: null`, continue with default workflow; skip selected-context injection only
- do not force re-selection; only suggest it when precision risk is high

## Resolve Base URL
- Prefer an explicit value from user/tool input.
- If an explicit project path is provided, resolve its git root first, then read that git root `.code-inspector/record.json`.
- If no explicit project path is provided, resolve the current workspace git root, then read that git root `.code-inspector/record.json`.
- Match the project path against entries in `record.json` using longest-prefix project-directory matching.
- Probe candidate ports with `GET /context/selected` and use the first reachable base URL.
- Fallback to `http://127.0.0.1:5678`.
- Keep path configurable; do not hardcode if caller provides a different endpoint.
- The agent MUST NOT search the filesystem for `.code-inspector/record.json` using ad-hoc globbing such as `rg --files`, `find`, or similar discovery when the git-root path is already known.
- The agent MUST NOT guess ports by scanning common ports like `5678 3000 5173 8080`.
- The agent MUST only probe ports that come from the matched `.code-inspector/record.json`, plus the single fallback `5678`.
- If using MCP is available, prefer MCP resolution over reimplementing the lookup manually in the agent response flow.

Use this exact project-directory matching logic:

```ts
import path from 'path';

function isPathInside(targetPath: string, candidateRoot: string) {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(candidateRoot);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(normalizedRoot + path.sep)
  );
}

function resolvePreferredProjectEntry(
  recordEntries: string[],
  projectPath: string
) {
  const normalizedProjectPath = path.resolve(projectPath);
  const matches = recordEntries
    .filter((entryRoot) => isPathInside(normalizedProjectPath, entryRoot))
    .sort((a, b) => b.length - a.length);

  return matches[0] || '';
}
```

Execution order MUST be:
1. Determine the project path from explicit user project path first; otherwise use the current workspace path.
2. Resolve the git root from that path.
3. Read only `<gitRoot>/.code-inspector/record.json`.
4. Run `resolvePreferredProjectEntry(Object.keys(recordJson), projectPath)` to get the single matched project directory.
5. Probe only the matched project directory port first, then other ports from the same `record.json`, then fallback `5678`.

## Request Context Endpoint
- Prefer `GET /context/selected` for read-only context retrieval.
- If API requires POST, send an empty JSON body `{}` unless caller specifies filters.
- Set `Accept: application/json`.
- Use a short timeout (3-5 seconds) and report endpoint + timeout on failure.
- Treat `data: null` as "there is no current selection". Do not reuse stale context from earlier requests; continue with default workflow without context injection.
- For endpoint details and payload schema, read [references/context-api.md](references/context-api.md).

## Normalize Response
- Accept either `data` wrapper or flat object.
- Prefer multi-selection fields first:
- `activeSelectionId`
- `selections` / `contexts`
- `data.active` and `data.selections`
- Normalize into this shape:
- `activeSelectionId`: string
- `active`: object | null
- `contexts`: object[]
- `selections`: object[] (same as `contexts`)
- For each context item, normalize:
- `filePath`: string
- `line`: number
- `column`: number
- `elementName`: string
- `dom.tagName`: string
- `dom.className`: string
- `dom.textContent`: string (truncate to 200 chars)
- `domPath`: string[]
- If `domPath` is an object array, map with `label || name`.
- If multi-selection fields are missing, fallback to single-selection fields from `data` or root object.
- If required fields are missing, return a clear error listing missing keys.

## Build Prompt Block
Use this template for downstream agent requests:

```text
There are {selectionCount} selected DOM contexts. Consider all of them together.

{activePrefix}Selection #{index}
Source: {filePath}:{line}:{column}
Element: <{elementName} ...>
DOM: {tagName}, className: {className}, text: {textContent}
Path: {domPathJoined}
```

## Request Example
```bash
curl -sS "${BASE_URL}/context/selected" \
  -H "Accept: application/json"
```

## Failure Handling
- If request fails, provide:
- attempted URL
- status code or network error
- one concrete retry action (check server port, endpoint path, CORS, or auth header)
- If the endpoint returns `data: null`, do not block the workflow; continue with default workflow and skip selected-context injection.
- If context is stale, re-request immediately before sending code-modification prompt.

## Notes
- Keep this skill focused on plugin readiness + context retrieval + normalization.
- Do not mix this skill with full code-edit workflows unless the user asks.
- Prefer making the `AGENTS.md` rule persistent so future agent turns follow it even if this skill is not re-triggered.
