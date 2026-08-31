#!/usr/bin/env python3
"""Supervises one delegated agent on a real PTY.

Why this exists: an orchestrating agent must be able to *talk to* the agent it
delegated to, not merely watch it. A plain pipe removes the TTY (interactive
agents render nothing) and `script` gives a TTY but no way in — its master fd is
private, and writing to the slave pts only echoes on screen. Injecting into a
foreign tty would need TIOCSTI, which modern kernels disable for good reason.

So the supervisor owns the PTY master itself and multiplexes three inputs into
it: the human's keyboard, a control FIFO the orchestrator writes to, and nothing
else. Everything the child prints goes to the window and to output.log at once.

Stdlib only, so it works on a bare Linux box.
"""

import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios
import tty

CHUNK = 65536


def read_argv(run_dir):
    with open(os.path.join(run_dir, "command.argv"), "rb") as handle:
        raw = handle.read()
    argv = [part.decode("utf-8", "surrogateescape") for part in raw.split(b"\0") if part]
    if not argv:
        raise SystemExit("lnx-pty: empty command.argv")
    return argv


def write_atomic(path, value):
    temporary = path + ".tmp"
    with open(temporary, "w") as handle:
        handle.write(str(value) + "\n")
    os.replace(temporary, path)


def terminal_size(fd):
    try:
        packed = fcntl.ioctl(fd, termios.TIOCGWINSZ, b"\0" * 8)
        rows, cols, _, _ = struct.unpack("hhhh", packed)
        if rows and cols:
            return rows, cols
    except OSError:
        pass
    return 24, 80


def apply_size(master_fd, rows, cols):
    try:
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("hhhh", rows, cols, 0, 0))
    except OSError:
        pass


def open_control_fifo(path):
    """Opened read-write on purpose: the supervisor then never sees EOF when a
    sender closes, and a sender never blocks waiting for a reader."""
    if not os.path.exists(path):
        os.mkfifo(path, 0o600)
    fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
    return fd


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: lnx-pty.py RUN_DIR")
    run_dir = os.path.abspath(sys.argv[1])
    argv = read_argv(run_dir)

    log_path = os.path.join(run_dir, "output.log")
    control_path = os.path.join(run_dir, "control.in")
    control_fd = open_control_fifo(control_path)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    stdin_is_tty = os.isatty(stdin_fd)

    pid, master_fd = pty.fork()
    if pid == 0:
        try:
            os.execvp(argv[0], argv)
        except OSError as error:
            sys.stderr.write("lnx-pty: cannot execute %s: %s\n" % (argv[0], error))
            os._exit(127)

    apply_size(master_fd, *terminal_size(stdout_fd))

    def on_resize(_signum, _frame):
        apply_size(master_fd, *terminal_size(stdout_fd))

    try:
        signal.signal(signal.SIGWINCH, on_resize)
    except ValueError:
        pass

    def on_hangup(signum, _frame):
        # Closing the window hangs up the terminal. Take the child down with us
        # instead of leaving an agent running with nothing attached to it, and
        # let the normal exit path record the verdict.
        try:
            os.kill(pid, signal.SIGHUP)
        except OSError:
            pass
        raise SystemExit(128 + signum)

    for received in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(received, on_hangup)
        except (ValueError, OSError):
            pass

    saved = None
    if stdin_is_tty:
        try:
            saved = termios.tcgetattr(stdin_fd)
            tty.setraw(stdin_fd)
        except termios.error:
            saved = None

    log = open(log_path, "ab", buffering=0)
    write_atomic(os.path.join(run_dir, "status"), "running")

    sources = [master_fd, control_fd]
    if stdin_is_tty:
        sources.append(stdin_fd)

    try:
        while True:
            try:
                readable, _, _ = select.select(sources, [], [])
            except InterruptedError:
                continue
            except OSError as error:
                if error.errno == errno.EINTR:
                    continue
                raise

            if master_fd in readable:
                try:
                    data = os.read(master_fd, CHUNK)
                except OSError:
                    data = b""
                if not data:
                    break
                os.write(stdout_fd, data)
                log.write(data)

            for source in (stdin_fd, control_fd):
                if source not in readable:
                    continue
                try:
                    data = os.read(source, CHUNK)
                except OSError:
                    continue
                if not data:
                    if source == stdin_fd:
                        sources.remove(stdin_fd)
                    continue
                os.write(master_fd, data)
    finally:
        if saved is not None:
            try:
                termios.tcsetattr(stdin_fd, termios.TCSADRAIN, saved)
            except termios.error:
                pass
        log.close()
        os.close(control_fd)
        try:
            os.close(master_fd)
        except OSError:
            pass

    try:
        _, wait_status = os.waitpid(pid, 0)
    except OSError:
        wait_status = 0
    if os.WIFEXITED(wait_status):
        exit_code = os.WEXITSTATUS(wait_status)
    elif os.WIFSIGNALED(wait_status):
        exit_code = 128 + os.WTERMSIG(wait_status)
    else:
        exit_code = 1

    try:
        os.unlink(control_path)
    except OSError:
        pass
    write_atomic(os.path.join(run_dir, "exit-code"), exit_code)
    write_atomic(os.path.join(run_dir, "status"), "done" if exit_code == 0 else "failed")
    return exit_code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException:
        # Any unexpected failure still has to leave an honest result behind.
        run = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None
        if run and os.path.isdir(run):
            write_atomic(os.path.join(run, "exit-code"), 1)
            write_atomic(os.path.join(run, "status"), "failed")
        raise
