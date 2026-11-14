"""Check staged/tracked source without printing potentially sensitive values."""
from pathlib import Path, PurePosixPath
import argparse
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
RULES = {
    'GitHub credential': r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b',
    'API credential': r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b',
    'AWS access key': r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'Google API credential': r'\bAIza[A-Za-z0-9_-]{30,}\b',
    'Slack credential': r'\bxox[baprs]-[A-Za-z0-9-]{20,}\b',
    'private key': r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'personal filesystem path': r'(?:[A-Za-z]:[\\/]+Users[\\/]+|/(?:home|Users)/)[A-Za-z0-9_. -]+',
    'credential assignment': r'''(?i)(?:password|api_key|access_token|client_secret)\s*[:=]\s*["'][A-Za-z0-9_+/=-]{16,}["']''',
}
PATTERNS = {label: re.compile(pattern) for label, pattern in RULES.items()}
EMAIL = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b')
FORBIDDEN_PARTS = {'node_modules', 'dist', 'work', 'state', 'backups', '.codex', '__pycache__'}
FORBIDDEN_SUFFIXES = {'.pem', '.key', '.p12', '.pfx', '.log', '.tmp', '.png', '.jpg', '.jpeg', '.zip'}

def git(*arguments):
    return subprocess.check_output(['git', '-C', str(ROOT), *arguments], stderr=subprocess.PIPE)

def inspect(name, content, deny_literals=()):
    labels = []
    parts = PurePosixPath(name).parts
    if any(p in FORBIDDEN_PARTS for p in parts) or Path(name).suffix.lower() in FORBIDDEN_SUFFIXES or any(p.startswith('.env') for p in parts) or name.endswith(('.question.json', '.answer.json')):
        labels.append('excluded runtime/private file')
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        return labels + ['unexpected non-text content']
    for label, pattern in PATTERNS.items():
        if pattern.search(text):
            labels.append(label)
    if any(not match.group(0).lower().endswith('@users.noreply.github.com') for match in EMAIL.finditer(text)):
        labels.append('personal email address')
    if any(literal.lower() in text.lower() for literal in deny_literals):
        labels.append('local identity/session literal')
    return labels

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deny-literal', action='append', default=[], help='Additional local identifiers to exclude; values are never printed.')
    args = parser.parse_args()
    names = [name.decode('utf-8') for name in git('ls-files', '--cached', '-z').split(b'\0') if name]
    if not names:
        print('No tracked files to inspect.', file=sys.stderr)
        return 1
    problems = []
    for name in names:
        labels = inspect(name, git('show', ':' + name), args.deny_literal)
        if labels:
            problems.append((name, labels))
    for name, labels in problems:
        print(name + ': ' + ', '.join(labels), file=sys.stderr)
    if problems:
        print(f'Privacy check failed in {len(problems)} files; matched values were withheld.', file=sys.stderr)
        return 1
    print(f'Privacy check passed for {len(names)} staged/tracked text files.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
