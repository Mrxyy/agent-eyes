# Selected Context API

Use this reference when calling the local Agent Eyes service for selected-element context.

For persistent project behavior, pair this reference with an `AGENTS.md` rule so future agent runs fetch context before editing code.

## Install Check First
Before calling this API, ensure `@agent-eyes/agent-eyes` is installed in the project.

Detection order:
1. Read `package.json` and check `dependencies` + `devDependencies`.
2. Confirm package manager via lock file:
- `pnpm-lock.yaml` -> `pnpm`
- `yarn.lock` -> `yarn`
- `package-lock.json` -> `npm`

Install command when missing:
- `pnpm add -D @agent-eyes/agent-eyes`
- `yarn add -D @agent-eyes/agent-eyes`
- `npm i -D @agent-eyes/agent-eyes`

## Endpoint Conventions
- Preferred endpoint: `GET /context/selected`
- Base URL resolution order:
1. explicit tool/input `baseUrl`
2. explicit project path matched against entries in the git root `.code-inspector/record.json`, then probe candidate ports with `GET /context/selected`
3. current workspace path matched against entries in the git root `.code-inspector/record.json`, then probe candidate ports with `GET /context/selected`
4. fallback `http://127.0.0.1:5678`
- Do not discover `.code-inspector/record.json` by generic hidden-file search when the git root is known.
- Do not probe arbitrary common ports; only probe ports listed in the matched `record.json`, plus the single fallback `5678`.
- Content type: `application/json`
- This endpoint should only return context while the Agent Eyes selection panel is actively open.
- When selection is canceled or the panel is closed, the endpoint should return `data: null`.

## Example Request
```bash
curl -sS "${BASE_URL}/context/selected" \
  -H "Accept: application/json"
```

## Example Response (flat single-selection)
```json
{
  "filePath": "/abs/path/src/pages/home/index.tsx",
  "line": 128,
  "column": 9,
  "elementName": "Banner",
  "dom": {
    "tagName": "div",
    "className": "home-banner hero",
    "textContent": "Build better products faster"
  },
  "domPath": ["App", "HomePage", "Banner", "div.home-banner"]
}
```

## Example Response (wrapped multi-selection preferred)
```json
{
  "success": true,
  "activeSelectionId": "ctx-2",
  "contexts": [
    {
      "id": "ctx-1",
      "filePath": "/abs/path/src/pages/home/index.tsx",
      "line": 98,
      "column": 5,
      "elementName": "Header",
      "dom": {
        "tagName": "header",
        "className": "home-header",
        "textContent": "Dashboard"
      },
      "domPath": ["App", "HomePage", "Header"]
    },
    {
      "id": "ctx-2",
      "filePath": "/abs/path/src/pages/home/index.tsx",
      "line": 128,
      "column": 9,
      "elementName": "Banner",
      "dom": {
        "tagName": "div",
        "className": "home-banner hero",
        "textContent": "Build better products faster"
      },
      "domPath": [
        { "name": "App", "label": "App" },
        { "name": "HomePage", "label": "HomePage" },
        { "name": "Banner", "label": "Banner" }
      ]
    }
  ],
  "active": {
    "id": "ctx-2",
    "filePath": "/abs/path/src/pages/home/index.tsx",
    "line": 128,
    "column": 9,
    "elementName": "Banner"
  },
  "data": {
    "activeSelectionId": "ctx-2",
    "active": {
      "id": "ctx-2",
      "filePath": "/abs/path/src/pages/home/index.tsx",
      "line": 128,
      "column": 9,
      "elementName": "Banner"
    },
    "selections": [
      { "id": "ctx-1", "filePath": "/abs/path/src/pages/home/index.tsx", "line": 98, "column": 5, "elementName": "Header" },
      { "id": "ctx-2", "filePath": "/abs/path/src/pages/home/index.tsx", "line": 128, "column": 9, "elementName": "Banner" }
    ],
    "filePath": "/abs/path/src/pages/home/index.tsx",
    "line": 128,
    "column": 9,
    "elementName": "Banner",
    "dom": {
      "tagName": "div",
      "className": "home-banner hero",
      "textContent": "Build better products faster"
    },
    "domPath": [
      { "name": "App", "label": "App" },
      { "name": "HomePage", "label": "HomePage" },
      { "name": "Banner", "label": "Banner" }
    ]
  }
}
```

## Example Response (no active selection)
```json
{
  "success": true,
  "data": null,
  "message": "no selected context yet, select an element first"
}
```

## Normalization Rules
1. Prefer multi-selection fields:
- `response.activeSelectionId`
- `response.selections` / `response.contexts`
- `response.data.active` and `response.data.selections`
2. Resolve `active` context from:
- `response.active` -> `response.data.active` -> `contexts.find(id===activeSelectionId)` -> first context.
3. If multi-selection fields are unavailable, fallback to single-selection:
- use `response.data` when present; otherwise use `response`.
4. Convert each context `domPath` into string array:
- string[]: keep as-is
- object[]: map with `label || name`, then drop falsy values
5. Truncate `dom.textContent` to 200 chars for prompt safety.
6. Validate required keys per context item: `filePath`, `line`, `column`, `elementName`, `dom`, `domPath`.
7. If `data` is `null`, treat selection context as unavailable. The agent MUST continue with the default workflow, skip selected-context injection only, and MUST NOT block on missing selection.

## Error Mapping
- 404: endpoint not exposed yet; verify server added `/context/selected`
- 405: wrong HTTP method; retry with `GET`
- 5xx: server failure; keep URL and status in error output
- timeout/network: include host/port and retry advice

## Prompt Template
```text
There are {selectionCount} selected DOM contexts. Consider all of them together.

{activePrefix}Selection #{index}
Source: {filePath}:{line}:{column}
Element: <{elementName} ...>
DOM: {tagName}, className: {className}, text content: {textContent}
Path: {domPathJoined}
```
