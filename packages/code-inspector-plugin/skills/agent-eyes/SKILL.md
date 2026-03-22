---
name: agent-eyes
description: Verify whether `code-inspector-plugin` is installed in the current project, help install it when missing, ensure the project has an `AGENTS.md` rule that requires fetching Agent Eyes selected-code context first, and always fetch the current selected-code context before making code changes. Use when tasks involve page changes, selected elements, DOM path, UI edits, precise code modifications, or when an agent must request selected-element context from the local service before coding.
---

# Agent Eyes Skill

## When to Apply
- Apply this skill before any task that changes UI, styles, layout, text content, component behavior, or page structure.
- Apply this skill when the user refers to “this element”, “当前选中的元素”, “这里”, “这个按钮”, “这个区域”, breadcrumb path, DOM path, or a visual target on the page.
- Apply this skill when the task requires precise code modification and the target should be anchored to a selected element instead of guessed from text alone.
- Apply this skill when the project may not yet have `code-inspector-plugin` installed or may not yet have an `AGENTS.md` rule enforcing context-first behavior.
- Do not apply this skill for purely textual tasks that do not depend on a selected UI target, such as general refactors with no page target, package upgrades, or backend-only changes.

## Apply Order
1. If `code-inspector-plugin` is missing, install it first.
2. If `AGENTS.md` is missing or lacks the Agent Eyes rule, create or update it.
3. Before editing code, request `GET /context/selected`.
4. If the response is `data: null`, stop and ask the user to reselect the target element.
5. Only after a non-null context is available should the code change proceed.

## Quick Workflow
1. Check whether `code-inspector-plugin` is installed.
2. If missing, help install and provide minimal setup guidance.
3. Check whether the project already has `AGENTS.md`.
4. If missing, create it. If present, append or refine the Agent Eyes workflow rule.
5. Resolve service base URL.
6. Request selected-context endpoint before any code change.
7. If no active selection exists, stop and ask the user to select an element in Agent Eyes.
8. Validate and normalize response fields.
9. Build a compact context block for the next agent request.

## Check Plugin Installation
- Detect package manager from lock files:
- `pnpm-lock.yaml` -> use `pnpm`
- `yarn.lock` -> use `yarn`
- `package-lock.json` -> use `npm`
- Check if `code-inspector-plugin` exists in dependencies:
- Inspect root `package.json` (`dependencies` and `devDependencies`).
- If not found, install with the detected package manager:
- `pnpm add -D code-inspector-plugin`
- `yarn add -D code-inspector-plugin`
- `npm i -D code-inspector-plugin`
- After install, provide one minimal config snippet matching the user's bundler (Vite/Webpack/Next.js).
- If `package.json` cannot be found, ask user to confirm project root before installation.

## Ensure AGENTS.md Exists
- Look for `AGENTS.md` in the current project root first.
- If it does not exist, create `AGENTS.md` with the Agent Eyes workflow template from [references/agents-template.md](references/agents-template.md).
- If it exists, preserve user content and append a short Agent Eyes section rather than replacing the whole file.
- The inserted rule must require:
- checking `code-inspector-plugin` installation
- fetching `GET /context/selected` before any UI/code modification
- stopping when the response is `data: null`
- asking the user to reselect the target element instead of guessing

## Resolve Base URL
- Prefer an explicit value from user or environment.
- If not provided, use `http://127.0.0.1:5678`.
- Keep path configurable; do not hardcode if caller provides a different endpoint.

## Request Context Endpoint
- Prefer `GET /context/selected` for read-only context retrieval.
- If API requires POST, send an empty JSON body `{}` unless caller specifies filters.
- Set `Accept: application/json`.
- Use a short timeout (3-5 seconds) and report endpoint + timeout on failure.
- Treat `data: null` as "there is no current selection". Do not reuse stale context from earlier requests.
- For endpoint details and payload schema, read [references/context-api.md](references/context-api.md).

## Normalize Response
- Accept either `data` wrapper or flat object.
- Normalize into this shape:
- `filePath`: string
- `line`: number
- `column`: number
- `elementName`: string
- `dom.tagName`: string
- `dom.className`: string
- `dom.textContent`: string (truncate to 200 chars)
- `domPath`: string[]
- If `domPath` is an object array, map with `label || name`.
- If required fields are missing, return a clear error listing missing keys.

## Build Prompt Block
Use this template for downstream agent requests:

```text
The selected DOM element is: {tagName}, className: {className}, text content: {textContent}.
Its source location is {filePath}:{line}:{column}, and the corresponding JSX/TSX tag is <{elementName} ...>.
The path from the root node to the selected node is: {domPathJoined}.
```

## Request Example
```bash
curl -sS "http://127.0.0.1:5678/context/selected" \
  -H "Accept: application/json"
```

## Failure Handling
- If request fails, provide:
- attempted URL
- status code or network error
- one concrete retry action (check server port, endpoint path, CORS, or auth header)
- If the endpoint returns `data: null`, ask the user to reselect the element in the visible Agent Eyes panel before continuing.
- If context is stale, re-request immediately before sending code-modification prompt.

## Notes
- Keep this skill focused on plugin readiness + context retrieval + normalization.
- Do not mix this skill with full code-edit workflows unless the user asks.
- Prefer making the `AGENTS.md` rule persistent so future agent turns follow it even if this skill is not re-triggered.
