# Agent Eyes Workflow

For tasks that depend on a selected/visual target (for example “this element”, breadcrumb path, DOM path, or ambiguous UI reference):

1. First verify that `@agent-eyes/agent-eyes` is installed in this project.
2. Resolve base URL from current project `.code-inspector/record.json` first (fallback `http://127.0.0.1:5678`), then request `GET {baseUrl}/context/selected`.
3. If the response contains `data: null`, the agent MUST continue with the default workflow.
4. Skip selected-context injection only, and proceed using explicit files/snippets/requirements available in the request.
5. The agent MUST NOT require element selection as a prerequisite; it may suggest re-selection (or exact file/line) only when precision is insufficient.

For tasks with explicit targets (exact file path, code snippet, or clear textual requirement), you may proceed without Agent Eyes selection.

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
