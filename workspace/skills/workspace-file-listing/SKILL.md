---
name: workspace-file-listing
description: Inspect the current workspace and report which files and documents exist. Use when the user asks what files, folders, or documents are present in the workspace or in a specific directory.
---
# Workspace File Listing

Use this skill when the user asks you to check the workspace and say which files, documents, or folders exist.

## What this skill is for

This skill is for requests such as:
- "verifique os arquivos do workspace"
- "quais documentos existem?"
- "liste os arquivos da pasta"
- "me diga o que tem no diretório"
- "inspect the workspace and list files"

Use it when the main task is inventory and reporting, not editing files.

## What to deliver

Choose the smallest useful output that matches the request:

1. **Root listing only**
- List files in the workspace root.
- Separate files and folders if that makes the result clearer.

2. **Root plus important subdirectories**
- If the user asks generally what documents exist, include root contents and a short listing of notable directories such as `config`, `docs`, or other obviously relevant folders.

3. **Specific path listing**
- If the user names a folder, list only that folder unless broader context is requested.

4. **Condensed summary for large trees**
- If there are many entries, show the most relevant files first and summarize the rest.

## Execution steps

### 1. Determine scope

Read the request carefully and decide whether the user wants:
- the workspace root
- a named subdirectory
- all documents you can reasonably inspect
- a focused list of document-like files only

If the request is ambiguous, default to:
- list the root contents
- include a few important subfolders only when useful

### 2. Inspect the filesystem

Use shell/file tools to inspect the workspace.

Preferred approach:
- list the root directory
- if needed, list selected subdirectories separately
- avoid recursive full-tree dumps unless the user explicitly asks for everything

Typical commands:
- `pwd`
- `ls -la`
- `find . -maxdepth 1`
- `find <path> -maxdepth 1`

When the user asks specifically for documents, pay attention to files such as:
- `.md`
- `.txt`
- `.pdf`
- `.html`
- `.json`
- `.yml`
- `.yaml`
- `.docx`

Do not claim a file exists unless the tool output shows it.

### 3. Organize the result

Present the findings in a practical order:

- workspace root files
- workspace root folders
- optional notable subdirectory contents

If useful, group entries like this:
- **Arquivos** / **Files**
- **Pastas** / **Folders**
- **Dentro de `<dir>`** / **Inside `<dir>`**

Keep names exact.
Do not rewrite filenames.

### 4. Keep the response proportional

If the directory is small:
- list all visible entries requested

If the directory is large:
- list the most relevant entries
- say that there are additional items if needed
- offer to expand a specific folder

### 5. Mention limitations only when real

If you cannot access a path or a tool fails:
- say exactly which path could not be inspected
- provide the partial listing you do have

Do not invent hidden contents.

## Output style

Preferred response style:
- short introductory sentence confirming you checked the workspace
- bullet list of files
- bullet list of folders
- optional subsection for important directories

Example structure:

- Verifiquei o workspace.
- Na raiz, encontrei estes arquivos:
  - `AGENT.md`
  - `config.json`
- E estas pastas:
  - `config`
  - `skills`
- Dentro de `config`:
  - `privacy-policy.md`
  - `hosting.md`

## Boundaries

Use this skill when the user wants inspection and listing.
Do not use it when the main task is:
- searching file contents for an answer
- summarizing a document's contents
- editing, moving, or deleting files
- browsing websites instead of local workspace files

## Notes for execution

- Prefer direct filesystem inspection over guessing from prior context.
- If the user says "use tools if needed," use tools.
- If a previous listing may be stale, re-check before answering.
- When the user asks "which documents exist," include both document files and clearly relevant folders if that helps navigation.

<!-- Learning provenance for review only:
Source task evidence showed successful behavior by checking the workspace root and listing files and folders, then drilling into `config` to enumerate document files. No existing matched skill covered local workspace file inventory. This skill captures that repeated pattern as a filesystem inspection workflow.
-->