"""Install the built server and standalone skill into a chosen Codex home."""
from pathlib import Path
import argparse
import datetime
import json
import os
import shutil
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parent.parent
FILES = ('server.mjs', 'questionnaire.html', 'THIRD_PARTY_LICENSES.txt')

def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def install(codex_home, node, dry_run=False):
    home = Path(codex_home).expanduser().resolve()
    runtime = home / 'tools/grill-me-for-codex'
    skill = home / 'skills/grill-me-for-codex'
    for path in (runtime, skill, home / 'backups'):
        if not path.resolve().is_relative_to(home):
            raise RuntimeError('Installation path escaped the selected Codex home.')
    if not Path(node).is_file():
        raise FileNotFoundError('Node.js executable was not found.')
    for name in FILES:
        if not (ROOT / 'dist' / name).is_file():
            raise FileNotFoundError('Build the project before installing: ' + name)
    config_path = home / 'config.toml'
    before = config_path.read_bytes() if config_path.exists() else b''
    parsed = tomllib.loads(before.decode('utf-8-sig')) if before else {}
    existing = parsed.get('mcp_servers', {}).get('grill_ui')
    expected = {'command': str(Path(node).resolve()), 'args': [str(runtime / 'server.mjs')]}
    if existing and any(existing.get(key) != value for key, value in expected.items()):
        raise RuntimeError('A conflicting grill_ui server already exists; no files or configuration were changed.')
    if skill.exists() and not (skill / 'SKILL.md').read_text(encoding='utf-8').startswith('---\nname: grill-me-for-codex\n'):
        raise RuntimeError('The target skill directory belongs to a different skill.')
    config_bytes = before
    if existing is None:
        section = '\n[mcp_servers.grill_ui]\ncommand = ' + json.dumps(expected['command']) + '\nargs = ' + json.dumps(expected['args']) + '\n'
        config_bytes += section.encode('utf-8')
    candidate = tomllib.loads(config_bytes.decode('utf-8-sig'))
    if candidate.get('mcp_servers', {}).get('grill_ui') != (existing or expected):
        raise RuntimeError('Unexpected server registration.')
    comparable = json.loads(json.dumps(candidate))
    comparable.get('mcp_servers', {}).pop('grill_ui', None)
    original = json.loads(json.dumps(parsed))
    original.get('mcp_servers', {}).pop('grill_ui', None)
    if not comparable.get('mcp_servers'):
        comparable.pop('mcp_servers', None)
    if not original.get('mcp_servers'):
        original.pop('mcp_servers', None)
    if comparable != original:
        raise RuntimeError('Unrelated configuration would change; installation aborted.')
    replacements = {runtime / name: (ROOT / 'dist' / name).read_bytes() for name in FILES}
    for path in (ROOT / 'skills/grill-me-for-codex').rglob('*'):
        if path.is_file():
            replacements[skill / path.relative_to(ROOT / 'skills/grill-me-for-codex')] = path.read_bytes()
    replacements[config_path] = config_bytes
    if dry_run:
        print(f'Dry run: would register grill_ui and install {len(replacements) - 1} files under the selected Codex home.')
        return
    backup = home / 'backups' / ('grill-me-for-codex-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    originals = {path: path.read_bytes() if path.exists() else None for path in replacements}
    for path, content in originals.items():
        if content is not None:
            target = backup / path.relative_to(home)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    try:
        for path, content in replacements.items():
            atomic_write(path, content)
        (runtime / 'state').mkdir(exist_ok=True)
    except Exception:
        for path, content in originals.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, content)
        raise
    print('Installed grill_ui and the standalone grill-me-for-codex skill. Unrelated configuration preserved.')
    print('Reload the MCP connection and reread the skill before using the new version.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--codex-home', default=os.environ.get('CODEX_HOME') or str(Path.home() / '.codex'))
    parser.add_argument('--node', default=shutil.which('node'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if not args.node:
        parser.error('Node.js was not found; install it or provide --node.')
    install(args.codex_home, args.node, args.dry_run)

if __name__ == '__main__':
    main()
