---
name: validated-memory-file-overwrite
description: Write already-validated content to a specific memory file path exactly as instructed, usually by overwriting the file with write_file when the user provides the target path and content.
---
# Validated Memory File Overwrite

Use this skill when the user asks to write or overwrite a memory file with content that is already finalized or explicitly validated, and the main requirement is to save it exactly to the requested path.

## When to use
Use this skill when all of the following are true:
1. The user provides a specific target file path, usually under `memory/`.
2. The user provides the content to save, or refers to content that must be written exactly.
3. The user indicates overwrite semantics explicitly or implicitly, such as "sobrescreva", "overwrite=true", "grave exatamente", or "use o path exatamente igual".
4. The task is operational file writing, not content drafting or editing.

## What this skill does
- Writes the provided content to the specified memory file.
- Preserves the path exactly as the user gave it.
- Uses overwrite behavior when instructed or clearly implied.
- Avoids altering, reformatting, summarizing, or "improving" the content unless the user explicitly asks for that.

## Execution steps
1. Read the requested path exactly as written by the user.
2. Do not normalize, rename, or prepend extra path segments.
   - If the user says `memory/empresa.md`, use exactly `memory/empresa.md`.
   - If the user warns not to use `workspace/` or any prefix, follow that instruction exactly.
3. Read the full content that must be written.
4. Treat the content as final unless the user explicitly asks for edits.
5. Use the file-writing tool with overwrite enabled when the request says to overwrite or clearly implies replacement.
6. Write the content exactly as provided.
   - Preserve line breaks.
   - Preserve spacing when it is part of the provided content.
   - Do not add headers, comments, metadata, or trailing explanations into the file.
7. After writing, confirm completion briefly and mention the exact file path used.

## Priority rules
1. Exact path fidelity is mandatory.
2. Exact content fidelity is mandatory.
3. If the user provides explicit tool usage details such as `write_file` with `overwrite=true`, follow them.
4. Do not substitute another storage location even if a similar path seems more natural.

## Boundaries
- Do not rewrite the content for style or clarity unless asked.
- Do not merge with existing file contents when the request is to overwrite.
- Do not invent missing content.
- Do not switch from `memory/...` to `workspace/memory/...` unless the user explicitly requests that exact path.

## Response pattern
After successful execution, reply with a short confirmation such as:
- `Feito. O arquivo \`memory/empresa.md\` foi sobrescrito exatamente com o conteúdo enviado.`
- `Gravado exatamente em \`memory/empresa.md\`.`

## Failure handling
If the path or content is ambiguous, ask only the minimal clarifying question needed before writing.
If the user gives an exact path and exact content, do not ask for extra confirmation.

## Learned pattern notes
Source task evidence showed repeated successful requests to overwrite a memory file with validated discovery content while preserving the exact requested path, especially distinguishing `memory/empresa.md` from `workspace/memory/empresa.md`.