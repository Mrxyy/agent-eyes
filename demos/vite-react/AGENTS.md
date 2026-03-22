# Agent Eyes Workflow

For any task that may modify UI, DOM structure, styles, component behavior, page content, or selected elements:

1. First verify that `code-inspector-plugin` is installed in this project.
2. Before making any code change, request `GET http://127.0.0.1:5678/context/selected`.
3. If the response contains `data: null`, do not guess the target code.
4. Ask the user to open Agent Eyes, select the target element, and keep the selection panel open.
5. Only after a non-null context is returned may you use that context to locate and modify code precisely.

Use the selected context fields `filePath`, `line`, `column`, `elementName`, `dom`, and `domPath` to anchor the change request.
