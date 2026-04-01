# Agent Eyes Workflow

For tasks that depend on a selected/visual target (for example “this element”, breadcrumb path, DOM path, or ambiguous UI reference):

1. First verify that `@agent-eyes/agent-eyes` is installed in this project.
2. Resolve the git root for the explicit project path when available, otherwise for the current workspace path. Read that git root `.code-inspector/record.json`, match the project directory by longest prefix using the exact `isPathInside` + `resolvePreferredProjectEntry` logic from the Agent Eyes skill, probe the matched project port first, then other ports from the same record file, then use the first reachable base URL (fallback `http://127.0.0.1:5678`). Do not use generic hidden-file search or arbitrary common-port scans.
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
