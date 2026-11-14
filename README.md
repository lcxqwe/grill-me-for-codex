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

If submission saves the answer but the chat does not continue, reconnect the server and invoke the skill again. Support for inline cards and submission during a waiting turn depends on the Codex client. The skill uses native question tools when the custom cards are unavailable.

[More on recovery](docs/edge-cases.md) · [Privacy](PRIVACY.md)

## Development

```sh
npm test
python scripts/check_privacy.py
```

See [dependency licenses](THIRD_PARTY_NOTICES.md). No license for the project's original code has been selected.
