# Agent Eyes Workflow

For any task that may modify UI, DOM structure, styles, component behavior, page content, or selected elements:

1. First verify that `@agent-eyes/agent-eyes` is installed in this project.
2. Before making any code change, request `GET http://127.0.0.1:5678/context/selected`.
3. If the response contains `data: null`, do not guess the target code.
4. Ask the user to open Agent Eyes, select the target element, and keep the selection panel open.
5. Only after a non-null context is returned may you use that context to locate and modify code precisely.

Prefer multi-selection fields when available:

- `activeSelectionId`
- `selections` / `contexts`
- `data.active` and `data.selections`

If only single-selection fields exist, use `filePath`, `line`, `column`, `elementName`, `dom`, and `domPath` to anchor the change request.

If `@agent-eyes/agent-eyes` is missing:

- `pnpm add -D @agent-eyes/agent-eyes`
- `yarn add -D @agent-eyes/agent-eyes`
- `npm i -D @agent-eyes/agent-eyes`

Then add the minimal bundler configuration required by the current project before continuing.
