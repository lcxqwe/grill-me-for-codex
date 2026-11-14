# Interactive questionnaire in Codex

Use the configured `grill_ui` MCP server when its tools are available. Display one question at a time with `ask_question`. Native question tools remain the fallback if the custom UI is unavailable.

Supported `kind` values:

- `single`: one option.
- `multi`: several options, with `minSelections` and optional `maxSelections`.
- `image`: image options; set `multiple: true` for several selections.
- `rating`: integer score, default 1–5; optional `ratingLabels: { low, high }`.
- `ranking`: arrange all options in priority order; drag and up/down controls are provided.
- `text`: a free-text answer.

Each question has `title`, optional `description`, and for selection/ranking questions `options: [{ id, label, description? }]`. `recommended` is a valid option ID; it is displayed as a recommendation without selecting it for the user. Image options additionally require `image`, a base64 image data URI. Prefer small images; this tool does not fetch URLs or read arbitrary image files.

`ask_question` returns a `questionId` and `status: pending` immediately so the host can display the card. In the SAME turn, immediately call `wait_for_answer` with that ID. Do not send a final reply or end the turn while waiting. Do not narrate internal tool steps, repeat the question as prose, display the ID, or send a stock "question sent / waiting for you" message.

On Submit, the UI validates and saves the answer in the local server process. This completes the pending `wait_for_answer` tool directly; the UI does not send a user message or update model context. Read the verified answer in that tool result, then recompute the decision frontier and ask the next question. `status: skipped` is not approval of the recommendation. Respect the user's notes and changes of direction.

Each wait is bounded to 55 seconds (the default), below the usual MCP request timeout. If it returns `pending`, call `wait_for_answer` again with the same ID without repeating commentary. Never accept a recommendation, ask another question, or spin on `get_answer` while waiting. If the user stops or changes the task, follow that steering. `get_answer` is only for recovering an already submitted answer after an interrupted wait.

This requires both `ask_question` and `wait_for_answer` to be available and the host to allow UI submission while a model tool is waiting. If the wait tool is missing, use the native question tool instead of creating a custom card that cannot resume. If the host cannot display an MCP App or concurrent UI submission fails, explain the observed limitation and use the native question tool; do not silently restore automatic messages. Do not present a browser preview as proof of native Codex rendering or concurrent submission support.

Do not submit answers on the user's behalf. The `submit_answer` tool is for direct UI actions. Do not use this questionnaire to collect credentials.

Questions and committed answers are stored on local disk for 30 days. A successful submission is acknowledged only after an atomic durable write. Retries of the same answer are idempotent; a different second answer is rejected. A saved question remains pending until the human submits or explicitly skips it. Unsubmitted control selections and text are not yet persisted as drafts; never infer them as answers.

After a Codex/MCP restart, interrupted tool call, or user request to continue, locate the exact `questionId` in THIS chat's previous tool results and call `resume_question`. If it returns `pending`, the restored card is displayed and you immediately call `wait_for_answer`; if answered/skipped, continue from its verified saved answer. Do not choose the most recent global question: other chats may be using this server. Do not ask the user to paste internal IDs when the ID is available in chat history.

The plugin preserves state but cannot restart a stopped model turn by itself. If Codex does not automatically resume, a normal "continue" message from the human starts recovery. Never use `sendMessage` or `updateModelContext` to simulate resumption. Missing history, deleted data, a 30-day expiry, or a record from the old memory-only version cannot be reconstructed automatically; explain the specific reason and ask a fresh question. Unreadable/corrupt records and disk-write failures are errors, not approval; preserve the record and never show a successful submission without confirmation.
