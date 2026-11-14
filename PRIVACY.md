# Privacy

Questions, images and submitted answers are stored locally as plaintext in `state/` beside the installed server. You can choose another directory with `GRILL_UI_STATE_DIR`.

- Do not enter passwords or API keys in a questionnaire.
- Do not upload runtime records, local Codex configuration, environment files, logs or installation backups.
- These files are excluded by `.gitignore`.
- Before publishing changes, review the staged files and run `python scripts/check_privacy.py`.

The checker reports suspicious filenames and categories without printing matched values. It detects common credential formats and personal paths, but cannot identify every possible private detail.

Source files and the initial commit contain no personal installation paths or private email address. GitHub still shows the account that owns the repository.
