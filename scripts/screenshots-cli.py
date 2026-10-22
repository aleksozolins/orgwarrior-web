"""The command line's screenshots, captured for scripts/screenshots: each
command run in a pseudo-terminal of a fixed size, so it draws as it would
in one (columns, color), its output saved as DIR/NAME.ansi.  The daemon and
config are scripts/screenshots' (ORGWARRIOR_SOCKET, ORGWARRIOR_CONFIG)."""

import fcntl
import os
import pty
import struct
import subprocess
import sys
import termios

from orgwarrior.api import Orgwarrior

out = sys.argv[1]
ow = Orgwarrior()
report = next(line["id"] for line in ow.view("all") if "quarterly report" in line["text"])
ow.clock_in(report, "-25m")

SHOTS = {  # name: (columns, rows, command)
    "today": (96, 26, ["orgwarrior"]),
    "show": (96, 28, ["orgwarrior", report]),
    "clocked": (96, 18, ["orgwarrior", "clocked", "week"]),
    "help": (80, 44, ["orgwarrior", "help"]),
}


def capture(cols, rows, argv):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    proc = subprocess.Popen(argv, stdin=slave, stdout=slave, stderr=slave, close_fds=True,
                            env={**os.environ, "COLUMNS": str(cols), "LINES": str(rows), "PAGER": "cat"})
    os.close(slave)
    chunks = []
    while True:
        try:
            data = os.read(master, 65536)
        except OSError:  # the other end closed
            break
        if not data:
            break
        chunks.append(data)
    proc.wait()
    os.close(master)
    return b"".join(chunks).decode().replace("\r\n", "\n")


for name, (cols, rows, argv) in SHOTS.items():
    with open(os.path.join(out, f"{name}.ansi"), "w") as f:
        f.write(f"{cols}\n$ {' '.join(argv)}\n" + capture(cols, rows, argv))
