# grill-me-for-codex

Question cards for planning interviews in Codex. Supports single and multiple choice, image options, ratings, ranking, and written answers.

[中文使用说明](README.zh-CN.md)

## Install

Requires Node.js 20+, npm, and Python 3.11+.

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run build
python scripts/install.py
```

The installer uses `CODEX_HOME` or your `.codex` directory. It installs the `grill-me-for-codex` skill and a server named `grill_ui`. If that server name is already registered to another tool, installation stops without changing it.

To check the installation plan first, run `python scripts/install.py --dry-run`. Use `--codex-home` to choose another location.

Reconnect the MCP server after installation or an update, then invoke the skill again.

## Use

```text
$grill-me-for-codex Help me review this project plan, one question at a time.
```

Choose or write an answer, add a note if needed, then click Submit. You can also skip a question. Recommended options are not selected for you.

To try the controls outside Codex, run `npm run preview` and open the address it prints.

## Resume a questionnaire

Return to the same chat and say “continue.” Questions and submitted answers are kept locally for 30 days. Unsubmitted selections and text must be entered again after closing the card.

| Problem | What to do |
| --- | --- |
| No confirmation after Submit | Retry the same answer; it will not create a duplicate. |
| You want to change a submitted answer | Ask for a new question. Submitted answers cannot be replaced. |
| The card reports a saving error | Check disk space and folder permissions, then retry. |
| The chat or saved records were deleted, or records expired | Start a new questionnaire. |

If the answer is saved but the chat stops, send “continue” in the same chat. After an update, reconnect the MCP server and invoke the skill again. A saved answer cannot restart a chat turn that has already ended. Support for inline cards and submission during a waiting turn depends on the Codex client. The skill uses native question tools when custom cards are unavailable.

## Privacy

Questions, images, and submitted answers are stored locally as plaintext in `state/` beside the installed server. Set `GRILL_UI_STATE_DIR` to use another folder.

Do not enter passwords or API keys. Keep runtime records, Codex configuration, environment files, logs, and installation backups out of the repository.

## Development

```sh
npm test
python scripts/check_privacy.py
```

Before publishing, review the staged files and run the privacy check. It flags common credentials and personal paths without printing matched values; review other private details yourself.

See [dependency licenses](THIRD_PARTY_NOTICES.md). No license for the project's original code has been selected.
