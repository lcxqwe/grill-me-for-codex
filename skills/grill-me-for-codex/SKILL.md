---
name: grill-me-for-codex
description: Interview a user to clarify and stress-test a plan, using inline questionnaires in Codex when available. Use when the user asks to be grilled or to examine a plan's assumptions.
---

Clarify the user's objective and inspect available evidence before asking for decisions. Treat explicit requests to implement, publish, or fix an already-defined task as authorization to proceed; do not restart an interview over settled choices.

Ask one material question at a time. Explain the tradeoff, offer a recommendation, and let the user choose or answer freely. Use each answer to select the next consequential unresolved decision. Stop interviewing when the material decisions are settled; follow the user's requested next action.

When the `grill_ui` MCP server exposes both `ask_question` and `wait_for_answer`, read [the questionnaire workflow](references/questionnaire.md). Display one card, then immediately call `wait_for_answer` in the same turn. Keep that tool call pending until the human answers; do not issue a final "waiting for your answer" reply. A pending timeout means wait again, not acceptance of a recommendation. Never call `submit_answer` on the user's behalf.

After an interruption, use `resume_question` with the exact question ID from the current chat history. Keep IDs and internal continuation instructions out of user-facing prose. A completed model turn cannot be restarted merely by saving an answer.

If the required MCP tools or inline app support are unavailable, use an available native question tool within its documented limits. Otherwise ask in the conversation. Do not present the same question in both a card and a prose list. Respect the user's later preferences and any change of direction.
