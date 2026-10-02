"""Fixed disk scope and unprivileged process launch, including symlink attacks."""
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch
import entrypoint


class CommandTests(unittest.TestCase):
    def test_port_cannot_inject_a_shell_command(self):
        for bad in ('0', '65536', '-1', '8080;cat /etc/secrets/key', '$(id)', ''):
            with self.subTest(value=bad), self.assertRaises(RuntimeError):
                entrypoint.server_command(bad)
        command = entrypoint.server_command('8080')
        self.assertEqual(command[:3], ['gunicorn', '--bind', ':8080'])
        self.assertNotIn('sh', command)

    def test_drop_groups_uid_and_gid_before_exec(self):
        user = types.SimpleNamespace(pw_uid=1001, pw_gid=1001)
        fake_pwd = types.SimpleNamespace(getpwnam=lambda name: user)
        events = []
        with patch.dict('sys.modules', {'pwd': fake_pwd}), \
             patch.dict(os.environ, {'SQLITE_PATH': '/var/data/kotoba/receipts.sqlite3', 'PORT': '8080'}), \
             patch('entrypoint.os.geteuid', side_effect=[0, 1001], create=True), \
             patch('entrypoint.os.getegid', return_value=1001, create=True), \
             patch('entrypoint.os.getgroups', return_value=[], create=True), \
             patch('entrypoint.os.umask'), \
             patch('entrypoint.initialize_storage', side_effect=lambda u,g: events.append('storage')), \
             patch('entrypoint.os.setgroups', side_effect=lambda x: events.append(('groups', x)), create=True), \
             patch('entrypoint.os.setgid', side_effect=lambda x: events.append(('gid', x)), create=True), \
             patch('entrypoint.os.setuid', side_effect=lambda x: events.append(('uid', x)), create=True), \
             patch('entrypoint.os.execvp', side_effect=lambda *args: events.append('exec')):
            entrypoint.main()
        self.assertEqual(events, ['storage', ('groups', []), ('gid', 1001), ('uid', 1001), 'exec'])

    def test_database_path_outside_the_fixed_scope_is_rejected_before_chown(self):
        with patch.dict('sys.modules', {'pwd': types.SimpleNamespace()}), \
             patch.dict(os.environ, {'SQLITE_PATH': '/etc/secrets/key'}), \
             patch('entrypoint.os.geteuid', return_value=0, create=True), \
             patch('entrypoint.initialize_storage') as initialize, patch('entrypoint.os.execvp') as execute:
            with self.assertRaises(RuntimeError):
                entrypoint.main()
            initialize.assert_not_called()
            execute.assert_not_called()


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'O_NOFOLLOW'), 'Linux filesystem checks run in CI/container')
class DiskScopeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.addCleanup(patch.stopall)
        patch('entrypoint.DATA_ROOT', str(self.root)).start()

    def initialize(self):
        entrypoint.initialize_storage(os.getuid(), os.getgid())

    def test_only_fixed_directory_and_sqlite_files_change_and_existing_bytes_survive(self):
        directory = self.root / 'kotoba'
        directory.mkdir(mode=0o755)
        other = self.root / 'other'
        other.mkdir(mode=0o755)
        untouched = directory / 'do-not-touch.txt'
        untouched.write_text('untouched')
        os.chmod(untouched, 0o644)
        for name in entrypoint.DATABASE_FILES:
            (directory / name).write_bytes(b'existing database bytes')
            os.chmod(directory / name, 0o644)
        self.initialize()
        self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(other.stat().st_mode), 0o755)
        self.assertEqual(stat.S_IMODE(untouched.stat().st_mode), 0o644)
        for name in entrypoint.DATABASE_FILES:
            self.assertEqual((directory/name).read_bytes(), b'existing database bytes')
            self.assertEqual(stat.S_IMODE((directory/name).stat().st_mode), 0o600)

    def test_symlink_directory_and_database_do_not_touch_external_file(self):
        outside = self.root / 'outside'
        outside.mkdir(mode=0o755)
        target = outside / 'secret'
        target.write_text('secret')
        os.chmod(target, 0o644)
        (self.root / 'kotoba').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.initialize()
        (self.root / 'kotoba').unlink()
        (self.root / 'kotoba').mkdir()
        (self.root / 'kotoba' / 'receipts.sqlite3').symlink_to(target)
        with self.assertRaises(OSError):
            self.initialize()
        self.assertEqual(target.read_text(), 'secret')
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o644)

    def test_hardlink_database_is_rejected(self):
        target = self.root / 'external-file'
        target.write_text('external')
        os.chmod(target, 0o644)
        (self.root/'kotoba').mkdir()
        os.link(target, self.root/'kotoba'/'receipts.sqlite3')
        with self.assertRaises(RuntimeError):
            self.initialize()
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o644)


if __name__ == '__main__':
    unittest.main()
