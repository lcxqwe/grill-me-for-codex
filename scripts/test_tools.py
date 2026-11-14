from pathlib import Path
import tempfile
import tomllib
import unittest

from check_privacy import ROOT, inspect
from install import install

class InstallerTests(unittest.TestCase):
    def setUp(self):
        (ROOT / 'work').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='installer-', dir=ROOT / 'work')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name) / 'codex-home'
        self.home.mkdir()
        import shutil
        self.node = shutil.which('node')
        self.assertIsNotNone(self.node)

    def test_install_preserves_config_and_reinstall_preserves_state(self):
        config = self.home / 'config.toml'
        config.write_text('model = "test-model"\n[features]\nexample = true\n', encoding='utf-8')
        install(self.home, self.node)
        data = tomllib.loads(config.read_text(encoding='utf-8'))
        self.assertEqual(data['model'], 'test-model')
        self.assertTrue(data['features']['example'])
        self.assertEqual(data['mcp_servers']['grill_ui']['args'], [str(self.home / 'tools/grill-me-for-codex/server.mjs')])
        state = self.home / 'tools/grill-me-for-codex/state'
        record = state / 'retained.json'
        record.write_text('preserve this runtime record', encoding='utf-8')
        before = config.read_bytes()
        install(self.home, self.node)
        self.assertEqual(config.read_bytes(), before)
        self.assertEqual(record.read_text(), 'preserve this runtime record')
        self.assertTrue((self.home / 'skills/grill-me-for-codex/SKILL.md').is_file())

    def test_conflicting_server_is_rejected_without_changes(self):
        config = self.home / 'config.toml'
        original = '[mcp_servers.grill_ui]\ncommand = "different-node"\nargs = ["other-server"]\n'
        config.write_text(original, encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'conflicting'):
            install(self.home, self.node)
        self.assertEqual(config.read_text(encoding='utf-8'), original)
        self.assertFalse((self.home / 'tools').exists())

    def test_dry_run_has_no_file_side_effects(self):
        install(self.home, self.node, dry_run=True)
        self.assertEqual(list(self.home.iterdir()), [])

class PrivacyTests(unittest.TestCase):
    def test_credentials_and_paths_are_detected_without_echoing_values(self):
        secret = 'ghp_' + 'A' * 36
        path = 'C:' + '/Users/' + 'example'
        labels = inspect('source.js', (secret + '\n' + path).encode())
        self.assertIn('GitHub credential', labels)
        self.assertIn('personal filesystem path', labels)
        self.assertNotIn(secret, str(labels))

    def test_runtime_records_are_rejected(self):
        self.assertIn('excluded runtime/private file', inspect('state/example.answer.json', b'{}'))
        self.assertIn('excluded runtime/private file', inspect('.env.local', b'example'))

    def test_generic_source_and_noreply_email_are_allowed(self):
        text = b'const port = 43127;\n' + b'noreply' + b'@users.noreply.github.com'
        self.assertEqual(inspect('source.js', text), [])

if __name__ == '__main__':
    unittest.main()
