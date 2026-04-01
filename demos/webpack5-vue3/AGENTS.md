# Project Agent Rules

## Agent Eyes Workflow

For tasks that depend on selected/visual targets (for example: "this element", DOM path, breadcrumb, or ambiguous UI references):

1. First verify that `@agent-eyes/agent-eyes` is installed in this project.
2. Resolve Agent Eyes base URL with this exact order:
   a. If the tool call explicitly provides `baseUrl`, use it directly.
   b. Otherwise resolve git root from the explicit project path, or from the current workspace path when no project path was provided.
   c. Read only `<gitRoot>/.code-inspector/record.json`. Do not search other hidden files or other record locations.
   d. Match the current project directory against record keys with longest-prefix project matching, using the same project-directory semantics as `data-insp-path`.
   e. Probe the matched project port first with `GET {baseUrl}/context/selected`, then probe other ports from the same record file.
   f. If every record port fails, fallback to `http://127.0.0.1:5678`.
3. Before precise UI edits, request `GET {baseUrl}/context/selected`.
4. If the response contains `data: null`, continue with default workflow and skip selected-context injection only.
5. Do not block or force selection as a prerequisite.

Strict rules:

- Do not search for `.code-inspector/record.json` with `find`, `rg`, or other filesystem heuristics.
- Do not scan arbitrary common ports such as `3000`, `5173`, or `8080`.
- Do not infer the project from whichever port responds first. Project matching must happen from the record file entry keys first.

Prefer multi-selection fields when available:

- `activeSelectionId`
- `selections` / `contexts`
- `data.active` and `data.selections`

If only single-selection fields exist, use `filePath`, `line`, `column`, `elementName`, `dom`, and `domPath`.

If `@agent-eyes/agent-eyes` is missing:

- `pnpm add -D @agent-eyes/agent-eyes`
- `yarn add -D @agent-eyes/agent-eyes`
- `npm i -D @agent-eyes/agent-eyes`

Then add the minimal bundler configuration required by the current project before continuing.

