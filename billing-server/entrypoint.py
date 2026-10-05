"""Fixed-path disk preflight, then exec Gunicorn as the unprivileged app user."""
import os
import re
import stat
import sys

DATA_ROOT = '/var/data'
PRIVATE_DIRECTORY = 'kotoba'
DATABASE_FILES = ('receipts.sqlite3', 'receipts.sqlite3-wal', 'receipts.sqlite3-shm')


def initialize_storage(uid, gid):
    # Do not follow a mount/path symlink, recurse, or touch any secret file.
    if os.path.realpath(DATA_ROOT) != DATA_ROOT:
        raise RuntimeError('unsafe_storage_mount')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    root_fd = os.open(DATA_ROOT, flags)
    try:
        try:
            os.mkdir(PRIVATE_DIRECTORY, mode=0o700, dir_fd=root_fd)
        except FileExistsError:
            pass
        private_fd = os.open(PRIVATE_DIRECTORY, flags, dir_fd=root_fd)
        try:
            os.fchown(private_fd, uid, gid)
            os.fchmod(private_fd, 0o700)
            # An existing database must survive deployments. Never recursively
            # chown the mount; reject symlinks and hard links to outside files.
            for filename in DATABASE_FILES:
                try:
                    file_fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=private_fd)
                except FileNotFoundError:
                    continue
                try:
                    info = os.fstat(file_fd)
                    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                        raise RuntimeError('unsafe_database_file')
                    os.fchown(file_fd, uid, gid)
                    os.fchmod(file_fd, 0o600)
                finally:
                    os.close(file_fd)
        finally:
            os.close(private_fd)
    finally:
        os.close(root_fd)


def server_command(port):
    if not isinstance(port, str) or not re.fullmatch(r'[0-9]{1,5}', port) or not 1 <= int(port) <= 65535:
        raise RuntimeError('invalid_port')
    # An argument vector avoids interpolation through a root shell.
    return ['gunicorn', '--bind', ':' + port, '--workers', '2', '--threads', '4',
            '--timeout', '90', '--access-logfile', '/dev/null', 'app:app']


def main():
    import pwd  # Linux container only; pure helpers remain importable for tests.
    command = server_command(os.environ.get('PORT', '8080'))
    if os.geteuid() != 0:
        raise RuntimeError('privileged_storage_preflight_required')
    configured_path = os.environ.get('SQLITE_PATH', '')
    expected = DATA_ROOT + '/' + PRIVATE_DIRECTORY + '/' + DATABASE_FILES[0]
    if configured_path != expected:
        raise RuntimeError('fixed_persistent_database_path_required')
    user = pwd.getpwnam('app')
    os.umask(0o077)
    initialize_storage(user.pw_uid, user.pw_gid)
    os.setgroups([])
    os.setgid(user.pw_gid)
    os.setuid(user.pw_uid)
    if os.geteuid() != user.pw_uid or os.getegid() != user.pw_gid or os.getgroups():
        raise RuntimeError('privilege_drop_failed')
    os.execvp(command[0], command)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Permission failures must not leak secret paths, values or exception text.
        print('billing startup preflight failed', file=sys.stderr)
        sys.exit(1)
