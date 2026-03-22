# Selected Context API

Use this reference when calling the local Agent Eyes service for selected-element context.

For persistent project behavior, pair this reference with an `AGENTS.md` rule so future agent runs fetch context before editing code.

## Install Check First
Before calling this API, ensure `code-inspector-plugin` is installed in the project.

Detection order:
1. Read `package.json` and check `dependencies` + `devDependencies`.
2. Confirm package manager via lock file:
- `pnpm-lock.yaml` -> `pnpm`
- `yarn.lock` -> `yarn`
- `package-lock.json` -> `npm`

Install command when missing:
- `pnpm add -D code-inspector-plugin`
- `yarn add -D code-inspector-plugin`
- `npm i -D code-inspector-plugin`

## Endpoint Conventions
- Preferred endpoint: `GET /context/selected`
- Base URL: `http://127.0.0.1:5678` unless caller provides another host/port
- Content type: `application/json`
- This endpoint should only return context while the Agent Eyes selection panel is actively open.
- When selection is canceled or the panel is closed, the endpoint should return `data: null`.

## Example Request
```bash
curl -sS "http://127.0.0.1:5678/context/selected" \
  -H "Accept: application/json"
```

## Example Response (flat)
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

## Example Response (wrapped)
```json
{
  "success": true,
  "data": {
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
1. Use `response.data` when present; otherwise use `response`.
2. Convert `domPath` into string array:
- string[]: keep as-is
- object[]: map with `label || name`, then drop falsy values
3. Truncate `dom.textContent` to 200 chars for prompt safety.
4. Validate required keys: `filePath`, `line`, `column`, `elementName`, `dom`, `domPath`.
5. If `data` is `null`, stop and request a fresh selection instead of guessing the target code.

## Error Mapping
- 404: endpoint not exposed yet; verify server added `/context/selected`
- 405: wrong HTTP method; retry with `GET`
- 5xx: server failure; keep URL and status in error output
- timeout/network: include host/port and retry advice

## Prompt Template
```text
The selected DOM element is: {tagName}, className: {className}, text content: {textContent}.
Its source location is {filePath}:{line}:{column}, and the corresponding JSX/TSX tag is <{elementName} ...>.
The path from the root node to the selected node is: {domPathJoined}.
```
